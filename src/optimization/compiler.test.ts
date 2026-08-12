import { describe, expect, it } from "vitest";
import type { ValidatedBaseVariable } from "../domain/stage1";
import { createStage2Row, validateStage2Rows } from "../domain/stage2";
import { createStage3Row, validateStage3Rows } from "../domain/stage3";
import {
  compileOptimizationProblem,
  defaultOptimizationSafeguards,
  hydrateOptimizationProblem,
  OptimizationEvaluationError,
} from "./compiler";
import type { OptimizationProblemDescription } from "./contracts";
import { MockOptimizationEngine } from "./mock";
import {
  createOptimizationResultSnapshot,
  serializeOptimizationResultSnapshot,
} from "../domain/snapshot";

function baseVariable(
  id: string,
  name: string,
  nominal: number,
  tolerance: number,
  unit: string,
): ValidatedBaseVariable {
  return {
    id,
    name,
    unit,
    nominalTolerance: { nominal, tolerance },
    threePoint: {
      minimum: nominal - tolerance,
      nominal,
      maximum: nominal + tolerance,
    },
  };
}

function fixture() {
  const baseVariables = [
    baseVariable("a-id", "a", 10, 1, "mm"),
    baseVariable("b-id", "b", 1, 0.2, "cm"),
    baseVariable("fixed-id", "fixed", 2, 0, "mm"),
  ];
  const derivedRows = [
    {
      ...createStage2Row("sum-id"),
      name: "sum",
      expression: "a + b",
    },
  ];
  const stage2 = validateStage2Rows(derivedRows, baseVariables);
  expect(stage2.isValid).toBe(true);
  const constraintRows = [
    {
      ...createStage3Row("limit-id"),
      expression: "sum <= 24 mm",
    },
  ];
  const stage3 = validateStage3Rows(constraintRows, stage2.scope);
  expect(stage3.isValid).toBe(true);
  return { baseVariables, stage2, stage3 };
}

describe("solver-neutral problem compiler", () => {
  it("normalizes mixed units and emits the auxiliary max-min formulation", () => {
    const { baseVariables, stage2, stage3 } = fixture();
    const problem = compileOptimizationProblem({
      baseVariables,
      derivedVariables: stage2.variables,
      constraints: stage3.constraints,
      selectedBaseVariableIds: ["a-id", "b-id"],
    });

    expect(problem.description.initialDecisionVector).toEqual([
      0.01, 0.001, 0.01, 0.002, 0.001,
    ]);
    expect(problem.description.decisionVariables).toHaveLength(5);
    expect(problem.description.decisionVariables[1]).toMatchObject({
      component: "tolerance",
      lowerBound: 0,
      normalizedUnit: "m",
    });
    expect(problem.description.constraints).toHaveLength(11);
    expect(problem.description.constraints.slice(0, 2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "aux:a-id", kind: "inequality" }),
        expect.objectContaining({ id: "aux:b-id", kind: "inequality" }),
      ]),
    );
    expect(
      problem.evaluate(problem.description.initialDecisionVector),
    ).toMatchObject({
      feasible: true,
      objectiveValue: 0.001,
      maximumViolation: 0,
    });
  });

  it("round-trips its description through JSON and drives the mock solver", async () => {
    const { baseVariables, stage2, stage3 } = fixture();
    const compiled = compileOptimizationProblem({
      baseVariables,
      derivedVariables: stage2.variables,
      constraints: stage3.constraints,
      selectedBaseVariableIds: ["a-id", "b-id"],
    });
    const serialized = JSON.stringify(compiled.description);
    const hydrated = hydrateOptimizationProblem(
      JSON.parse(serialized) as OptimizationProblemDescription,
    );
    const engine = new MockOptimizationEngine();
    const result = await engine.solve(hydrated);

    expect(result).toMatchObject({
      outcome: "succeeded",
      solverId: "deterministic-mock",
      objectiveValue: 0.001,
      evaluations: 1,
    });
  });

  it("converts a candidate back to original units and creates a complete snapshot", async () => {
    const { baseVariables, stage2, stage3 } = fixture();
    const problem = compileOptimizationProblem({
      baseVariables,
      derivedVariables: stage2.variables,
      constraints: stage3.constraints,
      selectedBaseVariableIds: ["a-id", "b-id"],
    });
    const candidate = [0.01, 0.0015, 0.01, 0.0015, 0.0015];
    const engine = new MockOptimizationEngine(() => candidate);
    const result = await engine.solve(problem);
    const snapshot = createOptimizationResultSnapshot(
      problem,
      result,
      "2026-08-11T12:00:00.000Z",
    );

    expect(snapshot.variables).toEqual([
      expect.objectContaining({ name: "a", tolerance: 1.5, optimized: true }),
      expect.objectContaining({ name: "b", tolerance: 0.15, optimized: true }),
      expect.objectContaining({
        name: "fixed",
        tolerance: 0,
        optimized: false,
      }),
    ]);
    expect(snapshot.expressions).toEqual([
      expect.objectContaining({
        name: "sum",
        unit: "m",
        minimum: 0.017,
        nominal: 0.02,
        maximum: 0.023,
      }),
    ]);
    expect(snapshot.constraints).toEqual([
      expect.objectContaining({ status: "green", allSatisfied: true }),
    ]);
    expect(snapshot.optimization).toMatchObject({
      objectiveValue: 0.0015,
      objectiveUnit: "m",
      selectedVariables: [
        { id: "a-id", name: "a" },
        { id: "b-id", name: "b" },
      ],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(JSON.parse(serializeOptimizationResultSnapshot(snapshot))).toEqual(
      snapshot,
    );
  });

  it("rejects incompatible objective dimensions", () => {
    expect(() =>
      compileOptimizationProblem({
        baseVariables: [
          baseVariable("length", "length", 1, 0.1, "m"),
          baseVariable("angle", "angle", 1, 0.1, "rad"),
        ],
        derivedVariables: [],
        constraints: [],
        selectedBaseVariableIds: ["length", "angle"],
      }),
    ).toThrow(/compatible dimensions/i);
  });

  it("enforces candidate, divergence, and evaluation-count safeguards", () => {
    const { baseVariables, stage2, stage3 } = fixture();
    const problem = compileOptimizationProblem({
      baseVariables,
      derivedVariables: stage2.variables,
      constraints: stage3.constraints,
      selectedBaseVariableIds: ["a-id"],
    });
    const initial = problem.description.initialDecisionVector;
    expect(() => problem.evaluate([initial[0]!, -1, initial[2]!])).toThrow(
      /lower bound/i,
    );
    expect(() => problem.evaluate([Number.POSITIVE_INFINITY, 0, 0])).toThrow(
      /not finite/i,
    );
    const session = problem.createEvaluationSession({ evaluationLimit: 1 });
    session.evaluate(initial);
    expect(() => session.evaluate(initial)).toThrowError(
      expect.objectContaining<Partial<OptimizationEvaluationError>>({
        code: "evaluation_limit",
      }),
    );
    expect(() =>
      problem.createEvaluationSession({
        ...defaultOptimizationSafeguards,
        divergenceFactor: 0,
      }),
    ).toThrow(/positive finite/i);
  });

  it("independently rejects infeasible mock results for snapshots", async () => {
    const { baseVariables, stage2, stage3 } = fixture();
    const problem = compileOptimizationProblem({
      baseVariables,
      derivedVariables: stage2.variables,
      constraints: stage3.constraints,
      selectedBaseVariableIds: ["a-id", "b-id"],
    });
    const engine = new MockOptimizationEngine(() => [
      0.01, 0.003, 0.01, 0.003, 0.003,
    ]);
    const result = await engine.solve(problem);

    expect(result.outcome).toBe("infeasible");
    expect(() => createOptimizationResultSnapshot(problem, result)).toThrow(
      /successful optimization/i,
    );
  });
});

import type { ValidatedBaseVariable } from "../domain/stage1";
import { createStage2Row, validateStage2Rows } from "../domain/stage2";
import { createStage3Row, validateStage3Rows } from "../domain/stage3";
import {
  compileOptimizationProblem,
  hydrateOptimizationProblem,
} from "./compiler";
import type {
  CompiledOptimizationProblem,
  OptimizationOutcome,
  OptimizationResult,
  OptimizationSafeguards,
} from "./contracts";

export type SolverFixtureId =
  | "finite-one-variable"
  | "max-min-tradeoff"
  | "mixed-units"
  | "nonlinear-inequality"
  | "equality-tolerance"
  | "broadcast-constraint"
  | "zero-tolerance-bound"
  | "infeasible"
  | "unbounded"
  | "domain-error"
  | "poorly-scaled"
  | "local-optimum-sensitivity";

interface BaseDefinition {
  readonly name: string;
  readonly nominal: number;
  readonly tolerance: number;
  readonly unit: string;
}

interface FixtureDefinition {
  readonly id: SolverFixtureId;
  readonly label: string;
  readonly base: readonly BaseDefinition[];
  readonly derived?: readonly {
    readonly name: string;
    readonly expression: string;
  }[];
  readonly constraints: readonly string[];
  readonly selected?: readonly string[];
  readonly equalityTolerance?: {
    readonly absolute: number;
    readonly relative: number;
  };
  readonly safeguards?: Partial<OptimizationSafeguards>;
  readonly initialDecisionVector?: readonly number[];
  readonly oracle: SolverFixtureOracle;
}

export interface NumericOracle {
  readonly value: number;
  readonly absoluteTolerance: number;
  readonly relativeTolerance: number;
}

export interface DecisionOracle extends NumericOracle {
  readonly name: string;
  readonly component: "nominal" | "tolerance";
}

export interface SolverFixtureOracle {
  readonly outcome: OptimizationOutcome;
  readonly diagnosticCode?: string;
  readonly objective?: NumericOracle;
  readonly decisions?: readonly DecisionOracle[];
  readonly scalarConstraintCount?: number;
  readonly requireGreen?: boolean;
}

const near = (
  value: number,
  absoluteTolerance: number,
  relativeTolerance = 1e-6,
): NumericOracle => ({
  value,
  absoluteTolerance,
  relativeTolerance,
});

const decision = (
  name: string,
  component: "nominal" | "tolerance",
  value: number,
  absoluteTolerance: number,
  relativeTolerance = 1e-6,
): DecisionOracle => ({
  name,
  component,
  value,
  absoluteTolerance,
  relativeTolerance,
});

const definitions: readonly FixtureDefinition[] = [
  {
    id: "finite-one-variable",
    label: "Finite one-variable optimum",
    base: [{ name: "x", nominal: 5, tolerance: 1, unit: "m" }],
    constraints: ["x >= 0 m", "x <= 10 m"],
    oracle: {
      outcome: "succeeded",
      objective: near(5, 1e-5),
      decisions: [
        decision("x nominal", "nominal", 5, 1e-5),
        decision("x tolerance", "tolerance", 5, 1e-5),
      ],
      requireGreen: true,
    },
  },
  {
    id: "max-min-tradeoff",
    label: "Two-variable max-min tradeoff",
    base: [
      { name: "a", nominal: 2, tolerance: 0.2, unit: "m" },
      { name: "b", nominal: 2, tolerance: 0.2, unit: "m" },
    ],
    constraints: ["a >= 0 m", "b >= 0 m", "a + b <= 10 m"],
    oracle: {
      outcome: "succeeded",
      objective: near(2.5, 1e-4),
      decisions: [
        decision("a nominal", "nominal", 2.5, 1e-4),
        decision("a tolerance", "tolerance", 2.5, 1e-4),
        decision("b nominal", "nominal", 2.5, 1e-4),
        decision("b tolerance", "tolerance", 2.5, 1e-4),
      ],
      requireGreen: true,
    },
  },
  {
    id: "mixed-units",
    label: "Compatible mixed units",
    base: [
      { name: "a", nominal: 50, tolerance: 5, unit: "mm" },
      { name: "b", nominal: 5, tolerance: 0.5, unit: "cm" },
    ],
    constraints: ["a >= 0 mm", "a <= 100 mm", "b >= 0 cm", "b <= 10 cm"],
    oracle: {
      outcome: "succeeded",
      objective: near(0.05, 1e-6),
      requireGreen: true,
    },
  },
  {
    id: "nonlinear-inequality",
    label: "Nonlinear inequality",
    base: [{ name: "r", nominal: 2, tolerance: 0.2, unit: "m" }],
    constraints: ["r >= 0 m", "r^2 <= 25 m^2"],
    oracle: {
      outcome: "succeeded",
      objective: near(2.5, 1e-4),
      decisions: [
        decision("r nominal", "nominal", 2.5, 1e-4),
        decision("r tolerance", "tolerance", 2.5, 1e-4),
      ],
      requireGreen: true,
    },
  },
  {
    id: "equality-tolerance",
    label: "Equality tolerance",
    base: [{ name: "x", nominal: 5, tolerance: 0, unit: "m" }],
    constraints: ["x == 5 m"],
    equalityTolerance: { absolute: 0.01, relative: 0 },
    oracle: {
      outcome: "succeeded",
      objective: near(0.01, 1e-5),
      decisions: [
        decision("x nominal", "nominal", 5, 1e-5),
        decision("x tolerance", "tolerance", 0.01, 1e-5),
      ],
      requireGreen: true,
    },
  },
  {
    id: "broadcast-constraint",
    label: "Broadcast scalar expansion",
    base: [
      { name: "a", nominal: 2, tolerance: 0.2, unit: "m" },
      { name: "b", nominal: 2, tolerance: 0.2, unit: "m" },
    ],
    constraints: ["a >= 0 m", "b >= 0 m", "a + b <= 10 m"],
    oracle: {
      outcome: "succeeded",
      objective: near(2.5, 1e-4),
      scalarConstraintCount: 15,
      requireGreen: true,
    },
  },
  {
    id: "zero-tolerance-bound",
    label: "Tolerance lower bound",
    base: [{ name: "x", nominal: 1, tolerance: 0, unit: "m" }],
    constraints: ["x >= 1 m", "x <= 1 m"],
    oracle: {
      outcome: "succeeded",
      objective: near(0, 1e-7, 0),
      decisions: [
        decision("x nominal", "nominal", 1, 1e-7),
        decision("x tolerance", "tolerance", 0, 1e-7, 0),
      ],
      requireGreen: true,
    },
  },
  {
    id: "infeasible",
    label: "Infeasible constraints",
    base: [{ name: "x", nominal: 0.5, tolerance: 0, unit: "m" }],
    constraints: ["x >= 1 m", "x <= 0 m"],
    oracle: { outcome: "infeasible" },
  },
  {
    id: "unbounded",
    label: "Unconstrained runaway",
    base: [{ name: "x", nominal: 1, tolerance: 0.1, unit: "m" }],
    constraints: [],
    safeguards: { maximumAbsoluteValue: 10, divergenceFactor: 10 },
    oracle: { outcome: "diverged", diagnosticCode: "diverged" },
  },
  {
    id: "domain-error",
    label: "Domain error during search",
    base: [{ name: "x", nominal: 1, tolerance: 0.1, unit: "m" }],
    derived: [{ name: "root", expression: "sqrt(x / 1 m)" }],
    constraints: ["root <= 2"],
    initialDecisionVector: [-1, 0.1, 0.1],
    oracle: { outcome: "failed", diagnosticCode: "numeric_domain" },
  },
  {
    id: "poorly-scaled",
    label: "Poorly scaled SI values",
    base: [{ name: "x", nominal: 1, tolerance: 0.1, unit: "um" }],
    constraints: ["x >= 0 um", "x <= 2 um"],
    oracle: {
      outcome: "succeeded",
      objective: near(1e-6, 1e-10),
      requireGreen: true,
    },
  },
  {
    id: "local-optimum-sensitivity",
    label: "Local optimum sensitivity",
    base: [{ name: "x", nominal: 1, tolerance: 0.05, unit: "m" }],
    derived: [{ name: "landscape", expression: "(x^2 - 1 m^2)^2" }],
    constraints: ["landscape <= 0.1 m^4"],
    oracle: { outcome: "succeeded", requireGreen: true },
  },
] as const;

export interface SolverFixture {
  readonly id: SolverFixtureId;
  readonly label: string;
  readonly oracle: SolverFixtureOracle;
  readonly problem: CompiledOptimizationProblem;
}

function baseVariable(
  definition: BaseDefinition,
  index: number,
): ValidatedBaseVariable {
  return {
    id: `fixture-base-${index}`,
    name: definition.name,
    unit: definition.unit,
    nominalTolerance: {
      nominal: definition.nominal,
      tolerance: definition.tolerance,
    },
    threePoint: {
      minimum: definition.nominal - definition.tolerance,
      nominal: definition.nominal,
      maximum: definition.nominal + definition.tolerance,
    },
  };
}

export function createSolverFixture(id: SolverFixtureId): SolverFixture {
  const definition = definitions.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown solver fixture: ${id}.`);
  const baseVariables = definition.base.map(baseVariable);
  const stage2 = validateStage2Rows(
    (definition.derived ?? []).map((derived, index) => ({
      ...createStage2Row(`fixture-derived-${index}`),
      ...derived,
    })),
    baseVariables,
  );
  if (!stage2.isValid) throw new Error(`Invalid Stage 2 fixture: ${id}.`);
  const stage3 = validateStage3Rows(
    definition.constraints.map((expression, index) => ({
      ...createStage3Row(`fixture-constraint-${index}`),
      expression,
    })),
    stage2.scope,
  );
  if (!stage3.isValid) throw new Error(`Invalid Stage 3 fixture: ${id}.`);
  const selectedNames = new Set(
    definition.selected ?? definition.base.map((variable) => variable.name),
  );
  const compiled = compileOptimizationProblem({
    baseVariables,
    derivedVariables: stage2.variables,
    constraints: stage3.constraints,
    selectedBaseVariableIds: baseVariables
      .filter((variable) => selectedNames.has(variable.name))
      .map((variable) => variable.id),
    ...(definition.equalityTolerance
      ? { equalityTolerance: definition.equalityTolerance }
      : {}),
    ...(definition.safeguards ? { safeguards: definition.safeguards } : {}),
  });
  const problem = definition.initialDecisionVector
    ? hydrateOptimizationProblem({
        ...compiled.description,
        initialDecisionVector: definition.initialDecisionVector,
      })
    : compiled;
  return {
    id,
    label: definition.label,
    oracle: definition.oracle,
    problem,
  };
}

export const solverFixtureIds = definitions.map((fixture) => fixture.id);

function within(actual: number, expected: NumericOracle): boolean {
  return (
    Math.abs(actual - expected.value) <=
    Math.max(
      expected.absoluteTolerance,
      expected.relativeTolerance * Math.abs(expected.value),
    )
  );
}

export function verifySolverFixtureResult(
  fixture: SolverFixture,
  result: OptimizationResult,
): readonly string[] {
  const failures: string[] = [];
  const oracle = fixture.oracle;
  if (result.outcome !== oracle.outcome)
    failures.push(
      `Expected outcome ${oracle.outcome}, received ${result.outcome}.`,
    );
  if (
    oracle.diagnosticCode &&
    result.terminationCode !== oracle.diagnosticCode &&
    !result.diagnostics.some((item) => item.code === oracle.diagnosticCode)
  ) {
    failures.push(`Expected diagnostic ${oracle.diagnosticCode}.`);
  }
  if (
    oracle.scalarConstraintCount !== undefined &&
    fixture.problem.description.constraints.length !==
      oracle.scalarConstraintCount
  ) {
    const sourceConstraintCount =
      fixture.problem.description.constraints.filter(
        (item) => item.sourceConstraintId !== null,
      ).length;
    if (sourceConstraintCount !== oracle.scalarConstraintCount)
      failures.push(
        `Expected ${oracle.scalarConstraintCount} Stage 3 scalar constraints, compiled ${sourceConstraintCount}.`,
      );
  }
  if (
    oracle.objective &&
    (result.objectiveValue === undefined ||
      !within(result.objectiveValue, oracle.objective))
  ) {
    failures.push(
      `Expected objective ${oracle.objective.value}, received ${String(result.objectiveValue)}.`,
    );
  }
  if (oracle.decisions) {
    if (!result.decisionVector) failures.push("Expected a decision vector.");
    else
      for (const expected of oracle.decisions) {
        const index = fixture.problem.description.decisionVariables.findIndex(
          (item) =>
            item.name === expected.name &&
            item.component === expected.component,
        );
        const actual = result.decisionVector[index];
        if (index < 0 || actual === undefined || !within(actual, expected))
          failures.push(
            `Expected ${expected.name}=${expected.value}, received ${String(actual)}.`,
          );
      }
  }
  if (result.decisionVector) {
    const evaluation = fixture.problem.evaluate(result.decisionVector);
    const tolerances = fixture.problem.description.decisionVariables.flatMap(
      (item, index) =>
        item.component === "tolerance" ? [result.decisionVector![index]!] : [],
    );
    const auxiliaryIndex =
      fixture.problem.description.decisionVariables.findIndex(
        (item) => item.component === "auxiliary",
      );
    if (tolerances.some((value) => value < -1e-12))
      failures.push("A returned tolerance is negative.");
    if (
      Math.abs(
        result.decisionVector[auxiliaryIndex]! - Math.min(...tolerances),
      ) > 1e-12
    )
      failures.push(
        "Auxiliary objective does not equal the minimum tolerance.",
      );
    if (oracle.requireGreen) {
      if (!evaluation.feasible || evaluation.maximumViolation !== 0)
        failures.push(
          `Expected zero independently evaluated violation, received ${evaluation.maximumViolation}.`,
        );
      if (
        !evaluation.state.constraints.every((item) => item.status === "green")
      )
        failures.push("Not every final constraint is green.");
    }
  }
  return failures;
}

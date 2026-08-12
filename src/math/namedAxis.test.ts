import { describe, expect, it } from "vitest";

import {
  NamedAxisEvaluationError,
  coordinatesForFlatIndex,
  evaluateNamedExpression,
  expressionSymbolsFromNamedScope,
  mathJsExpressionEngine,
  nominalFlatIndex,
  projectFlatIndex,
  summarizeNamedAxisValue,
  unionAxisIds,
  type NamedAxisValue,
} from ".";

const engine = mathJsExpressionEngine;

function axis(
  id: string,
  values: readonly [number, number, number],
  unit: string | null = "mm",
): NamedAxisValue {
  return { axisIds: [id], values: new Float64Array(values), unit };
}

function validate(source: string, scope: ReadonlyMap<string, NamedAxisValue>) {
  return engine.validate(
    engine.parse(source),
    expressionSymbolsFromNamedScope(scope),
  );
}

describe("named-axis indexing", () => {
  it("uses deterministic row-major coordinates and projections", () => {
    expect(coordinatesForFlatIndex(5, 2)).toEqual([1, 2]);
    expect(nominalFlatIndex(3)).toBe(13);
    expect(projectFlatIndex(["a", "b", "c"], [2, 1, 0], ["a", "c"])).toBe(6);
  });

  it("forms an ordered union without duplicating shared axes", () => {
    expect(
      unionAxisIds([
        { axisIds: ["a", "b"], values: new Float64Array(9), unit: "m" },
        { axisIds: ["a", "c"], values: new Float64Array(9), unit: "m" },
      ]),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("named-axis expression evaluation", () => {
  it("evaluates every two-axis Cartesian combination", () => {
    const scope = new Map<string, NamedAxisValue>([
      ["a", axis("a-id", [1, 2, 3])],
      ["b", axis("b-id", [10, 20, 30])],
    ]);
    const result = evaluateNamedExpression(validate("a + b", scope), scope);

    expect(result.axisIds).toEqual(["a-id", "b-id"]);
    expect([...result.values]).toHaveLength(9);
    const expected = [
      0.011, 0.021, 0.031, 0.012, 0.022, 0.032, 0.013, 0.023, 0.033,
    ];
    for (const [index, value] of expected.entries()) {
      expect(result.values[index]).toBeCloseTo(value, 12);
    }
    expect(summarizeNamedAxisValue(result)).toEqual({
      minimum: { value: 0.011, unit: "m" },
      nominal: { value: 0.022, unit: "m" },
      maximum: { value: 0.033, unit: "m" },
    });
  });

  it("evaluates three axes into 27 values", () => {
    const scope = new Map<string, NamedAxisValue>([
      ["a", axis("a-id", [1, 2, 3])],
      ["b", axis("b-id", [10, 20, 30])],
      ["c", axis("c-id", [100, 200, 300])],
    ]);
    const result = evaluateNamedExpression(validate("a + b + c", scope), scope);

    expect(result.axisIds).toEqual(["a-id", "b-id", "c-id"]);
    expect(result.values).toHaveLength(27);
    expect(result.values[13]).toBeCloseTo(0.222, 12);
  });

  it("keeps scalar constants axis-free and broadcasts them later", () => {
    const emptyScope = new Map<string, NamedAxisValue>();
    const constant = evaluateNamedExpression(
      validate("2 mm", emptyScope),
      emptyScope,
    );
    const scope = new Map<string, NamedAxisValue>([
      ["a", axis("a-id", [1, 2, 3])],
      ["constant", constant],
    ]);
    const result = evaluateNamedExpression(
      validate("a + constant", scope),
      scope,
    );

    expect(constant.axisIds).toEqual([]);
    expect(constant.values).toHaveLength(1);
    expect(result.axisIds).toEqual(["a-id"]);
    expect([...result.values]).toEqual([0.003, 0.004, 0.005]);
  });

  it("aligns a shared base axis only once through derived values", () => {
    const baseScope = new Map<string, NamedAxisValue>([
      ["a", axis("a-id", [1, 2, 3])],
      ["b", axis("b-id", [10, 20, 30])],
    ]);
    const c = evaluateNamedExpression(validate("a + b", baseScope), baseScope);
    const derivedScope = new Map(baseScope);
    derivedScope.set("c", c);
    const d = evaluateNamedExpression(
      validate("a + c", derivedScope),
      derivedScope,
    );

    expect(d.axisIds).toEqual(["a-id", "b-id"]);
    expect(d.values).toHaveLength(9);
    expect(d.values[4]).toBeCloseTo(0.024, 12);
  });

  it("reports the axis coordinates that cause a domain error", () => {
    const scope = new Map<string, NamedAxisValue>([
      ["a", axis("a-id", [1, 2, 3], null)],
      ["b", axis("b-id", [0, 1, 2], null)],
    ]);
    const validation = validate("1 / (a - b)", scope);

    expect(() =>
      evaluateNamedExpression(validation, scope, {
        axisLabels: new Map([
          ["a-id", "a"],
          ["b-id", "b"],
        ]),
      }),
    ).toThrow(NamedAxisEvaluationError);

    try {
      evaluateNamedExpression(validation, scope, {
        axisLabels: new Map([
          ["a-id", "a"],
          ["b-id", "b"],
        ]),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(NamedAxisEvaluationError);
      expect((error as Error).message).toMatch(/a = min, b = nom/i);
    }
  });
});

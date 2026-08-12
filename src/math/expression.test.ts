import { describe, expect, it } from "vitest";

import {
  ExpressionEngineError,
  benchmarkExpressionEvaluation,
  mathJsExpressionEngine,
  type ExpressionSymbol,
  type ScalarQuantity,
} from ".";

const engine = mathJsExpressionEngine;

describe("MathJsExpressionEngine", () => {
  it("evaluates compatible dimensioned literals in canonical SI units", () => {
    const parsed = engine.parse("1 mm + 0.1 in");
    const validated = engine.validate(parsed, []);

    expect(validated.dependencies).toEqual([]);
    expect(validated.nominalResult.unit).toBe("m");
    expect(validated.nominalResult.value).toBeCloseTo(0.00354, 12);
  });

  it("rejects incompatible dimensions and dimensioned logarithms", () => {
    expect(() => engine.validate(engine.parse("1 mL + 0.1 in"), [])).toThrow(
      ExpressionEngineError,
    );
    expect(() => engine.validate(engine.parse("log(2 mm)"), [])).toThrow(
      /unit|dimension/i,
    );
  });

  it("supports constants, powers, roots, absolute values, and trigonometry", () => {
    const symbols: ExpressionSymbol[] = [
      { name: "r", nominal: { value: 10, unit: "mm" } },
    ];
    const area = engine.validate(engine.parse("pi * r^2"), symbols);
    const scalar = engine.validate(
      engine.parse("sqrt(abs(-4)) + sin(pi / 2)"),
      [],
    );

    expect(area.nominalResult.unit).toBe("m^2");
    expect(area.nominalResult.value).toBeCloseTo(Math.PI * 0.01 ** 2, 12);
    expect(scalar.nominalResult).toEqual({ value: 3, unit: null });
  });

  it("extracts dependencies in symbol-table order", () => {
    const symbols: ExpressionSymbol[] = [
      { name: "a", nominal: { value: 1, unit: "mm" } },
      { name: "b", nominal: { value: 2, unit: "mm" } },
    ];
    const validated = engine.validate(engine.parse("b + 2*a"), symbols);

    expect(validated.dependencies).toEqual(["a", "b"]);
  });

  it("rejects unknown symbols and non-arithmetic constructs", () => {
    expect(() => engine.validate(engine.parse("missing + 1"), [])).toThrow(
      /not an available variable/i,
    );
    for (const source of ["a = 2", "[1, 2]", "a < b", 'a["x"]']) {
      expect(() => engine.parse(source)).toThrow(ExpressionEngineError);
    }
  });

  it("rejects complex and non-finite results", () => {
    expect(() => engine.validate(engine.parse("sqrt(-1)"), [])).toThrow(
      /complex value/i,
    );
    expect(() => engine.validate(engine.parse("1 / 0"), [])).toThrow(
      /non-finite/i,
    );
  });

  it("compiles an equivalent normalized numeric plan", () => {
    const symbols: ExpressionSymbol[] = [
      { name: "a", nominal: { value: 10, unit: "mm" } },
      { name: "b", nominal: { value: 0.25, unit: "in" } },
    ];
    const validated = engine.validate(
      engine.parse("a^2 + b^2 + 1 mm^2"),
      symbols,
    );
    const plan = engine.compileNumericPlan(validated, symbols);
    const scope = new Map<string, ScalarQuantity>(
      symbols.map((symbol) => [symbol.name, symbol.nominal]),
    );

    expect(plan.outputUnit).toBe("m^2");
    expect(plan.evaluate(scope)).toBeCloseTo(validated.nominalResult.value, 14);
  });

  it("benchmarks direct unit evaluation against normalized numeric evaluation", () => {
    const symbols: ExpressionSymbol[] = [
      { name: "a", nominal: { value: 10, unit: "mm" } },
      { name: "b", nominal: { value: 0.25, unit: "in" } },
    ];
    const validated = engine.validate(engine.parse("sqrt(a^2 + b^2)"), symbols);
    const scopes = [
      new Map<string, ScalarQuantity>([
        ["a", { value: 9, unit: "mm" }],
        ["b", { value: 0.2, unit: "in" }],
      ]),
      new Map<string, ScalarQuantity>([
        ["a", { value: 11, unit: "mm" }],
        ["b", { value: 0.3, unit: "in" }],
      ]),
    ];
    const result = benchmarkExpressionEvaluation(
      validated,
      symbols,
      scopes,
      2_000,
    );

    expect(result.evaluations).toBe(4_000);
    expect(result.directChecksum).toBeCloseTo(result.normalizedChecksum, 10);
    expect(result.directUnitAwareMs).toBeGreaterThan(0);
    expect(result.normalizedNumericMs).toBeGreaterThan(0);
  });
});

import {
  convertScalarQuantity,
  mathJsExpressionEngine,
  type ExpressionEngine,
  type ExpressionSymbol,
  type ScalarQuantity,
  type ValidatedExpression,
} from "./expression";

export interface ExpressionBenchmarkResult {
  readonly evaluations: number;
  readonly directUnitAwareMs: number;
  readonly normalizedNumericMs: number;
  readonly directChecksum: number;
  readonly normalizedChecksum: number;
}

export function benchmarkExpressionEvaluation(
  validated: ValidatedExpression,
  symbols: readonly ExpressionSymbol[],
  scopes: readonly ReadonlyMap<string, ScalarQuantity>[],
  iterations: number,
  engine: ExpressionEngine = mathJsExpressionEngine,
): ExpressionBenchmarkResult {
  if (scopes.length === 0 || iterations < 1) {
    throw new Error("Benchmark requires scopes and at least one iteration.");
  }

  const numericPlan = engine.compileNumericPlan(validated, symbols);
  let directChecksum = 0;
  let normalizedChecksum = 0;

  const directStart = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const scope of scopes) {
      const result = engine.evaluateScalar(validated.parsed, scope);
      directChecksum += convertScalarQuantity(
        result,
        numericPlan.outputUnit,
      ).value;
    }
  }
  const directUnitAwareMs = performance.now() - directStart;

  const numericStart = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const scope of scopes) {
      normalizedChecksum += numericPlan.evaluate(scope);
    }
  }
  const normalizedNumericMs = performance.now() - numericStart;

  return {
    evaluations: iterations * scopes.length,
    directUnitAwareMs,
    normalizedNumericMs,
    directChecksum,
    normalizedChecksum,
  };
}

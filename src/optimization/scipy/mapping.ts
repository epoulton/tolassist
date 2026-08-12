import type { ScalarConstraintEvaluation } from "../contracts";

export function scipyConstraintValue(
  evaluation: ScalarConstraintEvaluation,
  kind: "inequality" | "equality",
): number {
  const margin =
    64 *
    Number.EPSILON *
    Math.max(
      1,
      Math.abs(evaluation.residual),
      Math.abs(evaluation.allowedError),
    );
  const feasibleValue =
    kind === "equality"
      ? evaluation.allowedError - Math.abs(evaluation.residual)
      : -evaluation.residual;
  return feasibleValue - margin;
}

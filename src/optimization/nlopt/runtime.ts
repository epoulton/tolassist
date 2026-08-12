import { Buffer } from "buffer";
import {
  hydrateOptimizationProblem,
  OptimizationEvaluationError,
} from "../compiler";
import type {
  OptimizationProblemDescription,
  OptimizationResult,
  OptimizationSafeguards,
  SolveProgressCallback,
} from "../contracts";
import { nloptAdapterId, nloptAdapterVersion } from "./metadata";

type NloptModule = (typeof import("nlopt-js"))["default"];

let loadedNlopt: NloptModule | undefined;
let nloptPromise: Promise<NloptModule> | undefined;

function loadNlopt(): Promise<NloptModule> {
  if (loadedNlopt) return Promise.resolve(loadedNlopt);
  if (!nloptPromise) {
    Object.assign(globalThis, { Buffer });
    nloptPromise = import("nlopt-js").then(async ({ default: nlopt }) => {
      await nlopt.ready;
      loadedNlopt = nlopt;
      return nlopt;
    });
  }
  return nloptPromise;
}

export async function initializeNloptRuntime() {
  const startedAt = performance.now();
  await loadNlopt();
  return {
    id: nloptAdapterId,
    label: "NLopt COBYLA (WebAssembly spike)",
    adapterVersion: nloptAdapterVersion,
    runtimeVersion: null,
    initializationMs: performance.now() - startedAt,
  } as const;
}

function errorResult(
  error: unknown,
  evaluations: number,
  elapsedMs: number,
): OptimizationResult {
  const known =
    error instanceof OptimizationEvaluationError
      ? error
      : new OptimizationEvaluationError(
          "numeric_domain",
          error instanceof Error
            ? error.message
            : typeof error === "string" || typeof error === "number"
              ? `NLopt evaluation failed: ${String(error)}`
              : "NLopt evaluation failed.",
        );
  const outcome =
    known.code === "timed_out"
      ? "timed_out"
      : known.code === "diverged"
        ? "diverged"
        : "failed";
  return {
    solverId: nloptAdapterId,
    solverVersion: nloptAdapterVersion,
    outcome,
    evaluations,
    elapsedMs,
    terminationCode: known.code,
    message: known.message,
    diagnostics: [{ code: known.code, message: known.message }],
  };
}

function canonicalizeAuxiliary(
  description: OptimizationProblemDescription,
  vector: readonly number[],
): readonly number[] {
  const result = [...vector];
  const toleranceValues = description.decisionVariables.flatMap(
    (variable, index) =>
      variable.component === "tolerance" ? [result[index]!] : [],
  );
  const auxiliaryIndex = description.decisionVariables.findIndex(
    (variable) => variable.component === "auxiliary",
  );
  result[auxiliaryIndex] = Math.min(...toleranceValues);
  return result;
}

export async function solveWithNlopt(
  description: OptimizationProblemDescription,
  safeguards: Partial<OptimizationSafeguards> | undefined,
  onProgress?: SolveProgressCallback,
): Promise<OptimizationResult> {
  const nlopt = await loadNlopt();
  const problem = hydrateOptimizationProblem(description);
  const session = problem.createEvaluationSession(safeguards);
  const mergedSafeguards = { ...description.safeguards, ...safeguards };
  const optimizer = new nlopt.Optimize(
    nlopt.Algorithm.LN_COBYLA,
    description.decisionVariables.length,
  );
  let cachedVector: readonly number[] | undefined;
  let cachedEvaluation: ReturnType<typeof session.evaluate> | undefined;
  let bestFeasibleVector: readonly number[] | undefined;
  let bestFeasibleObjective = Number.NEGATIVE_INFINITY;
  let lastProgressAt = -Infinity;

  const evaluate = (candidate: readonly number[]) => {
    if (
      cachedVector &&
      cachedVector.length === candidate.length &&
      cachedVector.every((value, index) => value === candidate[index])
    ) {
      return cachedEvaluation!;
    }
    cachedVector = [...candidate];
    cachedEvaluation = session.evaluate(candidate);
    if (
      cachedEvaluation.feasible &&
      cachedEvaluation.objectiveValue > bestFeasibleObjective
    ) {
      bestFeasibleVector = [...candidate];
      bestFeasibleObjective = cachedEvaluation.objectiveValue;
    }
    if (
      onProgress &&
      (session.evaluations === 1 ||
        session.evaluations % 25 === 0 ||
        session.elapsedMs - lastProgressAt >= 100)
    ) {
      lastProgressAt = session.elapsedMs;
      onProgress({
        phase: "solving",
        evaluations: session.evaluations,
        elapsedMs: session.elapsedMs,
      });
    }
    return cachedEvaluation;
  };

  optimizer.setLowerBounds(
    description.decisionVariables.map(
      (variable) => variable.lowerBound ?? Number.NEGATIVE_INFINITY,
    ),
  );
  optimizer.setUpperBounds(
    description.decisionVariables.map(
      (variable) => variable.upperBound ?? Number.POSITIVE_INFINITY,
    ),
  );
  optimizer.setMinObjective(
    (candidate) => -evaluate(candidate).objectiveValue,
    1e-12,
  );
  for (const constraint of description.constraints) {
    optimizer.addInequalityConstraint((candidate) => {
      const evaluated = evaluate(candidate).scalarConstraints.find(
        (item) => item.id === constraint.id,
      );
      if (!evaluated) {
        throw new OptimizationEvaluationError(
          "invalid_problem",
          `Missing scalar constraint evaluation for “${constraint.id}”.`,
        );
      }
      const solverSafetyMargin =
        64 *
        Number.EPSILON *
        Math.max(
          1,
          Math.abs(evaluated.residual),
          Math.abs(evaluated.allowedError),
        );
      return (
        (constraint.kind === "equality"
          ? Math.abs(evaluated.residual) - evaluated.allowedError
          : evaluated.residual) + solverSafetyMargin
      );
    }, 0);
  }
  optimizer.setMaxeval(mergedSafeguards.evaluationLimit);
  optimizer.setMaxtime(mergedSafeguards.timeLimitMs / 1000);

  try {
    const raw = optimizer.optimize(description.initialDecisionVector);
    let candidate = canonicalizeAuxiliary(description, raw.x);
    let finalEvaluation = problem.evaluate(candidate);
    const usedFeasibleFallback =
      !finalEvaluation.feasible && bestFeasibleVector !== undefined;
    if (usedFeasibleFallback) {
      candidate = canonicalizeAuxiliary(description, bestFeasibleVector!);
      finalEvaluation = problem.evaluate(candidate);
    }
    const elapsedMs = session.elapsedMs;
    if (elapsedMs >= mergedSafeguards.timeLimitMs) {
      return {
        solverId: nloptAdapterId,
        solverVersion: nloptAdapterVersion,
        outcome: "timed_out",
        decisionVector: candidate,
        objectiveValue: finalEvaluation.objectiveValue,
        evaluations: session.evaluations,
        elapsedMs,
        terminationCode: "inferred_maximum_time",
        message: "NLopt reached the configured time limit.",
        diagnostics: [],
      };
    }
    if (session.evaluations >= mergedSafeguards.evaluationLimit) {
      return {
        solverId: nloptAdapterId,
        solverVersion: nloptAdapterVersion,
        outcome: "failed",
        decisionVector: candidate,
        objectiveValue: finalEvaluation.objectiveValue,
        evaluations: session.evaluations,
        elapsedMs,
        terminationCode: "inferred_maximum_evaluations",
        message:
          "NLopt reached the configured evaluation limit before convergence could be confirmed.",
        diagnostics: [],
      };
    }
    return {
      solverId: nloptAdapterId,
      solverVersion: nloptAdapterVersion,
      outcome: finalEvaluation.feasible ? "succeeded" : "infeasible",
      decisionVector: candidate,
      objectiveValue: finalEvaluation.objectiveValue,
      evaluations: session.evaluations,
      elapsedMs,
      terminationCode: raw.success
        ? "nlopt_success_without_code"
        : "nlopt_unsuccessful_without_code",
      message: finalEvaluation.feasible
        ? "NLopt returned an independently validated feasible solution."
        : "NLopt returned a candidate that does not satisfy every TolAssist constraint.",
      diagnostics: [
        ...(usedFeasibleFallback
          ? [
              {
                code: "best_feasible_candidate",
                message:
                  "The final COBYLA boundary point was numerically infeasible; TolAssist retained the best independently feasible evaluated candidate.",
              },
            ]
          : []),
        ...(raw.success
          ? []
          : [
              {
                code: "wrapper_result_unsuccessful",
                message:
                  "The wrapper did not expose an NLopt termination code.",
              },
            ]),
      ],
    };
  } catch (error) {
    return errorResult(error, session.evaluations, session.elapsedMs);
  } finally {
    nlopt.GC.flush();
  }
}

export function disposeNloptRuntime(): void {
  loadedNlopt?.GC.flush();
}

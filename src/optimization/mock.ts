import type {
  CompiledOptimizationProblem,
  OptimizationEngine,
  EngineInfo,
  OptimizationOutcome,
  OptimizationResult,
  SolveOptions,
} from "./contracts";
import { OptimizationEvaluationError } from "./compiler";

export type MockCandidateFactory = (
  problem: CompiledOptimizationProblem,
) => readonly number[];

function outcomeFor(error: OptimizationEvaluationError): OptimizationOutcome {
  if (error.code === "timed_out") return "timed_out";
  if (error.code === "diverged") return "diverged";
  return "failed";
}

/** A deterministic contract test double, not a numerical optimizer. */
export class MockOptimizationEngine implements OptimizationEngine {
  readonly id = "deterministic-mock";
  readonly version = "1.0.0";
  readonly #candidateFactory: MockCandidateFactory;

  constructor(
    candidateFactory: MockCandidateFactory = (problem) =>
      problem.description.initialDecisionVector,
  ) {
    this.#candidateFactory = candidateFactory;
  }

  async initialize(): Promise<EngineInfo> {
    await Promise.resolve();
    return {
      id: this.id,
      label: "Deterministic mock",
      adapterVersion: this.version,
      runtimeVersion: null,
      initializationMs: 0,
    };
  }

  async solve(
    problem: CompiledOptimizationProblem,
    options: SolveOptions = {},
    signal?: AbortSignal,
  ): Promise<OptimizationResult> {
    await Promise.resolve();
    const session = problem.createEvaluationSession(options.safeguards);
    if (signal?.aborted) {
      return {
        solverId: this.id,
        solverVersion: this.version,
        outcome: "cancelled",
        evaluations: 0,
        iterations: 0,
        elapsedMs: session.elapsedMs,
        terminationCode: "aborted",
        message: "Optimization was cancelled before evaluation.",
        diagnostics: [],
      };
    }
    try {
      const candidate = [...this.#candidateFactory(problem)];
      const evaluation = session.evaluate(candidate);
      if (!evaluation.feasible) {
        return {
          solverId: this.id,
          solverVersion: this.version,
          outcome: "infeasible",
          decisionVector: candidate,
          objectiveValue: evaluation.objectiveValue,
          evaluations: session.evaluations,
          iterations: 1,
          elapsedMs: session.elapsedMs,
          terminationCode: "mock-infeasible",
          message:
            "The deterministic candidate does not satisfy every scalar constraint.",
          diagnostics: [
            {
              code: "maximum_constraint_violation",
              message: `Maximum scalar constraint violation: ${evaluation.maximumViolation}.`,
            },
          ],
        };
      }
      return {
        solverId: this.id,
        solverVersion: this.version,
        outcome: "succeeded",
        decisionVector: candidate,
        objectiveValue: evaluation.objectiveValue,
        evaluations: session.evaluations,
        iterations: 1,
        elapsedMs: session.elapsedMs,
        terminationCode: "mock-feasible",
        message: "The deterministic candidate is feasible.",
        diagnostics: [],
      };
    } catch (error) {
      const known =
        error instanceof OptimizationEvaluationError
          ? error
          : new OptimizationEvaluationError(
              "numeric_domain",
              error instanceof Error ? error.message : "Evaluation failed.",
            );
      return {
        solverId: this.id,
        solverVersion: this.version,
        outcome: outcomeFor(known),
        evaluations: session.evaluations,
        iterations: 1,
        elapsedMs: session.elapsedMs,
        terminationCode: known.code,
        message: known.message,
        diagnostics: [{ code: known.code, message: known.message }],
      };
    }
  }

  async dispose(): Promise<void> {}
}

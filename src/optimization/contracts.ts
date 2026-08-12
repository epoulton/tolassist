import type { EqualityTolerance } from "../domain/stage3";

export const MAX_MIN_OBJECTIVE_ID = "maximize-minimum-tolerance";
export const MAX_MIN_OBJECTIVE_LABEL =
  "Maximize the minimum tolerance among the selected variables subject to the defined constraints";

export type OptimizationOutcome =
  | "succeeded"
  | "infeasible"
  | "unbounded"
  | "timed_out"
  | "cancelled"
  | "diverged"
  | "failed";

export type DecisionVariableComponent = "nominal" | "tolerance" | "auxiliary";

export interface SerializedBaseVariable {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly threePoint: {
    readonly minimum: number;
    readonly nominal: number;
    readonly maximum: number;
  };
  readonly nominalTolerance: {
    readonly nominal: number;
    readonly tolerance: number;
  };
}

export interface SerializedDerivedVariable {
  readonly id: string;
  readonly name: string;
  readonly expression: string;
}

export interface SerializedConstraintSource {
  readonly id: string;
  readonly source: string;
}

export interface DecisionVariable {
  readonly id: string;
  readonly baseVariableId: string | null;
  readonly name: string;
  readonly component: DecisionVariableComponent;
  readonly normalizedUnit: string | null;
  readonly initialValue: number;
  readonly lowerBound: number | null;
  readonly upperBound: number | null;
}

export interface ScalarConstraintDescription {
  readonly id: string;
  readonly sourceConstraintId: string | null;
  readonly source: string;
  readonly kind: "inequality" | "equality";
  readonly flatIndex: number;
  readonly coordinate: Readonly<Record<string, "min" | "nom" | "max">>;
  readonly normalizedUnit: string | null;
}

export interface OptimizationSafeguards {
  readonly timeLimitMs: number;
  readonly evaluationLimit: number;
  readonly maximumAbsoluteValue: number;
  readonly divergenceFactor: number;
}

export interface OptimizationProblemDescription {
  readonly schemaVersion: 1;
  readonly objective: {
    readonly id: typeof MAX_MIN_OBJECTIVE_ID;
    readonly label: typeof MAX_MIN_OBJECTIVE_LABEL;
    readonly direction: "maximize";
    readonly auxiliaryVariableId: string;
  };
  readonly decisionVariables: readonly DecisionVariable[];
  readonly initialDecisionVector: readonly number[];
  readonly constraints: readonly ScalarConstraintDescription[];
  readonly selectedBaseVariableIds: readonly string[];
  readonly equalityTolerance: EqualityTolerance;
  readonly safeguards: OptimizationSafeguards;
  readonly sourceModel: {
    readonly baseVariables: readonly SerializedBaseVariable[];
    readonly derivedVariables: readonly SerializedDerivedVariable[];
    readonly constraints: readonly SerializedConstraintSource[];
  };
}

export interface EvaluatedBaseVariable extends SerializedBaseVariable {
  readonly optimized: boolean;
}

export interface EvaluatedDerivedVariable {
  readonly id: string;
  readonly name: string;
  readonly expression: string;
  readonly unit: string | null;
  readonly minimum: number;
  readonly nominal: number;
  readonly maximum: number;
  readonly combinationCount: number;
}

export interface EvaluatedConstraint {
  readonly id: string;
  readonly source: string;
  readonly status: "green" | "yellow" | "red";
  readonly nominalSatisfied: boolean;
  readonly allSatisfied: boolean;
}

export interface ScalarConstraintEvaluation {
  readonly id: string;
  readonly residual: number;
  readonly allowedError: number;
  readonly violation: number;
}

export interface OptimizationEvaluation {
  readonly objectiveValue: number;
  readonly scalarConstraints: readonly ScalarConstraintEvaluation[];
  readonly feasible: boolean;
  readonly maximumViolation: number;
  readonly state: {
    readonly baseVariables: readonly EvaluatedBaseVariable[];
    readonly derivedVariables: readonly EvaluatedDerivedVariable[];
    readonly constraints: readonly EvaluatedConstraint[];
  };
}

export interface EvaluationSession {
  readonly evaluations: number;
  readonly elapsedMs: number;
  evaluate(decisionVector: readonly number[]): OptimizationEvaluation;
}

export interface CompiledOptimizationProblem {
  readonly description: OptimizationProblemDescription;
  evaluate(decisionVector: readonly number[]): OptimizationEvaluation;
  createEvaluationSession(
    safeguards?: Partial<OptimizationSafeguards>,
  ): EvaluationSession;
}

export interface OptimizationDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface OptimizationResult {
  readonly solverId: string;
  readonly solverVersion: string;
  readonly outcome: OptimizationOutcome;
  readonly decisionVector?: readonly number[];
  readonly objectiveValue?: number;
  readonly evaluations: number;
  readonly solverEvaluations?: number;
  readonly iterations?: number;
  readonly elapsedMs: number;
  readonly terminationCode?: string;
  readonly message: string;
  readonly diagnostics: readonly OptimizationDiagnostic[];
}

export interface SolveOptions {
  readonly safeguards?: Partial<OptimizationSafeguards>;
}

export interface EngineInfo {
  readonly id: string;
  readonly label: string;
  readonly adapterVersion: string;
  readonly runtimeVersion: string | null;
  readonly initializationMs: number;
  readonly components?: Readonly<Record<string, string>>;
  readonly initializationPhasesMs?: Readonly<Record<string, number>>;
  readonly runtimeResources?: readonly {
    readonly name: string;
    readonly transferSize: number;
    readonly encodedBodySize: number;
    readonly decodedBodySize: number;
  }[];
}

export interface SolverCapabilities {
  readonly nonlinearInequalities: boolean;
  readonly nonlinearEqualities: boolean;
  readonly variableBounds: boolean;
  readonly derivativeFree: boolean;
  readonly explicitMaximization: boolean;
  readonly timeLimit: boolean;
  readonly evaluationLimit: boolean;
  readonly progress: "none" | "evaluations";
  readonly cooperativeCancellation: boolean;
  readonly forcedWorkerTermination: boolean;
  readonly deterministic: boolean;
}

export interface SolveProgress {
  readonly phase: "initializing" | "solving";
  readonly evaluations: number;
  readonly elapsedMs: number;
}

export type SolveProgressCallback = (progress: SolveProgress) => void;

export interface OptimizationEngine {
  readonly id: string;
  readonly version: string;
  initialize(): Promise<EngineInfo>;
  solve(
    problem: CompiledOptimizationProblem,
    options?: SolveOptions,
    signal?: AbortSignal,
    onProgress?: SolveProgressCallback,
  ): Promise<OptimizationResult>;
  dispose(): Promise<void>;
}

export interface SolverDescriptor {
  readonly id: string;
  readonly label: string;
  readonly capabilities: SolverCapabilities;
  load(): Promise<OptimizationEngine>;
}

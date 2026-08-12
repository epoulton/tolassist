import type {
  CompiledOptimizationProblem,
  OptimizationResult,
} from "../optimization/contracts";

export interface OptimizationResultSnapshot {
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly variables: readonly {
    readonly id: string;
    readonly name: string;
    readonly unit: string;
    readonly nominal: number;
    readonly tolerance: number;
    readonly optimized: boolean;
  }[];
  readonly expressions: readonly {
    readonly id: string;
    readonly name: string;
    readonly expression: string;
    readonly unit: string | null;
    readonly minimum: number;
    readonly nominal: number;
    readonly maximum: number;
    readonly combinationCount: number;
  }[];
  readonly constraints: readonly {
    readonly id: string;
    readonly expression: string;
    readonly status: "green";
    readonly nominalSatisfied: true;
    readonly allSatisfied: true;
  }[];
  readonly optimization: {
    readonly objectiveId: string;
    readonly objective: string;
    readonly selectedVariables: readonly { id: string; name: string }[];
    readonly objectiveValue: number;
    readonly objectiveUnit: string | null;
    readonly solver: {
      readonly id: string;
      readonly version: string;
      readonly evaluations: number;
      readonly iterations?: number;
      readonly elapsedMs: number;
      readonly terminationCode?: string;
    };
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function createOptimizationResultSnapshot(
  problem: CompiledOptimizationProblem,
  result: OptimizationResult,
  createdAt = new Date().toISOString(),
): OptimizationResultSnapshot {
  if (result.outcome !== "succeeded" || !result.decisionVector) {
    throw new Error(
      "A result snapshot can be created only from a successful optimization.",
    );
  }
  const evaluation = problem.evaluate(result.decisionVector);
  if (
    !evaluation.feasible ||
    evaluation.state.constraints.some((item) => !item.allSatisfied)
  ) {
    throw new Error(
      "The returned decision vector failed independent feasibility validation.",
    );
  }
  const selectedIds = new Set(problem.description.selectedBaseVariableIds);
  const selectedVariables = evaluation.state.baseVariables
    .filter((variable) => selectedIds.has(variable.id))
    .map((variable) => ({ id: variable.id, name: variable.name }));
  const auxiliary = problem.description.decisionVariables.find(
    (variable) => variable.component === "auxiliary",
  )!;
  const snapshot: OptimizationResultSnapshot = {
    schemaVersion: 1,
    createdAt,
    variables: evaluation.state.baseVariables.map((variable) => ({
      id: variable.id,
      name: variable.name,
      unit: variable.unit,
      nominal: variable.nominalTolerance.nominal,
      tolerance: variable.nominalTolerance.tolerance,
      optimized: variable.optimized,
    })),
    expressions: evaluation.state.derivedVariables.map((variable) => ({
      ...variable,
    })),
    constraints: evaluation.state.constraints.map((constraint) => ({
      id: constraint.id,
      expression: constraint.source,
      status: "green" as const,
      nominalSatisfied: true as const,
      allSatisfied: true as const,
    })),
    optimization: {
      objectiveId: problem.description.objective.id,
      objective: problem.description.objective.label,
      selectedVariables,
      objectiveValue: evaluation.objectiveValue,
      objectiveUnit: auxiliary.normalizedUnit,
      solver: {
        id: result.solverId,
        version: result.solverVersion,
        evaluations: result.evaluations,
        ...(result.iterations === undefined
          ? {}
          : { iterations: result.iterations }),
        elapsedMs: result.elapsedMs,
        ...(result.terminationCode
          ? { terminationCode: result.terminationCode }
          : {}),
      },
    },
  };
  return deepFreeze(snapshot);
}

export function serializeOptimizationResultSnapshot(
  snapshot: OptimizationResultSnapshot,
): string {
  return JSON.stringify(snapshot, null, 2);
}

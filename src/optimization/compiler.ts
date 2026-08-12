import {
  convertAbsoluteQuantityFromSi,
  convertDeltaQuantityFromSi,
  coordinatesForFlatIndex,
  evaluateNamedExpression,
  mathJsExpressionEngine,
  namedAxisFromBaseVariable,
  nominalFlatIndex,
  normalizeAbsoluteQuantityToSi,
  normalizeDeltaQuantityToSi,
  summarizeNamedAxisValue,
  unitsAreCompatible,
} from "../math";
import {
  convertNominalToleranceToThreePoint,
  type ValidatedBaseVariable,
} from "../domain/stage1";
import {
  createStage2Row,
  validateStage2Rows,
  type ValidatedDerivedVariable,
} from "../domain/stage2";
import {
  createStage3Row,
  compileConstraint,
  evaluateCompiledConstraintResiduals,
  provisionalEqualityTolerance,
  validateStage3Rows,
  type EqualityTolerance,
  type ValidatedConstraint,
} from "../domain/stage3";
import {
  MAX_MIN_OBJECTIVE_ID,
  MAX_MIN_OBJECTIVE_LABEL,
  type CompiledOptimizationProblem,
  type DecisionVariable,
  type EvaluationSession,
  type OptimizationEvaluation,
  type OptimizationProblemDescription,
  type OptimizationSafeguards,
  type ScalarConstraintDescription,
} from "./contracts";

const auxiliaryVariableId = "objective:min-tolerance";
const coordinateNames = ["min", "nom", "max"] as const;

export const defaultOptimizationSafeguards: OptimizationSafeguards = {
  timeLimitMs: 30_000,
  evaluationLimit: 100_000,
  maximumAbsoluteValue: 1e100,
  divergenceFactor: 1e12,
};

export type OptimizationErrorCode =
  | "invalid_problem"
  | "invalid_candidate"
  | "numeric_domain"
  | "diverged"
  | "timed_out"
  | "evaluation_limit";

export class OptimizationEvaluationError extends Error {
  readonly code: OptimizationErrorCode;

  constructor(code: OptimizationErrorCode, message: string) {
    super(message);
    this.name = "OptimizationEvaluationError";
    this.code = code;
  }
}

export interface OptimizationCompileInput {
  readonly baseVariables: readonly ValidatedBaseVariable[];
  readonly derivedVariables: readonly ValidatedDerivedVariable[];
  readonly constraints: readonly ValidatedConstraint[];
  readonly selectedBaseVariableIds: readonly string[];
  readonly equalityTolerance?: EqualityTolerance;
  readonly safeguards?: Partial<OptimizationSafeguards>;
}

function unitOrNull(unitName: string): string | null {
  return unitName === "1" ? null : unitName;
}

function mergeSafeguards(
  overrides?: Partial<OptimizationSafeguards>,
): OptimizationSafeguards {
  const merged = { ...defaultOptimizationSafeguards, ...overrides };
  for (const [name, value] of Object.entries(merged)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new OptimizationEvaluationError(
        "invalid_problem",
        `Optimization safeguard “${name}” must be a positive finite number.`,
      );
    }
  }
  return merged;
}

function serializeBaseVariable(variable: ValidatedBaseVariable) {
  return {
    id: variable.id,
    name: variable.name,
    unit: variable.unit,
    threePoint: { ...variable.threePoint },
    nominalTolerance: { ...variable.nominalTolerance },
  };
}

function normalizedNominal(variable: ValidatedBaseVariable) {
  return normalizeAbsoluteQuantityToSi({
    value: variable.nominalTolerance.nominal,
    unit: unitOrNull(variable.unit),
  });
}

function normalizedTolerance(variable: ValidatedBaseVariable) {
  return normalizeDeltaQuantityToSi({
    value: variable.nominalTolerance.tolerance,
    unit: unitOrNull(variable.unit),
  });
}

function buildDecisionVariables(
  selected: readonly ValidatedBaseVariable[],
): readonly DecisionVariable[] {
  const variables: DecisionVariable[] = [];
  for (const variable of selected) {
    const nominal = normalizedNominal(variable);
    const tolerance = normalizedTolerance(variable);
    variables.push(
      {
        id: `${variable.id}:nominal`,
        baseVariableId: variable.id,
        name: `${variable.name} nominal`,
        component: "nominal",
        normalizedUnit: nominal.unit,
        initialValue: nominal.value,
        lowerBound: null,
        upperBound: null,
      },
      {
        id: `${variable.id}:tolerance`,
        baseVariableId: variable.id,
        name: `${variable.name} tolerance`,
        component: "tolerance",
        normalizedUnit: tolerance.unit,
        initialValue: tolerance.value,
        lowerBound: 0,
        upperBound: null,
      },
    );
  }
  const toleranceUnit = variables.find(
    (variable) => variable.component === "tolerance",
  )!.normalizedUnit;
  const initialMinimum = Math.min(
    ...variables
      .filter((variable) => variable.component === "tolerance")
      .map((variable) => variable.initialValue),
  );
  variables.push({
    id: auxiliaryVariableId,
    baseVariableId: null,
    name: "minimum selected tolerance",
    component: "auxiliary",
    normalizedUnit: toleranceUnit,
    initialValue: initialMinimum,
    lowerBound: null,
    upperBound: null,
  });
  return variables;
}

function validateSelection(
  baseVariables: readonly ValidatedBaseVariable[],
  selectedIds: readonly string[],
): readonly ValidatedBaseVariable[] {
  if (selectedIds.length === 0) {
    throw new OptimizationEvaluationError(
      "invalid_problem",
      "Select at least one Stage 1 variable to optimize.",
    );
  }
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new OptimizationEvaluationError(
      "invalid_problem",
      "Each optimization variable may be selected only once.",
    );
  }
  const byId = new Map(
    baseVariables.map((variable) => [variable.id, variable]),
  );
  const selected = selectedIds.map((id) => {
    const variable = byId.get(id);
    if (!variable) {
      throw new OptimizationEvaluationError(
        "invalid_problem",
        `The selected Stage 1 variable “${id}” is not available.`,
      );
    }
    return variable;
  });
  const firstUnit = unitOrNull(selected[0]!.unit);
  for (const variable of selected.slice(1)) {
    if (!unitsAreCompatible(firstUnit, unitOrNull(variable.unit))) {
      throw new OptimizationEvaluationError(
        "invalid_problem",
        `The selected tolerances must have compatible dimensions. “${selected[0]!.name}” and “${variable.name}” cannot share a minimum-tolerance objective.`,
      );
    }
  }
  return selected;
}

function scalarCoordinate(
  axisIds: readonly string[],
  flatIndex: number,
  baseVariables: readonly { id: string; name: string }[],
): Readonly<Record<string, "min" | "nom" | "max">> {
  const labels = new Map(
    baseVariables.map((variable) => [variable.id, variable.name]),
  );
  const coordinates = coordinatesForFlatIndex(flatIndex, axisIds.length);
  return Object.fromEntries(
    axisIds.map((axisId, index) => [
      labels.get(axisId) ?? axisId,
      coordinateNames[coordinates[index] ?? 0],
    ]),
  );
}

function makeCandidateBaseVariables(
  description: OptimizationProblemDescription,
  decisionVector: readonly number[],
) {
  const selected = new Set(description.selectedBaseVariableIds);
  const indexById = new Map(
    description.decisionVariables.map((variable, index) => [
      variable.id,
      index,
    ]),
  );
  return description.sourceModel.baseVariables.map((source) => {
    if (!selected.has(source.id)) return { ...source, optimized: false };
    const nominalDecision =
      description.decisionVariables[indexById.get(`${source.id}:nominal`)!]!;
    const toleranceDecision =
      description.decisionVariables[indexById.get(`${source.id}:tolerance`)!]!;
    const targetUnit = unitOrNull(source.unit);
    const nominal = convertAbsoluteQuantityFromSi(
      {
        value: decisionVector[indexById.get(nominalDecision.id)!]!,
        unit: nominalDecision.normalizedUnit,
      },
      targetUnit,
    ).value;
    const tolerance = convertDeltaQuantityFromSi(
      {
        value: decisionVector[indexById.get(toleranceDecision.id)!]!,
        unit: toleranceDecision.normalizedUnit,
      },
      targetUnit,
    ).value;
    const nominalTolerance = { nominal, tolerance };
    return {
      id: source.id,
      name: source.name,
      unit: source.unit,
      nominalTolerance,
      threePoint: convertNominalToleranceToThreePoint(nominalTolerance),
      optimized: true,
    };
  });
}

function validateCandidate(
  description: OptimizationProblemDescription,
  vector: readonly number[],
  safeguards: OptimizationSafeguards,
) {
  if (vector.length !== description.decisionVariables.length) {
    throw new OptimizationEvaluationError(
      "invalid_candidate",
      `Expected ${description.decisionVariables.length} decision values but received ${vector.length}.`,
    );
  }
  vector.forEach((value, index) => {
    const variable = description.decisionVariables[index]!;
    if (!Number.isFinite(value)) {
      throw new OptimizationEvaluationError(
        "numeric_domain",
        `The candidate value for “${variable.name}” is not finite.`,
      );
    }
    if (variable.lowerBound !== null && value < variable.lowerBound) {
      throw new OptimizationEvaluationError(
        "invalid_candidate",
        `The candidate value for “${variable.name}” is below its lower bound of ${variable.lowerBound}.`,
      );
    }
    if (variable.upperBound !== null && value > variable.upperBound) {
      throw new OptimizationEvaluationError(
        "invalid_candidate",
        `The candidate value for “${variable.name}” is above its upper bound of ${variable.upperBound}.`,
      );
    }
    const initialScale = Math.max(Math.abs(variable.initialValue), 1);
    if (
      Math.abs(value) > safeguards.maximumAbsoluteValue ||
      Math.abs(value) > initialScale * safeguards.divergenceFactor
    ) {
      throw new OptimizationEvaluationError(
        "diverged",
        `The candidate value for “${variable.name}” exceeded the configured divergence safeguards.`,
      );
    }
  });
}

function createEvaluator(description: OptimizationProblemDescription) {
  const sourceBaseVariables: readonly ValidatedBaseVariable[] =
    description.sourceModel.baseVariables.map((variable) => ({
      ...variable,
      threePoint: { ...variable.threePoint },
      nominalTolerance: { ...variable.nominalTolerance },
    }));
  const stage2Rows = description.sourceModel.derivedVariables.map((source) => ({
    ...createStage2Row(source.id),
    name: source.name,
    expression: source.expression,
  }));
  const preparedStage2 = validateStage2Rows(stage2Rows, sourceBaseVariables);
  if (!preparedStage2.isValid) {
    throw new OptimizationEvaluationError(
      "invalid_problem",
      preparedStage2.rows.find((row) => row.status === "invalid")?.errors
        .expression ?? "The serialized derived-expression plan is invalid.",
    );
  }
  const stage3Rows = description.sourceModel.constraints.map((source) => ({
    ...createStage3Row(source.id),
    expression: source.source,
  }));
  const preparedStage3 = validateStage3Rows(
    stage3Rows,
    preparedStage2.scope,
    mathJsExpressionEngine,
    description.equalityTolerance,
  );
  if (!preparedStage3.isValid) {
    throw new OptimizationEvaluationError(
      "invalid_problem",
      preparedStage3.rows.find((row) => row.status === "invalid")?.error ??
        "The serialized constraint plan is invalid.",
    );
  }
  const compiledConstraints = preparedStage3.constraints.map((constraint) => ({
    constraint,
    compiled: compileConstraint(
      constraint.parsed,
      preparedStage2.scope,
      mathJsExpressionEngine,
    ),
  }));

  return (
    decisionVector: readonly number[],
    safeguards = description.safeguards,
  ): OptimizationEvaluation => {
    validateCandidate(description, decisionVector, safeguards);
    const baseVariables = makeCandidateBaseVariables(
      description,
      decisionVector,
    );
    const scope = new Map(
      baseVariables.map((variable) => [
        variable.name,
        namedAxisFromBaseVariable(variable),
      ]),
    );
    const evaluatedDerived = [];
    try {
      for (const prepared of preparedStage2.variables) {
        const result = evaluateNamedExpression(prepared.validation, scope, {
          engine: mathJsExpressionEngine,
        });
        const summary = summarizeNamedAxisValue(result);
        scope.set(prepared.name, result);
        evaluatedDerived.push({ prepared, result, summary });
      }
    } catch (error) {
      throw new OptimizationEvaluationError(
        "numeric_domain",
        error instanceof Error
          ? error.message
          : "A derived expression failed for this candidate vector.",
      );
    }

    const evaluatedConstraints = [];
    try {
      for (const prepared of compiledConstraints) {
        const residuals = evaluateCompiledConstraintResiduals(
          prepared.compiled,
          scope,
          mathJsExpressionEngine,
          description.equalityTolerance,
        );
        const satisfaction = new Uint8Array(residuals.residuals.length);
        for (let index = 0; index < satisfaction.length; index += 1) {
          satisfaction[index] =
            prepared.constraint.parsed.operator === "=="
              ? Math.abs(residuals.residuals[index]!) <=
                residuals.allowedEqualityError[index]!
                ? 1
                : 0
              : residuals.residuals[index]! <= 0
                ? 1
                : 0;
        }
        const nominalSatisfied =
          satisfaction[nominalFlatIndex(residuals.axisIds.length)] === 1;
        const allSatisfied = satisfaction.every((value) => value === 1);
        evaluatedConstraints.push({
          prepared: prepared.constraint,
          residuals,
          nominalSatisfied,
          allSatisfied,
          status: allSatisfied
            ? ("green" as const)
            : nominalSatisfied
              ? ("yellow" as const)
              : ("red" as const),
        });
      }
    } catch (error) {
      throw new OptimizationEvaluationError(
        "numeric_domain",
        error instanceof Error
          ? error.message
          : "A constraint failed for this candidate vector.",
      );
    }

    const scalarConstraints = [];
    const zIndex = description.decisionVariables.findIndex(
      (variable) => variable.component === "auxiliary",
    );
    const z = decisionVector[zIndex]!;
    for (const variable of description.decisionVariables) {
      if (variable.component !== "tolerance") continue;
      const toleranceIndex = description.decisionVariables.indexOf(variable);
      const residual = z - decisionVector[toleranceIndex]!;
      scalarConstraints.push({
        id: `aux:${variable.baseVariableId}`,
        residual,
        allowedError: 0,
        violation: Math.max(0, residual),
      });
    }

    for (const constraint of evaluatedConstraints) {
      const residualEvaluation = constraint.residuals;
      for (
        let index = 0;
        index < residualEvaluation.residuals.length;
        index += 1
      ) {
        const residual = normalizeDeltaQuantityToSi({
          value: residualEvaluation.residuals[index]!,
          unit: residualEvaluation.unit,
        }).value;
        const allowedError = normalizeDeltaQuantityToSi({
          value: residualEvaluation.allowedEqualityError[index]!,
          unit: residualEvaluation.unit,
        }).value;
        scalarConstraints.push({
          id: `${constraint.prepared.id}:${index}`,
          residual,
          allowedError,
          violation:
            constraint.prepared.parsed.operator === "=="
              ? Math.max(0, Math.abs(residual) - allowedError)
              : Math.max(0, residual),
        });
      }
    }
    if (
      scalarConstraints.some(
        (constraint) => !Number.isFinite(constraint.residual),
      )
    ) {
      throw new OptimizationEvaluationError(
        "numeric_domain",
        "A scalar constraint returned a non-finite value.",
      );
    }
    const maximumViolation = scalarConstraints.reduce(
      (maximum, constraint) => Math.max(maximum, constraint.violation),
      0,
    );
    return {
      objectiveValue: z,
      scalarConstraints,
      feasible: maximumViolation === 0,
      maximumViolation,
      state: {
        baseVariables,
        derivedVariables: evaluatedDerived.map((variable) => ({
          id: variable.prepared.id,
          name: variable.prepared.name,
          expression: variable.prepared.expression,
          unit: variable.result.unit,
          minimum: variable.summary.minimum.value,
          nominal: variable.summary.nominal.value,
          maximum: variable.summary.maximum.value,
          combinationCount: variable.result.values.length,
        })),
        constraints: evaluatedConstraints.map((constraint) => ({
          id: constraint.prepared.id,
          source: constraint.prepared.source,
          status: constraint.status,
          nominalSatisfied: constraint.nominalSatisfied,
          allSatisfied: constraint.allSatisfied,
        })),
      },
    };
  };
}

function buildCompiledProblem(
  description: OptimizationProblemDescription,
): CompiledOptimizationProblem {
  const evaluator = createEvaluator(description);
  return {
    description,
    evaluate(decisionVector) {
      return evaluator(decisionVector);
    },
    createEvaluationSession(overrides): EvaluationSession {
      const safeguards = mergeSafeguards({
        ...description.safeguards,
        ...overrides,
      });
      const startedAt = performance.now();
      let evaluations = 0;
      return {
        get evaluations() {
          return evaluations;
        },
        get elapsedMs() {
          return performance.now() - startedAt;
        },
        evaluate(decisionVector) {
          const elapsed = performance.now() - startedAt;
          if (elapsed >= safeguards.timeLimitMs) {
            throw new OptimizationEvaluationError(
              "timed_out",
              `Optimization exceeded its ${safeguards.timeLimitMs} ms time limit.`,
            );
          }
          if (evaluations >= safeguards.evaluationLimit) {
            throw new OptimizationEvaluationError(
              "evaluation_limit",
              `Optimization exceeded its ${safeguards.evaluationLimit} evaluation limit.`,
            );
          }
          evaluations += 1;
          const result = evaluator(decisionVector, safeguards);
          if (performance.now() - startedAt >= safeguards.timeLimitMs) {
            throw new OptimizationEvaluationError(
              "timed_out",
              `Optimization exceeded its ${safeguards.timeLimitMs} ms time limit.`,
            );
          }
          return result;
        },
      };
    },
  };
}

export function compileOptimizationProblem(
  input: OptimizationCompileInput,
): CompiledOptimizationProblem {
  const selected = validateSelection(
    input.baseVariables,
    input.selectedBaseVariableIds,
  );
  const equalityTolerance =
    input.equalityTolerance ?? provisionalEqualityTolerance;
  const safeguards = mergeSafeguards(input.safeguards);
  const decisionVariables = buildDecisionVariables(selected);
  const initialDecisionVector = decisionVariables.map(
    (variable) => variable.initialValue,
  );
  const auxiliaryConstraints: ScalarConstraintDescription[] = selected.map(
    (variable) => ({
      id: `aux:${variable.id}`,
      sourceConstraintId: null,
      source: `minimum selected tolerance <= ${variable.name} tolerance`,
      kind: "inequality",
      flatIndex: 0,
      coordinate: {},
      normalizedUnit: normalizedTolerance(variable).unit,
    }),
  );
  const userConstraints: ScalarConstraintDescription[] =
    input.constraints.flatMap((constraint) =>
      Array.from(
        { length: constraint.evaluation.values.length },
        (_, flatIndex) => ({
          id: `${constraint.id}:${flatIndex}`,
          sourceConstraintId: constraint.id,
          source: constraint.source,
          kind: constraint.parsed.operator === "==" ? "equality" : "inequality",
          flatIndex,
          coordinate: scalarCoordinate(
            constraint.evaluation.axisIds,
            flatIndex,
            input.baseVariables,
          ),
          normalizedUnit: null,
        }),
      ),
    );
  const description: OptimizationProblemDescription = {
    schemaVersion: 1,
    objective: {
      id: MAX_MIN_OBJECTIVE_ID,
      label: MAX_MIN_OBJECTIVE_LABEL,
      direction: "maximize",
      auxiliaryVariableId,
    },
    decisionVariables,
    initialDecisionVector,
    constraints: [...auxiliaryConstraints, ...userConstraints],
    selectedBaseVariableIds: [...input.selectedBaseVariableIds],
    equalityTolerance,
    safeguards,
    sourceModel: {
      baseVariables: input.baseVariables.map(serializeBaseVariable),
      derivedVariables: input.derivedVariables.map((variable) => ({
        id: variable.id,
        name: variable.name,
        expression: variable.expression,
      })),
      constraints: input.constraints.map((constraint) => ({
        id: constraint.id,
        source: constraint.source,
      })),
    },
  };
  const compiled = buildCompiledProblem(description);
  compiled.evaluate(initialDecisionVector);
  return compiled;
}

export function hydrateOptimizationProblem(
  description: OptimizationProblemDescription,
): CompiledOptimizationProblem {
  if (description.schemaVersion !== 1) {
    throw new OptimizationEvaluationError(
      "invalid_problem",
      `Unsupported optimization problem schema version: ${String(description.schemaVersion)}.`,
    );
  }
  return buildCompiledProblem(description);
}

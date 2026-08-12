import type { ValidatedBaseVariable } from "../domain/stage1";
import {
  ExpressionEngineError,
  convertScalarQuantity,
  mathJsExpressionEngine,
  type ExpressionEngine,
  type ExpressionSymbol,
  type NumericExpressionPlan,
  type ScalarQuantity,
  type ValidatedExpression,
} from "./expression";

export type AxisId = string;
export type AxisCoordinate = 0 | 1 | 2;

export interface NamedAxisValue {
  readonly axisIds: readonly AxisId[];
  readonly values: Float64Array;
  readonly unit: string | null;
}

export interface NamedAxisSummary {
  readonly minimum: ScalarQuantity;
  readonly nominal: ScalarQuantity;
  readonly maximum: ScalarQuantity;
}

export interface NamedAxisEvaluationOptions {
  readonly engine?: ExpressionEngine;
  readonly axisLabels?: ReadonlyMap<AxisId, string>;
  readonly numericPlan?: NumericExpressionPlan;
}

const coordinateNames = ["min", "nom", "max"] as const;

export class NamedAxisEvaluationError extends Error {
  readonly coordinate: ReadonlyMap<AxisId, AxisCoordinate>;
  readonly original: unknown;

  constructor(
    message: string,
    coordinate: ReadonlyMap<AxisId, AxisCoordinate>,
    original: unknown,
  ) {
    super(message);
    this.name = "NamedAxisEvaluationError";
    this.coordinate = coordinate;
    this.original = original;
  }
}

export function namedAxisLength(axisCount: number): number {
  return 3 ** axisCount;
}

export function namedAxisStrides(axisCount: number): readonly number[] {
  return Array.from(
    { length: axisCount },
    (_, index) => 3 ** (axisCount - index - 1),
  );
}

export function coordinatesForFlatIndex(
  index: number,
  axisCount: number,
): readonly AxisCoordinate[] {
  return namedAxisStrides(axisCount).map(
    (stride) => Math.floor(index / stride) % 3,
  ) as readonly AxisCoordinate[];
}

export function flatIndexForCoordinates(
  coordinates: readonly AxisCoordinate[],
): number {
  const strides = namedAxisStrides(coordinates.length);
  return coordinates.reduce<number>(
    (index, coordinate, axis) => index + coordinate * (strides[axis] ?? 0),
    0,
  );
}

export function unionAxisIds(
  values: readonly NamedAxisValue[],
): readonly AxisId[] {
  const result: AxisId[] = [];
  for (const value of values) {
    for (const axisId of value.axisIds) {
      if (!result.includes(axisId)) result.push(axisId);
    }
  }
  return result;
}

export function projectFlatIndex(
  resultAxisIds: readonly AxisId[],
  resultCoordinates: readonly AxisCoordinate[],
  operandAxisIds: readonly AxisId[],
): number {
  const projected = operandAxisIds.map((axisId) => {
    const resultIndex = resultAxisIds.indexOf(axisId);
    if (resultIndex < 0) {
      throw new Error(`Axis “${axisId}” is not present in the result axes.`);
    }
    return resultCoordinates[resultIndex] ?? 0;
  });
  return flatIndexForCoordinates(projected);
}

export function nominalFlatIndex(axisCount: number): number {
  return flatIndexForCoordinates(new Array<AxisCoordinate>(axisCount).fill(1));
}

export function summarizeNamedAxisValue(
  value: NamedAxisValue,
): NamedAxisSummary {
  if (value.values.length === 0) {
    throw new Error("Cannot summarize an empty named-axis value.");
  }

  let minimum = value.values[0]!;
  let maximum = value.values[0]!;
  for (const entry of value.values) {
    minimum = Math.min(minimum, entry);
    maximum = Math.max(maximum, entry);
  }

  return {
    minimum: { value: minimum, unit: value.unit },
    nominal: {
      value: value.values[nominalFlatIndex(value.axisIds.length)]!,
      unit: value.unit,
    },
    maximum: { value: maximum, unit: value.unit },
  };
}

export function namedAxisFromBaseVariable(
  variable: ValidatedBaseVariable,
): NamedAxisValue {
  return {
    axisIds: [variable.id],
    values: new Float64Array([
      variable.threePoint.minimum,
      variable.threePoint.nominal,
      variable.threePoint.maximum,
    ]),
    unit: variable.unit === "1" ? null : variable.unit,
  };
}

export function expressionSymbolsFromNamedScope(
  scope: ReadonlyMap<string, NamedAxisValue>,
): readonly ExpressionSymbol[] {
  return [...scope].map(([name, value]) => ({
    name,
    nominal: {
      value: value.values[nominalFlatIndex(value.axisIds.length)]!,
      unit: value.unit,
    },
  }));
}

function describeCoordinate(
  axisIds: readonly AxisId[],
  coordinates: readonly AxisCoordinate[],
  labels: ReadonlyMap<AxisId, string>,
): string {
  if (axisIds.length === 0) return "the scalar case";
  return axisIds
    .map(
      (axisId, index) =>
        `${labels.get(axisId) ?? axisId} = ${coordinateNames[coordinates[index] ?? 0]}`,
    )
    .join(", ");
}

function evaluationMessage(error: unknown): string {
  if (error instanceof ExpressionEngineError) return error.message;
  return error instanceof Error
    ? error.message
    : "Expression evaluation failed.";
}

export function evaluateNamedExpression(
  validated: ValidatedExpression,
  scope: ReadonlyMap<string, NamedAxisValue>,
  options: NamedAxisEvaluationOptions = {},
): NamedAxisValue {
  const engine = options.engine ?? mathJsExpressionEngine;
  const labels = options.axisLabels ?? new Map<AxisId, string>();
  const dependencyValues = validated.dependencies.map((name) => {
    const value = scope.get(name);
    if (!value) throw new Error(`Missing named-axis value for “${name}”.`);
    return value;
  });
  const axisIds = unionAxisIds(dependencyValues);
  const length = namedAxisLength(axisIds.length);
  const values = new Float64Array(length);
  let resultUnit = options.numericPlan?.outputUnit;

  for (let flatIndex = 0; flatIndex < length; flatIndex += 1) {
    const coordinates = coordinatesForFlatIndex(flatIndex, axisIds.length);
    const scalarScope = new Map<string, ScalarQuantity>();

    for (let index = 0; index < validated.dependencies.length; index += 1) {
      const name = validated.dependencies[index]!;
      const operand = dependencyValues[index]!;
      const operandIndex = projectFlatIndex(
        axisIds,
        coordinates,
        operand.axisIds,
      );
      scalarScope.set(name, {
        value: operand.values[operandIndex]!,
        unit: operand.unit,
      });
    }

    try {
      const evaluated = options.numericPlan
        ? {
            value: options.numericPlan.evaluate(scalarScope),
            unit: options.numericPlan.outputUnit,
          }
        : engine.evaluateScalar(validated.parsed, scalarScope);
      resultUnit ??= evaluated.unit;
      values[flatIndex] = convertScalarQuantity(evaluated, resultUnit).value;
    } catch (error) {
      const coordinate = new Map<AxisId, AxisCoordinate>(
        axisIds.map((axisId, index) => [axisId, coordinates[index] ?? 0]),
      );
      throw new NamedAxisEvaluationError(
        `${evaluationMessage(error)} Encountered when ${describeCoordinate(
          axisIds,
          coordinates,
          labels,
        )}.`,
        coordinate,
        error,
      );
    }
  }

  return { axisIds, values, unit: resultUnit ?? null };
}

import {
  ExpressionEngineError,
  convertScalarQuantity,
  coordinatesForFlatIndex,
  evaluateNamedExpression,
  expressionSymbolsFromNamedScope,
  mathJsExpressionEngine,
  nominalFlatIndex,
  projectFlatIndex,
  unionAxisIds,
  type ExpressionEngine,
  type NamedAxisValue,
  type ParsedExpression,
  type ValidatedExpression,
} from "../math";

export type ConstraintOperator = "<=" | "==" | ">=";
export type ConstraintStatus = "green" | "yellow" | "red";
export type Stage3RowStatus = "empty" | "editing" | "valid" | "invalid";

export interface ParsedConstraint {
  readonly source: string;
  readonly operator: ConstraintOperator;
  readonly left: ParsedExpression;
  readonly right: ParsedExpression;
}

export interface ConstraintEvaluation {
  readonly axisIds: readonly string[];
  readonly values: Uint8Array;
  readonly nominalSatisfied: boolean;
  readonly allSatisfied: boolean;
  readonly status: ConstraintStatus;
}

export interface ConstraintResidualEvaluation {
  readonly axisIds: readonly string[];
  readonly residuals: Float64Array;
  readonly allowedEqualityError: Float64Array;
  readonly unit: string | null;
}

export interface CompiledConstraint {
  readonly parsed: ParsedConstraint;
  readonly left: ValidatedExpression;
  readonly right: ValidatedExpression;
}

export interface ValidatedConstraint {
  readonly id: string;
  readonly source: string;
  readonly parsed: ParsedConstraint;
  readonly evaluation: ConstraintEvaluation;
}

export interface Stage3Row {
  readonly id: string;
  readonly expression: string;
  readonly status: Stage3RowStatus;
  readonly error: string | undefined;
  readonly validated: ValidatedConstraint | undefined;
}

export interface Stage3ValidationResult {
  readonly rows: readonly Stage3Row[];
  readonly constraints: readonly ValidatedConstraint[];
  readonly isValid: boolean;
}

export interface EqualityTolerance {
  readonly absolute: number;
  readonly relative: number;
}

export const provisionalEqualityTolerance: EqualityTolerance = {
  absolute: 1e-12,
  relative: 1e-12,
};

let generatedConstraintRowNumber = 0;

export function createStage3Row(id?: string): Stage3Row {
  generatedConstraintRowNumber += 1;
  return {
    id: id ?? `constraint-${generatedConstraintRowNumber}`,
    expression: "",
    status: "empty",
    error: undefined,
    validated: undefined,
  };
}

export function updateStage3Row(row: Stage3Row, expression: string): Stage3Row {
  return { ...row, expression, status: "editing" };
}

function splitConstraint(source: string): {
  readonly left: string;
  readonly operator: ConstraintOperator;
  readonly right: string;
} {
  let depth = 0;
  const matches: { index: number; operator: ConstraintOperator }[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) {
      throw new ExpressionEngineError("syntax", "Parentheses are unbalanced.");
    }
    if (depth !== 0) continue;

    const pair = source.slice(index, index + 2);
    if (pair === "<=" || pair === "==" || pair === ">=") {
      matches.push({ index, operator: pair });
      index += 1;
    }
  }

  if (depth !== 0) {
    throw new ExpressionEngineError("syntax", "Parentheses are unbalanced.");
  }
  if (matches.length !== 1) {
    throw new ExpressionEngineError(
      "syntax",
      "Enter exactly one comparison using <=, ==, or >=.",
    );
  }

  const match = matches[0]!;
  const left = source.slice(0, match.index).trim();
  const right = source.slice(match.index + 2).trim();
  if (!left || !right) {
    throw new ExpressionEngineError(
      "syntax",
      "Enter an arithmetic expression on both sides of the comparison.",
    );
  }
  return { left, operator: match.operator, right };
}

export function parseConstraint(
  source: string,
  engine: ExpressionEngine = mathJsExpressionEngine,
): ParsedConstraint {
  const split = splitConstraint(source.trim());
  return {
    source,
    operator: split.operator,
    left: engine.parse(split.left),
    right: engine.parse(split.right),
  };
}

export function evaluateConstraint(
  parsed: ParsedConstraint,
  scope: ReadonlyMap<string, NamedAxisValue>,
  engine: ExpressionEngine = mathJsExpressionEngine,
  equalityTolerance: EqualityTolerance = provisionalEqualityTolerance,
): ConstraintEvaluation {
  const residualEvaluation = evaluateConstraintResiduals(
    parsed,
    scope,
    engine,
    equalityTolerance,
  );
  const { axisIds, residuals, allowedEqualityError } = residualEvaluation;
  const values = new Uint8Array(residuals.length);
  for (let index = 0; index < residuals.length; index += 1) {
    const residual = residuals[index]!;
    values[index] =
      parsed.operator === "=="
        ? Math.abs(residual) <= allowedEqualityError[index]!
          ? 1
          : 0
        : residual <= 0
          ? 1
          : 0;
  }

  const nominalSatisfied = values[nominalFlatIndex(axisIds.length)] === 1;
  const allSatisfied = values.every((value) => value === 1);
  return {
    axisIds,
    values,
    nominalSatisfied,
    allSatisfied,
    status: allSatisfied ? "green" : nominalSatisfied ? "yellow" : "red",
  };
}

export function evaluateConstraintResiduals(
  parsed: ParsedConstraint,
  scope: ReadonlyMap<string, NamedAxisValue>,
  engine: ExpressionEngine = mathJsExpressionEngine,
  equalityTolerance: EqualityTolerance = provisionalEqualityTolerance,
): ConstraintResidualEvaluation {
  const symbols = expressionSymbolsFromNamedScope(scope);
  return evaluateCompiledConstraintResiduals(
    {
      parsed,
      left: engine.validate(parsed.left, symbols),
      right: engine.validate(parsed.right, symbols),
    },
    scope,
    engine,
    equalityTolerance,
  );
}

export function compileConstraint(
  parsed: ParsedConstraint,
  scope: ReadonlyMap<string, NamedAxisValue>,
  engine: ExpressionEngine = mathJsExpressionEngine,
): CompiledConstraint {
  const symbols = expressionSymbolsFromNamedScope(scope);
  return {
    parsed,
    left: engine.validate(parsed.left, symbols),
    right: engine.validate(parsed.right, symbols),
  };
}

export function evaluateCompiledConstraintResiduals(
  compiled: CompiledConstraint,
  scope: ReadonlyMap<string, NamedAxisValue>,
  engine: ExpressionEngine = mathJsExpressionEngine,
  equalityTolerance: EqualityTolerance = provisionalEqualityTolerance,
): ConstraintResidualEvaluation {
  const parsed = compiled.parsed;
  const axisLabels = new Map<string, string>();
  for (const [name, value] of scope) {
    if (value.axisIds.length === 1 && !axisLabels.has(value.axisIds[0]!)) {
      axisLabels.set(value.axisIds[0]!, name);
    }
  }
  const left = evaluateNamedExpression(compiled.left, scope, {
    engine,
    axisLabels,
  });
  const right = evaluateNamedExpression(compiled.right, scope, {
    engine,
    axisLabels,
  });
  const axisIds = unionAxisIds([left, right]);
  const residuals = new Float64Array(3 ** axisIds.length);
  const allowedEqualityError = new Float64Array(residuals.length);

  for (let flatIndex = 0; flatIndex < residuals.length; flatIndex += 1) {
    const coordinates = coordinatesForFlatIndex(flatIndex, axisIds.length);
    const leftValue =
      left.values[projectFlatIndex(axisIds, coordinates, left.axisIds)]!;
    const rightValue =
      right.values[projectFlatIndex(axisIds, coordinates, right.axisIds)]!;
    const convertedRight = convertScalarQuantity(
      { value: rightValue, unit: right.unit },
      left.unit,
    ).value;
    residuals[flatIndex] =
      parsed.operator === ">="
        ? convertedRight - leftValue
        : leftValue - convertedRight;
    if (parsed.operator === "==") {
      allowedEqualityError[flatIndex] = Math.max(
        equalityTolerance.absolute,
        equalityTolerance.relative *
          Math.max(Math.abs(leftValue), Math.abs(convertedRight)),
      );
    }
  }
  return { axisIds, residuals, allowedEqualityError, unit: left.unit };
}

export function validateStage3Rows(
  rows: readonly Stage3Row[],
  scope: ReadonlyMap<string, NamedAxisValue>,
  engine: ExpressionEngine = mathJsExpressionEngine,
  equalityTolerance: EqualityTolerance = provisionalEqualityTolerance,
): Stage3ValidationResult {
  const constraints: ValidatedConstraint[] = [];
  const validatedRows = rows.map((row): Stage3Row => {
    if (row.expression.trim().length === 0) {
      return {
        ...row,
        status: "empty",
        error: undefined,
        validated: undefined,
      };
    }

    try {
      const parsed = parseConstraint(row.expression, engine);
      const evaluation = evaluateConstraint(
        parsed,
        scope,
        engine,
        equalityTolerance,
      );
      const validated = {
        id: row.id,
        source: row.expression.trim(),
        parsed,
        evaluation,
      } satisfies ValidatedConstraint;
      constraints.push(validated);
      return {
        ...row,
        status: "valid",
        error: undefined,
        validated,
      };
    } catch (error) {
      return {
        ...row,
        status: "invalid",
        error:
          error instanceof Error
            ? error.message
            : "Constraint validation failed.",
        validated: undefined,
      };
    }
  });

  return {
    rows: validatedRows,
    constraints,
    isValid: validatedRows.every((row) => row.status !== "invalid"),
  };
}

export function reorderStage3Rows(
  rows: readonly Stage3Row[],
  activeId: string,
  overId: string,
): readonly Stage3Row[] {
  const oldIndex = rows.findIndex((row) => row.id === activeId);
  const newIndex = rows.findIndex((row) => row.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return rows;
  const reordered = [...rows];
  const [moved] = reordered.splice(oldIndex, 1);
  if (!moved) return rows;
  reordered.splice(newIndex, 0, moved);
  return reordered;
}

import {
  ExpressionEngineError,
  NamedAxisEvaluationError,
  evaluateNamedExpression,
  expressionSymbolsFromNamedScope,
  mathJsExpressionEngine,
  namedAxisFromBaseVariable,
  summarizeNamedAxisValue,
  type ExpressionEngine,
  type NamedAxisSummary,
  type NamedAxisValue,
  type ParsedExpression,
  type ValidatedExpression,
} from "../math";
import { isPortableIdentifier, type ValidatedBaseVariable } from "./stage1";

export type Stage2RowStatus = "empty" | "editing" | "valid" | "invalid";

export interface Stage2RowErrors {
  readonly name?: string;
  readonly expression?: string;
}

export interface ValidatedDerivedVariable {
  readonly id: string;
  readonly name: string;
  readonly expression: string;
  readonly parsed: ParsedExpression;
  readonly validation: ValidatedExpression;
  readonly result: NamedAxisValue;
  readonly summary: NamedAxisSummary;
}

export interface Stage2Row {
  readonly id: string;
  readonly name: string;
  readonly expression: string;
  readonly status: Stage2RowStatus;
  readonly errors: Stage2RowErrors;
  readonly validated: ValidatedDerivedVariable | undefined;
}

export interface Stage2ValidationResult {
  readonly rows: readonly Stage2Row[];
  readonly variables: readonly ValidatedDerivedVariable[];
  readonly scope: ReadonlyMap<string, NamedAxisValue>;
  readonly isValid: boolean;
}

let generatedDerivedRowNumber = 0;

export function createStage2Row(id?: string): Stage2Row {
  generatedDerivedRowNumber += 1;
  return {
    id: id ?? `expression-${generatedDerivedRowNumber}`,
    name: "",
    expression: "",
    status: "empty",
    errors: {},
    validated: undefined,
  };
}

export function createInitialStage2Rows(): readonly Stage2Row[] {
  return [createStage2Row()];
}

export function updateStage2Row(
  row: Stage2Row,
  field: "name" | "expression",
  value: string,
): Stage2Row {
  return { ...row, [field]: value, status: "editing" };
}

export function isStage2RowEmpty(row: Stage2Row): boolean {
  return row.name.trim().length === 0 && row.expression.trim().length === 0;
}

function errorMessage(
  error: unknown,
  allDerivedNames: ReadonlySet<string>,
): string {
  if (
    error instanceof ExpressionEngineError &&
    error.code === "unknown_symbol" &&
    error.symbol &&
    allDerivedNames.has(error.symbol)
  ) {
    return `“${error.symbol}” is not available here. Derived variables may reference only earlier valid rows.`;
  }
  if (error instanceof Error) return error.message;
  return "Expression validation failed.";
}

export function validateStage2Rows(
  rows: readonly Stage2Row[],
  baseVariables: readonly ValidatedBaseVariable[],
  engine: ExpressionEngine = mathJsExpressionEngine,
): Stage2ValidationResult {
  const scope = new Map<string, NamedAxisValue>();
  const axisLabels = new Map<string, string>();
  for (const variable of baseVariables) {
    scope.set(variable.name, namedAxisFromBaseVariable(variable));
    axisLabels.set(variable.id, variable.name);
  }

  const allDerivedNames = new Set(
    rows
      .filter((row) => !isStage2RowEmpty(row))
      .map((row) => row.name.trim())
      .filter(Boolean),
  );
  const derivedNameCounts = new Map<string, number>();
  for (const name of allDerivedNames) {
    derivedNameCounts.set(
      name,
      rows.filter((row) => row.name.trim() === name).length,
    );
  }
  const baseNames = new Set(baseVariables.map((variable) => variable.name));
  const variables: ValidatedDerivedVariable[] = [];

  const validatedRows = rows.map((row): Stage2Row => {
    if (isStage2RowEmpty(row)) {
      return { ...row, status: "empty", errors: {}, validated: undefined };
    }

    const errors: { name?: string; expression?: string } = {};
    const name = row.name.trim();
    const expression = row.expression.trim();

    if (!name) {
      errors.name = "Enter a derived-variable name.";
    } else if (!isPortableIdentifier(name)) {
      errors.name =
        "Use letters, numbers, and underscores, beginning with a letter or underscore.";
    } else if (baseNames.has(name) || (derivedNameCounts.get(name) ?? 0) > 1) {
      errors.name = `“${name}” is already used by another variable.`;
    }

    if (!expression) errors.expression = "Enter an arithmetic expression.";

    if (errors.name || errors.expression) {
      return { ...row, status: "invalid", errors, validated: undefined };
    }

    try {
      const parsed = engine.parse(expression);
      const validation = engine.validate(
        parsed,
        expressionSymbolsFromNamedScope(scope),
      );
      const result = evaluateNamedExpression(validation, scope, {
        engine,
        axisLabels,
      });
      const summary: NamedAxisSummary = summarizeNamedAxisValue(result);
      const validated: ValidatedDerivedVariable = {
        id: row.id,
        name,
        expression,
        parsed,
        validation,
        result,
        summary,
      };
      scope.set(name, result);
      variables.push(validated);
      return { ...row, status: "valid", errors: {}, validated };
    } catch (error) {
      return {
        ...row,
        status: "invalid",
        errors: {
          expression: errorMessage(error, allDerivedNames),
        },
        validated: undefined,
      };
    }
  });

  return {
    rows: validatedRows,
    variables,
    scope,
    isValid: validatedRows.every((row) => row.status !== "invalid"),
  };
}

export function reorderStage2Rows(
  rows: readonly Stage2Row[],
  activeId: string,
  overId: string,
): readonly Stage2Row[] {
  const oldIndex = rows.findIndex((row) => row.id === activeId);
  const newIndex = rows.findIndex((row) => row.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return rows;
  const reordered = [...rows];
  const [moved] = reordered.splice(oldIndex, 1);
  if (!moved) return rows;
  reordered.splice(newIndex, 0, moved);
  return reordered;
}

export { NamedAxisEvaluationError };

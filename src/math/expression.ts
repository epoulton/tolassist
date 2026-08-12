import {
  ConstantNode,
  Unit,
  isComplex,
  isConstantNode,
  isFunctionNode,
  isOperatorNode,
  isParenthesisNode,
  isSymbolNode,
  isUnit,
  parse,
  unit,
  type EvalFunction,
  type MathNode,
} from "mathjs";

export interface ScalarQuantity {
  readonly value: number;
  readonly unit: string | null;
}

export interface ExpressionSymbol {
  readonly name: string;
  readonly nominal: ScalarQuantity;
}

export interface ExpressionHelpContent {
  readonly syntax: string;
  readonly operators: readonly string[];
  readonly functions: readonly string[];
  readonly constants: readonly string[];
  readonly restrictions: readonly string[];
}

export type ExpressionErrorCode =
  | "syntax"
  | "unsupported_syntax"
  | "unknown_symbol"
  | "dimension"
  | "domain"
  | "non_finite"
  | "unsupported_result";

export class ExpressionEngineError extends Error {
  readonly code: ExpressionErrorCode;
  readonly symbol: string | undefined;

  constructor(code: ExpressionErrorCode, message: string, symbol?: string) {
    super(message);
    this.name = "ExpressionEngineError";
    this.code = code;
    this.symbol = symbol;
  }
}

export interface ParsedExpression {
  readonly source: string;
  readonly normalizedSource: string;
  readonly symbols: readonly string[];
  readonly node: MathNode;
  readonly compiled: EvalFunction;
}

export interface ValidatedExpression {
  readonly parsed: ParsedExpression;
  readonly dependencies: readonly string[];
  readonly nominalResult: ScalarQuantity;
}

export interface NumericExpressionPlan {
  readonly dependencies: readonly string[];
  readonly outputUnit: string | null;
  evaluate(scope: ReadonlyMap<string, ScalarQuantity>): number;
}

export interface ExpressionEngine {
  parse(source: string): ParsedExpression;
  validate(
    parsed: ParsedExpression,
    symbols: readonly ExpressionSymbol[],
  ): ValidatedExpression;
  evaluateScalar(
    parsed: ParsedExpression,
    scope: ReadonlyMap<string, ScalarQuantity>,
  ): ScalarQuantity;
  compileNumericPlan(
    validated: ValidatedExpression,
    symbols: readonly ExpressionSymbol[],
  ): NumericExpressionPlan;
  describeRules(): ExpressionHelpContent;
}

const allowedOperators = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "pow",
  "unaryPlus",
  "unaryMinus",
]);

const allowedFunctions = new Set([
  "abs",
  "sqrt",
  "cbrt",
  "exp",
  "log",
  "log10",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "sign",
]);

const allowedConstants = new Set(["pi", "e"]);

function messageFrom(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Expression evaluation failed.";
}

function classifyEvaluationError(error: unknown): ExpressionEngineError {
  if (error instanceof ExpressionEngineError) return error;

  const message = messageFrom(error);
  const isDimensional = /unit|dimension|base/i.test(message);
  return new ExpressionEngineError(
    isDimensional ? "dimension" : "domain",
    message,
  );
}

function isFunctionNameNode(node: MathNode, parent: MathNode): boolean {
  return isFunctionNode(parent) && parent.fn === node;
}

function inspectRestrictedTree(node: MathNode): readonly string[] {
  const symbols: string[] = [];

  node.traverse((child, _path, parent) => {
    if (isOperatorNode(child)) {
      if (!allowedOperators.has(child.fn)) {
        throw new ExpressionEngineError(
          "unsupported_syntax",
          `The “${child.op}” operator is not available in arithmetic expressions.`,
        );
      }
      return;
    }

    if (isFunctionNode(child)) {
      if (!isSymbolNode(child.fn) || !allowedFunctions.has(child.fn.name)) {
        const name = isSymbolNode(child.fn) ? child.fn.name : "this function";
        throw new ExpressionEngineError(
          "unsupported_syntax",
          `The function “${name}” is not supported.`,
        );
      }
      return;
    }

    if (isSymbolNode(child)) {
      if (!isFunctionNameNode(child, parent) && !symbols.includes(child.name)) {
        symbols.push(child.name);
      }
      return;
    }

    if (isConstantNode(child)) {
      if (typeof child.value !== "number") {
        throw new ExpressionEngineError(
          "unsupported_syntax",
          "Only numeric literals are supported.",
        );
      }
      return;
    }

    if (isParenthesisNode(child)) return;

    throw new ExpressionEngineError(
      "unsupported_syntax",
      `The ${child.type} construct is not supported. Use a single arithmetic expression.`,
    );
  });

  return symbols;
}

function toMathValue(quantity: ScalarQuantity): number | Unit {
  return quantity.unit === null
    ? quantity.value
    : unit(quantity.value, quantity.unit);
}

function fromMathValue(value: unknown): ScalarQuantity {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ExpressionEngineError(
        "non_finite",
        "The expression returned a non-finite value.",
      );
    }
    return { value, unit: null };
  }

  if (isUnit(value)) {
    const normalized = value.toSI();
    const numeric = normalized.value;
    if (!Number.isFinite(numeric)) {
      throw new ExpressionEngineError(
        "non_finite",
        "The expression returned a non-finite value.",
      );
    }
    return { value: numeric, unit: normalized.formatUnits() || null };
  }

  if (isComplex(value)) {
    throw new ExpressionEngineError(
      "domain",
      "The expression returned a complex value outside the real-number domain.",
    );
  }

  throw new ExpressionEngineError(
    "unsupported_result",
    "The expression must return one real scalar quantity.",
  );
}

export function convertScalarQuantity(
  quantity: ScalarQuantity,
  targetUnit: string | null,
): ScalarQuantity {
  if (quantity.unit === targetUnit) return quantity;
  if (quantity.unit === null || targetUnit === null) {
    throw new ExpressionEngineError(
      "dimension",
      "Dimensionless and dimensioned results cannot be combined.",
    );
  }

  try {
    return {
      value: unit(quantity.value, quantity.unit).toNumber(targetUnit),
      unit: targetUnit,
    };
  } catch (error) {
    throw classifyEvaluationError(error);
  }
}

export function normalizeAbsoluteQuantityToSi(
  quantity: ScalarQuantity,
): ScalarQuantity {
  if (quantity.unit === null) return quantity;
  try {
    const normalized = unit(quantity.value, quantity.unit).toSI();
    return {
      value: normalized.value,
      unit: normalized.formatUnits() || null,
    };
  } catch (error) {
    throw classifyEvaluationError(error);
  }
}

export function normalizeDeltaQuantityToSi(
  quantity: ScalarQuantity,
): ScalarQuantity {
  if (quantity.unit === null) return quantity;
  try {
    const zero = unit(0, quantity.unit).toSI();
    const one = unit(1, quantity.unit).toSI();
    return {
      value: quantity.value * (one.value - zero.value),
      unit: one.formatUnits() || null,
    };
  } catch (error) {
    throw classifyEvaluationError(error);
  }
}

export function convertAbsoluteQuantityFromSi(
  quantity: ScalarQuantity,
  targetUnit: string | null,
): ScalarQuantity {
  return convertScalarQuantity(quantity, targetUnit);
}

export function convertDeltaQuantityFromSi(
  quantity: ScalarQuantity,
  targetUnit: string | null,
): ScalarQuantity {
  if (quantity.unit === null && targetUnit === null) return quantity;
  if (quantity.unit === null || targetUnit === null) {
    throw new ExpressionEngineError(
      "dimension",
      "Dimensionless and dimensioned quantities cannot be converted.",
    );
  }
  try {
    const zero = unit(0, targetUnit).toSI();
    const one = unit(1, targetUnit).toSI();
    const scale = one.value - zero.value;
    return { value: quantity.value / scale, unit: targetUnit };
  } catch (error) {
    throw classifyEvaluationError(error);
  }
}

export function unitsAreCompatible(
  left: string | null,
  right: string | null,
): boolean {
  if (left === null || right === null) return left === right;
  try {
    return unit(1, left).equalBase(unit(1, right));
  } catch {
    return false;
  }
}

function quantityToSiNumber(quantity: ScalarQuantity): number {
  return quantity.unit === null
    ? quantity.value
    : unit(quantity.value, quantity.unit).toSI().value;
}

function unitScaleToSi(name: string): number {
  const zero = unit(0, name).toSI().value;
  if (zero !== 0) {
    throw new ExpressionEngineError(
      "unsupported_syntax",
      `The offset unit “${name}” requires direct unit-aware evaluation.`,
    );
  }
  return unit(1, name).toSI().value;
}

export class MathJsExpressionEngine implements ExpressionEngine {
  parse(source: string): ParsedExpression {
    if (source.trim().length === 0) {
      throw new ExpressionEngineError("syntax", "Enter an expression.");
    }

    try {
      const node = parse(source);
      const symbols = inspectRestrictedTree(node);
      return {
        source,
        normalizedSource: node.toString(),
        symbols,
        node,
        compiled: node.compile(),
      };
    } catch (error) {
      if (error instanceof ExpressionEngineError) throw error;
      throw new ExpressionEngineError("syntax", messageFrom(error));
    }
  }

  validate(
    parsed: ParsedExpression,
    symbols: readonly ExpressionSymbol[],
  ): ValidatedExpression {
    const available = new Map(symbols.map((symbol) => [symbol.name, symbol]));
    const dependencies: string[] = [];

    for (const name of parsed.symbols) {
      if (available.has(name)) continue;
      if (allowedConstants.has(name) || Unit.isValuelessUnit(name)) continue;
      throw new ExpressionEngineError(
        "unknown_symbol",
        `“${name}” is not an available variable, constant, or unit.`,
        name,
      );
    }

    for (const symbol of symbols) {
      if (parsed.symbols.includes(symbol.name)) dependencies.push(symbol.name);
    }

    const nominalScope = new Map(
      dependencies.map((name) => [name, available.get(name)!.nominal]),
    );
    const nominalResult = this.evaluateScalar(parsed, nominalScope);

    return { parsed, dependencies, nominalResult };
  }

  evaluateScalar(
    parsed: ParsedExpression,
    scope: ReadonlyMap<string, ScalarQuantity>,
  ): ScalarQuantity {
    const mathScope = new Map<string, number | Unit>();
    for (const [name, quantity] of scope) {
      mathScope.set(name, toMathValue(quantity));
    }

    try {
      const evaluated: unknown = parsed.compiled.evaluate(mathScope);
      return fromMathValue(evaluated);
    } catch (error) {
      const message = messageFrom(error);
      const hasDimensionedInput =
        [...scope.values()].some((quantity) => quantity.unit !== null) ||
        parsed.symbols.some((name) => Unit.isValuelessUnit(name));
      if (hasDimensionedInput && /function (?:log|log10|exp)/i.test(message)) {
        throw new ExpressionEngineError(
          "dimension",
          "Logarithmic and exponential functions require dimensionless arguments.",
        );
      }
      throw classifyEvaluationError(error);
    }
  }

  compileNumericPlan(
    validated: ValidatedExpression,
    symbols: readonly ExpressionSymbol[],
  ): NumericExpressionPlan {
    const variableNames = new Set(symbols.map((symbol) => symbol.name));
    const numericNode = validated.parsed.node.transform((node) => {
      if (
        isSymbolNode(node) &&
        !variableNames.has(node.name) &&
        Unit.isValuelessUnit(node.name)
      ) {
        return new ConstantNode(unitScaleToSi(node.name));
      }
      return node;
    });
    const compiled = numericNode.compile();

    return {
      dependencies: validated.dependencies,
      outputUnit: validated.nominalResult.unit,
      evaluate(scope) {
        const numericScope = new Map<string, number>();
        for (const [name, quantity] of scope) {
          numericScope.set(name, quantityToSiNumber(quantity));
        }
        const result: unknown = compiled.evaluate(numericScope);
        if (typeof result !== "number" || !Number.isFinite(result)) {
          throw new ExpressionEngineError(
            "non_finite",
            "The normalized expression returned a non-finite value.",
          );
        }
        return result;
      },
    };
  }

  describeRules(): ExpressionHelpContent {
    return {
      syntax:
        "math.js arithmetic syntax with ^ for powers and implicit multiplication for dimensioned literals such as 25.4 mm.",
      operators: ["+", "−", "×", "÷", "^", "parentheses"],
      functions: [...allowedFunctions],
      constants: [...allowedConstants],
      restrictions: [
        "One scalar arithmetic expression only",
        "No assignment, collections, property access, comparisons, or user-defined functions",
        "Logarithms require dimensionless arguments",
        "Complex and non-finite results are rejected",
      ],
    };
  }
}

export const mathJsExpressionEngine = new MathJsExpressionEngine();

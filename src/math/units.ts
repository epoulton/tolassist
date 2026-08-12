export interface ParsedUnit {
  readonly source: string;
  readonly canonical: string;
}

export type UnitParseResult =
  | { readonly ok: true; readonly unit: ParsedUnit }
  | { readonly ok: false; readonly message: string };

export interface UnitParser {
  parse(source: string): UnitParseResult;
}

const supportedUnitCharacters =
  /^[A-Za-z0-9\s*/^().\-+\u00b5\u03bc\u00b0\u03a9·]+$/u;

function hasBalancedParentheses(source: string): boolean {
  let depth = 0;

  for (const character of source) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) return false;
  }

  return depth === 0;
}

/**
 * Phase 1's deliberately small unit boundary. It validates and normalizes unit
 * expression syntax without claiming dimensional meaning. A full unit-aware
 * implementation can replace this parser in Phase 2 without changing Stage 1.
 */
export const unitSyntaxParser: UnitParser = {
  parse(source) {
    const canonical = source.trim().replace(/\s+/g, " ");

    if (canonical.length === 0) {
      return { ok: false, message: "Enter a unit, such as mm, in, or m/s." };
    }

    if (
      !supportedUnitCharacters.test(canonical) ||
      !/[A-Za-zµμ°Ω]/u.test(canonical)
    ) {
      return {
        ok: false,
        message:
          "Use unit symbols and arithmetic only, such as mm, kg*m/s^2, or deg C.",
      };
    }

    if (!hasBalancedParentheses(canonical)) {
      return { ok: false, message: "Unit parentheses must be balanced." };
    }

    return {
      ok: true,
      unit: { source, canonical },
    };
  },
};

/** Full Stage 1 parser backed by the same unit catalog used for expressions. */
export const mathJsUnitParser: UnitParser = {
  parse(source) {
    const canonical = source.trim().replace(/\s+/g, " ");
    if (canonical === "1") {
      return { ok: true, unit: { source, canonical } };
    }

    try {
      unit(1, canonical);
      return { ok: true, unit: { source, canonical } };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? `Unit is not recognized: ${error.message}`
            : "Unit is not recognized.",
      };
    }
  },
};
import { unit } from "mathjs";

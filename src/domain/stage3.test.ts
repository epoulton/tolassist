import { describe, expect, it } from "vitest";

import {
  createStage3Row,
  evaluateConstraint,
  parseConstraint,
  reorderStage3Rows,
  updateStage3Row,
  validateStage3Rows,
} from ".";
import type { NamedAxisValue } from "../math";

function axis(
  id: string,
  values: readonly [number, number, number],
  unit: string | null = null,
): NamedAxisValue {
  return { axisIds: [id], values: new Float64Array(values), unit };
}

describe("constraint parsing", () => {
  it.each(["a <= b", "a == b", "a >= b"])(
    "accepts one supported comparison: %s",
    (source) => {
      expect(parseConstraint(source).operator).toBe(source.slice(2, 4).trim());
    },
  );

  it.each(["a < b", "a != b", "a <= b <= c", "a", "<= b"])(
    "rejects unsupported or malformed comparison: %s",
    (source) => {
      expect(() => parseConstraint(source)).toThrow(/exactly one|both sides/i);
    },
  );
});

describe("constraint evaluation", () => {
  it("classifies all-space, nominal-only, and nominal-failing results", () => {
    const greenScope = new Map([["a", axis("a-id", [1, 2, 3])]]);
    const yellowScope = new Map([["a", axis("a-id", [1, 2, 5])]]);
    const redScope = new Map([["a", axis("a-id", [1, 5, 6])]]);

    expect(
      evaluateConstraint(parseConstraint("a <= 3"), greenScope).status,
    ).toBe("green");
    expect(
      evaluateConstraint(parseConstraint("a <= 3"), yellowScope).status,
    ).toBe("yellow");
    expect(evaluateConstraint(parseConstraint("a <= 3"), redScope).status).toBe(
      "red",
    );
  });

  it("broadcasts both sides, converts units, and uses the nominal coordinate", () => {
    const scope = new Map<string, NamedAxisValue>([
      ["a", axis("a-id", [10, 20, 30], "mm")],
      ["b", axis("b-id", [1, 2, 3], "in")],
    ]);
    const result = evaluateConstraint(parseConstraint("a <= b"), scope);

    expect(result.axisIds).toEqual(["a-id", "b-id"]);
    expect(result.values).toHaveLength(9);
    expect(result.nominalSatisfied).toBe(true);
    expect(result.status).toBe("yellow");
  });

  it("uses a provisional floating-point tolerance for equality", () => {
    const result = evaluateConstraint(
      parseConstraint("a == b"),
      new Map([
        ["a", axis("a-id", [1, 1, 1])],
        ["b", axis("b-id", [1 + 5e-13, 1 + 5e-13, 1 + 5e-13])],
      ]),
    );

    expect(result.status).toBe("green");
  });

  it("rejects incompatible dimensions", () => {
    const scope = new Map<string, NamedAxisValue>([
      ["length", axis("length-id", [1, 2, 3], "m")],
      ["volume", axis("volume-id", [1, 2, 3], "m^3")],
    ]);

    expect(() =>
      evaluateConstraint(parseConstraint("length <= volume"), scope),
    ).toThrow(/unit|dimension|base/i);
  });

  it("reports the named coordinates behind arithmetic failures", () => {
    const scope = new Map<string, NamedAxisValue>([
      ["a", axis("a-id", [1, 2, 3])],
      ["b", axis("b-id", [0, 1, 2])],
    ]);

    expect(() =>
      evaluateConstraint(parseConstraint("1 / (a - b) <= 10"), scope),
    ).toThrow(/a = min, b = nom/i);
  });
});

describe("Stage 3 rows", () => {
  it("starts empty, validates populated rows, and keeps invalid rows uncolored", () => {
    const empty = createStage3Row("empty");
    const valid = updateStage3Row(createStage3Row("valid"), "a >= 1");
    const invalid = updateStage3Row(createStage3Row("invalid"), "missing <= 2");
    const result = validateStage3Rows(
      [empty, valid, invalid],
      new Map([["a", axis("a-id", [1, 2, 3])]]),
    );

    expect(result.rows[0]?.status).toBe("empty");
    expect(result.rows[1]?.validated?.evaluation.status).toBe("green");
    expect(result.rows[2]?.status).toBe("invalid");
    expect(result.rows[2]?.validated).toBeUndefined();
  });

  it("reorders rows by stable ID", () => {
    const rows = [
      createStage3Row("one"),
      createStage3Row("two"),
      createStage3Row("three"),
    ];
    expect(
      reorderStage3Rows(rows, "three", "one").map((row) => row.id),
    ).toEqual(["three", "one", "two"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  createStage2Row,
  reorderStage2Rows,
  updateStage2Row,
  validateStage2Rows,
  type Stage2Row,
  type ValidatedBaseVariable,
} from ".";

function base(
  id: string,
  name: string,
  values: readonly [number, number, number],
  unit = "mm",
): ValidatedBaseVariable {
  return {
    id,
    name,
    unit,
    threePoint: {
      minimum: values[0],
      nominal: values[1],
      maximum: values[2],
    },
    nominalTolerance: {
      nominal: (values[0] + values[2]) / 2,
      tolerance: (values[2] - values[0]) / 2,
    },
  };
}

function row(id: string, name: string, expression: string): Stage2Row {
  let result = createStage2Row(id);
  result = updateStage2Row(result, "name", name);
  return updateStage2Row(result, "expression", expression);
}

describe("Stage 2 row-order validation", () => {
  const bases = [base("a-id", "a", [1, 2, 3]), base("b-id", "b", [10, 20, 30])];

  it("evaluates valid rows in order and propagates named axes", () => {
    const result = validateStage2Rows(
      [row("c-id", "c", "a + b"), row("d-id", "d", "a + c")],
      bases,
    );

    expect(result.isValid).toBe(true);
    expect(result.variables).toHaveLength(2);
    expect(result.variables[0]?.validation.dependencies).toEqual(["a", "b"]);
    expect(result.variables[1]?.result.axisIds).toEqual(["a-id", "b-id"]);
    expect(result.variables[1]?.result.values).toHaveLength(9);
  });

  it("allows a scalar constant with no tolerance axes", () => {
    const result = validateStage2Rows([row("pi-id", "circ", "2*pi")], bases);

    expect(result.variables[0]?.result.axisIds).toEqual([]);
    expect(result.variables[0]?.result.values[0]).toBeCloseTo(2 * Math.PI, 12);
  });

  it("rejects self and later-row dependencies", () => {
    const result = validateStage2Rows(
      [row("c-id", "c", "d + 1 mm"), row("d-id", "d", "c + 1 mm")],
      bases,
    );

    expect(result.rows[0]?.errors.expression).toMatch(
      /only earlier valid rows/i,
    );
    expect(result.rows[1]?.errors.expression).toMatch(
      /only earlier valid rows/i,
    );
    expect(result.variables).toHaveLength(0);
  });

  it("enforces names across base and derived variables", () => {
    const result = validateStage2Rows(
      [
        row("one", "a", "1 mm"),
        row("two", "same", "1"),
        row("three", "same", "2"),
      ],
      bases,
    );

    expect(result.rows[0]?.errors.name).toMatch(/already used/i);
    expect(result.rows[1]?.errors.name).toMatch(/already used/i);
    expect(result.rows[2]?.errors.name).toMatch(/already used/i);
  });

  it("ignores a completely empty row but requires both populated fields", () => {
    const empty = createStage2Row("empty");
    const incomplete = updateStage2Row(
      createStage2Row("incomplete"),
      "name",
      "x",
    );
    const result = validateStage2Rows([empty, incomplete], bases);

    expect(result.rows[0]?.status).toBe("empty");
    expect(result.rows[1]?.errors.expression).toMatch(/enter an arithmetic/i);
  });

  it("revalidates dependencies after rows are reordered", () => {
    const original = [
      row("c-id", "c", "a + 1 mm"),
      row("d-id", "d", "c + 1 mm"),
    ];
    expect(validateStage2Rows(original, bases).isValid).toBe(true);

    const reordered = reorderStage2Rows(original, "d-id", "c-id");
    const result = validateStage2Rows(reordered, bases);

    expect(result.rows[0]?.errors.expression).toMatch(
      /only earlier valid rows/i,
    );
    expect(result.rows[1]?.status).toBe("valid");
  });
});

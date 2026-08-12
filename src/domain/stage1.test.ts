import { describe, expect, it } from "vitest";

import {
  convertNominalToleranceToThreePoint,
  convertThreePointToNominalTolerance,
  createInitialStage1Rows,
  createStage1Row,
  reorderStage1Rows,
  setStage1Format,
  updateStage1Field,
  validateStage1Rows,
  type Stage1EditableField,
  type Stage1Row,
} from ".";

function edit(
  row: Stage1Row,
  values: Partial<Record<Stage1EditableField, string>>,
): Stage1Row {
  return Object.entries(values).reduce(
    (current, [field, value]) =>
      updateStage1Field(current, field as Stage1EditableField, value),
    row,
  );
}

describe("Stage 1 tolerance conversions", () => {
  it("converts a symmetric tolerance into three ordered values", () => {
    expect(
      convertNominalToleranceToThreePoint({ nominal: 12, tolerance: 0.5 }),
    ).toEqual({ minimum: 11.5, nominal: 12, maximum: 12.5 });
  });

  it("derives midpoint and half-range from an asymmetric window", () => {
    expect(
      convertThreePointToNominalTolerance({
        minimum: 2,
        nominal: 4,
        maximum: 10,
      }),
    ).toEqual({ nominal: 6, tolerance: 4 });
  });
});

describe("Stage 1 row validation", () => {
  it("starts with exactly two ignored empty rows", () => {
    const result = validateStage1Rows(createInitialStage1Rows());

    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.status === "empty")).toBe(true);
    expect(result.variables).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it("normalizes blank minimum and maximum to nominal", () => {
    const row = edit(createStage1Row("diameter"), {
      name: "diameter",
      nominal: "25.4",
      unit: "mm",
    });
    const [validated] = validateStage1Rows([row]).variables;

    expect(validated?.threePoint).toEqual({
      minimum: 25.4,
      nominal: 25.4,
      maximum: 25.4,
    });
    expect(validated?.nominalTolerance).toEqual({
      nominal: 25.4,
      tolerance: 0,
    });
  });

  it("preserves an asymmetric three-point window across view toggles", () => {
    const row = edit(createStage1Row("offset"), {
      name: "offset",
      minimum: "0",
      nominal: "3",
      maximum: "10",
      unit: "mm",
    });
    const [validRow] = validateStage1Rows([row]).rows;
    const symmetric = setStage1Format(validRow!, "nominal-tolerance");
    const restored = setStage1Format(symmetric, "three-point");

    expect(symmetric.nominalTolerance).toEqual({
      nominal: "5",
      tolerance: "5",
    });
    expect(restored.threePoint).toEqual({
      minimum: "0",
      nominal: "3",
      maximum: "10",
    });
  });

  it("recalculates the alternate cache after a valid edit", () => {
    let row = edit(createStage1Row("gap"), {
      name: "gap",
      minimum: "0",
      nominal: "3",
      maximum: "10",
      unit: "mm",
    });
    row = validateStage1Rows([row]).rows[0] ?? row;
    row = setStage1Format(row, "nominal-tolerance");
    row = edit(row, { nominal: "8", tolerance: "2" });
    row = validateStage1Rows([row]).rows[0] ?? row;

    expect(row?.validated?.threePoint).toEqual({
      minimum: 6,
      nominal: 8,
      maximum: 10,
    });
  });

  it("keeps invalid text visible and retains the last valid cache", () => {
    let row = edit(createStage1Row("width"), {
      name: "width",
      minimum: "9",
      nominal: "10",
      maximum: "11",
      unit: "mm",
    });
    row = validateStage1Rows([row]).rows[0] ?? row;
    const lastValid = row?.validated;
    row = edit(row, { minimum: "twelve" });
    row = validateStage1Rows([row]).rows[0] ?? row;

    expect(row?.status).toBe("invalid");
    expect(row?.threePoint.minimum).toBe("twelve");
    expect(row?.validated).toBe(lastValid);
    expect(row?.errors.minimum).toMatch(/finite minimum/i);
  });

  it("requires portable unique identifiers", () => {
    const first = edit(createStage1Row("first"), {
      name: "shaft",
      nominal: "1",
      unit: "in",
    });
    const second = edit(createStage1Row("second"), {
      name: "shaft",
      nominal: "2",
      unit: "in",
    });
    const invalidName = edit(createStage1Row("third"), {
      name: "3rd shaft",
      nominal: "3",
      unit: "in",
    });
    const result = validateStage1Rows([first, second, invalidName]);

    expect(result.rows[0]?.errors.name).toMatch(/already used/i);
    expect(result.rows[1]?.errors.name).toMatch(/already used/i);
    expect(result.rows[2]?.errors.name).toMatch(/beginning with/i);
    expect(result.isValid).toBe(false);
  });

  it("rejects invalid ranges, negative tolerances, and malformed units", () => {
    const range = edit(createStage1Row("range"), {
      name: "range",
      minimum: "5",
      nominal: "4",
      maximum: "3",
      unit: "m<script>",
    });
    let tolerance = setStage1Format(
      createStage1Row("tol"),
      "nominal-tolerance",
    );
    tolerance = edit(tolerance, {
      name: "tol",
      nominal: "4",
      tolerance: "-1",
      unit: "mm",
    });
    const result = validateStage1Rows([range, tolerance]);

    expect(result.rows[0]?.errors.minimum).toBeDefined();
    expect(result.rows[0]?.errors.maximum).toBeDefined();
    expect(result.rows[0]?.errors.unit).toBeDefined();
    expect(result.rows[1]?.errors.tolerance).toMatch(/greater than or equal/i);
  });
});

describe("Stage 1 row ordering", () => {
  it("reorders rows without changing their stable IDs", () => {
    const rows = [
      createStage1Row("alpha"),
      createStage1Row("beta"),
      createStage1Row("gamma"),
    ];

    expect(
      reorderStage1Rows(rows, "gamma", "alpha").map((row) => row.id),
    ).toEqual(["gamma", "alpha", "beta"]);
  });
});

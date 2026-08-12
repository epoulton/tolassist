import { mathJsUnitParser, type UnitParser } from "../math/units";

export type ToleranceFormat = "three-point" | "nominal-tolerance";
export type Stage1RowStatus = "empty" | "editing" | "valid" | "invalid";

export interface ThreePointInput {
  readonly minimum: string;
  readonly nominal: string;
  readonly maximum: string;
}

export interface NominalToleranceInput {
  readonly nominal: string;
  readonly tolerance: string;
}

export interface Stage1RowErrors {
  readonly name?: string;
  readonly minimum?: string;
  readonly nominal?: string;
  readonly maximum?: string;
  readonly tolerance?: string;
  readonly unit?: string;
  readonly row?: string;
}

export interface ThreePointValues {
  readonly minimum: number;
  readonly nominal: number;
  readonly maximum: number;
}

export interface NominalToleranceValues {
  readonly nominal: number;
  readonly tolerance: number;
}

export interface ValidatedBaseVariable {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly threePoint: ThreePointValues;
  readonly nominalTolerance: NominalToleranceValues;
}

export interface Stage1Row {
  readonly id: string;
  readonly format: ToleranceFormat;
  readonly name: string;
  readonly unit: string;
  readonly threePoint: ThreePointInput;
  readonly nominalTolerance: NominalToleranceInput;
  readonly status: Stage1RowStatus;
  readonly errors: Stage1RowErrors;
  readonly validated: ValidatedBaseVariable | undefined;
}

export type Stage1EditableField =
  "name" | "unit" | "minimum" | "nominal" | "maximum" | "tolerance";

export interface Stage1ValidationResult {
  readonly rows: readonly Stage1Row[];
  readonly variables: readonly ValidatedBaseVariable[];
  readonly isValid: boolean;
}

const portableIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const finiteNumberPattern =
  /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

let generatedRowNumber = 0;

export function createStage1Row(id?: string): Stage1Row {
  generatedRowNumber += 1;

  return {
    id: id ?? `variable-${generatedRowNumber}`,
    format: "three-point",
    name: "",
    unit: "",
    threePoint: { minimum: "", nominal: "", maximum: "" },
    nominalTolerance: { nominal: "", tolerance: "" },
    status: "empty",
    errors: {},
    validated: undefined,
  };
}

export function createInitialStage1Rows(): readonly Stage1Row[] {
  return [createStage1Row(), createStage1Row()];
}

export function isPortableIdentifier(name: string): boolean {
  return portableIdentifierPattern.test(name);
}

function activeValues(row: Stage1Row): readonly string[] {
  return row.format === "three-point"
    ? [row.threePoint.minimum, row.threePoint.nominal, row.threePoint.maximum]
    : [row.nominalTolerance.nominal, row.nominalTolerance.tolerance];
}

export function isStage1RowEmpty(row: Stage1Row): boolean {
  return [row.name, row.unit, ...activeValues(row)].every(
    (value) => value.trim().length === 0,
  );
}

function parseFiniteNumber(source: string): number | undefined {
  const normalized = source.trim();
  if (!finiteNumberPattern.test(normalized)) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

export function convertNominalToleranceToThreePoint(
  values: NominalToleranceValues,
): ThreePointValues {
  return {
    minimum: values.nominal - values.tolerance,
    nominal: values.nominal,
    maximum: values.nominal + values.tolerance,
  };
}

export function convertThreePointToNominalTolerance(
  values: ThreePointValues,
): NominalToleranceValues {
  return {
    nominal: (values.maximum + values.minimum) / 2,
    tolerance: (values.maximum - values.minimum) / 2,
  };
}

export function updateStage1Field(
  row: Stage1Row,
  field: Stage1EditableField,
  value: string,
): Stage1Row {
  if (field === "name" || field === "unit") {
    return { ...row, [field]: value, status: "editing" };
  }

  if (field === "minimum" || field === "maximum") {
    return {
      ...row,
      threePoint: { ...row.threePoint, [field]: value },
      status: "editing",
    };
  }

  if (field === "tolerance") {
    return {
      ...row,
      nominalTolerance: { ...row.nominalTolerance, tolerance: value },
      status: "editing",
    };
  }

  return row.format === "three-point"
    ? {
        ...row,
        threePoint: { ...row.threePoint, nominal: value },
        status: "editing",
      }
    : {
        ...row,
        nominalTolerance: { ...row.nominalTolerance, nominal: value },
        status: "editing",
      };
}

export function setStage1Format(
  row: Stage1Row,
  format: ToleranceFormat,
): Stage1Row {
  if (row.format === format) return row;
  if (row.status !== "empty" && (row.status !== "valid" || !row.validated)) {
    return row;
  }

  if (!row.validated) return { ...row, format };

  const { threePoint, nominalTolerance } = row.validated;

  return {
    ...row,
    format,
    threePoint: {
      minimum: formatNumber(threePoint.minimum),
      nominal: formatNumber(threePoint.nominal),
      maximum: formatNumber(threePoint.maximum),
    },
    nominalTolerance: {
      nominal: formatNumber(nominalTolerance.nominal),
      tolerance: formatNumber(nominalTolerance.tolerance),
    },
  };
}

interface LocallyValidatedRow {
  readonly row: Stage1Row;
  readonly candidate?: ValidatedBaseVariable;
}

function validateRowLocally(
  row: Stage1Row,
  unitParser: UnitParser,
): LocallyValidatedRow {
  if (isStage1RowEmpty(row)) {
    return {
      row: {
        ...row,
        status: "empty",
        errors: {},
        validated: undefined,
      },
    };
  }

  const errors: Record<string, string> = {};
  const name = row.name.trim();

  if (name.length === 0) {
    errors.name = "Enter a unique variable name.";
  } else if (!isPortableIdentifier(name)) {
    errors.name =
      "Use letters, numbers, and underscores, beginning with a letter or underscore.";
  }

  const nominalSource =
    row.format === "three-point"
      ? row.threePoint.nominal
      : row.nominalTolerance.nominal;
  const nominal = parseFiniteNumber(nominalSource);
  if (nominal === undefined) {
    errors.nominal = "Enter a finite nominal value.";
  }

  const parsedUnit = unitParser.parse(row.unit);
  if (!parsedUnit.ok) errors.unit = parsedUnit.message;

  let threePoint: ThreePointValues | undefined;
  let nominalTolerance: NominalToleranceValues | undefined;

  if (nominal !== undefined && row.format === "three-point") {
    const minimum =
      row.threePoint.minimum.trim().length === 0
        ? nominal
        : parseFiniteNumber(row.threePoint.minimum);
    const maximum =
      row.threePoint.maximum.trim().length === 0
        ? nominal
        : parseFiniteNumber(row.threePoint.maximum);

    if (minimum === undefined) errors.minimum = "Enter a finite minimum value.";
    if (maximum === undefined) errors.maximum = "Enter a finite maximum value.";

    if (minimum !== undefined && maximum !== undefined) {
      if (minimum > nominal) {
        errors.minimum = "Minimum must be less than or equal to nominal.";
      }
      if (nominal > maximum) {
        errors.maximum = "Maximum must be greater than or equal to nominal.";
      }

      if (!errors.minimum && !errors.maximum) {
        threePoint = { minimum, nominal, maximum };
        nominalTolerance = convertThreePointToNominalTolerance(threePoint);
      }
    }
  }

  if (nominal !== undefined && row.format === "nominal-tolerance") {
    const tolerance =
      row.nominalTolerance.tolerance.trim().length === 0
        ? 0
        : parseFiniteNumber(row.nominalTolerance.tolerance);

    if (tolerance === undefined) {
      errors.tolerance = "Enter a finite absolute tolerance.";
    } else if (tolerance < 0) {
      errors.tolerance = "Tolerance must be greater than or equal to zero.";
    } else {
      nominalTolerance = { nominal, tolerance };
      threePoint = convertNominalToleranceToThreePoint(nominalTolerance);
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    !threePoint ||
    !nominalTolerance ||
    !parsedUnit.ok
  ) {
    return {
      row: {
        ...row,
        status: "invalid",
        errors,
      },
    };
  }

  const candidate: ValidatedBaseVariable = {
    id: row.id,
    name,
    unit: parsedUnit.unit.canonical,
    threePoint,
    nominalTolerance,
  };

  return {
    row: { ...row, status: "valid", errors: {}, validated: candidate },
    candidate,
  };
}

export function validateStage1Rows(
  rows: readonly Stage1Row[],
  unitParser: UnitParser = mathJsUnitParser,
): Stage1ValidationResult {
  const localResults = rows.map((row) => validateRowLocally(row, unitParser));
  const nameCounts = new Map<string, number>();

  for (const { candidate } of localResults) {
    if (!candidate) continue;
    nameCounts.set(candidate.name, (nameCounts.get(candidate.name) ?? 0) + 1);
  }

  const validatedRows = localResults.map(({ row, candidate }) => {
    if (!candidate || nameCounts.get(candidate.name) === 1) return row;

    return {
      ...row,
      status: "invalid" as const,
      errors: {
        ...row.errors,
        name: `“${candidate.name}” is already used by another variable.`,
      },
      validated: undefined,
    };
  });

  const variables = validatedRows.flatMap((row) =>
    row.status === "valid" && row.validated ? [row.validated] : [],
  );

  return {
    rows: validatedRows,
    variables,
    isValid: validatedRows.every((row) => row.status !== "invalid"),
  };
}

export function reorderStage1Rows(
  rows: readonly Stage1Row[],
  activeId: string,
  overId: string,
): readonly Stage1Row[] {
  const oldIndex = rows.findIndex((row) => row.id === activeId);
  const newIndex = rows.findIndex((row) => row.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return rows;

  const reordered = [...rows];
  const [moved] = reordered.splice(oldIndex, 1);
  if (!moved) return rows;
  reordered.splice(newIndex, 0, moved);
  return reordered;
}

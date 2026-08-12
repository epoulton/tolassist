import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useMemo, type CSSProperties } from "react";

import {
  createStage1Row,
  reorderStage1Rows,
  setStage1Format,
  updateStage1Field,
  type Stage1EditableField,
  type Stage1Row,
  type ToleranceFormat,
} from "../domain";
import {
  useKeyboardReorder,
  useReducedMotion,
  type KeyboardReorderControls,
} from "../ui";

interface Stage1SectionProps {
  readonly rows: readonly Stage1Row[];
  readonly onRowsChange: (rows: readonly Stage1Row[]) => void;
  readonly onStructuralChange: (rows: readonly Stage1Row[]) => void;
  readonly onValidate: () => void;
}

interface VariableInputProps {
  readonly row: Stage1Row;
  readonly field: Stage1EditableField;
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly onChange: (field: Stage1EditableField, value: string) => void;
  readonly onBlur: () => void;
}

function VariableInput({
  row,
  field,
  label,
  value,
  placeholder,
  onChange,
  onBlur,
}: VariableInputProps) {
  const error = row.errors[field];
  const errorId = `variable-${row.id}-${field}-error`;

  return (
    <label className={`field field-${field}`}>
      <span>{label}</span>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        inputMode={field === "name" || field === "unit" ? undefined : "decimal"}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(field, event.target.value)}
      />
      {error ? (
        <span className="sr-only" id={errorId}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

interface SortableVariableRowProps {
  readonly row: Stage1Row;
  readonly index: number;
  readonly onBlur: () => void;
  readonly onChange: (
    id: string,
    field: Stage1EditableField,
    value: string,
  ) => void;
  readonly onDelete: (id: string) => void;
  readonly onFormatChange: (id: string, format: ToleranceFormat) => void;
  readonly keyboardReorder: KeyboardReorderControls;
}

function SortableVariableRow({
  row,
  index,
  onBlur,
  onChange,
  onDelete,
  onFormatChange,
  keyboardReorder,
}: SortableVariableRowProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const canToggle = row.status === "empty" || row.status === "valid";
  const possibleErrors = [
    row.errors.name,
    row.errors.minimum,
    row.errors.nominal,
    row.errors.maximum,
    row.errors.tolerance,
    row.errors.unit,
    row.errors.row,
  ];
  const errors = [
    ...new Set(
      possibleErrors.filter((error): error is string => error !== undefined),
    ),
  ];
  const rowTitle = row.name.trim() || `Variable ${index + 1}`;

  const sharedInputProps = {
    row,
    onBlur,
    onChange: (field: Stage1EditableField, value: string) =>
      onChange(row.id, field, value),
  };

  return (
    <article
      ref={setNodeRef}
      className={`variable-row variable-row-${row.status}${isDragging ? " is-dragging" : ""}`}
      style={style}
    >
      <div className="variable-row-main">
        <button
          ref={setActivatorNodeRef}
          className="drag-handle"
          type="button"
          aria-label={`Reorder ${rowTitle}. Press Space, then use arrow keys.`}
          {...attributes}
          {...listeners}
          aria-pressed={keyboardReorder.activeId === row.id}
          onKeyDown={(event) =>
            keyboardReorder.onKeyDown(event, row.id, rowTitle)
          }
        >
          <span aria-hidden="true">⠿</span>
        </button>

        <span className="row-number" aria-hidden="true">
          {index + 1}
        </span>

        <VariableInput
          {...sharedInputProps}
          field="name"
          label="Name"
          placeholder="shaft_diameter"
          value={row.name}
        />

        <div
          className="format-switcher"
          aria-label={`${rowTitle} value format`}
        >
          <button
            type="button"
            aria-pressed={row.format === "three-point"}
            disabled={!canToggle}
            onClick={() => onFormatChange(row.id, "three-point")}
          >
            Min / Nom / Max
          </button>
          <button
            type="button"
            aria-pressed={row.format === "nominal-tolerance"}
            disabled={!canToggle}
            onClick={() => onFormatChange(row.id, "nominal-tolerance")}
          >
            Nom ± Tol
          </button>
        </div>

        <div className="value-fields">
          {row.format === "three-point" ? (
            <>
              <VariableInput
                {...sharedInputProps}
                field="minimum"
                label="Minimum"
                placeholder="Defaults to nominal"
                value={row.threePoint.minimum}
              />
              <VariableInput
                {...sharedInputProps}
                field="nominal"
                label="Nominal"
                placeholder="Required"
                value={row.threePoint.nominal}
              />
              <VariableInput
                {...sharedInputProps}
                field="maximum"
                label="Maximum"
                placeholder="Defaults to nominal"
                value={row.threePoint.maximum}
              />
            </>
          ) : (
            <>
              <VariableInput
                {...sharedInputProps}
                field="nominal"
                label="Nominal"
                placeholder="Required"
                value={row.nominalTolerance.nominal}
              />
              <VariableInput
                {...sharedInputProps}
                field="tolerance"
                label="Tolerance"
                placeholder="Defaults to 0"
                value={row.nominalTolerance.tolerance}
              />
            </>
          )}
        </div>

        <VariableInput
          {...sharedInputProps}
          field="unit"
          label="Unit"
          placeholder="mm"
          value={row.unit}
        />

        <button
          className="remove-button"
          type="button"
          aria-label={`Delete ${rowTitle}`}
          onClick={() => onDelete(row.id)}
        >
          Remove
        </button>
      </div>

      <div className="row-feedback" aria-live="polite">
        {row.status === "valid" && row.validated ? (
          <p className="validation-success">
            Ready · {row.validated.threePoint.minimum} /{" "}
            {row.validated.threePoint.nominal} /{" "}
            {row.validated.threePoint.maximum} {row.validated.unit}
          </p>
        ) : null}
        {row.status === "editing" ? (
          <p className="validation-pending">
            Leave a field to validate these changes.
          </p>
        ) : null}
        {errors.length > 0 ? (
          <ul className="validation-errors">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export function Stage1Section({
  rows,
  onRowsChange,
  onStructuralChange,
  onValidate,
}: Stage1SectionProps) {
  const reducedMotion = useReducedMotion();
  const [listRef] = useAutoAnimate<HTMLDivElement>({
    duration: reducedMotion ? 0 : 180,
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const keyboardReorder = useKeyboardReorder(
    rows.map((row) => row.id),
    (activeId, overId) =>
      onStructuralChange(reorderStage1Rows(rows, activeId, overId)),
  );
  const validCount = useMemo(
    () => rows.filter((row) => row.status === "valid").length,
    [rows],
  );
  const invalidCount = useMemo(
    () => rows.filter((row) => row.status === "invalid").length,
    [rows],
  );

  function handleChange(id: string, field: Stage1EditableField, value: string) {
    onRowsChange(
      rows.map((row) =>
        row.id === id ? updateStage1Field(row, field, value) : row,
      ),
    );
  }

  function handleFormatChange(id: string, format: ToleranceFormat) {
    onRowsChange(
      rows.map((row) => (row.id === id ? setStage1Format(row, format) : row)),
    );
  }

  function handleDelete(id: string) {
    onStructuralChange(rows.filter((row) => row.id !== id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    onStructuralChange(
      reorderStage1Rows(rows, String(active.id), String(over.id)),
    );
  }

  return (
    <section
      className="workflow-stage stage-active"
      aria-labelledby="stage-1-title"
    >
      <div className="stage-heading">
        <div className="stage-index" aria-hidden="true">
          01
        </div>
        <div>
          <p className="stage-kicker">Base variables</p>
          <h2 id="stage-1-title">Define the tolerance space</h2>
          <p>
            Enter each independent measurement in the form you have. TolAssist
            keeps both representations ready for later calculations.
          </p>
        </div>
        <div className="stage-summary" aria-live="polite">
          <strong>{validCount}</strong>
          <span>{validCount === 1 ? "valid variable" : "valid variables"}</span>
          {invalidCount > 0 ? <em>{invalidCount} need attention</em> : null}
        </div>
      </div>

      <div className="stage-help">
        <p>
          Names use portable expression identifiers: letters, numbers, and
          underscores, starting with a letter or underscore. Minimum, maximum,
          and tolerance may be left blank for a zero-width default.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={rows.map((row) => row.id)}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={listRef}
            className="variable-list"
            aria-label="Base variables"
          >
            {rows.length === 0 ? (
              <div className="empty-list">
                <p>No variable rows yet.</p>
                <span>Add one when you are ready to define the problem.</span>
              </div>
            ) : (
              rows.map((row, index) => (
                <SortableVariableRow
                  key={row.id}
                  row={row}
                  index={index}
                  onBlur={onValidate}
                  onChange={handleChange}
                  onDelete={handleDelete}
                  onFormatChange={handleFormatChange}
                  keyboardReorder={keyboardReorder}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
      <p className="sr-only" role="status" aria-live="assertive">
        {keyboardReorder.announcement}
      </p>

      <button
        className="add-row-button"
        type="button"
        onClick={() => onRowsChange([...rows, createStage1Row()])}
      >
        <span aria-hidden="true">+</span> Add variable
      </button>
    </section>
  );
}

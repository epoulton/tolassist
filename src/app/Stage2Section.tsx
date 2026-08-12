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
import { useMemo, useState, type CSSProperties } from "react";

import {
  createStage2Row,
  reorderStage2Rows,
  updateStage2Row,
  type Stage2Row,
} from "../domain";
import { formatQuantity, mathJsExpressionEngine } from "../math";
import {
  useKeyboardReorder,
  useReducedMotion,
  type KeyboardReorderControls,
} from "../ui";

interface Stage2SectionProps {
  readonly rows: readonly Stage2Row[];
  readonly onRowsChange: (rows: readonly Stage2Row[]) => void;
  readonly onStructuralChange: (rows: readonly Stage2Row[]) => void;
  readonly onValidate: () => void;
}

interface SortableExpressionRowProps {
  readonly row: Stage2Row;
  readonly index: number;
  readonly expanded: boolean;
  readonly onBlur: () => void;
  readonly onChange: (
    id: string,
    field: "name" | "expression",
    value: string,
  ) => void;
  readonly onDelete: (id: string) => void;
  readonly onToggle: (id: string) => void;
  readonly keyboardReorder: KeyboardReorderControls;
}

function SortableExpressionRow({
  row,
  index,
  expanded,
  onBlur,
  onChange,
  onDelete,
  onToggle,
  keyboardReorder,
}: SortableExpressionRowProps) {
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
  const title = row.name.trim() || `Expression ${index + 1}`;
  const hasAxes = (row.validated?.result.axisIds.length ?? 0) > 0;
  const isConstant = row.validated?.result.axisIds.length === 0;
  const nameErrorId = `expression-${row.id}-name-error`;
  const errorId = `expression-${row.id}-error`;
  const inspectorId = `expression-${row.id}-inspector`;

  return (
    <article
      ref={setNodeRef}
      className={`definition-row expression-row definition-row-${row.status}${isDragging ? " is-dragging" : ""}`}
      style={style}
    >
      <div className="definition-row-main expression-row-main">
        <button
          ref={setActivatorNodeRef}
          className="drag-handle"
          type="button"
          aria-label={`Reorder ${title}. Press Space, then use arrow keys.`}
          {...attributes}
          {...listeners}
          aria-pressed={keyboardReorder.activeId === row.id}
          onKeyDown={(event) => keyboardReorder.onKeyDown(event, row.id, title)}
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <span className="row-number" aria-hidden="true">
          {index + 1}
        </span>
        <label className="field expression-name-field">
          <span>Name</span>
          <input
            aria-describedby={row.errors.name ? nameErrorId : undefined}
            aria-invalid={Boolean(row.errors.name)}
            placeholder="clearance"
            spellCheck={false}
            value={row.name}
            onBlur={onBlur}
            onChange={(event) => onChange(row.id, "name", event.target.value)}
          />
        </label>
        <span className="equals-mark" aria-hidden="true">
          =
        </span>
        <label className="field expression-source-field">
          <span>Expression</span>
          <input
            aria-describedby={row.errors.expression ? errorId : undefined}
            aria-invalid={Boolean(row.errors.expression)}
            placeholder="outer_diameter - inner_diameter"
            spellCheck={false}
            value={row.expression}
            onBlur={onBlur}
            onChange={(event) =>
              onChange(row.id, "expression", event.target.value)
            }
          />
        </label>
        <div className="expression-result-action">
          {hasAxes ? (
            <button
              className="inspector-toggle"
              type="button"
              aria-controls={inspectorId}
              aria-expanded={expanded}
              onClick={() => onToggle(row.id)}
            >
              Results <span aria-hidden="true">⌄</span>
            </button>
          ) : isConstant && row.validated ? (
            <span className="constant-result">
              Constant · {formatQuantity(row.validated.summary.nominal)}
            </span>
          ) : row.status === "valid" ? (
            <span className="result-unavailable">No value</span>
          ) : null}
        </div>
        <button
          className="remove-button"
          type="button"
          aria-label={`Delete ${title}`}
          onClick={() => onDelete(row.id)}
        >
          Remove
        </button>
      </div>

      <div className="definition-feedback" aria-live="polite">
        {row.status === "editing" ? (
          <p className="validation-pending">
            Leave a field to validate all inputs.
          </p>
        ) : null}
        {row.errors.name ? (
          <p className="validation-error" id={nameErrorId}>
            {row.errors.name}
          </p>
        ) : null}
        {row.errors.expression ? (
          <p className="validation-error" id={errorId}>
            {row.errors.expression}
          </p>
        ) : null}
        {row.status === "valid" && !row.validated ? (
          <p className="validation-pending">
            Calculated output is unavailable until every populated field is
            valid.
          </p>
        ) : null}
      </div>

      <div
        className={`result-disclosure${expanded && hasAxes ? " is-open" : ""}`}
        id={inspectorId}
      >
        <div>
          {row.validated && hasAxes ? (
            <div className="result-inspector">
              <div>
                <span>Minimum</span>
                <strong>{formatQuantity(row.validated.summary.minimum)}</strong>
              </div>
              <div>
                <span>Nominal</span>
                <strong>{formatQuantity(row.validated.summary.nominal)}</strong>
              </div>
              <div>
                <span>Maximum</span>
                <strong>{formatQuantity(row.validated.summary.maximum)}</strong>
              </div>
              <p>
                {row.validated.result.values.length} combinations · inferred
                unit{" "}
                <strong>{row.validated.result.unit ?? "dimensionless"}</strong>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function Stage2Section({
  rows,
  onRowsChange,
  onStructuralChange,
  onValidate,
}: Stage2SectionProps) {
  const reducedMotion = useReducedMotion();
  const [listRef] = useAutoAnimate<HTMLDivElement>({
    duration: reducedMotion ? 0 : 180,
  });
  const [expandedRows, setExpandedRows] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const keyboardReorder = useKeyboardReorder(
    rows.map((row) => row.id),
    (activeId, overId) =>
      onStructuralChange(reorderStage2Rows(rows, activeId, overId)),
  );
  const rules = mathJsExpressionEngine.describeRules();
  const validCount = useMemo(
    () => rows.filter((row) => row.status === "valid").length,
    [rows],
  );
  const invalidCount = useMemo(
    () => rows.filter((row) => row.status === "invalid").length,
    [rows],
  );

  function handleChange(
    id: string,
    field: "name" | "expression",
    value: string,
  ) {
    onRowsChange(
      rows.map((row) =>
        row.id === id ? updateStage2Row(row, field, value) : row,
      ),
    );
  }

  function handleDelete(id: string) {
    setExpandedRows((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    onStructuralChange(rows.filter((row) => row.id !== id));
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    onStructuralChange(
      reorderStage2Rows(rows, String(event.active.id), String(event.over.id)),
    );
  }

  function toggleInspector(id: string) {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section
      className="workflow-stage stage-active"
      aria-labelledby="stage-2-title"
    >
      <div className="stage-heading">
        <div className="stage-index" aria-hidden="true">
          02
        </div>
        <div>
          <p className="stage-kicker">Derived variables</p>
          <h2 id="stage-2-title">Build the calculation chain</h2>
          <p>
            Define derived variables from base variables and earlier
            expressions. Every relevant minimum, nominal, and maximum
            combination is evaluated.
          </p>
        </div>
        <div className="stage-summary" aria-live="polite">
          <strong>{validCount}</strong>
          <span>
            {validCount === 1 ? "valid expression" : "valid expressions"}
          </span>
          {invalidCount > 0 ? <em>{invalidCount} need attention</em> : null}
        </div>
      </div>

      <details className="rules-help">
        <summary aria-label="Show expression validation and evaluation rules">
          ?
        </summary>
        <div>
          <strong>Expression rules</strong>
          <p>{rules.syntax}</p>
          <p>Operators: {rules.operators.join(", ")}</p>
          <p>Functions: {rules.functions.join(", ")}</p>
          <p>Constants: {rules.constants.join(", ")}</p>
          <p>
            Compatible units convert automatically. Trigonometric inputs must be
            angles, logarithms must be dimensionless, and calculus is not
            supported.
          </p>
          <p>
            If one tolerance combination causes a domain error, validation
            identifies the minimum, nominal, or maximum coordinates involved.
          </p>
          <ul>
            {rules.restrictions.map((restriction) => (
              <li key={restriction}>{restriction}</li>
            ))}
          </ul>
        </div>
      </details>

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
            className="definition-list"
            aria-label="Derived variables"
          >
            {rows.length === 0 ? (
              <div className="empty-list">
                <p>No expression rows yet.</p>
                <span>Add one to calculate a derived quantity.</span>
              </div>
            ) : (
              rows.map((row, index) => (
                <SortableExpressionRow
                  key={row.id}
                  row={row}
                  index={index}
                  expanded={expandedRows.has(row.id)}
                  onBlur={onValidate}
                  onChange={handleChange}
                  onDelete={handleDelete}
                  onToggle={toggleInspector}
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
        onClick={() => onRowsChange([...rows, createStage2Row()])}
      >
        <span aria-hidden="true">+</span> Add expression
      </button>
    </section>
  );
}

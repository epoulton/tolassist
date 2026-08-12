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
  createStage3Row,
  reorderStage3Rows,
  updateStage3Row,
  type ConstraintStatus,
  type Stage3Row,
} from "../domain";
import {
  useKeyboardReorder,
  useReducedMotion,
  type KeyboardReorderControls,
} from "../ui";

interface Stage3SectionProps {
  readonly rows: readonly Stage3Row[];
  readonly onRowsChange: (rows: readonly Stage3Row[]) => void;
  readonly onStructuralChange: (rows: readonly Stage3Row[]) => void;
  readonly onValidate: () => void;
}

const statusCopy: Record<ConstraintStatus, string> = {
  green: "All cases pass",
  yellow: "Nominal passes",
  red: "Nominal fails",
};

interface SortableConstraintRowProps {
  readonly row: Stage3Row;
  readonly index: number;
  readonly onBlur: () => void;
  readonly onChange: (id: string, value: string) => void;
  readonly onDelete: (id: string) => void;
  readonly keyboardReorder: KeyboardReorderControls;
}

function SortableConstraintRow({
  row,
  index,
  onBlur,
  onChange,
  onDelete,
  keyboardReorder,
}: SortableConstraintRowProps) {
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
  const status = row.validated?.evaluation.status;
  const errorId = `constraint-${row.id}-error`;

  return (
    <article
      ref={setNodeRef}
      className={`definition-row constraint-row definition-row-${row.status}${status ? ` constraint-${status}` : ""}${isDragging ? " is-dragging" : ""}`}
      style={style}
    >
      <div className="definition-row-main constraint-row-main">
        <button
          ref={setActivatorNodeRef}
          className="drag-handle"
          type="button"
          aria-label={`Reorder Constraint ${index + 1}. Press Space, then use arrow keys.`}
          {...attributes}
          {...listeners}
          aria-pressed={keyboardReorder.activeId === row.id}
          onKeyDown={(event) =>
            keyboardReorder.onKeyDown(event, row.id, `Constraint ${index + 1}`)
          }
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <span className="constraint-number">C{index + 1}</span>
        <label className="field constraint-field">
          <span>Comparison</span>
          <input
            aria-describedby={row.error ? errorId : undefined}
            aria-invalid={Boolean(row.error)}
            placeholder="clearance >= 0.2 mm"
            spellCheck={false}
            value={row.expression}
            onBlur={onBlur}
            onChange={(event) => onChange(row.id, event.target.value)}
          />
        </label>
        <div className="constraint-state" aria-live="polite">
          {status ? (
            <>
              <span className="constraint-state-dot" aria-hidden="true" />
              <strong>{statusCopy[status]}</strong>
            </>
          ) : (
            <span>Not evaluated</span>
          )}
        </div>
        <button
          className="remove-button"
          type="button"
          aria-label={`Delete Constraint ${index + 1}`}
          onClick={() => onDelete(row.id)}
        >
          Remove
        </button>
      </div>
      <div className="definition-feedback" aria-live="polite">
        {row.status === "editing" ? (
          <p className="validation-pending">
            Leave the field to validate all inputs.
          </p>
        ) : null}
        {row.error ? (
          <p className="validation-error" id={errorId}>
            {row.error}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function Stage3Section({
  rows,
  onRowsChange,
  onStructuralChange,
  onValidate,
}: Stage3SectionProps) {
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
      onStructuralChange(reorderStage3Rows(rows, activeId, overId)),
  );
  const evaluatedCount = useMemo(
    () => rows.filter((row) => row.validated).length,
    [rows],
  );
  const invalidCount = useMemo(
    () => rows.filter((row) => row.status === "invalid").length,
    [rows],
  );

  function handleChange(id: string, value: string) {
    onRowsChange(
      rows.map((row) => (row.id === id ? updateStage3Row(row, value) : row)),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    onStructuralChange(
      reorderStage3Rows(rows, String(event.active.id), String(event.over.id)),
    );
  }

  return (
    <section
      className="workflow-stage stage-active"
      aria-labelledby="stage-3-title"
    >
      <div className="stage-heading">
        <div className="stage-index" aria-hidden="true">
          03
        </div>
        <div>
          <p className="stage-kicker">Design constraints</p>
          <h2 id="stage-3-title">Define what must hold true</h2>
          <p>
            Define one comparison per row. Constraints are checked across the
            full tolerance space and combined with logical AND.
          </p>
        </div>
        <div className="stage-summary" aria-live="polite">
          <strong>{evaluatedCount}</strong>
          <span>
            {evaluatedCount === 1
              ? "evaluated constraint"
              : "evaluated constraints"}
          </span>
          {invalidCount > 0 ? <em>{invalidCount} need attention</em> : null}
        </div>
      </div>

      <details className="rules-help">
        <summary aria-label="Show constraint validation and evaluation rules">
          ?
        </summary>
        <div>
          <strong>Constraint rules</strong>
          <p>
            Enter exactly one comparison using &lt;=, ==, or &gt;=. Strict
            inequalities and != are not supported.
          </p>
          <p>
            Each row is combined with logical AND. Compatible units convert
            automatically, and every minimum, nominal, and maximum combination
            is evaluated.
          </p>
          <p>
            Green means every combination passes; yellow means only the nominal
            case passes; red means the nominal case fails. Equality uses the
            configured numerical allowance.
          </p>
        </div>
      </details>

      <div className="constraint-legend" aria-label="Constraint status legend">
        <span className="legend-green">All combinations pass</span>
        <span className="legend-yellow">Nominal passes; some limits fail</span>
        <span className="legend-red">Nominal fails</span>
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
            className="definition-list"
            aria-label="Constraints"
          >
            {rows.length === 0 ? (
              <div className="empty-list">
                <p>No constraints defined.</p>
                <span>Optimization may still run without constraints.</span>
              </div>
            ) : (
              rows.map((row, index) => (
                <SortableConstraintRow
                  key={row.id}
                  row={row}
                  index={index}
                  onBlur={onValidate}
                  onChange={handleChange}
                  onDelete={(id) =>
                    onStructuralChange(rows.filter((item) => item.id !== id))
                  }
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
        onClick={() => onRowsChange([...rows, createStage3Row()])}
      >
        <span aria-hidden="true">+</span> Add constraint
      </button>
    </section>
  );
}

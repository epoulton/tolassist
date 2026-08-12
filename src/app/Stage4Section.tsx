import {
  MAX_MIN_OBJECTIVE_ID,
  MAX_MIN_OBJECTIVE_LABEL,
  type SolveProgress,
} from "../optimization";
import type { RefObject } from "react";

export type OptimizationUiState =
  "idle" | "initializing" | "solving" | "succeeded" | "failed" | "cancelled";

interface SelectableVariable {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
}

interface Stage4SectionProps {
  readonly variables: readonly SelectableVariable[];
  readonly selectedVariableIds: readonly string[];
  readonly workflowIsValid: boolean;
  readonly state: OptimizationUiState;
  readonly progress: SolveProgress | null;
  readonly message: string | null;
  readonly diagnostics: readonly string[];
  readonly feedbackRef: RefObject<HTMLDivElement | null>;
  readonly hasSnapshot: boolean;
  readonly onSelectionChange: (ids: readonly string[]) => void;
  readonly onOptimize: () => void;
  readonly onCancel: () => void;
}

export function Stage4Section({
  variables,
  selectedVariableIds,
  workflowIsValid,
  state,
  progress,
  message,
  diagnostics,
  feedbackRef,
  hasSnapshot,
  onSelectionChange,
  onOptimize,
  onCancel,
}: Stage4SectionProps) {
  const isRunning = state === "initializing" || state === "solving";
  const canOptimize =
    workflowIsValid && selectedVariableIds.length > 0 && !isRunning;

  return (
    <section
      className="workflow-stage stage-active optimization-stage"
      aria-labelledby="stage-4-title"
      aria-busy={isRunning}
    >
      <div className="stage-heading">
        <div className="stage-index" aria-hidden="true">
          04
        </div>
        <div>
          <p className="stage-kicker">Constrained optimization</p>
          <h2 id="stage-4-title">Configure the optimization problem</h2>
          <p>
            Choose which independent nominal and tolerance values NLopt may
            modify. Your above inputs remain unchanged.
          </p>
        </div>
        <div className="stage-summary optimization-engine-label">
          <strong>NLopt</strong>
          <span>COBYLA · local worker</span>
        </div>
      </div>

      <div className="optimization-form">
        <label className="optimization-control">
          <span>Select objective function</span>
          <select defaultValue={MAX_MIN_OBJECTIVE_ID} disabled={isRunning}>
            <option value={MAX_MIN_OBJECTIVE_ID}>
              {MAX_MIN_OBJECTIVE_LABEL}
            </option>
          </select>
        </label>

        <label className="optimization-control">
          <span>by updating</span>
          <select
            aria-describedby="optimization-selection-help"
            multiple
            size={Math.min(Math.max(variables.length, 3), 8)}
            value={[...selectedVariableIds]}
            disabled={isRunning || variables.length === 0}
            onChange={(event) =>
              onSelectionChange(
                Array.from(
                  event.currentTarget.selectedOptions,
                  (option) => option.value,
                ),
              )
            }
          >
            {variables.map((variable) => (
              <option value={variable.id} key={variable.id}>
                {variable.name} ({variable.unit})
              </option>
            ))}
          </select>
        </label>
        <p className="optimization-help" id="optimization-selection-help">
          Select one or more variables. Use Ctrl or Command to change multiple
          selections. Selected tolerances must have compatible dimensions.
        </p>

        <div className="optimization-actions">
          <button
            className="optimize-button"
            type="button"
            disabled={!canOptimize}
            onClick={onOptimize}
          >
            {isRunning ? (
              <>
                <span className="loading-spinner" aria-hidden="true" />
                Optimizing…
              </>
            ) : state === "failed" || state === "cancelled" ? (
              "Try again"
            ) : hasSnapshot ? (
              "Run again"
            ) : (
              "Optimize"
            )}
          </button>
          {isRunning ? (
            <button className="cancel-button" type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>

        {!workflowIsValid ? (
          <p className="optimization-guidance">
            Complete validation in Stages 1–3 before optimizing.
          </p>
        ) : variables.length === 0 ? (
          <p className="optimization-guidance">
            Define at least one valid base variable to optimize.
          </p>
        ) : selectedVariableIds.length === 0 ? (
          <p className="optimization-guidance">
            Select at least one variable to enable optimization.
          </p>
        ) : null}

        <div
          ref={feedbackRef}
          className={`optimization-feedback optimization-feedback-${state}`}
          role={state === "failed" ? "alert" : "status"}
          aria-live="polite"
          aria-atomic="true"
          tabIndex={-1}
        >
          {progress ? (
            <p>
              {progress.phase === "initializing"
                ? "Initializing NLopt"
                : "Searching tolerance space"}
              {progress.evaluations > 0
                ? ` · ${progress.evaluations} candidate evaluations`
                : ""}
              {progress.elapsedMs >= 1000
                ? ` · ${Math.round(progress.elapsedMs / 100) / 10} s elapsed`
                : ""}
            </p>
          ) : message ? (
            <p>{message}</p>
          ) : null}
          {diagnostics.length > 0 ? (
            <ul>
              {diagnostics.map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

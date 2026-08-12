import { useState, type RefObject } from "react";

import type { OptimizationResultSnapshot } from "../domain";
import { formatQuantity } from "../math";

interface Stage5SectionProps {
  readonly snapshot: OptimizationResultSnapshot | null;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onExport: (snapshot: OptimizationResultSnapshot) => void;
}

function quantity(value: number, unit: string | null) {
  return formatQuantity({ value, unit: unit === "1" ? null : unit });
}

export function Stage5Section({
  snapshot,
  headingRef,
  onExport,
}: Stage5SectionProps) {
  const [expandedExpressions, setExpandedExpressions] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [exportedSnapshot, setExportedSnapshot] = useState<string | null>(null);

  function toggleExpression(id: string) {
    setExpandedExpressions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section
      className="workflow-stage stage-active result-stage"
      aria-labelledby="stage-5-title"
    >
      <div className="stage-heading">
        <div className="stage-index" aria-hidden="true">
          05
        </div>
        <div>
          <p className="stage-kicker">Immutable solution snapshot</p>
          <h2 id="stage-5-title" ref={headingRef} tabIndex={-1}>
            Review the result
          </h2>
          <p>
            This self-contained record preserves the complete problem and the
            last successful solution, even if earlier inputs change later.
          </p>
        </div>
        {snapshot ? (
          <button
            className="export-button"
            type="button"
            onClick={() => {
              onExport(snapshot);
              setExportedSnapshot(snapshot.createdAt);
            }}
          >
            Export result
          </button>
        ) : null}
      </div>

      {!snapshot ? (
        <div className="result-empty">
          <p>No successful optimization result yet.</p>
          <span>Configure and run Stage 4 to create a result snapshot.</span>
        </div>
      ) : (
        <div className="snapshot-content">
          {exportedSnapshot === snapshot.createdAt ? (
            <p className="export-feedback" role="status">
              JSON export prepared. Your browser should begin the download.
            </p>
          ) : null}
          <div className="snapshot-meta">
            <span>Created {new Date(snapshot.createdAt).toLocaleString()}</span>
            <span>
              {snapshot.optimization.solver.id} ·{" "}
              {snapshot.optimization.solver.version}
            </span>
          </div>

          <section
            className="snapshot-group"
            aria-labelledby="result-variables"
          >
            <h3 id="result-variables">Base variables</h3>
            <div
              className="snapshot-table"
              role="table"
              aria-label="Optimized base variables"
            >
              <div className="snapshot-table-header" role="row">
                <span role="columnheader">Variable</span>
                <span role="columnheader">Nominal</span>
                <span role="columnheader">Tolerance</span>
                <span role="columnheader">Source</span>
              </div>
              {snapshot.variables.map((variable) => (
                <div
                  className="snapshot-table-row"
                  role="row"
                  key={variable.id}
                >
                  <strong role="cell">{variable.name}</strong>
                  <span role="cell">
                    {quantity(variable.nominal, variable.unit)}
                  </span>
                  <span role="cell">
                    ± {quantity(variable.tolerance, variable.unit)}
                  </span>
                  <span role="cell" className="snapshot-source">
                    {variable.optimized ? "Optimized" : "Copied from input"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section
            className="snapshot-group"
            aria-labelledby="result-expressions"
          >
            <h3 id="result-expressions">Derived variables</h3>
            {snapshot.expressions.length === 0 ? (
              <p className="snapshot-none">
                No derived variables were defined.
              </p>
            ) : (
              <div className="snapshot-definitions">
                {snapshot.expressions.map((expression) => {
                  const expanded = expandedExpressions.has(expression.id);
                  return (
                    <article
                      className="snapshot-expression"
                      key={expression.id}
                    >
                      <div>
                        <strong>{expression.name}</strong>
                        <code>{expression.expression}</code>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={`snapshot-expression-${expression.id}`}
                          onClick={() => toggleExpression(expression.id)}
                        >
                          Values <span aria-hidden="true">⌄</span>
                        </button>
                      </div>
                      <div
                        className={`result-disclosure${expanded ? " is-open" : ""}`}
                        id={`snapshot-expression-${expression.id}`}
                      >
                        <div>
                          <div className="result-inspector">
                            <div>
                              <span>Minimum</span>
                              <strong>
                                {quantity(expression.minimum, expression.unit)}
                              </strong>
                            </div>
                            <div>
                              <span>Nominal</span>
                              <strong>
                                {quantity(expression.nominal, expression.unit)}
                              </strong>
                            </div>
                            <div>
                              <span>Maximum</span>
                              <strong>
                                {quantity(expression.maximum, expression.unit)}
                              </strong>
                            </div>
                            <p>
                              {expression.combinationCount} combinations ·
                              inferred unit{" "}
                              <strong>
                                {expression.unit ?? "dimensionless"}
                              </strong>
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section
            className="snapshot-group"
            aria-labelledby="result-constraints"
          >
            <h3 id="result-constraints">Constraints</h3>
            {snapshot.constraints.length === 0 ? (
              <p className="snapshot-none">No constraints were defined.</p>
            ) : (
              <div className="snapshot-definitions">
                {snapshot.constraints.map((constraint, index) => (
                  <article className="snapshot-constraint" key={constraint.id}>
                    <span>C{index + 1}</span>
                    <code>{constraint.expression}</code>
                    <strong>
                      <i aria-hidden="true" />
                      All cases pass
                    </strong>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            className="snapshot-objective"
            aria-labelledby="result-objective"
          >
            <div>
              <span>Objective function</span>
              <h3 id="result-objective">{snapshot.optimization.objective}</h3>
            </div>
            <dl>
              <div>
                <dt>Updated variables</dt>
                <dd>
                  {snapshot.optimization.selectedVariables
                    .map((variable) => variable.name)
                    .join(", ")}
                </dd>
              </div>
              <div>
                <dt>Achieved minimum tolerance</dt>
                <dd>
                  {quantity(
                    snapshot.optimization.objectiveValue,
                    snapshot.optimization.objectiveUnit,
                  )}
                </dd>
              </div>
              <div>
                <dt>Evaluations</dt>
                <dd>{snapshot.optimization.solver.evaluations}</dd>
              </div>
              <div>
                <dt>Elapsed</dt>
                <dd>{Math.round(snapshot.optimization.solver.elapsedMs)} ms</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </section>
  );
}

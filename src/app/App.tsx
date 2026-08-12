import { useEffect, useRef, useState } from "react";

import {
  createInitialStage1Rows,
  createInitialStage2Rows,
  validateStage1Rows,
  validateStage2Rows,
  validateStage3Rows,
  createOptimizationResultSnapshot,
  serializeOptimizationResultSnapshot,
  type Stage1Row,
  type Stage2Row,
  type Stage3Row,
  type OptimizationResultSnapshot,
} from "../domain";
import {
  compileOptimizationProblem,
  productionSolverDescriptor,
  type CompiledOptimizationProblem,
  type OptimizationEngine,
  type OptimizationResult,
  type SolverDescriptor,
  type SolveProgress,
} from "../optimization";
import { Stage1Section } from "./Stage1Section";
import { Stage2Section } from "./Stage2Section";
import { Stage3Section } from "./Stage3Section";
import { Stage4Section, type OptimizationUiState } from "./Stage4Section";
import { Stage5Section } from "./Stage5Section";

type ValidationCycleState = "waiting" | "passed" | "failed";

interface ValidationOverrides {
  readonly stage1?: readonly Stage1Row[];
  readonly stage2?: readonly Stage2Row[];
  readonly stage3?: readonly Stage3Row[];
}

interface AppProps {
  readonly solverDescriptor?: SolverDescriptor;
}

function optimizationOutcomeMessage(result: OptimizationResult): string {
  switch (result.outcome) {
    case "succeeded":
      return `Optimization succeeded after ${result.evaluations} candidate evaluations.`;
    case "infeasible":
      return "NLopt did not find a solution that keeps every constraint green. Review conflicting constraints or adjust the starting values, then try again.";
    case "unbounded":
      return "No bounded optimum was found. Add constraints that limit the selected nominal and tolerance values, then try again.";
    case "timed_out":
      return "The search reached its time limit. Tighten the problem constraints or choose starting values closer to the expected solution, then try again.";
    case "cancelled":
      return "Optimization was cancelled. Your inputs and previous result are unchanged; the next run will start with a fresh worker.";
    case "diverged":
      return "The search exceeded TolAssist’s numeric safety limits. Add bounding constraints or use better-scaled starting values, then try again.";
    case "failed":
      return result.terminationCode === "worker_failure" ||
        result.terminationCode === "invalid_worker_response"
        ? "The NLopt worker stopped unexpectedly. Your inputs and previous result are safe. Try again to start a fresh worker."
        : "NLopt could not complete the search. Review the diagnostic details below, adjust the problem, and try again.";
  }
}

export function App({
  solverDescriptor = productionSolverDescriptor,
}: AppProps = {}) {
  const [stage1Rows, setStage1Rows] = useState<readonly Stage1Row[]>(
    createInitialStage1Rows,
  );
  const [stage2Rows, setStage2Rows] = useState<readonly Stage2Row[]>(
    createInitialStage2Rows,
  );
  const [stage3Rows, setStage3Rows] = useState<readonly Stage3Row[]>([]);
  const [validationCycle, setValidationCycle] =
    useState<ValidationCycleState>("waiting");
  const [selectedVariableIds, setSelectedVariableIds] = useState<
    readonly string[]
  >([]);
  const [optimizationState, setOptimizationState] =
    useState<OptimizationUiState>("idle");
  const [optimizationProgress, setOptimizationProgress] =
    useState<SolveProgress | null>(null);
  const [optimizationMessage, setOptimizationMessage] = useState<string | null>(
    null,
  );
  const [optimizationDiagnostics, setOptimizationDiagnostics] = useState<
    readonly string[]
  >([]);
  const [snapshot, setSnapshot] = useState<OptimizationResultSnapshot | null>(
    null,
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const engineRef = useRef<OptimizationEngine | null>(null);
  const optimizationFeedbackRef = useRef<HTMLDivElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const selectableVariables = stage1Rows.flatMap((row) =>
    row.status === "valid" && row.validated ? [row.validated] : [],
  );
  const selectableVariableIds = new Set(
    selectableVariables.map((variable) => variable.id),
  );
  const effectiveSelectedVariableIds = selectedVariableIds.filter((id) =>
    selectableVariableIds.has(id),
  );

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      void engineRef.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    if (optimizationState === "succeeded" && snapshot) {
      resultHeadingRef.current?.focus();
    } else if (
      optimizationState === "failed" ||
      optimizationState === "cancelled"
    ) {
      optimizationFeedbackRef.current?.focus();
    }
  }, [optimizationState, snapshot]);

  function validateWorkflow(overrides: ValidationOverrides = {}) {
    const nextStage1 = overrides.stage1 ?? stage1Rows;
    const nextStage2 = overrides.stage2 ?? stage2Rows;
    const nextStage3 = overrides.stage3 ?? stage3Rows;
    const stage1 = validateStage1Rows(nextStage1);
    const stage2 = validateStage2Rows(nextStage2, stage1.variables);
    const stage3 = validateStage3Rows(nextStage3, stage2.scope);
    const passed = stage1.isValid && stage2.isValid && stage3.isValid;

    setStage1Rows(stage1.rows);
    setStage2Rows(
      passed
        ? stage2.rows
        : stage2.rows.map((row) => ({ ...row, validated: undefined })),
    );
    setStage3Rows(
      passed
        ? stage3.rows
        : stage3.rows.map((row) => ({ ...row, validated: undefined })),
    );
    setValidationCycle(passed ? "passed" : "failed");
    return { stage1, stage2, stage3, passed };
  }

  function markEditing<T>(setter: (rows: readonly T[]) => void) {
    return (rows: readonly T[]) => {
      setter(rows);
      setValidationCycle("waiting");
    };
  }

  async function optimize() {
    if (
      optimizationState === "initializing" ||
      optimizationState === "solving"
    ) {
      return;
    }

    const validation = validateWorkflow();
    setOptimizationProgress(null);
    setOptimizationDiagnostics([]);

    if (!validation.passed) {
      setOptimizationState("failed");
      setOptimizationMessage(
        "Optimization was not started because Stages 1–3 contain invalid inputs.",
      );
      return;
    }

    let problem: CompiledOptimizationProblem;
    try {
      problem = compileOptimizationProblem({
        baseVariables: validation.stage1.variables,
        derivedVariables: validation.stage2.variables,
        constraints: validation.stage3.constraints,
        selectedBaseVariableIds: effectiveSelectedVariableIds,
      });
    } catch (error) {
      setOptimizationState("failed");
      setOptimizationMessage(
        error instanceof Error
          ? error.message
          : "The optimization problem could not be compiled.",
      );
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setOptimizationState("initializing");
    setOptimizationMessage(null);

    let engine: OptimizationEngine | null = null;
    try {
      engine = await solverDescriptor.load();
      engineRef.current = engine;
      const result = await engine.solve(
        problem,
        undefined,
        controller.signal,
        (progress) => {
          setOptimizationProgress(progress);
          setOptimizationState(
            progress.phase === "initializing" ? "initializing" : "solving",
          );
        },
      );
      setOptimizationProgress(null);
      setOptimizationDiagnostics(
        result.diagnostics.map((diagnostic) => diagnostic.message),
      );

      if (result.outcome === "succeeded") {
        const nextSnapshot = createOptimizationResultSnapshot(problem, result);
        setSnapshot(nextSnapshot);
        setOptimizationState("succeeded");
        setOptimizationMessage(optimizationOutcomeMessage(result));
      } else {
        setOptimizationState(
          result.outcome === "cancelled" ? "cancelled" : "failed",
        );
        setOptimizationMessage(optimizationOutcomeMessage(result));
      }
    } catch (error) {
      setOptimizationProgress(null);
      setOptimizationState(controller.signal.aborted ? "cancelled" : "failed");
      setOptimizationMessage(
        controller.signal.aborted
          ? "Optimization was cancelled. Your inputs and previous result are unchanged; the next run will start with a fresh worker."
          : error instanceof Error
            ? `NLopt could not start. Your inputs and previous result are safe. Try again. ${error.message}`
            : "The optimization engine failed.",
      );
    } finally {
      await engine?.dispose();
      if (engineRef.current === engine) engineRef.current = null;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }

  function exportSnapshot(result: OptimizationResultSnapshot) {
    const blob = new Blob([serializeOptimizationResultSnapshot(result)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = result.createdAt.replace(/[:.]/g, "-");
    link.href = url;
    link.download = `TolAssist-result-${timestamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="TolAssist home">
          Tol<span>Assist</span>
        </a>
        <p>Engineering tolerance analysis</p>
        <span className="phase-label">Local build · Phase 9</span>
      </header>

      <main className="app-shell" id="top">
        <header className="hero">
          <p className="eyebrow">Make the tolerance space explicit</p>
          <h1>Reason about every edge case.</h1>
          <p className="lede">
            Define the dimensions that shape your design, build unit-aware
            calculations, and see exactly where the tolerance space satisfies
            your requirements.
          </p>
        </header>

        <div
          className={`validation-cycle validation-cycle-${validationCycle}`}
          aria-live="polite"
        >
          <span aria-hidden="true" />
          {validationCycle === "waiting"
            ? "Validation runs across Stages 1–3 whenever an input loses focus."
            : validationCycle === "passed"
              ? "All populated inputs are valid and calculated results are current."
              : "Some inputs need attention. Calculated outputs and constraint colors are withheld."}
        </div>

        <div className="workflow">
          <Stage1Section
            rows={stage1Rows}
            onRowsChange={markEditing(setStage1Rows)}
            onStructuralChange={(rows) => validateWorkflow({ stage1: rows })}
            onValidate={validateWorkflow}
          />

          <Stage2Section
            rows={stage2Rows}
            onRowsChange={markEditing(setStage2Rows)}
            onStructuralChange={(rows) => validateWorkflow({ stage2: rows })}
            onValidate={validateWorkflow}
          />

          <Stage3Section
            rows={stage3Rows}
            onRowsChange={markEditing(setStage3Rows)}
            onStructuralChange={(rows) => validateWorkflow({ stage3: rows })}
            onValidate={validateWorkflow}
          />

          <Stage4Section
            variables={selectableVariables}
            selectedVariableIds={effectiveSelectedVariableIds}
            workflowIsValid={validationCycle === "passed"}
            state={optimizationState}
            progress={optimizationProgress}
            message={optimizationMessage}
            diagnostics={optimizationDiagnostics}
            feedbackRef={optimizationFeedbackRef}
            hasSnapshot={snapshot !== null}
            onSelectionChange={setSelectedVariableIds}
            onOptimize={() => void optimize()}
            onCancel={() => abortControllerRef.current?.abort()}
          />

          <Stage5Section
            snapshot={snapshot}
            headingRef={resultHeadingRef}
            onExport={exportSnapshot}
          />
        </div>
      </main>
    </>
  );
}

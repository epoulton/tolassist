import {
  hydrateOptimizationProblem,
  OptimizationEvaluationError,
} from "../compiler";
import type {
  OptimizationProblemDescription,
  OptimizationResult,
  OptimizationSafeguards,
  SolveProgressCallback,
} from "../contracts";
import {
  pyodideIndexUrl,
  pyodideModuleUrl,
  pyodideVersion,
  scipyAdapterId,
  scipyAdapterVersion,
  scipyVersion,
} from "./metadata";
import { scipyConstraintValue } from "./mapping";

interface PyProxyLike {
  toJs(options?: unknown): unknown;
  destroy(): void;
}

interface PyodideFacade {
  readonly version: string;
  loadPackage(name: string): Promise<void>;
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  registerJsModule(name: string, module: Record<string, unknown>): void;
  unregisterJsModule(name: string): void;
  setInterruptBuffer?(buffer: Uint8Array): void;
}

type LoadPyodide = (options: { indexURL: string }) => Promise<PyodideFacade>;

interface RawScipyResult {
  readonly x: readonly number[];
  readonly fun: number;
  readonly success: boolean;
  readonly status: number;
  readonly message: string;
  readonly nfev?: number | null;
  readonly nit?: number | null;
  readonly maxcv?: number;
}

const pythonProgram = String.raw`
import json
import numpy as np
from scipy.optimize import minimize
from tolassist_bridge import initial_vector, lower_bounds, upper_bounds, objective, constraints, iteration

_x0 = np.asarray(initial_vector.to_py(), dtype=float)
_lower = list(lower_bounds.to_py())
_upper = list(upper_bounds.to_py())
_bounds = [(float(lo), float(hi)) for lo, hi in zip(_lower, _upper)]

def _project_bounds(x):
    return np.minimum(np.maximum(x, np.asarray(_lower, dtype=float)), np.asarray(_upper, dtype=float))

def _objective(x):
    return float(objective(_project_bounds(x)))

def _constraints(x):
    return np.asarray(constraints(_project_bounds(x)).to_py(), dtype=float)

def _callback(x):
    iteration(_project_bounds(x))

_result = minimize(
    _objective,
    _x0,
    method="COBYLA",
    bounds=_bounds,
    constraints=[{"type": "ineq", "fun": _constraints}],
    callback=_callback,
    tol=1e-10,
    options={"catol": 0.0, "maxiter": int(max_evaluations), "disp": False},
)
json.dumps({
    "x": [float(value) for value in _result.x],
    "fun": float(_result.fun),
    "success": bool(_result.success),
    "status": int(_result.status),
    "message": str(_result.message),
    "nfev": int(_result.nfev) if hasattr(_result, "nfev") else None,
    "nit": int(_result.nit) if hasattr(_result, "nit") else None,
    "maxcv": float(_result.maxcv) if hasattr(_result, "maxcv") else None,
})
`;

let pyodidePromise: Promise<PyodideFacade> | undefined;
let loadedPyodide: PyodideFacade | undefined;
let runtimeInfo:
  | {
      readonly components: Readonly<Record<string, string>>;
      readonly phases: Readonly<Record<string, number>>;
    }
  | undefined;

function isProxy(value: unknown): value is PyProxyLike {
  return (
    !!value &&
    typeof value === "object" &&
    "toJs" in value &&
    "destroy" in value
  );
}

function vectorFromPython(value: unknown): number[] {
  const converted = isProxy(value) ? value.toJs() : value;
  if (
    !converted ||
    typeof (converted as ArrayLike<number>).length !== "number"
  ) {
    throw new OptimizationEvaluationError(
      "invalid_candidate",
      "SciPy supplied an invalid candidate vector.",
    );
  }
  return Array.from(converted as ArrayLike<number>, Number);
}

async function loadRuntime(): Promise<PyodideFacade> {
  if (loadedPyodide) return loadedPyodide;
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const totalStart = performance.now();
      const loaderStart = performance.now();
      const module = (await import(/* @vite-ignore */ pyodideModuleUrl)) as {
        loadPyodide: LoadPyodide;
      };
      const loaderMs = performance.now() - loaderStart;
      const runtimeStart = performance.now();
      const pyodide = await module.loadPyodide({ indexURL: pyodideIndexUrl });
      const runtimeMs = performance.now() - runtimeStart;
      if (pyodide.version !== pyodideVersion) {
        throw new Error(
          `Expected Pyodide ${pyodideVersion}, received ${pyodide.version}.`,
        );
      }
      const packageStart = performance.now();
      await pyodide.loadPackage("scipy");
      const packagesMs = performance.now() - packageStart;
      const setupStart = performance.now();
      const versionsValue = pyodide.runPython(
        "import json, platform, numpy, scipy; json.dumps({'python': platform.python_version(), 'numpy': numpy.__version__, 'scipy': scipy.__version__})",
      );
      const versions = JSON.parse(String(versionsValue)) as Record<
        string,
        string
      >;
      if (versions.scipy !== scipyVersion) {
        throw new Error(
          `Expected SciPy ${scipyVersion}, received ${versions.scipy ?? "unknown"}.`,
        );
      }
      const setupMs = performance.now() - setupStart;
      runtimeInfo = {
        components: {
          adapter: scipyAdapterVersion,
          pyodide: pyodide.version,
          python: versions.python ?? "unknown",
          numpy: versions.numpy ?? "unknown",
          scipy: versions.scipy,
        },
        phases: {
          loader: loaderMs,
          runtime: runtimeMs,
          packages: packagesMs,
          setup: setupMs,
          total: performance.now() - totalStart,
        },
      };
      loadedPyodide = pyodide;
      return pyodide;
    })();
  }
  return pyodidePromise;
}

export async function initializeScipyRuntime(
  interruptBuffer?: SharedArrayBuffer,
) {
  const startedAt = performance.now();
  const pyodide = await loadRuntime();
  if (interruptBuffer && pyodide.setInterruptBuffer) {
    pyodide.setInterruptBuffer(new Uint8Array(interruptBuffer));
  }
  return {
    id: scipyAdapterId,
    label: "SciPy COBYLA (Pyodide spike)",
    adapterVersion: scipyAdapterVersion,
    runtimeVersion: pyodide.version,
    initializationMs: performance.now() - startedAt,
    components: runtimeInfo!.components,
    initializationPhasesMs: runtimeInfo!.phases,
    runtimeResources: performance
      .getEntriesByType("resource")
      .filter((entry) => /pyodide|scipy|numpy|\.whl|\.wasm/i.test(entry.name))
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return {
          name: resource.name,
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
          decodedBodySize: resource.decodedBodySize,
        };
      }),
  } as const;
}

function canonicalizeAuxiliary(
  description: OptimizationProblemDescription,
  vector: readonly number[],
): readonly number[] {
  const result = [...vector];
  const tolerances = description.decisionVariables.flatMap((variable, index) =>
    variable.component === "tolerance" ? [result[index]!] : [],
  );
  const auxiliary = description.decisionVariables.findIndex(
    (variable) => variable.component === "auxiliary",
  );
  result[auxiliary] = Math.min(...tolerances);
  return result;
}

function errorResult(
  error: unknown,
  evaluations: number,
  elapsedMs: number,
): OptimizationResult {
  const known =
    error instanceof OptimizationEvaluationError
      ? error
      : new OptimizationEvaluationError(
          "numeric_domain",
          error instanceof Error ? error.message : "The SciPy bridge failed.",
        );
  const outcome =
    known.code === "timed_out"
      ? "timed_out"
      : known.code === "diverged"
        ? "diverged"
        : "failed";
  return {
    solverId: scipyAdapterId,
    solverVersion: scipyAdapterVersion,
    outcome,
    evaluations,
    elapsedMs,
    terminationCode: known.code,
    message: known.message,
    diagnostics: [{ code: known.code, message: known.message }],
  };
}

export async function solveWithScipy(
  description: OptimizationProblemDescription,
  safeguards: Partial<OptimizationSafeguards> | undefined,
  onProgress?: SolveProgressCallback,
): Promise<OptimizationResult> {
  const pyodide = await loadRuntime();
  const problem = hydrateOptimizationProblem(description);
  const session = problem.createEvaluationSession(safeguards);
  const merged = { ...description.safeguards, ...safeguards };
  let cachedVector: readonly number[] | undefined;
  let cachedEvaluation: ReturnType<typeof session.evaluate> | undefined;
  let bestFeasibleVector: readonly number[] | undefined;
  let bestFeasibleObjective = Number.NEGATIVE_INFINITY;
  let callbackError: unknown;
  let lastProgressAt = -Infinity;

  const evaluate = (pythonCandidate: unknown) => {
    try {
      const candidate = vectorFromPython(pythonCandidate);
      if (
        cachedVector &&
        cachedVector.length === candidate.length &&
        cachedVector.every((value, index) => value === candidate[index])
      )
        return cachedEvaluation!;
      cachedVector = candidate;
      cachedEvaluation = session.evaluate(candidate);
      if (
        cachedEvaluation.feasible &&
        cachedEvaluation.objectiveValue > bestFeasibleObjective
      ) {
        bestFeasibleVector = [...candidate];
        bestFeasibleObjective = cachedEvaluation.objectiveValue;
      }
      if (
        onProgress &&
        (session.evaluations === 1 ||
          session.evaluations % 25 === 0 ||
          session.elapsedMs - lastProgressAt >= 100)
      ) {
        lastProgressAt = session.elapsedMs;
        onProgress({
          phase: "solving",
          evaluations: session.evaluations,
          elapsedMs: session.elapsedMs,
        });
      }
      return cachedEvaluation;
    } catch (error) {
      callbackError = error;
      throw error;
    }
  };

  const byId = new Map(
    description.constraints.map((constraint) => [constraint.id, constraint]),
  );
  const bridge = {
    initial_vector: [...description.initialDecisionVector],
    lower_bounds: description.decisionVariables.map(
      (item) => item.lowerBound ?? Number.NEGATIVE_INFINITY,
    ),
    upper_bounds: description.decisionVariables.map(
      (item) => item.upperBound ?? Number.POSITIVE_INFINITY,
    ),
    objective(candidate: unknown) {
      return -evaluate(candidate).objectiveValue;
    },
    constraints(candidate: unknown) {
      return evaluate(candidate).scalarConstraints.map((item) => {
        const source = byId.get(item.id);
        if (!source)
          throw new OptimizationEvaluationError(
            "invalid_problem",
            `Missing scalar constraint “${item.id}”.`,
          );
        return scipyConstraintValue(item, source.kind);
      });
    },
    iteration(candidate: unknown) {
      evaluate(candidate);
    },
  };

  pyodide.runPython("import sys; sys.modules.pop('tolassist_bridge', None)");
  pyodide.registerJsModule("tolassist_bridge", bridge);
  try {
    pyodide.runPython(
      `max_evaluations = ${Math.trunc(merged.evaluationLimit)}`,
    );
    const rawValue = await pyodide.runPythonAsync(pythonProgram);
    const rawJson = String(rawValue);
    if (isProxy(rawValue)) rawValue.destroy();
    const raw = JSON.parse(rawJson) as RawScipyResult;
    if (!Array.isArray(raw.x) || !raw.x.every(Number.isFinite)) {
      throw new OptimizationEvaluationError(
        "invalid_candidate",
        "SciPy returned a malformed candidate.",
      );
    }
    let candidate = canonicalizeAuxiliary(description, raw.x);
    let finalEvaluation = problem.evaluate(candidate);
    const usedFeasibleFallback =
      !finalEvaluation.feasible && bestFeasibleVector !== undefined;
    if (usedFeasibleFallback) {
      candidate = canonicalizeAuxiliary(description, bestFeasibleVector!);
      finalEvaluation = problem.evaluate(candidate);
    }
    const diagnostics = [
      {
        code: "scipy_status",
        message: `SciPy status ${raw.status}: ${raw.message}`,
      },
      {
        code: "maximum_violation",
        message: String(finalEvaluation.maximumViolation),
      },
      ...(usedFeasibleFallback
        ? [
            {
              code: "best_feasible_candidate",
              message:
                "The final COBYLA boundary point was numerically infeasible; TolAssist retained the best independently feasible evaluated candidate.",
            },
          ]
        : []),
    ];
    const base = {
      solverId: scipyAdapterId,
      solverVersion: scipyAdapterVersion,
      decisionVector: candidate,
      objectiveValue: finalEvaluation.objectiveValue,
      evaluations: session.evaluations,
      ...(raw.nfev == null ? {} : { solverEvaluations: raw.nfev }),
      ...(raw.nit == null ? {} : { iterations: raw.nit }),
      elapsedMs: session.elapsedMs,
      terminationCode: `scipy_${raw.status}`,
      diagnostics,
    } as const;
    if (session.evaluations >= merged.evaluationLimit) {
      return {
        ...base,
        outcome: "failed",
        terminationCode: "evaluation_limit",
        message: "SciPy reached the configured evaluation limit.",
      };
    }
    if (raw.success && finalEvaluation.feasible) {
      return {
        ...base,
        outcome: "succeeded",
        message: "SciPy returned an independently validated feasible solution.",
      };
    }
    if (!finalEvaluation.feasible) {
      return {
        ...base,
        outcome: "infeasible",
        message:
          "SciPy returned a candidate that does not satisfy every TolAssist constraint.",
      };
    }
    return {
      ...base,
      outcome: "failed",
      message: `SciPy did not converge: ${raw.message}`,
    };
  } catch (error) {
    return errorResult(
      callbackError ?? error,
      session.evaluations,
      session.elapsedMs,
    );
  } finally {
    pyodide.runPython("import sys; sys.modules.pop('tolassist_bridge', None)");
    pyodide.unregisterJsModule("tolassist_bridge");
    pyodide.runPython("import gc; gc.collect()");
  }
}

export function disposeScipyRuntime(): void {
  loadedPyodide?.runPython("import gc; gc.collect()");
}

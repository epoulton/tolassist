import type {
  CompiledOptimizationProblem,
  EngineInfo,
  OptimizationEngine,
  OptimizationResult,
  SolveOptions,
  SolveProgressCallback,
} from "../contracts";
import { scipyAdapterId, scipyAdapterVersion } from "./metadata";
import {
  isScipyWorkerResponse,
  scipyWorkerProtocolVersion,
  type ScipyWorkerRequest,
  type ScipyWorkerResponse,
} from "./protocol";

interface PendingRequest {
  readonly resolve: (response: ScipyWorkerResponse) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress: SolveProgressCallback | undefined;
}

let requestNumber = 0;
function nextId(): string {
  requestNumber += 1;
  return `scipy-${requestNumber}`;
}

function immediateResult(
  outcome: "cancelled" | "failed" | "timed_out",
  code: string,
  message: string,
  elapsedMs = 0,
): OptimizationResult {
  return {
    solverId: scipyAdapterId,
    solverVersion: scipyAdapterVersion,
    outcome,
    evaluations: 0,
    elapsedMs,
    terminationCode: code,
    message,
    diagnostics: [{ code, message }],
  };
}

export class ScipyOptimizationEngine implements OptimizationEngine {
  readonly id = scipyAdapterId;
  readonly version = scipyAdapterVersion;
  #worker: Worker | undefined;
  #pending = new Map<string, PendingRequest>();
  #initializePromise: Promise<EngineInfo> | undefined;
  #activeSolve = false;
  #interruptBuffer: SharedArrayBuffer | undefined;

  #ensureWorker(): Worker {
    if (this.#worker) return this.#worker;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      name: "tolassist-scipy",
    });
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (!isScipyWorkerResponse(event.data)) {
        this.#failWorker(
          new Error("The SciPy worker returned an invalid message."),
        );
        return;
      }
      const response = event.data;
      const pending = this.#pending.get(response.requestId);
      if (!pending) return;
      if (response.type === "progress") {
        pending.onProgress?.(response.progress);
        return;
      }
      this.#pending.delete(response.requestId);
      if (response.type === "error")
        pending.reject(new Error(`${response.code}: ${response.message}`));
      else pending.resolve(response);
    });
    worker.addEventListener("error", (event) => {
      this.#failWorker(new Error(event.message || "The SciPy worker crashed."));
    });
    this.#worker = worker;
    return worker;
  }

  #failWorker(error: Error): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#initializePromise = undefined;
    this.#interruptBuffer = undefined;
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  #send(
    request: ScipyWorkerRequest,
    onProgress?: SolveProgressCallback,
  ): Promise<ScipyWorkerResponse> {
    return new Promise((resolve, reject) => {
      this.#pending.set(request.requestId, { resolve, reject, onProgress });
      this.#ensureWorker().postMessage(request);
    });
  }

  initialize(): Promise<EngineInfo> {
    if (this.#initializePromise) return this.#initializePromise;
    if (typeof SharedArrayBuffer !== "undefined")
      this.#interruptBuffer = new SharedArrayBuffer(1);
    const requestId = nextId();
    this.#initializePromise = this.#send({
      protocolVersion: scipyWorkerProtocolVersion,
      requestId,
      type: "initialize",
      ...(this.#interruptBuffer
        ? { interruptBuffer: this.#interruptBuffer }
        : {}),
    }).then((response) => {
      if (response.type !== "initialized")
        throw new Error(
          "The SciPy worker did not return initialization metadata.",
        );
      return response.info;
    });
    return this.#initializePromise;
  }

  async solve(
    problem: CompiledOptimizationProblem,
    options: SolveOptions = {},
    signal?: AbortSignal,
    onProgress?: SolveProgressCallback,
  ): Promise<OptimizationResult> {
    if (this.#activeSolve)
      return immediateResult(
        "failed",
        "engine_busy",
        "The SciPy engine is already solving another problem.",
      );
    if (signal?.aborted)
      return immediateResult(
        "cancelled",
        "aborted",
        "Optimization was cancelled before it started.",
      );
    this.#activeSolve = true;
    const startedAt = performance.now();
    const safeguards = {
      ...problem.description.safeguards,
      ...options.safeguards,
    };
    try {
      onProgress?.({ phase: "initializing", evaluations: 0, elapsedMs: 0 });
      await this.initialize();
      if (this.#interruptBuffer) new Uint8Array(this.#interruptBuffer)[0] = 0;
      const requestId = nextId();
      const responsePromise = this.#send(
        {
          protocolVersion: scipyWorkerProtocolVersion,
          requestId,
          type: "solve",
          description: problem.description,
          ...(options.safeguards ? { safeguards: options.safeguards } : {}),
        },
        onProgress,
      );
      const response = await new Promise<ScipyWorkerResponse>(
        (resolve, reject) => {
          let settled = false;
          const finish = (value: ScipyWorkerResponse) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(hardTimeout);
            window.clearTimeout(abortFallback);
            signal?.removeEventListener("abort", abort);
            resolve(value);
          };
          const hardTimeout = window.setTimeout(() => {
            this.#failWorker(
              new Error("The SciPy worker exceeded its hard timeout."),
            );
            finish({
              protocolVersion: scipyWorkerProtocolVersion,
              requestId,
              type: "result",
              result: immediateResult(
                "timed_out",
                "worker_hard_timeout",
                "Optimization exceeded its hard worker timeout.",
                performance.now() - startedAt,
              ),
            });
          }, safeguards.timeLimitMs + 250);
          let abortFallback = 0;
          const abort = () => {
            if (this.#interruptBuffer)
              new Uint8Array(this.#interruptBuffer)[0] = 2;
            abortFallback = window.setTimeout(() => {
              this.#failWorker(new Error("Optimization cancelled."));
              finish({
                protocolVersion: scipyWorkerProtocolVersion,
                requestId,
                type: "result",
                result: immediateResult(
                  "cancelled",
                  "aborted",
                  "Optimization was cancelled.",
                  performance.now() - startedAt,
                ),
              });
            }, 100);
          };
          signal?.addEventListener("abort", abort, { once: true });
          void responsePromise.then(
            (value) => {
              if (signal?.aborted) {
                this.#failWorker(new Error("Optimization cancelled."));
                finish({
                  protocolVersion: scipyWorkerProtocolVersion,
                  requestId,
                  type: "result",
                  result: immediateResult(
                    "cancelled",
                    "aborted",
                    "Optimization was cancelled.",
                    performance.now() - startedAt,
                  ),
                });
              } else finish(value);
            },
            (error) => {
              if (signal?.aborted) {
                this.#failWorker(new Error("Optimization cancelled."));
                finish({
                  protocolVersion: scipyWorkerProtocolVersion,
                  requestId,
                  type: "result",
                  result: immediateResult(
                    "cancelled",
                    "aborted",
                    "Optimization was cancelled.",
                    performance.now() - startedAt,
                  ),
                });
              } else {
                reject(
                  error instanceof Error
                    ? error
                    : new Error("The SciPy worker request failed."),
                );
              }
            },
          );
        },
      );
      if (response.type !== "result")
        return immediateResult(
          "failed",
          "invalid_worker_response",
          "The SciPy worker did not return a solve result.",
          performance.now() - startedAt,
        );
      return response.result;
    } catch (error) {
      return immediateResult(
        "failed",
        "worker_failure",
        error instanceof Error ? error.message : "The SciPy worker failed.",
        performance.now() - startedAt,
      );
    } finally {
      this.#activeSolve = false;
    }
  }

  async dispose(): Promise<void> {
    if (!this.#worker) return;
    const requestId = nextId();
    try {
      await this.#send({
        protocolVersion: scipyWorkerProtocolVersion,
        requestId,
        type: "dispose",
      });
    } finally {
      this.#worker?.terminate();
      this.#worker = undefined;
      this.#initializePromise = undefined;
      this.#interruptBuffer = undefined;
    }
  }
}

import type {
  CompiledOptimizationProblem,
  EngineInfo,
  OptimizationEngine,
  OptimizationResult,
  SolveOptions,
  SolveProgressCallback,
} from "../contracts";
import {
  isNloptWorkerResponse,
  nloptWorkerProtocolVersion,
  type NloptWorkerRequest,
  type NloptWorkerResponse,
} from "./protocol";
import { nloptAdapterId, nloptAdapterVersion } from "./metadata";

interface PendingRequest {
  readonly resolve: (response: NloptWorkerResponse) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress: SolveProgressCallback | undefined;
}

let nextRequestNumber = 0;

function requestId(): string {
  nextRequestNumber += 1;
  return `nlopt-${nextRequestNumber}`;
}

function immediateResult(
  outcome: "cancelled" | "failed" | "timed_out",
  code: string,
  message: string,
  elapsedMs = 0,
): OptimizationResult {
  return {
    solverId: nloptAdapterId,
    solverVersion: nloptAdapterVersion,
    outcome,
    evaluations: 0,
    elapsedMs,
    terminationCode: code,
    message,
    diagnostics: [{ code, message }],
  };
}

export class NloptOptimizationEngine implements OptimizationEngine {
  readonly id = nloptAdapterId;
  readonly version = nloptAdapterVersion;
  #worker: Worker | undefined;
  #pending = new Map<string, PendingRequest>();
  #initializePromise: Promise<EngineInfo> | undefined;
  #activeSolve = false;

  #ensureWorker(): Worker {
    if (this.#worker) return this.#worker;
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      name: "tolassist-nlopt",
    });
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (!isNloptWorkerResponse(event.data)) {
        this.#failWorker(
          new Error("The NLopt worker returned an invalid message."),
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
      if (response.type === "error") {
        pending.reject(new Error(`${response.code}: ${response.message}`));
      } else {
        pending.resolve(response);
      }
    });
    worker.addEventListener("error", (event) => {
      this.#failWorker(new Error(event.message || "The NLopt worker crashed."));
    });
    this.#worker = worker;
    return worker;
  }

  #failWorker(error: Error): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#initializePromise = undefined;
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  #send(
    request: NloptWorkerRequest,
    onProgress?: SolveProgressCallback,
  ): Promise<NloptWorkerResponse> {
    return new Promise((resolve, reject) => {
      this.#pending.set(request.requestId, { resolve, reject, onProgress });
      this.#ensureWorker().postMessage(request);
    });
  }

  initialize(): Promise<EngineInfo> {
    if (this.#initializePromise) return this.#initializePromise;
    const id = requestId();
    this.#initializePromise = this.#send({
      protocolVersion: nloptWorkerProtocolVersion,
      requestId: id,
      type: "initialize",
    }).then((response) => {
      if (response.type !== "initialized") {
        throw new Error(
          "The NLopt worker did not return initialization metadata.",
        );
      }
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
    if (this.#activeSolve) {
      return immediateResult(
        "failed",
        "engine_busy",
        "The NLopt engine is already solving another problem.",
      );
    }
    if (signal?.aborted) {
      return immediateResult(
        "cancelled",
        "aborted",
        "Optimization was cancelled before it started.",
      );
    }
    this.#activeSolve = true;
    const startedAt = performance.now();
    const safeguards = {
      ...problem.description.safeguards,
      ...options.safeguards,
    };
    try {
      onProgress?.({ phase: "initializing", evaluations: 0, elapsedMs: 0 });
      await this.initialize();
      const id = requestId();
      const hardTimeoutMs = safeguards.timeLimitMs + 250;
      const responsePromise = this.#send(
        {
          protocolVersion: nloptWorkerProtocolVersion,
          requestId: id,
          type: "solve",
          description: problem.description,
          ...(options.safeguards ? { safeguards: options.safeguards } : {}),
        },
        onProgress,
      );
      const result = await new Promise<NloptWorkerResponse>(
        (resolve, reject) => {
          const timeout = window.setTimeout(() => {
            this.#failWorker(
              new Error("The NLopt worker exceeded its hard timeout."),
            );
            resolve({
              protocolVersion: nloptWorkerProtocolVersion,
              requestId: id,
              type: "result",
              result: immediateResult(
                "timed_out",
                "worker_hard_timeout",
                "Optimization exceeded its hard worker timeout.",
                performance.now() - startedAt,
              ),
            });
          }, hardTimeoutMs);
          const abort = () => {
            window.clearTimeout(timeout);
            this.#failWorker(new Error("Optimization cancelled."));
            resolve({
              protocolVersion: nloptWorkerProtocolVersion,
              requestId: id,
              type: "result",
              result: immediateResult(
                "cancelled",
                "aborted",
                "Optimization was cancelled.",
                performance.now() - startedAt,
              ),
            });
          };
          signal?.addEventListener("abort", abort, { once: true });
          void responsePromise.then(resolve, reject).finally(() => {
            window.clearTimeout(timeout);
            signal?.removeEventListener("abort", abort);
          });
        },
      );
      if (result.type !== "result") {
        return immediateResult(
          "failed",
          "invalid_worker_response",
          "The NLopt worker did not return a solve result.",
          performance.now() - startedAt,
        );
      }
      return result.result;
    } catch (error) {
      return immediateResult(
        "failed",
        "worker_failure",
        error instanceof Error ? error.message : "The NLopt worker failed.",
        performance.now() - startedAt,
      );
    } finally {
      this.#activeSolve = false;
    }
  }

  async dispose(): Promise<void> {
    if (!this.#worker) return;
    const id = requestId();
    try {
      await this.#send({
        protocolVersion: nloptWorkerProtocolVersion,
        requestId: id,
        type: "dispose",
      });
    } finally {
      this.#worker?.terminate();
      this.#worker = undefined;
      this.#initializePromise = undefined;
    }
  }
}

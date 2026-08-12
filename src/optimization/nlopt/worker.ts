/// <reference lib="webworker" />

import {
  disposeNloptRuntime,
  initializeNloptRuntime,
  solveWithNlopt,
} from "./runtime";
import {
  nloptWorkerProtocolVersion,
  isNloptWorkerRequest,
  type NloptWorkerResponse,
} from "./protocol";

const worker = self as DedicatedWorkerGlobalScope;
let activeSolve = false;

function respond(response: NloptWorkerResponse) {
  worker.postMessage(response);
}

worker.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isNloptWorkerRequest(event.data)) {
    const request = event.data as { requestId?: unknown } | null;
    respond({
      protocolVersion: nloptWorkerProtocolVersion,
      requestId:
        request && typeof request.requestId === "string"
          ? request.requestId
          : "unknown",
      type: "error",
      code: "invalid_worker_message",
      message: "The NLopt worker received an invalid protocol message.",
    });
    return;
  }
  const request = event.data;

  if (request.type === "initialize") {
    void initializeNloptRuntime()
      .then((info) => {
        respond({
          protocolVersion: nloptWorkerProtocolVersion,
          requestId: request.requestId,
          type: "initialized",
          info,
        });
      })
      .catch((error: unknown) => {
        respond({
          protocolVersion: nloptWorkerProtocolVersion,
          requestId: request.requestId,
          type: "error",
          code: "initialization_failed",
          message:
            error instanceof Error
              ? error.message
              : "The NLopt runtime failed to initialize.",
        });
      });
    return;
  }

  if (request.type === "dispose") {
    disposeNloptRuntime();
    respond({
      protocolVersion: nloptWorkerProtocolVersion,
      requestId: request.requestId,
      type: "disposed",
    });
    return;
  }

  if (activeSolve) {
    respond({
      protocolVersion: nloptWorkerProtocolVersion,
      requestId: request.requestId,
      type: "error",
      code: "engine_busy",
      message: "The NLopt worker is already solving another problem.",
    });
    return;
  }

  activeSolve = true;
  void solveWithNlopt(request.description, request.safeguards, (progress) => {
    respond({
      protocolVersion: nloptWorkerProtocolVersion,
      requestId: request.requestId,
      type: "progress",
      progress,
    });
  })
    .then((result) => {
      respond({
        protocolVersion: nloptWorkerProtocolVersion,
        requestId: request.requestId,
        type: "result",
        result,
      });
    })
    .catch((error: unknown) => {
      respond({
        protocolVersion: nloptWorkerProtocolVersion,
        requestId: request.requestId,
        type: "error",
        code: "worker_solve_failed",
        message:
          error instanceof Error ? error.message : "The NLopt solve failed.",
      });
    })
    .finally(() => {
      activeSolve = false;
    });
});

export {};

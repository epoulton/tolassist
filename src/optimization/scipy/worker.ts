/// <reference lib="webworker" />

import {
  disposeScipyRuntime,
  initializeScipyRuntime,
  solveWithScipy,
} from "./runtime";
import {
  isScipyWorkerRequest,
  scipyWorkerProtocolVersion,
  type ScipyWorkerResponse,
} from "./protocol";

const scope = self as DedicatedWorkerGlobalScope;
let activeSolve = false;

function send(response: ScipyWorkerResponse): void {
  scope.postMessage(response);
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  void (async () => {
    if (!isScipyWorkerRequest(event.data)) {
      send({
        protocolVersion: scipyWorkerProtocolVersion,
        requestId:
          typeof (event.data as { requestId?: unknown })?.requestId === "string"
            ? (event.data as { requestId: string }).requestId
            : "unknown",
        type: "error",
        code: "invalid_message",
        message: "The SciPy worker received an invalid message.",
      });
      return;
    }
    const request = event.data;
    try {
      if (request.type === "initialize") {
        const info = await initializeScipyRuntime(request.interruptBuffer);
        send({
          protocolVersion: scipyWorkerProtocolVersion,
          requestId: request.requestId,
          type: "initialized",
          info,
        });
        return;
      }
      if (request.type === "dispose") {
        disposeScipyRuntime();
        send({
          protocolVersion: scipyWorkerProtocolVersion,
          requestId: request.requestId,
          type: "disposed",
        });
        scope.close();
        return;
      }
      if (activeSolve) {
        send({
          protocolVersion: scipyWorkerProtocolVersion,
          requestId: request.requestId,
          type: "error",
          code: "engine_busy",
          message: "The SciPy worker is already solving.",
        });
        return;
      }
      activeSolve = true;
      try {
        const result = await solveWithScipy(
          request.description,
          request.safeguards,
          (progress) => {
            send({
              protocolVersion: scipyWorkerProtocolVersion,
              requestId: request.requestId,
              type: "progress",
              progress,
            });
          },
        );
        send({
          protocolVersion: scipyWorkerProtocolVersion,
          requestId: request.requestId,
          type: "result",
          result,
        });
      } finally {
        activeSolve = false;
      }
    } catch (error) {
      send({
        protocolVersion: scipyWorkerProtocolVersion,
        requestId: request.requestId,
        type: "error",
        code: "worker_error",
        message:
          error instanceof Error ? error.message : "The SciPy worker failed.",
      });
    }
  })();
});

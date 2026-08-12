import type {
  EngineInfo,
  OptimizationProblemDescription,
  OptimizationResult,
  OptimizationSafeguards,
  SolveProgress,
} from "../contracts";

export const scipyWorkerProtocolVersion = 1;

interface RequestBase {
  readonly protocolVersion: typeof scipyWorkerProtocolVersion;
  readonly requestId: string;
}

export type ScipyWorkerRequest =
  | (RequestBase & {
      readonly type: "initialize";
      readonly interruptBuffer?: SharedArrayBuffer;
    })
  | (RequestBase & {
      readonly type: "solve";
      readonly description: OptimizationProblemDescription;
      readonly safeguards?: Partial<OptimizationSafeguards>;
    })
  | (RequestBase & { readonly type: "dispose" });

export function isScipyWorkerRequest(
  value: unknown,
): value is ScipyWorkerRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    protocolVersion?: unknown;
    requestId?: unknown;
    type?: unknown;
    description?: { schemaVersion?: unknown };
  };
  if (
    candidate.protocolVersion !== scipyWorkerProtocolVersion ||
    typeof candidate.requestId !== "string" ||
    !["initialize", "solve", "dispose"].includes(String(candidate.type))
  )
    return false;
  return (
    candidate.type !== "solve" || candidate.description?.schemaVersion === 1
  );
}

interface ResponseBase {
  readonly protocolVersion: typeof scipyWorkerProtocolVersion;
  readonly requestId: string;
}

export type ScipyWorkerResponse =
  | (ResponseBase & { readonly type: "initialized"; readonly info: EngineInfo })
  | (ResponseBase & {
      readonly type: "progress";
      readonly progress: SolveProgress;
    })
  | (ResponseBase & {
      readonly type: "result";
      readonly result: OptimizationResult;
    })
  | (ResponseBase & { readonly type: "disposed" })
  | (ResponseBase & {
      readonly type: "error";
      readonly code: string;
      readonly message: string;
    });

export function isScipyWorkerResponse(
  value: unknown,
): value is ScipyWorkerResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ScipyWorkerResponse>;
  return (
    candidate.protocolVersion === scipyWorkerProtocolVersion &&
    typeof candidate.requestId === "string" &&
    ["initialized", "progress", "result", "disposed", "error"].includes(
      String(candidate.type),
    )
  );
}

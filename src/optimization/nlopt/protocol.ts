import type {
  EngineInfo,
  OptimizationProblemDescription,
  OptimizationResult,
  OptimizationSafeguards,
  SolveProgress,
} from "../contracts";

export const nloptWorkerProtocolVersion = 1;

interface WorkerRequestBase {
  readonly protocolVersion: typeof nloptWorkerProtocolVersion;
  readonly requestId: string;
}

export type NloptWorkerRequest =
  | (WorkerRequestBase & { readonly type: "initialize" })
  | (WorkerRequestBase & {
      readonly type: "solve";
      readonly description: OptimizationProblemDescription;
      readonly safeguards?: Partial<OptimizationSafeguards>;
    })
  | (WorkerRequestBase & { readonly type: "dispose" });

export function isNloptWorkerRequest(
  value: unknown,
): value is NloptWorkerRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    protocolVersion?: unknown;
    requestId?: unknown;
    type?: unknown;
    description?: { schemaVersion?: unknown };
  };
  if (
    candidate.protocolVersion !== nloptWorkerProtocolVersion ||
    typeof candidate.requestId !== "string" ||
    !["initialize", "solve", "dispose"].includes(String(candidate.type))
  ) {
    return false;
  }
  return (
    candidate.type !== "solve" || candidate.description?.schemaVersion === 1
  );
}

interface WorkerResponseBase {
  readonly protocolVersion: typeof nloptWorkerProtocolVersion;
  readonly requestId: string;
}

export type NloptWorkerResponse =
  | (WorkerResponseBase & {
      readonly type: "initialized";
      readonly info: EngineInfo;
    })
  | (WorkerResponseBase & {
      readonly type: "progress";
      readonly progress: SolveProgress;
    })
  | (WorkerResponseBase & {
      readonly type: "result";
      readonly result: OptimizationResult;
    })
  | (WorkerResponseBase & {
      readonly type: "disposed";
    })
  | (WorkerResponseBase & {
      readonly type: "error";
      readonly code: string;
      readonly message: string;
    });

export function isNloptWorkerResponse(
  value: unknown,
): value is NloptWorkerResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NloptWorkerResponse>;
  return (
    candidate.protocolVersion === nloptWorkerProtocolVersion &&
    typeof candidate.requestId === "string" &&
    ["initialized", "progress", "result", "disposed", "error"].includes(
      String(candidate.type),
    )
  );
}

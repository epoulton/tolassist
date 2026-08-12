import { describe, expect, it } from "vitest";
import {
  isScipyWorkerRequest,
  isScipyWorkerResponse,
  scipyWorkerProtocolVersion,
} from "./protocol";

describe("SciPy worker protocol", () => {
  it("accepts versioned requests and rejects malformed payloads", () => {
    expect(
      isScipyWorkerRequest({
        protocolVersion: scipyWorkerProtocolVersion,
        requestId: "1",
        type: "initialize",
      }),
    ).toBe(true);
    expect(
      isScipyWorkerRequest({
        protocolVersion: 99,
        requestId: "1",
        type: "initialize",
      }),
    ).toBe(false);
    expect(
      isScipyWorkerRequest({
        protocolVersion: scipyWorkerProtocolVersion,
        requestId: "1",
        type: "solve",
        description: { schemaVersion: 2 },
      }),
    ).toBe(false);
  });

  it("accepts only recognized versioned responses", () => {
    expect(
      isScipyWorkerResponse({
        protocolVersion: scipyWorkerProtocolVersion,
        requestId: "1",
        type: "disposed",
      }),
    ).toBe(true);
    expect(
      isScipyWorkerResponse({
        protocolVersion: scipyWorkerProtocolVersion,
        requestId: "1",
        type: "surprise",
      }),
    ).toBe(false);
  });
});

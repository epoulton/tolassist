import { describe, expect, it } from "vitest";
import {
  isNloptWorkerRequest,
  isNloptWorkerResponse,
  nloptWorkerProtocolVersion,
} from "./protocol";

describe("NLopt worker protocol", () => {
  it("accepts versioned requests and rejects malformed messages", () => {
    expect(
      isNloptWorkerRequest({
        protocolVersion: nloptWorkerProtocolVersion,
        requestId: "one",
        type: "initialize",
      }),
    ).toBe(true);
    expect(
      isNloptWorkerRequest({
        protocolVersion: nloptWorkerProtocolVersion,
        requestId: "two",
        type: "solve",
      }),
    ).toBe(false);
    expect(
      isNloptWorkerRequest({
        protocolVersion: 999,
        requestId: "three",
        type: "dispose",
      }),
    ).toBe(false);
  });

  it("accepts only known response variants", () => {
    expect(
      isNloptWorkerResponse({
        protocolVersion: nloptWorkerProtocolVersion,
        requestId: "one",
        type: "disposed",
      }),
    ).toBe(true);
    expect(
      isNloptWorkerResponse({
        protocolVersion: nloptWorkerProtocolVersion,
        requestId: "one",
        type: "mystery",
      }),
    ).toBe(false);
  });
});

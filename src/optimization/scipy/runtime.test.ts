import { describe, expect, it } from "vitest";
import { scipyConstraintValue } from "./mapping";

describe("SciPy constraint conversion", () => {
  it("converts TolAssist residual <= 0 into SciPy value >= 0", () => {
    const value = scipyConstraintValue(
      { id: "c", residual: -2, allowedError: 0, violation: 0 },
      "inequality",
    );
    expect(value).toBeGreaterThan(1.999999999999);
  });

  it("incorporates equality allowance before registration", () => {
    const inside = scipyConstraintValue(
      { id: "c", residual: 0.2, allowedError: 0.5, violation: 0 },
      "equality",
    );
    const outside = scipyConstraintValue(
      { id: "c", residual: 0.6, allowedError: 0.5, violation: 0.1 },
      "equality",
    );
    expect(inside).toBeGreaterThan(0);
    expect(outside).toBeLessThan(0);
  });
});

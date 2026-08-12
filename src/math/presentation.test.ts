import { describe, expect, it } from "vitest";

import { formatQuantity } from ".";

describe("formatQuantity", () => {
  it("uses readable engineering prefixes", () => {
    expect(formatQuantity({ value: 0.01, unit: "m" })).toBe("10 mm");
    expect(formatQuantity({ value: 10_000, unit: "m" })).toBe("10 km");
  });

  it("formats dimensionless values without a unit", () => {
    expect(formatQuantity({ value: Math.PI, unit: null })).toBe("3.1415927");
  });
});

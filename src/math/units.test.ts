import { describe, expect, it } from "vitest";

import { mathJsUnitParser, unitSyntaxParser } from ".";

describe("unitSyntaxParser", () => {
  it("normalizes familiar engineering unit syntax", () => {
    expect(unitSyntaxParser.parse("  kg * m / s^2  ")).toEqual({
      ok: true,
      unit: {
        source: "  kg * m / s^2  ",
        canonical: "kg * m / s^2",
      },
    });
  });

  it("rejects empty, unsafe, and unbalanced syntax", () => {
    expect(unitSyntaxParser.parse("").ok).toBe(false);
    expect(unitSyntaxParser.parse("mm<script>").ok).toBe(false);
    expect(unitSyntaxParser.parse("kg/(m*s").ok).toBe(false);
  });
});

describe("mathJsUnitParser", () => {
  it("accepts known simple, compound, and dimensionless units", () => {
    expect(mathJsUnitParser.parse("mm").ok).toBe(true);
    expect(mathJsUnitParser.parse("kg*m/s^2").ok).toBe(true);
    expect(mathJsUnitParser.parse("1").ok).toBe(true);
  });

  it("rejects syntactically plausible but unknown units", () => {
    const result = mathJsUnitParser.parse("madeUpUnit");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not recognized/i);
  });
});

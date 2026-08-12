import { describe, expect, it, vi } from "vitest";

import {
  comparisonSolverRegistry,
  findComparisonSolverDescriptor,
  nloptSolverDescriptor,
  productionSolverDescriptor,
  productionSolverId,
  scipySolverDescriptor,
} from "./registry";

describe("solver selection policy", () => {
  it("selects only NLopt as the production solver", () => {
    expect(productionSolverId).toBe("nlopt-cobyla");
    expect(productionSolverDescriptor).toBe(nloptSolverDescriptor);
    expect(productionSolverDescriptor.id).toBe(productionSolverId);
    expect(productionSolverDescriptor.label).toBe("NLopt COBYLA");
  });

  it("retains both engines only in the comparison registry", () => {
    expect(comparisonSolverRegistry).toEqual([
      nloptSolverDescriptor,
      scipySolverDescriptor,
    ]);
    expect(findComparisonSolverDescriptor("nlopt-cobyla")).toBe(
      nloptSolverDescriptor,
    );
    expect(findComparisonSolverDescriptor("scipy-cobyla")).toBe(
      scipySolverDescriptor,
    );
    expect(findComparisonSolverDescriptor("unknown")).toBeUndefined();
    expect(scipySolverDescriptor.label).toContain("benchmark only");
  });

  it("does not evaluate concrete adapters when the policy module loads", async () => {
    vi.resetModules();
    vi.doMock("./nlopt/engine", () => {
      throw new Error("NLopt adapter was imported eagerly.");
    });
    vi.doMock("./scipy/engine", () => {
      throw new Error("SciPy adapter was imported eagerly.");
    });

    const policy = await import("./registry");

    expect(policy.productionSolverId).toBe("nlopt-cobyla");
    expect(policy.comparisonSolverRegistry).toHaveLength(2);
  });
});

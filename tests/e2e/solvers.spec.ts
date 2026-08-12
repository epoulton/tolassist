import { expect, test } from "@playwright/test";

type SolverId = "nlopt-cobyla" | "scipy-cobyla";
interface BrowserHarness {
  runCorrectnessSuite(
    id: SolverId,
  ): Promise<readonly { id: string; accepted: boolean }[]>;
  runFixture(
    id: SolverId,
    fixture: string,
  ): Promise<{
    failures: readonly string[];
    result: { objectiveValue?: number };
    snapshot: { constraints: readonly { status: string }[] } | null;
  }>;
  testCancellationRecovery(id: SolverId): Promise<{
    busy: { outcome: string; terminationCode?: string };
    cancelled: { outcome: string };
    recovered: { outcome: string };
  }>;
}

test.describe.configure({ mode: "serial" });

for (const solverId of ["nlopt-cobyla", "scipy-cobyla"] as const) {
  test(`${solverId} passes the strengthened numerical correctness suite`, async ({
    page,
  }) => {
    test.setTimeout(solverId === "scipy-cobyla" ? 180_000 : 45_000);
    await page.goto("/benchmark.html");
    const runs = await page.evaluate(
      async (id: SolverId) =>
        (
          globalThis as typeof globalThis & { tolAssistSolvers: BrowserHarness }
        ).tolAssistSolvers.runCorrectnessSuite(id),
      solverId,
    );
    const failures = runs.filter((run) => !run.accepted);
    if (solverId === "nlopt-cobyla") {
      expect(failures, JSON.stringify(runs, null, 2)).toEqual([]);
    } else {
      expect(failures.map((run) => run.id)).toEqual([
        "max-min-tradeoff",
        "equality-tolerance",
        "broadcast-constraint",
        "zero-tolerance-bound",
      ]);
    }
  });

  test(`${solverId} creates a complete snapshot for a known optimum`, async ({
    page,
  }) => {
    test.setTimeout(solverId === "scipy-cobyla" ? 120_000 : 30_000);
    await page.goto("/benchmark.html");
    const run = await page.evaluate(
      async (id: SolverId) =>
        (
          globalThis as typeof globalThis & { tolAssistSolvers: BrowserHarness }
        ).tolAssistSolvers.runFixture(id, "finite-one-variable"),
      solverId,
    );
    expect(run.failures, JSON.stringify(run, null, 2)).toEqual([]);
    expect(run.result.objectiveValue).toBeCloseTo(5, 5);
    expect(run.snapshot).not.toBeNull();
    expect(
      run.snapshot?.constraints.every((item) => item.status === "green"),
    ).toBe(true);
  });

  test(`${solverId} cancellation recovers with a fresh worker`, async ({
    page,
  }) => {
    test.setTimeout(solverId === "scipy-cobyla" ? 120_000 : 30_000);
    await page.goto("/benchmark.html");
    const run = await page.evaluate(
      async (id: SolverId) =>
        (
          globalThis as typeof globalThis & { tolAssistSolvers: BrowserHarness }
        ).tolAssistSolvers.testCancellationRecovery(id),
      solverId,
    );
    expect(run.busy).toMatchObject({
      outcome: "failed",
      terminationCode: "engine_busy",
    });
    expect(run.cancelled.outcome).toBe("cancelled");
    expect(run.recovered.outcome).toBe("succeeded");
  });
}

test("preview is cross-origin isolated for Pyodide interruption", async ({
  page,
}) => {
  await page.goto("/benchmark.html");
  expect(
    await page.evaluate(
      () =>
        (globalThis as typeof globalThis & { crossOriginIsolated: boolean })
          .crossOriginIsolated,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe("function");
});

test("the product entry loads neither concrete solver runtime", async ({
  page,
}) => {
  await page.goto("/");
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(
    resources.some((name) => /worker|nlopt|pyodide|scipy/i.test(name)),
  ).toBe(false);
});

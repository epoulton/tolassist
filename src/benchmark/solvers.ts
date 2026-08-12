import { createOptimizationResultSnapshot } from "../domain/snapshot";
import {
  createSolverFixture,
  solverFixtureIds,
  verifySolverFixtureResult,
  type SolverFixtureId,
} from "../optimization/fixtures";
import { findComparisonSolverDescriptor } from "../optimization/registry";

export type BenchmarkSolverId = "nlopt-cobyla" | "scipy-cobyla";

const benchmarkFixtureIds: readonly SolverFixtureId[] = [
  "finite-one-variable",
  "mixed-units",
  "nonlinear-inequality",
  "poorly-scaled",
];

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ]!;
}

async function engineFor(solverId: BenchmarkSolverId) {
  const descriptor = findComparisonSolverDescriptor(solverId);
  if (!descriptor) throw new Error(`Unknown solver ${solverId}.`);
  return descriptor.load();
}

async function problemHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function runFixture(solverId: BenchmarkSolverId, id: SolverFixtureId) {
  const fixture = createSolverFixture(id);
  const engine = await engineFor(solverId);
  const info = await engine.initialize();
  const result = await engine.solve(fixture.problem);
  const failures = verifySolverFixtureResult(fixture, result);
  const snapshot =
    result.outcome === "succeeded" && failures.length === 0
      ? createOptimizationResultSnapshot(fixture.problem, result)
      : null;
  await engine.dispose();
  return {
    id,
    oracle: fixture.oracle,
    info,
    result,
    failures,
    accepted: failures.length === 0,
    snapshot,
  };
}

async function testCancellationRecovery(solverId: BenchmarkSolverId) {
  const engine = await engineFor(solverId);
  await engine.initialize();
  const runaway = createSolverFixture("unbounded");
  const controller = new AbortController();
  const cancelledPromise = engine.solve(
    runaway.problem,
    { safeguards: { timeLimitMs: 5_000, maximumAbsoluteValue: 1e100 } },
    controller.signal,
  );
  const busy = await engine.solve(
    createSolverFixture("finite-one-variable").problem,
  );
  window.setTimeout(() => controller.abort(), 0);
  const cancelled = await cancelledPromise;
  const recovered = await engine.solve(
    createSolverFixture("finite-one-variable").problem,
  );
  await engine.dispose();
  return { busy, cancelled, recovered };
}

async function runCorrectnessSuite(solverId: BenchmarkSolverId) {
  const engine = await engineFor(solverId);
  await engine.initialize();
  const results = [];
  for (const id of solverFixtureIds) {
    const fixture = createSolverFixture(id);
    const result = await engine.solve(fixture.problem, {
      safeguards: { timeLimitMs: 30_000, evaluationLimit: 5_000 },
    });
    const failures = verifySolverFixtureResult(fixture, result);
    results.push({
      id,
      oracle: fixture.oracle,
      result,
      failures,
      accepted: failures.length === 0,
    });
  }
  await engine.dispose();
  return results;
}

async function runBenchmark(solverId: BenchmarkSolverId) {
  const coldInitializationMs: number[] = [];
  let firstLoadInitializationMs = 0;
  for (let index = 0; index < 5; index += 1) {
    const engine = await engineFor(solverId);
    const startedAt = performance.now();
    await engine.initialize();
    const elapsed = performance.now() - startedAt;
    if (index === 0) firstLoadInitializationMs = elapsed;
    coldInitializationMs.push(elapsed);
    await engine.dispose();
  }
  const engine = await engineFor(solverId);
  const info = await engine.initialize();
  const warmRuns = [];
  for (let repetition = 0; repetition < 5; repetition += 1) {
    for (const id of benchmarkFixtureIds) {
      const fixture = createSolverFixture(id);
      const startedAt = performance.now();
      const result = await engine.solve(fixture.problem);
      const failures = verifySolverFixtureResult(fixture, result);
      const evaluation = result.decisionVector
        ? fixture.problem.evaluate(result.decisionVector)
        : null;
      warmRuns.push({
        fixtureId: id,
        problemHash: await problemHash(fixture.problem.description),
        initialDecisionVector:
          fixture.problem.description.initialDecisionVector,
        elapsedMs: performance.now() - startedAt,
        evaluations: result.evaluations,
        solverEvaluations: result.solverEvaluations ?? null,
        iterations: result.iterations ?? null,
        outcome: result.outcome,
        terminationCode: result.terminationCode ?? null,
        objectiveValue: result.objectiveValue ?? null,
        decisionVector: result.decisionVector ?? null,
        maximumViolation: evaluation?.maximumViolation ?? null,
        allGreen:
          evaluation?.state.constraints.every(
            (item) => item.status === "green",
          ) ?? false,
        failures,
      });
    }
  }
  await engine.dispose();
  const resources = performance
    .getEntriesByType("resource")
    .filter((entry) =>
      /worker|nlopt|pyodide|scipy|numpy|wasm|\.whl/i.test(entry.name),
    )
    .map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        name: resource.name,
        transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize,
        decodedBodySize: resource.decodedBodySize,
      };
    });
  const elapsed = warmRuns.map((run) => run.elapsedMs);
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
    }
  ).memory;
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    crossOriginIsolated,
    engine: info,
    configuration: {
      algorithm: "COBYLA",
      solverId,
      coldInitializations: 5,
      warmSolves: 20,
      benchmarkFixtureIds,
    },
    firstLoadInitializationMs,
    coldInitializationMs,
    coldMedianMs: percentile(coldInitializationMs, 0.5),
    coldP95Ms: percentile(coldInitializationMs, 0.95),
    warmRuns,
    warmMedianMs: percentile(elapsed, 0.5),
    warmP95Ms: percentile(elapsed, 0.95),
    resources,
    memory: memory
      ? {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
        }
      : null,
  };
}

window.tolAssistSolvers = {
  runFixture,
  runBenchmark,
  runCorrectnessSuite,
  testCancellationRecovery,
};

declare global {
  interface Window {
    tolAssistSolvers: {
      runFixture: typeof runFixture;
      runBenchmark: typeof runBenchmark;
      runCorrectnessSuite: typeof runCorrectnessSuite;
      testCancellationRecovery: typeof testCancellationRecovery;
    };
  }
}

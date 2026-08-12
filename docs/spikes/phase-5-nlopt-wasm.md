# Phase 5 NLopt/WASM spike

## Result

The published `nlopt-js` 0.1.1 bundle runs successfully in a Vite module worker
with narrow `globalThis` and browser `Buffer` compatibility shims. TolAssist's
twelve shared correctness fixtures execute through the worker and produce only
solver-neutral results.

Successful fixtures include finite one-variable, multi-variable max-min,
mixed-unit, nonlinear, broadcast, zero-tolerance-bound, and poorly scaled
problems. The suite also confirms infeasible classification, evaluation-limited
unconstrained runaway behavior, coordinate-aware domain errors, local-solution
sensitivity, and worker recovery after cancellation.

## Reproducible benchmark

Run `npm run benchmark:nlopt`. The command builds the local production bundle,
starts a loopback preview, performs five cold worker initializations and twenty
warm solves in Chromium, writes ignored raw JSON to
`benchmark-results/nlopt-latest.json`, and prints the same report.

Reference run on 2026-08-12 using headless Chromium 151 on Windows:

| Measurement                     |     Result |
| ------------------------------- | ---------: |
| Cold initialization median      |   236.5 ms |
| Cold initialization p95         |   292.8 ms |
| Warm solve median               |    10.0 ms |
| Warm solve p95                  |    28.8 ms |
| Worker asset, uncompressed      | 1,606.6 kB |
| Worker asset, encoded transfer  |   502.5 kB |
| Reported JS heap used after run |    20.5 MB |

All twenty warm benchmark solves succeeded. The representative fixtures used
81–135 unique candidate evaluations. Memory is Chromium-specific and is
reported as unavailable in browsers without `performance.memory`.

## Binding limitations

- The embedded NLopt version is not exposed and is recorded as unknown.
- The wrapper returns only `{ success, x, value }`, so exact upstream result
  codes and iteration counts are unavailable.
- The published optimizer prototype lacks direct `xtol`, force-stop, and
  evaluation-count getters.
- Zero convergence tolerance can end in an uncaught Emscripten exception.
- Vite reports unused Node-core imports in the legacy generated bundle; the
  browser path nonetheless passes the production-build tests.
- Unboundedness is not proven. Runaway cases terminate as diverged, timed out,
  or evaluation-limited.

These limitations should be included in the Phase 7 comparison against the
SciPy/Pyodide adapter.

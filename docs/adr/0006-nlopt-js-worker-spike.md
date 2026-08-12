# ADR 0006: NLopt-js COBYLA worker spike

- Status: Accepted for comparison
- Date: 2026-08-12

## Context

TolAssist needs to compare a browser-native NLopt path with a later
SciPy/Pyodide adapter using the same serialized Phase 4 problem. The published
`nlopt-js` package is old, minimally typed, and exposes less status information
than upstream NLopt, but it provides a compact way to test a real WebAssembly
solver without maintaining a custom build.

## Decision

Pin `nlopt-js` 0.1.1 and run its deterministic `LN_COBYLA` implementation in a
dedicated module worker. Load the adapter through the solver registry only on
demand. Hydrate and compile the serialized TolAssist evaluation plan inside the
worker, cache complete candidate evaluations, minimize the negated auxiliary
objective, and expose all scalar comparisons as `c(x) <= 0` callbacks.

Equality constraints use `abs(residual) - allowedError`. Constraint callbacks
add a 64-ULP-scale inward numerical margin so a nominally converged boundary
point can pass TolAssist's stricter independent feasibility check. Only the
auxiliary objective value is canonicalized after solving.

The legacy bundle receives local `globalThis` and `Buffer` compatibility shims.
The package itself is not patched or rebuilt. Cancellation and hard timeout are
implemented by terminating the worker and recreating it for the next solve.

## Consequences

- NLopt/WASM does not execute on the UI thread or enter the initial app bundle.
- Successful results are independently re-evaluated before snapshot creation.
- The wrapper does not expose the embedded NLopt version, detailed termination
  code, evaluation count, forced stop, or the complete stopping API. TolAssist
  records these omissions explicitly and infers limit outcomes using its own
  guards.
- A zero wrapper convergence tolerance triggers an uncaught Emscripten
  exception, so the spike uses the wrapper's objective tolerance argument at
  `1e-10`.
- Upstream compilation and binding maintenance remain outside Phase 5.

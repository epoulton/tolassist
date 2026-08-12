# ADR 0007: SciPy COBYLA in a pinned Pyodide worker

- Status: Accepted for comparison with documented limitations
- Date: 2026-08-12

## Context

TolAssist needs a second established constrained optimizer that consumes the
same serialized Phase 4 problem as NLopt. The comparison must preserve the
browser-only architecture, avoid arbitrary Python evaluation, and keep the
large scientific runtime out of the product entry bundle.

## Decision

Load Pyodide 314.0.2 and SciPy 1.18.0 from the exact versioned jsDelivr URL in
a dedicated module worker. Use `scipy.optimize.minimize` with COBYLA,
`tol=1e-10`, `catol=0`, the shared evaluation limit, direct variable bounds,
the negated auxiliary objective, and one vector inequality callback.

Python executes only a fixed adapter program. TypeScript hydrates the problem,
evaluates every candidate, and converts TolAssist residuals into SciPy's
non-negative convention. User expressions never become Python source.

Cancellation first signals Pyodide through a `SharedArrayBuffer`; the main
thread terminates and recreates the worker if cooperative interruption does not
finish promptly. Development and preview servers send COOP/COEP headers.

## Consequences

- The product entry does not load Pyodide, SciPy, or the SciPy worker.
- First initialization requires network access and is substantially slower and
  larger than NLopt; offline assets remain deferred.
- Default-rhombeg PRIMA COBYLA converges prematurely on the symmetric
  two-variable max-min fixture (`0.77735 m` versus the analytical `2.5 m`).
- With `catol=0` and the required inward callback margin, equality and exact
  opposing-inequality fixtures can return a green TolAssist candidate while
  SciPy reports non-convergence. The adapter returns `failed` rather than
  overriding SciPy's status.
- These failures remain visible in the common oracle as Phase 7 comparison
  evidence; their expected answers were not weakened.

# ADR 0008: Adopt NLopt COBYLA as the production solver

- Status: Accepted
- Date: 2026-08-12

## Context

Phases 5 and 6 implemented NLopt and SciPy COBYLA behind the same serialized,
solver-neutral worker contract. The Phase 7 comparison evaluated correctness,
feasibility, diagnostics, runtime performance, payload, cancellation, browser
requirements, packaging, maintenance, and licensing.

NLopt passed all twelve deterministic analytical oracles. SciPy passed eight;
its failures include the central two-variable max-min objective and its
broadcast variant, which converged to `0.777350269 m` instead of `2.5 m`.
NLopt's measured fresh-worker median was 226 ms versus 7.16 s for SciPy, and its
warm-solve median was 10.7 ms versus 172 ms. NLopt transferred about 503 kB,
while SciPy required about 23 MB of pinned CDN runtime assets.

SciPy provides better termination diagnostics, runtime version discovery, and
a more maintainable upstream ecosystem. The published `nlopt-js` wrapper is
old and does not expose the embedded NLopt version, detailed termination codes,
iterations, or solver evaluation counts.

## Decision

Use `nlopt-cobyla` as TolAssist's sole production solver. Product code obtains
it through a metadata-only production descriptor whose `load()` method retains
the existing lazy dynamic import. Do not retry failures with another engine and
do not expose a solver selector.

Retain SciPy/Pyodide in the comparison registry for benchmarks, regression
characterization, and future engine evaluation. It is not reachable from the
product UI or domain modules.

Preserve the solver-neutral problem and result contracts. Independently
reevaluate every returned candidate, require all constraints to be green before
snapshot creation, and retain time, evaluation, divergence, cancellation, and
worker-recovery safeguards.

The npm lockfile pins `nlopt-js` 0.1.1 with artifact integrity:

`sha512-WhTbQelM5zxM3epyZayfCh9722TDInOMcbcTFbnFiHNx8/JqfGKrPhFqnZNylIPUjA6PfBM/zQqLzSvXO9YHkw==`

The package is used unchanged. Rebuilding or replacing its wrapper is outside
this decision.

## Consequences

- Phase 8 must load `productionSolverDescriptor`; it must not import a concrete
  engine or choose from the comparison registry.
- Normal application startup loads no solver worker or WebAssembly asset.
- SciPy remains available through local solver tests and benchmark commands but
  cannot act as an automatic fallback.
- NLopt's limited diagnostics and unknown embedded upstream version remain
  accepted risks. Distribution must audit the bundled NLopt provenance and
  satisfy LGPL notice and source-delivery obligations.
- A future engine may replace NLopt only after passing the same frozen
  correctness and feasibility suite; the solver-neutral boundary makes this a
  policy change rather than a domain rewrite.

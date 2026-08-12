# Phase 7 solver comparison

## Decision status

**Accepted: NLopt COBYLA is TolAssist's production default for the current
Stage 4/5 implementation, while SciPy/Pyodide remains a benchmark-only
alternate.**

ADR 0008 records the accepted decision. The selection policy is encoded through
a lazy production descriptor; no product UI has been added and normal startup
still loads neither solver.

The recommendation is based on the adapters and configurations actually tested
in Phases 5 and 6. It does not claim that every possible SciPy configuration or
algorithm would produce the same result.

## Correctness gate

Correctness and independent feasibility are a release gate, not merely a speed
tradeoff.

| Result                                  |                          NLopt COBYLA |                                        SciPy COBYLA |
| --------------------------------------- | ------------------------------------: | --------------------------------------------------: |
| Deterministic analytical oracles passed |                                 12/12 |                                                8/12 |
| Central two-variable max-min optimum    |                        `2.5 m` (pass) |                              `0.777350269 m` (fail) |
| Broadcast form of max-min optimum       | `2.5 m`, 15 scalar constraints (pass) |                              `0.777350269 m` (fail) |
| Equality allowance edge case            |                                  pass | green candidate, but solver reports non-convergence |
| Exact zero-tolerance edge case          |                                  pass | green candidate, but solver reports non-convergence |

The first two SciPy failures directly exercise TolAssist's only currently
defined objective: maximizing the minimum selected tolerance. That makes the
current SciPy adapter unsuitable as the default even though all twenty of its
smaller benchmark solves passed. The benchmark fixture set intentionally does
not replace the broader correctness suite.

Both adapters independently reevaluate returned candidates and publish a Stage
5 snapshot only for a successful, all-green result. Both correctly exercise
infeasible, runaway, domain-error, cancellation, and recovery behavior.

## Measured comparison

Reference measurements come from the checked local reports generated on
2026-08-12 in headless Chromium 151 on Windows. They use five fresh workers and
twenty warm solves over the same finite, mixed-unit, nonlinear, and poorly
scaled fixtures.

| Criterion                     |   NLopt COBYLA |                        SciPy COBYLA | Advantage                      |
| ----------------------------- | -------------: | ----------------------------------: | ------------------------------ |
| First initialization          |         270 ms |                              9.01 s | NLopt                          |
| Fresh-worker median           |         226 ms |                              7.16 s | NLopt, about 32x faster        |
| Fresh-worker p95              |         270 ms |                              9.01 s | NLopt, about 33x faster        |
| Warm solve median             |        10.7 ms |                              172 ms | NLopt, about 16x faster        |
| Warm solve p95                |        35.7 ms |                              371 ms | NLopt, about 10x faster        |
| Solver runtime, encoded       |  503 kB worker | 188 kB worker + 23.0 MB CDN runtime | NLopt, about 46x less transfer |
| Solver runtime, decoded       | 1.61 MB worker | 675 kB worker + 30.5 MB CDN runtime | NLopt, about 19x smaller       |
| First-use network dependency  |           none |     pinned jsDelivr assets required | NLopt                          |
| Initial product bundle impact |      lazy only |                           lazy only | tie                            |

The reports show 24.5 MB of main-thread JS heap after the NLopt run and 14.3 MB
after the SciPy run. These figures exclude worker WebAssembly memory, so they
are not a valid engine-memory comparison and are deliberately not used to pick
a winner.

## Qualitative comparison

| Criterion                    | NLopt COBYLA                                                                                                                                                            | SciPy COBYLA                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Termination diagnostics      | Thin wrapper exposes little more than success, candidate, and value; exact NLopt code, iterations, solver evaluation count, and embedded NLopt version are unavailable. | Rich status, message, `nfev`, and complete Python/NumPy/SciPy version metadata; `nit` is not supplied by this method.          |
| Cancellation and recovery    | Forced worker termination and lazy recreation passed.                                                                                                                   | Cooperative Pyodide interruption with forced termination fallback and lazy recreation passed.                                  |
| Browser/runtime requirements | Self-contained lazy worker; no CDN or cross-origin-isolation requirement for the solver.                                                                                | Module worker plus pinned CDN and cross-origin isolation for cooperative interruption.                                         |
| Packaging complexity         | One old Webpack-era npm package plus narrow compatibility shims.                                                                                                        | Small local bridge, but a Python runtime, standard library, NumPy, and SciPy must load remotely.                               |
| Maintenance                  | `nlopt-js` 0.1.1 is old, incompletely typed, and does not identify its embedded NLopt version. This is the main risk in choosing NLopt.                                 | Pyodide and SciPy are modern, version-discoverable projects with much stronger diagnostics.                                    |
| Licensing                    | Wrapper declares MIT; bundled NLopt carries LGPL obligations and needs careful distribution notices/provenance.                                                         | Pyodide is MPL, Python is PSF, and NumPy/SciPy are BSD-style; still a multi-package notice set, but generally easier to audit. |

Both current adapters were exercised in Chromium. Cross-browser support remains
unproven, so neither receives full credit for browser compatibility.

## Weighted decision matrix

Scores use a 1–5 scale. Correctness receives the largest weight because a fast
optimizer that returns the wrong tolerance tradeoff cannot serve the product.
Memory is neutral because the available measurement is not comparable.

| Criterion                               |   Weight | NLopt score | SciPy score |
| --------------------------------------- | -------: | ----------: | ----------: |
| Correctness and feasibility reliability |      35% |           5 |           2 |
| Termination behavior and diagnostics    |      10% |           2 |           5 |
| Warm solve time                         |      10% |           5 |           2 |
| Cold startup and transferred assets     |      10% |           5 |           1 |
| Memory use                              |       5% |           3 |           3 |
| Cancellation and recovery               |       5% |           4 |           5 |
| Browser compatibility                   |       5% |           4 |           3 |
| Packaging and local runtime complexity  |      10% |           4 |           1 |
| Maintenance and licensing burden        |      10% |           2 |           4 |
| **Weighted total**                      | **100%** |  **82/100** |  **51/100** |

The score is a compact expression of the evidence, not a claim of mathematical
precision. The correctness gate independently leads to the same recommendation.

## Decision and safeguards

Choose NLopt for the next product phase, but preserve the solver-neutral API and
keep the SciPy adapter out of the normal user path rather than deleting it. This
allows repeatable comparison and makes a later engine change inexpensive.

Before treating NLopt as a long-term distribution dependency:

1. Record the exact npm artifact checksum and audit the bundled NLopt provenance
   and LGPL notice/source-offer obligations.
2. Keep independent candidate reevaluation and green-constraint enforcement as
   non-negotiable acceptance checks.
3. Keep hard timeout, divergence, cancellation, and worker-recreation guards.
4. Revisit the decision if a tuned SciPy formulation, another SciPy method, or a
   maintained upstream NLopt/WASM binding passes the same frozen oracle suite.
5. Do not expose a solver selector in Stage 4 unless users have a meaningful,
   supported reason to choose between engines.

## Reproduction

- `npm run test:solvers` runs the shared browser correctness and recovery suites.
- `npm run benchmark:nlopt` regenerates the NLopt timing report.
- `npm run benchmark:scipy` regenerates the SciPy timing report and requires
  network access to the pinned Pyodide CDN.

Raw machine reports remain ignored under `benchmark-results/`; the Phase 5 and
Phase 6 spike summaries contain the reproducible benchmark method and known
adapter limitations.

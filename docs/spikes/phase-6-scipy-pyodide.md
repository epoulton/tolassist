# Phase 6 SciPy/Pyodide spike

## Result

Pyodide 314.0.2 and SciPy 1.18.0 load from a pinned CDN URL in a Vite module
worker. The adapter consumes the same serialized problems as NLopt, executes a
fixed Python bridge, and returns only solver-neutral data.

The strengthened suite checks analytical objective and decision values,
auxiliary consistency, non-negative tolerances, independently green
constraints, maximum violation, broadcast expansion, and exact negative-case
diagnostics. NLopt passes every deterministic oracle. SciPy passes eight of
twelve and records four limitations without relaxing their expected answers:

- two-variable max-min and its broadcast variant converge to `0.777350269 m`
  instead of the analytical `2.5 m`;
- equality-tolerance and exact zero-tolerance fixtures return independently
  green candidates, but SciPy reports constraint non-convergence with
  `catol=0`, so the adapter reports `failed`.

## Reproducible benchmark

Run `npm run benchmark:scipy`. The command builds the app, starts a loopback
preview with cross-origin isolation, performs five fresh-worker initializations
and twenty warm solves in Chromium, and writes ignored raw JSON to
`benchmark-results/scipy-latest.json`.

Reference run on 2026-08-12 using headless Chromium 151 on Windows:

| Measurement                |   Result |
| -------------------------- | -------: |
| First initialization       |   9.01 s |
| Fresh-worker median        |   7.16 s |
| Fresh-worker p95           |   9.01 s |
| Warm solve median          |   172 ms |
| Warm solve p95             |   371 ms |
| Local worker, uncompressed |   675 kB |
| Local worker, encoded      | 188.5 kB |
| CDN runtime, encoded       |  23.0 MB |
| CDN runtime, decoded       |  30.5 MB |
| Reported main JS heap      |  14.3 MB |

All twenty representative warm solves succeeded, were independently green,
and matched their analytical oracles. They required 47–63 unique TolAssist
evaluations and 25–34 solver-reported evaluations. Pyodide initialization
reported Python 3.14.2 and NumPy 2.4.3 alongside SciPy 1.18.0.

For comparison, the same run measured NLopt at 226 ms fresh-worker median,
270 ms p95, 10.7 ms warm median, and 35.7 ms warm p95.

## Operational notes

- First load requires access to the exact jsDelivr Pyodide URL.
- Cancellation uses Pyodide interruption with worker termination as fallback.
- CDN assets are not copied into the repository or production build.
- Cross-origin resource timings can be zero when served from cache or when the
  browser does not expose detailed timing data.

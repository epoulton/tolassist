# TolAssist

TolAssist is a browser-based engineering tolerance calculator and optimizer. Product behavior is defined in [SPEC.md](./SPEC.md), and the implementation roadmap is in [PLAN.md](./PLAN.md).

The completed Phase 9 local build implements the five-stage calculation and
optimization workflow: base variables, restricted unit-aware derived expressions with result
inspectors, and broadcast constraint evaluation with green, yellow, and red
statuses. It also includes the UI-independent optimization foundation: a
serializable solver-neutral problem compiler, normalized max-min formulation,
candidate safeguards, a deterministic mock engine, and immutable complete
result snapshots. Lazy NLopt/WebAssembly and SciPy/Pyodide COBYLA adapters now
run behind the solver-neutral contract in dedicated workers, with strengthened
analytical fixtures and local benchmark harnesses. Stage 4 lazily runs the
selected NLopt COBYLA production solver with progress, cancellation, and rich
failure feedback. Successful runs produce an immutable Stage 5 snapshot with
all variables, derived calculations, constraints, optimization provenance, and
structured JSON export. SciPy/Pyodide remains available only for benchmarks and
regression characterization.

Final polish includes responsive small-screen layouts, keyboard-operable row
reordering, focus and live-status management, non-color constraint labels,
actionable recovery messages, reduced-motion behavior, and automated axe-core
accessibility checks. The initial supported-browser baseline is the current
stable Chromium engine (Chrome, Edge, and the embedded Chromium test runtime);
Firefox and Safari have not yet been qualified.

## Local development

Prerequisites:

- Node.js 24 or newer
- npm

Install dependencies and the local browser-test runtime:

```powershell
npm install
npx playwright install chromium
```

Start the development server:

```powershell
npm run dev
```

Run the complete local quality gate:

```powershell
npm run check:all
```

Individual checks are available through `format:check`, `lint`, `typecheck`, `test:run`, `build`, and `test:e2e`.

Run the local NLopt/WASM benchmark with `npm run benchmark:nlopt`. Its method
and reference results are documented in
[`docs/spikes/phase-5-nlopt-wasm.md`](./docs/spikes/phase-5-nlopt-wasm.md).

## Architecture

The module boundaries are summarized in [ARCHITECTURE.md](./ARCHITECTURE.md). Architecture decision records live in [`docs/adr`](./docs/adr).

Distribution, hosting, and continuous integration are intentionally deferred.

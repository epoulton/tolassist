# TolAssist

TolAssist is a browser-based engineering tolerance calculator and optimizer. Product behavior is defined in [SPEC.md](./SPEC.md), and the implementation roadmap is in [PLAN.md](./PLAN.md).

The completed TolAssist build implements the five-stage calculation and
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

## GitHub Pages deployment

The public application is published at
[https://epoulton.github.io/tolassist/](https://epoulton.github.io/tolassist/).
The site is a static build: engineering inputs and calculations remain in the
visitor's browser and are not sent to an application server.

Every push to `main` starts **Deploy TolAssist to GitHub Pages** in the
repository's **Actions** tab. The workflow installs from the lockfile, checks
formatting, lint, types, and unit tests, builds the `/tolassist/` Pages artifact,
runs the hosted-environment browser test, and deploys only after all checks
pass. A failed run leaves the previous successful deployment available.

To inspect or retry a deployment, open **Actions**, select the workflow run, and
review the failed step. Use **Re-run jobs** after correcting a transient failure.
The same workflow can be started manually through **Run workflow**.

To roll back, revert the unwanted release commit on `main` and push the revert;
the workflow will deploy the restored version. Do not force-push `main`.

The dark workshop design is the production appearance. Its history remains on
`codex/dark-workshop-aesthetic`; the previous light appearance remains on
`codex/light-aesthetic`. Only `main` deploys. Never add credentials, proprietary
examples, or other secrets to this public browser artifact.

The Pages build excludes the local solver benchmark and SciPy/Pyodide adapter.
GitHub Pages cannot reproduce the local COOP/COEP isolation headers, so NLopt is
the supported hosted solver and SciPy remains a local benchmark-only tool.

# ADR 0001: Client-side modular architecture

- Status: Accepted
- Date: 2026-08-11

## Context

TolAssist must run locally as a browser-based single-page application. Its calculation and optimization engines are still under evaluation, and the implementation must support comparing NLopt/WebAssembly with SciPy/Pyodide.

## Decision

Use React and TypeScript with Vite for the application shell. Isolate product state, mathematical evaluation, and optimization behind explicit module boundaries. Concrete solvers will implement a shared adapter contract and run outside the UI thread.

## Consequences

- UI code cannot import solver-specific types.
- Solver engines can be loaded and benchmarked independently.
- Worker protocols and normalized problem/result schemas become important compatibility boundaries.
- Hosting and distribution remain deferred decisions.

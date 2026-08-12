# TolAssist Architecture

TolAssist is organized so the product domain and solver comparison remain independent of the user-interface framework and concrete scientific engines.

## Source boundaries

- `src/app` composes screens and application-level state.
- `src/domain` owns editable and validated problem models, validation, dependency analysis, and immutable result snapshots.
- `src/math` owns the restricted expression, unit, and named-axis calculation boundary.
- `src/optimization` owns solver-neutral contracts, problem compilation, and interchangeable solver adapters.
- `src/ui` owns reusable accessible presentation and interaction primitives.

Dependencies should point inward: UI and app composition may use domain contracts; domain code may use abstract math and optimization contracts; concrete solver adapters must not leak their types into domain or UI code.

NLopt COBYLA is the production optimization policy. Product composition must
load it through the metadata-only `productionSolverDescriptor`, which preserves
the lazy worker boundary. The separate comparison registry contains NLopt and
SciPy/Pyodide for benchmarks and regression characterization only; product code
must not select from it or fall back between engines.

Stage 4 compiles the latest globally validated model and owns the transient
engine, progress, and cancellation lifecycle. A successful, independently
green result is converted into the domain-owned immutable Stage 5 snapshot.
Stage 5 renders and exports only that snapshot, so later edits and unsuccessful
runs cannot alter the recorded solution.

Architecturally significant decisions are recorded in `docs/adr`.

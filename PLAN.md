# TolAssist — Implementation Plan

> Status: Implemented local-release roadmap
>
> Source of truth for product behavior: [`SPEC.md`](./SPEC.md)

## Implementation Status

- Phase 0 — Complete
- Phase 1 — Complete
- Phase 2 — Complete
- Phase 3 — Complete
- Phase 4 — Complete
- Phase 5 — Complete
- Phase 6 — Complete with documented SciPy limitations
- Phase 7 — Complete; NLopt selected for production
- Phase 8 — Complete
- Phase 9 — Complete

## 1. Implementation Strategy

Build TolAssist as a static React and TypeScript single-page application with a framework-independent domain core. Separate the app into four major layers:

1. **Presentation layer** — the five-stage interface, interactions, animation, and accessibility.
2. **Domain layer** — editable problem state, validation, dependency analysis, named-axis calculation, constraint classification, and immutable result snapshots.
3. **Mathematics layer** — restricted expression parsing, units, scalar evaluation, and numeric formatting.
4. **Optimization layer** — a solver-neutral problem contract with interchangeable worker-based adapters.

Neither the UI nor the domain model may depend directly on NLopt, SciPy, Pyodide, or a solver-specific result type. Both solver implementations must receive the same normalized optimization problem and return the same normalized result structure.

## 2. Proposed Technology Baseline

These choices establish the application shell while leaving the scientific libraries replaceable:

- React with TypeScript
- Vite
- Vitest for unit and integration tests
- React Testing Library for UI behavior
- Playwright for browser-level workflows and local production-build verification
- A mature accessible drag-and-drop library with keyboard support
- A mature layout-animation library or browser-native layout transitions, with reduced-motion support
- Web Workers for optimization engines
- Local quality scripts for type checking, linting, tests, and production builds; continuous integration is deferred with hosting and distribution work

Decisions still requiring technical spikes:

- expression and unit library;
- custom flat-buffer versus stdlib-backed named-axis storage;
- NLopt WebAssembly packaging approach;
- Pyodide/SciPy package-loading approach;
- final animation and drag-and-drop libraries.

## 3. Architectural Boundaries

### 3.1 Domain Model

Use stable internal IDs for rows and axes. User-visible names are editable labels and expression identifiers; they must not serve as storage identity.

Define explicit models for:

- editable Stage 1 rows and both cached tolerance representations;
- editable Stage 2 rows and compiled expression metadata;
- editable Stage 3 rows and compiled comparisons;
- Stage 4 objective and decision-variable selections;
- evaluated named-axis values;
- global validation results;
- immutable Stage 5 snapshots;
- versioned Stage 5 JSON exports.

Keep editable input strings separate from validated numeric/domain values. This preserves incomplete and invalid input exactly as entered while allowing the last validation pass to produce a separate validated model.

### 3.2 Named-Axis Value

Start with a minimal domain-specific representation:

```ts
interface NamedAxisValue {
  axisIds: readonly AxisId[];
  values: Float64Array;
  unit: CanonicalUnit;
}
```

Every Stage 1 axis has three coordinates in fixed order: minimum, nominal, maximum. Implement and test:

- deterministic ordered axis union;
- flat-buffer strides and coordinate iteration;
- projection from a result coordinate to an operand's axes;
- scalar broadcasting;
- shared-axis alignment;
- nominal coordinate lookup;
- minimum and maximum reduction;
- coordinate labels for diagnostic messages.

Do not initially build a general ndarray library. Add stdlib storage or broadcasting helpers only if the calculation spike shows a measurable benefit.

### 3.3 Expression Evaluation

Introduce an application-owned expression interface:

```ts
interface ExpressionEngine {
  parse(source: string): ParsedExpression;
  validate(parsed: ParsedExpression, scope: SymbolTable): ExpressionValidation;
  evaluateScalar(parsed: ParsedExpression, scope: ScalarScope): Quantity;
  describeRules(): ExpressionHelpContent;
}
```

The engine must expose a restricted arithmetic grammar, identifiers, dimensioned literals, constants, supported elementary functions, dependency extraction, dimensional validation, and structured errors. Disable assignment, property access, function definition, collection construction, and arbitrary code execution.

The named-axis evaluator operates above this interface and invokes scalar evaluation for each required coordinate. This keeps broadcasting independent of the chosen parser/unit library.

### 3.4 Optimization Boundary

Represent all quantities passed to a solver as finite, unit-normalized scalar numbers. Unit conversion and named-axis expansion occur before or inside the shared objective/constraint evaluator, never inside solver-specific code.

Use a solver-neutral contract similar to:

```ts
interface OptimizationEngine {
  readonly id: SolverId;
  initialize(): Promise<EngineInfo>;
  solve(
    problem: OptimizationProblem,
    options: SolveOptions,
    signal: AbortSignal,
    onProgress?: (progress: SolveProgress) => void,
  ): Promise<OptimizationResult>;
  dispose(): Promise<void>;
}

interface OptimizationProblem {
  schemaVersion: 1;
  initialDecisionVector: Float64Array;
  decisionVariables: readonly DecisionVariable[];
  objective: ObjectiveDefinition;
  constraints: readonly ScalarConstraint[];
  evaluate(decisionVector: Float64Array): EvaluationResult;
}
```

The concrete worker boundary cannot transfer functions directly. Before implementation, refine this conceptual contract into a serializable problem description plus one of these evaluated-callback strategies:

- run the shared TypeScript evaluator inside the NLopt worker;
- run an equivalent serialized expression/evaluation plan inside the Pyodide worker;
- or use a worker RPC callback protocol if measured overhead is acceptable.

Prefer moving the evaluation plan into each worker over round-tripping every solver evaluation through the UI thread.

Both adapters must normalize their output to:

```ts
type OptimizationOutcome =
  | "succeeded"
  | "infeasible"
  | "unbounded"
  | "timed_out"
  | "cancelled"
  | "diverged"
  | "failed";

interface OptimizationResult {
  solverId: SolverId;
  outcome: OptimizationOutcome;
  decisionVector?: Float64Array;
  objectiveValue?: number;
  evaluations?: number;
  iterations?: number;
  elapsedMs: number;
  terminationCode?: string;
  message: string;
  diagnostics: readonly Diagnostic[];
}
```

## 4. Solver-Plug-in Design

### 4.1 Solver Registry

Create a registry that owns engine discovery rather than importing engines in UI components:

```ts
interface SolverDescriptor {
  id: SolverId;
  label: string;
  capabilities: SolverCapabilities;
  load(): Promise<OptimizationEngine>;
}
```

Use dynamic imports so each solver and its runtime are separate lazy-loaded chunks. Production can expose one default solver while development and benchmark builds expose both.

### 4.2 Capability Declaration

Each adapter declares support for:

- nonlinear equality constraints;
- nonlinear inequality constraints;
- variable bounds;
- derivative-free operation;
- explicit maximization;
- time limits;
- evaluation limits;
- progress callbacks;
- cooperative cancellation;
- forced worker termination;
- deterministic runs or seed control.

Reject a solver/problem pairing before execution when required capabilities are missing.

### 4.3 Shared Max-Min Reformulation

Do not give either solver the nonsmooth `min(tolerances)` objective directly. In shared, solver-neutral problem compilation:

- add an auxiliary scalar decision variable `z`;
- maximize `z`;
- add `z <= toleranceᵢ` for every selected variable;
- preserve `toleranceᵢ >= 0` as an inherent bound;
- append every scalar constraint produced by broadcasting the Stage 3 comparisons.

This guarantees that NLopt and SciPy solve the same mathematical formulation.

### 4.4 NLopt Adapter

Build an initial adapter using `nlopt-js` only for the spike. Verify available algorithms and callback behavior before relying on it.

If the spike succeeds, choose between:

- auditing and wrapping the existing package; or
- compiling a pinned upstream NLopt release to WebAssembly with a narrow TypeScript binding.

Initial algorithm candidate: derivative-free local COBYLA.

The adapter must map normalized constraints, bounds, stopping options, exceptions, forced termination, and NLopt result codes into the shared result model.

### 4.5 SciPy Adapter

Run Pyodide and SciPy inside a dedicated module Web Worker. Pin the Pyodide and Python package versions.

The adapter must:

- report runtime/package-loading progress;
- translate the serialized problem into SciPy callbacks;
- initially test COBYLA and any other suitable constrained methods;
- normalize `OptimizeResult` and exceptions into the shared result model;
- use solver-level iteration/evaluation limits;
- support cancellation by cooperative interrupt when the local server configuration allows it, otherwise by terminating and recreating the worker.

Avoid depending on Pyodide for the main UI or editable state. It is an optional optimization adapter unless a later decision moves the complete scientific engine into Python.

### 4.6 Solver Selection UX

Do not add a user-facing solver selector to the product until comparison results justify it. During development, provide one of:

- a development-only settings panel;
- a query-string override;
- or a build-time environment setting.

Record the solver ID, version, options, elapsed time, and termination details in benchmark output. Decide separately whether solver provenance belongs in the Stage 5 JSON schema.

## 5. Implementation Phases

### Phase 0 — Repository and Quality Baseline (Complete)

- Scaffold React, TypeScript, and Vite.
- Configure strict TypeScript, linting, formatting, Vitest, React Testing Library, and Playwright.
- Add local scripts for type checking, linting, unit tests, browser tests, and a production build.
- Establish module boundaries and dependency rules.
- Add an architecture decision record directory for library decisions.

Exit criteria:

- clean static build;
- tests run in CI;
- the blank app starts locally and its production build can be served and exercised locally.

### Phase 1 — Domain Types and Stage 1 (Complete)

- Implement editable versus validated state separation.
- Implement stable row IDs and variable-name validation.
- Implement both tolerance representations and cached conversions.
- Implement defaults, row validation, add/delete/reorder, and startup rows.
- Add unit-field parsing behind the expression/unit abstraction.

Exit criteria:

- asymmetric windows survive non-editing toggles;
- edits recalculate the alternate representation correctly;
- invalid input is preserved and explained;
- all Stage 1 acceptance tests pass.

### Phase 2 — Expression and Named-Axis Spike (Complete)

- Evaluate the leading expression/unit libraries with representative TolAssist syntax.
- Implement the restricted parser adapter and help metadata.
- Implement the minimal flat-buffer named-axis evaluator.
- Implement dependency extraction and Stage 2 row-order validation.
- Add domain-error coordinate reporting.
- Benchmark direct unit-aware evaluation versus normalized numeric evaluation.

Exit criteria:

- unit conversions and dimensional failures behave correctly;
- two- and three-axis Cartesian results are correct;
- shared axes align once;
- scalar constants broadcast correctly;
- representative repeated evaluations are fast enough for solver callbacks.

### Phase 3 — Stages 2 and 3 UI (Complete)

- Build derived-variable rows and collapsible inspectors.
- Build constraint rows and green/yellow/red/uncolored presentation with non-color indicators.
- Implement the global blur-triggered validation and recalculation cycle.
- Clear Stage 2 computed output and Stage 3 colors on failed validation without clearing input.
- Implement row deletion and drag/keyboard reordering.

Exit criteria:

- dependency invalidation works for rename, delete, and reorder;
- constraints classify full-space and nominal results correctly;
- transitions remain smooth and respect reduced motion.

### Phase 4 — Solver-Neutral Problem Compiler (Complete)

- Convert selected Stage 1 nominal/tolerance pairs into normalized decision variables.
- Implement the auxiliary-variable max-min formulation.
- Convert every broadcast Stage 3 comparison into scalar solver constraints.
- Define equality tolerance as a configurable compiler/solver option pending final engine selection.
- Validate candidate vectors and convert them back to three-point values.
- Add common time, evaluation, numeric-domain, and divergence safeguards.

Exit criteria:

- one serialized problem description drives a deterministic mock solver;
- the mock result can generate a complete Stage 5 snapshot;
- no UI or domain module imports a concrete solver.

### Phase 5 — NLopt/WASM Spike and Adapter (Complete)

- Integrate NLopt in a worker behind the shared contract.
- Run the common benchmark and correctness suite.
- Test constrained, unconstrained, infeasible, unbounded, nonsmooth, and domain-error cases.
- Measure cold load, warm load, solve time, evaluations, memory where available, and cancellation recovery.
- Document binding and licensing implications.

Exit criteria:

- all mandatory correctness fixtures either pass or have documented solver limitations;
- worker recovery after cancellation or failure is reliable;
- performance data is captured reproducibly.

### Phase 6 — SciPy/Pyodide Spike and Adapter (Complete)

- Integrate Pyodide and SciPy in a separate worker behind the same contract.
- Pin and locally serve or version-lock runtime assets for reproducible development builds.
- Run the identical benchmark and correctness suite.
- Measure runtime initialization separately from solve time.
- Verify cancellation behavior under the local development and preview-server headers.

Exit criteria:

- identical normalized problems and fixtures run through both engines;
- output is normalized to the same result schema;
- performance and operational differences are documented.

### Phase 7 — Solver Comparison Decision (Complete)

Compare engines using weighted criteria:

- correctness and feasibility reliability;
- termination behavior and diagnostics;
- solve time after warm-up;
- cold startup and total transferred assets;
- memory use;
- cancellation and recovery;
- browser compatibility;
- packaging and local runtime complexity;
- maintenance and licensing burden.

Choose a production default. Keep the alternate adapter if its maintenance cost is acceptable, or retain it as a benchmark-only integration. Record the decision in an architecture decision record.

Decision: NLopt COBYLA is the production default and SciPy/Pyodide is a benchmark-only alternate. The weighted evidence is recorded in `docs/spikes/phase-7-solver-comparison.md`, and ADR 0008 records the accepted architecture decision. Product code must use the lazy `productionSolverDescriptor`; the comparison registry is reserved for benchmarks and solver regression tests.

### Phase 8 — Stages 4 and 5 (Complete)

- Load NLopt through the production solver descriptor; do not import a concrete adapter, expose a solver selector, or fall back to SciPy.
- Build objective selection, decision-variable multiselect, Optimize state, progress, cancellation if supported, and error feedback.
- Enable optimization with no user constraints.
- Preserve inputs across all outcomes.
- On success only, create and store the immutable Stage 5 snapshot.
- Render all variables, expressions with inspectors, constraints with statuses, and the optimization setup summary.
- Implement versioned structured JSON export with full numeric precision.

Exit criteria:

- failed runs retain any previous successful snapshot;
- later input edits do not mutate the snapshot;
- exported JSON matches the rendered snapshot and schema tests.

Implementation result: Stage 4 loads NLopt only after the user starts a valid optimization, reports initialization and evaluation progress, supports cancellation, and preserves editable inputs across every outcome. Stage 5 remains empty until success, then renders the immutable complete snapshot and exports the same versioned data as full-precision JSON. Failed and cancelled runs retain the previous successful snapshot.

### Phase 9 — Product Polish and Release (Complete)

- Complete responsive layout behavior.
- Complete keyboard navigation, focus management, announcements, and non-color statuses.
- Apply reduced-motion behavior.
- Refine actionable validation and optimization messages.
- Add loading and worker-recovery experiences.
- Run browser, accessibility, performance, and local production-build checks.
- Finalize user-facing expression/evaluation help.

Exit criteria:

- acceptance suite passes in supported browsers;
- the local production build works from a clean cache;
- no known high-severity accessibility or calculation-correctness defects remain.

Implementation result: the five-stage workflow now adapts to narrow viewports,
supports keyboard row reordering and deliberate focus transitions, announces
optimization outcomes without relying on color, and honors reduced-motion
preferences. User help and recovery messages cover expression rules, domain
coordinates, cancellation, divergence, timeouts, infeasibility, and worker
restart behavior. Chromium end-to-end coverage includes initial and completed
workflow axe-core scans, a 360-pixel layout check, reduced-motion rendering,
keyboard-only reordering, result export, and the production solver workflow.
The current stable Chromium engine is the supported initial-release baseline;
Firefox and Safari remain unqualified rather than implicitly supported.

## 6. Shared Solver Benchmark Suite

Create version-controlled fixtures that compile into the same `OptimizationProblem` for both adapters.

Include at least:

1. One selected variable with a finite optimum.
2. Multiple selected variables with a max-min tolerance tradeoff.
3. Compatible mixed units.
4. Nonlinear inequality constraints.
5. Equality constraints using the selected tolerance convention.
6. A constraint that expands across multiple named axes.
7. An optimum on the `tolerance = 0` bound.
8. An infeasible problem.
9. An unconstrained/unbounded problem.
10. A domain error encountered during the search.
11. Poorly scaled nominal and tolerance variables.
12. A local-optimum or multi-start sensitivity case.

For every run, record:

- solver and runtime versions;
- normalized problem hash;
- solver options and initial vector;
- outcome and termination code;
- objective value;
- maximum constraint violation;
- whether every final Stage 3 constraint is green;
- evaluation and iteration counts;
- engine initialization time;
- solve time;
- total elapsed time;
- transferred runtime bytes where measurable;
- cancellation/recovery result.

Run warm solves repeatedly and report a distribution rather than a single timing. Keep cold-start measurements separate.

## 7. Test Strategy

### Unit Tests

- tolerance conversions and cached asymmetric behavior;
- identifier and row validation;
- unit compatibility and conversion;
- dependency extraction and row-order rules;
- named-axis union, projection, strides, and reductions;
- constraint classification;
- max-min auxiliary-variable compilation;
- result snapshot and JSON serialization.

### Property-Based Tests

- nominal/tolerance conversion always yields ordered three-point values for non-negative tolerance;
- named-axis operations are invariant to operand axis ordering after alignment;
- shared axes are never duplicated;
- the nominal result equals direct scalar evaluation with every base variable at nominal;
- JSON export round-trips through its schema validator.

### Integration Tests

- global validation and calculation lifecycle;
- invalid dependency propagation;
- row reorder effects;
- solver registry and worker message protocol;
- successful and failed optimization result handling;
- Stage 5 immutability.

### End-to-End Tests

- complete five-stage problem entry and optimization;
- keyboard-only row management;
- validation and domain-error feedback;
- result export download;
- direct navigation and asset loading from the locally served production build;
- reduced-motion rendering.

## 8. Performance and Reliability Guardrails

- Keep calculations and optimization off the UI thread whenever they can cause perceptible delay.
- Parse expressions once per successful validation cycle and reuse compiled plans.
- Reuse buffers and dependency metadata during solver evaluations.
- Normalize units before repeated numeric optimization callbacks where correctness permits.
- Require finite candidate decision vectors and finite objective/constraint outputs.
- Apply explicit time and evaluation limits to every solver run.
- Treat worker crashes as recoverable adapter failures and recreate the worker.
- Never publish a Stage 5 snapshot until the returned vector is independently reevaluated by the shared domain engine and every constraint is green.

## 9. Security and Supply-Chain Requirements

- Never evaluate user expressions as arbitrary JavaScript or Python source.
- Validate all messages crossing worker boundaries.
- Pin runtime and scientific dependency versions.
- Prefer locally served, versioned WASM/runtime assets for reproducibility; document any external CDN dependency and integrity strategy.
- Generate an inventory of third-party licenses before release.
- Keep Stage 5 export purely local and never transmit problem data.

## 10. Remaining Decisions

This decision remains for later product refinement:

- equality tolerance defaults;

## 11. Recommended Build Order

Begin with Phases 0–4 using a deterministic mock optimizer. This proves the complete domain boundary before either scientific runtime influences the architecture. Then implement the NLopt and SciPy adapters independently against the same frozen contract and benchmark suite. Make the production solver decision only after both spikes produce comparable correctness and performance evidence.

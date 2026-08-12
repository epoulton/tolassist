# TolAssist — App Specification

> Status: Implemented local-release specification

## 1. Product Overview

### Summary

TolAssist is a combined calculator and optimizer for engineering design-tolerance problems. It guides the user through a five-stage workflow presented as stacked sections on a single page.

### Problem Statement

Engineering calculations involving multiple toleranced variables require evaluating combinations of minimum, nominal, and maximum input values, deriving additional quantities, and determining whether design constraints hold across the resulting tolerance space. TolAssist will provide a structured interface for defining and evaluating these problems.

### Goals

- Represent engineering variables and their tolerances in either of two input formats.
- Evaluate derived expressions across every relevant combination of toleranced input values.
- Evaluate engineering constraints across the full tolerance space and at the nominal case.
- Support a five-stage calculation and optimization workflow on one page.

### Non-Goals

TBD

## 2. Users and Use Cases

### Intended Users

People solving engineering design-tolerance problems. Specific user roles, disciplines, and levels of expertise remain to be defined.

### Primary Use Cases

- Define base variables with tolerances and units.
- Calculate derived variables across a multidimensional tolerance space.
- Check equality and inequality constraints across that space.

### User Journey

The workflow consists of five vertically stacked stages on a single page. Users progress from defining base variables, to derived variables and constraints, through optimization setup, and finally to a read-only result display.

## 3. Functional Requirements

### Stage 1 — Base Variables

- The user can define the variables involved in the problem.
- Each variable has a name, values, and units.
- Each base-variable row has one unit field shared by all values in that row.
- Variable names must be unique across all base and derived variables.
- Variable names must follow the identifier rules of the programming language chosen for Stage 2 and Stage 3 expression syntax.
- The user can enter a variable in either of two formats:
  - minimum, nominal, and maximum;
  - nominal and symmetric tolerance.
- Each row includes a format toggle that switches the visible input fields between the two representations.
- An input cell is validated when it loses focus, rather than after every change.
- A completely empty row is ignored. Once any field in a row is populated, the following fields are required in either representation:
  - variable name;
  - nominal value;
  - unit.
- In the three-point representation, minimum and maximum are optional. A blank minimum or maximum is normalized to the nominal value.
- In the nominal-and-tolerance representation, tolerance is optional. A blank tolerance is normalized to zero.
- Normalized values are stored; the app does not need to retain metadata indicating which optional fields were originally blank.
- If the user toggles away from a representation and later returns to it, previously blank optional fields display their normalized values.
- A valid three-point representation must satisfy `minimum ≤ nominal ≤ maximum`.
- A valid nominal-and-tolerance representation must satisfy `tolerance ≥ 0`.
- The format toggle is disabled while the row is invalid and is reenabled when the row validates successfully.
- When the input is valid, the app stores the variable name, values, and units.
- The internal model caches both representations for every base variable because different workflow stages may use different forms.
- Editing a valid variable definition updates the visible representation and recalculates the cached alternative representation.
- Toggling formats without editing only displays the cached representation; it does not recalculate either representation.
- This caching behavior preserves an asymmetric three-point window across repeated non-editing format toggles.
- Conversion from nominal and symmetric tolerance to the three-point form is:
  - `minimum = nominal - tolerance`
  - `nominal = nominal`
  - `maximum = nominal + tolerance`
- Conversion from the three-point form to nominal and symmetric tolerance is:
  - `nominal = (maximum + minimum) / 2`
  - `tolerance = (maximum - minimum) / 2`
- If the three-point representation has an off-center nominal value, that value remains cached in the three-point form while the calculated two-point nominal is the midpoint of minimum and maximum.
- Symmetric tolerance is expressed as an absolute value. Relative and percentage tolerances are not supported.

### Stage 2 — Derived Variables

- The user can define additional variables with mathematical expressions.
- Each derived-variable input row contains an editable variable name and expression. It does not contain an editable unit field.
- A completely empty derived-variable row is ignored. Once either field is populated, both the variable name and expression are required.
- Inferred result units are shown only in the collapsible inspector beneath the row.
- An expression may reference Stage 1 variables and derived variables defined earlier in Stage 2.
- A derived expression may also be constant and reference no earlier variable.
- A derived variable cannot reference itself or a later derived variable. This ordering prevents circular dependencies implicitly.
- Expressions use a familiar text syntax, such as JavaScript or Python syntax. The final syntax may be selected according to the expression-evaluation tooling.
- Expressions are parsed by a restricted mathematical grammar. They cannot execute arbitrary code and do not support assignment, property access, or unrestricted function calls.
- The expression language should support, at minimum:
  - addition, subtraction, multiplication, and division;
  - exponentiation and parentheses;
  - roots and absolute values;
  - logarithmic functions;
  - trigonometric functions.
- Differentiation, integration, and other calculus operations are explicitly unsupported.
- Where mathematical conventions vary, TolAssist follows the conventions of the selected expression-evaluation package. This includes details such as the treatment of dimensionless trigonometric arguments.
- Dimensional rules are enforced throughout expression evaluation. Functions that require dimensionless arguments, such as logarithms, reject dimensioned inputs; exponentiation and other functions must also obey the evaluator's unit-consistency rules.
- Expressions support dimensioned literals, such as `25.4 mm`.
- Expressions support dimensionless numeric literals and mathematical constants, such as `pi` in `pi * r^2`.
- An input cell is validated when it loses focus.
- A valid expression is evaluated over the full tolerance space of every variable it references.
- Every combination in the tolerance space must evaluate successfully. A domain or arithmetic error at any combination invalidates the complete derived expression.
- An evaluation error identifies both the error and the named-axis positions that produced it. For example: `Divide by zero encountered when a = min, b = max.`
- Stage 2 calculations always use each base variable's cached three-point representation, regardless of the representation in which that variable was entered or is currently displayed.
- Each base variable is treated as a named axis containing its minimum, nominal, and maximum values.
- Operations align axes by variable name and broadcast across orthogonal axes, following the behavior of Python's `xarray` package.
- A derived result retains the union of the named base-variable axes on which its expression depends.
- If multiple operands share an underlying base-variable axis, that axis is aligned and appears only once in the result; it is not duplicated. For example, if `c = f(a, b)` and `d = g(a, c)`, then `d` retains axes `a` and `b` and has nine combinations rather than 27.
- A constant derived expression is represented as a scalar with no tolerance axis. It broadcasts across the named axes of other operands when used by a later expression.
- An expression involving `N` independent base-variable axes produces `3^N` evaluated combinations. For example:
  - two axes produce a 3 × 3 array;
  - three axes produce a 3 × 3 × 3 array.
- Each derived-variable row has a collapsible results area beneath its inputs.
- A scalar constant row has no collapsible result inspector.
- The physical dimension and units of a derived variable are inferred from its expression.
- The app automatically selects a presentation unit for a derived result using these priorities:
  1. prefer the measurement system used by the majority of the expression's input variables;
  2. within that system, choose an engineering-style scale that generally keeps values from `1` up to but not including `1000` when an appropriate prefixed unit is available, thereby reducing displayed digits (for example, prefer `10 km` to `10 000 m`).
- The results area displays:
  - the minimum value across the complete result array;
  - the central value, evaluated using the nominal value of every input variable;
  - the maximum value across the complete result array.

### Stage 3 — Constraints

- The user can define a set of optimization constraints.
- Each constraint is a single equality or inequality expression involving any variables defined in Stages 1 or 2.
- The minimum required comparison operators are `<=`, `==`, and `>=`.
- Strict inequalities (`<` and `>`) and inequality (`!=`) are not required.
- Additional comparison operators may be supported if appropriate for the selected constrained-optimization engine.
- Equality precision and tolerance behavior will be defined when the constrained-optimization engine is selected. A tolerance-based equality convention is acceptable and likely necessary.
- Each row contains exactly one comparison; compound Boolean expressions within a row are unsupported.
- All populated constraint rows are combined with logical AND for the overall constraint set.
- Constraints are numbered automatically and are not named.
- A constraint participates in the global validation cycle whenever any Stage 1–3 input loses focus.
- Constraints use the same named-axis alignment and Cartesian broadcasting rules as Stage 2 expressions.
- A constraint's color is determined from the complete broadcast Boolean result and its all-nominal element.
- Stage 3 calculations always use each base variable's cached three-point representation, preserving asymmetric tolerance windows.
- Each evaluated constraint has one of three states:
  - **Green:** satisfied at every aligned index across the relevant tolerance space.
  - **Yellow:** satisfied for the all-nominal case, but not at every aligned index.
  - **Red:** not satisfied for the all-nominal case.
- For the initial scope, the constraint UI shows only its green, yellow, or red state. Detailed margins, failing combinations, and pass/fail counts are not required.
- A constraint that fails validation, including because it references an invalid dependency, is uncolored rather than red.

### Validation and Recalculation Cycle

- Whenever any input in Stages 1, 2, or 3 loses focus, the app validates all inputs across all three stages.
- Completely empty rows remain ignored during global validation.
- When global validation passes, the app reruns all Stage 2 derived-variable calculations and all Stage 3 constraint calculations.
- TolAssist never clears or rewrites user-entered input merely because validation fails. Invalid inputs remain visible and are flagged with an explanation so the user can correct them.
- When global validation fails:
  - current Stage 2 inspector calculations are cleared or replaced with an intuitive no-value state;
  - all Stage 3 constraint colors are removed;
  - Stage 5 continues to display the last successful optimization result, if one exists.
- This deliberately simple global strategy may be made more incremental later if performance testing shows a need.

### Stage 4 — Optimization Setup

- Stage 4 lets the user configure and launch a constrained optimization problem.
- Its controls are vertically stacked in this order:
  1. instructional text: **Select objective function**;
  2. a single-select objective-function dropdown;
  3. instructional text: **by updating**;
  4. a multiselect containing all Stage 1 variable names;
  5. an **Optimize** button.
- The objective dropdown contains a predefined catalog of objective functions to be specified later.
- Users cannot enter or define arbitrary objective functions.
- The initial objective catalog contains exactly one preselected option:
  - **Maximize the minimum tolerance among the selected variables subject to the defined constraints**
- For selected variables with tolerances `t₁, …, tₙ`, this objective is mathematically:
  - maximize `min(t₁, …, tₙ)`.
- If the selected optimization engine accepts minimization objectives only, the implementation may use any mathematically equivalent transformation, such as minimizing `max(-t₁, …, -tₙ)`.
- The mathematical requirement does not prescribe Python syntax, a particular optimization engine, or any other implementation technology.
- The predefined objective catalog must be designed so additional objectives can be added as product needs are discovered.
- The variables selected in the multiselect are supplied to the optimization engine as the variables it may update.
- Each selected Stage 1 variable is passed to the optimizer in nominal/tolerance form, producing two scalar decision variables per selected variable (`2N` decision variables for `N` selected Stage 1 variables).
- The optimizer may change both the nominal value and absolute tolerance of every selected Stage 1 variable.
- Every tolerance decision variable has the inherent domain bound `tolerance ≥ 0`. This preserves valid Stage 1 representations and is not considered a user-authored engineering constraint.
- Candidate nominal/tolerance pairs are converted to their three-point representations for evaluation by Stages 2 and 3.
- Activating **Optimize** invokes the constrained-optimization engine, which seeks to optimize the selected objective by updating those decision variables.
- Each predefined objective inherently specifies whether it is minimized or maximized; there is no separate direction control.
- All Stage 3 constraint rows are applied collectively to the optimization problem.
- An empty Stage 3 constraint set is permitted. In that case, TolAssist requests an unconstrained optimization subject only to inherent numeric validity such as `tolerance ≥ 0`.
- TolAssist does not preemptively reject an unconstrained problem merely because the initial objective is likely to be unbounded. The optimizer may return a valid finite solution or report an appropriate unbounded, divergent, timed-out, or failed outcome.
- A feasible optimized solution must make every Stage 3 constraint green—that is, every constraint must hold at every evaluated tolerance combination. Yellow is not sufficient.
- The optimizer must not invent engineering or search-space constraints that the user did not define in Stage 3.
- The optimization process must detect numerical runaway or divergence, halt safely, and present an error rather than continuing indefinitely.
- A successful optimization returns a separate copy of the optimized decision vector.
- Optimization never overwrites or mutates the current Stage 1 variable definitions. The original inputs remain available so the user can adjust the setup and run another optimization without reentering them.
- The implementation should integrate an established constrained-optimization engine rather than implement optimization algorithms from scratch.
- The **Optimize** button is enabled only when:
  - an objective function is selected;
  - at least one Stage 1 variable is selected for updating;
  - all non-empty inputs in Stages 1–3 are valid.

### Stage 5 — Optimization Results

- Stage 5 displays the result returned by the most recent successful optimization without modifying Stage 1.
- A successful run stores a self-contained Stage 5 snapshot of the variable values, expression definitions and results, and constraint definitions and evaluations used for that run.
- Stage 5 is empty until the first successful optimization completes.
- Only a successful optimization replaces the current Stage 5 result.
- If an optimization fails, errors, or is halted for runaway behavior, the previous successful result remains visible.
- Changes in Stages 1–4 do not alter, clear, or change the status of the existing Stage 5 snapshot.
- The snapshot does not live-update its copied definitions or values to match later edits in Stages 1–4.
- Because the snapshot contains the complete relevant problem definition and solution, it does not require a stale-state indicator and remains self-explanatory when captured in a screenshot or later exported.
- Stage 5 is ordered to mirror Stages 1–3:
  1. base variables;
  2. derived expressions and calculated results;
  3. constraints and their evaluations;
  4. optimization setup summary.
- The base-variable result list contains every Stage 1 variable in Stage 1 order:
  - variables selected in Stage 4 display the nominal/tolerance values returned by the optimizer;
  - variables not selected in Stage 4 display copies of their unchanged Stage 1 values.
- Base-variable result rows are read-only and display the nominal/tolerance representation.
- Stage 5 then reproduces every Stage 2 derived-variable definition as a non-editable row in Stage 2 order.
- Each non-constant result expression includes a read-only inspector showing its recalculated minimum, nominal, and maximum values and inferred units.
- Constant expressions remain read-only scalar definitions and do not require an inspector, consistent with Stage 2.
- Stage 5 then reproduces every Stage 3 constraint as a non-editable row in Stage 3 order.
- Stage 5 expressions and constraints are recalculated using:
  - the optimized nominal/tolerance decision-vector values returned by Stage 4;
  - the Stage 2 derived-variable definitions;
  - unchanged Stage 1 variables that were not selected for optimization.
- Selected optimized variables are converted to three-point form for Stage 5 calculations. Unselected variables use their unchanged cached Stage 1 three-point forms, preserving asymmetric windows.
- Result constraints use the same named-axis broadcasting, nominal-case selection, and green/yellow/red classification rules as Stage 3.
- A successful feasible optimization is expected to show every result constraint as green.
- At the bottom, Stage 5 includes a read-only copy of the successful run's Stage 4 setup:
  - the complete selected objective-function text;
  - the ordered list of Stage 1 variable names selected for optimization.
- Stage 5 includes an **Export result** button when a successful snapshot exists.
- Activating **Export result** downloads the complete Stage 5 snapshot as structured JSON.
- The export is generated from the stored snapshot model rather than from rendered page text.
- The JSON export includes, in display order:
  - every Stage 1 variable and the values used in the successful run, including whether each variable was optimized or unchanged;
  - every Stage 2 expression, its inferred unit, underlying axes, and calculated minimum, nominal, and maximum values;
  - every Stage 3 constraint and its evaluated status;
  - the selected objective-function text;
  - the ordered list of variables selected for optimization.
- The export format includes a schema/version identifier so future versions can evolve while remaining distinguishable.
- Exported numeric values should retain machine-readable precision independently of UI display rounding.

### Definition Row Management

- Base variables, derived variables, and constraints are each defined in rows of horizontally aligned text input fields.
- Users can add, delete, and drag to reorder rows in each of Stages 1–3.
- Users can delete all rows from any of these stages.
- Completely empty rows are ignored and do not produce validation errors.
- Renaming a variable does not update references in any expression or constraint.
- Deleting or reordering a definition does not modify any other field automatically.
- Renaming, deleting, or reordering a definition triggers validation of affected inputs. Any now-invalid expressions or constraints are visibly flagged for the user to repair.
- On startup, the app displays:
  - two empty base-variable rows;
  - one empty derived-variable row;
  - zero constraint rows.

## 4. Data and Domain Concepts

### Base Variable

A uniquely named engineering quantity with units and a three-point tolerance representation consisting of minimum, nominal, and maximum values. It may be entered directly in that form or through a nominal value and absolute symmetric tolerance.

Both input representations are retained in the internal model. One can therefore contain information that cannot be represented by the other, such as an off-center nominal value in an asymmetric three-point window. Recalculation occurs only after a valid edit, not when the visible format is toggled.

The cached three-point form is the evaluation representation used by Stages 2 and 3. Blank optional bounds are normalized to nominal, and a blank optional tolerance is normalized to zero.

### Named Tolerance Axis

A three-element axis associated with a base variable. Its positions represent the variable's minimum, nominal, and maximum values. Named axes allow expression operands to be aligned and broadcast by variable identity rather than by array position.

### Derived Variable

A named quantity calculated from base variables and/or earlier derived variables. Its underlying result retains the applicable named tolerance axes and contains the evaluated Cartesian product of their values.

A derived variable may instead be a dimensioned or dimensionless scalar constant with no tolerance axes. Shared underlying base axes are aligned once when derived variables are combined.

### Constraint

An automatically numbered equality or inequality whose result is assessed both over the complete relevant tolerance space and at the all-nominal point. Each row contains one comparison, and all rows are logically ANDed.

Constraint operands are aligned and broadcast across their named axes. The all-nominal result is the element selected at the middle (`nominal`) coordinate of every underlying Stage 1 axis.

### Units and Dimensions

- Calculations are unit aware.
- Compatible quantities are converted as needed during calculation. For example, adding `1 mm` and `0.1 in` is valid.
- Operations on dimensionally incompatible quantities are rejected. For example, adding `1 mL` and `0.1 in` is invalid.
- The precise unit syntax, supported unit catalog, display-unit rules, and behavior for derived units remain to be specified.
- All values in one base-variable row share the same unit.
- Derived-variable dimensions and units are inferred from their expressions.
- Derived results prefer the measurement system used by the majority of their inputs, then a unit scale that reduces the number of displayed digits.

## 5. User Experience

### Key Screens or Views

- One primary page containing five vertically stacked workflow sections.
- Stage 2 derived-variable rows include collapsible result details.
- Stage 2 includes a question-mark help control that gives users access to the applicable expression-validation and evaluation rules.
- Stages 1–3 use horizontally aligned input rows with controls for adding, deleting, and drag-reordering definitions.
- Stage 4 uses a compact vertical form consisting of objective selection, decision-variable selection, and an Optimize action.
- Stage 5 shows a complete read-only result snapshot ordered as base variables, derived expressions with calculated inspectors, evaluated constraints, and an optimization setup summary.

### Accessibility and Usability

- The visual design should be polished, restrained, and professional rather than flashy.
- The interface should provide rich, contextual feedback for validation errors, dependency errors, evaluation failures, constraint states, calculation results, optimization progress, and optimization outcomes.
- Error messages should be informative and actionable rather than generic.
- Layout changes should animate smoothly, including:
  - adding and removing definition rows;
  - drag-reordering rows;
  - expanding and collapsing Stage 2 inspectors;
- Motion should preserve spatial context and avoid interfering with data entry.
- When the user requests reduced motion, layout animation durations become
  effectively instantaneous and loading indicators remain static. No content,
  controls, or calculation feedback is removed.

## 6. Integrations

- The initial release has no required external service integrations.
- Local delivery of packaged runtime assets is an implementation concern rather than a user-data integration.

## 7. Security and Privacy

- Problem definitions and calculations remain in the browser and are not sent to an application server.
- The editable working problem is not automatically persisted in browser-local storage.
- The initial release does not support saving or importing editable problem-definition files.
- The user may explicitly download a Stage 5 result snapshot through **Export result**.

## 8. Technical Requirements and Constraints

- Expression evaluation must support named-axis alignment and broadcasting equivalent to the required `xarray` behavior, whether implemented directly or through a suitable library.
- The calculation engine must perform dimensional analysis, convert compatible units, and reject operations involving incompatible dimensions.
- The selected expression evaluator's conventions must be documented to users from within Stage 2.
- Expression evaluation must detect failures at individual tolerance combinations and report the responsible named-axis positions.
- Validation must be triggered on loss of focus (`blur`) for the specified cells and fields, not on every keystroke.
- The initial implementation should favor a global Stage 1–3 validation and recalculation cycle over incremental dependency updates.
- Optimization must be provided by an established library with constrained optimization and robust termination/error reporting capabilities.
- TolAssist must be built as a client-side single-page web application.
- The app must not require an application server for calculation or optimization during local development.
- All validation, expression evaluation, broadcasting, constraint evaluation, and optimization must therefore run in the browser unless this requirement is revised later.
- The UI implementation must support polished state transitions for dynamic list and disclosure layout changes.

### Candidate Architecture (Pending Decision)

The leading implementation option is a hybrid static application:

- **UI:** React with TypeScript, built with Vite.
- **Scientific runtime:** Python running entirely in the browser through Pyodide.
- **Threading:** load and run the scientific runtime in a Web Worker so validation and optimization do not block interaction or animation on the main UI thread.
- **Scientific libraries:** evaluate established packages such as Pint for units, xarray for named-axis broadcasting, and SciPy for constrained optimization. Package compatibility and browser bundle impact must be proven with a technical spike before final selection.
- **Expression safety:** parse a deliberately restricted mathematical grammar; do not pass user input to unrestricted Python or JavaScript evaluation.
- **Build:** produce a locally verifiable production build; distribution and hosting are deferred.
- **UI motion:** use a mature layout-animation approach that respects the user's reduced-motion preference.

Advantages:

- Closely matches the specified xarray-style calculation model.
- Provides access to a mature constrained-optimization library rather than requiring a custom solver.
- Keeps all engineering data and computation in the browser.
- Keeps calculation and optimization entirely client-side.

Tradeoffs:

- The Python/WebAssembly runtime and scientific packages increase initial download and startup time.
- Communication between the TypeScript UI and Python worker requires a carefully versioned message protocol.
- Python package availability, local asset delivery, and caching behavior must be verified early.
- Expression syntax must be designed intentionally; Python's native syntax does not directly accept every desirable unit-literal form.

An all-TypeScript alternative could use a browser-native unit/expression library plus custom named-axis broadcasting and a JavaScript or WebAssembly optimizer. This would likely reduce startup weight, but its optimizer maturity and the amount of bespoke scientific calculation code must be validated before choosing it.

### Browser-Native Optimizer Options (Under Evaluation)

#### NLopt compiled to WebAssembly

- NLopt is an established nonlinear optimization library offering multiple local and global, derivative-free and gradient-based algorithms.
- COBYLA is a particularly relevant initial candidate because it is derivative-free and supports arbitrary nonlinear equality and inequality constraints.
- TolAssist could run an NLopt WebAssembly module inside a Web Worker and supply numerical objective and constraint callbacks from TypeScript.
- Each element of a broadcast Stage 3 result can be exposed to the solver as an individual scalar constraint, ensuring that a feasible result corresponds to green status.
- `nlopt-js` is an existing npm/WebAssembly wrapper with objective, bounds, equality constraints, inequality constraints, and stopping controls. However, its age, limited maintenance, older build tooling, incomplete typing, and use of only a subset of NLopt require a technical and maintenance-risk review.
- A more controlled alternative is to compile a pinned upstream NLopt release to WebAssembly and maintain a narrow TolAssist-specific TypeScript binding. This retains the established solver while adding responsibility for the WebAssembly build and binding layer.

#### CasADi with a nonlinear solver

- CasADi is a mature nonlinear-optimization modeling system with symbolic differentiation and solver integration.
- It is not currently a turnkey browser/TypeScript dependency for TolAssist's runtime-defined expressions; using it would likely require a custom WebAssembly build or generated solver code.
- Runtime-defined user problems, bundle complexity, and integration effort make this a secondary research option rather than the leading browser-native choice.

#### Pure JavaScript numerical optimizers

- Packages providing Powell, L-BFGS, gradient descent, genetic search, or similar algorithms are available.
- The reviewed general-purpose packages do not natively provide the required combination of nonlinear equality constraints, nonlinear inequality constraints, robustness, and active maintenance.
- Converting all constraints into penalty terms would place critical solver behavior in bespoke TolAssist code and is not preferred.

#### Linear, mixed-integer, and constraint-programming solvers

- Browser packages exist for HiGHS, GLPK, CLP, OR-Tools, and MiniZinc.
- These are strong tools for linear, mixed-integer, Boolean, scheduling, and constraint-programming models.
- They do not fit TolAssist's arbitrary continuous nonlinear expressions and constraints, even though the initial max-min tolerance objective alone can be reformulated linearly.

#### Required Optimizer Spike

Before selecting a browser-native optimizer, build a small proof of concept that verifies:

- browser and Vite loading from static assets;
- execution in a Web Worker;
- nonlinear `<=`, `==`, and `>=` constraints;
- derivative-free operation over nominal/tolerance decision vectors;
- enforcement of `tolerance ≥ 0`;
- expansion of broadcast constraint arrays into scalar solver constraints;
- cancellation, time limits, evaluation limits, divergence detection, and usable termination diagnostics;
- correct behavior on infeasible, unbounded, nonsmooth, and domain-error cases;
- acceptable bundle size, startup time, and optimization performance.

### Browser-Native Broadcast Calculation Options (Under Evaluation)

No established, actively maintained JavaScript package has yet been identified that directly provides xarray-equivalent broadcasting by named dimensions together with TolAssist's unit and diagnostic requirements.

Available browser-native libraries provide useful pieces:

- math.js supports unit-aware scalar expressions, multidimensional matrices, and positional broadcasting;
- stdlib provides actively maintained TypeScript-compatible ndarrays and positional broadcast views;
- TensorFlow.js provides performant multidimensional tensors and positional operations, but is oriented toward machine learning and does not attach semantic names or engineering units to axes;
- the older `ndarray` ecosystem provides lightweight typed-array views, shapes, and strides, but not named-axis alignment.

The leading design is a small, domain-specific TolAssist evaluation layer using established expression and unit primitives:

- Represent each evaluated value with:
  - an ordered list of underlying Stage 1 axis identifiers;
  - a flat numeric or quantity buffer;
  - dimension/unit metadata.
- Every axis has exactly three labeled coordinates: minimum, nominal, and maximum.
- Parse and validate each expression once, determine its transitive Stage 1 dependencies, and compile a restricted scalar evaluation plan.
- Form the expression's result axes as the ordered union of those dependencies.
- Enumerate the Cartesian coordinates of the result axes and evaluate the compiled scalar expression at each coordinate.
- When reading an operand, project the current coordinate onto only the axes carried by that operand. Shared axes therefore align automatically and are never duplicated.
- Store results in a flat buffer with deterministic strides; avoid materializing broadcast copies of operand arrays.
- Derive the nominal result by selecting coordinate index `1` along every axis.
- Preserve the coordinate labels during evaluation so domain errors can identify combinations such as `a = min, b = max`.
- Evaluate derived variables in topological row order and reuse their stored buffers in later expressions.

This layer would implement TolAssist's named-coordinate semantics only. It would not reimplement expression parsing, unit conversion, elementary mathematics, or general-purpose linear algebra.

A technical spike must compare:

- direct unit-aware evaluation for every combination;
- a validated unit-inference pass followed by normalized numeric evaluation;
- a minimal custom flat-buffer representation;
- using stdlib ndarray storage/broadcast helpers underneath the named-axis layer.

The spike must verify correctness, diagnostic quality, bundle size, and repeated-evaluation performance during optimization. Calculation size grows as `3^N`, but expected problems contain few variables. The initial release will not impose a predefined axis count or combination limit; performance safeguards may be introduced later if testing or real usage demonstrates a need.

## 9. Success Criteria

- Unit, expression, broadcasting, constraint, optimization, and snapshot tests
  pass through the complete local quality gate.
- A successful optimization is independently feasible and produces a complete,
  immutable, exportable Stage 5 snapshot without changing editable inputs.
- Chromium end-to-end tests cover the complete workflow, keyboard reordering,
  reduced motion, narrow-screen layout, cancellation/recovery, and export.
- Automated axe-core scans report no accessibility violations on the initial
  page or a completed result page.
- A production build succeeds and keeps solver runtimes outside the initial
  application bundle.

## 10. Scope and Delivery

### Initial Release

- A client-side, five-stage single-page application that runs locally in development and produces a verified local production build.
- An ephemeral editable session with no automatic local persistence and no problem-definition import/export.
- Explicit JSON export of successful Stage 5 result snapshots.

### Future Possibilities

TBD

## 11. Decisions

- The product name is **TolAssist**.
- The workflow uses five stacked sections on a single page.
- Toleranced base variables use three evaluation points: minimum, nominal, and maximum.
- Derived-variable dependencies are order-dependent to prevent circular references.
- Validation occurs when an input loses focus.
- Constraint status uses green, yellow, and red states based on full-space and nominal satisfaction.
- Constraints support at least `<=`, `==`, and `>=`; exact equality semantics depend on the eventual optimization engine.
- Constraint rows contain one comparison each and are ANDed together.
- Initial constraint feedback is limited to the three status colors.
- Units participate in calculations and are dimensionally validated.
- Variable names are globally unique and use the selected expression language's identifier rules.
- Symmetric tolerances are absolute; relative tolerances are unsupported.
- Definition rows can be added, deleted down to zero, and reordered by dragging.
- Completely empty definition rows are ignored.
- Startup state includes two empty base-variable rows and one empty derived-variable row.
- Startup state includes no constraint rows.
- Renames are not propagated to expressions or constraints.
- Definition changes cause dependency revalidation but never automatic repair or rewriting.
- Derived-result units are inferred and automatically scaled for readable presentation.
- Derived-variable rows have no editable unit field; inferred units appear in the collapsible result inspector.
- Expressions support both unit-bearing quantities and dimensionless numbers and constants.
- Derived variables may be scalar constants with no tolerance axes.
- Named axes propagate through derived expressions by union; a shared base axis aligns and is not duplicated.
- Derived expressions are sandboxed mathematical expressions, not executable general-purpose code.
- Calculus operations are outside the supported expression language.
- Constant derived-variable rows do not show a result inspector.
- Ambiguous mathematical conventions follow the selected evaluation package and are exposed through Stage 2 help.
- Any failed tolerance combination invalidates the entire derived expression and produces an axis-specific diagnostic.
- Function arguments and results are subject to dimensional-consistency rules.
- Both Stage 1 tolerance representations are cached internally.
- The Stage 1 format toggle changes the visible cached form without recalculating it.
- Editing one Stage 1 form recalculates the other using the specified midpoint and symmetric-window formulas.
- Automatic unit scaling generally targets values in the range `1 ≤ magnitude < 1000` when an appropriate prefixed unit exists.
- Stage 2 and Stage 3 always evaluate the cached three-point representation.
- In a non-empty Stage 1 row, name, nominal, and unit are required; minimum, maximum, and tolerance have zero-width defaults.
- Invalid Stage 1 rows cannot toggle representations.
- Any Stage 1–3 input blur triggers validation of all Stage 1–3 inputs; if validation passes, all Stage 2 and 3 calculations rerun.
- Stage 3 uses the same named-axis broadcasting rules as Stage 2.
- The nominal constraint result is the middle coordinate along every underlying base-variable axis.
- Invalid constraints, including those with invalid dependencies, remain uncolored.
- Validation failures never clear user input; they clear current Stage 2 calculated values and remove Stage 3 status colors.
- Stage 4 objective functions are selected from a predefined catalog and cannot be authored by users.
- The initial and preselected objective maximizes the smallest tolerance among the selected Stage 1 variables, subject to all Stage 3 constraints.
- Equivalent maximization or minimization formulations may be used according to the chosen engine.
- The objective catalog is extensible even though the initial release contains one option.
- TolAssist is a browser-executed single-page application; distribution and hosting decisions are deferred.
- The visual style is polished and restrained, with rich contextual feedback and smooth layout transitions.
- Stage 4 decision variables are selected from the Stage 1 variables through a multiselect.
- Every selected Stage 1 variable contributes nominal and tolerance decision variables to optimization.
- Optimized tolerance decision variables are inherently constrained to be non-negative.
- Optimization uses all Stage 3 constraints and accepts only solutions for which every constraint is green.
- Predefined objectives encode their own minimize/maximize direction.
- The optimizer applies no implicit engineering constraints beyond the problem's inherent valid numeric domain; user problem constraints come from Stage 3.
- Optimization runaway or divergence must halt with an error.
- The Optimize action requires a selected objective, one or more update variables, and valid Stage 1–3 inputs.
- Optimization is allowed with zero Stage 3 constraints.
- Optimization results are non-destructive copies; Stage 1 definitions remain unchanged.
- Stage 5 displays every Stage 1 variable in nominal/tolerance form, using optimized values for selected variables and unchanged values for unselected variables.
- Stage 5 reevaluates read-only copies of all Stage 2 expressions and exposes their minimum/nominal/maximum results.
- Stage 5 reevaluates read-only copies of the Stage 3 constraints against the optimized result.
- Stage 5 ends with the objective text and decision-variable selections used for the successful optimization.
- Stage 5 can export its complete successful snapshot as versioned, structured JSON.
- Stage 5 exports use schema version `1` and filenames of the form
  `TolAssist-result-<ISO-timestamp>.json`, with filename-unsafe timestamp
  punctuation replaced by hyphens.
- Editable problem state is not autosaved and cannot be imported or exported in the initial release.
- Stage 5 is initially empty and retains the last successful result across failed runs.
- Upstream edits do not alter or mark the retained Stage 5 snapshot.
- Definition-row drag handles support keyboard pickup, arrow-key movement, and
  drop/cancel controls in addition to pointer dragging. The variable multiselect
  retains the browser's native keyboard interaction model.
- Constraint states pair color with visible text labels and accessible status
  descriptions.
- Horizontally dense definition rows reflow into labeled vertical controls on
  narrow screens; result grids become a single column and the page must not
  introduce horizontal scrolling at a 360-pixel viewport width.
- The initial supported-browser baseline is the current stable Chromium engine.
  Firefox and Safari are not qualified for the initial local release.

## 12. Open Questions

- What precise limits and criteria define optimization runaway or divergence?
- How are optimization progress, completion, failure, and results presented?
- Which frontend framework, language, expression/unit library, multidimensional calculation approach, and browser-compatible optimization engine should be used?
- Should optimization run on the main browser thread or in a Web Worker?
- What engineering disciplines and user roles are the initial audience?
- What variable-name rules and reserved words should expressions use?
- What expression operators and functions are required?
- Which unit system, unit aliases, and derived units must be supported?
- How are ties and mixed derived-unit systems resolved when selecting a derived result's display unit?
- How should automatic unit scaling handle zero, values spanning multiple orders of magnitude, and compound units?
- How should equality constraints account for floating-point precision?
- How should invalid or temporarily incomplete input be displayed and handled?
- What numeric input syntax is accepted, including scientific notation, decimal separators, and special values such as infinity or NaN?
- What numeric precision and formatting rules apply to inputs, calculated results, and optimized results?
- What exact optimization states and controls are required: loading, running, canceling, success, infeasible, timed out, diverged, or failed?
- What happens if the user edits the problem while optimization is running?
- What are the initial-release non-goals?

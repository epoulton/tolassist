# ADR 0004: math.js expressions with a TolAssist named-axis layer

- Status: Accepted
- Date: 2026-08-11

## Context

TolAssist needs a restricted arithmetic expression language, engineering units,
dimensional validation, compiled repeated evaluation, dependency extraction,
and xarray-like alignment by named tolerance axes. No reviewed browser-native
package combines all of these requirements directly.

The Phase 2 spike considered:

- math.js for its expression tree, compiled evaluator, units, conversions, and
  elementary functions;
- UnitMath as a focused unit-arithmetic alternative without the required full
  expression parser;
- Cortex Compute Engine as a rich symbolic system whose LaTeX-oriented scope is
  broader than the requested engineering text-expression language;
- stdlib ndarray helpers for positional array storage and broadcasting.

## Decision

Use math.js behind TolAssist-owned `ExpressionEngine` and `UnitParser`
interfaces. Parse once, traverse and reject every syntax-tree construct outside
the allowlist, extract dependencies, and compile the approved tree for repeated
scalar evaluation. Do not expose math.js nodes or quantities outside the math
boundary.

Implement the required named-axis behavior as a small TolAssist layer using an
ordered axis-ID list and `Float64Array`. Every axis has exactly three
coordinates, so deterministic strides, projection, broadcasting, nominal
selection, and coordinate diagnostics require little general ndarray
machinery. Do not add an ndarray dependency unless later profiling demonstrates
a need.

Normalize evaluated quantities to SI within named-axis buffers. Also compile a
numeric-only plan after dimensional validation for repeated solver callbacks.
Offset units remain on the direct unit-aware path because scalar replacement is
not mathematically equivalent for them.

## Consequences

- Dimensioned literals such as `1 mm + 0.1 in` work, while incompatible
  operations are rejected.
- Assignment, arrays, objects, accessors, comparisons, and arbitrary functions
  are rejected before compilation.
- Derived values align shared base axes exactly once and carry coordinate labels
  into domain-error messages.
- math.js expression conventions, including `^` for exponentiation, become the
  initial user-facing convention.
- The app owns the interfaces needed to replace math.js or the storage layer
  later without rewriting Stage 1, Stage 2, or optimization code.

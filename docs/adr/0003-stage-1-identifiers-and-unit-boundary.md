# ADR 0003: Portable identifiers and a replaceable Stage 1 unit boundary

- Status: Accepted for Phase 1
- Date: 2026-08-11

## Context

Stage 1 requires variable-name and unit-field validation before the final
expression and unit engine is selected in Phase 2. Committing the domain model
to a particular scientific package now would undermine the planned engine
comparison.

## Decision

Base-variable names use the portable ASCII identifier subset
`[A-Za-z_][A-Za-z0-9_]*`. This syntax is familiar in both JavaScript and Python
and avoids coupling editable problem state to either language. Engine-specific
reserved words will be added when the expression engine is selected.

Unit-field validation is exposed through an application-owned `UnitParser`
interface. The Phase 1 implementation validates conservative unit-expression
syntax and normalizes whitespace only. It does not claim dimensional meaning.
Phase 2 will replace or adapt this implementation with the selected unit-aware
engine while preserving the Stage 1 contract.

## Consequences

- Stage 1 can reject malformed names and unsafe unit text now.
- Editable and validated variable models do not depend on a third-party math
  package.
- Unit compatibility, aliases, conversions, and canonical dimensions remain
  Phase 2 work and must not be inferred from Phase 1 syntax validation.

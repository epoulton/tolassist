# Phase 3 validation lifecycle

Stages 1, 2, and 3 share one deliberately simple validation cycle. Whenever an
input loses focus, or a definition is deleted or reordered, TolAssist performs
these steps in order:

1. Validate and normalize every non-empty Stage 1 row.
2. Validate and evaluate Stage 2 rows in displayed order, exposing only base
   variables and earlier valid derived variables to each expression.
3. Validate and broadcast every Stage 3 comparison over the resulting scope.
4. Publish calculated inspectors and constraint statuses only if all populated
   rows across all three stages are valid.

If any populated row is invalid, editable text remains exactly as entered,
Stage 2 calculated outputs are withheld, and Stage 3 rows return to an uncolored
"Not evaluated" state. The next blur reruns the complete cycle.

Constraint equality currently uses a configurable provisional absolute and
relative tolerance of `1e-12`. Phase 4 will connect this setting to the
solver-neutral problem compiler before a concrete optimizer is selected.

Every dynamic definition row has a stable internal ID. Pointer dragging and the
dnd-kit keyboard interaction both reorder IDs rather than using variable names
as storage identity. Layout and disclosure transitions use CSS and collapse to
effectively no motion when the operating system requests reduced motion.

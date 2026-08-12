# ADR 0005: Accessible row reordering and layout animation

- Status: Accepted
- Date: 2026-08-11

## Context

Stages 1–3 require pointer and keyboard reordering plus smooth layout changes
when definitions are added, removed, reordered, or expanded. These interactions
must respect reduced-motion preferences and must not make row position part of
the row's storage identity.

## Decision

Use dnd-kit for sortable pointer and keyboard interactions. Each row retains a
stable domain ID, while its current array position controls displayed order and
Stage 2 dependency availability.

Use FormKit AutoAnimate on the three definition-list containers for add,
remove, and layout transitions. Keep the expression inspector transition in CSS
because its disclosure state belongs to one row. The existing global
`prefers-reduced-motion` rule disables CSS motion, and AutoAnimate disables its
animations automatically for the same user preference.

## Consequences

- Drag handles work with pointer input and with Space plus arrow keys.
- Add, remove, and reordered list layouts transition without coupling animation
  state to the engineering domain model.
- Stable IDs survive every reorder, so renaming never changes storage identity.
- The interaction dependencies add bundle weight and should be revisited only
  if later performance measurement shows a material cost.

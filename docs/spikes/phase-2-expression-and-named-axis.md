# Phase 2 expression and named-axis spike

## Outcome

The spike meets the Phase 2 exit criteria with math.js behind an application
adapter and a purpose-built flat-buffer named-axis evaluator.

## Verified behavior

- compatible unit conversion, including `1 mm + 0.1 in`;
- rejection of incompatible dimensions and dimensioned logarithms;
- restricted arithmetic syntax, dimensioned literals, constants, powers,
  roots, absolute value, logarithms, and trigonometry;
- two-axis nine-value and three-axis 27-value Cartesian evaluation;
- scalar constants with no axes;
- shared-axis alignment without duplication through derived expressions;
- Stage 2 dependencies limited to base variables and earlier valid rows;
- coordinate-specific domain errors such as `a = min, b = nom`;
- canonical SI buffers for consistent downstream calculation.

## Storage finding

The custom representation needs only ordered axis IDs, a `Float64Array`, and
base-3 indexing. It avoids materialized broadcast copies and keeps the
coordinate metadata that TolAssist diagnostics require. Adding stdlib ndarray
storage would add an abstraction without reducing the application-owned named
alignment logic at the expected problem sizes.

## Evaluation benchmark

The checked-in benchmark harness compares compiled direct unit-aware evaluation
with a compiled normalized-numeric plan and verifies identical checksums. One
representative local run of 4,000 evaluations of
`sqrt(a^2 + b^2)` with mixed `mm` and `in` inputs measured:

| Path               | Elapsed time |
| ------------------ | -----------: |
| Direct unit-aware  |      51.8 ms |
| Normalized numeric |      38.7 ms |

This is an indicative development measurement, not a release performance
guarantee. The automated suite checks numerical equivalence and collects both
timings but deliberately avoids a flaky wall-clock threshold. The measured
throughput is ample for current interactive calculations; Phase 4 should use
the normalized plan for repeated solver callbacks where offset units are not
involved.

The Phase 2 production build is approximately 901 KB minified and 261 KB gzip
for JavaScript. This is an acceptable local spike baseline, but the expression
engine should be split from the initial application chunk when the Stage 2 UI is
wired in Phase 3.

## Known limits carried forward

- Presentation-unit selection and engineering-prefix formatting remain future
  UI work.
- Offset temperature arithmetic follows math.js conventions and is not eligible
  for normalized numeric compilation.
- Final reserved variable names should be frozen with the Stage 2 help content.
- Solver-worker serialization of compiled plans is deferred to Phase 4.

# @gabrielvfonseca/value-lineage

## 0.1.0

### Minor Changes

- e81ebb9: Initial release: `trace()` records how elements flow through array pipelines (filter, map, flatMap, reduce, find, some, every, sort, toSorted, slice) and reports the step where the result diverged.
- c476aea: Add a build plugin (`@gabrielvfonseca/value-lineage/esbuild`) and a source transform (`@gabrielvfonseca/value-lineage/transform`) that rewrite inline chains such as `trace("name", () => order.items.filter(f).map(g))` into the explicit-input form, so they are traced. Add `traceAsync` for callbacks that await, and the `vacuous-every` and `default-numeric-sort` findings.

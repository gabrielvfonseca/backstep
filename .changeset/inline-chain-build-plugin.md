---

## "value-lineage": minor

Add a build plugin (`value-lineage/esbuild`) and a source transform (`value-lineage/transform`) that rewrite inline chains such as `trace("name", () => order.items.filter(f).map(g))` into the explicit-input form, so they are traced. Add `traceAsync` for callbacks that await, and the `vacuous-every` and `default-numeric-sort` findings.

# Limitations

These are the boundaries of what the library can see and report. Each one is a deliberate design
choice or a known gap.

## Inline chains need the build plugin

Without the plugin, `trace("name", () => order.items.filter(...))` records nothing, because the
runtime only sees the input it is given. The [build plugin](BUILD_PLUGIN.md) rewrites the common
form. A receiver built across several statements still needs the explicit form.

## Only arrays are traced

Maps, sets and plain objects pass through `trace` with no steps. For an object, trace
`Object.entries(obj)`. For a map, trace `[...map.entries()]`.

## Synchronous array callbacks

`trace` rejects a callback that returns a promise. `traceAsync` lets the outer callback await, but
the array methods inside still run synchronously, as native arrays do.

## Identity is by position

Elements are tracked by their index in the original input, not by object identity. An element
written directly into the traced array (`xs[0] = …`) loses its origin and is shown as `#?`.

## Samples are shallow copies

Samples keep one level of arrays and plain objects. Changes to deeper structure after a step can
show up in an old sample.

## Heuristics, not proof

Findings flag patterns that are usually bugs. A flagged step can be intentional, and a real bug can
go unflagged. Treat a report as a pointer to investigate, not a verdict.

## Redaction is by name

Keys matching `redactKeys` are masked. A sensitive value under an unmatched key is shown in full.

## Only tracing order is recorded

`concat`, `reverse` and `toReversed` keep element identity, but they are not recorded as steps,
because they never remove or change an element. Other array methods (for example `at` or
`includes`) work on the traced array but produce no step.

## Performance

With tracing on, a 100,000-element pipeline runs about 2 to 3 times slower than native. Tracing
off is within measurement noise of native. These figures are from one machine. Run
`pnpm bench` to measure your own.

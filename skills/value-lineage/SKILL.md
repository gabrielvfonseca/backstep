---
name: value-lineage
description: Debug an unexpected value in a JavaScript or TypeScript array pipeline using @gabrielvfonseca/value-lineage. Use when a filter, map, reduce, sort or find returns a surprising result such as 0, NaN, an empty array or the wrong order, or when the user asks how a value got into a state. Covers wrapping a pipeline in trace, reading the report, and the build plugin for inline chains.
---

# Debugging with value-lineage

Use this skill when an array pipeline produces a result that looks wrong and the cause is not
obvious from reading the code.

## Steps

1. **Find the pipeline.** Locate the chain that produces the wrong value, for example
   `items.filter(...).map(...).reduce(...)`.

2. **Wrap it in `trace`.** Pass the array as the second argument, and use the callback parameter
   in place of the array:

   ```ts
   import { trace } from "@gabrielvfonseca/value-lineage";

   const total = trace("order.total", order.items, (items) =>
     items.filter(isAvailable).map(getPrice).reduce((a, b) => a + b, 0),
   );
   ```

   If the chain is written inline, `trace("name", () => order.items.filter(...))`, it will not be
   traced unless the build plugin is configured. See `docs/BUILD_PLUGIN.md`, or rewrite it in the
   explicit form above.

3. **Run the code and read the report.** The report prints only when a warning or error is found.
   If nothing is printed and the value is still wrong, set `always: true` in the options, or call
   `traceReport` in a test to inspect `report.steps` directly.

4. **Read the diverged step.** The line `diverged at step N` names the first problem. The step
   lines show input and output counts. The lines beneath show dropped elements by their input
   position (`#0`, `#1`, …) and the reason each was dropped.

5. **Map the finding to a cause.** Check `docs/FINDINGS.md` for the code. For example:
   - `collapsed`: a filter removed every element. Check the predicate and the field it reads.
   - `non-finite`: a value became `undefined`, `null` or `NaN`. Look for a missing `return` or a
     missing field.
   - `returned-initial`: the reduce had no elements. Look at the step before it.
   - `numeric-string-concat`: numbers arrived as strings. Convert with `Number()`.
   - `default-numeric-sort`: `sort()` compared numbers as text. Pass `(a, b) => a - b`.

6. **Fix the cause, then remove the trace** or leave it in place. When tracing is off (production
   by default), `trace(name, input, fn)` is exactly `fn(input)`.

## Things to check

- Redaction is by key name. Sensitive values under unusual keys are shown in full. Review reports
  before pasting them anywhere.
- Async callbacks need `traceAsync`. Calling `trace` with a promise-returning callback throws.
- Tracing is on only when `NODE_ENV` is `development` or `test`, unless `EXPLAIN=1` is set.
- Findings are heuristics. A flagged step may be intentional.

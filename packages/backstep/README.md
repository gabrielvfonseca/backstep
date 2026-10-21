# @gabrielvfonseca/backstep

**How did this value get into this state?**

`backstep` records how elements flow through an array pipeline and, when the result looks wrong,
tells you the step where it went wrong and why. It replaces the `console.log` archaeology of
"which filter dropped my items?".

```ts
import { trace } from "@gabrielvfonseca/backstep";

const total = trace("order.total", order.items, (items) =>
  items
    .filter(isAvailable)
    .map(getPrice)
    .reduce((a, b) => a + b, 0),
);
```

When `total` is `0` and every item was filtered out, the console shows:

```
order.total = 0   ⚠ diverged at step 1
 ├ input                   3 items
 ├ filter(isAvailable)     3 → 0   ✖
 │    e.g. #0 {name: "Keyboard", price: 79, sku: "KB-01", stock: 0}  #1 {…}  #2 {…}
 │    ✖ removed all 3 element(s) (isAvailable → false)
 ├ map(getPrice)           0 → 0
 └ reduce(<anonymous>, 0)  0 → 0   ⚠
      ⚠ had no elements to combine and returned its initial value 0
```

Each dropped element is identified by its position in the original input (`#0`, `#1`, …), so you
can find it in your data. Nothing is logged when the result is fine.

## Install

The package is published to GitHub Packages under the `@gabrielvfonseca` scope. Point that scope
at the GitHub registry, authenticating with a token that has `read:packages`:

```ini
# .npmrc
@gabrielvfonseca:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
npm install @gabrielvfonseca/backstep
```

Requires Node 20 or newer. The runtime `trace` has no dependencies and also works in browsers. The
build plugin needs the optional peer dependencies `esbuild` and `@babel/parser`.

## Usage

### `trace(name, input, fn, options?)`

Runs `fn` with a traced view of `input`, and returns exactly what `fn` returns. Use the traced
argument in place of the original array.

```ts
trace("cart.total", cart.items, (items) => items.filter(inStock).map(price).reduce(sum, 0), {
  expect: (total) => total > 0,
  expectMessage: "total is positive",
});
```

| Option           | Meaning                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `expect(result)` | A predicate the result must satisfy. A failure is reported as an error at the last step. |
| `expectMessage`  | Describes the expectation in the report.                                                 |
| `always`         | Emit a report even when nothing diverged.                                                |

A report is emitted only when something looks wrong (or `always` is set). By default it is
printed with `console.warn`; use `configure({ onReport })` to send it elsewhere.

### `traceAsync(name, input, fn, options?)`

For callbacks that need to `await` (for example, to fetch a rate before filtering). The array
operations inside still run synchronously; only the callback itself is awaited:

```ts
const total = await traceAsync("cart.total", cart.items, async (items) => {
  const rate = await fetchRate(cart.currency);
  return items.map((item) => item.price * rate).reduce((a, b) => a + b, 0);
});
```

Calling `trace` with a callback that returns a promise throws an `BackstepError` that points you
to `traceAsync`.

### `traceReport(name, input, fn, options?)`

Like `trace`, but always records and returns `{ value, report }`. Use it in tests and tooling to
assert on the report. The report is available programmatically:

```ts
const { value, report } = traceReport("total", items, (xs) => xs.filter(isAvailable));
report.divergedAt; // 0-based index into report.steps, or undefined
report.findings; // [{ severity, step, code, message }]
report.toString(); // the tree shown above
report.toJSON(); // plain data, safe to serialise
```

### Errors

If the callback throws, `trace` rethrows the same error and attaches the partial report:

```ts
import { getReport } from "@gabrielvfonseca/backstep";

try {
  trace("orders", orders, (xs) => xs.map(toLine).reduce(sum));
} catch (error) {
  getReport(error)?.toString(); // what happened before the throw
}
```

### Build plugin for inline chains

Writing `trace("name", () => order.items.filter(...).map(...))` reads naturally, but the runtime
cannot see inside the callback. The build plugin rewrites that form at build time into the
explicit-input form, so it is traced:

```ts
// your source
const total = trace("order.total", () => order.items.filter(isAvailable).map(getPrice));

// after the plugin
const total = trace("order.total", order.items, (__backstep_input) =>
  __backstep_input.filter(isAvailable).map(getPrice),
);
```

Enable it in esbuild (and tsup, which uses esbuild):

```ts
import { valueLineage } from "@gabrielvfonseca/backstep/esbuild";

build({ plugins: [valueLineage()] });
```

The plugin only touches files that import `trace` from `@gabrielvfonseca/backstep` (or through a namespace
import), and only callbacks that take no arguments and whose body is a chain of array methods over
one receiver. Other calls are left exactly as written. Files under `node_modules` are skipped.

For other bundlers, the same rewrite is available as a plain function:

```ts
import { transformSource } from "@gabrielvfonseca/backstep/transform";

const { code, changed } = transformSource(source, "path/to/file.ts");
```

The plugin needs `esbuild` (for `@gabrielvfonseca/backstep/esbuild`) and `@babel/parser` (for both entries).
Both are optional peer dependencies, so the runtime `trace` has no dependencies.

### Configuration

```ts
import { configure, enable, disable } from "@gabrielvfonseca/backstep";

configure({
  enabled: true, // see "When tracing is on" below
  always: false,
  maxSamples: 5, // elements kept per step for display
  maxDepth: 3,
  maxItems: 6,
  maxStringLength: 80,
  redactKeys: /pass(word)?|secret|token|api[-_]?key/i,
  onReport: (report) => myLogger.debug(report.toString()), // or null to silence
});
```

Invalid values throw an `BackstepError` at `configure` time, not later.

### When tracing is on

- In `NODE_ENV=development` and `NODE_ENV=test`: on.
- Otherwise: off. In production, `trace` runs the callback directly, with no wrapping.
- `BACKSTEP=1` or `BACKSTEP=0` overrides either default.
- In browsers (no `process`): off until you call `enable()`.

When disabled, `trace(name, input, fn)` is exactly `fn(input)`. It is safe to leave in code.

## What it can see

Traced operations: `filter`, `map`, `flatMap`, `reduce`, `reduceRight`, `find`, `findIndex`,
`findLast`, `findLastIndex`, `some`, `every`, `sort`, `toSorted`, `slice`.

`concat`, `reverse` and `toReversed` keep element identity but are not recorded as steps, since
they never remove or change elements. Array methods that are not listed (for example `at` or
`includes`) work normally on the traced array, but do not produce steps.

Each divergence is one of these findings:

| Code                     | Severity | Example message                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------ |
| `collapsed`              | error    | removed all 3 element(s) (isAvailable → false)                           |
| `non-finite`             | error    | 3 of 3 result(s) are undefined, null or NaN                              |
| `threw`                  | error    | reduce(…) threw TypeError: Reduce of empty array with no initial value   |
| `expectation-failed`     | error    | total is positive failed; result was 0                                   |
| `dropped-majority`       | warning  | dropped 19 of 20 element(s)                                              |
| `identical-outputs`      | warning  | returned the same value for all 5 elements                               |
| `returned-initial`       | warning  | had no elements to combine and returned its initial value 0              |
| `non-numeric-comparator` | warning  | comparator returned a boolean (JavaScript coerces it to 1 or 0)          |
| `numeric-string-concat`  | warning  | combined numeric-looking strings into the string "124"                   |
| `vacuous-every`          | warning  | every() over no elements is true; an empty input passes every check      |
| `default-numeric-sort`   | warning  | sort() without a comparator compares numbers as text (10 sorts before 9) |
| `no-match`               | info     | no element matched                                                       |

Findings with severity `error` or `warning` count as divergence. The first such step is
`divergedAt`.

## Limits and honest caveats

- **Arrays only.** `trace` records steps for arrays. Maps, sets and plain objects pass through
  with no steps. For an object, call `Object.entries(obj)` and trace the resulting array.
- **Inline chains need the build plugin, or an explicit input.** Without the plugin, only the array
  passed as `input` is traced, so `trace("name", () => order.items.filter(...))` records nothing.
  With the plugin (below), that form is rewritten to trace `order.items`. Chains the plugin cannot
  see, such as a receiver computed across several statements, still need the explicit form.
  The library never changes `Array.prototype`.
- **Async callbacks need `traceAsync`.** `trace` rejects a promise-returning callback with an
  `BackstepError`. Inside `traceAsync`, the array callbacks (`filter`, `map`, …) must stay
  synchronous, as native array methods are.
- **Heuristics, not proof.** The analysis flags patterns that are usually bugs. A flagged step can
  be intentional, and a real bug can go unflagged. Treat the report as a pointer to investigate.
- **Identity is by position.** Elements are tracked by their position in the root input, not by
  object identity. An element written directly into the traced array (`xs[0] = …`) loses its origin
  and is shown as `#?`.
- **Samples are shallow copies.** Samples keep one level of arrays and plain objects, so mutations
  to deeper structure after the step can show up in the report.
- **Redaction is name-based.** Keys matching `redactKeys` are shown as `[redacted]`. A sensitive
  value stored under an unrecognised key is shown in full. Review reports before sharing them.

## Performance

Measured with `vitest bench` on a 100,000-element `filter → map → reduce` pipeline (noisy
machine-specific numbers; run `pnpm --filter @gabrielvfonseca/backstep bench` locally):

| Mode     | Relative to native      |
| -------- | ----------------------- |
| Disabled | about 1× (within noise) |
| Enabled  | about 2–3×              |

Samples are capped by `maxSamples`, and drop reasons are formatted only for sampled elements.
A report holds at most `maxSamples` values per step, never the full arrays.

## How it works

`trace` wraps the input array in a Proxy. Alongside the array, it keeps a parallel array of
origin indices. Each traced operation passes those indices along, so an element's identity
survives `filter`, `map`, `sort`, `slice` and `flatMap`. Callbacks are wrapped to record their
return values. After the callback returns, the rules in `analyze` run over the recorded steps,
and the first warning or error becomes `divergedAt`.

## Validation

The repository includes a corpus of ten realistic pipeline bugs (inverted predicates, renamed
fields, numeric strings, missing returns, boolean comparators, off-by-one pages, and so on). For
each one, the test checks that `backstep` points at the step that actually caused the problem.
All ten pass. The corpus is written by the author, so it measures whether the rules catch the
bugs they were designed for. It is not a controlled study of whether developers find bugs faster
with `backstep` than with `console.log`. That study remains open.

## License

MIT

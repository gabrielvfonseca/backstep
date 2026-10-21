# API reference

All exports come from `@gabrielvfonseca/backstep`.

## `trace(name, input, fn, options?)`

Runs `fn` with a traced view of `input` and returns exactly what `fn` returns.

- `name`: a label for the report, such as `"order.total"`.
- `input`: the value to trace. Arrays are traced. Other values are passed through with no steps.
- `fn(traced)`: the callback. Use `traced` in place of `input`.
- `options`: see [TraceOptions](#traceoptions).

A report is printed only when a warning or error is found, or when `always` is set. Output goes
to `console.warn` by default, and to `onReport` when configured.

When tracing is disabled, `trace` calls `fn(input)` directly.

If `fn` throws, `trace` rethrows the same error with the partial report attached. Read it with
`getReport(error)`.

If `fn` returns a promise, `trace` throws an `BackstepError` that points to `traceAsync`.

## `traceAsync(name, input, fn, options?)`

The same as `trace`, for callbacks that `await`. The array operations inside still run
synchronously. Only the callback itself is awaited.

```ts
const total = await traceAsync("cart.total", cart.items, async (items) => {
  const rate = await fetchRate(cart.currency);
  return items.map((item) => item.price * rate).reduce((a, b) => a + b, 0);
});
```

## `traceReport(name, input, fn, options?)`

Always records and returns `{ value, report }`, whatever the configuration. Use it in tests and
tooling. If `fn` throws, the report is still attached to the error.

## `TraceOptions`

| Option | Type | Meaning |
| --- | --- | --- |
| `expect` | `(result) => boolean` | A predicate the result must satisfy. A failing predicate is reported as an error at the last step. |
| `expectMessage` | `string` | Describes the expectation in the report, for example `"total is positive"`. |
| `always` | `boolean` | Emit a report even when nothing diverged. |

## `TraceReport`

| Member | Meaning |
| --- | --- |
| `name` | The label passed to `trace`. |
| `result` | The traced result, or `undefined` if the callback threw. |
| `error` | `{ name, message }` when the callback threw, otherwise `undefined`. |
| `input` | `{ count, sample, value }` describing the input. |
| `steps` | The recorded operations, in order. |
| `findings` | `{ severity, step, code, message }` for each finding. |
| `divergedAt` | 0-based index into `steps` of the first warning or error, or `undefined`. |
| `hasProblem` | `true` when at least one warning or error was found. |
| `durationMs` | Total time for the traced run. |
| `toString({ color? })` | The printable tree. |
| `toJSON()` | Plain data for logs and tooling. Values are display strings. |

Each `Step` has `index`, `kind`, `label`, `inputCount`, `outputCount`, `inputSample`,
`outputSample`, `dropped`, `droppedCount`, `result`, `error`, `facts`, and `durationMs`.

## `getReport(error)`

Returns the `TraceReport` attached to an error thrown from a traced run, or `undefined`.

## `configure(options)`, `enable()`, `disable()`, `resetConfig()`

See [Configuration](CONFIGURATION.md). `configure` merges the given options into the current
configuration and validates them. Invalid values throw `BackstepError`.

## `BackstepError`

Thrown for misuse of the library: an invalid configuration, or a promise returned from `trace`.

## Types

`Step`, `StepFacts`, `StepError`, `Drop`, `Finding`, `FindingCode`, `OpKind`, `Severity`,
`BackstepConfig`, `ConfigOptions`, `TraceOptions`, `TracedResult`, `ReportData`, `ReportInput`,
`RenderOptions`. All are exported from the package root.

## Subpath exports

| Import | Purpose |
| --- | --- |
| `@gabrielvfonseca/backstep/esbuild` | esbuild plugin that rewrites inline chains. See [Build plugin](BUILD_PLUGIN.md). |
| `@gabrielvfonseca/backstep/transform` | `transformSource(code, filename)` for other bundlers. |

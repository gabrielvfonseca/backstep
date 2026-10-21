# Validation

## What is tested

- **Unit tests** (`packages/explain/tests`): 142 tests cover the proxy, each recorded operation,
  each finding, report rendering, configuration, redaction, async tracing, and the build
  transform.
- **Property tests**: random pipelines produce the same result traced and untraced, and every
  dropped element has a valid origin.
- **End-to-end**: an esbuild bundle of an app with an inline chain is built with the plugin, run,
  and the printed report is checked.
- **Coverage**: 98% of lines and 92% of branches, with thresholds enforced by Vitest.

## The bug corpus

`packages/corpus` holds 14 realistic pipeline bugs. Each case states the step and the finding that
should identify the cause. A case passes only when the report diverges at that step with that
finding. The corpus covers collapsed filters, renamed fields, numeric strings, missing returns,
boolean comparators, empty `every`, default numeric sorts, and NaN from missing fields.

## What this does not show

The corpus was written by the author, so it shows that the rules catch the bugs they were designed
for. It does not show that developers find bugs faster with the library than with `console.log`,
or that the findings are useful on code the author has not seen. Measuring that needs people
using the library on their own bugs. This is the main open question for the project.

## How to contribute a case

Add an object to `cases` in `packages/corpus/src/cases.ts` with an `id`, a `title`, a `run`
function that returns the report, and the expected step and finding. Run `pnpm test`. A new case
that the rules cannot yet diagnose is a useful report: it describes a rule that does not exist yet.

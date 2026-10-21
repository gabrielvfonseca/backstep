# Findings

A finding is a rule that matched a recorded step or the final result. Each has a severity:

- **error**: the value is almost certainly wrong.
- **warning**: the value is probably wrong.
- **info**: noteworthy, but not a problem by itself. Info findings never mark a divergence.

The first step with an error or warning is `divergedAt`, and the report points there.

| Code | Severity | Triggered when | Typical cause |
| --- | --- | --- | --- |
| `collapsed` | error | A `filter`, `flatMap` or `slice` removes every element of a non-empty input. | A predicate that is inverted, reads a renamed field, or compares case-sensitively. |
| `non-finite` | error | A `map` or `reduce` produces `undefined`, `null` or `NaN` from values that were usable. | A callback with a missing `return`, or a missing field used in arithmetic. |
| `threw` | error | A callback or native method threw. | A `reduce` on an empty array with no initial value, or any exception in a callback. |
| `expectation-failed` | error | The `expect` predicate returned `false`, or threw. | A total that should be positive but is 0. |
| `dropped-majority` | warning | A filter keeps less than 10% of a multi-element input. | A filter that is far stricter than intended. |
| `identical-outputs` | warning | A `map` returns the same value for several distinct inputs. | Reading the same index or field for every element. |
| `returned-initial` | warning | A `reduce` had no elements and returned its initial value. | The collection was empty, usually after an earlier filter. |
| `non-numeric-comparator` | warning | A sort comparator returns a boolean. | `(a, b) => a > b` instead of `a - b`. |
| `numeric-string-concat` | warning | A `reduce` joins numeric-looking strings into one string. | Values from an API or form that were never converted with `Number()`. |
| `vacuous-every` | warning | `every()` runs over an empty array and returns `true`. | A check that passes when there is nothing to check. |
| `default-numeric-sort` | warning | `sort()` or `toSorted()` without a comparator sorts only numbers. | Numbers are compared as text, so `10` sorts before `9`. |
| `no-match` | info | A `find` family method matched nothing. | Often intentional, so it is informational only. |

## Reading a report

Each step line shows the input count, then the output count, or the single result for `reduce`,
`find`, `some` and `every`. The sample lines show dropped elements by their input position. Each
finding follows the step it belongs to.

## Adding a rule

Rules live in `packages/backstep/src/analyze.ts`. A rule reads the recorded step and its
`facts`. It does not re-scan the data. See the
[rule-authoring skill](../skills/backstep-rule-authoring/SKILL.md) for the steps.

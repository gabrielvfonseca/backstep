# Configuration

`configure` merges options into the global configuration. Read the current values with
`configure()` called without arguments.

```ts
import { configure } from "backstep";

configure({
  always: false,
  maxSamples: 5,
  maxDepth: 3,
  maxItems: 6,
  maxStringLength: 80,
  redactKeys: /pass(word)?|secret|token|api[-_]?key/i,
  onReport: (report) => logger.debug(report.toString()),
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | from environment | Turns tracing on or off. |
| `always` | `false` | Emit a report for every trace, not only when a problem is found. |
| `maxSamples` | `5` | Elements kept per step for display. Range 0 to 1000. |
| `maxDepth` | `3` | How deeply nested values are rendered. Range 0 to 20. |
| `maxItems` | `6` | Array items or object keys rendered before `…+N`. Range 0 to 1000. |
| `maxStringLength` | `80` | Characters of a string rendered before truncation. Range 0 to 10000. |
| `redactKeys` | built-in pattern | Keys matching this pattern are shown as `"[redacted]"`. |
| `onReport` | prints to console | Receives each report that needs attention. `null` disables output. |

## When tracing is enabled

The default is decided once, when the module loads:

1. If `BACKSTEP` is `1`, `true`, `yes` or `on`, tracing is on.
2. If `BACKSTEP` is `0`, `false`, `no` or `off`, tracing is off.
3. Otherwise, tracing is on when `NODE_ENV` is `development` or `test`.
4. Without a `process` object (browsers), tracing is off until you call `enable()`.

`enable()` and `disable()` change the setting at runtime. `resetConfig()` restores the defaults.

## Redaction

`redactKeys` applies to every rendering: samples, drop reasons, step labels and findings. It is a
name match only. A sensitive value under a key the pattern doesn't match is shown in full. Review
reports before sharing them, and add your own field names to `redactKeys`.

The `g` and `y` flags are removed from the pattern, so matching does not depend on state.

## Output

By default, a report with a problem goes to `console.warn`, and a healthy report with `always` goes
to `console.log`. Colour is used only when stdout is a terminal and `NO_COLOR` is not set.

A faulty `onReport` cannot break the program being traced. Its error is logged with
`console.error`.

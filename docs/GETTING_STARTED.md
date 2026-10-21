# Getting started

`@gabrielvfonseca/value-lineage` shows how a value reached an unexpected state. You wrap an array
pipeline in `trace`. When the result looks wrong, the library prints which step caused it and
which elements it removed.

## Install

The package is published to GitHub Packages. Point the scope at that registry in your project's
`.npmrc`:

```ini
@gabrielvfonseca:registry=https://npm.pkg.github.com
```

Authenticate in your user-level `~/.npmrc` (not the project file), with a token that has
`read:packages`:

```ini
//npm.pkg.github.com/:_authToken=<your token>
```

```sh
npm install @gabrielvfonseca/value-lineage
```

Requirements: Node 20 or newer. The runtime `trace` has no dependencies and works in browsers. The
build plugin needs `esbuild` and `@babel/parser`, which are optional peer dependencies.

## First trace

```ts
import { trace } from "@gabrielvfonseca/value-lineage";

const total = trace("order.total", order.items, (items) =>
  items.filter(isAvailable).map(getPrice).reduce((a, b) => a + b, 0),
);
```

Pass the array you want traced as the second argument, and use the parameter your callback
receives in place of the original array. The return value is the same as without `trace`.

When the result looks wrong, you see a report like this:

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

Each dropped element is identified by its position in the original input (`#0`, `#1`, …).

## When tracing is on

| Environment | Tracing |
| --- | --- |
| `NODE_ENV=development` or `test` | On |
| `NODE_ENV` unset or `production` | Off |
| `EXPLAIN=1` or `EXPLAIN=0` | Overrides the above |
| Browser (no `process`) | Off until you call `enable()` |

When tracing is off, `trace(name, input, fn)` is exactly `fn(input)`, so it is safe to leave in
production code.

## Next steps

- [API reference](API_REFERENCE.md): every export and option.
- [Inline chains and the build plugin](BUILD_PLUGIN.md): trace `() => order.items.filter(...)`
  directly.
- [Findings](FINDINGS.md): what each warning means and how to fix it.
- [Limitations](LIMITATIONS.md): what the library cannot see.

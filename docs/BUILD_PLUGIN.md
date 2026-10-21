# Inline chains and the build plugin

`trace` can only trace the array it is given. If you write the chain inside the callback, the
runtime sees no input to track:

```ts
const total = trace("order.total", () => order.items.filter(isAvailable).map(getPrice));
```

The build plugin rewrites that form at build time into the explicit form that is traced:

```ts
const total = trace("order.total", order.items, (__explain_input) =>
  __explain_input.filter(isAvailable).map(getPrice),
);
```

## Using the esbuild plugin

```ts
import { build } from "esbuild";
import { valueLineage } from "@gabrielvfonseca/value-lineage/esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  plugins: [valueLineage()],
});
```

tsup uses esbuild, so the same plugin works there through its `esbuildPlugins` option.

Install the optional peer dependencies:

```sh
npm install --save-dev esbuild @babel/parser
```

## Using the transform directly

For other bundlers, call `transformSource` from a plugin hook:

```ts
import { transformSource } from "@gabrielvfonseca/value-lineage/transform";

const { code, changed } = transformSource(source, "path/to/file.ts");
```

`transformSource` returns the original code unchanged when nothing needed rewriting.

## What gets rewritten

- Only calls to `trace` imported from `@gabrielvfonseca/value-lineage`, or through a namespace import.
- Only callbacks that take no arguments and return a chain of array methods over one receiver.
  Supported methods: `filter`, `map`, `flatMap`, `reduce`, `reduceRight`, `find`, `findIndex`,
  `findLast`, `findLastIndex`, `some`, `every`, `sort`, `toSorted`, `slice`.
- Async callbacks, callbacks with parameters, and calls whose chain starts with another method are
  left unchanged.
- Files under `node_modules` are skipped.
- Source is parsed as TypeScript (`.ts`, `.mts`, `.cts`), TSX (`.tsx`), or JavaScript with JSX
  (everything else).

## Limits

- The receiver must be a single expression. A receiver built across several statements is not
  rewritten.
- If the rewritten source would collide with an existing `__explain_input` name, the file is left
  unchanged.
- Only the outermost `trace` call is rewritten. A `trace` nested inside a rewritten callback is
  left as written.

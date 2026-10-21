# value-lineage

A debugging library that records how values flow through array pipelines and explains where an
unexpected result came from. The published package is documented in
[`packages/explain/README.md`](packages/explain/README.md).

## Monorepo

| Path                | What it is                                                           |
| ------------------- | -------------------------------------------------------------------- |
| `packages/explain`  | The library, published to npm as `explain`                           |
| `packages/corpus`   | Ten realistic pipeline bugs that the library must diagnose (private) |
| `apps/playground`   | Runnable examples (private)                                          |
| `packages/tsconfig` | Shared TypeScript configuration (private)                            |

Built with pnpm workspaces and Turborepo, with Biome, Vitest, tsup, Changesets, publint and
@arethetypeswrong/cli.

## Commands

```sh
pnpm install
pnpm build          # tsup: ESM, CJS and declarations
pnpm typecheck
pnpm lint           # biome check
pnpm test           # vitest with coverage thresholds
pnpm check:package  # publint + attw
pnpm bench          # overhead benchmark
pnpm --filter @explain/playground start
pnpm changeset      # describe a user-visible change before merging
```

CI runs lint, typecheck, build, test and package checks on Node 20, 22 and 24. Releases are
versioned with Changesets and published with npm provenance.

# backstep

**How did this value get into this state?**

`@gabrielvfonseca/backstep` records how elements flow through an array pipeline. When the
result looks wrong, it reports the step that caused it and the elements that step removed.

```ts
import { trace } from "@gabrielvfonseca/backstep";

const total = trace("order.total", order.items, (items) =>
  items.filter(isAvailable).map(getPrice).reduce((a, b) => a + b, 0),
);
```

Documentation starts at [docs/INDEX.md](docs/INDEX.md). The package README is at
[packages/backstep/README.md](packages/backstep/README.md).

## Status

- Version 0.1.0 is published to GitHub Packages as `@gabrielvfonseca/backstep`.
- It has not yet been validated with real users. The bug corpus is written by the author. See
  [docs/VALIDATION.md](docs/VALIDATION.md).

## Repository layout

| Path                 | What it is                                                     |
| -------------------- | -------------------------------------------------------------- |
| `packages/backstep`   | The library (`@gabrielvfonseca/backstep`)                 |
| `packages/corpus`    | 14 realistic pipeline bugs the library must diagnose (private) |
| `packages/tsconfig`  | Shared TypeScript configuration (private)                      |
| `apps/playground`    | Runnable examples (private)                                    |
| `docs/`              | Documentation                                                  |
| `skills/`            | Agent skills for using and extending the library               |

## Commands

```sh
pnpm install
pnpm lint           # biome check (Ultracite preset)
pnpm fix            # biome fixes, via ultracite
pnpm typecheck
pnpm build          # tsup: ESM, CJS, declarations
pnpm test           # vitest with coverage thresholds, plus the corpus
pnpm check:package  # publint and attw
pnpm bench          # overhead benchmark
pnpm check:all      # all of the above, in order
pnpm changeset      # describe a user-visible change before merging
```

## Tooling

- **Biome with Ultracite**: `biome.json` extends `ultracite/biome/core`. Tests have a small override
  for rules that don't fit test code.
- **Lefthook**: runs Biome on staged files and typechecks before each commit. Installed by the
  `prepare` script.
- **Turborepo**: runs build, typecheck and test across packages with caching.
- **Changesets**: versioning and changelogs.
- **Vitest**: unit, property and end-to-end tests.
- **tsup**: builds ESM, CJS and declaration files.
- **publint and attw**: check the package's exports and types.
- **Dependabot**: weekly updates for npm and GitHub Actions.

## Continuous integration

CI runs lint, typecheck, build, test and package checks on Node 20, 22 and 24. The release
workflow versions with Changesets. Publishing to GitHub Packages is described in
[docs/RELEASING.md](docs/RELEASING.md).

## License

MIT. See [LICENSE.md](LICENSE.md).

# Contributing

## Setup

```sh
pnpm install
pnpm build
pnpm test
```

Node 20 or newer and pnpm 9 are required.

## Layout

- `packages/explain`: the library. Source in `src/`, tests in `tests/`, benchmarks in `bench/`.
- `packages/corpus`: 14 realistic bugs that the library must diagnose. A change to a heuristic is only
  done when the corpus still passes, and a new heuristic should come with a corpus case.
- `apps/playground`: runnable examples (`pnpm --filter @explain/playground start`).

## Changes

Every user-visible change needs a changeset: `pnpm changeset`.

Before opening a pull request, run `pnpm check:all`. Lefthook runs the Biome check and typecheck on
staged files before each commit, so most problems are caught there.

To add a finding, follow the [rule-authoring skill](skills/value-lineage-rule-authoring/SKILL.md).
Documentation lives in `docs/`, and the documentation index is at [docs/INDEX.md](docs/INDEX.md).

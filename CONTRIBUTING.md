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
- `packages/corpus`: realistic bugs that the library must diagnose. A change to a heuristic is only
  done when the corpus still passes, and a new heuristic should come with a corpus case.
- `apps/playground`: runnable examples (`pnpm --filter @explain/playground start`).

## Changes

Every user-visible change needs a changeset: `pnpm changeset`.

Before opening a pull request, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm check:package`.

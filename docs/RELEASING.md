# Releasing

The package is published to npm as `backstep`.

## Before a release

1. Make sure the working tree is clean and `main` is up to date.
2. Run the full check:

   ```sh
   pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm check:package
   ```

3. Describe the change with a changeset:

   ```sh
   pnpm changeset
   ```

## Publishing

1. Bump the version and update the changelog:

   ```sh
   pnpm changeset version
   ```

2. Commit the result and push to `main`.
3. Log in to npm once, as the account that owns the package:

   ```sh
   npm login
   ```

4. Publish from the package directory:

   ```sh
   cd packages/backstep
   npm publish
   ```

   `publishConfig` in `package.json` sets public access and provenance.

5. Confirm the published version:

   ```sh
   npm view backstep version
   ```

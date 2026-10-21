# Releasing

The package is published to GitHub Packages as `@gabrielvfonseca/backstep`. GitHub Packages
requires the scope to match the owning account.

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
3. Publish from the package directory. Pass the token through an environment variable, so it is
   never written to disk:

   ```sh
   cd packages/backstep
   TOKEN="$(gh auth token)"
   env "npm_config_//npm.pkg.github.com/:_authToken=$TOKEN" \
     npm publish --registry https://npm.pkg.github.com --access restricted
   unset TOKEN
   ```

4. Confirm the published version:

   ```sh
   npm view @gabrielvfonseca/backstep version --registry https://npm.pkg.github.com
   ```

The token needs the `write:packages` scope. Consumers need `read:packages` on the repository.

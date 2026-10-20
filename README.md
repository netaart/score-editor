# score-editor

A browser score editor for song projects, shared by its host apps. Work in progress: the first piece is an eight-bar piano-roll spike.

Two packages, versioned and published together:

| Package | What it is |
| --- | --- |
| [`@neta-art/score-editor`](packages/score-editor) | The editor core: `mount(el, options)` returns `{ update(options), destroy() }`. |
| [`@neta-art/score-dialect-song2`](packages/score-dialect-song2) | The `song2` score dialect: identity and declarative constraints. Depends on the core for types only. |

More: [PRODUCT.md](PRODUCT.md) (who it is for and what it must do), [DESIGN.md](DESIGN.md) (the theme variable contract and the look of the neutral defaults), [docs/spike.md](docs/spike.md) (what the spike decided about rendering, events, style isolation and popovers, with what was and was not verified).

## Develop

Needs Node (developed on 24) and pnpm (the version is pinned in `package.json`; Corepack picks it up).

```sh
pnpm install
pnpm check   # build, lint, type check, unit tests, browser tests
```

The browser tests drive real Chromium through Playwright. Install the browser once with `pnpm exec playwright install chromium`. Details and the individual commands are in [AGENTS.md](AGENTS.md).

## Publish

Both packages always carry the same version and are published together, from a maintainer's own machine. The access token is read from the environment (`NPM_ACCESS_TOKEN`) and is never stored in the repository or in CI. Do not publish from CI with provenance: a consumer that installs with pnpm's `trustPolicy: no-downgrade` refuses a version that has less provenance than an earlier one, so once a version of either package is published without it, no later one may carry it.

1. `pnpm check` passes on the commit to release.
2. Set the same `version` in both `packages/*/package.json`, and commit it.
3. `pnpm build`, then look at what each tarball will hold: `pnpm publish --dry-run --no-git-checks` inside each package.
4. Publish the core first, then the dialect: `pnpm publish --no-git-checks` inside `packages/score-editor`, then inside `packages/score-dialect-song2`, with `NPM_ACCESS_TOKEN` supplied to npm through a user config file kept outside the repository (`//registry.npmjs.org/:_authToken=${NPM_ACCESS_TOKEN}`, selected with `npm_config_userconfig`). pnpm rewrites the dialect's `workspace:` dependency on the core to the released version.
5. Tag the commit `v<version>` and push the tag.

Step 3 and the rewrite of the `workspace:` dependency have been checked with a dry run and `pnpm pack`; no step that writes to the registry has been run yet.

## License

MIT

# pnpm and esbuild example

A small pnpm project that bundles the two packages with [esbuild](https://esbuild.github.io/). It has no framework
and no runtime dependency beyond the two packages.

```sh
pnpm install
pnpm build     # writes dist/main.js
pnpm preview   # serves this folder on http://127.0.0.1:8080/
```

`pnpm-workspace.yaml` approves esbuild's install script. Without it, pnpm 11 and later stop `pnpm install` with
`ERR_PNPM_IGNORED_BUILDS`; keep it when you copy the project.

`src/main.js` mounts several view parts on one editing session, registers a custom tool and runs it, then reads the
score through the `song2` dialect and writes one command back with `applyScoreCommand`.

The versions in `package.json` are exact. Keep them equal to each other and to the version of the skill you are
reading.

To point the bundle at a local checkout instead of npm, set `SCORE_EDITOR_LOCAL` to the repository root before
`pnpm build`; `esbuild.config.mjs` then aliases both package names to that checkout's `packages/*/dist/index.js`.

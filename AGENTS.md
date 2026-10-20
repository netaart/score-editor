# Agent instructions

A public repository: a pnpm workspace with two browser packages (`packages/score-editor`, `packages/score-dialect-song2`). Read [PRODUCT.md](PRODUCT.md) for what the editor is for, [DESIGN.md](DESIGN.md) for the styling contract, and [docs/spike.md](docs/spike.md) for the decisions the first spike settled (rendering, events, style isolation, popovers). Do not repeat them here or in code comments; link to them.

## Check commands

Run from the repository root. `pnpm check` runs all of them in order and must pass before a commit is called done.

| Command | What it does |
| --- | --- |
| `pnpm build` | Builds both packages with tsdown into `packages/*/dist`. The browser tests and the measurement script load these files, so build first. |
| `pnpm lint` | Biome check (lint and format). `pnpm lint:fix` applies fixes. |
| `pnpm typecheck` | `tsc --noEmit` per package, then over tests, scripts and configs. |
| `pnpm test` | Vitest, node environment: imports both package entries where there is no DOM (an import that touches one throws), and checks that `mount` without a DOM fails with a clear error. |
| `pnpm test:e2e` | Playwright on real Chromium (desktop and Pixel 7 phone profiles) against the test page in `e2e/page`. |
| `pnpm check` | `build`, `lint`, `typecheck`, `test`, `test:e2e`. |

Playwright needs its Chromium once: `pnpm exec playwright install chromium`. `PLAYWRIGHT_BROWSERS_PATH` chooses where browsers live; `PLAYWRIGHT_DOWNLOAD_HOST` points the download at a mirror. The test server listens on `E2E_PORT` (default 4310).

## Where tests go

Three seams, and no others:

- Importing each package entry in a node environment (`tests/entries.test.ts`).
- The dialect's `parse` and `serialize`, the registry and `formatDiagnostic`, through the package entries (`tests/song2-*.test.ts`).
- The mounted editor in real Chromium, driven only through `window.harness` on the test page (`e2e/page/harness.js`) and through what a user can see and do (`e2e/mount.spec.ts`). Host callbacks on the page are fakes that record what they receive. Prefer locators by role, name and text over class names.

New behaviour gets a failing test at one of these seams first. After a change that makes a test pass, break the change on purpose once and see the test fail.

Measurement is evidence, not a test: `node scripts/measure-scale.mjs [--bars=128 --notes=1500 --throttle=4 --headed --runs=5]` (after `pnpm build`) mounts a synthetic score and prints first-render time, frame times and long tasks during a drag and scrolling as JSON. Rerun it when a note's DOM or CSS changes and compare with the table in `docs/spike.md`.

To look at the page by hand: `node e2e/serve.mjs`, then open `/?demo` (add `&lang=zh`, `&readonly`, `&big`).

## Conventions

- Browser packages: no Node types, no `bin`, no runtime dependencies. Entries have no side effects at import.
- Every new source file starts with two `// ABOUTME:` lines saying what the file is and what it is for. Comments elsewhere only when they record a durable reason.
- Every class is prefixed `sce-`; every public variable is `--sce-*`. A new colour comes from the variable contract in `DESIGN.md` or a derivation of it. Keep per-node CSS cheap (see the spike note).
- Everything the editor adds (listeners, nodes, stylesheets) is registered so `destroy()` removes it.
- Dependency versions are pinned exactly. Commits are small and named by type: `feat`, `test`, `chore`, `docs`.
- UI work goes through the design tooling's review steps (critique, audit, polish) and is checked in the rendered result at desktop and phone widths.

## This is a public repository

No internal company, team, service or person names in code, comments, tests, docs or commit messages. The only model name allowed is `song2`. Host apps are described by their framework ("a Next app", "a SvelteKit app"). No upstream score-dialect code and no upstream sample scores: samples are hand-written or traced to our own generations. Scan what a branch adds for internal names before pushing.

## Publishing

Both packages share one version and are published together from a maintainer's machine, never from CI with provenance. The steps are in the [README](README.md#publish). An agent does not publish.

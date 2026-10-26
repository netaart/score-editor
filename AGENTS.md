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
| `pnpm test:e2e` | Playwright on real Chromium (desktop and Pixel 7 phone profiles) against the test page in `e2e/page`, including both runnable examples from the editor skill. |
| `pnpm check:skill` | Fails when a public export is not named in the editor skill, when the skill name or SKILL.md length is wrong, or when an example pin drifts from the package version. |
| `pnpm check` | `build`, `lint`, `typecheck`, `test`, `check:skill`, `test:e2e`. |

Playwright needs its Chromium once: `pnpm exec playwright install chromium`. `PLAYWRIGHT_BROWSERS_PATH` chooses where browsers live; `PLAYWRIGHT_DOWNLOAD_HOST` points the download at a mirror. The test server listens on `E2E_PORT` (default 4310).

## Where tests go

Three seams, and no others:

- Importing each package entry in a node environment (`tests/entries.test.ts`), the editing session driven through the entry with real commands (`tests/session.test.ts`), the bar choice and the meters a dialect allows (`tests/bars-meter.test.ts`), the inputs that select several notes and the delete that acts on all of them (`tests/multi-select.test.ts`), and custom tools driven through the entry (`tests/tools.test.ts`), the synth preview's schedule read with the real dialect (`tests/preview-schedule.test.ts`), the preview exports where there is no DOM and no Web Audio (`tests/preview-api.test.ts`), the lyric track's rules for rows, boundary drags, drops and splits (`tests/lyric-edit.test.ts`), and the notes `filterNotes` picks from hand-written scores with hand-written ids (`tests/filter-notes.test.ts`).
- The dialect's `parse` and `serialize`, the registry and `formatDiagnostic`, and every score command applied with the song2 dialect, through the package entries (`tests/song2-*.test.ts`, with `tests/song2-multi-commands.test.ts` for the command that turns several notes into rests).
- The mounted editor, and view parts mounted on one editing session in a layout of the page's own, in real Chromium, driven only through `window.harness` on the test page (`e2e/page/harness.js`) and through what a user can see and do: `e2e/mount.spec.ts` for the mounted editor and `update`, `e2e/parts.spec.ts` for parts on one session and their lifetime, `e2e/editing.spec.ts` for editing in the parts (select, delete, undo, the Grid menu, the insertion point, the toolbar, what is said to a screen reader), `e2e/chord-edit.spec.ts` for chord editing (place, change and remove by pointer, touch and keyboard; the vocabulary, the fit and the host layer; read-only), `e2e/views.spec.ts` for the staff view, the text view, the stale notice, the view switch and the three views of the default editor, `e2e/skill.spec.ts` for the shipped skill examples, `e2e/synth-preview.spec.ts` for the synth preview (the control, the playhead, where it starts, read-only, requests; real Web Audio runs in the browser and a spy on its constructor records what was sounded; the file runs without traces, because a trace gives the page the user activation that the refused-sound case must not have), `e2e/multi-select.spec.ts` for selecting several notes (Shift, the box, the touch hold, select all, invert, Escape, the Select menu, the keys of a subset, read-only; each case runs with a mouse on the desktop project and with a finger on the phone project), `e2e/bars-meter.spec.ts` for choosing bars and inserting or deleting them, the section meter control, the two cut-tail repairs, the refusals and read-only (each case runs with a mouse on the desktop project and with a finger on the phone project), `e2e/section-menu.spec.ts` for a section band's menu (open by mouse, touch, keyboard and right click; each choice and its undo; naming a section at a bar; the unnamed music, the ends and read-only; each case runs with a mouse on the desktop project and with a finger on the phone project), `e2e/filter-select.spec.ts` for selecting by filter (the Filter button and its panel, each condition, combining them, invert, re-apply, closing and reopening, read-only, the views it is offered in, the language, keys, where the panel sits and how large its controls are; mouse on the desktop project, finger on the phone project), `e2e/lyric-track.spec.ts` for the lyric track (the phrases, the equal and differing counts, the syllables on notes, the unaligned area, choosing and editing a line's text, splitting, merging, deleting and adding, dragging an edge or a line, placing by bar number, the keyboard, the two state hues, the default editor and the part's lifetime; each case runs with a mouse on the desktop project and with a finger on the phone project), `e2e/drafts.spec.ts` for drafts in the mounted editor (opening, restore, conflict, update) on a fake store that records every call, `e2e/chrome.spec.ts` for the chrome floor, the pin rule and the music staying reachable in every chrome state (desktop and phone), `e2e/tempo-key-panel.spec.ts` for the toolbar's tempo, key and transpose controls and the song project panel (desktop and phone), and `e2e/move-resize.spec.ts` for moving and resizing the selected notes with the keys, a drag and a touch slide, the edge grips and the refusal of a drop. A case lives in one of them, and a helper two of them use lives in `e2e/fixtures.ts`. The page is the bare host: it builds the dialect registry and fetches the test scores itself. Prefer locators by role, name and text over class names.

New behaviour gets a failing test at one of these seams first. After a change that makes a test pass, break the change on purpose once and see the test fail.

Measurement is evidence, not a test: `node scripts/measure-scale.mjs [--bars=128 --notes=1500 --throttle=4 --headed --runs=5 --select-all]` (after `pnpm build`) mounts a synthetic song2 project and prints first-render time (with the parse alone timed separately), and frame times and long tasks during zoom steps, wheel zoom and scrolling, as JSON; with `--select-all` every note is selected first (Ctrl+A, timed three times) and the gestures run with them all selected. Rerun it when the view's DOM or CSS changes and compare with the table in `docs/spike.md`.

To look at the page by hand: `node e2e/serve.mjs`, then open `/?demo` (add `&lang=zh`, `&readonly`, `&big`, `&sample=<name>` for a file under `packages/score-dialect-song2/tests/samples`, or `&vector=<id>` for a vector in `vectors.json`).

## Conventions

- Browser packages: no Node types, no `bin`. The one runtime dependency is `abcjs`, in `@neta-art/score-editor`, loaded with `import()` when the staff view is mounted. Entries have no side effects at import and load no abcjs (`tests/entries.test.ts` checks both).
- Every new source file starts with two `// ABOUTME:` lines saying what the file is and what it is for. Comments elsewhere only when they record a durable reason.
- Every class is prefixed `sce-`; every public variable is `--sce-*`. A new colour comes from the variable contract in `DESIGN.md` or a derivation of it. Keep per-node CSS cheap (see the spike note).
- Everything the editor adds (listeners, nodes, stylesheets) is registered so `destroy()` removes it, and so does every view part's own `destroy()`.
- Later UI is built as view parts bound to the editing session: a part mounts on an element of the host's layout, takes the session (and, for the draft parts, the draft binding it is given), draws from what the session holds, re-renders from its notifications, and keeps the isolation `mount()` gives. It does not read another part or reach into the default editor. The default editor is one arrangement of such parts. See [the package README](packages/score-editor/README.md#the-editing-session-and-view-parts) and [DESIGN.md](DESIGN.md#view-parts).
- A change that adds a public export or a view part updates the editor skill in the same change ([packages/score-editor/skills/score-editor](packages/score-editor/skills/score-editor)).
- The skill and both examples pin the package version; a release bump changes the version and those pins in one commit, enforced by `pnpm check:skill`.
- Dependency versions are pinned exactly. Commits are small and named by type: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.
- UI work goes through the design tooling's review steps (critique, audit, polish) and is checked in the rendered result at desktop and phone widths.

## This is a public repository

No internal company, team, service or person names in code, comments, tests, docs or commit messages. The only model name allowed is `song2`. Host apps are described by their framework ("a Next app", "a SvelteKit app"). No upstream score-dialect code and no upstream sample scores: samples are hand-written or traced to our own generations. Scan what a branch adds for internal names before pushing.

## Publishing

Both packages share one version and are published together from a maintainer's machine, never from CI with provenance. The steps and the two release rules (7-day-old third-party dependencies, the internal-names check before every push) are in the [README](README.md#publish). An agent does not publish. When you add a file a package must ship, keep `pnpm check:pack` passing.

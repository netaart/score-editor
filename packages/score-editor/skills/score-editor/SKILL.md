---
name: score-editor
description: Build or customize a browser score editor for song projects with @neta-art/score-editor. Use when mounting the default editor, assembling view parts on a headless editing session, writing a custom tool, reading or writing a song2 score without a DOM, registering a score dialect, preserving edits as host-stored drafts, or theming the editor with CSS variables.
---

# Score editor

`@neta-art/score-editor` is a framework-free browser score editor for song projects. `@neta-art/score-dialect-song2` reads and writes the `song2` score format. This skill ships inside the core package, so it has the same version as the packages you installed.

Every layer is public and usable on its own. Pick the smallest one that serves the need; the default editor is only one arrangement of the parts.

## Choose a layer

| The need | The layer | Read |
| --- | --- | --- |
| Parse, validate, inspect or write score text on a server, in a worker, in a CLI or in a test; apply an edit without a UI | Headless layer | [references/headless-layer.md](references/headless-layer.md) |
| Hold the song project with undo, selection, insertion point and shared zoom/scroll; dispatch commands and notify a UI or a tool runner | Editing session | [references/editing-session.md](references/editing-session.md) |
| Put only some parts in a layout of your own, or write a view that draws from the session's state and notifications | View parts | [references/view-parts.md](references/view-parts.md) |
| Get a working editor in one call and choose only its language and project | `mount(el, options)` | [references/mount.md](references/mount.md) |
| Let a person hear the score as a synthetic preview with a playhead, or sound one note | View parts, and the headless schedule | [references/view-parts.md](references/view-parts.md#the-synth-preview) |
| Save edits as host-stored drafts, restore them on open, or inherit lyric lines into a regenerated song | Draft keeper | [references/drafts.md](references/drafts.md) |

## Choose an extension point

| The need | The extension point | Read |
| --- | --- | --- |
| Add a repeatable edit that a panel can preview and run as one undoable step | Custom tools | [references/custom-tools.md](references/custom-tools.md) |
| Read or write another score format, or a second model ID | Dialect registry | [references/dialect-registry.md](references/dialect-registry.md) |
| Match a host's colours, scheme, font, radius or density | CSS-variable theme | [references/theme.md](references/theme.md) |

The public names are listed in [references/api.md](references/api.md).

## Rules the package relies on

- Importing either package entry touches no DOM, so a server render may import it. `mount` and every view part's mount function need a browser and throw a clear error elsewhere.
- The host owns the page layout. A view part mounts on an element the host placed, binds to exactly one editing session, draws from that session, and removes all of its nodes, listeners and style sheet when destroyed.
- The song project is the only document. [The package README](../../README.md#the-editing-session-and-view-parts) is the contract for the session and what its history holds.
- The editor is styled by `--sce-*` variables and isolated by its own style sheet; classes are internal. Theme only through the variables in [references/theme.md](references/theme.md).
- Dialects are passed in explicitly through `createDialectRegistry`; there is no global registry and no runtime dependency between the packages.

## Runnable examples

Both examples mount several view parts in a layout of their own, register a custom tool and run it, and read and write a score through the headless layer, using a hand-written `song2` score.

- [assets/static-esm/](assets/static-esm/) is a static page. It imports the packages from esm.sh with `?bundle&target=es2022`, the way a browser page can without a build step. Serve the directory over HTTP; module scripts do not run from `file://`.
- [assets/pnpm-bundler/](assets/pnpm-bundler/) is a small pnpm project that bundles with esbuild. It pins exact versions. Run `pnpm install && pnpm build`, then serve the project directory and open it.

Both use the same public API. Copy the one that matches the environment you have; keep the version of the two packages equal to each other and to this skill.

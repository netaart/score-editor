---
name: score-editor
description: Build, customize or edit a browser score editor for song projects with @neta-art/score-editor. Use when a user asks to put a C chord on bar 5, delete the last two bars, set the tempo to 90, change the key, turn a note into a rest, edit the lyrics, or repair or write a song2 score; when mounting the default editor, assembling view parts on a headless editing session, writing a custom tool, reading or writing a song2 score without a DOM, registering a score dialect, preserving edits as host-stored drafts, or theming the editor with CSS variables.
---

# Score editor

`@neta-art/score-editor` is a framework-free browser score editor for song projects. `@neta-art/score-dialect-song2` reads and writes the `song2` score format. This skill ships inside the core package, so it has the same version as the packages you installed.

Every layer is public and usable on its own. Pick the smallest one that serves the need; the default editor is only one arrangement of the parts.

## Choose a layer

| The need | The layer | Read |
| --- | --- | --- |
| Parse, validate, inspect or write score text on a server, in a worker, in a CLI or in a test; apply an edit without a UI | Headless layer | [references/headless-layer.md](references/headless-layer.md) |
| Change one thing in a score someone handed you, then hand the project back | Headless layer, one command | [references/edit-a-score.md](references/edit-a-score.md) |
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

## Edit a score for a user

When the request is one change to a score someone handed you, read [references/edit-a-score.md](references/edit-a-score.md)
and follow its order:

1. Read the score with its dialect. If it does not read, report the diagnostics and stop; do not guess around them.
2. Find the note or bar in the parsed model and take its id from `noteId(voice, start)` (or the id the model already has).
   Never build an id from memory.
3. Send one `applyProjectCommand` (or `applyScoreCommand` when you only hold text).
4. Read the diagnostics. A notice (`isNoticeDiagnostic`) comes with the changed project; any other diagnostic is a
   refusal, the input project is returned unchanged, and you stop.
5. Write back the returned project, not a hand-written whole score. A command keeps every untouched bar's bytes.
6. Report what changed, the notices, and what was left alone.

If the task is to write or repair `.abc` itself, use the song2 writing page:
[`WRITING.md`](../../../score-dialect-song2/WRITING.md). It starts from the smallest correct score, names the rules agents
break most, and links to [RULES.md](../../../score-dialect-song2/RULES.md); finish by reading the text back with the dialect
and checking it before handing it over.

## Rules the package relies on

- Importing either package entry touches no DOM, so a server render may import it. `mount` and every view part's mount function need a browser and throw a clear error elsewhere.
- The host owns the page layout. A view part mounts on an element the host placed, binds to exactly one editing session, draws from that session, and removes all of its nodes, listeners and style sheet when destroyed.
- The song project is the only document. [The package README](../../README.md#the-editing-session-and-view-parts) is the contract for the session and what its history holds.
- The editor is styled by `--sce-*` variables and isolated by its own style sheet; classes are internal. Theme only through the variables in [references/theme.md](references/theme.md).
- `abcjs` is the package's one runtime dependency, for the staff view. It is loaded with `import()` when `mountStaffView` runs (the default editor does that the first time the staff is shown), never on import, so a host that does not mount the staff view loads none of it. See [references/view-parts.md](references/view-parts.md#the-text-view-the-staff-view-and-the-view-switch).
- Dialects are passed in explicitly through `createDialectRegistry`; there is no global registry and no runtime dependency between the packages.
- Make exactly the change the user asked for. A command rewrites only the bars it touches and refuses rather than half-applies; do not replace a whole score to change one note. If you must write text, keep every other bar note for note (same pitches, onsets and durations) and keep the lyric syllable count when a melody changes.
- Look identifiers and versions up. `modelId` must equal a registered dialect's `id`; note ids come from `noteId(voice, start)` or the parsed model; tool ids and parameter names come from the registry; command names and refusal codes come from [the package README](../../README.md#commands). The skill ships at the installed package version, so check that version before copying code from an example.
- Before you return a score: it parses with no error diagnostics, it has no non-notice diagnostic, the dialect's `check` returns `[]`, every untouched bar and line is byte for byte the same, and the report names the change and any notices. If a check fails, return the diagnostics and the unchanged project.

## What this package does not do

It edits and reads score text. It does not generate music, call a model or a network API, store drafts by itself, talk to a host's chat, send a handoff, manage files or permissions, export MIDI or PDF, or play a real instrument. The draft keeper is the headless half and the host supplies the store; saving, conflicts, handoff and permissions belong to the host. The synth preview is a browser preview, not a render of the final song. If a request needs one of those, name the layer that owns it instead of looking for it here.

## Recipes, smallest first

1. **Read or edit one score with no DOM.** Read it with the dialect, find the id, send one command, read the diagnostics and write back the returned project. See [references/edit-a-score.md](references/edit-a-score.md).
2. **Mount the default editor.** One call gives the toolbar, arrangement, staff, text view and synth preview: `mount(el, { project, dialects, language })`. See [references/mount.md](references/mount.md).
3. **Assemble a layout of your own.** Mount only the parts you need on one editing session; each part follows the session and its own `destroy()` removes it. See [references/view-parts.md](references/view-parts.md).
4. **Add a repeatable edit.** Declare a `ScoreTool`, register it, preview its commands and run them as one undo step. See [references/custom-tools.md](references/custom-tools.md).
5. **Add a dialect or a theme.** Register a second `ScoreDialect`, or map the host's colours onto the `--sce-*` variables. See [references/dialect-registry.md](references/dialect-registry.md) and [references/theme.md](references/theme.md).

If none of these fits, start at [references/api.md](references/api.md).

## Runnable examples

- [assets/static-esm/](assets/static-esm/) is a static page. It imports the packages from esm.sh with `?bundle&target=es2022`, mounts several view parts in a layout of its own, registers a custom tool and runs it, and reads and writes a score through the headless layer. Serve the directory over HTTP; module scripts do not run from `file://`.
- [assets/pnpm-bundler/](assets/pnpm-bundler/) is the same shape as a small pnpm project that bundles with esbuild. It pins exact versions. Run `pnpm install && pnpm build`, then serve the project directory and open it.
- [assets/edit-one-bar/](assets/edit-one-bar/README.md) is the editor task example: it reads a real-sized `song2` score, finds one note id, sends one `setChord` through the headless layer, reads a notice, writes back the returned project, and shows that only the line holding the edited bar changed. The seam 1 test runs the same helper, and the browser test checks the byte-for-byte result.

The first two use the same public API and mount parts; the third uses only the headless layer. Copy the one that matches the environment and the task you have; keep the version of the two packages equal to each other and to this skill.

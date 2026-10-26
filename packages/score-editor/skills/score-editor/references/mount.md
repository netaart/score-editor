# mount: the default editor

Use `mount` when the host wants a working editor without choosing parts: a toolbar that ends with a switch among three
views, one shared time scroller with the ruler, chord track and one track per voice (the arrangement), the staff view,
the text view, the stale notice, the cut notice and the problem view, all on one editing session. The arrangement is
shown first; the staff view is mounted, and abcjs loaded, the first time the staff is shown. Its
layout is the arrangement described in [view-parts.md](view-parts.md); the parts it uses are the same public parts a
host can mount itself.

`mount` is the only entry that creates a whole editor. Importing the package still touches no DOM. Call it from
client-side code; without a DOM it throws a message naming the package and `mount`.

## Interface

```ts
function mount(el: HTMLElement, options: MountOptions): MountedEditor;
```

`MountOptions`:

| Option | Meaning |
| --- | --- |
| `project: SongProject` | The song project. This version reads its `score` text and `modelId`. |
| `source?: ScoreSource` | Absent or `{ kind: "generated" }` means a generated score; `{ kind: "scoreFile", name, version, save, read }` means a file with explicit Save, no drafts, Restore to the last saved version and a conflict. See [score-files.md](score-files.md). |
| `onSaveAs?: (text: string) => void` | Adds **Save as…** to a generated score; receives the current score text. |
| `onUnsavedChange?: (unsaved: boolean) => void` | The score file's unsaved state when it changes; `MountedEditor.hasUnsavedChanges()` asks it directly. |
| `requiredInputs?: ReadonlyArray<RequiredInput>` | `ProjectField` values the model requires; until they are filled the handoff trigger opens the Project panel on the first missing one. |
| `dialects: DialectRegistry` | The dialects the editor can read, from `createDialectRegistry`. |
| `language: Language` | Interface language, `"zh"` or `"en"`. |
| `editable?: boolean` | Defaults to true. While true the toolbar offers undo, redo, Delete and a Select menu, a click or tap selects a note or sets the insertion point, and the editing keys act; see [view-parts.md](view-parts.md#editing-in-the-parts). While false the score is only shown and the toolbar shows a read-only badge. |
| `notify?: (notice: Notice) => void` | Receives one-time messages. `Notice` is already in the current language. `command-refused` is an edit the user asked for that the score would not take, with nothing changed; the message says why and where. `draft-source-changed` and `draft-save-failed` come from the draft keeper (see `drafts`); the editor draws nothing of its own for them. |
| `drafts?: DraftStore` | The host's draft store. With it, and while `editable`, the editor keeps the user's edits as a draft under `project.sourceKey`, restores it on open, offers Restore original and shows the conflict strip; see [drafts.md](drafts.md#in-the-default-editor). Without it, or while read-only, nothing is kept and the store is never called. |
| `title?: string` | The work's title in the handoff instruction; the project's `sourceKey` when absent or blank. |
| `onHandoff?: (handoff: HandoffPayload) => void` | Adds the handoff button while `editable`. It receives the `score.abc` attachment text, the prefilled instruction and the final project after the draft is saved with the handoff hash; see [handoff.md](handoff.md). Without it there is no button. |

`MountedEditor`:

| Member | Meaning |
| --- | --- |
| `update(options: Partial<MountOptions>)` | Applies only the given keys. A language change rewrites the interface without rebuilding the view, and `editable` switches editing on or off without remounting. A `project` with another `sourceKey`, `lyrics` or score text is a new original, so the draft keeper starts over on it; the same project again changes nothing. `drafts` set, replaced or `undefined` starts, replaces or ends the keeper. A `source` of another kind or file version rebuilds the save state; the same source keeps it. Does nothing after `destroy`. |
| `hasUnsavedChanges()` | Whether a score file has changes that are not saved. Always false for a generated score. |
| `destroy()` | Removes every listener, node and style sheet it added; a draft keeper writes what it still holds. Safe to call twice. |

An element holds at most one editor: destroy the first before mounting again. `ScoreSource` is either a
`GeneratedScoreSource` with `kind: "generated"`, or a `ScoreFileSource` with `kind: "scoreFile"`, `name`, `version`,
`save` and `read`. Its `save` answers a `ScoreFileSaveResult`, and its `read` answers a `ScoreFileEntry` or null. For
the source option, the save button, the unsaved state, the conflict and save-as, see
[score-files.md](score-files.md).

## Usage

```ts
import { createDialectRegistry, mount } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const editor = mount(document.querySelector("#editor")!, {
  language: "en",
  project, // a SongProject with modelId "song2"
  dialects: createDialectRegistry([song2Dialect]),
  drafts: store, // optional: a DraftStore; see drafts.md
  title: "My Song", // optional: the title in the handoff instruction
  onHandoff: (handoff) => putInChat(handoff), // optional: adds the handoff button; see handoff.md
  notify: (notice) => showToast(notice.message),
});

editor.update({ project: nextProject }); // redraws from the new document, keeps language and view
editor.destroy();
```

The package README's [mount contract](../../../README.md#mount) states what a score that cannot be read and a model
with no dialect show. Both are the problem view; see [view-parts.md](view-parts.md).

If the host needs its own layout, a subset of parts or its own views, do not wrap `mount`: create an
`EditingSession` and mount the parts yourself, as in [view-parts.md](view-parts.md). The session, not `mount`, is the
reusable unit.

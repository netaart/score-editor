# mount: the default editor

Use `mount` when the host wants a working editor without choosing parts: a toolbar, one shared time scroller with the
ruler, chord track and one track per voice, the cut notice and the problem view, all on one editing session. Its
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
| `dialects: DialectRegistry` | The dialects the editor can read, from `createDialectRegistry`. |
| `language: Language` | Interface language, `"zh"` or `"en"`. |
| `editable?: boolean` | Defaults to true. While true the toolbar offers undo, redo and Delete, a click or tap selects a note or sets the insertion point, and the editing keys act; see [view-parts.md](view-parts.md#editing-in-the-parts). While false the score is only shown and the toolbar shows a read-only badge. |
| `notify?: (notice: Notice) => void` | Receives one-time messages. `Notice` is already in the current language. Its one code today is `command-refused`: an edit the user asked for that the score would not take, with nothing changed; the message says why and where. |

`MountedEditor`:

| Member | Meaning |
| --- | --- |
| `update(options: Partial<MountOptions>)` | Applies only the given keys. A language change rewrites the interface without rebuilding the view, and `editable` switches editing on or off without remounting. Does nothing after `destroy`. |
| `destroy()` | Removes every listener, node and style sheet it added. Safe to call twice. |

An element holds at most one editor: destroy the first before mounting again.

## Usage

```ts
import { createDialectRegistry, mount } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const editor = mount(document.querySelector("#editor")!, {
  language: "en",
  project, // a SongProject with modelId "song2"
  dialects: createDialectRegistry([song2Dialect]),
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

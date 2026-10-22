# The editing session

Use an editing session when a host wants its own layout but still wants the editor's document behaviour: one song
project, undo and redo, a selection, an insertion point, and the zoom, horizontal scroll and language that several
view parts share. The session is headless. It imports and runs in Node and in a worker, draws nothing, and does not
know about any part.

`mount` builds one session internally. A host that mounts view parts builds its own.

## Create one

```ts
import { createDialectRegistry, createEditingSession } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const session = createEditingSession({
  project, // SongProject: the only document state
  dialects: createDialectRegistry([song2Dialect]),
  language: "en", // optional, "en" by default
});
```

`SessionOptions` is `{ project, dialects, language? }`. `createEditingSession` returns an `EditingSession`.

## What it holds

| Member | What it is |
| --- | --- |
| `project` | The current `SongProject`. The only document state. |
| `reading` | A `ScoreReading`, cached until the score text, model or dialects change. |
| `selection` | `ReadonlyArray<string>` of note ids. UI state, not in the history. Ids of notes that no longer exist are dropped. |
| `insertionPoint` | `InsertionPoint \| null` (`{ tick }`). UI state, not in the history. |
| `view` | `ViewState`: `{ zoom, scrollLeft, language }`, shared by all parts. Not in the history. |
| `canUndo`, `canRedo` | Whether the history has a step in that direction. |

`ScoreReading` is one of `{ kind: "score", score }`, `{ kind: "unreadable", diagnostics }`, or
`{ kind: "no-dialect", modelId }`. Every view draws from this one reading.

## What it does

| Method | Effect |
| --- | --- |
| `dispatch(command: ScoreCommand)` | Applies one command as one history step. Returns `DispatchResult`: `{ ok, project, diagnostics }`. A refused command changes nothing and returns its diagnostics. |
| `runTool(tool, values?)` | Validates a tool's parameters, builds its commands once and applies them as one history step. Returns `ToolResult`. One failing step refuses the whole run. |
| `previewTool(tool, values?)` | Returns what the tool would produce without dispatching, changing the history or notifying anyone. |
| `undo()` / `redo()` | Move one whole project step. Return false when there is none. |
| `select(noteIds)` | Selects exactly these notes; ids that name no note are left out. |
| `setInsertionPoint(point \| null)` | Sets the insertion point; `tick` is a whole number, zero or more. Throws `RangeError` otherwise. |
| `setView(patch)` | Changes zoom, scroll or language by the given keys. Zoom is clamped to 0.01-4, scroll to zero or more. |
| `replaceProject(next)` | Starts a new document from outside: history, selection and insertion point go; view state stays. No-op when every field is the same. |
| `replaceDialects(next)` | Reads the project with another registry. The history stays. No-op for the same registry. |
| `subscribe(listener)` | Calls `listener(change)` after every change and returns the unsubscribe function. |

`SessionChange` is `{ cause, project, selection, insertionPoint, view }`. The four booleans say which state the change
touched; `SessionChangeCause` is `"dispatch"`, `"undo"`, `"redo"`, `"select"`, `"insertion-point"`, `"view"` or
`"replace"`. `SessionListener` is `(change: SessionChange) => void`. A listener that throws does not reach the caller
of the change; its error goes to `reportError`.

`DispatchResult` is either `{ ok: true, project, diagnostics: [] }` or `{ ok: false, project, diagnostics }`. The
project is the one the session is left with: the untouched project for a refusal.

## Usage

```ts
const stop = session.subscribe((change) => {
  if (change.project) save(session.project);
  if (change.view || change.project) redrawFrom(session.reading, session.view);
});

const done = session.dispatch({ type: "toRest", noteId: session.selection[0] ?? "" });
if (!done.ok) showProblems(done.diagnostics);

session.undo(); // the whole project before that command

stop();
```

Selection and view state are deliberately outside the history so undo never moves the user's scroll or focus. A host
that replaces the document (a new score from outside) uses `replaceProject`, not a dispatch. Keep one session per
document; parts created for the previous session should be destroyed with it.

A tool is a pure function, not a session method. The session's `runTool` and `previewTool` are the same code path a
tool panel uses, and `dispatch` is the same path a direct edit uses. See [custom-tools.md](custom-tools.md).

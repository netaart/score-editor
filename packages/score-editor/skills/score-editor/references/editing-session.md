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
  editable: true, // optional, true by default
  activeView: "arrangement", // optional, "arrangement" by default
});
```

`SessionOptions` is `{ project, dialects, language?, editable?, activeView? }`. `createEditingSession` returns an `EditingSession`.

## What it holds

| Member | What it is |
| --- | --- |
| `project` | The current `SongProject`. The only document state. |
| `reading` | A `ScoreReading`, cached until the score text, model or dialects change. |
| `selection` | `ReadonlyArray<string>` of note ids. UI state. Ids of notes that no longer exist are dropped. |
| `insertionPoint` | `InsertionPoint \| null` (`{ tick }`). UI state. |
| `barSelection` | `BarSelection \| null` (`{ from, count }`, `from` base 0). A run of bars chosen in the ruler. UI state, separate from `selection` and outside the history; a project change clears it. |
| `constraints` | The `DialectConstraints` of the project's dialect, or null when no dialect is registered; the meter control reads its `meter` rule. |
| `view` | `ViewState`: `{ zoom, scrollLeft, language, editable }`, shared by all parts. `editable` says whether the user may change the score: parts offer editing controls and take selection and editing keys only while it is true. It does not stop `dispatch`; whoever drives the session directly decides what it sends. |
| `activeView` | `ViewName` (`"arrangement"`, `"staff"` or `"text"`, listed in `VIEW_NAMES`): which view is shown. UI state like the selection, outside the history and not a field of `view`. The default editor shows this view; a host with its own layout reads it, or sets it from its own switch. |
| `rejectedText` | `RejectedText \| null` (`{ text, diagnostics }`): text the text view holds that cannot be read, so the project kept the last score that could. Any change of the project, and `replaceProject`, drops it. |
| `canUndo`, `canRedo` | Whether the history has a step in that direction. |

`ScoreReading` is one of `{ kind: "score", score }`, `{ kind: "unreadable", diagnostics }`, or
`{ kind: "no-dialect", modelId }`. Every view draws from this one reading.

## What it does

| Method | Effect |
| --- | --- |
| `dispatch(command: ScoreCommand \| ProjectCommand)` | Applies one command as one history step. Returns `DispatchResult`: `{ ok, project, diagnostics }`. A refused command changes nothing and returns its diagnostics. A command that comes back with notices only (`isNoticeDiagnostic`) is taken: the result is `ok` with the notices in `diagnostics`. |
| `dispatchAll(commands)` | Applies a list of `ScoreCommand` and `ProjectCommand` as one history step through the same path as `dispatch`, all or none, and announces one change. Returns `DispatchResult`. One refusal refuses the whole list and changes nothing; the notices of the steps that were taken come back once each. An empty list adds no step. It is how one gesture that needs several commands (dragging a boundary two lyric lines share) stays one undo. |
| `checkScoreText(text)` | What `dispatch` of `replaceScoreText` with `text` would say: the diagnostics it would be refused with, or the notices it would be taken with, the song-project rules included; a result with no diagnostic that `isNoticeDiagnostic` rejects is a text the session takes. Changes and announces nothing. |
| `setActiveView(name)` | Shows another view. Throws `RangeError` for a name outside `VIEW_NAMES`. |
| `setRejectedText(next \| null)` | Says which unreadable text the text view holds, or that it holds none. No-op for the same text. |
| `runTool(tool, values?)` | Validates a tool's parameters, builds its commands once and applies them as one history step. Returns `ToolResult`. One failing step refuses the whole run; a step that comes back with a notice does not, and the notices are in the result. |
| `previewTool(tool, values?)` | Returns what the tool would produce without dispatching, changing the history or notifying anyone. |
| `undo()` / `redo()` | Move one whole project step. Return false when there is none. |
| `select(noteIds)` | Selects exactly these notes; ids that name no note are left out. It works while the session is read-only, so a host's own control can select when the parts refuse to. |
| `setBarSelection(range \| null)` | Chooses a run of bars, or clears it with null. A run beyond the score is trimmed to the bars that exist; a run that names none is null. Like `select`, it works while the session is read-only. |
| `setInsertionPoint(point \| null)` | Sets the insertion point; `tick` is a whole number, zero or more. Throws `RangeError` otherwise. |
| `setView(patch)` | Changes zoom, scroll, language or editable by the given keys. Zoom is clamped to 0.01-4, scroll to zero or more. |
| `replaceProject(next)` | Starts a new document from outside: history, selection and insertion point go; view state stays. No-op when every field is the same. |
| `replaceDialects(next)` | Reads the project with another registry. The history stays. No-op for the same registry. |
| `subscribe(listener)` | Calls `listener(change)` after every change and returns the unsubscribe function. |

`SessionChange` is `{ cause, project, selection, insertionPoint, view, command? }`. The four booleans say which state the change
touched; `command` is the `ProjectCommand` that made a `"dispatch"` change, so that `{ type: "replaceScoreText" }` can be told from the other edits (it is absent on every other change, and on a dispatch of a score command or a tool run); `SessionChangeCause` is `"dispatch"`, `"undo"`, `"redo"`, `"select"`, `"bar-selection"`, `"insertion-point"`, `"view"`,
`"replace"`, `"active-view"` or `"rejected-text"`; `bar-selection`, `active-view` and `rejected-text` touch none of the four booleans and are told by the cause alone. `SessionListener` is `(change: SessionChange) => void`. A listener that throws does not reach the caller
of the change; its error goes to `reportError`.

`DispatchResult` is either `{ ok: true, project, diagnostics }` or `{ ok: false, project, diagnostics }`. The
project is the one the session is left with: the untouched project for a refusal. A successful dispatch may carry
notices in `diagnostics` (`isNoticeDiagnostic`; for example `style-no-bpm` after a tempo change, or
`melody-with-chords` in a melody project that has chords): the project is changed and usable, so show a notice as a
notice, and do not undo the change or treat it as an error. Test `ok`, not `diagnostics.length`, to tell a refusal.

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

The package README's [session contract](../../../README.md#the-editing-session-and-view-parts) states what the
history holds and what stays UI state. A host that replaces the document (a new score from outside) uses
`replaceProject`, not a dispatch. Keep one session per document; parts created for the previous session should be
destroyed with it.

A tool is a pure function, not a session method. The session's `runTool` and `previewTool` are the same code path a
tool panel uses, and `dispatch` is the same path a direct edit uses. See [custom-tools.md](custom-tools.md).

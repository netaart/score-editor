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

`SessionOptions` is `{ project, dialects, language?, editable?, activeView?, grid? }`. `createEditingSession` returns an `EditingSession`.

## What it holds

| Member | What it is |
| --- | --- |
| `project` | The current `SongProject`. The only document state. |
| `reading` | A `ScoreReading`, cached until the score text, model or dialects change. |
| `constraints` | `DialectConstraints \| null`: what the dialect that reads the project declares, or null when the registry has no dialect for its model. A part that must offer only what the dialect allows, as the chord picker does, draws from it. |
| `dialect` | The `ScoreDialect` that reads `project`, or `undefined` when the registry has none for its model. Its `constraints` (the tempo range, the keys) are what the toolbar's tempo and key controls offer. |
| `selection` | `ReadonlyArray<string>` of note ids. UI state. Ids of notes that no longer exist are dropped. |
| `insertionPoint` | `InsertionPoint \| null` (`{ tick }`). UI state. |
| `barSelection` | `BarSelection \| null` (`{ from, count }`, `from` base 0). A run of bars chosen in the ruler. UI state, separate from `selection` and outside the history; a project change clears it. |
| `constraints` | The `DialectConstraints` of the project's dialect, or null when no dialect is registered; the meter control reads its `meter` rule. |
| `grid` | `Grid` (`{ value, dotted? }`): the step that notes move and resize by, that a drag lands on and that the insertion point snaps to and steps by. UI state like the selection: outside the history, and not a field of `view` or of the project. It starts at `{ value: 4 }` (1/4) unless `SessionOptions.grid` says otherwise. A project or registry change that cannot write the grid in force puts 1/4 back, and the change carries `gridDropped` with the old grid. |
| `view` | `ViewState`: `{ zoom, scrollLeft, language, editable }`, shared by all parts. `editable` says whether the user may change the score: parts offer editing controls and take selection and editing keys only while it is true. It does not stop `dispatch`; whoever drives the session directly decides what it sends. |
| `activeView` | `ViewName` (`"arrangement"`, `"staff"` or `"text"`, listed in `VIEW_NAMES`): which view is shown. UI state like the selection, outside the history and not a field of `view`. The default editor shows this view; a host with its own layout reads it, or sets it from its own switch. |
| `rejectedText` | `RejectedText \| null` (`{ text, diagnostics }`): text the text view holds that cannot be read, so the project kept the last score that could. Any change of the project, and `replaceProject`, drops it. |
| `canUndo`, `canRedo` | Whether the history has a step in that direction. |
| `steps` | `ReadonlyArray<HistoryStep>`: the steps `undo` would take back, oldest first. A `HistoryStep` is `{ author, batch?, note }`: who made it (`"user"`, or an agent's name), the batch it belongs to when it has one, and its sentence. Undo and redo move these records with the steps. |
| `stoppedBatches` | `ReadonlyArray<string>`: the batches the user stopped, in the order they were stopped (see `stopBatch`). |

`ScoreReading` is one of `{ kind: "score", score }`, `{ kind: "unreadable", diagnostics }`, or
`{ kind: "no-dialect", modelId }`. Every view draws from this one reading.

## What it does

| Method | Effect |
| --- | --- |
| `dispatch(command, origin?)` | Applies one command as one history step, recorded with `origin` (`EditOrigin`, see below). `command` is a `ScoreCommand`, a `ProjectCommand` or a `HistoryCommand`; a history command adds no step, and like an edit it is refused while its origin carries a stopped batch. Returns `DispatchResult`: `{ ok, project, diagnostics }`. A refused command changes nothing and returns its diagnostics. A command that comes back with notices only (`isNoticeDiagnostic`) is taken: the result is `ok` with the notices in `diagnostics`. |
| `dispatchAll(commands, origin?)` | Applies a list of `ScoreCommand` and `ProjectCommand` as one history step through the same path as `dispatch`, all or none, and announces one change. Returns `DispatchResult`. One refusal refuses the whole list and changes nothing; the notices of the steps that were taken come back once each. An empty list adds no step. It is how one gesture that needs several commands (dragging a boundary two lyric lines share) stays one undo. |
| `stopBatch(batch)` | Marks a batch as stopped by the user. Later edits, tool runs and history commands whose origin carries the batch are refused, and the edits already made stay. The rules are in the section below. |
| `checkScoreText(text)` | What `dispatch` of `replaceScoreText` with `text` would say: the diagnostics it would be refused with, or the notices it would be taken with, the song-project rules included; a result with no diagnostic that `isNoticeDiagnostic` rejects is a text the session takes. Changes and announces nothing. |
| `setActiveView(name)` | Shows another view. Throws `RangeError` for a name outside `VIEW_NAMES`. |
| `setRejectedText(next \| null)` | Says which unreadable text the text view holds, or that it holds none. No-op for the same text. |
| `runTool(tool, values?, origin?)` | Validates a tool's parameters, builds its commands once and applies them as one history step, recorded with `origin`. Returns `ToolResult`. One failing step refuses the whole run; a step that comes back with a notice does not, and the notices are in the result. |
| `previewTool(tool, values?)` | Returns what the tool would produce without dispatching, changing the history or notifying anyone. |
| `undo()` / `redo()` | Move one whole project step. Return false when there is none. The same moves are the commands `{ type: "undo" }` and `{ type: "redo" }` through `dispatch`, and a refusal `nothing-to-undo` or `nothing-to-redo` when there is none. |
| `select(noteIds)` | Selects exactly these notes; ids that name no note are left out. It works while the session is read-only, so a host's own control can select when the parts refuse to. |
| `setBarSelection(range \| null)` | Chooses a run of bars, or clears it with null. A run beyond the score is trimmed to the bars that exist; a run that names none is null. Like `select`, it works while the session is read-only. |
| `setInsertionPoint(point \| null)` | Sets the insertion point; `tick` is a whole number, zero or more. Throws `RangeError` otherwise. |
| `setGrid(grid)` | Sets the grid. Throws `RangeError` for a value outside `GridValue` or an unknown step. It asks nothing of the score: a grid the score cannot write is refused by `moveNotes` and `resizeNotes` with `grid-not-allowed`. No-op for the grid already in force. |
| `allowsGrid(grid)` | Whether the score the session reads can be edited on this grid, by the check the note commands make (`false` for a score that does not read). The Grid menu uses it to mute a step and to leave out 1/32. |
| `setView(patch)` | Changes zoom, scroll, language or editable by the given keys. Zoom is clamped to 0.01-4, scroll to zero or more. |
| `replaceProject(next)` | Starts a new document from outside: history, selection and insertion point go; view state stays, and so does the grid unless the new score cannot write it (then 1/4 is in force and the change carries `gridDropped`). No-op when every field is the same. |
| `replaceDialects(next)` | Reads the project with another registry. The history stays. A grid the re-read score cannot write is put back to 1/4 in the change, which carries `gridDropped`. No-op for the same registry. |
| `subscribe(listener)` | Calls `listener(change)` after every change and returns the unsubscribe function. |

`SessionChange` is `{ cause, project, selection, insertionPoint, view, command?, step?, gridDropped? }`. The four booleans say which state the
change touched; `command` is the `ProjectCommand` that made a `"dispatch"` change, so that `{ type: "replaceScoreText" }` can be told from the other edits (it is absent on every other change, and on a dispatch of a score command or a tool run); `step` is the `HistoryStep` the change made, undid or redid, so a view can say who made it and its sentence without reading `steps`: it is on a `"dispatch"` change that made a step (a command, a list or a tool run), on each `"undo"` change that took one back and on each `"redo"` change that brought one back, and a batch undo announces one `"undo"` change per step it takes back; it is absent on every other change. `gridDropped` is the grid put back to 1/4 because the project or the dialects could not write it, present on that one change only; `SessionChangeCause` is `"dispatch"`, `"undo"`, `"redo"`, `"select"`, `"bar-selection"`, `"insertion-point"`, `"view"`,
`"replace"`, `"active-view"`, `"rejected-text"`, `"grid"` or `"batch-stop"`; the last four and `"batch-stop"` touch none of the four booleans and are told by the cause alone. `SessionListener` is `(change: SessionChange) => void`. A listener that throws does not reach the caller
of the change; its error goes to `reportError`.

`DispatchResult` is either `{ ok: true, project, diagnostics }` or `{ ok: false, project, diagnostics }`. The
project is the one the session is left with: the untouched project for a refusal. A successful dispatch may carry
notices in `diagnostics` (`isNoticeDiagnostic`; for example `style-no-bpm` after a tempo change, or
`melody-with-chords` in a melody project that has chords): the project is changed and usable, so show a notice as a
notice, and do not undo the change or treat it as an error. Test `ok`, not `diagnostics.length`, to tell a refusal. A batch
undo that asks first is a refusal too: `ok` is false, its diagnostic is `batch-undo-confirm`, and `otherAuthorSteps` lists the
steps it would also take back.

## Authors, batches and the history commands

`EditOrigin` is `{ author?, batch?, note? }`, the third argument of `dispatch`, the second of `dispatchAll` and the third of
`runTool`. Without it an edit is the user's (`author` `"user"`), in no batch, with an empty `note`. An agent's run is one
`batch`: every edit of the run carries the same name, and the steps it made are the ones a batch undo reaches.

The history commands go through `dispatch` like an edit, and none of them adds a step:

| Command | Effect |
| --- | --- |
| `{ type: "undo" }`, `{ type: "redo" }` | One step back or forward, as `undo()` and `redo()`. Refused with `nothing-to-undo` or `nothing-to-redo` when there is none. |
| `{ type: "undoBatch", batch, confirm? }` | Takes back every step from the batch's first step to the top of the history, so the project returns to what it was before that step. Among those steps, the ones another author made (an author that is not one of the batch's authors) are asked for first: without `confirm: true` the command is refused with `batch-undo-confirm`, its `otherAuthorSteps` lists them oldest first, and nothing changes. A batch with no step in the history is refused with `nothing-to-undo`, naming the batch. Each taken step can be redone with `redo`; there is no skipping, so a step of another author between the batch's steps goes with them. |

`stopBatch(batch)` is the user's stop. It marks the batch: from then on `dispatch`, `dispatchAll` and `runTool` refuse an edit
that carries it with `batch-stopped`, whose text says the user stopped the batch, and `dispatch` refuses the history commands
(`undo`, `redo`, `undoBatch`) whose origin carries it, the same way. The edits the batch already made stay. The user's own
history commands carry no batch, so they still work, and the user takes the stopped batch back with `undoBatch`; the batch an
`undoBatch` names is not checked, since the origin decides whose command it is. Other batches and the user's edits are not
refused. The marks are kept when `replaceProject` starts a new document, since the history goes and the stop does not. A mark
is announced once as the change `"batch-stop"`.

The headless functions (`applyProjectCommand`, `applyScoreCommand`, `applyCommandList`) hold no history, so they do not take
the history commands. Undo and redo are the session's.

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

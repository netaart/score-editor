# @neta-art/score-editor

A browser score editor for song projects. A host app mounts it onto an element, maps its own theme through CSS variables, and receives one-time messages through a callback. No framework is exposed.

Work in progress: today the package shows a song project's score as an arrangement: a ruler with bar numbers, section bands, key and meter marks, a chord track, and one piano-roll track per voice, with zoom and scrolling. The first edits are in: select a note (by pointer or by keyboard), turn it into a rest with the Delete key or the Delete button, undo and redo, and drop an insertion point on a beat line and move it with the keys. The rest of editing arrives in later versions.

## Mount

```ts
import { createDialectRegistry, mount } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const editor = mount(element, {
  language: "en", // "zh" or "en"
  project, // a SongProject: the score text and the model ID are read
  dialects: createDialectRegistry([song2Dialect]), // the formats this editor can read
  notify: (notice) => showToast(notice.message), // already in the current language; `notice.code` is one of `NOTICE_CODES`
});

editor.update({ project: nextProject }); // only the given keys change; language-only changes keep the view
editor.destroy(); // removes every listener, node and stylesheet it added
```

- A score that cannot be read shows the dialect's diagnostics in the interface language instead of the view. A project whose model has no dialect in the registry shows one short sentence.
- `editable` (default `true`) says whether the user may change the score. While it is true the toolbar has undo, redo and Delete, a click or tap selects a note or drops the insertion point, Tab reaches the notes, and Delete (or Backspace), Ctrl or Cmd plus Z, Ctrl or Cmd plus Shift plus Z, Ctrl plus Y, Left, Right, Home, End, Enter and Space act. While it is false none of that exists: no editing control, no selection frame, no insertion point, and the keys do nothing; the toolbar shows a read-only badge instead. `update({ editable })` switches it without remounting, and a selection made before comes back with it.
- A command the user's keys caused that the score would not take (the dialect refuses to write the result) changes nothing and reaches `notify` once as `{ code: "command-refused", level: "warning", message }`, in the interface language.
- Importing the package runs nothing that touches the DOM, so a server render can import it. `mount` and the view parts' mount functions need a browser and throw a clear error elsewhere; call them from client-side code. `createEditingSession` needs none.
- The headless layer is dialect-agnostic: `applyScoreCommand(dialect, text, command)` and `applyProjectCommand(dialect, project, command)` apply one command to the shared score model, write it with the dialect, and run `dialect.check`. A failure returns a diagnostic and changes nothing.
- Styles: every class is prefixed `sce-`. The host maps its theme onto `--sce-color-bg`, `--sce-color-text`, `--sce-color-accent` and a few more; unmapped colours fall back to neutral defaults derived from the mapped ones. The full list is in [DESIGN.md](../../DESIGN.md).
- A host whose own CSS uses ID selectors or `!important` on plain elements should mount the editor inside a shadow root. See [docs/spike.md](../../docs/spike.md).
- The package assumes a browser with native popovers, `:has()` and `light-dark()`. Only Chromium has been run so far.

## Commands

`applyScoreCommand` takes one `ScoreCommand` and changes the score text. `applyProjectCommand` takes a `ScoreCommand` or a `ProjectCommand`, the one-word name of the second union: project edits that cannot be score commands because they never touch the score text. A refused command returns the input unchanged and a diagnostic. A notice is a diagnostic too, but it comes with the changed project; `isNoticeDiagnostic` tells the two apart.

Score commands, in the order `ScoreCommand` lists them:

- `toRest`: turns a note and its whole tie chain into rests.
- `transpose`: moves every note, every chord root and bass, the header `K:`, every body `K:` line and every inline `[K:…]` by the same number of semitones. The new keys are the declared spellings with the fewest accidentals. A note that would leave MIDI 0-127 refuses the whole command.
- `setKey`: moves the notes and chords to the chosen key, like `transpose` by the shortest interval between the two tonics, and forces the chosen key's spelling. With `from`, only the score from that key-change position on moves; the header and earlier key changes stay.
- `setTempo`: writes `Q:1/4=<bpm>` from the dialect's tempo range and changes no pitch.
- `removeChords`: removes every chord from the score. It is the one-step fix for a `melody` project that carries chords.

Project commands, the `ProjectCommand` union:

- `setStyle`: sets the style text.
- `setScoreMode`: sets `full` or `melody`.
- `setSeed`: sets a whole-number seed, or `null` to clear it.

`applyProjectCommand` also runs the song-project rules. A `setTempo` through it rewrites every BPM written in the style text (`120 BPM`, `120bpm`, `BPM: 120`, `bpm=120`, `BPM 120`) and reports the notice `style-no-bpm` when the style has none. A project in `melody` mode whose score has chords reports the notice `melody-with-chords`; delete the chords or switch back to `full`. `checkProject(dialect, project)` reports that notice for a project as it stands, without changing anything.

## The editing session and view parts

`mount` is one arrangement of smaller public pieces. An **editing session** holds the song project with its undo history, the selection, the insertion point, and the UI state that parts share (zoom, horizontal scroll, language). A **view part** mounts on an element of the host's own layout, binds to one session, and draws from it. Parts of one session zoom and scroll together; each is free to be as wide as the element the host gave it.

```ts
import {
  createDialectRegistry,
  createEditingSession,
  mountChordTrack,
  mountTimeRuler,
  mountToolbar,
  mountVoiceTrack,
  mountZoomControl,
} from "@neta-art/score-editor";

const session = createEditingSession({
  project,
  dialects: createDialectRegistry([song2Dialect]),
  language: "en",
});

const parts = [
  mountToolbar(toolbarElement, session, { onRefused: (diagnostics) => report(diagnostics) }),
  mountTimeRuler(rulerElement, session),
  mountChordTrack(chordsElement, session),
  mountVoiceTrack(vocalElement, session, { voice: "Vocal" }),
];

const done = session.dispatch({ type: "toRest", noteId }); // { ok, project, diagnostics }: a refused command returns the project it left untouched
session.undo(); // the whole project before that command
session.setView({ editable: false }); // every part follows: no editing control, no selection, no keys
const stop = session.subscribe((change) => save(session.project)); // change.cause: "dispatch", "undo", "view", ...

for (const part of parts) part.destroy(); // each removes its own listeners, nodes and share of the stylesheet
stop();
```

- The session is headless: it touches no DOM, so it runs in Node and in a worker. `dispatch` applies a command through `applyProjectCommand`; a refused command changes nothing and returns its diagnostics. The history keeps whole song projects. Selection (note ids), insertion point, zoom, scroll and language are not in the history. `replaceProject` starts a new document from outside, the way `update({ project })` does.
- Parts: `mountToolbar`, `mountZoomControl`, `mountCutNotice`, `mountProblemView`, `mountTimeRuler`, `mountChordTrack` and `mountVoiceTrack(el, session, { voice })`. Each returns `{ destroy() }`, and a second `destroy` does nothing. Each part is styled and isolated as `mount` is, and the zoom menu uses the popover layer; the decisions are in [docs/spike.md](../../docs/spike.md).
- The ruler, the chord track and a voice track scroll in time on their own element, each by its own width. Each is a named region that Tab reaches, and the plus and minus keys zoom around the middle of the one that has the focus. Pass `{ scroller }` as the last argument to put several of them in one scroller of your own, as `mount` does. A part mounted late starts at the session's zoom and scroll.
- The toolbar part holds the title, the zoom control, undo, redo and Delete (while `session.view.editable` is true), the read-only badge (while it is not) and, when you pass `{ hintId }`, a screen-reader hint with that id for a view's `aria-describedby`. Its options are `ToolbarOptions`: `hintId`, and `onRefused` for the diagnostics of a Delete the score would not take. Its row scrolls sideways when your element is narrower than its controls. Undo and redo are the session's `undo()` and `redo()`; Delete is muted until a pitched note is selected and then does what the Delete key does, so a touch screen can delete without a keyboard.
- Selection and the insertion point live in the session, not in a part: `session.selection` holds note ids and `session.insertionPoint` a tick, and neither is in the history. A voice track draws them and takes the clicks and taps. The editing keys (Delete, Backspace, Ctrl or Cmd plus Z, Ctrl or Cmd plus Shift plus Z, Ctrl plus Y, Left, Right, Home, End) are heard by a part while the focus is inside it; a part that handles one keeps it from the browser, and a part given `{ onRefused }` (the option of `ToolbarOptions` and of every time-axis part) hears the diagnostics of a refused command. Left and Right keep scrolling while there is no insertion point; Home and End always place one.
- Notes by keyboard: a voice track has one tab stop among its notes (the selected note, else the first). While a note has the focus, Left and Right step to the neighbouring note and select it, Home and End go to the first and the last, and Enter or Space selects the one in focus; a key with a modifier is left alone. A click or tap puts the focus on the note it selects. With the focus anywhere else in the part, the insertion point keys above keep their meaning.
- Announcements: each time-axis part keeps one polite live region (`role="status"`) in the host's language. A voice track says which of its own notes were selected, that a delete took some, and what an undo brought back or a redo took away, and the track of the score's first voice says where the insertion point moved; any part says why, and where, a refused edit its keys caused was refused (the toolbar for its Delete button). A part mounted alone speaks for what it draws, and nothing reads another part.
- Not tied to the DOM: `handleEditingInput(session, input)` takes one `EditingInput` as plain data and does what the parts do, so a host that builds its own layout or its own input handling can reuse it. The input is `{ type: "key", key, ctrlKey?, metaKey?, shiftKey?, altKey? }`, `{ type: "click-note", noteId }`, `{ type: "click-empty", tick }` or `{ type: "delete" }` (what a Delete control sends). It returns an `EditingInputResult`, `{ handled, refused }`: `handled` says the input meant something here, so the caller should keep the browser from also acting on it, and `refused` holds the diagnostics of an edit the score would not take. While the session is not editable nothing is handled. Deleting several selected notes is one history step, and one refusal refuses the whole run.
- `mount` builds one session and assembles these parts in a toolbar, a scroller and a problem view; its options are unchanged, and `editable` and `notify` do what the first list says.

## Custom tools

A **tool** is a pure function from a song project, the selected note ids and its parameter values to a list of commands. It declares an id, a name in both languages and its parameters; it never touches a session or the DOM, so the same tool runs in a test, a worker or a panel.

```ts
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createToolRegistry,
  previewTool,
  type ScoreTool,
  type ToolParameter,
} from "@neta-art/score-editor";

const every: ToolParameter = { name: "every", type: "number", min: 2, max: 8, default: 2 };

const restEveryNth: ScoreTool = {
  id: "rest-every-nth",
  name: { en: "Rest every Nth note", zh: "每隔 N 个音变休止" },
  parameters: [every],
  commands(_project, selection, values) {
    const step = values.every as number;
    return selection
      .filter((_id, index) => (index + 1) % step === 0)
      .map((noteId) => ({ type: "toRest", noteId }));
  },
};

const tools = createToolRegistry([restEveryNth]); // a second id or a malformed tool throws
const found = tools.find("rest-every-nth"); // tools.list() returns every registered tool

const dialects = createDialectRegistry([song2Dialect]); // the session was created with the same registry
const preview = previewTool(restEveryNth, session.project, session.selection, { every: 2 }, dialects);
const viaSession = session.previewTool(restEveryNth, { every: 2 });
const result = session.runTool(restEveryNth, { every: 2 });
```

- Parameters are declared as `number` (with optional `min`, `max` and `step`), `boolean`, `choice` (with `values`), or `text`. A missing value takes its default. A wrong type, an out-of-range number or a value outside a choice is refused with the command diagnostic code `tool-parameter` before the tool's function runs; `formatDiagnostic` gives it zh and en text. The registry also refuses a tool with no `commands` builder, an unknown parameter type, a choice without values, or a default its own declaration would refuse, so a broken tool never runs.
- `previewTool` and `session.previewTool` return `{ ok, project, diagnostics, commands }` without changing the session: no dispatch, no history step, no notification. The project is the tool's result, or the project it started from when a step fails.
- `session.runTool` checks the parameters, builds the commands once, and applies them through the same command path as `dispatch`. All commands are one history step: one undo goes back to the project before the run, one redo reapplies it. If any step fails its `check`, the run is refused, the result carries that step's diagnostic, and project and history stay as they were.
- Every export here is additive to the 0.1.0 entry and the editing-session entry; `commands`, `parameters` and `name` are the shape the registry and session read. The tool panel in a later ticket reads the registry's declarations to draw its controls and preview.

## Editor skill

`skills/score-editor/` is the editor skill, an Agent Skills bundle that ships in this package: `SKILL.md` routes an agent to one reference per layer and extension point, and `assets/` holds two runnable examples (a static page that imports from esm.sh, and a pnpm project bundled with esbuild). Start at [skills/score-editor/SKILL.md](skills/score-editor/SKILL.md). `pnpm check:skill` fails when a public export is missing from the skill, and the browser tests run both examples against the local build.

MIT licensed.

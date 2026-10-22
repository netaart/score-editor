# @neta-art/score-editor

A browser score editor for song projects. A host app mounts it onto an element, maps its own theme through CSS variables, and receives one-time messages through a callback. No framework is exposed.

Work in progress: today the package shows a song project's score as an arrangement: a ruler with bar numbers, section bands, key and meter marks, a chord track, and one piano-roll track per voice, with zoom and scrolling. The first edits are in: select a note, turn it into a rest with Delete, undo and redo, and drop an insertion point on a beat line and move it with the keys. The rest of editing arrives in later versions.

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
- `editable` (default `true`) says whether the user may change the score. While it is true the toolbar has undo and redo, a click or tap selects a note or drops the insertion point, and Delete (or Backspace), Ctrl or Cmd plus Z, Ctrl or Cmd plus Shift plus Z, Ctrl plus Y, Left, Right, Home and End act. While it is false none of that exists: no editing control, no selection frame, no insertion point, and the keys do nothing; the toolbar shows a read-only badge instead. `update({ editable })` switches it without remounting, and a selection made before comes back with it.
- A command the user's keys caused that the score would not take (the dialect refuses to write the result) changes nothing and reaches `notify` once as `{ code: "command-refused", level: "warning", message }`, in the interface language.
- Importing the package runs nothing that touches the DOM, so a server render can import it. `mount` and the view parts' mount functions need a browser and throw a clear error elsewhere; call them from client-side code. `createEditingSession` needs none.
- The edit layer is dialect-agnostic: `applyScoreCommand(dialect, text, command)` and `applyProjectCommand(dialect, project, command)` apply one command to the shared score model, write it with the dialect, and run `dialect.check`. A failure returns a diagnostic and changes nothing.
- Styles: every class is prefixed `sce-`. The host maps its theme onto `--sce-color-bg`, `--sce-color-text`, `--sce-color-accent` and a few more; unmapped colours fall back to neutral defaults derived from the mapped ones. The full list is in [DESIGN.md](../../DESIGN.md).
- A host whose own CSS uses ID selectors or `!important` on plain elements should mount the editor inside a shadow root. See [docs/spike.md](../../docs/spike.md).
- The package assumes a browser with native popovers, `:has()` and `light-dark()`. Only Chromium has been run so far.

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
- The toolbar part holds the title, the zoom control, undo and redo (while `session.view.editable` is true), the read-only badge (while it is not) and, when you pass `{ hintId }`, a screen-reader hint with that id for a view's `aria-describedby`. Its row scrolls sideways when your element is narrower than its controls. Undo and redo are the session's `undo()` and `redo()`.
- Selection and the insertion point live in the session, not in a part: `session.selection` holds note ids and `session.insertionPoint` a tick, and neither is in the history. A voice track draws them and takes the clicks and taps. The editing keys (Delete, Backspace, Ctrl or Cmd plus Z, Ctrl or Cmd plus Shift plus Z, Ctrl plus Y, Left, Right, Home, End) are heard by a part while the focus is inside it; a part that handles one keeps it from the browser, and a part given `{ onRefused }` hears the diagnostics of a refused command. Left and Right keep scrolling while there is no insertion point; Home and End always place one.
- Not tied to the DOM: `handleEditingInput(session, input)` takes a key, a click on a note or a click on empty space as plain data and does what the parts do, so a host with its own input handling can reuse it. It returns `{ handled, refused }`.
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

const every: ToolParameter = { name: "every", type: "number", min: 1, max: 8, default: 2 };

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

MIT licensed.

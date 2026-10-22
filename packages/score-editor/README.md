# @neta-art/score-editor

A browser score editor for song projects. A host app mounts it onto an element, maps its own theme through CSS variables, and receives one-time messages through a callback. No framework is exposed.

Work in progress: today the package shows a song project's score as a read-only arrangement: a ruler with bar numbers, section bands, key and meter marks, a chord track, and one piano-roll track per voice, with zoom and scrolling. Editing arrives in a later version.

```ts
import { createDialectRegistry, mount } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const editor = mount(element, {
  language: "en", // "zh" or "en"
  project, // a SongProject: the score text and the model ID are read
  dialects: createDialectRegistry([song2Dialect]), // the formats this editor can read
  notify: (notice) => showToast(notice.message), // already in the current language; no message exists yet
});

editor.update({ project: nextProject }); // only the given keys change; language-only changes keep the view
editor.destroy(); // removes every listener, node and stylesheet it added
```

- A score that cannot be read shows the dialect's diagnostics in the interface language instead of the view. A project whose model has no dialect in the registry shows one short sentence.
- `editable` (default `true`) has no effect on what can be done yet: the view is read-only either way, and `editable: false` shows a read-only badge.
- Importing the package runs nothing that touches the DOM, so a server render can import it. `mount` and the view parts' mount functions need a browser and throw a clear error elsewhere; call them from client-side code. `createEditingSession` needs none.
- The edit layer is dialect-agnostic: `applyScoreCommand(dialect, text, command)` and `applyProjectCommand(dialect, project, command)` apply one command to the shared score model, write it with the dialect, and run `dialect.check`. A failure returns a diagnostic and changes nothing.
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
  mountVoiceTrack,
  mountZoomControl,
} from "@neta-art/score-editor";

const session = createEditingSession({
  project,
  dialects: createDialectRegistry([song2Dialect]),
  language: "en",
});

const parts = [
  mountZoomControl(toolbarElement, session),
  mountTimeRuler(rulerElement, session),
  mountChordTrack(chordsElement, session),
  mountVoiceTrack(vocalElement, session, { voice: "Vocal" }),
];

const done = session.dispatch({ type: "toRest", noteId }); // { ok, project, diagnostics }: a refused command returns the project it left untouched
session.undo(); // the whole project before that command
const stop = session.subscribe((change) => save(session.project)); // change.cause: "dispatch", "undo", "view", ...

for (const part of parts) part.destroy(); // each removes its own listeners, nodes and share of the stylesheet
stop();
```

- The session is headless: it touches no DOM, so it runs in Node and in a worker. `dispatch` applies a command through `applyProjectCommand`; a refused command changes nothing and returns its diagnostics. The history keeps whole song projects. Selection (note ids), insertion point, zoom, scroll and language are not in the history. `replaceProject` starts a new document from outside, the way `update({ project })` does.
- Parts: `mountZoomControl`, `mountCutNotice`, `mountProblemView`, `mountTimeRuler`, `mountChordTrack` and `mountVoiceTrack(el, session, { voice })`. Each returns `{ destroy() }`, and a second `destroy` does nothing. Each part is styled and isolated as `mount` is, and the zoom menu uses the popover layer; the decisions are in [docs/spike.md](../../docs/spike.md).
- The ruler, the chord track and a voice track scroll in time on their own element, each by its own width. Each is a named region that Tab reaches, and the plus and minus keys zoom around the middle of the one that has the focus. Pass `{ scroller }` as the last argument to put several of them in one scroller of your own, as `mount` does. A part mounted late starts at the session's zoom and scroll.
- `mount` builds one session and assembles these parts in a toolbar, a scroller and a problem view; its options and what `update` does are unchanged.

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

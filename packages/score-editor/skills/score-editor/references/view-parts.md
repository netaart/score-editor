# View parts

Use view parts when the host wants its own layout: a toolbar at the top, one track beside the score, a ruler in a
sticky header, or only the tracks and none of the controls. A part mounts on an element the host placed, binds to one
editing session, draws from what the session holds, and redraws from its notifications. It never reads another part
and never reaches into the default editor.

Every part returns a `ViewPart`: `{ destroy() }`. `destroy` removes every node, listener and style sheet the part
added; calling it twice is harmless.

## The parts

| Function | Draws | Options |
| --- | --- | --- |
| `mountToolbar(el, session, options?)` | The title, the zoom controls and, while the session is editable, the undo, redo and Delete buttons; the read-only badge while it is not. | `ToolbarOptions` |
| `mountZoomControl(el, session)` | The zoom-out, readout/menu and zoom-in buttons. Hidden while the session has no readable score. | — |
| `mountCutNotice(el, session)` | The one sentence saying the score text stops before the song does, or nothing. | — |
| `mountProblemView(el, session)` | Why there is no score to show: the dialect's diagnostics, or the model with no dialect. | — |
| `mountTimeRuler(el, session, options?)` | Bar numbers, section bands, and key/meter/cut marks. | `AxisPartOptions` |
| `mountChordTrack(el, session, options?)` | Each chord at the position the score gives it, or one "no chords" line. | `AxisPartOptions` |
| `mountVoiceTrack(el, session, options)` | One voice's piano roll: head, pitch column, grids and notes. | `VoiceTrackOptions` |
| `mountSynthPreview(el, session)` | The synth preview control: a Preview / Stop button and the caption that says the sound is synthetic. Shown in read-only mode too. | — |

`AxisPartOptions` is `{ scroller?: HTMLElement, onRefused? }`. `VoiceTrackOptions` extends it with `voice: string`, the
voice name the dialect declares (for `song2`, `"Vocal"` or `"Ins"`). `ToolbarOptions` is `{ hintId?: string, onRefused?, synthPreview?: boolean }`:
`hintId` gives the screen-reader hint, a sentence naming the editing keys, an id for a view's `aria-describedby` (without
it the toolbar draws no hint); `onRefused` is described under editing below. The toolbar's row scrolls sideways when its
element is narrower than its controls, so every control can still be reached.

## How the parts share the time axis

The ruler, the chord track and each voice track draw on the session's zoom and horizontal scroll. Without `scroller`
each axis part is its own scroll surface, as wide as the host's element, and a scroll or a zoom gesture on it moves
the session, so the other parts follow. Pass the same `scroller` to several parts to make them share one scroll
surface of the host's, as the default editor does.

A part mounted after the user already zoomed or scrolled starts at the session's current zoom and scroll. A part
whose score does not have its voice draws nothing; a voice with only rests still draws its empty track. A model with no
dialect leaves the axis parts empty while the problem view explains it.

## Editing in the parts

Use this when the user should fix a note in the host's own layout: pick it, turn it into a rest, take that back. The
parts do it while `session.view.editable` is true, which is the default; while it is false they only show the score, with
no control, no selection and no keys, and the toolbar shows the read-only badge. Selection and the insertion point are
the session's (`session.selection`, `session.insertionPoint`), so every part shows the same ones. A phone has no keyboard,
so every action has a pointer or touch path too.

| The user | Where | What happens |
| --- | --- | --- |
| Clicks or taps a note | A voice track | Selects it; a tied chain is selected as a whole. |
| Clicks or taps empty lane space | A voice track | Puts the insertion point on the nearest beat line, and clears the selection. |
| Presses Tab, then Left and Right, Home and End, Enter or Space | The notes of a voice track | The notes are one tab stop. With a note in focus, Left and Right step to the neighbour and select it, Home and End go to the first and last, Enter or Space selects the one in focus. |
| Presses Left, Right, Home or End with the focus elsewhere in a part | Any time-axis part | Moves the insertion point; Left and Right keep scrolling while there is none. |
| Presses Delete or Backspace, or the Delete button | A part that hears the key; the toolbar | Turns every selected pitched note into a rest as one history step. The button is muted until a pitched note is selected. |
| Presses Ctrl or Cmd plus Z, plus Shift for redo, Ctrl plus Y, or the undo and redo buttons | A part that hears the key; the toolbar | Moves one history step. |

Keys are heard by a part while the focus is inside it; a part that handles one keeps it from the browser. Each part
also keeps one polite live region (`role="status"`, visually hidden) and says in the session's language what happened:
a voice track says which of its own notes were selected, deleted, or brought back by an undo; the track of the score's
first voice says where the insertion point moved; a part that heard a refused edit says why and where. No part reads
another part, so a part mounted alone speaks for what it draws and nothing else.

The score may refuse an edit, for example a tied note whose rest would turn a cut score into a complete one. Nothing
changes, and the part that heard the key or press calls its `onRefused(diagnostics)` with the `Diagnostic`s;
`formatDiagnostic` turns one into a sentence that ends with the bar and beat. Without `onRefused` the part still says it
in its live region.

```ts
const session = createEditingSession({ project, dialects, language: "en" }); // editable by default

const onRefused = (diagnostics: ReadonlyArray<Diagnostic>) => showToast(formatDiagnostic(diagnostics[0]!, "en"));
mountToolbar(document.querySelector(".toolbar")!, session, { hintId: "score-hint", onRefused });
mountVoiceTrack(document.querySelector(".vocal")!, session, { voice: "Vocal", onRefused });

session.setView({ editable: false }); // every part follows: no control, no selection, no keys
```

## Usage

```ts
import {
  createDialectRegistry,
  createEditingSession,
  mountChordTrack,
  mountCutNotice,
  mountProblemView,
  mountTimeRuler,
  mountToolbar,
  mountVoiceTrack,
} from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const session = createEditingSession({
  project,
  dialects: createDialectRegistry([song2Dialect]),
  language: "en",
});

// The host's own markup: <div class="toolbar"></div>, <div class="roll"></div>, and so on.
const scroller = document.querySelector<HTMLElement>(".roll")!;
const parts = [
  mountToolbar(document.querySelector(".toolbar")!, session),
  mountCutNotice(document.querySelector(".notices")!, session),
  mountTimeRuler(document.querySelector(".ruler")!, session, { scroller }),
  mountChordTrack(document.querySelector(".chords")!, session, { scroller }),
  mountVoiceTrack(document.querySelector(".vocal")!, session, { voice: "Vocal", scroller }),
  mountVoiceTrack(document.querySelector(".ins")!, session, { voice: "Ins", scroller }),
  mountProblemView(document.querySelector(".problems")!, session),
];

// Later, when the host tears the layout down:
for (const part of parts) part.destroy();
```

Each part keeps the isolation `mount` gives: its root is `div.sce-root.sce-part`, it carries the host's theme context
and reset, and it is a stacking context of its own. The package's style sheet is added once per document (or shadow
root) and removed when the last part that needs it is destroyed. Host CSS does not reach in through plain element
rules; see [theme.md](theme.md).

## Writing a view of your own

A custom view needs no special base class. Read `session.project`, `session.reading`, `session.selection`,
`session.view` and the other members described in [editing-session.md](editing-session.md); subscribe with
`session.subscribe`; redraw only the parts of the DOM whose state changed; and return a `destroy` that unsubscribes
and removes what you added. Public classes and variables are only the `sce-` and `--sce-` names documented here and in
[theme.md](theme.md); everything else is private.

## Taking the user's input in a view of your own

Use `handleEditingInput` when a view of your own should answer the keys and clicks the way the parts do, without the
parts' DOM. It takes one `EditingInput` as plain data and does what a part does with it to the session:

```ts
type EditingInput =
  | { type: "key"; key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }
  | { type: "click-note"; noteId: string }
  | { type: "click-empty"; tick: number } // a position on the time axis, not necessarily whole
  | { type: "delete" }; // what a Delete control sends; it does what the Delete key does

function handleEditingInput(session: EditingSession, input: EditingInput): EditingInputResult;
```

`EditingInputResult` is `{ handled: boolean, refused: ReadonlyArray<Diagnostic> }`. `handled` says the input meant
something here, so keep the browser from also acting on it; `refused` holds the diagnostics of an edit the score would
not take, and nothing changed. While `session.view.editable` is false nothing is handled.

```ts
view.addEventListener("keydown", (event) => {
  const { handled, refused } = handleEditingInput(session, {
    type: "key",
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  });
  if (handled) event.preventDefault();
  if (refused.length > 0) showProblems(refused);
});
```

## The synth preview

Use this when a person should hear the score: a rough rendering of the melody and chords made in the page by
oscillators, with a playhead. It makes no network request and needs no sample library. It is not the finished song, and
the control says so beside itself, in the session's language ("Synthetic preview, not the final sound").

| Export | What it is |
| --- | --- |
| `mountSynthPreview(el, session)` | A view part: a Preview / Stop button with its caption. Shown in read-only mode too; hidden only while the session has no readable score. |
| `previewPlayer(session)` | The session's one `PreviewPlayer`: `playing`, `tick`, `from`, `start()`, `stop()`, `subscribe(listener)`. |
| `previewNote(midi, options?)` | One pitch for a short time, for a view that sounds a note as the user picks or draws it. Takes `PreviewNoteOptions`, `{ duration? }` in seconds. |

`mountToolbar` holds the same control by default, after the read-only badge. Mount `mountSynthPreview` yourself, and
pass `{ synthPreview: false }` in `ToolbarOptions`, when the host wants the control in a place of its own.

```ts
import { mountSynthPreview, mountToolbar, mountVoiceTrack, previewNote, previewPlayer } from "@neta-art/score-editor";
import type { PreviewStart } from "@neta-art/score-editor";

mountToolbar(toolbarEl, session, { synthPreview: false });
mountSynthPreview(transportEl, session); // the control, with its caption
mountVoiceTrack(vocalEl, session, { voice: "Vocal" }); // draws the playhead by itself, from the player

const player = previewPlayer(session);
const unsubscribe = player.subscribe(() => console.log(player.playing, player.tick)); // after every frame it moves in
button.addEventListener("click", async () => {
  const result: PreviewStart = await player.start(); // "started" | "nothing-to-play" | "unsupported" | "blocked" | "cancelled"
  if (result === "blocked") showHint("The browser did not allow sound.");
});
noteEl.addEventListener("pointerdown", () => void previewNote(64)); // true once it sounded; false without Web Audio
```

- The preview plays `Vocal`, `Ins` and the chord of each span, from the insertion point, or from the start when there
  is none or the session is not editable. Tempo and meter are the score's own. It stops at the end of the music, when
  the project changes, when Escape is pressed, when the browser interrupts the audio, and when an `<audio>` or `<video>` element in the page's
  document starts playing. It does not pause sound the page already plays.
- Start sound only inside a user gesture: call `player.start()` and `previewNote()` synchronously from a click, tap or
  key handler, before any `await`. A browser that refuses gives `"blocked"` from `start()` and `false` from
  `previewNote()`; one with no Web Audio gives `"unsupported"` and `false`. `previewNote` throws a `RangeError` for a pitch
  that is not a whole number from 0 to 127. All sound shares one audio context, which is suspended when nothing plays.
- The player holds the playback position; the session's `view` does not, because the position changes every frame and
  the view state is for what parts share and notify on. Voice tracks bound to the session subscribe to the player and
  draw the playhead; a view of your own does the same with `player.tick`, which is a tick of the score and is null while
  nothing plays. `PreviewStart` is the string union `start()` resolves.
- `previewPlayer(session)` touches no audio until `start()`. Destroying the last control that holds the player stops it.
- The headless half, `schedulePreview`, is in [headless-layer.md](headless-layer.md#the-preview-schedule).

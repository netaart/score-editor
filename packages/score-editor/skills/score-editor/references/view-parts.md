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
| `mountToolbar(el, session, options?)` | The title, the zoom controls and, while the session is editable, the undo, redo and Delete buttons, the Select menu and the Grid menu; the read-only badge while it is not. | `ToolbarOptions` |
| `mountZoomControl(el, session)` | The zoom-out, readout/menu and zoom-in buttons. Hidden while the session has no readable score. | — |
| `mountCutNotice(el, session)` | The one sentence saying the score text stops before the song does, or nothing. | — |
| `mountProblemView(el, session)` | Why there is no score to show: the dialect's diagnostics, or the model with no dialect. | — |
| `mountTimeRuler(el, session, options?)` | Bar numbers, section bands, and key/meter/cut marks. | `AxisPartOptions` |
| `mountChordTrack(el, session, options?)` | Each chord at the position the score gives it, or one "no chords" line. | `AxisPartOptions` |
| `mountVoiceTrack(el, session, options)` | One voice's piano roll: head, pitch column, grids and notes. | `VoiceTrackOptions` |
| `mountTextView(el, session)` | The score text in a box with line numbers, a status sentence, and the problems of text that cannot be read. | — |
| `mountStaffView(el, session)` | The score drawn on a staff by abcjs, read-only; returns a `StaffViewPart` whose `setPlayPosition` draws the host player's cursor. | — |
| `mountStaleNotice(el, session)` | One sentence while the text view holds text the project did not take, or nothing. | — |
| `mountViewSwitch(el, session)` | Three buttons, one for each of `VIEW_NAMES`, that set `session.activeView`. | — |
| `mountSynthPreview(el, session)` | The synth preview control: a Preview / Stop button and the caption that says the sound is synthetic. Shown in read-only mode too. | — |
| `mountFilterPanel(el, session)` | The Filter button and its panel for selecting notes by condition (see [Selecting by filter](#selecting-by-filter)). Shown in read-only mode too. | — |
| `mountLyricTrack(el, session, options?)` | The lyric lines as phrase blocks over their bars, each with its syllable count over its note-start count (green when equal, yellow with a broken line when not), the syllables on their notes when equal, and the lines that are not on bars listed under the lane. While the session is editable: the edits of a line (see The lyric track). | `AxisPartOptions` |
| `mountDraftConflict(el, session, keeper)` | The strip that says the draft was changed in another window, with "Overwrite with my version" and "Load the other version"; hidden unless `keeper.status` is `"conflict"`. | a `DraftKeeper` |

`AxisPartOptions` is `{ scroller?: HTMLElement, onRefused? }`. `VoiceTrackOptions` extends it with `voice: string`, the
voice name the dialect declares (for `song2`, `"Vocal"` or `"Ins"`). `ToolbarOptions` is `{ hintId?: string, onRefused?, viewSwitch?: boolean, synthPreview?: boolean, draftKeeper?: DraftKeeper }`:
`hintId` gives the screen-reader hint, a sentence naming the editing keys, an id for a view's `aria-describedby` (without
it the toolbar draws no hint); `onRefused` is described under editing below; `viewSwitch` adds the view
switch before the preview control (so a control that comes and goes with the score cannot move the switch), names the shown view in the title, and leaves out the controls that only mean something on the arrangement
(zoom and Delete) while another view is shown; `draftKeeper` binds the toolbar to a draft keeper (see [drafts.md](drafts.md)), so that it
offers Restore original while the keeper is ready or in conflict and the session is editable, and its badge says "Opening draft…"
while the keeper is still opening. The toolbar's row wraps when its element is narrower than its controls
if it holds the preview control or the switch (the read-only badge and the switch go together to a line of their own, and the
preview control and its caption take the line after it), or scrolls sideways when it holds neither, so every
control can still be reached.

## The text view, the staff view and the view switch

The default editor shows one of three views of the same project: the arrangement of tracks, the staff, or the score
text. `session.activeView` says which; the view switch sets it, also while the session is read-only, since it changes
what is shown and not the score. A host with its own layout shows and hides its own containers from `activeView`, and
mounts the parts it wants on them.

The text view is the one place where a person writes the score as text. A pause of 600 ms in typing, or leaving the
box, checks the text with `session.checkScoreText`. Text that reads is dispatched as one `replaceScoreText` step (a notice such as `melody-with-chords` does not stop it; the notice is shown under the status sentence, apart from the problems), so
one burst of typing is one undo step, and the toolbar's undo and redo move over those steps; inside the box the
browser's own Ctrl or Cmd plus Z undoes typing. Text that does not read stays in the box, its problems are listed
with the line each is on (a press on one selects that line in the box), the session is told with `setRejectedText`, and the
project keeps the last score that read. The views that draw the project then show that score, and the stale notice
above them says so. A read-only session gives a read-only box.

The staff view draws `session.project.score` with abcjs, which the part loads with a dynamic `import()` when it is
mounted: importing the package loads none of it, and `abcjs` is the package's one runtime dependency. Until it
arrives the part says it is loading; if it cannot be loaded the part says so and the other parts go on working. The
drawing sits in a shadow root of its own inside the part, so the host's CSS for `svg`, `text` and `path` does not
reach it and it adds no rule to the page. It takes the colour of the part's text. The drawing is never narrower than
240px; in a narrower box the part scrolls inside its own region and not the page. A score that cannot be read is not drawn.

`mountStaffView` returns a `StaffViewPart`: the usual `destroy()` plus `setPlayPosition(seconds | null)`. A host
player calls it with the time of its own playback, or with null to remove the cursor; the part turns seconds into a
tick with `tickAtSeconds`, following a tempo change in the score and staying at the end past the last second. The
cursor is drawn whether or not the session is editable. While the session's preview plays, the same cursor follows
the player's tick; when it stops, the host's last position is shown again. A press on a drawn note starts the preview
at that note. The cursor's look and the scroll that keeps it in view are in [DESIGN.md](../../../DESIGN.md#staff-view).

```ts
const views = {
  arrangement: document.querySelector<HTMLElement>(".roll")!,
  staff: document.querySelector<HTMLElement>(".staff")!,
  text: document.querySelector<HTMLElement>(".text")!,
};
const staff = mountStaffView(views.staff, session); // asks for abcjs now
const parts = [
  mountViewSwitch(document.querySelector(".views")!, session),
  mountStaleNotice(document.querySelector(".stale")!, session),
  mountTextView(views.text, session),
  staff,
];
staff.setPlayPosition(12.5); // the host player's seconds, or null to take the cursor away
const show = () => {
  for (const name of VIEW_NAMES) views[name].hidden = name !== session.activeView;
};
session.subscribe((change) => change.cause === "active-view" && show());
```

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
so every action has a pointer or touch path too; select all and invert are the exception, which the parts give no touch
control (a control of your own can send `select-all` and `invert-selection` to `handleEditingInput`).

| The user | Where | What happens |
| --- | --- | --- |
| Clicks or taps a note | A voice track | Selects it; a tied chain is selected as a whole. |
| Clicks or taps empty lane space | A voice track | Puts the insertion point on the nearest line of the grid (`session.grid`), and clears the selection. |
| Holds Shift while clicking or tapping a note | A voice track | Adds the note to the selection, or takes it and its tied chain out; on empty space nothing happens. |
| Presses on empty lane space with a mouse and drags | A voice track | Draws a box. The notes it touches are framed while it is open and selected when it is let go; Shift at the press adds; Escape gives it up. |
| Rests a finger on empty lane space for about 0.4 s, then slides | A voice track | Draws the same box (a swipe that starts at once still scrolls). Resting a finger on a note toggles it, as Shift does. |
| Presses a key | A part that hears the key | [The key map](../../../../../DESIGN.md#moving-and-resizing) gives each key with a note selected and with none. A part that handles one keeps it from the browser. |
| Presses on a selected note and drags, by its body or by an edge | A voice track | [Moving and resizing](../../../../../DESIGN.md#moving-and-resizing) gives the edges, the ghost and the landing. One drag sends one `move-notes` or `resize-notes` input, one history step; Escape gives it up. |
| Chooses an item of the Select or Grid menu | The toolbar | The selection actions, and the grid step with which notes move, resize and land. Both are also on the keys of the map above. The grid is UI state, not an undo step. |

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

## The lyric track

`mountLyricTrack` is the bottom track of the arrangement in the default editor, and a part like the others: it follows the
session's zoom, scroll and language, and takes `{ scroller?, onRefused? }`. A phrase block says its counts in words for a
screen reader ("equal" or "differ"), not only in colour. Lines that are not on bars, or whose phrase no longer fits the
score, are listed under the lane and counted.

While `session.view.editable` is true the lines can be edited, each action as one command (or one `session.dispatchAll`
list) and one undo step, and a refusal is said in the part's live region and sent to `onRefused`; the actions, gestures
and keys are in [DESIGN.md](https://github.com/netaart/score-editor/blob/main/DESIGN.md#lyric-track).

A finger's slide on empty track space scrolls; only a handle or a grip starts a drag, and no long press is needed. A
host that draws its own lyric view reuses the rules the track uses, with no DOM (see the headless layer: `lyricRows`,
`lyricBoundaryPlan`, `lyricDropPlan`, `lyricSplitCommand`).

```ts
import { mountLyricTrack } from "@neta-art/score-editor";

mountLyricTrack(document.querySelector(".lyrics")!, session, { onRefused }); // its own scroll surface, like a voice track
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
  VIEW_NAMES,
  mountStaffView,
  mountStaleNotice,
  mountTextView,
  mountViewSwitch,
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
  | { type: "delete" } // what a Delete control sends; it does what the Delete key does
  | { type: "move-notes"; timeTicks: number; semitones: number } // a drag of the selection: ticks are snapped to session.grid
  | { type: "resize-notes"; edge: "start" | "end"; timeTicks: number } // a drag of one edge of the selection, snapped to session.grid
  | { type: "toggle-note"; noteId: string } // a click on a note with Shift held
  | { type: "select-notes"; noteIds: ReadonlyArray<string>; add?: boolean } // a box: select these, or add them
  | { type: "select-all" } // Ctrl or Cmd plus A
  | { type: "invert-selection" } // Ctrl or Cmd plus Shift plus A
  | { type: "clear-selection" }; // Escape

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
  is none or the session is not editable. The one tempo and each bar's meter are the score's own. It stops at the end of the music, when
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

## Tempo, key and the song project panel

`mountToolbar` takes `tempoKey` for the four song controls (tempo, key, transpose down and transpose up), there while
the session is editable and its score reads, and `projectPanel` for the Project button that opens the panel; `mount`
turns both on. The behaviour, the rules and the controls are in
[the package README](../../../README.md#tempo-key-and-the-song-project-panel),
[DESIGN's tempo and transpose section](../../../../../DESIGN.md#tempo-key-and-transpose) and
[its panel section](../../../../../DESIGN.md#song-project-panel).

A host that wants the panel somewhere of its own mounts it and leaves `projectPanel` off; it gets a `ProjectPanel`,
whose `commit()` takes a field that has not been let go and whose `destroy()` changes no document:

```ts
import { mountProjectPanel, mountToolbar } from "@neta-art/score-editor";

mountToolbar(toolbarEl, session, { tempoKey: true, onRefused });
const panel = mountProjectPanel(panelEl, session, { onRefused }); // a ProjectPanel
```

## Selecting by filter

Use this when a person should pick notes by condition instead of by pointing: a Filter button that opens a panel named
"Select by filter" ("筛选选中"). The logic is `filterNotes`, which is in
[headless-layer.md](headless-layer.md#picking-notes-by-conditions); this part is its form.

| Export | What it is |
| --- | --- |
| `mountFilterPanel(el, session)` | A view part: a button labelled "Filter" ("筛选") and its panel. Returns a `ViewPart`. |

`mountToolbar` mounts it by default, last in its row. Mount it yourself on an element of your own when the toolbar is
not used; there is no option to leave it out.

```ts
import { mountFilterPanel, mountVoiceTrack } from "@neta-art/score-editor";

mountFilterPanel(filterEl, session); // the button, and the panel it opens
mountVoiceTrack(vocalEl, session, { voice: "Vocal" }); // draws what the panel selected
```

- The panel is a native popover (top layer) with a row for each condition: Pitch (lowest and highest note), Time (first and
  last bar), Length (shortest and longest note value, a part of a whole note), Key (in or out of the key) and Count (one in
  every N of each voice, after skipping the first M), then Invert, a status line and the buttons Re-apply and Done. Each row
  has a checkbox that says whether the condition counts. The conditions combine with "and".
- Changing a field turns its condition on and selects at once, through `session.select`. Re-apply selects again from the
  conditions the panel holds, against the score as it is now. A selection made through the panel is not a history step. The
  panel's own rules (an empty filter, Invert, its status line) are in [DESIGN.md](../../../../DESIGN.md#filter-panel); what the pure filter
  means is in [headless-layer.md](headless-layer.md#picking-notes-by-conditions).
- The panel holds the conditions of its last selection, so it shows them again when it is opened. Its status line is a
  polite live region that says the result, or that the score or the selection has changed since (Re-apply selects again).
- It selects through `session.select`, so it works while `session.view.editable` is false; the arrangement draws no
  selection frame then, and the status line is what shows the result.
- It is there while the score reads and the arrangement is the view shown; otherwise the button is hidden and an open panel
  closes. On a phone (a coarse pointer and a window at most 640 px wide) the panel is a sheet from the bottom edge;
  elsewhere it hangs from its button, over it when there is no room below.
- Its texts follow `session.view.language` and are part of this part, not of the host's message catalogue.

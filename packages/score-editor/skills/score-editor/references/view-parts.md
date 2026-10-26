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
| `mountToolbar(el, session, options?)` | The title, the zoom controls and, while the session is editable, the undo, redo and Delete buttons, the Select and Grid menus, the Bars menu and the meter control; the read-only badge while it is not. Returns a `ToolbarPart`, whose `setTools` replaces the Tools panel's host tools. | `ToolbarOptions` |
| `mountZoomControl(el, session)` | The zoom-out, readout/menu and zoom-in buttons. Hidden while the session has no readable score. | — |
| `mountCutNotice(el, session, options?)` | The one sentence saying the score text stops before the song does, and, on an incomplete bar, Fill with rests and Delete the incomplete bar; nothing on a complete score. | `onRefused?` |
| `mountProblemView(el, session)` | Why there is no score to show: the dialect's diagnostics, or the model with no dialect. | — |
| `mountTimeRuler(el, session, options?)` | Bar numbers that choose their bar, the chosen run, section bands, and key/meter/cut marks. | `AxisPartOptions` |
| `mountChordTrack(el, session, options?)` | Each chord at the position the score gives it, or one "no chords" line; while the session is editable, a press places, changes or removes a chord (see editing below). | `AxisPartOptions` |
| `mountVoiceTrack(el, session, options)` | One voice's piano roll: head, pitch column, grids and notes. | `VoiceTrackOptions` |
| `mountTextView(el, session)` | The score text in a box with line numbers, a status sentence, and the problems of text that cannot be read. | — |
| `mountStaffView(el, session)` | The score drawn on a staff by abcjs, read-only; returns a `StaffViewPart` whose `setPlayPosition` draws the host player's cursor. | — |
| `mountStaleNotice(el, session)` | One sentence while the text view holds text the project did not take, or nothing. | — |
| `mountViewSwitch(el, session)` | Three buttons, one for each of `VIEW_NAMES`, that set `session.activeView`. | — |
| `mountSynthPreview(el, session)` | The synth preview control: a Preview / Stop button and the caption that says the sound is synthetic. Shown in read-only mode too. | — |
| `mountToolPanel(el, session, options?)` | The Tools button and its panel: every registered tool, grouped, with a control per declared parameter, a preview and Apply (see [The Tools panel](#the-tools-panel)). Hidden while the session is read-only or another view is shown. | `ToolPanelOptions` |
| `mountFilterPanel(el, session)` | The Filter button and its panel for selecting notes by condition (see [Selecting by filter](#selecting-by-filter)). Shown in read-only mode too. | — |
| `mountLyricTrack(el, session, options?)` | The lyric lines as phrase blocks over their bars, each with its syllable count over its note-start count (green when equal, yellow with a broken line when not), the syllables on their notes when equal, and the lines that are not on bars listed under the lane. While the session is editable: the edits of a line (see The lyric track). Returns a `LyricTrackPart`, whose `focusEntry()` opens a new line's editor and focuses its text box. | `AxisPartOptions` |
| `mountDraftConflict(el, session, keeper)` | The strip that says the draft was changed in another window, with "Overwrite with my version" and "Load the other version"; hidden unless `keeper.status` is `"conflict"`. | a `DraftKeeper` |

`AxisPartOptions` is `{ scroller?: HTMLElement, onRefused? }`. `VoiceTrackOptions` extends it with `voice: string`, the
voice name the dialect declares (for `song2`, `"Vocal"` or `"Ins"`). `ToolbarOptions` is `{ hintId?: string, onRefused?, viewSwitch?: boolean, synthPreview?: boolean, draftKeeper?: DraftKeeper, tempoKey?: boolean, projectPanel?: boolean, pencil?: boolean, tools?: ScoreTool[], onChooseBars?: (bar: number) => void }`; `mountToolbar` returns a `ToolbarPart`, whose `setTools(tools)` replaces the Tools panel's host tools and whose `openProject(field?)` opens the Project panel on a field. The options are:
`hintId` gives the screen-reader hint, a sentence naming the editing keys, an id for a view's `aria-describedby` (without
it the toolbar draws no hint); `onRefused` is described under editing below; `viewSwitch` adds the view
switch before the preview control (so a control that comes and goes with the score cannot move the switch), names the shown view in the title, and leaves out the controls that only mean something on the arrangement
(zoom and Delete) while another view is shown; `draftKeeper` binds the toolbar to a draft keeper (see [drafts.md](drafts.md)), so that it
offers Restore original while the keeper is ready or in conflict and the session is editable, and its badge says "Opening draft…"
while the keeper is still opening; `tools` (an array, possibly empty) adds the Tools button and its panel before the Filter button, with the built-in note tools always listed; `tempoKey` adds the tempo, key and transpose group and `projectPanel` adds the Project button; `pencil` adds the pencil after Delete; `onChooseBars` receives the bar the Bars menu chose, so a host that mounts a ruler can put the focus on it. The toolbar's row wraps when its element is narrower than its controls
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

The staff view draws the score with abcjs, which the part loads with a dynamic `import()` when it is
mounted: importing the package loads none of it, and `abcjs` is the package's one runtime dependency. The dialect may
give the score a `drawingText`; the staff reads that when it is there, and `song2` uses it to draw each `Z2`–`Z4` run as
separate one-bar rests while the project text keeps the run. Until abcjs
arrives the part says it is loading; if it cannot be loaded the part says so and the other parts go on working. The
drawing sits in a shadow root of its own inside the part, so the host's CSS for `svg`, `text` and `path` does not
reach it and it adds no rule to the page. It takes the colour of the part's text. The drawing is never narrower than
240px; in a narrower box the part scrolls inside its own region and not the page. A score that cannot be read is not drawn.

`mountStaffView` returns a `StaffViewPart`: the usual `destroy()` plus `setPlayPosition(seconds | null)`. A host
player calls it with the time of its own playback, or with null to remove the cursor; the part turns seconds into a
tick with `tickAtSeconds`, following a tempo change in the score and staying at the end past the last second. The
cursor is drawn whether or not the session is editable. While the session's preview plays, the same cursor follows
the player's tick; when it stops, the host's last position is shown again. A press on a drawn note starts the preview
at that note. The cursor brings itself into the staff's region, never the page, so a host that wants it followed
keeps the region in view. The cursor's look and the scroll that keeps it in view are in [DESIGN.md](../../../DESIGN.md#staff-view).

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
the session's (`session.selection`, `session.insertionPoint`), and the chosen run of bars is `session.barSelection`, so every part shows the same ones. The toolbar's Bars menu inserts at the insertion point and deletes `session.barSelection`; its meter control changes the section of the first chosen bar, else of the insertion point's bar, using the meters the dialect's constraints allow. A phone has no keyboard,
so every action has a pointer or touch path too; select all and invert are the exception, which the parts give no touch
control (a control of your own can send `select-all` and `invert-selection` to `handleEditingInput`).

| The user | Where | What happens |
| --- | --- | --- |
| Clicks or taps a note | A voice track | Selects it; a tied chain is selected as a whole. |
| Clicks or taps empty lane space | A voice track | Puts the insertion point on the nearest line of the grid (`session.grid`), and clears the selection. |
| Clicks or taps a bar number | The time ruler | Chooses that bar, or with Shift extends the chosen run to it. |
| Presses on a bar number and drags across the ruler | The time ruler | Chooses the run from the first bar to the bar under the pointer. |
| Taps one bar number and then another | The time ruler | Chooses the run from the first bar to the second. |
| Presses Left, Right, Home, End, Enter, Space or Escape with the focus on a chosen bar | The time ruler | Moves the chosen run one bar, extends it with Shift, goes to the first or last bar, chooses the focused bar, or clears the run. |
| Holds Shift while clicking or tapping a note | A voice track | Adds the note to the selection, or takes it and its tied chain out; on empty space nothing happens. |
| Presses on empty lane space with a mouse and drags | A voice track | Draws a box. The notes it touches are framed while it is open and selected when it is let go; Shift at the press adds; Escape gives it up. |
| Rests a finger on empty lane space for about 0.4 s, then slides | A voice track | Draws the same box (a swipe that starts at once still scrolls). Resting a finger on a note toggles it, as Shift does. |
| Presses a key | A part that hears the key | [The key map](../../../../../DESIGN.md#moving-and-resizing) gives each key with a note selected and with none. A part that handles one keeps it from the browser. |
| Presses on a selected note and drags, by its body or by an edge | A voice track | [Moving and resizing](../../../../../DESIGN.md#moving-and-resizing) gives the edges, the ghost and the landing. One drag sends one `move-notes` or `resize-notes` input, one history step; Escape gives it up. |
| Chooses an item of the Select or Grid menu | The toolbar | The selection actions, and the grid step with which notes move, resize and land. Both are also on the keys of the map above. The grid is UI state, not an undo step. |
| Clicks or taps the chord track, or the name of a chord | The chord track | Opens the chord picker at the nearest start of a note or rest in a voice that allows chords (for `song2`, `Vocal`), or at the chord pressed. It offers only the names `session.dialect.constraints.chords` and the grammar allow; Place, Change or Remove is one `setChord` and one history step. The frame and the picker's look are in [DESIGN.md](../../../../../DESIGN.md#chord-editing). |
| Presses Tab, then the chord track's keys | The chord track | The track has one tab stop, its cursor, first in the Tab order before the notes. It steps from start to start and from chord to chord, opens the picker, removes the chord under it and returns the focus to the cursor; the key list is in [DESIGN.md](../../../../../DESIGN.md#chord-editing). |

Keys are heard by a part while the focus is inside it; a part that handles one keeps it from the browser. Each part
also keeps one polite announcement region (`role="status"`, visually hidden) and says in the session's language what happened:
a voice track says which of its own notes were selected, deleted, or brought back by an undo; the chord track says the chord it placed, changed or removed, and what an undo or a redo did to a chord; the track of the score's
first voice says where the insertion point moved; the time ruler says which run of bars was chosen; the toolbar's Bars menu and the cut notice say what they changed, or why and where an edit was refused. The chord picker's
visible readout is a second live region inside the picker, as [DESIGN.md](../../../../../DESIGN.md#chord-editing) says. No part reads
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

A host that wants the panel somewhere of its own mounts it and leaves `projectPanel` off; it gets a `ProjectPanel`, whose `focus(field)` puts the focus on one of `"style"`, `"scoreMode"`, `"seed"` or `"lyrics"`,
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

`mountToolbar` mounts it by default, last in its row, after the Tools panel when the toolbar has one; the two are held to the row's right edge as one pair, so the Tools panel hangs from the right and leaves the arrangement in view for a preview. Mount it yourself on an element of your own when the toolbar is
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

## The Tools panel

Use this when a person should reach the built-in note tools and the host's own tools from the toolbar, set their
parameters, see the result before taking it, and undo it in one step. The tools themselves are pure functions, described
in [custom-tools.md](custom-tools.md); this part is the panel that draws and runs them.

| Export | What it is |
| --- | --- |
| `mountToolPanel(el, session, { tools? })` | A view part: a button labelled "Tools" ("工具"), the panel it opens, and the built-in note tools plus the host's. Returns a `ToolPanelPart`, whose `setTools` replaces the host's list. |
| `NOTE_TOOLS` | The built-in note tools as `ScoreTool`s, for a host that builds a registry of its own. |
| `TOOL_GROUPS`, `ToolGroup` | The four groups and the tools' group type. `"more"` is where a tool without a group is listed. |
| `ToolContext` | `{ grid, insertionPoint }`: every tool receives it as the fourth `commands` argument; a three-parameter function ignores it. |
| `ToolPanelOptions` | `{ tools?, onRefused? }`. |

```ts
import { mountToolPanel, NOTE_TOOLS } from "@neta-art/score-editor";

mountToolPanel(row, session, { tools: [myTool] }); // the built-in note tools and mine
mountToolPanel(row, session, { tools: [] }); // only the built-in note tools
```

- The panel lists the built-in note tools and the tools in `tools`, grouped as "Note tools", "Quantize", "Transform",
  "Generate", and "More tools"; a group with no tool is left out. Each tool row is a button; choosing it opens its
  parameter controls beneath it, one tool at a time.
- A control per declared parameter: a number field with `min`/`max`/`step`, a checkbox, a menu of a choice's `values`, a
  text field; each starts at its default. A parameter without a `label` shows its `name`. Changing a control previews
  again; the panel clamps nothing and shows a `tool-parameter` diagnostic in the status line when a value is refused.
- The preview is `session.previewTool`, so it changes no project and adds no history step. While it is shown the voice
  tracks draw the result's changed notes as dashed outlines at the place they would take, the same mark a drag makes;
  the status line says how many notes would change or that nothing would. The outlines end when the panel closes, the
  view changes, the session turns read-only, or the part is destroyed. They follow a change of parameter, selection,
  project or grid while the panel is open.
- Apply is one `session.runTool`, so one undo step. The status line says "Applied. One undo step."; a refusal leaves the
  project and the history alone, says why, and goes to `onRefused` (which `mount` turns into the host's notice). The
  panel stays open and does not preview the next run until another control, the selection or the grid changes, so a
  second press cannot silently undo the first.
- The button is an editing control: hidden while the session is read-only, while the score does not read, and while the
  staff or text view is shown. The panel is a native popover; on a coarse pointer at a window of at most 640 px it is a
  sheet from the bottom edge, at most 75% of the window's height. Its texts follow `session.view.language`.
- `mount` passes its `tools` option here; `mountToolbar` with `tools` mounts it in the toolbar row before the Filter
  button. A host that mounts the part itself puts it where it likes.

## The section menu

While the session is editable, each section band of the time ruler opens a menu: Rename (the unnamed music before the
first marker says "Name this section"), Start a section at a bar, Move earlier, Move later, Duplicate and Delete section. Each
choice is one command, so it is one undo step, and a screen reader hears what was done. A choice the commands would
refuse stays in the menu, muted, with the refusal's words under it; choices side by side that are refused in the same
words share one note. The two choices that need a name open a small form under the band; a name the commands refuse
stays in the form with the refusal under it, and the refusal also goes to `onRefused`. A read-only session draws the
bands and no menu.

Bands are not Tab stops: the Tab key walks from the Arrangement region straight to the notes. The section-menu keys
are in [DESIGN.md](../../../../../DESIGN.md#section-menu).

`sectionActions(session, section)` is the same answer for a control of your own: the six actions of one section, as
`SectionAction`s named by `SectionActionName` in the menu's order, each with the command that does it and `unavailable`, the
`Diagnostic` the command layer would refuse it with, or `null` while it can be done. `rename` and
`start` carry no command, because they need a name (and `start` a bar) first; send `renameSection` or `nameSection`
with it. It asks the commands without applying them, so the project, the history and the listeners are untouched.

```ts
import { formatDiagnostic, sectionActions } from "@neta-art/score-editor";

for (const action of sectionActions(session, 1) ?? []) {
  if (action.unavailable === null) {
    if (action.command !== null) button(action.name).onclick = () => session.dispatch(action.command);
  } else {
    mute(action.name, formatDiagnostic(action.unavailable, session.view.language));
  }
}
```


# @neta-art/score-editor

A browser score editor for song projects. A host app mounts it onto an element, maps its own theme through CSS variables, and receives one-time messages through a callback. No framework is exposed.

Work in progress: today the package shows a song project's score as an arrangement: a ruler with bar numbers, section bands, key and meter marks, a chord track, and one piano-roll track per voice, with zoom and scrolling. The first edits are in: select a note (by pointer or by keyboard), turn it into a rest with the Delete key or the Delete button, undo and redo, drop an insertion point on a beat line and move it with the keys, and open a menu on a section band to rename, move, copy or delete the section or start a new one at a bar. The score also has two more views, chosen by a switch at the end of the toolbar: the score on a staff, and the score text, which a person can edit as text. The rest of editing arrives in later versions.

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

- The toolbar ends with a switch of three views of the one project: the arrangement, the staff (drawn by abcjs, read-only) and the score text. Text that reads becomes the project's score as one undo step per burst of typing (after a pause of 600 ms, or when the box loses the focus), and the other views follow. Text that cannot be read stays in the box with its problems listed by line, the project keeps the last readable score, and a notice above the arrangement and the staff says they are behind the text. The switch works while the editor is read-only; the text box is then read-only too.
- A score that cannot be read shows the dialect's diagnostics in the interface language instead of the view. A project whose model has no dialect in the registry shows one short sentence.
- `editable` (default `true`) says whether the user may change the score. While it is true the toolbar has undo, redo, Delete and a Select menu (Select all, Invert selection, Clear selection), a click or tap selects a note or drops the insertion point, Shift with a click or tap, a box on empty space and a touch and hold pick several notes, Tab reaches the notes, and Delete (or Backspace), Ctrl or Cmd plus A, Ctrl or Cmd plus Shift plus A, Escape, Ctrl or Cmd plus Z, Ctrl or Cmd plus Shift plus Z, Ctrl plus Y, Left, Right, Home, End, Enter and Space, with Ctrl or Cmd on the four navigation keys and Shift on Enter and Space, act. While it is false none of that exists: no editing control, no selection frame, no insertion point, and the keys do nothing; the toolbar shows a read-only badge instead. `update({ editable })` switches it without remounting, and a selection made before comes back with it.
- A command the user's keys caused that the score would not take (the dialect refuses to write the result) changes nothing and reaches `notify` once as `{ code: "command-refused", level: "warning", message }`, in the interface language.
- `abcjs` is the package's one runtime dependency. It is loaded with `import()` when a staff view is first mounted, never when the package is imported, so a host that does not show the staff does not fetch it. The drawing sits in a shadow root of its own inside the part; see [DESIGN.md](../../DESIGN.md#staff-view).
- Importing the package runs nothing that touches the DOM, so a server render can import it. `mount` and the view parts' mount functions need a browser and throw a clear error elsewhere; call them from client-side code. `createEditingSession` needs none.
- The headless layer is dialect-agnostic: `applyScoreCommand(dialect, text, command)` and `applyProjectCommand(dialect, project, command)` apply one command to the shared score model, write it with the dialect, and run `dialect.check`. A refusal returns the input unchanged and one diagnostic.
- Styles: every class is prefixed `sce-`. The host maps its theme onto `--sce-color-bg`, `--sce-color-text`, `--sce-color-accent` and a few more; unmapped colours fall back to neutral defaults derived from the mapped ones. The full list is in [DESIGN.md](../../DESIGN.md).
- A host whose own CSS uses ID selectors or `!important` on plain elements should mount the editor inside a shadow root. See [docs/spike.md](../../docs/spike.md).
- The package assumes a browser with native popovers, `:has()` and `light-dark()`. Only Chromium has been run so far.

## Commands

`applyScoreCommand` takes one `ScoreCommand` and changes the score text; it refuses a `ProjectCommand`. `applyProjectCommand` takes a `ScoreCommand` or a `ProjectCommand`, the one-word name of the second union, for edits to the project itself. A refusal is what the headless layer above describes; a notice is the third, non-failure diagnostic class, and it comes with the changed project. `isNoticeDiagnostic` tells it from a refusal.

A cut score's `Truncation` has an optional `unfinishedChord: true` when the cut ends inside an unfinished chord string (RULES.md C8 and X4). It is absent otherwise, and it is why `hasChords` stays true for such a tail; removing all chords drops both the flag and the tail bytes.

Keys and chord roots in `constraints` share one spelling: a letter A-G, then `#`, `##`, `b` or `bb`, and `m` for a minor key; a chord name is a root, one quality from the vocabulary, and optionally `/` and a bass root.

Score commands, in the order `ScoreCommand` lists them:

- `toRest` (`noteId`): turns a note and its whole tie chain into rests. Refuses with `note-not-found` or `not-a-note`.
- `toRests` (`noteIds`): `toRest` for several notes as one edit. Every id is checked first, so the first id that names no note, or a rest, refuses the whole command; otherwise all of them become rests, the score is written once and `check` runs once. Refuses with `note-not-found` or `not-a-note`.
- `setChord` (`noteId`, `name`): sets the chord on a note or rest whose voice allows chords, replacing every chord that starts at the note; an empty `name` removes it. Removing the last chord also removes an unfinished chord string at the end of the text, see [RULES.md C8](../score-dialect-song2/RULES.md). Refuses with `note-not-found`, `chord-voice` or `chord-vocabulary`.
- `insertBar` (`bar`, counted from 0): inserts a bar of rests at that index, before the bar now there or after the last one. Refuses with `bar-out-of-range`, `truncated-tail` or `tie-across-bar`.
- `deleteBars` (`from`, counted from 0, and `count`): deletes whole bars. Refuses with `bar-out-of-range`, `last-bar` or `truncated-tail`.
- `setSectionMeter` (`section`, `meter`): sets the meter of one section. Refuses with `section-out-of-range`, `meter-not-allowed`, `meter-does-not-fit` or `truncated-tail`.
- `fillTruncatedBar` and `deleteTruncatedBar`: the two repairs that leave a score with no cut. `fillTruncatedBar` pads every short voice to the end; `deleteTruncatedBar` removes the incomplete measure when no other voice keeps material in it. Both refuse with `no-truncation` or `no-incomplete-bar`; `deleteTruncatedBar` also with `cut-in-complete-bar`, `last-bar` or `cut-other-voice-short`, which says another voice is short of whole bars and to fill the cut bar instead.
- `transpose`: moves every note, every chord root and bass, the header `K:`, every body `K:` line and every inline `[K:…]` by the same number of semitones. The new keys are the declared spellings with the fewest accidentals; a transposition by 0 changes nothing and returns the text as it is. A note that would leave MIDI 0-127 refuses the whole command. Refuses with `semitones-not-integer`, `pitch-out-of-range`, `key-unavailable` or `chord-invalid`.
- `setKey`: moves the notes and chords to the chosen key, like `transpose` by the shortest interval between the two tonics, and forces the chosen key's spelling. With `from`, only the score from that key-change position on moves; the header and earlier key changes stay. Refuses with `key-not-allowed` or `key-change-not-found`, and like `transpose` otherwise.
- `setTempo`: writes `Q:1/4=<bpm>` from the dialect's tempo range and changes no pitch. Refuses with `tempo-out-of-range`.
- `removeChords`: removes every chord from the score. It is the one-step fix for a `melody` project that carries chords.
- `deleteSection` (`section`, counted from 0): deletes the section's bars and marker. Deleting the unnamed section is allowed, and so is deleting the last section when it holds the cut tail; the result is then a complete score. Refuses with `section-out-of-range`, `truncated-tail` for a cut outside the last section, or `last-bar` when no bars would remain.
- `duplicateSection` (`section`): puts a copy of the section directly after it. The copy keeps the section's name, because the copy is the same musical material and the same label a lyric line binds to; rename it if it should read differently. A copy also keeps a tie at its end into the following section: in A, A copy, B the boundary A copy→B repeats the original A→B, so keeping it is the original music; only the newly formed boundary at the copy's start clears a tie. Refuses with `section-out-of-range`, `section-unnamed` for the unnamed section, or `truncated-tail` for a section that holds the cut tail.
- `moveSection` (`section`, `direction` = `"earlier"` or `"later"`): swaps the section with its neighbour. A named section cannot move before the unnamed section, which has no marker and can only stand first, and a move that would carry the cut tail out of last place is refused. Refuses with `section-out-of-range`, `section-unnamed`, `section-move-start`, `section-move-end`, `section-before-unnamed` or `truncated-tail`.
- `renameSection` (`section`, `name`): gives an existing section a new name; naming the unnamed section puts a marker at bar 0. `section-name-trailing-space` is refused because T2 trims `% verse ` to `verse`, so such a name would not read back as written. Refuses with `section-out-of-range`, `section-name-empty`, `section-name-blank`, `section-name-line-break` or `section-name-trailing-space`.
- `nameSection` (`bar`, counted from 0, and `name`): starts a named section at that bar. A bar at an existing section start renames that section; any other bar splits the section there, which the writer turns into a group boundary as W11 describes, with the group shape in W3 and W4. Refuses with `bar-out-of-range` or the same name codes as `renameSection`.
- `moveNotes` (`noteIds`, `timeTicks`, `semitones`, `grid`): moves the whole tie chain of every named note as one edit, in time and pitch together. A non-zero time offset puts the start on the nearest line of `grid`, a `Grid` whose `value` is a `GridValue` and whose optional `dotted` makes a step half as long again; a zero time offset leaves the time alone, so a pitch-only move does not snap an off-grid note, and the length is always kept. A placed note keeps one note at a time in its voice: a note whose start it covers is removed, a note it starts inside is shortened to the placed note's start, and every time it leaves becomes a rest without moving later notes. Placed notes are taken in start order; when two land on the same start the later one in that order stays. A result that crosses a bar line is split there and tied. Chords stay at their positions, because the chord track is a track of positions, not of notes; each chord is rebound to the Vocal note or rest now starting there. Refuses with `note-not-found`, `not-a-note`, `offset-not-integer`, `unit-unknown`, `grid-not-allowed`, `pitch-out-of-range`, `note-before-start` or `note-past-end`.
- `resizeNotes` (`noteIds`, `edge` = `"start"` or `"end"`, `timeTicks`, `grid`): moves the named edge of the whole tie chain of every named note to the nearest grid line and leaves the other edge exactly where it is, then applies the overlap, rest, bar-line and chord rules of `moveNotes`. A result shorter than one grid step is refused. Refuses with the codes of `moveNotes` and `note-too-short`.

A `Score`'s `unitTicks` is one written duration unit in ticks; it is optional so a 0.1.0-shaped score still type-checks, and a note command refuses with `unit-unknown` when it is absent. A grid step is allowed when it is a whole number of those units and that number can be made from the dialect's `constraints.durations`; so a 1/32 grid, and a dotted value finer than the written `L:` unit, exist only where the score can write them. A note shorter than the grid keeps its length when it moves, and a resize keeps the unmoved edge, so only a line the command moves is guaranteed to be on the grid. A move that would cross the start or end of the score is refused, not clamped, as `transpose` refuses an out-of-range pitch: a refusal leaves the whole score as it was.

Any score command also fails with `write-mismatch`, or with a reading code, when the dialect cannot write the result or read it back the same.

Project commands, the `ProjectCommand` union:

- `setStyle`: sets the style text.
- `setScoreMode`: sets `full` or `melody`.
- `setSeed`: sets a whole-number seed, or `null` to clear it.
- `replaceScoreText` (`text`): replaces the whole score text with another one. A text the dialect reads and checks is taken, and stored the way the dialect writes it; otherwise the command refuses with the dialect's first diagnostic and nothing changes. It is how the text view's typing reaches the project.
- `setLyricLineText` (`line`, `text`): changes one lyric line's text and keeps its phrase unless the phrase no longer fits the score.
- `insertLyricLine` (`line`, `text`, `phrase`): inserts a line at a position in the project's line order, with a phrase or `null` for the unaligned area.
- `deleteLyricLine` (`line`): removes a line.
- `splitLyricLine` (`line`, `offset`, optional `bar`): splits a line at a code-point offset, on a bar or into the unaligned area.
- `mergeLyricLines` (`line`): joins a line with the next stored line.
- `setLyricLinePhrase` (`line`, `phrase`): moves or places a phrase, or sends the line to the unaligned area with `null`.

`applyProjectCommand` also runs the song-project rules. A `setTempo` through it rewrites every BPM written in the style text (`120 BPM`, `120bpm`, `BPM: 120`, `bpm=120`, `BPM 120`, `BPM：120`) and reports the notice `style-no-bpm` when the style has none; a number not next to the word BPM stays as it is. A project in `melody` mode whose score has chords reports the notice `melody-with-chords`; delete the chords or switch back to `full`. `checkProject(dialect, project)` reports that notice for a project as it stands, without changing anything.

## Lyrics on the song project

`SongProject.lyricLines` is optional, so a project built by 0.1.0 still opens. It is a list of `LyricLine`s: `{ text, phrase }`, where `phrase` is `{ firstBar, barCount }` and `null` marks a line in the unaligned area. Only the text and the bar run are stored; syllables, note onsets and whether their counts are equal are computed when asked. A phrase is a run of consecutive bars inside one section. The binding is bar-based because bars are what commands move and sections have no identity beyond their place.

A project without `lyricLines` computes the layout from its legacy `lyrics` text: `lyricLinesOf(project, score)` returns the stored lines, or `layoutLyrics(score, project.lyrics)` when there are none. A `[name]` line matches the first unused section with that name and its lines go one per bar from the section's first bar. Lines before the first label go into the unnamed opening section when the score has one, and into the first section otherwise; a label with no section and a line that does not fit go to the unaligned area. Empty lines are skipped and do not take a bar. A section with no label stays empty. Computing the layout does not write it into the project. A score command that changes the lines or their join stores the layout and rewrites `lyrics`; a command that changes neither writes nothing.

`joinLyrics(score, lines)` writes the text in section order: one `[name]` label before each named section and its lines, no label for the unnamed opening section, and a label for an empty named section. Unaligned lines are left out. `checkProject` reports `lyrics-unaligned` when there are any and `lyrics-too-long` when the joined text is over `LYRICS_MAX_CHARACTERS` (2,000). `lyricCharacterCount` counts Unicode code points, line breaks included.

`lyricSyllables` and `syllableCount` count one per Han character, kana, digit and other letter, with combining marks staying on their base. A Latin word is split by vowel groups (`a e i o u`, and `y` when it is not next to one) and by a `-` written inside it; a word with no vowel group counts one. Spaces, punctuation and symbols are not sung and count nothing. `noteOnsets(score, phrase)` returns the `Vocal` notes in the phrase's bars that are not rests and not tied from the note before. `alignLyricLine(score, line)` returns the syllables, the onsets, whether their counts are equal, and one note per syllable when they are; `alignedLyricLines(lines, score?)` and `unalignedLyricLines(lines, score?)` split a line list by its area. Without a score they treat every non-null phrase as aligned, so pass the score to count a stale phrase as unaligned.

Lyric-line commands are `ProjectCommand`s: `setLyricLineText`, `insertLyricLine`, `deleteLyricLine`, `splitLyricLine`, `mergeLyricLines` and `setLyricLinePhrase`. A `line` names a line by its place in `lyricLinesOf(project, score)`. `setLyricLineText` keeps the line's phrase unless it no longer fits the score; `insertLyricLine` takes text and a phrase or `null`; `deleteLyricLine` removes one; `splitLyricLine` splits at a code-point offset, keeping the bars before an optional bar on the first part and putting the second part on the bar or in the unaligned area; `mergeLyricLines` joins a line with the next stored one; `setLyricLinePhrase` moves a boundary, places an unaligned line or sends a line back with `null`. The stored order is the one `joinLyrics` needs: aligned lines by first bar, then unaligned lines in their stored order.

A phrase is valid only when it is one or more whole consecutive bars inside the score and inside one section. A stored phrase that no longer fits is read as unaligned by `joinLyrics`, `alignLyricLine`, `alignedLyricLines(lines, score)`, `unalignedLyricLines(lines, score)` and `checkProject`, without rewriting the stored line; a lyric command that touches that line keeps it unaligned or gives it a valid phrase. A lyric line's text cannot be empty after trimming, contain a line break or be only a `[label]` line. A merge joins text with one space, or none when both sides of the join are Han or kana, and joins two adjacent phrases in one section; an aligned and an unaligned line keep the aligned phrase, and two unaligned lines stay unaligned. A phrase that would overlap another line's is refused rather than shrinking that line: a host moves a shared boundary with two `setLyricLinePhrase` commands through `applyCommandList`, which applies the list together or not at all. Every refusal has its own code (`lyric-line-out-of-range`, `lyric-phrase-invalid`, `lyric-phrase-overlap`, `lyric-text-invalid`, `lyric-lines-not-mergeable`, `lyric-split-invalid`), and leaves the project as it was.

A score command through `applyProjectCommand` remaps the stored lines, or an old project's computed layout, in one place. A deleted section takes its lines; a copied section copies them; a moved section moves them; a rename keeps them on their bars. A new section marker inside a phrase keeps the line in the section of its first bar, on the bars that remain there, so it never crosses the new marker. A bar inserted before a phrase shifts it and one inserted inside it is spanned; a deleted bar inside a phrase closes the gap. A phrase that loses every bar goes with those bars. The project's `lyrics` becomes the joined text whenever the lines or that join change; a command that changes neither adds no field and leaves `lyrics` as it was. Every result of `applyScoreCommand` is unchanged by this.

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
  activeView: "arrangement", // optional: which of VIEW_NAMES is shown first; "arrangement" by default
});

const parts = [
  mountToolbar(toolbarElement, session, { onRefused: (diagnostics) => report(diagnostics) }),
  mountTimeRuler(rulerElement, session),
  mountChordTrack(chordsElement, session),
  mountVoiceTrack(vocalElement, session, { voice: "Vocal" }),
];

const done = session.dispatch({ type: "toRest", noteId }); // { ok, project, diagnostics }: a refused command returns the project it left untouched; a taken one may carry notices in diagnostics
session.undo(); // the whole project before that command
session.setView({ editable: false }); // every part follows: no editing control, no selection, no keys
session.setActiveView("text"); // a ViewName; the default editor's view switch does this, a host's own switch can too
const found = session.checkScoreText(typed).filter((diagnostic) => !isNoticeDiagnostic(diagnostic)); // what the dialect refuses a text for, without taking it; none when it reads
if (found.length === 0) session.dispatch({ type: "replaceScoreText", text: typed }); // a ProjectCommand: the text replaces the score, one history step
else session.setRejectedText({ text: typed, diagnostics: found }); // a RejectedText: text a view holds that was not taken
const stop = session.subscribe((change) => save(session.project)); // change.cause: "dispatch", "undo", "view", ...

for (const part of parts) part.destroy(); // each removes its own listeners, nodes and share of the stylesheet
stop();
```

- The session is headless: it touches no DOM, so it runs in Node and in a worker. `dispatch` applies a command through `applyProjectCommand`; a refusal comes back as the headless layer above describes. A successful dispatch may carry notices: when a command comes back with a notice only (`isNoticeDiagnostic`, for example `style-no-bpm` after a tempo change), the session takes it as one history step and returns `ok: true` with the notice in `diagnostics`. A list of commands, as a tool run applies, keeps going past a notice, returns each notice once, and is refused as a whole by any other diagnostic. Read `ok`, not whether `diagnostics` is empty, to tell a refusal. The history keeps whole song projects. Selection (note ids), insertion point, zoom, scroll and language are not in the history. `replaceProject` starts a new document from outside, the way `update({ project })` does.
- Parts: `mountToolbar`, `mountZoomControl`, `mountCutNotice`, `mountProblemView`, `mountTimeRuler`, `mountChordTrack`, `mountVoiceTrack(el, session, { voice })`, `mountSynthPreview`, and the three views' parts: `mountTextView`, `mountStaffView`, `mountStaleNotice` and `mountViewSwitch`. Each returns `{ destroy() }`, and a second `destroy` does nothing. Each part is styled and isolated as `mount` is, and the zoom menu uses the popover layer; the decisions are in [docs/spike.md](../../docs/spike.md).
- The ruler, the chord track and a voice track scroll in time on their own element, each by its own width. Each is a named region that Tab reaches, and the plus and minus keys zoom around the middle of the one that has the focus. Pass `{ scroller }` as the last argument to put several of them in one scroller of your own, as `mount` does. A part mounted late starts at the session's zoom and scroll.
- The toolbar part holds the title, the zoom control, undo, redo, Delete and the Select menu (while `session.view.editable` is true), the read-only badge (while it is not) and, when you pass `{ hintId }`, a screen-reader hint with that id for a view's `aria-describedby`. Its options are `ToolbarOptions`: `hintId`, `onRefused` for the diagnostics of a Delete the score would not take, `viewSwitch`, which adds the view switch before the preview control, and `synthPreview`, which is on unless you pass `false` (see [The synth preview](#the-synth-preview)). When your element is narrower than its controls, a toolbar that holds the preview control or the switch wraps (the badge and the switch go together to a line of their own, and the preview control and its caption take the line after it); one that holds neither scrolls sideways instead. Undo and redo are the session's `undo()` and `redo()`; Delete is muted until a pitched note is selected and then does what the Delete key does, so a touch screen can delete without a keyboard.
- Which view is shown is the session's too: `session.activeView` is a `ViewName`, one of `VIEW_NAMES` (`"arrangement"`, `"staff"`, `"text"`), given first by the `activeView` option of `createEditingSession`, set by `session.setActiveView(name)` or by the view switch, and not in the history. `session.rejectedText` is a `RejectedText`, `{ text, diagnostics }`, the text the text view holds that the project did not take, or null; `session.setRejectedText(next)` sets it, and `session.checkScoreText(text)` says what a `replaceScoreText` of a text would be refused with, without taking it. The text view's edit is the project command `{ type: "replaceScoreText", text }`, one of the `ProjectCommand`s that `session.dispatch` and `applyProjectCommand` take next to a `ScoreCommand`: readable text replaces the score, unreadable text is refused with its diagnostic and nothing changes, and the song-project rules run after it as after any command. The change a `dispatch` of a project command announces carries it as `change.command`, so a host can tell a text typed into the score from the other edits. A host with its own layout shows and hides its own views from `activeView`.
- Selection and the insertion point live in the session, not in a part: `session.selection` holds note ids and `session.insertionPoint` a tick, and neither is in the history. A voice track draws them and takes the clicks and taps. The editing keys (Delete, Backspace, Ctrl or Cmd plus Z, Ctrl or Cmd plus Shift plus Z, Ctrl plus Y, Ctrl or Cmd plus A, Ctrl or Cmd plus Shift plus A, Escape, Left, Right, Home, End) are heard by a part while the focus is inside it; a part that handles one keeps it from the browser, and a part given `{ onRefused }` (the option of `ToolbarOptions` and of every time-axis part) hears the diagnostics of a refused command. Left and Right keep scrolling while there is no insertion point; Home and End always place one.
- Selecting several notes: Shift held on a click or tap (a keyboard attached to a touch screen) adds a note to the selection or, when it is selected, takes it out with its whole tie chain; Shift on empty space does nothing, so a missed aim does not cost the selection. A mouse pressed on empty space and dragged draws a box: the notes it touches are framed while it is open and selected when it is let go, Shift held at the press adds to the selection, a box over no note clears it, and Escape gives it up. A press that starts on a note draws no box. On a touch screen a swipe on empty space still scrolls: rest a finger on empty space for 0.4 s and slide to draw the box, or rest it on a note to toggle that note, as Shift does. Ctrl or Cmd plus A selects every pitched note, Ctrl or Cmd plus Shift plus A selects the notes that are not selected and lets go of those that are, and Escape clears the selection, whatever its ids name (with an empty selection it is left to the host). The Select menu in the toolbar does the same three for a finger. While the focus is in the editor these keys are kept from the browser, so the page's own select all does not run. Edits keep the selection on the notes they edited: after Delete the ids stay selected as rests (select all leaves rests out), and an undo brings the notes back selected. While `session.view.editable` is false a click, a box, a hold and these keys select nothing, but `session.select(noteIds)` stays open, so a host's own filter panel can select. The decisions are in [DESIGN.md](../../DESIGN.md).
- The section menu: while `session.view.editable` is true, each section band of the time ruler is a button over the whole band (a chevron after its name says so) that opens a menu of what can be done to the section: rename it (or name the unnamed opening), start a section at a bar, move it earlier or later, duplicate it, delete it. Each is one command and one history step. A choice the commands would refuse stays in the menu, muted, with the command's own words under it, and pressing it does nothing. The answer comes from a dry run of the command, so no rule is written twice, and a host that builds its own section control asks `sectionActions(session, index)` for the same answer. Rename and "start a section at a bar" ask for a name, and a bar, in a small form under the band; a refusal stays in the form and goes to `onRefused` as a refused key does, and the form sends the bar as typed, so the command decides what a bar may be. Bands are not Tab stops, so the Tab order is unchanged: press Shift and F10, or the Menu key, while the focus is in the ruler or the arrangement to open the menu of the section at the insertion point (the first section when there is none), then Left, Right, Home and End move between bands and Enter opens the one in focus; a right click on a band opens its menu too. After a choice the focus and the view follow the section that was acted on, and a live region says what was done. While `session.view.editable` is false the bands are drawn and nothing opens. On a touch screen the row of bands is 25px tall, a 24px target. The decisions are in [DESIGN.md](../../DESIGN.md).
- Notes by keyboard: a voice track has one tab stop among its notes (the selected note, else the first). While a note has the focus, Left and Right step to the neighbouring note and select it, Home and End go to the first and the last, and Enter or Space selects the one in focus. To pick notes one by one, Ctrl or Cmd plus Left, Right, Home or End move the focus without selecting, and Shift plus Space or Shift plus Enter adds the note in focus or takes it out with its tie chain; any other key with a modifier is left alone. A click or tap puts the focus on the note it selects. With the focus anywhere else in the part, the insertion point keys above keep their meaning.
- Announcements: each time-axis part keeps one polite live region (`role="status"`) in the host's language. A voice track says which of its own notes were selected, that a delete took some, and what an undo brought back or a redo took away, and the track of the score's first voice says where the insertion point moved; any part says why, and where, a refused edit its keys caused was refused (the toolbar for its Delete button). A part mounted alone speaks for what it draws, and nothing reads another part.
- Not tied to the DOM: `handleEditingInput(session, input)` takes one `EditingInput` as plain data and does what the parts do, so a host that builds its own layout or its own input handling can reuse it. The input is `{ type: "key", key, ctrlKey?, metaKey?, shiftKey?, altKey? }`, `{ type: "click-note", noteId }`, `{ type: "click-empty", tick }`, `{ type: "delete" }` (what a Delete control sends), `{ type: "toggle-note", noteId }` (a click on a note with Shift held), `{ type: "select-notes", noteIds, add? }` (a box: exactly the pitched notes among `noteIds` are selected, or with `add` join the selection; no note clears it unless `add`), `{ type: "select-all" }`, `{ type: "invert-selection" }` or `{ type: "clear-selection" }`; the key input also takes Ctrl or Cmd plus A, with Shift, and Escape. It returns an `EditingInputResult`, `{ handled, refused }`: `handled` says the input meant something here, so the caller should keep the browser from also acting on it, and `refused` holds the diagnostics of an edit the score would not take. While the session is not editable nothing is handled. Deleting several selected notes is one history step, and one refusal refuses the whole run.
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
- `session.runTool` checks the parameters, builds the commands once, and applies them through the same command path as `dispatch`. All commands are one history step: one undo goes back to the project before the run, one redo reapplies it. If any step fails its `check`, the run is refused, the result carries that step's diagnostic, and project and history stay as they were. A step that comes back with a notice does not fail the run: the result is `ok` and its `diagnostics` hold the notices.
- `applyCommandList(dialect, project, commands)` applies a list of score and project commands through the same path as `dispatch` and returns a `CommandListResult`. A notice does not stop the list; any other diagnostic refuses the whole list and leaves the project as it was.
- Every export here is additive to the 0.1.0 entry and the editing-session entry; `commands`, `parameters` and `name` are the shape the registry and session read. The tool panel in a later ticket reads the registry's declarations to draw its controls and preview.

## The synth preview

A song can be heard in the browser as a plain synthesis of its melody and chords, with a playhead that follows it. The sound is made in the page from oscillators: there is no sample library, no worklet module and no request of any kind. It is a rough rendering, and the interface says so wherever it offers it: "Synthetic preview, not the final sound" (zh: 合成试听，不代表成品效果), in the session's language, beside the control.

```ts
import { mountSynthPreview, previewNote, previewPlayer, schedulePreview } from "@neta-art/score-editor";

const control = mountSynthPreview(transportElement, session); // a Preview and Stop button with its caption
const player = previewPlayer(session); // the one player of this session, whoever drives it
player.subscribe(() => draw(player.playing, player.tick)); // after every frame it moves in
const result = await player.start(); // from a click handler: "started" | "nothing-to-play" | "unsupported" | "blocked" | "cancelled"
player.stop();

await previewNote(64, { duration: 0.35 }); // one pitch for a short time: true once it sounded

const { events, length } = schedulePreview(score, 512); // notes and chords in seconds from tick 512, with no browser involved
```

- `mountSynthPreview(el, session)` is a view part like the others: one button (a line icon and the word Preview, or Stop while it plays) and the caption. A second press stops. It is not an editing control, so it is there while the session is read-only, and it is hidden only while the session has no readable score. `mountToolbar` holds the same control by default, after the read-only badge, so the default editor has it; pass `{ synthPreview: false }` when you mount `mountSynthPreview` somewhere of your own, so it is not there twice.
- The preview starts at the session's insertion point, or at the start when there is none or while the session is read-only. It plays the `Vocal` and `Ins` voices and the chord of each span. Seconds come from the score's tempo (a score has one, and the format has no tempo changes) and every position from the score itself, so each bar is as long as its own meter makes it and a change of meter is followed. A tied chain sounds once, a rest is silent, and a cut score ends where its music ends. It stops when the project is replaced or changed, when the music ends, when Escape is pressed, when the browser interrupts the audio, and when an `<audio>` or `<video>` element in the page's own document starts to play. Sound the page is already playing is left alone: the preview does not pause it.
- `previewPlayer(session)` returns the session's one player, a `PreviewPlayer`: `playing`, `tick` (the tick under the playhead while it plays, a fraction between whole ticks), `from`, `start()`, `stop()` and `subscribe(listener)`. Making it touches no audio. The voice tracks of the session subscribe to it and draw the playhead, a hairline through each lane; the player knows no view, and a view reads only `tick`. A host that builds its own transport or its own playhead does the same. The position is not in the session's view state: that holds the UI state parts share (zoom, scroll, language) and notifies on change, and the playhead moves on every frame, so the player is its one source and has its own small subscription.
- Autoplay: a browser lets sound start only after a user gesture, so call `start()` and `previewNote()` synchronously from a click, tap or key handler, before any `await`. When the browser refuses, `start()` resolves `"blocked"` (the control says so, and the next press works) and `previewNote()` resolves `false`. Where there is no Web Audio at all, `start()` resolves `"unsupported"`, `previewNote()` resolves `false`, and the control is muted, with the reason in its tooltip and in place of its caption. When a press does nothing (nothing to play from here, or the browser refused the sound), the caption says why for a few seconds and then comes back. Everything shares one audio context, suspended again about a third of a second after the last sound, so an idle editor holds no audio device. What was checked in which browser is in [DESIGN.md](../../DESIGN.md).
- `previewNote(midi, { duration })` is the single-note preview, for a view that sounds a note as the user draws or selects it: a whole MIDI number from 0 to 127 (a `RangeError` otherwise), for 0.35 seconds unless `duration` says otherwise, kept between 0.02 and 10 seconds. It resolves `true` once the note sounded.
- `schedulePreview(score, fromTick = 0)` is the headless half: a pure function from a `Score` to `{ events, fromTick, secondsPerTick, length }`, where an event is a note (`voice`, `midi`) or a chord (`name`, `midis`, bass first) with `at` and `length` in seconds. It runs in Node and in a worker.

## Drafts

The headless draft keeper saves a session's project through a host store, restores it on open, and inherits lyric lines into a regenerated song. It works in Node with no DOM, like the session. Wiring it into `mount`, the conflict prompt and the on-screen failure message is the editor's UI half; a host that builds its own layout uses the keeper directly.

```ts
import { createDraftKeeper } from "@neta-art/score-editor";

const keeper = createDraftKeeper({
  session, // the editing session
  store, // a DraftStore: read, versioned write, versioned remove, list
  original: project, // the source project; the keeper never changes it
  notify: (notice) => showToast(notice.message), // draft-source-changed, draft-save-failed
});

await keeper.ready; // opening and inheritance are done
keeper.subscribe(({ status }) => showConflict(status === "conflict")); // "opening" | "ready" | "conflict" | "destroyed"
await keeper.overwrite(); // the conflict way out that keeps this window's project
await keeper.loadTheirs(); // the one that takes the other window's draft
await keeper.handoff(); // "written" | "unchanged" | "conflict" | "failed"
await keeper.restoreOriginal(); // the original back, history reset, draft removed
keeper.destroy(); // stops the timer and the subscription, and starts a pending write once
```

A draft is JSON text, written and read by `draftText` and `readDraft`: a format version (`DRAFT_FORMAT_VERSION`, today `1`), the source key, the content hash of the original's lyrics and score, the draft's project (style, joined `lyrics`, lyric lines with their phrases, score text, score mode and seed), the content hash at the last handoff or null, and the update time in milliseconds. The project is the spec's list plus the joined `lyrics` field, which this package adds so a restored project is byte for byte the one the user left. A text of another version, or one that does not have that shape, reads as no draft.

`contentHash(lyrics, score)` is SHA-256 over the UTF-8 bytes of `JSON.stringify([lyrics, score])`, as lowercase hex, with no normalisation. It uses `globalThis.crypto.subtle`, which browsers, Workers and Node from 19 on have (Node 24 in this repository), so the same function makes the source and the handoff hashes.

The host's `DraftStore` takes keys and text; where a key maps (a file, a path, a record) is the host's business. `read(key)` answers `{ text, version }` or null. `write(key, text, expected)` and `remove(key, expected)` answer `{ ok: true, version }` or `{ ok: false, reason: "conflict" | "failed" }`; `expected` is the version last read or written, or null to create. `list()` gives the keys that hold a draft. A host without deletion may keep a tombstone, as long as `read` answers null and `list` leaves the key out.

- **Open.** A draft for the original's key whose source hash matches is put into the session. A stale one is removed; `draft-source-changed` says the original changed only when that removal succeeds, and `draft-save-failed` says it did not. No draft is normal and silent. A stale own draft stops there; it does not also inherit from another song. A text of a version this package does not know is left alone; the next write is a create (`expected: null`) and the store's conflict offers the two ways out.
- **Inherit.** With no own draft, the keeper reads the listed drafts (at most 50, in the host's order) and takes the matching `handoffHash` with the latest update time whose lyric lines join to the new song's own `lyrics` byte for byte. It then puts the original with those lyric lines into the session; the original's `lyrics` is not replaced. A matching draft whose lines join to other words is not inherited. Fifty bounds the work on a device with many drafts; a handoff is recent by nature, and a larger store is still read in order. The inherited project is kept under the new source key after the debounce, with no handoff hash of its own.
- **Keep.** About one second after the last project change, the draft is written; selection, view and insertion-point changes write nothing. A project equal to the original, in every field the draft stores and in its effective lyric lines, removes the draft instead, and writes nothing when there is none.
- **Conflict.** A versioned write or removal answered with a conflict stops further writes and sets the status to `conflict`. `overwrite()` reads their version and writes ours over it; `loadTheirs()` reads their draft and replaces the session's project, and leaves the conflict in place when the text cannot be read. A successful action returns the status to `ready`.
- **Failure.** A write or removal that is not a conflict sends `draft-save-failed`; the next project change tries again.
- **Restore the original.** `restoreOriginal()` uses `replaceProject`, so the history, selection and insertion point go with the edits the draft recorded; there is no history step back to a draft that no longer exists. It reads the key and removes whatever is there, including a draft this keeper did not know about or a text it cannot read; a conflict or failure there is reported as for a write.
- **Handoff.** `handoff()` hashes the current joined lyrics and score, cancels the pending write and saves at once with that handoff hash. When the project equals the original there is nothing to inherit, so no draft is written and the result is `"unchanged"`.
- **Destroy.** `destroy()` stops the timer and the subscription and starts one pending write, because unmounting is also how a route change leaves the editor. It does not wait for the write.
- The keeper calls the store only with the original's source key for writes and removals; inheritance reads other keys and never writes them. No path changes the original project.

## Editor skill

`skills/score-editor/` is the editor skill, an Agent Skills bundle that ships in this package: `SKILL.md` routes an agent to one reference per layer and extension point, and `assets/` holds two runnable examples (a static page that imports from esm.sh, and a pnpm project bundled with esbuild). Start at [skills/score-editor/SKILL.md](skills/score-editor/SKILL.md). `pnpm check:skill` fails when a public export is missing from the skill, and the browser tests run both examples against the local build.

MIT licensed.

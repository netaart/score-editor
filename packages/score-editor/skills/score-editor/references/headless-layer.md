# The headless layer

Use this layer when there is no UI to draw: a server render, a worker, a CLI, a test, an import or export, or a
migration that only needs to inspect and rewrite score text. It touches no DOM, has no Node built-ins, and is safe to
import anywhere. `@neta-art/score-dialect-song2` depends on the core only for types, so importing it is equally safe.

## The data it works on

A **song project** is the one document the editor edits. Only `score` and `modelId` decide how the score is read.

```ts
interface SongProject {
  style: string;
  lyrics: string;
  score: string; // the score text in the dialect named by modelId
  scoreMode: "full" | "melody";
  seed: number | null;
  modelId: string; // must match the dialect id, such as "song2"
  sourceKey: string;
  lyricLines?: LyricLine[]; // absent: the layout comes from lyrics and the score
}
```

`LyricLine` is `{ text, phrase }`, where `LyricPhrase` is `{ firstBar, barCount }`; `phrase: null` puts the line in
the unaligned area. Only that binding is stored; syllables, note onsets and whether their counts are equal are computed.

A parsed **score** is dialect-agnostic plain data, with positions and lengths in integer ticks of a 1/1024 note
(`TICKS_PER_QUARTER` is 256): `tempo`, an optional `tempoChanges` of `{ at, tempo }` points, `voices`, `bars`, `keys`,
`sections`, `notes`, `chords`, `truncation`, `hasChords`, an optional `unitTicks`, an optional `drawingText`, and a
dialect-private `source` the core never reads. `unitTicks` is how many ticks one written duration number lasts, so a
command can ask the dialect's `constraints.durations` what it can write; a score that does not state it is refused by
the note commands with `unit-unknown`. `drawingText` is the text a view that draws the score should read when it differs
from the written text: `song2` expands each `Z2`–`Z4` run into separate one-bar rests there, while the project and the
text view keep the run. A dialect whose scores carry `tempoChanges` must put each change into `drawingText` as an inline
tempo field at that bar, so the staff shows why the cursor's speed changes; no registered dialect has one.
`noteId(voice, start)` builds the stable id the model uses.

`Bar`, `Note`, `Chord`, `Section`, `Tempo`, `Meter`, `KeyChange` and `Truncation` describe those parts. `Meter` is a
fraction of a whole note; `Note.midi` is 0-127 or `null` for a rest; `Note.tie` continues into the next note of the
voice.

## Read a score

Build a registry from the dialects the host imported, then call `parse` through the model's dialect. `parse` returns
`ParseResult`: `{ score, diagnostics }`, with `score` null exactly when an error-level diagnostic exists.

```ts
import { createDialectRegistry, formatDiagnostic } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const dialects = createDialectRegistry([song2Dialect]);
const dialect = dialects.find(project.modelId);
if (!dialect) throw new Error(`No dialect for ${project.modelId}`);

const { score, diagnostics } = dialect.parse(project.score);
if (!score) {
  for (const diagnostic of diagnostics) console.error(formatDiagnostic(diagnostic, "en"));
} else {
  console.log(score.bars.length, "bars", score.notes.length, "notes");
}
```

`Diagnostic` is `{ code, params, at }`; codes carry no prose. `formatDiagnostic(diagnostic, "en" | "zh")` turns one
into a sentence. `READING_DIAGNOSTIC_CODES`, `COMMAND_DIAGNOSTIC_CODES` and `NOTICE_DIAGNOSTIC_CODES` are the closed
sets; their element types are `ReadingDiagnosticCode`, `CommandDiagnosticCode`, `NoticeDiagnosticCode` and the union
`DiagnosticCode`. `DiagnosticAt` and `DiagnosticParams` describe where it points and the values its text needs.

## Write one command back

Every edit ends in the same command layer. `ScoreCommand` is the dialect-agnostic union of score edits and
`ProjectCommand` the union of song-project edits; the package README lists each command and its refusal codes. A score
command runs on the model (`Score`), then the dialect writes it and runs `check`.

- `applyScoreCommand(dialect, text, command)` returns `ApplyScoreResult`: `{ ok: true, text }` or
  `{ ok: false, diagnostic }`. A command that cannot be applied, a write/read-back mismatch, or any `check` failure
  returns the diagnostic and no new text. It refuses a `ProjectCommand`.
- `applyProjectCommand(dialect, project, command)` returns `ApplyProjectResult`: `{ project, diagnostics }`. It takes
  either union; only the score text or the project's own fields can change, and nothing changes on a refusal.
- `applyCommandList(dialect, project, commands)` returns a `CommandListResult`: `{ ok, project, diagnostics }`. It
  applies the commands in order through the same path; a notice does not stop the list, but any other diagnostic
  refuses all of it and returns the project it started from. A shared lyric boundary moves as two
  `setLyricLinePhrase` commands in one list.

`applyProjectCommand` also runs the song-project rules and can return a notice with the changed project. `checkProject`
reports those notices for a project as it stands, `isNoticeDiagnostic` tells a notice from a refusal, and
`NOTICE_DIAGNOSTIC_CODES` lists the notice codes. A result whose diagnostics are all notices is a command that was taken;
the session does that for you (`dispatch` returns `ok: true` with the notices), and a host that calls this function itself
should do the same.

A successful result also carries `rewrittenBars`, the 1-based bars the command rewrote, sorted. It is absent when nothing
was rewritten. A command that touches one bar names that bar; a tie change names the bars on both sides of the barline;
`replaceScoreText` names the bars whose reading changed; a tempo change names none, since it rewrites only the header; a
transpose or key change names every bar whose notes or chords changed. The same field is on `ScoreCommandResult`,
`ApplyScoreResult`, `ApplyProjectResult`, `CommandListResult`, `DispatchResult`, `ToolResult` and the project command
result, and `session.rewrittenBars` keeps the last edit's list, including after undo and redo.

`preHandoffNotices(dialect, project, language)` returns the four notices a project carries before a handoff as host
`Notice`s: `prehandoff-no-sections`, `prehandoff-syllables-far` (the whole song's syllables more than one per lyric line
away from its Vocal tie chains), `prehandoff-vocal-range` (Vocal's lower median outside `SINGABLE_RANGE`, 60-82) and
`prehandoff-melody-chords` (the same rule as `checkProject`). `vocalRange(score)` is the register measure as `VocalRange`
(`{ medianMidi, singable }`); it and the voice octave report read `SINGABLE_RANGE`. A score the dialect cannot read
carries no notice. `changeLogEntries` is the structured `ChangeLogEntry` form of the change log: one `text` and the
`bars` it names.

The placing commands are `AddNoteCommand` (`voice`, `start`, `midi`, `grid`, one grid step long), `PasteNotesCommand`
(`notes: CopiedNote[]`, `at`, `grid`), `DuplicateNotesCommand` (`noteIds`, `grid`) and `CopyNotesCommand` (`noteIds`,
`timeTicks`, `semitones`, `grid`, the Alt-drag). A `CopiedNote` is `{ voice, start, duration, midi }`, with a copied tie
chain as one note. All four land on the grid and obey the one-note-a-time rule (a covered start is removed, a covered end
is shortened); each refusal code is listed with the command in the package README. The session follows the notes a placing
command makes, so they are selected afterwards.

The voice edits are `VoiceOctaveCommand` (`octaves`: 1, -1, 2 or -2) and `InstrumentalVersionCommand`; both are members
of `VoiceCommand` and of `ScoreCommand`. The octave command moves only Vocal's pitched notes, leaves Ins, the chords and
the keys alone, and refuses the whole move with `voice-octave-range` when a note would leave MIDI 0-127. The instrumental
version moves Vocal's pitched tie chains into Ins; an existing Ins note gives way, cut short or split around the moved
notes or dropped when fully covered, and Vocal keeps rests and chords. When the score has no Ins voice it adds one and
fills its bars with rests; it refuses with `unit-unknown` when the score has no written duration unit. A successful `ApplyScoreResult.report`
(or `CommandListResult.reports` / `ToolResult.reports`) carries `VoiceOctaveReport`
(`{ kind: "voiceOctave", octaves, medianMidi, singable }`) or `InstrumentalReport`
(`{ kind: "instrumentalVersion", moved, shortened, dropped }`); `CommandReport` is their union. The two built-in Tools
panel tools are Voice octave and Instrumental version in the Transform group; they need no selection and no grid.

The note edits are `MoveNotesCommand` and `ResizeNotesCommand`, both members of `MoveResizeCommand` and of `ScoreCommand`.
They take several note ids and act on each note's whole tie chain. Their `grid` is a `Grid`: its `value` is a
`GridValue`, one of 4, 8, 16 or 32, and `dotted` makes a step half as long again. A grid step is allowed only when the
score's `unitTicks` and the dialect's `constraints.durations` can write it, and a step the score cannot write is
refused with `grid-not-allowed`. Every refusal code is listed with the command in the package README. The parts send them through
the `move-notes` and `resize-notes` inputs of `handleEditingInput`, on `session.grid`, so a view of your own can do the same
([view-parts.md](view-parts.md)).

```ts
import { applyProjectCommand, isNoticeDiagnostic } from "@neta-art/score-editor";

const reading = song2Dialect.parse(project.score);
if (reading.score) {
  const first = reading.score.notes.find((note) => note.voice === "Vocal" && note.midi !== null);
  if (first) {
    const result = applyProjectCommand(song2Dialect, project, { type: "toRest", noteId: first.id });
    if (result.diagnostics.every(isNoticeDiagnostic)) project = result.project; // the new score text; a notice is not a refusal
  }
}
```

`ProjectCommand` is the union of edits that act on the project and not on a parsed score. `setStyle`, `setScoreMode`
and `setSeed` change a field of the project. `{ type: "replaceScoreText", text }` replaces the whole score text: the
dialect must read `text` and its `check` must pass, and the project then holds the text as the dialect writes it;
otherwise the project keeps its old text and the result carries the first diagnostic. It is the command the text view
sends. The song-project rules run after it as after any command, so a `melody` project whose new text has chords comes
back with the notice `melody-with-chords`. A session announces a `dispatch` of any project command with the command in
`SessionChange.command`, so a host can tell a person's direct edit of the score text from the other edits as it
happens. The undo history keeps whole projects, not commands, so nothing in it, and nothing in a project that was
saved and loaded again, says how the text came to be what it is.

```ts
const taken = applyProjectCommand(song2Dialect, project, { type: "replaceScoreText", text: typed });
if (taken.diagnostics.every(isNoticeDiagnostic)) project = taken.project;
```

A host that stores scores can use this path without mounting anything. To write a whole model instead of one command,
call `song2Dialect.serialize(score)` and keep the project otherwise unchanged; call `song2Dialect.check(score)` to see
whether the written text reads back as the same model.

## Lyrics

The call surface is `lyricLinesOf(project, score)` (the stored lines, or the legacy layout from `layoutLyrics`),
`joinLyrics(score, lines)`, `alignedLyricLines` and `unalignedLyricLines`, `lyricSyllables` and `syllableCount`,
`noteOnsets`, `alignLyricLine` (`LyricAlignment`, `LyricSyllableNote`), `lyricCharacterCount` and
`LYRICS_MAX_CHARACTERS`. `checkProject` reports `lyrics-unaligned` and `lyrics-too-long`. The lyric-line commands
are `ProjectCommand`s: `setLyricLineText`, `insertLyricLine`, `deleteLyricLine`, `splitLyricLine`,
`mergeLyricLines` and `setLyricLinePhrase`; `applyCommandList` applies several of them as one step. Pass the score to
`alignedLyricLines` or `unalignedLyricLines` to treat a phrase that no longer fits as unaligned.

The rules — what a label matches, where unaligned lines go, what counts as a syllable, how a command carries the
lines and when `lyrics` is rewritten — are the contract in the package README's
[lyrics section](../../../README.md#lyrics-on-the-song-project). Do not restate them here.

### The rules of the lyric track

The types are `LyricRow`, `LyricEdge`, `LyricBoundaryDrag`, `LyricBoundaryMove`, `LyricBoundaryPlan`, `LyricDrop`, `LyricDropPlan` and `LyricSplit`.

A host that draws its own lyric view reuses what the default track does, with no DOM. `lyricRows(score, lines)` gives each
line (`LyricRow`) its place in the list, the phrase it sits on and its alignment, with a phrase that does not fit the
score counted as unaligned. `lyricBoundaryPlan(score, lines, { line, edge, tick })` says where a dragged edge of a phrase
lands (the nearest bar line, held inside the line's section, one bar at least, clear of other lines) and the
`setLyricLinePhrase` commands to send; a line that shares the edge moves with it, and the one that gives up bars goes
first. `lyricDropPlan` gives a line one bar, the bar under a tick. `lyricSplitCommand` builds the `splitLyricLine`
command for a caret. `barLineTick(score, index)` gives the tick of the bar line a plan's `boundary` names, to draw a guide
there; an index before the first bar gives the start of the score and one past the last bar its end. Send a plan's
commands as one list (`applyCommandList`, or `session.dispatchAll`) so one gesture is one undo step.

```ts
import { applyCommandList, lyricBoundaryPlan, lyricLinesOf } from "@neta-art/score-editor";

const lines = lyricLinesOf(project, score);
const plan = lyricBoundaryPlan(score, lines, { line: 1, edge: "end", tick: 5 * 1024 }); // null if line 1 is unaligned
if (plan && plan.commands.length > 0) project = applyCommandList(song2Dialect, project, plan.commands).project;
```

## The dialect and its constraints

`ScoreDialect` is `{ id, constraints, parse, serialize, check }`. `DialectConstraints` declares the voices, keys,
tempo range, section marker, lyric rule, durations, meter rule and chord vocabulary (`ChordVocabulary`, `DurationSet`,
`MeterRule`). The editor narrows its interface by those declarations; see [dialect-registry.md](dialect-registry.md). For a meter control, `meterAllowed` says whether one `Meter` is inside the rule, `meterChoices` returns the common meters it allows, and `COMMON_METERS` is that common list before filtering.

`Language` is `"zh" | "en"`. `Notice` is a one-time message for the host's own toast system, `NoticeCode` its
machine-readable reason, and `NOTICE_CODES` the closed list (today `"command-refused"`, sent when the score would not take an edit the user asked for).

## Chord places and the names a vocabulary allows

The chord picker of the chord track is built from four pure functions, which a host with its own chord input can use. `chordSlots(score, constraints)` lists the places a chord can go as `ChordSlot`s: the start of every note or rest in a voice whose constraints allow chords, sorted by start (a start two voices share belongs to the voice listed first). A slot is `{ noteId, voice, start, duration, chord, before }`: `chord` is the chord on that start or null and `before` the chord in force before it or null. `nearestChordSlot(slots, tick)` is the slot nearest a tick, the earlier on a tie, and null for no slots. `chordChoices(vocabulary)` is what a picker may offer, a `ChordChoices`, `{ letters, qualities, slashBass }`, where each `ChordLetter` is `{ letter, roots }` and holds the spellings the vocabulary has on that letter, and `qualities` holds only the types the grammar can write with every offered root. `splitChordName(name, vocabulary)` is the grammar `setChord` checks: it returns `ChordNameParts`, `{ root, quality, bass }`, or null when the vocabulary does not allow the name.

```ts
const { constraints, reading } = session;
if (constraints && reading.kind === "score") {
  const slots = chordSlots(reading.score, constraints);
  const slot = nearestChordSlot(slots, 600); // the start nearest tick 600
  if (slot && splitChordName("Am7/G", constraints.chords)) {
    session.dispatch({ type: "setChord", noteId: slot.noteId, name: "Am7/G" });
  }
}
```

## The preview schedule

`schedulePreview(score, fromTick = 0)` turns a `Score` into what a synthetic preview plays: a `PreviewSchedule`, which is
`{ events, fromTick, secondsPerTick, length }`. It is pure, needs no browser, and runs in Node and in a worker. The
browser player and the playhead are in [view-parts.md](view-parts.md#the-synth-preview).

```ts
import { schedulePreview, tickAtSeconds } from "@neta-art/score-editor";
import type { PreviewChordEvent, PreviewEvent, PreviewNoteEvent, PreviewSchedule } from "@neta-art/score-editor";

const { score } = song2Dialect.parse(project.score);
if (score) {
  const schedule: PreviewSchedule = schedulePreview(score, 512); // from tick 512, the third beat of a 4/4 bar
  for (const event of schedule.events satisfies ReadonlyArray<PreviewEvent>) {
    if (event.kind === "note") {
      const note: PreviewNoteEvent = event; // { voice, midi, at, length }, seconds from the start
    } else {
      const chord: PreviewChordEvent = event; // { name, midis (bass first), at, length }
    }
  }
  console.log(schedule.length, "seconds; a tick lasts", schedule.secondsPerTick);
  console.log("the host's player is at tick", tickAtSeconds(score, 12.5));
}
```

- Events are the `Vocal` and `Ins` notes (a tied chain once, from its first note to the end of its last; a rest is
  silent) and each chord span, in time order. `at` and `length` are seconds counted from `fromTick`.
- Seconds come from the score's tempo. A score has an opening `tempo` and may carry `tempoChanges`, each `{ at, tempo }`
  from a tick on; each stretch between changes is counted at its own tempo. The `song2` format has no tempo change, so
  its scores carry only `tempo`. Positions come from the score's own ticks, so a bar in 3/4 or 6/8 and a change of
  meter are already in them.
- From a start tick, a note that began before it is not sounded again, and the chord in force at the start is heard to
  its end. A cut score ends where its music ends, not at the end of the bar the cut is in. `length` is 0 when there is
  nothing to play.
- `tickAtSeconds(score, seconds)` is the reverse for a host player's clock: the tick at that time from the start, a
  tempo change included, the last tick past the end and the first at or before zero. `secondsPerTick` is the opening
  tempo's, so use `tickAtSeconds` rather than dividing when a score has changes.

## Picking notes by conditions

Use this when a note set is defined by what the notes are (the high ones, the short ones, the ones out of key, every
second one) and not by where a person pointed. `filterNotes(score, filter)` takes a parsed `Score` and a `NoteFilter`
and returns the ids of the notes that satisfy it, in the order of `score.notes`, ready for `session.select`. It is pure,
touches no DOM and runs in Node and in a worker. The panel that drives it is in
[view-parts.md](view-parts.md#selecting-by-filter).

```ts
import { filterNotes } from "@neta-art/score-editor";
import type { NoteFilter } from "@neta-art/score-editor";

const { score } = song2Dialect.parse(project.score);
if (score) {
  const filter: NoteFilter = {
    pitch: { min: 64, max: 69 }, // E4 to A4, both ends included
    time: { from: 0, to: 1024 }, // notes that start in the first bar of a 4/4 score: from included, to excluded
    duration: { min: 256 }, // at least a quarter note, a tie chain counted whole
    key: "in", // in the key in force where the note starts
    count: { every: 2, skip: 0 }, // of those, the 1st, 3rd, 5th... of each voice
    invert: false,
  };
  const ids: string[] = filterNotes(score, filter);
  session.select(ids); // selecting is not an edit: no history step
}
```

- Every field is optional and an absent field is no condition; the present ones combine with "and". `{}` takes every
  pitched note: that is the pure function's meaning. The panel's own rule for no condition on is separate: it selects
  nothing and says so ([DESIGN.md](../../../../DESIGN.md#filter-panel)).
- A note here is a tie chain: pitched notes joined by ties are one note that starts where the first starts, lasts as long as
  all of them and has the pitch of the first. A rest is not a note. The ids returned are those of every part of each
  chain that matched, so a tied note is selected whole.
- `pitch` is in MIDI numbers, `duration` in ticks (`TICKS_PER_QUARTER` to the quarter note), both with their ends included;
  `time` is in ticks too, and a note passes when it starts in `[from, to)`. An end that is left out is open; a range whose
  ends are crossed takes nothing. No number is clamped.
- `key` judges the pitch class against the major scale of the key in force at the note's start (a minor key counts as its
  natural minor), not against how the note is spelt. A key that cannot be read makes the note neither in nor out.
- `count` is "every Nth note" with an offset, as in a sequencer's filter: among the notes the other conditions let through,
  counted along each voice in time order, it takes the ones at the places `skip`, `skip + every`, and so on (places count
  from 0). `every` must be a whole number of 1 or more and `skip` a whole number of 0 or more; `skip` defaults to 0.
  Anything else takes nothing. Nothing throws.
- `invert` takes the pitched notes of the whole score that the other conditions, `count` included, did not take. With no
  other condition it takes nothing; with conditions that take nothing it takes every note.
- There is no cap on how many notes a filter takes.

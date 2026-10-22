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
}
```

A parsed **score** is dialect-agnostic plain data, with positions and lengths in integer ticks of a 1/1024 note
(`TICKS_PER_QUARTER` is 256): `tempo`, `voices`, `bars`, `keys`, `sections`, `notes`, `chords`, `truncation`,
`hasChords`, and a dialect-private `source` the core never reads. `noteId(voice, start)` builds the stable id the
model uses.

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
into a sentence. `READING_DIAGNOSTIC_CODES` and `COMMAND_DIAGNOSTIC_CODES` are the closed sets; their element types are
`ReadingDiagnosticCode`, `CommandDiagnosticCode` and the union `DiagnosticCode`. `DiagnosticAt` and `DiagnosticParams`
describe where it points and the values its text needs.

## Write one command back

Every edit ends in the same command layer. `ScoreCommand` is the dialect-agnostic union of edits; today it has
`{ type: "toRest", noteId }`. A score command runs on the model (`Score`), then the dialect writes it and runs `check`.

- `applyScoreCommand(dialect, text, command)` returns `ApplyScoreResult`: `{ ok: true, text }` or
  `{ ok: false, diagnostic }`. A command that cannot be applied, a write/read-back mismatch, or any `check` failure
  returns the diagnostic and no new text.
- `applyProjectCommand(dialect, project, command)` returns `ApplyProjectResult`: `{ project, diagnostics }`. Only
  `project.score` can change, and it does not change on a failure.

```ts
import { applyProjectCommand } from "@neta-art/score-editor";

const reading = song2Dialect.parse(project.score);
if (reading.score) {
  const first = reading.score.notes.find((note) => note.voice === "Vocal" && note.midi !== null);
  if (first) {
    const result = applyProjectCommand(song2Dialect, project, { type: "toRest", noteId: first.id });
    if (result.diagnostics.length === 0) project = result.project; // the new score text
  }
}
```

A host that stores scores can use this path without mounting anything. To write a whole model instead of one command,
call `song2Dialect.serialize(score)` and keep the project otherwise unchanged; call `song2Dialect.check(score)` to see
whether the written text reads back as the same model.

## The dialect and its constraints

`ScoreDialect` is `{ id, constraints, parse, serialize, check }`. `DialectConstraints` declares the voices, keys,
tempo range, section marker, lyric rule, durations, meter rule and chord vocabulary (`ChordVocabulary`, `DurationSet`,
`MeterRule`). The editor narrows its interface by those declarations; see [dialect-registry.md](dialect-registry.md).

`Language` is `"zh" | "en"`. `Notice` is a one-time message for the host's own toast system, `NoticeCode` its
machine-readable reason, and `NOTICE_CODES` the closed list (today `"command-refused"`, sent when the score would not take an edit the user asked for).

## The preview schedule

`schedulePreview(score, fromTick = 0)` turns a `Score` into what a synthetic preview plays: a `PreviewSchedule`, which is
`{ events, fromTick, secondsPerTick, length }`. It is pure, needs no browser, and runs in Node and in a worker. The
browser player and the playhead are in [view-parts.md](view-parts.md#the-synth-preview).

```ts
import { schedulePreview } from "@neta-art/score-editor";
import type { PreviewChord, PreviewEvent, PreviewNote, PreviewSchedule } from "@neta-art/score-editor";

const { score } = song2Dialect.parse(project.score);
if (score) {
  const schedule: PreviewSchedule = schedulePreview(score, 512); // from tick 512, the third beat of a 4/4 bar
  for (const event of schedule.events satisfies ReadonlyArray<PreviewEvent>) {
    if (event.kind === "note") {
      const note: PreviewNote = event; // { voice, midi, at, length }, seconds from the start
    } else {
      const chord: PreviewChord = event; // { name, midis (bass first), at, length }
    }
  }
  console.log(schedule.length, "seconds; a tick lasts", schedule.secondsPerTick);
}
```

- Events are the `Vocal` and `Ins` notes (a tied chain once, from its first note to the end of its last; a rest is
  silent) and each chord span, in time order. `at` and `length` are seconds counted from `fromTick`.
- Seconds come from the score's tempo. Positions come from the score's own ticks, so a bar in 3/4 or 6/8 and a change
  of meter are already in them.
- From a start tick, a note that began before it is not sounded again, and the chord in force at the start is heard to
  its end. A cut score ends where its music ends, not at the end of the bar the cut is in. `length` is 0 when there is
  nothing to play.
- A position in the score is `fromTick + seconds / secondsPerTick`, which is how the player places its playhead.

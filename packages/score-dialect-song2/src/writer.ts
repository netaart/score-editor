// ABOUTME: The song2 writer. It writes unchanged bars with their original bytes and rewrites a changed bar whole under RULES.md "Writing".
// ABOUTME: The check writes a score, reads it back and reports a reading code or write-mismatch when the model does not survive the round trip.
import type { Diagnostic, KeyChange, Note, Score } from "@neta-art/score-editor";
import {
  type BarContent,
  barContentOf,
  KEY_FIFTHS,
  LETTER_SEMITONES,
  type Letter,
  parseSong2,
  type Signature,
  type Song2Source,
  type Song2SourceBar,
  signatureOf,
} from "./parser";
import { keepsCutTail } from "./write-chords";

const TICKS_PER_QUARTER = 256;
const DURATIONS: ReadonlyArray<number> = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48];

const SHARP_SPELLING: ReadonlyArray<{ letter: Letter; accidental: number }> = [
  { letter: "C", accidental: 0 },
  { letter: "C", accidental: 1 },
  { letter: "D", accidental: 0 },
  { letter: "D", accidental: 1 },
  { letter: "E", accidental: 0 },
  { letter: "F", accidental: 0 },
  { letter: "F", accidental: 1 },
  { letter: "G", accidental: 0 },
  { letter: "G", accidental: 1 },
  { letter: "A", accidental: 0 },
  { letter: "A", accidental: 1 },
  { letter: "B", accidental: 0 },
];

const FLAT_SPELLING: ReadonlyArray<{ letter: Letter; accidental: number }> = [
  { letter: "C", accidental: 0 },
  { letter: "D", accidental: -1 },
  { letter: "D", accidental: 0 },
  { letter: "E", accidental: -1 },
  { letter: "E", accidental: 0 },
  { letter: "F", accidental: 0 },
  { letter: "G", accidental: -1 },
  { letter: "G", accidental: 0 },
  { letter: "A", accidental: -1 },
  { letter: "A", accidental: 0 },
  { letter: "B", accidental: -1 },
  { letter: "B", accidental: 0 },
];

function sourceOf(score: Score): Song2Source {
  const source = score.source as Partial<Song2Source> | null | undefined;
  if (
    source === null ||
    source === undefined ||
    typeof source.text !== "string" ||
    typeof source.unitDenominator !== "number" ||
    !Array.isArray(source.musicLines)
  ) {
    throw new Error(
      "@neta-art/score-dialect-song2: this score was not read from song2 text, so it cannot be written back.",
    );
  }
  return source as Song2Source;
}

function sameContent(left: BarContent, right: BarContent): boolean {
  if (
    left.start !== right.start ||
    left.length !== right.length ||
    left.meter !== right.meter ||
    left.key !== right.key ||
    left.incomplete !== right.incomplete ||
    left.keyChanges.length !== right.keyChanges.length ||
    left.notes.length !== right.notes.length ||
    left.chords.length !== right.chords.length
  ) {
    return false;
  }
  for (let index = 0; index < left.keyChanges.length; index += 1) {
    const a = left.keyChanges[index] as KeyChange;
    const b = right.keyChanges[index] as KeyChange;
    if (a.at !== b.at || a.key !== b.key) return false;
  }
  for (let index = 0; index < left.notes.length; index += 1) {
    const a = left.notes[index] as BarContent["notes"][number];
    const b = right.notes[index] as BarContent["notes"][number];
    if (a.start !== b.start || a.duration !== b.duration || a.midi !== b.midi || a.tie !== b.tie) return false;
  }
  for (let index = 0; index < left.chords.length; index += 1) {
    const a = left.chords[index] as BarContent["chords"][number];
    const b = right.chords[index] as BarContent["chords"][number];
    if (a.start !== b.start || a.name !== b.name) return false;
  }
  return true;
}

function unitsOf(duration: number, unitDenominator: number): number {
  const unit = (4 * TICKS_PER_QUARTER) / unitDenominator;
  const units = duration / unit;
  if (!Number.isInteger(units) || !DURATIONS.includes(units)) {
    throw new Error(`song2: the duration ${duration} is not a value the format can write`);
  }
  return units;
}

function durationText(units: number): string {
  return units === 1 ? "" : String(units);
}

function accidentalText(accidental: number): string {
  switch (accidental) {
    case 0:
      return "=";
    case 1:
      return "^";
    case 2:
      return "^^";
    case -1:
      return "_";
    case -2:
      return "__";
    default:
      throw new Error(`song2: cannot write the accidental ${accidental}`);
  }
}

function pitchText(
  midi: number,
  fifths: number,
  signature: Signature,
  accidentalState: Partial<Record<Letter, number>>,
): string {
  // RULES.md W13: sharp keys, C major and A minor spell with sharps; flat keys spell with flats.
  const spelling = (fifths >= 0 ? SHARP_SPELLING : FLAT_SPELLING)[((midi % 12) + 12) % 12] as {
    letter: Letter;
    accidental: number;
  };
  const natural = midi - spelling.accidental;
  const steps = (natural - (60 + LETTER_SEMITONES[spelling.letter])) / 12;
  if (!Number.isInteger(steps)) throw new Error(`song2: no spelling for MIDI ${midi}`);

  let letter: string = spelling.letter;
  if (steps > 0) letter = spelling.letter.toLowerCase() + "'".repeat(steps - 1);
  else if (steps < 0) letter = spelling.letter + ",".repeat(-steps);

  // RULES.md P4/P5: an explicit accidental holds by letter for the rest of the bar, across octaves.
  const effective = accidentalState[spelling.letter] ?? signature.values[spelling.letter] ?? 0;
  let mark = "";
  if (spelling.accidental !== effective) {
    mark = accidentalText(spelling.accidental);
    accidentalState[spelling.letter] = spelling.accidental;
  }
  return `${mark}${letter}`;
}

function noteText(
  note: Note,
  unitDenominator: number,
  signature: Signature,
  accidentalState: Partial<Record<Letter, number>>,
  fifths: number,
): string {
  const units = unitsOf(note.duration, unitDenominator);
  if (note.midi === null) return `z${durationText(units)}`;
  return `${pitchText(note.midi, fifths, signature, accidentalState)}${durationText(units)}${note.tie ? "-" : ""}`;
}

/** Writes one bar from the model, including its chords and inline key changes at their offsets. */
function writeBar(score: Score, sourceBar: Song2SourceBar, unitDenominator: number): string {
  const bar = score.bars[sourceBar.bar];
  if (bar === undefined) throw new Error(`song2: bar ${sourceBar.bar} has no model record`);
  const events = score.notes
    .filter((note) => note.voice === sourceBar.voice && note.bar === sourceBar.bar)
    .sort((a, b) => a.start - b.start);
  const chords =
    sourceBar.voice === "Vocal"
      ? score.chords.filter((chord) => chord.start >= bar.start && chord.start < bar.start + bar.length)
      : [];
  const changes = [...bar.keyChanges];
  for (const inline of sourceBar.inlineKeys) {
    if (!changes.some((change) => change.at === inline.at && change.key === inline.key)) changes.push(inline);
  }
  changes.sort((a, b) => a.at - b.at);

  let keyIndex = 0;
  let chordIndex = 0;
  let offset = bar.start;
  let signature = signatureOf(bar.key);
  let fifths = KEY_FIFTHS.get(bar.key) ?? 0;
  let accidentalState: Partial<Record<Letter, number>> = {};
  const tokens: string[] = [];

  const flushKeys = (at: number): void => {
    while (keyIndex < changes.length && (changes[keyIndex] as KeyChange).at <= at) {
      const change = changes[keyIndex] as KeyChange;
      if (change.at !== offset) throw new Error("song2: a key change is not on a token boundary");
      tokens.push(`[K:${change.key}]`);
      signature = signatureOf(change.key);
      fifths = KEY_FIFTHS.get(change.key) ?? 0;
      accidentalState = {};
      keyIndex += 1;
    }
  };

  const flushChords = (at: number): void => {
    while (chordIndex < chords.length && (chords[chordIndex] as { start: number }).start <= at) {
      const chord = chords[chordIndex] as { start: number; name: string };
      if (chord.start !== offset) throw new Error("song2: a chord is not on a token boundary");
      tokens.push(`"${chord.name}"`);
      chordIndex += 1;
    }
  };

  for (const event of events) {
    flushKeys(event.start);
    flushChords(event.start);
    tokens.push(noteText(event, unitDenominator, signature, accidentalState, fifths));
    offset = event.start + event.duration;
  }

  flushKeys(offset);
  flushChords(offset);
  if (keyIndex !== changes.length || chordIndex !== chords.length) {
    throw new Error("song2: a bar has tokens that cannot be placed");
  }
  return tokens.join("");
}

function lastNoteOf(score: Score, voice: string): Note | undefined {
  const notes = score.notes.filter((note) => note.voice === voice).sort((a, b) => a.start - b.start);
  return notes[notes.length - 1];
}

/** Writes a score: untouched bars keep their read bytes, changed bars are rewritten whole. */
export function serializeSong2(score: Score): string {
  const source = sourceOf(score);
  const lines = source.text.split("\n");
  const dropped = new Set<number>();
  for (const musicLine of source.musicLines) {
    const tail = musicLine.cutTail;
    const last = lastNoteOf(score, musicLine.voice);
    const keepTail = keepsCutTail(score, tail, last?.tie ?? false);
    const dropTail = tail !== null && !keepTail;
    let changed = dropTail;
    const pieces = musicLine.segments.map((segment, index) => {
      const partial = !musicLine.endsWithBarline && index === musicLine.segments.length - 1;
      const unchanged =
        !dropTail && segment.bars.every((bar) => sameContent(bar.content, barContentOf(score, bar.voice, bar.bar)));
      if (unchanged) return segment.raw;
      changed = true;
      const rendered = segment.bars.map((bar) => writeBar(score, bar, source.unitDenominator)).join("|");
      // A rewritten partial measure keeps its finished tokens and its cut remainder at their end.
      return partial && keepTail && tail !== null ? `${rendered}${tail.raw}` : rendered;
    });
    if (!changed) continue;
    const rendered = `${pieces.join("|")}${musicLine.endsWithBarline ? "|" : ""}`;
    if (dropTail && rendered === "") {
      dropped.add(musicLine.line);
      continue;
    }
    lines[musicLine.line] = rendered;
  }
  return lines.filter((_line, index) => !dropped.has(index)).join("\n");
}

/** Deep equality over plain data. It walks whatever fields the model has, so a new field needs no new case. */
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameValue(value, right[index]));
  }
  const leftFields = Object.keys(left);
  const rightFields = Object.keys(right);
  if (leftFields.length !== rightFields.length) return false;
  return leftFields.every(
    (field) =>
      Object.hasOwn(right, field) &&
      sameValue((left as Record<string, unknown>)[field], (right as Record<string, unknown>)[field]),
  );
}

/** The first top-level field of the score that differs from its reading, or null when everything agrees. */
function firstDifferentField(score: Score, reread: Score): string | null {
  const before = score as unknown as Record<string, unknown>;
  const after = reread as unknown as Record<string, unknown>;
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  fields.delete("source");
  for (const field of fields) {
    if (!sameValue(before[field], after[field])) return field;
  }
  return null;
}

function writeMismatch(field?: string): Diagnostic {
  return { code: "write-mismatch", params: field === undefined ? {} : { field }, at: {} };
}

/** RULES.md writing check: write, read back, and compare every field of the model except its private source. */
export function checkSong2(score: Score): ReadonlyArray<Diagnostic> {
  let written: string;
  try {
    written = serializeSong2(score);
  } catch {
    return [writeMismatch()];
  }
  const read = parseSong2(written);
  if (read.diagnostics.length > 0) return read.diagnostics;
  const reread = read.score;
  if (reread === null) return [writeMismatch()];
  const field = firstDifferentField(score, reread);
  if (field !== null) return [writeMismatch(field)];
  return [];
}

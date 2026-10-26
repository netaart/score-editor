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
import { stripTrailingWhitespace } from "./text";
import { serializeBarsSong2, serializeTruncatedBarsSong2 } from "./write-bars";
import { keepsCutTail } from "./write-chords";
import { sectionsMatchSource } from "./write-sections";

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

export function sameContent(left: BarContent, right: BarContent): boolean {
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
    if (
      a.start !== b.start ||
      a.duration !== b.duration ||
      a.midi !== b.midi ||
      a.tie !== b.tie ||
      a.tiedFromPrevious !== b.tiedFromPrevious
    ) {
      return false;
    }
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
export function writeBar(
  score: Score,
  sourceBar: Song2SourceBar,
  unitDenominator: number,
  allowedKeys?: ReadonlySet<number>,
): string {
  const bar = score.bars[sourceBar.bar];
  if (bar === undefined) throw new Error(`song2: bar ${sourceBar.bar} has no model record`);
  const events = score.notes
    .filter((note) => note.voice === sourceBar.voice && note.bar === sourceBar.bar)
    .sort((a, b) => a.start - b.start);
  const chords =
    sourceBar.voice === "Vocal"
      ? score.chords.filter((chord) => chord.start >= bar.start && chord.start < bar.start + bar.length)
      : [];
  const changes = [...bar.keyChanges].filter((change) => allowedKeys === undefined || allowedKeys.has(change.at));
  for (const inline of sourceBar.inlineKeys) {
    if (allowedKeys !== undefined && !allowedKeys.has(inline.at)) continue;
    // The timeline is the authority, so a transposed inline key is written at its new spelling,
    // and a key change a command removed is not brought back from the source bytes.
    const key = score.keys[inline.timelineIndex]?.key;
    if (key === undefined) continue;
    if (!changes.some((change) => change.at === inline.at && change.key === key)) {
      changes.push({ at: inline.at, key });
    }
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

function sourceLastNote(source: Song2Source, voice: string): BarContent["notes"][number] | undefined {
  let last: BarContent["notes"][number] | undefined;
  for (const line of source.musicLines) {
    if (line.voice !== voice) continue;
    for (const segment of line.segments) {
      for (const bar of segment.bars) {
        for (const note of bar.content.notes) if (last === undefined || note.start >= last.start) last = note;
      }
    }
  }
  return last;
}

function keyAt(score: Score, at: number): string {
  let key = score.keys[0]?.key ?? "C";
  for (const change of score.keys) {
    if (change.at > at) break;
    key = change.key;
  }
  return key;
}

/** True when the bytes still read as an X5 tail under the key and signature now in force. */
function tailStillUnfinished(score: Score, raw: string, last: Note): boolean {
  const match = /^(\^\^|\^|__|_|=)?([A-G])([',]*)/.exec(raw);
  if (match === null || last.midi === null) return false;
  const marks = match[3] ?? "";
  const letter = (match[2] as string).toUpperCase() as Letter;
  const written =
    60 + LETTER_SEMITONES[letter] + 12 * ((marks.match(/'/g)?.length ?? 0) - (marks.match(/,/g)?.length ?? 0));
  const accidental =
    match[1] === "^"
      ? 1
      : match[1] === "^^"
        ? 2
        : match[1] === "_"
          ? -1
          : match[1] === "__"
            ? -2
            : match[1] === "="
              ? 0
              : null;
  const key = keyAt(score, last.start + last.duration);
  const alteration = accidental ?? signatureOf(key).values[letter] ?? 0;
  return written + alteration !== last.midi;
}

/** Writes a pitch token with an explicit accidental, so the reader cannot inherit the tied pitch (P11). */
function explicitPitchText(midi: number, fifths: number): string {
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
  return `${accidentalText(spelling.accidental)}${letter}`;
}

/** RULES.md P14: a rewritten X5 tail must still compute a pitch different from the tied note. */
export function x5TailText(score: Score, last: Note): string {
  if (last.midi === null) return "";
  const midi = last.midi === 0 ? 1 : last.midi - 1;
  const key = keyAt(score, last.start + last.duration);
  return explicitPitchText(midi, KEY_FIFTHS.get(key) ?? 0);
}

function sourceContentByBar(source: Song2Source): Map<number, BarContent> {
  const byBar = new Map<number, BarContent>();
  for (const line of source.musicLines) {
    for (const segment of line.segments) {
      for (const bar of segment.bars) {
        if (!byBar.has(bar.bar)) byBar.set(bar.bar, bar.content);
      }
    }
  }
  return byBar;
}

/** The bar grid is the bars' count, starts and meters. Keys are not part of it: the header and `K:` lines carry them. */
function gridMatchesSource(score: Score, source: Song2Source): boolean {
  const content = sourceContentByBar(source);
  return score.bars.every((bar, index) => {
    const old = content.get(index);
    return (
      old !== undefined && old.start === bar.start && old.meter === `${bar.meter.numerator}/${bar.meter.denominator}`
    );
  });
}

function cutWasRepaired(score: Score, source: Song2Source): boolean {
  return source.truncation !== null && score.truncation === null;
}

/** True when an edit changed the cut, so the bar-grid writer must state the new one. */
function cutChanged(score: Score, source: Song2Source): boolean {
  const before = source.truncation;
  const after = score.truncation;
  if (before === null || after === null) return before !== after;
  // The unfinished-chord flag changes with the last chord and the normal writer drops that tail; the
  // cut's voice, bar and length decide whether the bar-grid writer has to state a different cut.
  return before.voice !== after.voice || before.bar !== after.bar || before.short !== after.short;
}

function barGridNeedsWriting(score: Score, source: Song2Source): boolean {
  if (!sectionsMatchSource(score, source)) return true;
  const content = sourceContentByBar(source);
  let oldCount = 0;
  for (const index of content.keys()) oldCount = Math.max(oldCount, index + 1);
  if (score.bars.length !== oldCount) return true;
  if (gridMatchesSource(score, source)) return false;
  const metersOnly = score.bars.every((bar, index) => {
    const old = content.get(index);
    return (
      old !== undefined && old.start === bar.start && old.meter !== `${bar.meter.numerator}/${bar.meter.denominator}`
    );
  });
  if (!metersOnly) return true;
  const lengthsFit = score.bars.every(
    (bar) => bar.length === (4 * bar.meter.numerator * TICKS_PER_QUARTER) / bar.meter.denominator,
  );
  // A same-length meter change still needs the grid writer to state the new M: lines; whether the
  // bars fill is a property of the cut, not of the writer that can express it.
  return lengthsFit;
}

function headerValue(line: string | undefined): string {
  return line === undefined ? "" : stripTrailingWhitespace(line).slice(2);
}

function writeKeyLine(lines: string[], line: number, key: string): void {
  if (headerValue(lines[line]) !== key) lines[line] = `K:${key}`;
}

/**
 * Changes only the header lines the model changed, so an untouched header keeps its exact bytes.
 * The header is fixed (RULES.md H1-H10): `Q:` is line 5 and the header `K:` follows the voice lines.
 */
function writeHeader(score: Score, source: Song2Source, lines: string[]): void {
  const tempoLine = lines[4];
  const tempo = tempoLine === undefined ? null : /^Q:1\/4=([0-9]+)$/.exec(stripTrailingWhitespace(tempoLine));
  if (tempo === null || Number(tempo[1]) !== score.tempo.bpm) lines[4] = `Q:1/4=${score.tempo.bpm}`;

  const headerKey = score.keys[0]?.key;
  if (headerKey !== undefined) writeKeyLine(lines, score.voices.length > 1 ? 7 : 6, headerKey);

  for (const field of source.keyFields) {
    const entry = score.keys[field.timelineIndex];
    if (entry !== undefined) writeKeyLine(lines, field.line, entry.key);
  }
}

/** Writes a score: untouched bars keep their read bytes, changed bars are rewritten whole. */
export function serializeSong2(score: Score): string {
  const source = sourceOf(score);
  if (barGridNeedsWriting(score, source) || cutWasRepaired(score, source) || cutChanged(score, source)) {
    return score.truncation !== null ? serializeTruncatedBarsSong2(score, source) : serializeBarsSong2(score, source);
  }
  const lines = source.text.split("\n");
  writeHeader(score, source, lines);
  const dropped = new Set<number>();
  for (const musicLine of source.musicLines) {
    const tail = musicLine.cutTail;
    const last = lastNoteOf(score, musicLine.voice);
    // RULES.md X17 and C8: an X4 remainder is kept byte for byte while it still belongs; an unfinished chord string
    // goes with the last chord. An X5 remainder is kept only while the note before it still ties into it; once that
    // tie is gone it would read as a finished note.
    const keepTail = keepsCutTail(score, tail, last?.tie ?? false);
    const dropTail = tail !== null && !keepTail;
    const oldLast = sourceLastNote(source, musicLine.voice);
    const tailText =
      tail !== null &&
      keepTail &&
      tail.kind === "x5" &&
      last !== undefined &&
      (oldLast?.midi !== last.midi || !tailStillUnfinished(score, tail.raw, last))
        ? x5TailText(score, last)
        : (tail?.raw ?? "");
    const lastSegment = musicLine.segments.length - 1;
    let changed = false;
    const pieces = musicLine.segments.map((segment, index) => {
      const partial = !musicLine.endsWithBarline && index === lastSegment;
      const forced = dropTail && partial;
      const keySetAt = (bar: Song2SourceBar): ReadonlySet<number> | undefined =>
        partial && score.truncation?.voice === bar.voice && score.truncation.bar === bar.bar
          ? new Set(bar.inlineKeys.map((change) => change.at))
          : undefined;
      const trim = (content: BarContent, keys: ReadonlySet<number>): BarContent => ({
        ...content,
        keyChanges: content.keyChanges.filter((change) => keys.has(change.at)),
      });
      const matches = (bar: Song2SourceBar): boolean => {
        const model = barContentOf(score, bar.voice, bar.bar);
        const keys = keySetAt(bar);
        return keys === undefined
          ? sameContent(bar.content, model)
          : sameContent(trim(bar.content, keys), trim(model, keys));
      };
      const unchanged = !forced && segment.bars.every(matches);
      if (unchanged) return segment.raw;
      changed = true;
      const rendered = segment.bars.map((bar) => writeBar(score, bar, source.unitDenominator, keySetAt(bar))).join("|");
      // A rewritten partial measure keeps its finished tokens and its cut remainder at their end.
      return partial && keepTail && tail !== null ? `${rendered}${tailText}` : rendered;
    });
    if (!changed) continue;
    const rendered = `${pieces.join("|")}${musicLine.endsWithBarline ? "|" : ""}`;
    if (!musicLine.endsWithBarline && rendered === "") {
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

// ABOUTME: Small model helpers shared by the command files: note places, tie chains, ticks, ordering, sections and keys.
// ABOUTME: Keeping them here means insert, meter, note and truncation commands read and order notes the same way.
import { positionOf } from "./arrangement";
import type { DiagnosticAt } from "./diagnostics";
import type { Chord, KeyChange, Meter, Note, Score, Truncation } from "./score";
import { TICKS_PER_QUARTER } from "./score";
import type { DurationSet } from "./types";

/** Where a note is, in the voice, bar and beat a person counts; only its id when the score has no such note. */
export function noteAt(score: Score, noteId: string): DiagnosticAt {
  const note = score.notes.find((found) => found.id === noteId);
  if (note === undefined) return { noteId };
  const { bar, beat } = positionOf(score.bars, note.bar, note.start);
  return { voice: note.voice, bar, beat, noteId: note.id };
}

/**
 * The whole tie chain around a note: every note tied into it and every note it ties into. A caller that already has
 * the target voice's notes sorted may pass them to keep the lookup from sorting the whole voice again.
 */
export function tieChain(notes: ReadonlyArray<Note>, target: Note, orderedVoiceNotes?: ReadonlyArray<Note>): Note[] {
  const voiceNotes =
    orderedVoiceNotes ?? notes.filter((note) => note.voice === target.voice).sort((a, b) => a.start - b.start);
  const index = voiceNotes.findIndex((note) => note.id === target.id);
  let first = index;
  while (first > 0 && (voiceNotes[first - 1] as Note).tie) first -= 1;
  let last = index;
  while (last < voiceNotes.length - 1 && (voiceNotes[last] as Note).tie) last += 1;
  return voiceNotes.slice(first, last + 1);
}

/** True when chord material remains: a finished chord, or an unfinished chord string at the cut (RULES.md C8). */
export function hasChordsAfter(chords: ReadonlyArray<Chord>, truncation: Truncation | null): boolean {
  return chords.length > 0 || truncation?.unfinishedChord === true;
}

/** Drops the unfinished chord string's flag when a command removes chord material on purpose. */
export function withoutUnfinishedChord(truncation: Truncation | null): Truncation | null {
  if (truncation?.unfinishedChord !== true) return truncation;
  return { voice: truncation.voice, bar: truncation.bar, short: truncation.short };
}

/** True when the cut measure has no finished note, rest or chord left, so the writer drops its line. */
function cutBarIsEmptyAfterChords(score: Score, chords: ReadonlyArray<Chord>, truncation: Truncation | null): boolean {
  if (truncation === null || !truncation.short) return false;
  const bar = score.bars[truncation.bar];
  if (bar === undefined) return false;
  const hasNote = score.notes.some((note) => note.voice === truncation.voice && note.bar === truncation.bar);
  const hasChord = chords.some((chord) => chord.start >= bar.start && chord.start < bar.start + bar.length);
  return !hasNote && !hasChord;
}

/** The model after removing chords empties the cut measure: its partial bar is gone and the cut moves before it. */
export function withoutEmptyCutBar(score: Score): Pick<Score, "bars" | "truncation" | "sections"> | null {
  const truncation = withoutUnfinishedChord(score.truncation);
  if (!cutBarIsEmptyAfterChords(score, [], truncation)) return null;
  const last = score.bars[score.bars.length - 1];
  const bars =
    last !== undefined && truncation !== null && truncation.bar === last.index && last.incomplete
      ? score.bars.slice(0, -1)
      : score.bars;
  const markers = score.sections.map((section) => ({ name: section.name, firstBar: section.firstBar }));
  const endOf = (voice: string): number => {
    let end = 0;
    for (const note of score.notes) if (note.voice === voice && note.bar + 1 > end) end = note.bar + 1;
    return end;
  };
  // The trimmed Vocal bar may leave the required Ins block short of whole bars; the cut then reads
  // in Ins, which is the only legal place for it, instead of inventing a Vocal block after it.
  const shortOther =
    truncation !== null && truncation.voice === "Vocal"
      ? score.voices.find((voice) => voice !== "Vocal" && endOf(voice) < truncation.bar)
      : undefined;
  return {
    bars,
    truncation:
      truncation === null
        ? null
        : shortOther === undefined
          ? { ...truncation, short: false }
          : { voice: shortOther, bar: endOf(shortOther), short: false },
    sections: sectionsFrom({ ...score, bars }, markers),
  };
}

/**
 * The model after a chord removal. Removing the last finished chord also removes an unfinished chord
 * string at the cut (RULES.md C8), and an emptied cut measure; chord material that remains keeps it.
 */
export function withoutChordMaterial(
  score: Score,
  chords: ReadonlyArray<Chord>,
): Pick<Score, "bars" | "truncation" | "sections" | "chords" | "hasChords"> {
  const trimmed = chords.length === 0 ? withoutEmptyCutBar(score) : null;
  const truncation =
    trimmed?.truncation ?? (chords.length === 0 ? withoutUnfinishedChord(score.truncation) : score.truncation);
  return {
    ...(trimmed ?? { bars: score.bars, sections: score.sections }),
    chords,
    truncation,
    hasChords: hasChordsAfter(chords, truncation),
  };
}

export function barTicks(meter: Meter): number {
  return (4 * meter.numerator * TICKS_PER_QUARTER) / meter.denominator;
}

export function isIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** The effective key at a tick: the last stated change at or before it, or the header key. */
export function effectiveKeyAt(score: Score, at: number, inclusive = true): string {
  let key = score.keys[0]?.key ?? "C";
  for (const change of score.keys) {
    if (change.at < at || (inclusive && change.at === at)) key = change.key;
    else break;
  }
  return key;
}

export function keyChangesInside(keys: ReadonlyArray<KeyChange>, start: number, length: number): KeyChange[] {
  return keys.filter((change) => change.at > start && change.at < start + length).map((change) => ({ ...change }));
}

/** Rebuilds sections from their markers. An unnamed section is added when music comes before the first marker. */
export function sectionsFrom(
  score: Score,
  markers: ReadonlyArray<{ name: string | null; firstBar: number }>,
): Score["sections"] {
  const ordered = [...markers].sort((left, right) => left.firstBar - right.firstBar);
  const withUnnamed =
    ordered.length === 0 || (ordered[0] as { firstBar: number }).firstBar > 0
      ? [{ name: null, firstBar: 0 }, ...ordered]
      : ordered;
  return withUnnamed.map((section, index) => {
    const next = withUnnamed[index + 1]?.firstBar ?? score.bars.length;
    return {
      name: section.name,
      firstBar: Math.max(0, section.firstBar),
      barCount: Math.max(0, next - section.firstBar),
    };
  });
}

export function orderNotes(score: Score, notes: ReadonlyArray<Note>): Note[] {
  const order = new Map<string, number>();
  for (let index = 0; index < score.voices.length; index += 1) order.set(score.voices[index] as string, index);
  return [...notes].sort((left, right) => {
    const voice = (order.get(left.voice) ?? 0) - (order.get(right.voice) ?? 0);
    return voice !== 0 ? voice : left.start - right.start;
  });
}

export function gcd(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

/** The largest common tick step of the score's notes and the given lengths; every piece of it is writable. */
export function scoreUnit(score: Score, extra: ReadonlyArray<number> = []): number {
  let unit = 0;
  for (const note of score.notes) unit = gcd(unit, note.duration);
  for (const bar of score.bars) unit = gcd(unit, bar.length);
  for (const length of extra) unit = gcd(unit, length);
  return Math.max(1, unit);
}

/**
 * Splits a length into the score unit, or into the whole length when it is one of the dialect's durations.
 * Every returned piece is a length the format can write; callers tie the note pieces and keep rests consecutive.
 */
export function splitLength(duration: number, unit: number, durations: DurationSet): number[] {
  if (duration <= 0) return [];
  const whole = duration / unit;
  if (Number.isInteger(whole) && durations.includes(whole)) return [duration];
  const pieces: number[] = [];
  let left = duration;
  while (left > 0) {
    const size = Math.min(unit, left);
    pieces.push(size);
    left -= size;
  }
  return pieces;
}

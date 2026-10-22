// ABOUTME: Small model helpers shared by the command files: ticks, ordering, sections, keys and writable lengths.
// ABOUTME: Keeping them here means insert, meter and truncation split and order notes the same way.
import type { KeyChange, Meter, Note, Score } from "./score";
import { TICKS_PER_QUARTER } from "./score";
import type { DurationSet } from "./types";

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

// ABOUTME: Pure facts the arrangement view derives from a score: pitch names and ranges, bar and beat positions, ties.
// ABOUTME: No DOM and no text in any language here; the editor draws them and the message catalog words them.
import type { Bar, Note, Score } from "./score";

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Scientific pitch name; MIDI 60 is C4. */
export function pitchName(midi: number): string {
  return `${PITCH_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export interface PitchRange {
  /** Lowest pitch row, a multiple of 12. */
  lo: number;
  /** One above the highest pitch row, a multiple of 12. */
  hi: number;
}

const EMPTY_RANGE: PitchRange = { lo: 48, hi: 72 };

/** The pitch rows of a voice: its notes' range plus a margin, rounded out to whole octaves. Rests have no pitch. */
export function pitchRangeOf(notes: ReadonlyArray<Note>): PitchRange {
  let min = 127;
  let max = 0;
  for (const note of notes) {
    if (note.midi === null) continue;
    if (note.midi < min) min = note.midi;
    if (note.midi > max) max = note.midi;
  }
  if (min > max) return EMPTY_RANGE;
  return {
    lo: Math.max(0, Math.floor((min - 3) / 12) * 12),
    hi: Math.min(132, Math.ceil((max + 4) / 12) * 12),
  };
}

/** The notes of each voice in text order, rests included. */
export function notesByVoice(score: Score): Map<string, Note[]> {
  const byVoice = new Map<string, Note[]>(score.voices.map((voice) => [voice, []]));
  for (const note of score.notes) byVoice.get(note.voice)?.push(note);
  return byVoice;
}

/** A position in a bar, counting from 1, in the beats of the bar's own meter. The beat may carry a fraction. */
export interface BarPosition {
  bar: number;
  beat: number;
  /** Ticks in one beat of the bar's meter: a quarter note under x/4, an eighth note under x/8. */
  beatTicks: number;
}

const WHOLE_NOTE_TICKS = 1024;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function positionOf(bars: ReadonlyArray<Bar>, barIndex: number, start: number): BarPosition {
  const bar = bars[barIndex];
  const beatTicks = bar ? WHOLE_NOTE_TICKS / bar.meter.denominator : WHOLE_NOTE_TICKS / 4;
  return { bar: barIndex + 1, beat: rounded(1 + (start - (bar?.start ?? start)) / beatTicks), beatTicks };
}

/** Length in the beats of the bar the note starts in. */
export function lengthInBeats(duration: number, beatTicks: number): number {
  return rounded(duration / beatTicks);
}

/**
 * The notes that continue into the next note of their voice: pitched, flagged as tied, and followed without a gap by a
 * note of the same pitch. A tie that leads nowhere (a cut, or a dangling tie) is not a join.
 */
export function tieJoins(notes: ReadonlyArray<Note>): Set<string> {
  const joined = new Set<string>();
  for (let index = 0; index + 1 < notes.length; index++) {
    const note = notes[index];
    const next = notes[index + 1];
    if (!note || !next || !note.tie || note.midi === null) continue;
    if (next.midi === note.midi && next.start === note.start + note.duration) joined.add(note.id);
  }
  return joined;
}

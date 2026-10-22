// ABOUTME: Pure facts the arrangement view derives from a score: pitch names and ranges, bar and beat positions, ties.
// ABOUTME: No DOM and no text in any language here; the editor draws them and the message catalog words them.
import type { Bar, Meter, Note, Score } from "./score";

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

/** The index of the bar `tick` falls in: the last bar that starts at or before it, or the first bar. */
export function barIndexAt(bars: ReadonlyArray<Bar>, tick: number): number {
  let index = 0;
  for (const bar of bars) {
    if (bar.start > tick) break;
    index = bar.index;
  }
  return index;
}

export function positionOf(bars: ReadonlyArray<Bar>, barIndex: number, start: number): BarPosition {
  const bar = bars[barIndex];
  const beatTicks = bar ? WHOLE_NOTE_TICKS / bar.meter.denominator : WHOLE_NOTE_TICKS / 4;
  return { bar: barIndex + 1, beat: rounded(1 + (start - (bar?.start ?? start)) / beatTicks), beatTicks };
}

/** Where an insertion point at `tick` stands in the bars, or null at the end of the score, where no bar has the next beat. */
export function insertionPosition(score: Score, tick: number): BarPosition | null {
  return tick >= gridTicks(score) ? null : positionOf(score.bars, barIndexAt(score.bars, tick), tick);
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

/** Length of the shared bar grid, in ticks. */
export function gridTicks(score: Score): number {
  const last = score.bars[score.bars.length - 1];
  return last ? last.start + last.length : 0;
}

/**
 * The beat lines of the bar grid in order, each bar's own meter deciding its beat, then the end of the grid last. The
 * end is the one line that belongs to no bar.
 */
function beatLines(bars: ReadonlyArray<Bar>): number[] {
  const lines: number[] = [];
  for (const bar of bars) {
    const beatTicks = WHOLE_NOTE_TICKS / bar.meter.denominator;
    for (let beat = 0; beat < bar.meter.numerator; beat++) lines.push(bar.start + beat * beatTicks);
  }
  const last = bars[bars.length - 1];
  if (last) lines.push(last.start + last.length);
  return lines;
}

/** The beat line closest to `tick`; a tick halfway between two lines belongs to the earlier one. */
export function nearestBeatLine(bars: ReadonlyArray<Bar>, tick: number): number {
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (const line of beatLines(bars)) {
    const away = Math.abs(line - tick);
    if (away < distance) {
      nearest = line;
      distance = away;
    }
  }
  return nearest;
}

/** The last beat line before `tick`, or the start of the grid when there is none. */
export function beatLineBefore(bars: ReadonlyArray<Bar>, tick: number): number {
  let before = 0;
  for (const line of beatLines(bars)) {
    if (line >= tick) break;
    before = line;
  }
  return before;
}

/** The first beat line after `tick`, or the end of the grid when there is none. */
export function beatLineAfter(bars: ReadonlyArray<Bar>, tick: number): number {
  const lines = beatLines(bars);
  return lines.find((line) => line > tick) ?? lines[lines.length - 1] ?? 0;
}

/** Where a cut score stops, in the voice that was cut. */
export interface Cut {
  readonly voice: string;
  /** 1-based number of the incomplete bar when `short`; otherwise the number of complete bars before the cut. */
  readonly bar: number;
  /** True when the cut is inside a bar, so that bar is incomplete. */
  readonly short: boolean;
  /** Where the bar of the cut begins, or the end of the grid when the cut is at a bar line past the last bar. */
  readonly at: number;
  /** From here to the end of the grid the cut voice has nothing. */
  readonly missingFrom: number;
}

export function cutOf(score: Score): Cut | null {
  const cut = score.truncation;
  if (!cut) return null;
  const at = score.bars[cut.bar]?.start ?? gridTicks(score);
  let missingFrom = at;
  if (cut.short) {
    for (const note of score.notes) {
      if (note.voice === cut.voice && note.bar === cut.bar) {
        missingFrom = Math.max(missingFrom, note.start + note.duration);
      }
    }
  }
  return { voice: cut.voice, bar: cut.short ? cut.bar + 1 : cut.bar, short: cut.short, at, missingFrom };
}

/** What takes effect at one position: a new meter, a new key, the cut of the score, or several at once. */
export interface Mark {
  readonly at: number;
  readonly meter: Meter | null;
  readonly key: string | null;
  readonly cut: Cut | null;
}

/**
 * The marks of the key and meter timelines: the state in force at the start, then each change where it takes effect.
 * A key that the text states again without changing it, and a meter that stays the same, are not changes.
 */
export function marksOf(score: Score): Mark[] {
  const byPosition = new Map<number, { meter: Meter | null; key: string | null; cut: Cut | null }>();
  const at = (position: number) => {
    let entry = byPosition.get(position);
    if (!entry) {
      entry = { meter: null, key: null, cut: null };
      byPosition.set(position, entry);
    }
    return entry;
  };
  let meter: Meter | null = null;
  for (const bar of score.bars) {
    if (meter && bar.meter.numerator === meter.numerator && bar.meter.denominator === meter.denominator) continue;
    meter = bar.meter;
    at(bar.start).meter = bar.meter;
  }
  let key: string | null = null;
  for (const change of score.keys) {
    if (change.key === key) continue;
    key = change.key;
    at(change.at).key = key;
  }
  const cut = cutOf(score);
  if (cut) at(cut.at).cut = cut;
  return [...byPosition].sort(([a], [b]) => a - b).map(([position, entry]) => ({ at: position, ...entry }));
}

/** A stretch of bars in one meter: where the grid draws a bar line every `barTicks` and a beat line every `beatTicks`. */
export interface GridRun {
  readonly start: number;
  readonly end: number;
  readonly barTicks: number;
  readonly beatTicks: number;
}

export function gridRunsOf(score: Score): GridRun[] {
  const runs: { start: number; end: number; meter: Meter }[] = [];
  for (const bar of score.bars) {
    const run = runs.at(-1);
    if (run && run.meter.numerator === bar.meter.numerator && run.meter.denominator === bar.meter.denominator) {
      run.end = bar.start + bar.length;
    } else {
      runs.push({ start: bar.start, end: bar.start + bar.length, meter: bar.meter });
    }
  }
  return runs.map(({ start, end, meter }) => {
    const beatTicks = WHOLE_NOTE_TICKS / meter.denominator;
    return { start, end, barTicks: beatTicks * meter.numerator, beatTicks };
  });
}

/** Beat lines closer than this, in pixels, read as noise rather than as a grid, so only bar lines are drawn. */
export const MIN_BEAT_LINE_PIXELS = 12;
/** Bar lines closer than this make a comb over the notes; the lanes then draw none and the ruler carries the bars. */
export const MIN_BAR_LINE_PIXELS = 10;

/** The zoom levels of the menu; the buttons and keys step through them. 1 is the host's beat width. */
export const ZOOM_PRESETS: ReadonlyArray<number> = [0.1, 0.25, 0.5, 1, 1.5, 2, 4];
export const ZOOM_MIN = 0.01;
export const ZOOM_MAX = 4;

/** The next preset above or below `zoom`, or `null` at the end of the list. */
export function stepZoom(zoom: number, direction: "in" | "out"): number | null {
  const epsilon = 1e-6;
  if (direction === "in") return ZOOM_PRESETS.find((preset) => preset > zoom + epsilon) ?? null;
  return [...ZOOM_PRESETS].reverse().find((preset) => preset < zoom - epsilon) ?? null;
}

/** The labelled bars shown are every `step`-th, the smallest power of two that leaves room for a number. */
export const MAX_LABEL_STEP = 32;
const LABEL_ROOM = 32;

export function barLabelStep(barPixels: number): number {
  let step = 1;
  while (step < MAX_LABEL_STEP && step * barPixels < LABEL_ROOM) step *= 2;
  return step;
}

/** How many times 2 divides `index`, up to the largest label step: which label steps keep this bar's number. */
export function labelRank(index: number): number {
  let rank = 0;
  while (rank < Math.log2(MAX_LABEL_STEP) && index % 2 ** (rank + 1) === 0) rank += 1;
  return rank;
}

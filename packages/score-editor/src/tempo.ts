// ABOUTME: The tempo map of a score: seconds and ticks in either direction, with a tempo change in the middle of the score.
// ABOUTME: Pure and headless; the staff cursor and the synth preview schedule both count time through it.
import { gridTicks } from "./arrangement";
import type { Score, Tempo } from "./score";

/** Ticks in a whole note, the unit the tempo's note value is measured in. */
const WHOLE_NOTE_TICKS = 1024;

interface TempoPoint {
  readonly at: number;
  readonly tempo: Tempo;
}

/** The tempo points in force, in order: the score's opening tempo, then each change it carries. */
function pointsOf(score: Score): TempoPoint[] {
  const points: TempoPoint[] = [{ at: 0, tempo: score.tempo }];
  for (const change of score.tempoChanges ?? []) {
    if (!Number.isFinite(change.at) || change.at < 0) continue;
    points.push(change);
  }
  // A stable sort keeps the last change written at one tick last, which is the one in force there.
  return points.sort((a, b) => a.at - b.at);
}

/** Seconds in one tick under `tempo`: the tempo names a note value (such as "1/4") and how many go in a minute. */
export function secondsPerTick(tempo: Tempo): number {
  const denominator = Number(/^1\/(\d+)$/.exec(tempo.unit)?.[1] ?? 4);
  return 60 / (tempo.bpm * (WHOLE_NOTE_TICKS / denominator));
}

/** Seconds from the start of the score to `tick`, each stretch at the tempo in force there. */
export function secondsAtTick(score: Score, tick: number): number {
  const end = Math.max(0, tick);
  let seconds = 0;
  let from = 0;
  let tempo = score.tempo;
  for (const point of pointsOf(score)) {
    if (point.at <= from) {
      tempo = point.tempo;
      continue;
    }
    if (point.at >= end) break;
    seconds += (point.at - from) * secondsPerTick(tempo);
    from = point.at;
    tempo = point.tempo;
  }
  return seconds + (end - from) * secondsPerTick(tempo);
}

/**
 * The tick at `seconds` from the start of the score, or the last tick when the time is past the end and the first at
 * or before zero. A tempo change part-way through the score is followed; a score with no bars is at tick 0.
 */
export function tickAtSeconds(score: Score, seconds: number): number {
  const end = gridTicks(score);
  if (!(end > 0)) return 0;
  const duration = secondsAtTick(score, end);
  const at = Number.isFinite(seconds) ? Math.min(Math.max(0, seconds), duration) : seconds > 0 ? duration : 0;
  let from = 0;
  let elapsed = 0;
  let tempo = score.tempo;
  for (const point of pointsOf(score)) {
    if (point.at >= end) break;
    if (point.at <= from) {
      tempo = point.tempo;
      continue;
    }
    const span = (point.at - from) * secondsPerTick(tempo);
    if (at < elapsed + span) return from + (at - elapsed) / secondsPerTick(tempo);
    elapsed += span;
    from = point.at;
    tempo = point.tempo;
  }
  return Math.min(end, from + (at - elapsed) / secondsPerTick(tempo));
}

// ABOUTME: The editor's side of the time grid: the grid a session starts with, the grids the control offers, and snapping a tick to a line.
// ABOUTME: One step is worked out by the note commands (gridStepOf); this file adds no second reading of a grid, only where its lines are.
import { GRID_VALUES, type Grid, gridStepOf } from "./commands-notes";

/** The grid a session starts with: a quarter note, the beat line of a bar in 4/4. */
export const DEFAULT_GRID: Grid = { value: 4 };

/**
 * The grids the control offers, in the order of its menu: the plain values, then the dotted ones. The control leaves out
 * the 1/32 pair for a score that cannot write 1/32, and mutes any other the score cannot write.
 */
export const GRID_CHOICES: ReadonlyArray<Grid> = [
  ...GRID_VALUES.map((value): Grid => ({ value })),
  ...GRID_VALUES.map((value): Grid => ({ value, dotted: true })),
];

/** The grid written one way: `dotted` is there only when it is true. Null for a value that is not a grid. */
export function normalizeGrid(grid: Grid): Grid | null {
  if (gridStepOf(grid) === null) return null;
  return grid.dotted === true ? { value: grid.value, dotted: true } : { value: grid.value };
}

export function sameGrid(a: Grid, b: Grid): boolean {
  return a.value === b.value && (a.dotted === true) === (b.dotted === true);
}

/**
 * The grid line nearest `tick`, counted from the start of the score as the note commands count them, and kept inside
 * the score: the end of the score is a line of every grid, whether or not a step divides it. Halfway goes later, as the
 * commands round.
 */
export function snapToGrid(tick: number, step: number, end: number): number {
  const before = Math.floor(tick / step) * step;
  const after = before + step;
  const lines = [before, after].map((line) => Math.min(end, Math.max(0, line)));
  const [low = 0, high = 0] = lines;
  return tick - low < high - tick ? low : high;
}

/** The last line before `tick`, or the start of the score. */
export function gridLineBefore(tick: number, step: number): number {
  return Math.max(0, (Math.ceil(tick / step) - 1) * step);
}

/** The first line after `tick`, or the end of the score when no step reaches it. */
export function gridLineAfter(tick: number, step: number, end: number): number {
  return Math.min(end, (Math.floor(tick / step) + 1) * step);
}

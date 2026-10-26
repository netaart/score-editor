// ABOUTME: The Filter panel's conditions as data, and the pure step from them to a NoteFilter.
// ABOUTME: It holds no DOM: the panel reads its fields into these conditions, and filterNotes judges the score.
import { countIsValid, type NoteFilter } from "./filter-notes";
import type { Bar, Score } from "./score";

/** The conditions as the panel holds them: what each one is set to, and whether it counts. */
export interface Conditions {
  pitch: { on: boolean; min: number | null; max: number | null };
  /** Bar numbers as the ruler counts them, from 1; a bar that is not given leaves that end of the range open. */
  time: { on: boolean; first: number | null; last: number | null };
  /** Lengths in ticks. */
  length: { on: boolean; min: number | null; max: number | null };
  key: { on: boolean; mode: "in" | "out" };
  count: { on: boolean; every: number | null; skip: number | null };
  /** Whether to select the notes the conditions do not pick. */
  invert: boolean;
}

/** What the panel's fields hold, before they are read as conditions: numbers as the fields write them, or empty. */
export interface ConditionFields {
  pitch: { on: boolean; min: string; max: string };
  time: { on: boolean; first: string; last: string };
  length: { on: boolean; min: string; max: string };
  key: { on: boolean; mode: string };
  count: { on: boolean; every: string; skip: string };
  invert: boolean;
}

/** The conditions a panel starts with: nothing on, Every 2 and Skip 0, as the Count row shows them. */
export function createConditions(): Conditions {
  return {
    pitch: { on: false, min: null, max: null },
    time: { on: false, first: null, last: null },
    length: { on: false, min: null, max: null },
    key: { on: false, mode: "in" },
    count: { on: false, every: 2, skip: 0 },
    invert: false,
  };
}

function numberOrNull(value: string): number | null {
  return value === "" ? null : Number(value);
}

/** Takes what the panel's fields hold into the conditions. A cleared number is missing, not zero. */
export function readConditions(conditions: Conditions, fields: ConditionFields): void {
  conditions.pitch.on = fields.pitch.on;
  conditions.pitch.min = numberOrNull(fields.pitch.min);
  conditions.pitch.max = numberOrNull(fields.pitch.max);
  conditions.time.on = fields.time.on;
  conditions.time.first = numberOrNull(fields.time.first);
  conditions.time.last = numberOrNull(fields.time.last);
  conditions.length.on = fields.length.on;
  conditions.length.min = numberOrNull(fields.length.min);
  conditions.length.max = numberOrNull(fields.length.max);
  conditions.key.on = fields.key.on;
  if (fields.key.mode === "in" || fields.key.mode === "out") conditions.key.mode = fields.key.mode;
  conditions.count.on = fields.count.on;
  conditions.count.every = numberOrNull(fields.count.every);
  conditions.count.skip = numberOrNull(fields.count.skip);
  conditions.invert = fields.invert;
}

/** The tick a bar number starts at; a number past the last bar is the end of the score, one below 1 leaves the range open. */
function barStart(bars: ReadonlyArray<Bar>, number: number | null): number | undefined {
  if (number === null || number < 1) return undefined;
  const bar = bars[number - 1];
  const last = bars[bars.length - 1];
  return bar !== undefined ? bar.start : last !== undefined ? last.start + last.length : 0;
}

/** The tick a bar number ends at; a number past the last bar leaves the range open, one below 1 ends it at the start. */
function barEnd(bars: ReadonlyArray<Bar>, number: number | null): number | undefined {
  if (number === null || number > bars.length) return undefined;
  const bar = bars[number - 1];
  return bar === undefined ? 0 : bar.start + bar.length;
}

/** What the conditions make: the filter to give filterNotes, how many conditions are on, and whether one cannot match. */
export interface CurrentFilter {
  readonly filter: NoteFilter;
  readonly count: number;
  readonly invalid: boolean;
}

/** Reads the conditions against a score into a NoteFilter, counting the conditions that are on and naming an impossible one. */
export function currentFilter(score: Score, conditions: Conditions): CurrentFilter {
  let filter: NoteFilter = {};
  let conditionsOn = 0;
  let invalid = false;
  const { pitch: p } = conditions;
  if (p.on) {
    conditionsOn += 1;
    if (p.min !== null && p.max !== null) {
      filter = { ...filter, pitch: { min: p.min, max: p.max } };
      if (p.min > p.max) invalid = true;
    }
  }
  if (conditions.time.on) {
    const from = barStart(score.bars, conditions.time.first);
    const to = barEnd(score.bars, conditions.time.last);
    filter = { ...filter, time: { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) } };
    conditionsOn += 1;
    if (from !== undefined && to !== undefined && from >= to) invalid = true;
  }
  if (conditions.length.on) {
    conditionsOn += 1;
    if (conditions.length.min !== null && conditions.length.max !== null) {
      filter = { ...filter, duration: { min: conditions.length.min, max: conditions.length.max } };
      if (conditions.length.min > conditions.length.max) invalid = true;
    }
  }
  if (conditions.key.on) {
    filter = { ...filter, key: conditions.key.mode };
    conditionsOn += 1;
  }
  if (conditions.count.on) {
    // Skip is optional and defaults to 0; a missing Every, or a supplied number that is not a count, takes no note.
    const every = conditions.count.every ?? Number.NaN;
    const skip = conditions.count.skip ?? 0;
    filter = { ...filter, count: { every, skip } };
    conditionsOn += 1;
    if (
      !countIsValid({
        every,
        ...(conditions.count.skip === null ? {} : { skip: conditions.count.skip }),
      })
    )
      invalid = true;
  }
  if (conditions.invert) filter = { ...filter, invert: true };
  return { filter, count: conditionsOn, invalid };
}

// ABOUTME: The meters a dialect's MeterRule allows, and the common ones a meter control offers before its custom row.
// ABOUTME: Pure: the same rules the command layer applies, so the control cannot offer a meter the command would refuse.
import type { Meter } from "./score";
import type { DialectConstraints, MeterRule } from "./types";

/** The meters a control offers as one press when the dialect allows them; every other allowed meter takes the custom row. */
export const COMMON_METERS: ReadonlyArray<Meter> = [
  { numerator: 2, denominator: 2 },
  { numerator: 3, denominator: 2 },
  { numerator: 4, denominator: 2 },
  { numerator: 2, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 6, denominator: 4 },
  { numerator: 7, denominator: 4 },
  { numerator: 3, denominator: 8 },
  { numerator: 5, denominator: 8 },
  { numerator: 6, denominator: 8 },
  { numerator: 7, denominator: 8 },
  { numerator: 9, denominator: 8 },
  { numerator: 12, denominator: 8 },
];

/** Whether `meter` is a fraction of positive integers inside `rule`, as rules H3 of the song2 format describe. */
export function meterAllowed(meter: Meter, rule: MeterRule): boolean {
  if (rule.form !== "fraction") return false;
  if (!Number.isInteger(meter.numerator) || !Number.isInteger(meter.denominator)) return false;
  if (meter.numerator < rule.numerator.min || meter.numerator > rule.numerator.max) return false;
  if (meter.denominator < rule.denominator.min || meter.denominator > rule.denominator.max) return false;
  if (meter.numerator < 1 || meter.denominator < 1) return false;
  return !rule.denominator.powerOfTwo || (meter.denominator & (meter.denominator - 1)) === 0;
}

/** The common meters `constraints` allows; a dialect narrower than all of them gets an empty list for its custom row. */
export function meterChoices(constraints: DialectConstraints): Meter[] {
  return COMMON_METERS.filter((meter) => meterAllowed(meter, constraints.meter)).map((meter) => ({ ...meter }));
}

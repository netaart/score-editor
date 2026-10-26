// ABOUTME: The pitch classes of a key's scale, as the keys spelling.ts reads them.
// ABOUTME: filterNotes asks whether a note's pitch class is in or out of the key in force where it starts.
import { parseKey } from "./spelling";

const MAJOR_SCALE: ReadonlyArray<number> = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE: ReadonlyArray<number> = [0, 2, 3, 5, 7, 8, 10];

/**
 * The seven pitch classes (0 for C through 11 for B) of a key's scale: the major scale, or for a minor key the natural
 * minor, which is the same seven as its relative major. Null for a key this module cannot read.
 */
export function keyPitchClasses(key: string): ReadonlySet<number> | null {
  const parts = parseKey(key);
  if (parts === null) return null;
  return new Set((parts.minor ? NATURAL_MINOR_SCALE : MAJOR_SCALE).map((step) => (parts.pitchClass + step) % 12));
}

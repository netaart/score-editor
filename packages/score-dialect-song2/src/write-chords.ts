// ABOUTME: The song2 writer's rule for cut tails: X4 chord strings go with the last chord and X5 tie continuations with the tie.
// ABOUTME: Other X4 remainders stay byte for byte; RULES.md C8 and X17 decide each case.
import type { Score } from "@neta-art/score-editor";
import type { Song2CutTail } from "./parser";

/** True when the bytes of a cut tail still belong to the written score. */
export function keepsCutTail(score: Score, tail: Song2CutTail | null, lastNoteTied: boolean): boolean {
  if (tail === null) return false;
  if (tail.kind === "x5") return lastNoteTied;
  if (tail.kind === "x4-chord") return score.hasChords;
  return true;
}

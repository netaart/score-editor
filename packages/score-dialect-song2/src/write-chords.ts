// ABOUTME: The song2 writer's rule for chord material left in a cut tail, kept apart so writer.ts stays small.
// ABOUTME: RULES.md C8 and X17: an unfinished chord tail is kept only while the model still carries a chord.
import type { Score } from "@neta-art/score-editor";
import type { Song2CutTail } from "./parser";

/** True when the bytes of a cut tail still belong to the written score. */
export function keepsCutTail(score: Score, tail: Song2CutTail | null, tied: boolean): boolean {
  if (tail === null) return false;
  if (tail.kind === "x5") return tied;
  if (tail.raw.startsWith('"')) return score.hasChords;
  return true;
}

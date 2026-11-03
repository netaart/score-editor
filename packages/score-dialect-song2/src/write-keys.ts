// ABOUTME: Writer support for key changes: it tells the writer when an edit added a key change or moved one.
// ABOUTME: The in-place path rewrites the values of the K: fields the text has and can drop the last ones; an added or moved key needs the bar-grid writer.
import type { KeyChange, Score } from "@neta-art/score-editor";
import type { Song2Source } from "./parser";

/**
 * True when the score's key changes are the text's own, in order: each stands where the text's change at the same place
 * in the timeline stood, and there are no more of them. Such an edit rewrites a key's value, or drops the last keys, in
 * place. A key that is added or moved needs the bar-grid writer, which writes every key field from the model.
 */
export function keysFitSource(score: Score, source: Song2Source): boolean {
  return (
    score.keys.length <= source.keys.length &&
    score.keys.every((change, index) => change.at === (source.keys[index] as KeyChange).at)
  );
}

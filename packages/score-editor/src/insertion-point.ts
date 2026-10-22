// ABOUTME: The insertion point line of a voice lane: a line with a flag through the lane, named for screen readers.
// ABOUTME: It knows its lane and the score the lane was drawn for, and nothing of the notes or the selection.
import { gridTicks, insertionPosition } from "./arrangement";
import { create } from "./dom";
import type { Messages } from "./i18n";
import type { Score } from "./score";
import type { InsertionPoint } from "./session";

export interface InsertionPointLine {
  /** Draws the line at `point`, moves it, or takes it away when `point` is null or lies past the end of the score. */
  show(point: InsertionPoint | null): void;
}

/** The insertion point line of `lane`, which was drawn for `score`. */
export function createInsertionPointLine(lane: HTMLElement, score: Score, t: Messages): InsertionPointLine {
  const ticks = gridTicks(score);
  let line: HTMLElement | null = null;
  return {
    show(point) {
      if (point === null || point.tick > ticks) {
        line?.remove();
        line = null;
        return;
      }
      if (!line) {
        line = create(lane.ownerDocument, "div", "sce-insertion-point", lane);
        line.setAttribute("role", "separator");
        line.setAttribute("aria-orientation", "vertical");
      }
      line.style.setProperty("--t", String(point.tick));
      line.setAttribute("aria-label", t.insertionPoint(insertionPosition(score, point.tick)));
    },
  };
}

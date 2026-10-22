// ABOUTME: The playhead of a voice lane: a hairline through the lane at the tick the synth preview is playing, and the view that follows it.
// ABOUTME: It knows its lane, the score the lane was drawn for and the session's time axis, and nothing of the player.
import { gridTicks } from "./arrangement";
import { revealTick, tickPlace, turnTo } from "./axis";
import { create } from "./dom";
import type { Score } from "./score";
import type { EditingSession } from "./session";

export interface PlayheadLine {
  /** Draws the line at `tick`, moves it, or takes it away when `tick` is null or lies past the end of the score. */
  show(tick: number | null): void;
}

/** The playhead line of `lane`, which was drawn for `score`. */
export function createPlayheadLine(lane: HTMLElement, score: Score): PlayheadLine {
  const ticks = gridTicks(score);
  let line: HTMLElement | null = null;
  return {
    show(tick) {
      if (tick === null || tick > ticks) {
        line?.remove();
        line = null;
        return;
      }
      if (!line) {
        line = create(lane.ownerDocument, "div", "sce-playhead", lane);
        line.setAttribute("aria-hidden", "true");
      }
      line.style.setProperty("--t", String(tick));
    },
  };
}

export interface PlayheadFollower {
  /** Takes the tick under the playhead, or null when the preview is not playing, and scrolls the axis to keep it in view. */
  follow(tick: number | null): void;
}

/**
 * Keeps the playhead in view while it moves: it brings the start into view, and turns the page when the playhead passes
 * the right edge. When the user scrolls or zooms the playhead out of view, the view is theirs and is left alone, until
 * they bring the playhead back into it.
 */
export function createPlayheadFollower(session: EditingSession): PlayheadFollower {
  let following = false;
  let started = false;
  let seen = session.view.scrollLeft;
  return {
    follow(tick) {
      if (tick === null) {
        started = false;
        following = false;
        return;
      }
      if (!started) {
        started = true;
        following = true;
        revealTick(session, tick);
        seen = session.view.scrollLeft;
        return;
      }
      const place = tickPlace(session, tick);
      // A change of scroll that this follower did not make is the user's, or another track's turn of the same page.
      if (session.view.scrollLeft !== seen) following = place === "inside";
      if (following && place === "after") turnTo(session, tick);
      seen = session.view.scrollLeft;
    },
  };
}

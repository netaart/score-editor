// ABOUTME: A polite live region for a view part: the one place a part says in words what it did, for screen readers.
// ABOUTME: The node lives as long as the part does, so a redraw of the part's content never takes it away mid-sentence.
import { type Diagnostic, formatDiagnostic } from "./diagnostics";
import { create } from "./dom";
import type { EditingSession } from "./session";
import type { EditingPartOptions } from "./types";

export interface LiveRegion {
  /** Replaces what the region says; a screen reader reads the new words when it is idle. */
  say(words: string): void;
}

/** Adds a visually hidden, polite live region to `parent`. */
export function createLiveRegion(parent: HTMLElement): LiveRegion {
  const region = create(parent.ownerDocument, "div", "sce-sr-only", parent);
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  return {
    say(words) {
      region.textContent = words;
    },
  };
}

/**
 * What a part does when the user's keys or its own control caused a refusal: it says why, and where, in the session's
 * language, and then tells whoever asked to hear of refusals.
 */
export function sayRefusals(
  live: LiveRegion,
  session: EditingSession,
  onRefused: EditingPartOptions["onRefused"],
): (diagnostics: ReadonlyArray<Diagnostic>) => void {
  return (diagnostics) => {
    const first = diagnostics[0];
    if (first !== undefined) live.say(formatDiagnostic(first, session.view.language));
    onRefused?.(diagnostics);
  };
}

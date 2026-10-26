// ABOUTME: The strip under a toolbar's row for what a taken command itself had to say, which stays until the project changes.
// ABOUTME: It keeps the strip's role, its bar and its language redraw, so the toolbar only wires it to the song controls.
import { type Diagnostic, formatDiagnostic } from "./diagnostics";
import { create } from "./dom";
import type { EditingSession } from "./session";
import type { ViewPart } from "./types";

/** The toolbar's one sentence: `show` draws what a taken command said, and `clear` takes it away. */
export interface ProjectNoticeStrip extends ViewPart {
  /** Shows `notices` and gives back the sentence it drew. */
  show(notices: ReadonlyArray<Diagnostic>): string;
  /** Takes the sentence away, as the next change to the project does. */
  clear(): void;
}

/**
 * Makes the strip in `root`, which must sit in a `.sce-root`: a `note` landmark with a bar at its start, hidden while
 * there is nothing to say. It follows the session's language, and `destroy` removes it with the toolbar.
 */
export function mountProjectNoticeStrip(root: HTMLElement, session: EditingSession): ProjectNoticeStrip {
  const doc = root.ownerDocument;
  const strip = create(doc, "p", "sce-notice sce-project-notice", root);
  strip.setAttribute("role", "note");
  strip.hidden = true;
  let told: ReadonlyArray<Diagnostic> = [];
  let language = session.view.language;

  function draw(): void {
    language = session.view.language;
    strip.textContent = told.map((notice) => formatDiagnostic(notice, language)).join(" ");
    strip.hidden = told.length === 0;
  }

  const unsubscribe = session.subscribe(() => {
    if (session.view.language !== language) draw();
  });
  draw();
  let destroyed = false;
  return {
    show(notices) {
      told = notices;
      draw();
      return strip.textContent ?? "";
    },
    clear() {
      if (told.length === 0) return;
      told = [];
      draw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      strip.remove();
    },
  };
}

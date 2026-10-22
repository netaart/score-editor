// ABOUTME: The cut notice view part: the one sentence that says the score text stops before the song does, and where.
// ABOUTME: It is hidden when the score is complete or cannot be read.
import { cutOf } from "./arrangement";
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { ViewPart } from "./types";

/** Mounts the cut notice on `el`. It follows the session's reading and language. */
export function mountCutNotice(el: HTMLElement, session: EditingSession): ViewPart {
  requireDom("mountCutNotice");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-notice");
  el.appendChild(root);
  const notice = create(doc, "div", "sce-notice sce-cut-notice", root);
  notice.setAttribute("role", "note");

  let reading = session.reading;
  let language = session.view.language;
  function render(): void {
    reading = session.reading;
    language = session.view.language;
    root.lang = language;
    const cut = reading.kind === "score" ? cutOf(reading.score) : null;
    notice.hidden = !cut;
    notice.textContent = cut ? messagesFor(language).cutNotice(cut) : "";
  }

  render();
  const unsubscribe = session.subscribe(() => {
    if (session.reading !== reading || session.view.language !== language) render();
  });
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      root.remove();
      releaseStyles();
    },
  };
}

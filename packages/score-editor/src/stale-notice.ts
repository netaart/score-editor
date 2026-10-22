// ABOUTME: The stale notice view part: the one sentence that says the text view holds text the project did not take.
// ABOUTME: It is hidden while the project has the text the text view shows.

import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { ViewPart } from "./types";
import { viewsBehindText } from "./view-rules";

/**
 * Mounts the stale notice on `el`. A host puts it above the views that draw the project, which keep showing the last
 * score that could be read while the text view holds text that cannot be. It follows the session's rejected text and
 * language.
 */
export function mountStaleNotice(el: HTMLElement, session: EditingSession): ViewPart {
  requireDom("mountStaleNotice");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-stale");
  el.appendChild(root);
  const notice = create(doc, "div", "sce-notice sce-stale-notice", root);
  notice.setAttribute("role", "note");

  /** What the last draw showed, so a change this part does not draw, such as a scroll, costs nothing here. */
  let drawn = "";
  function render(): void {
    const { language } = session.view;
    const stale = viewsBehindText(session);
    const shown = `${language} ${stale}`;
    if (shown === drawn) return;
    drawn = shown;
    root.lang = language;
    notice.hidden = !stale;
    notice.textContent = stale ? messagesFor(language).staleNotice : "";
  }

  render();
  const unsubscribe = session.subscribe(render);
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

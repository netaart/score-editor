// ABOUTME: The problem view part: why there is no score to show, in the session's language, when the score cannot be read.
// ABOUTME: It lists the dialect's diagnostics, or names a model with no dialect; with a readable score it draws nothing.

import { formatDiagnostic } from "./diagnostics";
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { ViewPart } from "./types";

/** The most diagnostics listed; a score that fails everywhere should not fill the screen with it. */
const MAX_LISTED_DIAGNOSTICS = 20;

/** Mounts the problem view on `el`. It follows the session's reading and language. */
export function mountProblemView(el: HTMLElement, session: EditingSession): ViewPart {
  requireDom("mountProblemView");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-problem");
  el.appendChild(root);

  let reading = session.reading;
  let language = session.view.language;
  function render(): void {
    reading = session.reading;
    language = session.view.language;
    root.lang = language;
    root.replaceChildren();
    if (reading.kind === "score") return;
    const t = messagesFor(language);
    const panel = create(doc, "div", "sce-problem", root);
    panel.setAttribute("role", "alert");
    if (reading.kind === "no-dialect") {
      create(doc, "p", "sce-problem-title", panel).textContent = t.noDialect(reading.modelId);
      return;
    }
    create(doc, "p", "sce-problem-title", panel).textContent = t.unreadable;
    const list = create(doc, "ul", "sce-problem-list", panel);
    for (const diagnostic of reading.diagnostics.slice(0, MAX_LISTED_DIAGNOSTICS)) {
      create(doc, "li", "sce-problem-item", list).textContent = formatDiagnostic(diagnostic, language);
    }
    const more = reading.diagnostics.length - MAX_LISTED_DIAGNOSTICS;
    if (more > 0) create(doc, "p", "sce-problem-more", panel).textContent = t.moreProblems(more);
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

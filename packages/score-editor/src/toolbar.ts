// ABOUTME: The toolbar view part: the title, the zoom control, undo and redo, the read-only badge and the screen-reader hint.
// ABOUTME: Undo and redo are there while the session is editable; the row scrolls sideways when its box is narrower than its controls.
import { create, requireDom } from "./dom";
import { installEditKeys } from "./edit-keys";
import { messagesFor } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { EditingPartOptions, Language, ViewPart } from "./types";
import { mountZoomControl } from "./zoom-control";

export interface ToolbarOptions extends EditingPartOptions {
  /**
   * The id to give the screen-reader hint. A host that points a view's `aria-describedby` at it gets the hint; without
   * this option the toolbar draws no hint, since a hint nothing refers to would only be noise.
   */
  hintId?: string;
}

const SVG = "http://www.w3.org/2000/svg";

/**
 * An arrow that turns back on itself; redo is the same drawing mirrored by the stylesheet. It is built of polylines,
 * since the reset that isolates the parts reverts every CSS property, and a path's `d` is one, where `points` is not.
 */
function arrowIcon(doc: Document): SVGSVGElement {
  const icon = doc.createElementNS(SVG, "svg");
  icon.setAttribute("class", "sce-icon");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  for (const points of ["5.5,2.5 2.5,5.5 5.5,8.5", "2.5,5.5 9.5,5.5 12.5,7.5 12.5,10.5 9.5,12.5 5,12.5"]) {
    const line = doc.createElementNS(SVG, "polyline");
    line.setAttribute("points", points);
    icon.appendChild(line);
  }
  return icon;
}

/**
 * Mounts the toolbar on `el`. It holds the title, the zoom control, undo and redo (while the session is editable), the
 * read-only badge (while it is not) and, when asked, the screen-reader hint. It follows the session's language.
 */
export function mountToolbar(el: HTMLElement, session: EditingSession, options: ToolbarOptions = {}): ViewPart {
  requireDom("mountToolbar");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-toolbar");
  el.appendChild(root);

  const row = create(doc, "div", "sce-toolbar", root);
  const title = create(doc, "span", "sce-title", row);
  const zoom = mountZoomControl(row, session);
  const history = create(doc, "div", "sce-history", row);
  history.setAttribute("role", "group");
  const historyButton = (action: "undo" | "redo"): HTMLButtonElement => {
    const button = create(doc, "button", `sce-button sce-icon-button sce-${action}`, history);
    button.type = "button";
    button.appendChild(arrowIcon(doc));
    return button;
  };
  const undo = historyButton("undo");
  const redo = historyButton("redo");
  create(doc, "span", "sce-spacer", row);
  const badge = create(doc, "span", "sce-badge", row);
  const hint = options.hintId === undefined ? null : create(doc, "div", "sce-sr-only", root);
  if (hint && options.hintId !== undefined) hint.id = options.hintId;

  const abort = new AbortController();
  const { signal } = abort;
  undo.addEventListener("click", () => session.undo(), { signal });
  redo.addEventListener("click", () => session.redo(), { signal });
  installEditKeys(root, session, signal, options);

  /** What the last draw showed, so a change of zoom or scroll, which this part does not draw, costs nothing here. */
  let drawn = "";
  let language: Language | null = null;
  let t = messagesFor(session.view.language);
  function applyLanguage(): void {
    language = session.view.language;
    t = messagesFor(language);
    root.lang = language;
    title.textContent = t.title;
    badge.textContent = t.readOnly;
    history.setAttribute("aria-label", t.history);
    for (const [button, label] of [
      [undo, t.undo],
      [redo, t.redo],
    ] as const) {
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    drawn = "";
  }

  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    const { editable } = session.view;
    const shown = [editable, session.reading.kind === "score", session.canUndo, session.canRedo].join();
    if (shown === drawn) return;
    drawn = shown;
    if (hint) hint.textContent = editable ? t.hintEditing : t.hint;
    history.hidden = !editable || session.reading.kind !== "score";
    badge.hidden = editable;
    undo.setAttribute("aria-disabled", String(!session.canUndo));
    redo.setAttribute("aria-disabled", String(!session.canRedo));
  }

  draw();
  const unsubscribe = session.subscribe(draw);
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribe();
      zoom.destroy();
      root.remove();
      releaseStyles();
    },
  };
}

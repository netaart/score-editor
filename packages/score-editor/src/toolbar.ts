// ABOUTME: The toolbar view part: the title, the zoom control, undo and redo, the read-only badge and the screen-reader hint.
// ABOUTME: Undo and redo are there while the session is editable; the row scrolls sideways when its box is narrower than its controls.

import { create, lineIcon, requireDom } from "./dom";
import { installEditKeys } from "./edit-keys";
import { canDeleteSelection, handleEditingInput } from "./editing-input";
import { messagesFor, viewName } from "./i18n";
import { createLiveRegion, sayRefusals } from "./live-region";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { EditingPartOptions, Language, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";
import { mountViewSwitch } from "./view-switch";
import { mountZoomControl } from "./zoom-control";

export interface ToolbarOptions extends EditingPartOptions {
  /**
   * The id to give the screen-reader hint. A host that points a view's `aria-describedby` at it gets the hint; without
   * this option the toolbar draws no hint, since a hint nothing refers to would only be noise.
   */
  hintId?: string;
  /**
   * Whether to end the row with the view switch (`mountViewSwitch`), as the default editor does. The title then names the
   * view that is shown, and the controls that only mean something on the arrangement are left out of the others. Without
   * it the toolbar is the one it was before the views existed.
   */
  viewSwitch?: boolean;
}

/** An arrow that turns back on itself; redo is the same drawing mirrored by the stylesheet. */
const ARROW = ["5.5,2.5 2.5,5.5 5.5,8.5", "2.5,5.5 9.5,5.5 12.5,7.5 12.5,10.5 9.5,12.5 5,12.5"];

/** A bin: the lid and its handle, then the body. */
const BIN = ["2.5,4.5 13.5,4.5", "6,4.5 6,2.5 10,2.5 10,4.5", "4,4.5 4.8,13.5 11.2,13.5 12,4.5"];

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
  if (options.viewSwitch) row.dataset.views = "";
  const title = create(doc, "span", "sce-title", row);
  const zoom = mountZoomControl(row, session);
  const history = create(doc, "div", "sce-history", row);
  history.setAttribute("role", "group");
  const historyButton = (action: "undo" | "redo"): HTMLButtonElement => {
    const button = create(doc, "button", `sce-button sce-icon-button sce-${action}`, history);
    button.type = "button";
    button.appendChild(lineIcon(doc, ARROW));
    return button;
  };
  const undo = historyButton("undo");
  const redo = historyButton("redo");
  const remove = create(doc, "button", "sce-button sce-icon-button sce-delete", row);
  remove.type = "button";
  remove.setAttribute("aria-disabled", "true");
  remove.appendChild(lineIcon(doc, BIN));
  create(doc, "span", "sce-spacer", row);
  // The badge and the switch are one item of the row, so a narrow row moves them to the next line together.
  const end = options.viewSwitch ? create(doc, "div", "sce-toolbar-end", row) : row;
  const badge = create(doc, "span", "sce-badge", end);
  const views = options.viewSwitch ? mountViewSwitch(end, session) : null;
  const hint = options.hintId === undefined ? null : create(doc, "div", "sce-sr-only", root);
  if (hint && options.hintId !== undefined) hint.id = options.hintId;
  const live = createLiveRegion(root);
  const refused = sayRefusals(live, session, options.onRefused);

  const abort = new AbortController();
  const { signal } = abort;
  undo.addEventListener("click", () => session.undo(), { signal });
  redo.addEventListener("click", () => session.redo(), { signal });
  remove.addEventListener(
    "click",
    () => {
      const result = handleEditingInput(session, { type: "delete" });
      if (result.refused.length > 0) refused(result.refused);
    },
    { signal },
  );
  installEditKeys(root, session, signal, { ...options, onRefused: refused });

  /** What the last draw showed, so a change of zoom or scroll, which this part does not draw, costs nothing here. */
  let drawn = "";
  let language: Language | null = null;
  let t = messagesFor(session.view.language);
  function applyLanguage(): void {
    language = session.view.language;
    t = messagesFor(language);
    root.lang = language;
    title.textContent = options.viewSwitch ? viewName(t, session.activeView) : t.title;
    badge.textContent = t.readOnly;
    history.setAttribute("aria-label", t.history);
    for (const [button, label, keys] of [
      [undo, t.undo, "Ctrl/Cmd+Z"],
      [redo, t.redo, "Ctrl/Cmd+Shift+Z"],
      [remove, t.delete, "Del/Backspace"],
    ] as const) {
      button.setAttribute("aria-label", label);
      button.title = `${label} (${keys})`;
    }
    drawn = "";
  }

  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    const { editable } = session.view;
    const readable = session.reading.kind === "score";
    const deletable = canDeleteSelection(session);
    const arrangement = !options.viewSwitch || arrangementShown(session);
    const shown = [editable, readable, session.canUndo, session.canRedo, deletable, session.activeView].join();
    if (shown === drawn) return;
    drawn = shown;
    if (hint) hint.textContent = editable ? t.hintEditing : t.hint;
    if (options.viewSwitch) title.textContent = viewName(t, session.activeView);
    history.hidden = !editable || !readable;
    remove.hidden = history.hidden || !arrangement;
    badge.hidden = editable;
    undo.setAttribute("aria-disabled", String(!session.canUndo));
    redo.setAttribute("aria-disabled", String(!session.canRedo));
    remove.setAttribute("aria-disabled", String(!deletable));
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
      views?.destroy();
      root.remove();
      releaseStyles();
    },
  };
}

// ABOUTME: The Select menu of the toolbar: a button that opens Select all, Invert selection and Clear selection.
// ABOUTME: It is the touch path to the three selection keys; an item with nothing to do is muted and does nothing.
import { create } from "./dom";
import { handleEditingInput } from "./editing-input";
import { messagesFor } from "./i18n";
import { mountPopoverMenu } from "./popover-menu";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";

/**
 * Mounts the Select menu on `el`. It is drawn while the session is editable, has a score to show and shows the arrangement,
 * the one view with notes to select, and its items act on the session the way the keys do: Ctrl or Cmd with A, with Shift
 * and A, and Escape.
 */
export function mountSelectionMenu(el: HTMLElement, session: EditingSession): ViewPart {
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-select");
  el.appendChild(root);

  const button = create(doc, "button", "sce-button sce-select-button", root);
  button.type = "button";
  const menu = mountPopoverMenu(root, button, signal);
  /** An item for one of the selection inputs. One with nothing to do is muted, and the input does nothing as well. */
  const item = (action: "select-all" | "invert-selection" | "clear-selection") =>
    menu.item("menuitem", () => handleEditingInput(session, { type: action }));
  const selectAll = item("select-all");
  const invert = item("invert-selection");
  const clear = item("clear-selection");

  let language: Language | null = null;
  function applyLanguage(): void {
    language = session.view.language;
    const t = messagesFor(language);
    root.lang = language;
    button.textContent = t.select;
    menu.element.setAttribute("aria-label", t.select);
    for (const [entry, label, keys] of [
      [selectAll, t.selectAll, "Ctrl/Cmd+A"],
      [invert, t.selectInvert, "Ctrl/Cmd+Shift+A"],
      [clear, t.selectClear, "Esc"],
    ] as const) {
      entry.textContent = label;
      entry.title = `${label} (${keys})`;
    }
  }

  /** What the last draw showed, so a change of zoom or scroll, which this part does not draw, costs nothing here. */
  let drawn = "";
  function draw(): void {
    if (session.view.language !== language) {
      applyLanguage();
      drawn = "";
    }
    const { reading } = session;
    const shown = reading.kind === "score" && session.view.editable && arrangementShown(session);
    const anyNote = reading.kind === "score" && reading.score.notes.some((note) => note.midi !== null);
    const state = [shown, anyNote, session.selection.length > 0].join();
    if (state === drawn) return;
    drawn = state;
    root.hidden = !shown;
    selectAll.setAttribute("aria-disabled", String(!anyNote));
    invert.setAttribute("aria-disabled", String(!anyNote));
    clear.setAttribute("aria-disabled", String(session.selection.length === 0));
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
      root.remove();
      releaseStyles();
    },
  };
}

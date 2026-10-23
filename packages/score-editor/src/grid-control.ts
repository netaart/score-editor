// ABOUTME: The Grid menu of the toolbar: a button that shows the session's grid and opens the choices for it, the plain values and the dotted ones.
// ABOUTME: The grid is the step of moving and resizing notes and of the insertion point; a step the score cannot write is muted, and 1/32 is there only when the score can write it.
import type { Grid } from "./commands-notes";
import { create } from "./dom";
import { GRID_CHOICES, sameGrid } from "./grid";
import { messagesFor } from "./i18n";
import { lineIcon } from "./icons";
import { mountPopoverMenu } from "./popover-menu";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";

/** Three lines of a grid, the middle one the tallest: the lines notes snap to. */
const GRID_ICON = ["3,5 3,11", "8,3 8,13", "13,5 13,11"];

/** The finest grid value: the menu keeps it, and its dotted twin, out of sight for a score that cannot write it. */
const FINEST = 32;

/**
 * Mounts the Grid menu on `el`. It is drawn while the session is editable, has a score to show and shows the arrangement.
 * Choosing a grid sets the session's grid, which every part bound to the session then follows. A grid the score cannot
 * write is muted and does nothing; the 1/32 pair is left out of the menu for a score that cannot write 1/32, unless it is
 * the grid in force, so the menu never loses the choice it shows.
 */
export function mountGridControl(el: HTMLElement, session: EditingSession): ViewPart {
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-grid");
  el.appendChild(root);

  const button = create(doc, "button", "sce-button sce-grid-button", root);
  button.type = "button";
  button.appendChild(lineIcon(doc, GRID_ICON));
  const value = create(doc, "span", "sce-button-value", button);
  const valueText = doc.createTextNode("");
  value.appendChild(valueText);
  const dot = create(doc, "span", "sce-grid-dot", value);
  dot.setAttribute("aria-hidden", "true");

  const menu = mountPopoverMenu(root, button, signal, {
    initialFocus: (items) => items.find((item) => item.getAttribute("aria-checked") === "true"),
  });
  const choices: Array<{ readonly grid: Grid; readonly item: HTMLButtonElement }> = [];
  for (const grid of GRID_CHOICES) {
    // The rule goes between the plain values and the dotted ones, which GRID_CHOICES lists in that order.
    if (grid.dotted === true && !choices.some((choice) => choice.grid.dotted === true)) menu.rule();
    const item = menu.item("menuitemradio", () => {
      // A muted item does what a muted item of the Select menu does: the menu closes and nothing else happens.
      if (session.allowsGrid(grid)) session.setGrid(grid);
    });
    choices.push({ grid, item });
  }

  /** The grid the way the button shows it: the fraction, and the dot of a dotted value drawn after it. */
  const fraction = (grid: Grid): string => `1/${grid.value}`;

  let language: Language | null = null;
  function applyLanguage(): void {
    language = session.view.language;
    const t = messagesFor(language);
    root.lang = language;
    button.title = t.gridTip;
    menu.element.setAttribute("aria-label", t.grid);
    for (const { grid, item } of choices) item.textContent = t.gridValue(grid);
  }

  /** What the last draw showed, so a change the grid does not depend on costs nothing here. */
  let drawn = "";
  function draw(): void {
    if (session.view.language !== language) {
      applyLanguage();
      drawn = "";
    }
    const t = messagesFor(session.view.language);
    const shown = session.reading.kind === "score" && session.view.editable && arrangementShown(session);
    const current = session.grid;
    const allowed = choices.map(({ grid }) => session.allowsGrid(grid));
    const state = [shown, current.value, current.dotted === true, ...allowed].join();
    if (state === drawn) return;
    drawn = state;
    root.hidden = !shown;
    valueText.data = fraction(current);
    dot.hidden = current.dotted !== true;
    button.setAttribute("aria-label", `${t.grid}: ${t.gridValue(current)}`);
    // The 1/32 pair stands or falls with plain 1/32: where a score can write that, the dotted one shows too, muted if it
    // cannot be written, as every other dotted step is.
    const finestAt = choices.findIndex(({ grid }) => grid.value === FINEST && grid.dotted !== true);
    const finestShown = allowed[finestAt] === true || current.value === FINEST;
    choices.forEach(({ grid, item }, at) => {
      const allowedHere = allowed[at] === true;
      item.setAttribute("aria-checked", String(sameGrid(grid, current)));
      item.setAttribute("aria-disabled", String(!allowedHere));
      item.title = allowedHere ? "" : t.gridUnavailable;
      item.hidden = grid.value === FINEST && !finestShown;
    });
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

// ABOUTME: The toolbar's Bars menu: choose bars, insert a bar at the insertion point, delete the chosen bars, clear them.
// ABOUTME: It follows the session's bar selection and insertion point, and says a refusal the way the other parts do.
import { barIndexAt, gridTicks } from "./arrangement";
import { create } from "./dom";
import { messagesFor } from "./i18n";
import { type LiveRegion, sayRefusals } from "./live-region";
import { mountPopoverMenu } from "./popover-menu";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { EditingPartOptions, Language, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";

export interface BarMenuOptions extends EditingPartOptions {
  /** The toolbar's one live region; the menu says its changes and refusals there. */
  live: LiveRegion;
  /** Puts the focus on the chosen bar number; the default editor passes the ruler's own way there. */
  onChooseBars?: (bar: number) => void;
}

/** The bar an insert acts on: before the bar that holds the point, or at the end when the point is at the end. */
function insertTarget(session: EditingSession): number | null {
  const { reading, insertionPoint } = session;
  if (reading.kind !== "score" || reading.score.bars.length === 0 || insertionPoint === null) return null;
  if (insertionPoint.tick >= gridTicks(reading.score)) return reading.score.bars.length;
  return barIndexAt(reading.score.bars, insertionPoint.tick);
}

/**
 * Mounts the Bars menu on `el`, at the end of the toolbar's editing controls. It is drawn while the session is editable,
 * has a score and shows the arrangement. Its items act on the session's insertion point and bar selection.
 */
export function mountBarMenu(el: HTMLElement, session: EditingSession, options: BarMenuOptions): ViewPart {
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-bars");
  el.appendChild(root);
  const refused = sayRefusals(options.live, session, options.onRefused);

  const button = create(doc, "button", "sce-button sce-bars-button", root);
  button.type = "button";
  const menu = mountPopoverMenu(root, button, signal);
  const choose = menu.item("menuitem", () => {
    const bar = session.barSelection?.from ?? insertTarget(session) ?? 0;
    if (session.barSelection === null) session.setBarSelection({ from: bar, count: 1 });
    options.onChooseBars?.(Math.min(bar, Math.max(0, barCount(session) - 1)));
  });
  const insert = menu.item("menuitem", () => {
    const target = insertTarget(session);
    if (target === null) return;
    const before = barCount(session);
    const result = session.dispatch({ type: "insertBar", bar: target });
    if (!result.ok) {
      refused(result.diagnostics);
      return;
    }
    const t = messagesFor(session.view.language);
    options.live.say(target >= before ? t.insertBarAtEndDone : t.insertBarBeforeDone(target + 1));
  });
  const remove = menu.item("menuitem", () => {
    const range = session.barSelection;
    if (range === null) return;
    const result = session.dispatch({ type: "deleteBars", from: range.from, count: range.count });
    if (!result.ok) {
      refused(result.diagnostics);
      return;
    }
    const t = messagesFor(session.view.language);
    options.live.say(t.barsDeleted(range.from + 1, range.from + range.count));
  });
  menu.rule();
  const clear = menu.item("menuitem", () => session.setBarSelection(null));

  function barCount(target: EditingSession): number {
    return target.reading.kind === "score" ? target.reading.score.bars.length : 0;
  }

  let language: Language | null = null;
  let drawn = "";
  function draw(): void {
    if (session.view.language !== language) {
      language = session.view.language;
      const t = messagesFor(language);
      root.lang = language;
      button.textContent = t.bars;
      button.title = t.chooseBarsHint;
      menu.element.setAttribute("aria-label", t.bars);
      choose.textContent = t.chooseBars;
      clear.textContent = t.clearBarSelection;
      drawn = "";
    }
    const t = messagesFor(session.view.language);
    const { reading, view, barSelection } = session;
    const score = reading.kind === "score" ? reading.score : null;
    const shown = score !== null && view.editable && arrangementShown(session);
    const target = shown ? insertTarget(session) : null;
    const selection = shown ? barSelection : null;
    const state = [shown, target, selection?.from, selection?.count, score?.bars.length].join();
    if (state === drawn) return;
    drawn = state;
    root.hidden = !shown;

    const bars = score?.bars.length ?? 0;
    const insertEnabled = target !== null;
    insert.textContent =
      target === null ? t.insertBar : target >= bars ? t.insertBarAtEnd : t.insertBarBefore(target + 1);
    insert.title = t.insertBarHint;
    insert.setAttribute("aria-disabled", String(!insertEnabled));

    const removeEnabled = selection !== null;
    remove.textContent =
      selection === null
        ? t.deleteBars
        : selection.count === 1
          ? t.deleteBar(selection.from + 1)
          : t.deleteBarsRange(selection.from + 1, selection.from + selection.count);
    remove.title = selection === null ? t.deleteBarsHint : "";
    remove.setAttribute("aria-disabled", String(!removeEnabled));
    clear.setAttribute("aria-disabled", String(!removeEnabled));
    choose.setAttribute("aria-disabled", String(score === null));
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

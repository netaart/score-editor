// ABOUTME: The editing keys of the view parts: one keydown listener that hands Delete, undo, redo and the insertion point keys to the session.
// ABOUTME: It leaves alone what is not its own: text fields, an open menu, and an event that something else already handled.
import { type AxisFrame, revealTick } from "./axis";
import { handleEditingInput } from "./editing-input";
import type { EditingSession } from "./session";
import type { EditingPartOptions } from "./types";

export interface EditKeyOptions extends EditingPartOptions {
  /** Whose geometry keeps the insertion point in view; without it, the first part on the session's time axis. */
  frame?: () => AxisFrame | null;
}

/** Keys typed into a text field, or into a menu that walks its items with them, belong to that control. */
function belongsToAnotherControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.closest("input, textarea, select, .sce-popover") !== null;
}

/**
 * Listens on `target` for the keys the session understands. A key it handles is kept from the browser, and an insertion
 * point it moves is brought into view. An event another listener below `target` already handled is left alone, so
 * parts inside one another act once.
 */
export function installEditKeys(
  target: HTMLElement,
  session: EditingSession,
  signal: AbortSignal,
  options: EditKeyOptions = {},
): void {
  target.addEventListener(
    "keydown",
    (event) => {
      if (event.defaultPrevented || event.isComposing || belongsToAnotherControl(event.target)) return;
      const before = session.insertionPoint?.tick;
      const result = handleEditingInput(session, {
        type: "key",
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      });
      if (result.refused.length > 0) options.onRefused?.(result.refused);
      if (!result.handled) return;
      event.preventDefault();
      const point = session.insertionPoint;
      if (point && point.tick !== before) revealTick(session, point.tick, options.frame?.());
    },
    { signal },
  );
}

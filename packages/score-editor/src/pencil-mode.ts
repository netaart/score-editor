// ABOUTME: The pencil mode of one editing session: whether a tap on empty space draws a note and a tap on a note deletes it.
// ABOUTME: UI state shared by the toolbar toggle and the lane gestures; it is not part of the document or the history.
import type { EditingSession } from "./session";

/** The pencil of one session, with the listeners that draw its state. */
export interface PencilMode {
  readonly on: boolean;
  set(on: boolean): void;
  toggle(): void;
  subscribe(listener: () => void): () => void;
}

const modes = new WeakMap<EditingSession, PencilMode>();

/** The pencil of one session, made on first use. It starts off. */
export function pencilMode(session: EditingSession): PencilMode {
  const known = modes.get(session);
  if (known) return known;
  const listeners = new Set<() => void>();
  let on = false;
  const mode: PencilMode = {
    get on() {
      return on;
    },
    set(next) {
      if (next === on) return;
      on = next;
      for (const listener of [...listeners]) listener();
    },
    toggle() {
      mode.set(!on);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  modes.set(session, mode);
  return mode;
}

// ABOUTME: Keyboard focus on the notes of one voice track: a single tab stop, stepping from note to note, and keeping the focus through a redraw.
// ABOUTME: Only one note carries a tabindex at a time (a roving tabindex); the track tells this module what it drew and what is selected.
import type { EditingSession } from "./session";

/** The notes a voice track drew, which is all this module needs to know about the track. */
export interface DrawnNotes {
  /** The ids of the pitched notes of the voice, in time order. */
  readonly order: ReadonlyArray<string>;
  readonly blocks: ReadonlyMap<string, HTMLElement>;
  /** The note id of each block, to find the note an event happened on. */
  readonly owners: ReadonlyMap<Element, string>;
}

export interface NoteFocus {
  /** Whether the keys are moving the selection from note to note right now. */
  readonly stepping: boolean;
  /** The track drew these notes, or none. */
  draw(drawn: DrawnNotes | null): void;
  /** Puts the tab stop on the first selected note, else the first note, and gives back a focus a redraw took away. */
  sync(editable: boolean, selection: ReadonlyArray<string>): void;
  /** Moves the focus onto a note, and the tab stop with it. */
  focus(noteId: string): void;
}

/**
 * Wires the keys of the notes on `root`: Left and Right step to the neighbouring note and select it, Home and End go
 * to the first and last, Enter and Space select the note in focus. A key with a modifier is left to the others, and so
 * is any key while the focus is not on a note.
 */
export function mountNoteFocus(
  root: HTMLElement,
  session: EditingSession,
  signal: AbortSignal,
  select: (noteId: string) => void,
): NoteFocus {
  let drawn: DrawnNotes | null = null;
  let stop: string | null = null;
  /** Where the focus was on a note when the session last changed: the redraw that follows may take it away. */
  let lost: {
    readonly noteId: string;
    readonly order: ReadonlyArray<string>;
    /** What holds the focus when no note is left to hold it. */
    readonly fallback: HTMLElement | null;
  } | null = null;
  let stepping = false;

  function setStop(noteId: string | null): void {
    if (noteId === stop) return;
    if (stop !== null) drawn?.blocks.get(stop)?.removeAttribute("tabindex");
    stop = noteId;
    if (noteId !== null) drawn?.blocks.get(noteId)?.setAttribute("tabindex", "0");
  }

  function noteIn(target: EventTarget | null): string | undefined {
    if (!(target instanceof Element)) return undefined;
    const block = target.closest(".sce-note");
    return block ? drawn?.owners.get(block) : undefined;
  }

  const focus = (noteId: string): void => {
    setStop(noteId);
    drawn?.blocks.get(noteId)?.focus();
  };

  root.addEventListener(
    "keydown",
    (event) => {
      if (!drawn || event.defaultPrevented || event.isComposing || !session.view.editable) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const noteId = noteIn(event.target);
      if (noteId === undefined) return;
      const { order } = drawn;
      const at = order.indexOf(noteId);
      let to: string | undefined;
      if (event.key === "ArrowLeft") to = order[at - 1] ?? noteId;
      else if (event.key === "ArrowRight") to = order[at + 1] ?? noteId;
      else if (event.key === "Home") to = order[0];
      else if (event.key === "End") to = order[order.length - 1];
      else if (event.key === "Enter" || event.key === " ") {
        select(noteId);
        event.preventDefault();
        return;
      }
      if (to === undefined) return;
      event.preventDefault();
      stepping = true;
      try {
        select(to);
      } finally {
        stepping = false;
      }
      focus(to);
    },
    { signal },
  );

  /** Before the track draws again and its blocks go, notes where the focus is, so the redraw can give it back. */
  const unsubscribe = session.subscribe(() => {
    const active = root.ownerDocument.activeElement;
    const noteId = noteIn(active);
    const fallback = active?.parentElement?.closest<HTMLElement>("[tabindex]") ?? null;
    lost = drawn && noteId !== undefined ? { noteId, order: drawn.order, fallback } : null;
  });
  signal.addEventListener("abort", unsubscribe, { once: true });

  return {
    get stepping() {
      return stepping;
    },
    draw(next) {
      drawn = next;
      stop = null;
    },
    sync(editable, selection) {
      const current = drawn;
      if (!current || !editable) {
        setStop(null);
        lost = null;
        return;
      }
      // A note that has the focus keeps the tab stop: taking its tabindex away would take the focus with it.
      const focused = noteIn(root.ownerDocument.activeElement);
      setStop(focused ?? selection.find((id) => current.blocks.has(id)) ?? current.order[0] ?? null);
      if (lost !== null) {
        const active = root.ownerDocument.activeElement;
        if (!active || !root.contains(active)) {
          const kept = (id: string) => current.blocks.has(id);
          const at = lost.order.indexOf(lost.noteId);
          const next =
            [lost.noteId, ...lost.order.slice(at + 1), ...lost.order.slice(0, at).reverse()].find(kept) ?? null;
          if (next !== null) focus(next);
          else lost.fallback?.focus();
        }
        lost = null;
      }
    },
    focus,
  };
}

// ABOUTME: Editing on the chord track: a press picks the nearest place for a chord, a keyboard cursor steps between places, a picker chooses.
// ABOUTME: It follows the session and the score, issues one set-chord command per edit, and says what it did in the part's live region.
import { type BarPosition, barIndexAt, positionOf } from "./arrangement";
import { type AxisFrame, revealTick } from "./axis";
import { type ChordSlot, chordSlots, nearestChordSlot } from "./chord-edit";
import { type ChordPicker, mountChordPicker } from "./chord-picker";
import { chordMessagesFor } from "./chord-text";
import { chordChoices } from "./chord-vocabulary";
import type { Diagnostic } from "./diagnostics";
import { create } from "./dom";
import type { LiveRegion } from "./live-region";
import type { Chord, Score } from "./score";
import type { EditingSession } from "./session";
import { arrangementShown } from "./view-rules";

/** A press that moves farther than this, in pixels, is a drag or a scroll and not a click or a tap. */
const SLOP = 6;

/** The chord row as the track drew it for a score. */
export interface DrawnChordRow {
  /** The pinned header row that holds the pinned corner and the timeline. */
  readonly row: HTMLElement;
  readonly corner: HTMLElement;
  /** The element as wide as the whole score. */
  readonly timeline: HTMLElement;
  readonly score: Score;
  readonly ticks: number;
}

export interface ChordEditing {
  /**
   * The track drew a row. Adds the layer that frames the chosen place and holds the keyboard cursor, and returns it so the
   * track can give it the width of the time axis; null when the score has no place for a chord.
   */
  draw(drawn: DrawnChordRow | null): HTMLElement | null;
  /** Shows what the session holds beyond the score: whether editing is on, and gives back a focus a redraw took away. */
  sync(): void;
}

export interface ChordEditingOptions {
  /** The element that scrolls the track in time, when the host puts several parts in one scroller. */
  readonly scroller?: HTMLElement;
  /** A set-chord command was refused and nothing changed. */
  refused(diagnostics: ReadonlyArray<Diagnostic>): void;
}

interface Drawn extends DrawnChordRow {
  readonly slots: ReadonlyArray<ChordSlot>;
  readonly layer: HTMLElement;
  readonly hover: HTMLElement;
  readonly cursor: HTMLButtonElement;
}

/** The name a score gives the chord at `start`: the last one there, or null. */
function chordAt(chords: ReadonlyArray<Chord>, start: number): string | null {
  let name: string | null = null;
  for (const chord of chords) if (chord.start === start) name = chord.name;
  return name;
}

/** The first start whose chord is not the same in the two scores, with the chord it has in `after`. */
function firstChordChange(before: Score, after: Score): { start: number; chord: string | null } | null {
  const starts = [...new Set([...before.chords, ...after.chords].map((chord) => chord.start))].sort((a, b) => a - b);
  for (const start of starts) {
    const now = chordAt(after.chords, start);
    if (now !== chordAt(before.chords, start)) return { start, chord: now };
  }
  return null;
}

/**
 * Wires editing on the chord track whose root is `root`, for as long as `signal` lives. While the session is editable and
 * shows the arrangement, a click or tap on the track takes the nearest place for a chord and opens the picker there; a mouse
 * over the track frames the place it would take. One button, the cursor, is the track's tab stop: Left and Right step from
 * place to place, with Ctrl or Cmd from chord to chord, Home and End go to the first and last, Enter and Space open the
 * picker, and Delete and Backspace remove the chord there. The cursor also draws the frame of the place the picker is for.
 */
export function mountChordEditing(
  root: HTMLElement,
  session: EditingSession,
  signal: AbortSignal,
  live: LiveRegion,
  options: ChordEditingOptions,
): ChordEditing {
  const doc = root.ownerDocument;
  let drawn: Drawn | null = null;
  /** The place the cursor stands on, kept through a redraw by the note it names and, failing that, by its start. */
  let cursorAt: { noteId: string; start: number } | null = null;
  let press: { x: number; y: number } | null = null;
  /** The focus was on the cursor when the session last changed: the redraw that follows may take it away. */
  let refocus = false;
  let shown = "";

  const picker: ChordPicker = mountChordPicker(root, signal, (open) => {
    if (!drawn) return;
    drawn.cursor.setAttribute("aria-expanded", String(open));
    if (open) drawn.cursor.dataset.open = "";
    else delete drawn.cursor.dataset.open;
  });

  const editable = (): boolean =>
    drawn !== null && session.view.editable && arrangementShown(session) && session.constraints !== null;

  const messages = () => chordMessagesFor(session.view.language);

  function positionOfSlot(d: Drawn, slot: ChordSlot): BarPosition {
    return positionOf(d.score.bars, barIndexAt(d.score.bars, slot.start), slot.start);
  }

  function frame(d: Drawn): AxisFrame {
    return { scroller: options.scroller ?? root, corner: d.corner, timeline: d.timeline, ticks: d.ticks };
  }

  /** Where `clientX` is on the timeline, in ticks. */
  function tickAt(d: Drawn, clientX: number): number {
    const area = d.timeline.getBoundingClientRect();
    return area.width > 0 ? ((clientX - area.left) / area.width) * d.ticks : 0;
  }

  function frameSlot(element: HTMLElement, slot: ChordSlot): void {
    element.style.setProperty("--t", String(slot.start));
    element.style.setProperty("--w", String(slot.duration));
  }

  function currentSlot(d: Drawn): ChordSlot | undefined {
    return (
      d.slots.find((slot) => slot.noteId === cursorAt?.noteId) ??
      nearestChordSlot(d.slots, cursorAt?.start ?? 0) ??
      d.slots[0]
    );
  }

  /** Puts the cursor on `slot`; `say` has the live region name the place, as a screen reader needs for a step. */
  function moveCursor(d: Drawn, slot: ChordSlot, say: boolean): void {
    cursorAt = { noteId: slot.noteId, start: slot.start };
    frameSlot(d.cursor, slot);
    const label = messages().cursorLabel(positionOfSlot(d, slot), slot.chord);
    d.cursor.setAttribute("aria-label", label);
    if (say) live.say(label);
  }

  function hideHover(): void {
    if (drawn) drawn.hover.hidden = true;
  }

  function commit(d: Drawn, slot: ChordSlot, name: string): void {
    const position = positionOfSlot(d, slot);
    const result = session.dispatch({ type: "setChord", noteId: slot.noteId, name });
    if (!result.ok) {
      options.refused(result.diagnostics);
      return;
    }
    const t = messages();
    live.say(
      name === "" ? t.removed(position) : slot.chord === null ? t.placed(name, position) : t.changed(name, position),
    );
  }

  function openPicker(d: Drawn, slot: ChordSlot): void {
    const constraints = session.constraints;
    if (constraints === null) return;
    moveCursor(d, slot, false);
    // The focus goes to the cursor first, so that is where it returns when the picker closes.
    d.cursor.focus({ preventScroll: true });
    d.cursor.dataset.open = "";
    d.cursor.setAttribute("aria-expanded", "true");
    hideHover();
    const row = d.row.getBoundingClientRect();
    picker.open({
      slot,
      position: positionOfSlot(d, slot),
      choices: chordChoices(constraints.chords),
      vocabulary: constraints.chords,
      language: session.view.language,
      anchor: { left: d.cursor.getBoundingClientRect().left, top: row.bottom + 4, rowTop: row.top },
      choose: (name) => commit(d, slot, name),
    });
  }

  /** Moves the cursor to a place, says where it is, and brings it into view. */
  function goTo(d: Drawn, slot: ChordSlot | undefined): void {
    if (slot === undefined) return;
    moveCursor(d, slot, true);
    revealTick(session, slot.start, frame(d));
  }

  function chordIndex(d: Drawn, from: number, direction: 1 | -1): number {
    for (let at = from + direction; at >= 0 && at < d.slots.length; at += direction) {
      if (d.slots[at]?.chord !== null) return at;
    }
    return -1;
  }

  root.addEventListener(
    "pointerdown",
    (event) => {
      press = null;
      const d = drawn;
      if (!d || !editable() || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
      if (!(event.target instanceof Element) || !d.timeline.contains(event.target)) return;
      press = { x: event.clientX, y: event.clientY };
    },
    { signal },
  );

  root.addEventListener(
    "pointermove",
    (event) => {
      const d = drawn;
      if (!d || event.pointerType !== "mouse" || !editable() || picker.isOpen) return;
      if (!(event.target instanceof Element) || !d.timeline.contains(event.target)) {
        hideHover();
        return;
      }
      const slot = nearestChordSlot(d.slots, tickAt(d, event.clientX));
      if (!slot) return;
      frameSlot(d.hover, slot);
      d.hover.hidden = false;
    },
    { signal },
  );
  root.addEventListener("pointerleave", hideHover, { signal });

  // A click rather than the release of the press: the browser closes an open picker as the pointer is released, and the
  // click that follows is then the one that opens the next. A drag or a swipe makes no tap.
  root.addEventListener(
    "click",
    (event) => {
      const d = drawn;
      const start = press;
      press = null;
      if (!d || !editable()) return;
      if (event.target === d.cursor) {
        const slot = currentSlot(d);
        if (slot) openPicker(d, slot);
        return;
      }
      if (!start || !(event.target instanceof Element) || !d.timeline.contains(event.target)) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP) return;
      const slot = nearestChordSlot(d.slots, tickAt(d, event.clientX));
      if (slot) openPicker(d, slot);
    },
    { signal },
  );

  root.addEventListener(
    "keydown",
    (event) => {
      const d = drawn;
      if (!d || event.target !== d.cursor || event.defaultPrevented || event.isComposing || !editable()) return;
      const command = event.ctrlKey || event.metaKey;
      if (event.altKey || event.shiftKey || (command && event.key !== "ArrowLeft" && event.key !== "ArrowRight"))
        return;
      const slot = currentSlot(d);
      if (!slot) return;
      const at = d.slots.indexOf(slot);
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowRight": {
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          goTo(d, d.slots[command ? chordIndex(d, at, direction) : at + direction]);
          break;
        }
        case "Home":
          goTo(d, d.slots[0]);
          break;
        case "End":
          goTo(d, d.slots[d.slots.length - 1]);
          break;
        case "Delete":
        case "Backspace":
          if (slot.chord !== null) commit(d, slot, "");
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    { signal },
  );

  // Heard before the track redraws: the redraw replaces the cursor, so where the focus is must be known first, and so must
  // the chords of the score it replaces, to say what an undo or a redo changed.
  const unsubscribe = session.subscribe((change) => {
    const d = drawn;
    refocus = d !== null && doc.activeElement === d.cursor;
    if (!d || !session.view.editable || (change.cause !== "undo" && change.cause !== "redo")) return;
    const { reading } = session;
    if (reading.kind !== "score") return;
    const changed = firstChordChange(d.score, reading.score);
    if (changed === null) return;
    const position = positionOf(reading.score.bars, barIndexAt(reading.score.bars, changed.start), changed.start);
    live.say(messages().chordNow(changed.chord, position));
  });
  signal.addEventListener("abort", unsubscribe, { once: true });

  return {
    draw(row) {
      picker.close();
      drawn = null;
      shown = "";
      const constraints = session.constraints;
      if (row === null || constraints === null) return null;
      const slots = chordSlots(row.score, constraints);
      if (slots.length === 0) return null;
      const layer = create(doc, "div", "sce-chord-layer", row.row);
      const hover = create(doc, "div", "sce-chord-hover", layer);
      hover.setAttribute("aria-hidden", "true");
      hover.hidden = true;
      const cursor = create(doc, "button", "sce-chord-cursor", layer);
      cursor.type = "button";
      cursor.setAttribute("aria-haspopup", "dialog");
      cursor.setAttribute("aria-expanded", "false");
      cursor.setAttribute("aria-description", messages().cursorHint);
      drawn = { ...row, slots, layer, hover, cursor };
      const slot = currentSlot(drawn);
      if (slot) moveCursor(drawn, slot, false);
      return layer;
    },
    sync() {
      // A reading that is not a score takes the canvas away without a new draw; what was drawn is then gone.
      if (drawn && !drawn.layer.isConnected) {
        picker.close();
        drawn = null;
        shown = "";
      }
      const d = drawn;
      const on = editable();
      const state = `${on}`;
      if (d && state !== shown) {
        shown = state;
        d.layer.hidden = !on;
        if (!on) {
          picker.close();
          hideHover();
        }
      }
      root.setAttribute("data-editable", String(on));
      if (d && on && refocus && doc.activeElement !== d.cursor) d.cursor.focus({ preventScroll: true });
      refocus = false;
    },
  };
}

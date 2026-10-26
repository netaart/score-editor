// ABOUTME: The pointer gestures of a voice lane: a click or tap, a toggle with Shift or a touch and hold, a box on empty space, and a drag of selected notes.
// ABOUTME: It turns pointer events into editing inputs and draws the box over the lane; it reads the lane's geometry and never the score.

import type { Diagnostic } from "./diagnostics";
import { create } from "./dom";
import { handleEditingInput } from "./editing-input";
import { auditionPitch, auditionPitches } from "./note-audition";
import { type DragChannel, type Grab, grabAt, inputOf, isStill, previewOf } from "./note-drag";
import { pencilMode } from "./pencil-mode";
import type { Note } from "./score";
import type { EditingSession } from "./session";

/** A press that moves farther than this, in pixels, is a drag or a scroll and not a click, a tap or a hold. */
const SLOP = 6;

/** How long a finger rests on the lane before the hold means something: a toggle on a note, a box on empty space. */
const HOLD_MS = 400;

/** How far a resting finger may drift, in pixels, and still be resting: a thumb is not as still as a mouse. */
const TOUCH_SLOP = 10;

/** What a lane drew, which is all the gestures need to know about it. */
export interface LaneGeometry {
  /** The element whose width is the whole score in ticks and whose height is all the pitch rows. */
  readonly lane: HTMLElement;
  /** The voice the lane draws, such as `Vocal`. */
  readonly voice: string;
  readonly ticks: number;
  readonly rows: number;
  /** The pitch of the first row, which is the top one. */
  readonly top: number;
  /** The voice's notes in time order, rests included. */
  readonly notes: ReadonlyArray<Note>;
  readonly blocks: ReadonlyMap<string, HTMLElement>;
  /** The note id of each block, to find the note a pointer is on. */
  readonly owners: ReadonlyMap<Element, string>;
}

export interface LanePointerOptions {
  /** The lane as drawn now, or null when nothing is drawn. */
  lane(): LaneGeometry | null;
  /** Moves the keyboard focus onto a note a mouse has just acted on. */
  focus(noteId: string): void;
  /** Where a drag shows what it would do, in every voice track at once. */
  readonly preview: DragChannel;
  /** Told why a drag was refused, when the release asked for an edit the score cannot take. */
  refused(diagnostics: ReadonlyArray<Diagnostic>): void;
}

/**
 * A press is `pressed` until it becomes something. A finger that rests on empty space is `armed`, and a pointer that
 * has gone on from there draws a `boxing` box. A press on a selected note that has gone on from there is `dragging`
 * the selection. `done` is a press that came to nothing, or was given up: its release does nothing.
 */
type Phase = "pressed" | "armed" | "boxing" | "dragging" | "done";

interface Gesture {
  readonly id: number;
  readonly touch: boolean;
  readonly x: number;
  readonly y: number;
  readonly geometry: LaneGeometry;
  /** The note the press landed on, if any. */
  readonly noteId: string | undefined;
  /** What a drag from this press would take hold of: set only when the press landed on a selected note. */
  readonly grab: Grab | null;
  readonly shift: boolean;
  /** Alt was down at the press: a move writes copies and leaves the originals. */
  readonly copy: boolean;
  /** The pitch offset whose sound this drag has already played, so a slide sounds each new pitch once. */
  auditioned: number | null;
  /** Where the box started, in ticks and in rows from the top of the lane. */
  readonly anchor: { readonly tick: number; readonly row: number };
  phase: Phase;
  hold: ReturnType<typeof setTimeout> | undefined;
  last: { x: number; y: number };
  box: HTMLElement | null;
  /** The ids of the blocks that wear the box's preview now. */
  boxed: ReadonlySet<string>;
  /** Listeners added for the life of this gesture. */
  readonly ends: AbortController;
}

/** Where `x` and `y` are in the lane, in ticks and in rows, kept inside it. */
function placeIn(geometry: LaneGeometry, x: number, y: number): { tick: number; row: number } | null {
  const area = geometry.lane.getBoundingClientRect();
  if (!(area.width > 0) || !(area.height > 0)) return null;
  const across = Math.min(1, Math.max(0, (x - area.left) / area.width));
  const down = Math.min(1, Math.max(0, (y - area.top) / area.height));
  return { tick: across * geometry.ticks, row: down * geometry.rows };
}

interface Reach {
  /** The pitched notes the box touches. */
  readonly hit: ReadonlyArray<string>;
  /** Those, and every pitched note tied to them: what a selection of the hit notes shows. */
  readonly shown: ReadonlySet<string>;
}

/** The notes whose block a box from tick `t0` to `t1` and row `r0` to `r1` touches, and the tie chains they belong to. */
function reachOf(geometry: LaneGeometry, t0: number, t1: number, r0: number, r1: number): Reach {
  const hit: string[] = [];
  const shown = new Set<string>();
  let chain: Note[] = [];
  let touched = false;
  const flush = () => {
    if (touched) for (const member of chain) if (member.midi !== null) shown.add(member.id);
    chain = [];
    touched = false;
  };
  for (const note of geometry.notes) {
    chain.push(note);
    if (note.midi !== null) {
      const row = geometry.top - note.midi;
      if (note.start < t1 && note.start + note.duration > t0 && row < r1 && row + 1 > r0) {
        hit.push(note.id);
        touched = true;
      }
    }
    if (!note.tie) flush();
  }
  flush();
  return { hit, shown };
}

/**
 * Wires the pointer on `root` for the lane `options.lane()` gives, for as long as `signal` lives, while the session is
 * editable. A click or tap on a note selects it and one with Shift held toggles it; a click or tap on empty space drops
 * the insertion point. A mouse that is pressed on empty space and dragged draws a box. A finger that rests on a note
 * toggles it, as Shift does, and one that rests on empty space and then slides draws the box, since a slide that starts
 * at once on a note that is not selected, or on empty space, is a scroll. The box selects what it touches when it is let go, and Escape gives it up. A press on a selected
 * note that moves is a drag: on the body it moves the selection, on an edge it resizes it, both by one edit when it is
 * let go (see `grabAt`), and while it lasts the notes' ghosts are shown through `options.preview`. Escape gives it up too.
 */
export function installLanePointer(
  root: HTMLElement,
  session: EditingSession,
  signal: AbortSignal,
  options: LanePointerOptions,
): void {
  let gesture: Gesture | null = null;
  /** The selected note whose edge the mouse is over, when the resize cursor is showing. */
  let edgeCursor: HTMLElement | null = null;
  /**
   * The last click of this lane, for a double click or double tap: the browser's own `dblclick` is not sent for touch
   * on every platform, so the second click at the same note or grid place is the one that draws or deletes.
   */
  let lastClick: {
    time: number;
    kind: "select" | "clear" | "add" | "delete";
    noteId?: string;
    tick: number;
    revision: number;
    grid: string;
  } | null = null;
  /** Counts changes of the grid, the project or the shown view: a click from before one is not half of a double. */
  let clickRevision = 0;
  /** Whether the last press was a finger's; the browser's own `dblclick` is the mouse's, and touch is timed here. */
  let touchPointer = false;

  /** Takes the resize cursor off the note that had it. */
  function clearEdgeCursor(): void {
    edgeCursor?.removeAttribute("data-edge-cursor");
    edgeCursor = null;
  }

  /**
   * Shows the resize cursor while a mouse is over an edge zone of a selected note, from the same `grabAt` a press uses.
   * It marks the one note under the pointer, so no note is decided on a zoom.
   */
  function showEdgeCursor(event: PointerEvent): void {
    if (event.pointerType !== "mouse" || gesture !== null) return;
    const found = event.target instanceof Element ? event.target.closest(".sce-note") : null;
    const block = found instanceof HTMLElement && found.hasAttribute("data-selected") ? found : null;
    const grab = block ? grabAt(block, event.clientX, false) : null;
    const next = grab?.kind === "resize" ? block : null;
    if (next === edgeCursor) return;
    clearEdgeCursor();
    edgeCursor = next;
    edgeCursor?.setAttribute("data-edge-cursor", "");
  }

  /** Takes from the page all that a gesture put there: its timer and listeners, the box, the preview and the lane's tint. */
  function tidy(g: Gesture): void {
    clearTimeout(g.hold);
    g.ends.abort();
    g.box?.remove();
    g.box = null;
    for (const id of g.boxed) unmark(g, id);
    g.boxed = new Set();
    delete g.geometry.lane.dataset.boxing;
    delete g.geometry.lane.dataset.dragging;
    options.preview.show(null);
  }

  function finish(): void {
    clearEdgeCursor();
    const g = gesture;
    if (!g) return;
    gesture = null;
    tidy(g);
  }

  /** Gives the box up and leaves the press to end on its own release. */
  function giveUp(g: Gesture): void {
    tidy(g);
    g.phase = "done";
  }

  function unmark(g: Gesture, id: string): void {
    g.geometry.blocks.get(id)?.removeAttribute("data-boxed");
  }

  /** Starts watching what can end a box without its pointer: Escape, a scroll under the pointer, a lost focus, a change of the session. */
  function watch(g: Gesture): void {
    const own = { signal: g.ends.signal };
    const scope = root.getRootNode();
    scope.addEventListener(
      "keydown",
      (event) => {
        if ((event as KeyboardEvent).key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        giveUp(g);
      },
      { capture: true, ...own },
    );
    scope.addEventListener("scroll", () => (g.phase === "dragging" ? drag(g) : draw(g)), {
      capture: true,
      passive: true,
      ...own,
    });
    // A page that loses the focus mid-gesture (a switch of window) may never hear the release.
    root.ownerDocument.defaultView?.addEventListener("blur", () => giveUp(g), own);
    const unsubscribe = session.subscribe(() => {
      if (!session.view.editable || options.lane() !== g.geometry) giveUp(g);
    });
    g.ends.signal.addEventListener("abort", unsubscribe, { once: true });
  }

  /** Shows where the selected notes would land if the pointer were let go where it is. */
  function drag(g: Gesture): void {
    if (g.phase !== "dragging" || g.grab === null) return;
    const now = placeIn(g.geometry, g.last.x, g.last.y);
    if (now) {
      const preview = previewOf(g.grab, g.anchor, now);
      options.preview.show(preview);
      if (preview.grab.kind === "move") auditionDrag(g, preview.semitones);
    }
  }

  /** The press on a selected note has moved: the selection is carried by the pointer from here on. */
  function carry(g: Gesture): void {
    if (g.grab === null) return;
    clearTimeout(g.hold);
    g.phase = "dragging";
    g.geometry.lane.dataset.dragging = g.grab.kind;
    auditionDrag(g, 0);
    watch(g);
    if (!g.touch) {
      try {
        root.setPointerCapture(g.id);
      } catch {
        // The pointer is gone already; the release that follows is the pointercancel.
      }
    }
    drag(g);
  }

  /** Lets the selected notes go where the drag took them: one edit, as the keys make it. */
  function drop(g: Gesture): void {
    const now = g.grab === null ? null : placeIn(g.geometry, g.last.x, g.last.y);
    // Taken out of the way first: the edit redraws the notes, and the ghosts must not outlive the drag.
    finish();
    if (g.grab === null || now === null) return;
    const preview = previewOf(g.grab, g.anchor, now);
    if (isStill(preview)) return;
    const input = g.copy
      ? ({ type: "copy-notes", timeTicks: preview.timeTicks, semitones: preview.semitones } as const)
      : inputOf(preview);
    const { refused } = handleEditingInput(session, input);
    if (refused.length > 0) options.refused(refused);
  }

  /** Draws the box from its anchor to the pointer's last place, and previews what it touches. */
  function draw(g: Gesture): void {
    if (g.phase !== "boxing" || !g.box) return;
    const now = placeIn(g.geometry, g.last.x, g.last.y);
    if (!now) return;
    const t0 = Math.min(g.anchor.tick, now.tick);
    const t1 = Math.max(g.anchor.tick, now.tick);
    const r0 = Math.min(g.anchor.row, now.row);
    const r1 = Math.max(g.anchor.row, now.row);
    g.box.style.setProperty("--t", String(t0));
    g.box.style.setProperty("--d", String(t1 - t0));
    g.box.style.setProperty("--r", String(r0));
    g.box.style.setProperty("--h", String(r1 - r0));
    const { shown } = reachOf(g.geometry, t0, t1, r0, r1);
    for (const id of g.boxed) if (!shown.has(id)) unmark(g, id);
    for (const id of shown) if (!g.boxed.has(id)) g.geometry.blocks.get(id)?.setAttribute("data-boxed", "");
    g.boxed = shown;
  }

  /** The box element, at the anchor and with no size yet; a resting finger sees it as a marker (`data-anchor`). */
  function startBox(g: Gesture): HTMLElement {
    const el = create(g.geometry.lane.ownerDocument, "div", "sce-box", g.geometry.lane);
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--t", String(g.anchor.tick));
    el.style.setProperty("--d", "0");
    el.style.setProperty("--r", String(g.anchor.row));
    el.style.setProperty("--h", "0");
    return el;
  }

  function open(g: Gesture): void {
    clearTimeout(g.hold);
    g.phase = "boxing";
    g.geometry.lane.dataset.boxing = "";
    g.box ??= startBox(g);
    g.box.removeAttribute("data-anchor");
    if (!g.touch) {
      try {
        root.setPointerCapture(g.id);
      } catch {
        // The pointer is gone already; the release that follows is the pointercancel.
      }
    }
    draw(g);
  }

  function rest(g: Gesture): void {
    g.hold = undefined;
    if (gesture !== g || g.phase !== "pressed") return;
    // The lane may have been redrawn, or the editor made read-only, while the finger rested.
    if (!session.view.editable || options.lane() !== g.geometry) {
      finish();
      return;
    }
    // A long press on a touch screen can open the browser's own menu; the hold is the press's meaning here.
    root.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: g.ends.signal });
    if (g.noteId !== undefined) {
      handleEditingInput(session, { type: "toggle-note", noteId: g.noteId });
      g.phase = "done";
      return;
    }
    g.phase = "armed";
    g.geometry.lane.dataset.boxing = "";
    // The finger hides the lane where it rests, so the hold is shown by a marker larger than a fingertip, and felt.
    g.box = startBox(g);
    g.box.setAttribute("data-anchor", "");
    buzz();
    watch(g);
  }

  /** A short buzz where the device has one and the page has been touched before, which browsers insist on. */
  function buzz(): void {
    const device = root.ownerDocument.defaultView?.navigator;
    if (device && device.userActivation?.hasBeenActive !== false) device.vibrate?.(10);
  }

  /** The pitch of the row a pointer is on, kept inside the rows the lane draws. */
  function midiAt(geometry: LaneGeometry, row: number): number {
    const index = Math.min(geometry.rows - 1, Math.max(0, Math.floor(row)));
    return geometry.top - index;
  }

  /** Sounds the pitch of each selected note as the drag would leave it, once for each new pitch offset. */
  function auditionDrag(g: Gesture, semitones: number): void {
    if (g.grab?.kind !== "move" || g.auditioned === semitones) return;
    g.auditioned = semitones;
    const reading = session.reading;
    if (reading.kind !== "score") return;
    const selected = new Set(session.selection);
    auditionPitches(
      reading.score.notes
        .filter((note) => note.midi !== null && selected.has(note.id))
        .map((note) => (note.midi as number) + semitones),
    );
  }

  /** A click or tap that came to nothing else. */
  function click(g: Gesture, event: PointerEvent): void {
    const at = placeIn(g.geometry, event.clientX, event.clientY);
    if (!at) return;
    const now = Date.now();
    const pencil = pencilMode(session);
    const grid = `${session.grid.value}:${session.grid.dotted === true}`;
    // A tap that lands after a delete can be the same contact being reported twice: it adds nothing.
    if (lastClick?.kind === "delete" && now - lastClick.time < 450) {
      lastClick = null;
      return;
    }
    // A second tap right after a pencil action at the same place is that action's release, not a new one.
    if (
      pencil.on &&
      lastClick !== null &&
      now - lastClick.time < 450 &&
      ((lastClick.kind === "add" && g.noteId === undefined) || lastClick.kind === "delete") &&
      lastClick.revision === clickRevision &&
      lastClick.grid === grid &&
      Math.abs(lastClick.tick - at.tick) <= 8
    ) {
      lastClick = null;
      return;
    }
    const double =
      !g.shift &&
      g.touch &&
      lastClick !== null &&
      lastClick.revision === clickRevision &&
      lastClick.grid === grid &&
      now - lastClick.time < 450 &&
      (g.noteId === undefined
        ? lastClick.noteId === undefined && Math.abs(lastClick.tick - at.tick) <= 8
        : lastClick.noteId === g.noteId);
    if (g.noteId !== undefined) {
      if (double || pencil.on) {
        const result = handleEditingInput(session, { type: "delete-note", noteId: g.noteId });
        lastClick = { time: now, kind: "delete", tick: at.tick, revision: clickRevision, grid };
        if (result.refused.length > 0) options.refused(result.refused);
        return;
      }
      const input = g.shift
        ? ({ type: "toggle-note", noteId: g.noteId } as const)
        : ({ type: "click-note", noteId: g.noteId } as const);
      const { handled } = handleEditingInput(session, input);
      lastClick = double
        ? null
        : { time: now, kind: "select", noteId: g.noteId, tick: at.tick, revision: clickRevision, grid };
      // A mouse press has focused the note by now. A touch or pen release comes before the browser moves the focus, so
      // moving it from here would draw the keyboard ring on a tap; the browser focuses the note next, without the ring.
      if (handled && !g.touch) options.focus(g.noteId);
      return;
    }
    // Shift on empty space is an aim that missed, and must not cost the selection.
    if (g.shift) return;
    if (pencil.on || double) {
      const midi = midiAt(g.geometry, at.row);
      const result = handleEditingInput(session, {
        type: "add-note",
        voice: g.geometry.voice,
        tick: at.tick,
        midi,
      });
      lastClick = { time: now, kind: "add", tick: at.tick, revision: clickRevision, grid };
      if (result.refused.length > 0) options.refused(result.refused);
      else auditionPitch(midi);
      return;
    }
    lastClick = { time: now, kind: "clear", tick: at.tick, revision: clickRevision, grid };
    handleEditingInput(session, { type: "click-empty", tick: at.tick });
  }

  root.addEventListener(
    "pointerdown",
    (event) => {
      clearEdgeCursor();
      finish();
      const primary = event.isPrimary && (event.pointerType !== "mouse" || event.button === 0);
      const geometry = options.lane();
      if (!primary || !geometry || !session.view.editable || !(event.target instanceof Element)) return;
      const block = event.target.closest(".sce-note");
      const noteId = block ? geometry.owners.get(block) : undefined;
      if (noteId === undefined && !event.target.closest(".sce-lane")) return;
      const anchor = placeIn(geometry, event.clientX, event.clientY);
      if (!anchor) return;
      const touch = event.pointerType !== "mouse";
      touchPointer = touch;
      // Only a selected note is taken hold of; Shift toggles it instead, and a press on any other note is a click.
      const grab =
        block && !event.shiftKey && block.hasAttribute("data-selected") ? grabAt(block, event.clientX, touch) : null;
      const g: Gesture = {
        id: event.pointerId,
        touch,
        x: event.clientX,
        y: event.clientY,
        geometry,
        noteId,
        grab,
        shift: event.shiftKey,
        copy: event.altKey && grab?.kind === "move",
        auditioned: null,
        anchor,
        phase: "pressed",
        hold: undefined,
        last: { x: event.clientX, y: event.clientY },
        box: null,
        boxed: new Set(),
        ends: new AbortController(),
      };
      gesture = g;
      if (g.touch) g.hold = setTimeout(() => rest(g), HOLD_MS);
    },
    { signal },
  );

  root.addEventListener(
    "pointermove",
    (event) => {
      if (gesture === null) {
        showEdgeCursor(event);
        return;
      }
      const g = gesture;
      if (g.id !== event.pointerId) return;
      g.last = { x: event.clientX, y: event.clientY };
      if (g.phase === "boxing") {
        draw(g);
        return;
      }
      if (g.phase === "dragging") {
        drag(g);
        return;
      }
      if (g.phase === "done" || Math.hypot(g.last.x - g.x, g.last.y - g.y) <= (g.touch ? TOUCH_SLOP : SLOP)) return;
      if (g.grab !== null && g.phase === "pressed") {
        carry(g);
        return;
      }
      if (g.phase === "armed" || (g.phase === "pressed" && !g.touch && g.noteId === undefined)) {
        if (g.phase === "pressed") watch(g);
        open(g);
      } else {
        // A press on a note that moves, or a finger that moves before it has rested: a drag or a scroll.
        clearTimeout(g.hold);
        g.phase = "done";
      }
    },
    { signal },
  );

  // The browser takes a finger that moves for a scroll unless this listener says otherwise, and it must be there before
  // the finger moves: it is cancelled only while a hold has armed the box.
  root.addEventListener(
    "touchmove",
    (event) => {
      const phase = gesture?.phase;
      if ((phase === "armed" || phase === "boxing" || phase === "dragging") && event.cancelable) {
        event.preventDefault();
      }
    },
    { passive: false, signal },
  );

  // The mouse's own double click: the first click selected or cleared, and this one draws or deletes. Touch is timed in
  // `click` above, since a phone does not send this event for a double tap on every platform.
  root.addEventListener(
    "dblclick",
    (event) => {
      if (touchPointer || event.shiftKey || !session.view.editable || pencilMode(session).on) return;
      const geometry = options.lane();
      if (!geometry || !(event.target instanceof Element)) return;
      event.preventDefault();
      const block = event.target.closest(".sce-note");
      const noteId = block ? geometry.owners.get(block) : undefined;
      if (noteId !== undefined) {
        const result = handleEditingInput(session, { type: "delete-note", noteId });
        if (result.refused.length > 0) options.refused(result.refused);
        return;
      }
      const at = placeIn(geometry, event.clientX, event.clientY);
      if (!at) return;
      const midi = midiAt(geometry, at.row);
      const result = handleEditingInput(session, {
        type: "add-note",
        voice: geometry.voice,
        tick: at.tick,
        midi,
      });
      if (result.refused.length > 0) options.refused(result.refused);
      else auditionPitch(midi);
    },
    { signal },
  );

  root.addEventListener(
    "pointerup",
    (event) => {
      const g = gesture;
      if (!g || g.id !== event.pointerId) return;
      g.last = { x: event.clientX, y: event.clientY };
      if (g.phase === "dragging") {
        drop(g);
        return;
      }
      if (g.phase === "boxing") {
        const now = placeIn(g.geometry, g.last.x, g.last.y);
        if (now) {
          const { hit } = reachOf(
            g.geometry,
            Math.min(g.anchor.tick, now.tick),
            Math.max(g.anchor.tick, now.tick),
            Math.min(g.anchor.row, now.row),
            Math.max(g.anchor.row, now.row),
          );
          // Taken out of the way first: the selection redraws the notes, and the preview must not outlive the box.
          const add = g.shift;
          finish();
          handleEditingInput(session, { type: "select-notes", noteIds: hit, add });
          return;
        }
      } else if (g.phase === "pressed" && Math.hypot(g.last.x - g.x, g.last.y - g.y) <= SLOP) {
        finish();
        click(g, event);
        return;
      }
      finish();
    },
    { signal },
  );

  // A change of the grid, the project or the shown view ends a double click: the next press means a new thing.
  const forgetDouble = session.subscribe((change) => {
    if (!(change.cause === "grid" || change.project || change.cause === "active-view" || change.view)) return;
    clickRevision += 1;
    lastClick = null;
  });
  signal.addEventListener("abort", forgetDouble, { once: true });

  const cancel = (event: PointerEvent) => {
    if (gesture && gesture.id === event.pointerId) finish();
  };
  root.addEventListener("pointercancel", cancel, { signal });
  root.addEventListener("lostpointercapture", cancel, { signal });
  root.addEventListener("pointerleave", clearEdgeCursor, { signal });
  signal.addEventListener("abort", clearEdgeCursor, { once: true });
  signal.addEventListener("abort", finish, { once: true });
}

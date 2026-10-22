// ABOUTME: The pointer gestures of a voice lane: a click or tap, a toggle with Shift or a touch and hold, and a box drawn on empty space.
// ABOUTME: It turns pointer events into editing inputs and draws the box over the lane; it reads the lane's geometry and never the score.
import { create } from "./dom";
import { handleEditingInput } from "./editing-input";
import type { Note } from "./score";
import type { EditingSession } from "./session";

/** A press that moves farther than this, in pixels, is a drag or a scroll and not a click, a tap or a hold. */
const SLOP = 6;

/** How long a finger rests on the lane before the hold means something: a toggle on a note, a box on empty space. */
const HOLD_MS = 400;

/** What a lane drew, which is all the gestures need to know about it. */
export interface LaneGeometry {
  /** The element whose width is the whole score in ticks and whose height is all the pitch rows. */
  readonly lane: HTMLElement;
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
}

/**
 * A press is `pressed` until it becomes something. A finger that rests on empty space is `armed`, and a pointer that
 * has gone on from there draws a `boxing` box. `done` is a press that came to nothing, or was given up: its release
 * does nothing.
 */
type Phase = "pressed" | "armed" | "boxing" | "done";

interface Gesture {
  readonly id: number;
  readonly touch: boolean;
  readonly x: number;
  readonly y: number;
  readonly geometry: LaneGeometry;
  /** The note the press landed on, if any. */
  readonly noteId: string | undefined;
  readonly shift: boolean;
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
 * at once is a scroll. The box selects what it touches when it is let go, and Escape gives it up.
 */
export function installLanePointer(
  root: HTMLElement,
  session: EditingSession,
  signal: AbortSignal,
  options: LanePointerOptions,
): void {
  let gesture: Gesture | null = null;

  function finish(): void {
    const g = gesture;
    if (!g) return;
    gesture = null;
    clearTimeout(g.hold);
    g.ends.abort();
    g.box?.remove();
    for (const id of g.boxed) g.geometry.blocks.get(id)?.removeAttribute("data-boxed");
    delete g.geometry.lane.dataset.boxing;
  }

  /** Gives the box up and leaves the press to end on its own release. */
  function giveUp(g: Gesture): void {
    clearTimeout(g.hold);
    g.phase = "done";
    g.ends.abort();
    g.box?.remove();
    g.box = null;
    for (const id of g.boxed) g.geometry.blocks.get(id)?.removeAttribute("data-boxed");
    g.boxed = new Set();
    delete g.geometry.lane.dataset.boxing;
  }

  /** Starts watching what can end a box without its pointer: Escape, a scroll under the pointer, a change of the session. */
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
    scope.addEventListener("scroll", () => draw(g), { capture: true, passive: true, ...own });
    const unsubscribe = session.subscribe(() => {
      if (!session.view.editable || options.lane() !== g.geometry) giveUp(g);
    });
    g.ends.signal.addEventListener("abort", unsubscribe, { once: true });
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
    for (const id of g.boxed) if (!shown.has(id)) g.geometry.blocks.get(id)?.removeAttribute("data-boxed");
    for (const id of shown) if (!g.boxed.has(id)) g.geometry.blocks.get(id)?.setAttribute("data-boxed", "");
    g.boxed = shown;
  }

  function open(g: Gesture): void {
    clearTimeout(g.hold);
    g.phase = "boxing";
    g.geometry.lane.dataset.boxing = "";
    g.box = create(g.geometry.lane.ownerDocument, "div", "sce-box", g.geometry.lane);
    g.box.setAttribute("aria-hidden", "true");
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
    watch(g);
  }

  /** A click or tap that came to nothing else. */
  function click(g: Gesture, event: PointerEvent): void {
    if (g.noteId !== undefined) {
      const input = g.shift
        ? ({ type: "toggle-note", noteId: g.noteId } as const)
        : ({ type: "click-note", noteId: g.noteId } as const);
      const { handled } = handleEditingInput(session, input);
      // A mouse press has focused the note by now. A touch or pen release comes before the browser moves the focus, so
      // moving it from here would draw the keyboard ring on a tap; the browser focuses the note next, without the ring.
      if (handled && !g.touch) options.focus(g.noteId);
      return;
    }
    // Shift on empty space is an aim that missed, and must not cost the selection.
    if (g.shift) return;
    const area = g.geometry.lane.getBoundingClientRect();
    if (!(area.width > 0)) return;
    handleEditingInput(session, {
      type: "click-empty",
      tick: ((event.clientX - area.left) / area.width) * g.geometry.ticks,
    });
  }

  root.addEventListener(
    "pointerdown",
    (event) => {
      finish();
      const primary = event.isPrimary && (event.pointerType !== "mouse" || event.button === 0);
      const geometry = options.lane();
      if (!primary || !geometry || !session.view.editable || !(event.target instanceof Element)) return;
      const block = event.target.closest(".sce-note");
      const noteId = block ? geometry.owners.get(block) : undefined;
      if (noteId === undefined && !event.target.closest(".sce-lane")) return;
      const anchor = placeIn(geometry, event.clientX, event.clientY);
      if (!anchor) return;
      const g: Gesture = {
        id: event.pointerId,
        touch: event.pointerType !== "mouse",
        x: event.clientX,
        y: event.clientY,
        geometry,
        noteId,
        shift: event.shiftKey,
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
      const g = gesture;
      if (!g || g.id !== event.pointerId) return;
      g.last = { x: event.clientX, y: event.clientY };
      if (g.phase === "boxing") {
        draw(g);
        return;
      }
      if (g.phase === "done" || Math.hypot(g.last.x - g.x, g.last.y - g.y) <= SLOP) return;
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
      if ((gesture?.phase === "armed" || gesture?.phase === "boxing") && event.cancelable) event.preventDefault();
    },
    { passive: false, signal },
  );

  root.addEventListener(
    "pointerup",
    (event) => {
      const g = gesture;
      if (!g || g.id !== event.pointerId) return;
      g.last = { x: event.clientX, y: event.clientY };
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

  const cancel = (event: PointerEvent) => {
    if (gesture && gesture.id === event.pointerId) finish();
  };
  root.addEventListener("pointercancel", cancel, { signal });
  root.addEventListener("lostpointercapture", cancel, { signal });
  signal.addEventListener("abort", finish, { once: true });
}

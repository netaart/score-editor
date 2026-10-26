// ABOUTME: The pointer gestures of the lyric track: dragging the edge of a phrase, and dragging a line from the unaligned area onto bars.
// ABOUTME: Only a press on a handle or a grip starts one, so a slide anywhere else on the track stays a scroll on a touch screen.
import type { LyricBoundaryPlan, LyricDropPlan } from "./lyric-edit";

/** How far a pointer moves before a press on a handle or a grip becomes a drag, in pixels. */
const SLOP = 4;

/** What a drag in progress would do, for the track to show. */
export type LyricPreview =
  | { readonly kind: "boundary"; readonly line: number; readonly plan: LyricBoundaryPlan }
  | { readonly kind: "drop"; readonly line: number; readonly plan: LyricDropPlan };

/** What the gestures need from the track: where things are, what a drag comes to, and where to send it. */
export interface LyricPointerHost {
  editable(): boolean;
  /** Where a pointer is on the time axis, in ticks; not held to the lane, since a plan holds an edge by itself. Null when nothing is drawn. */
  tickAt(clientX: number): number | null;
  /** Whether a point is over the lane's drawn time, where a line can be dropped. */
  overLane(clientX: number, clientY: number): boolean;
  boundaryPlan(line: number, edge: "start" | "end", tick: number): LyricBoundaryPlan | null;
  dropPlan(line: number, tick: number): LyricDropPlan | null;
  /** Shows what the drag would do, or takes the display down. */
  preview(show: LyricPreview | null): void;
  sendBoundary(line: number, plan: LyricBoundaryPlan): void;
  sendDrop(line: number, plan: LyricDropPlan): void;
}

/** A press on a handle or a grip that has not been let go of yet. */
interface Press {
  readonly pointerId: number;
  readonly target: HTMLElement;
  readonly line: number;
  /** The edge for a handle; null for a grip. */
  readonly edge: "start" | "end" | null;
  readonly startX: number;
  readonly startY: number;
  active: boolean;
  preview: LyricPreview | null;
}

/**
 * Wires the drags on `root`. A press on a `.sce-lyric-handle` drags one edge of a phrase to the bar line nearest the
 * pointer; a press on a `.sce-lyric-grip` drags a line onto the bar under the pointer. Both hold the pointer on the
 * element they started on, so a touch that began on a handle keeps its moves instead of being taken for a scroll (the
 * stylesheet gives the handle and the grip `touch-action: none`, and nothing else on the track). Letting go sends what
 * the preview showed; Escape, a pointer the browser takes back, and a lost window send nothing.
 */
export function installLyricPointer(root: HTMLElement, signal: AbortSignal, host: LyricPointerHost): void {
  const doc = root.ownerDocument;
  let press: Press | null = null;
  /** A drag just ended on an element that a click would reach; that click is the end of the drag, not a choice. */
  let dragged = false;

  function end(send: boolean): void {
    const current = press;
    if (!current) return;
    press = null;
    doc.removeEventListener("keydown", onKey, true);
    current.target.removeAttribute("data-dragging");
    const shown = current.preview;
    host.preview(null);
    if (current.target.hasPointerCapture?.(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
    if (!current.active) return;
    dragged = true;
    setTimeout(() => {
      dragged = false;
    }, 0);
    if (!send || !shown) return;
    if (shown.kind === "boundary") host.sendBoundary(shown.line, shown.plan);
    else host.sendDrop(shown.line, shown.plan);
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    end(false);
  }

  root.addEventListener(
    "pointerdown",
    (event) => {
      dragged = false;
      if (press || !host.editable() || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0))
        return;
      if (!(event.target instanceof Element)) return;
      const grip = event.target.closest<HTMLElement>(".sce-lyric-grip");
      const handle = grip ? null : event.target.closest<HTMLElement>(".sce-lyric-handle");
      const target = grip ?? handle;
      const owner = target?.closest<HTMLElement>("[data-line]");
      if (!target || !owner || owner.dataset.line === undefined) return;
      const edge = handle?.dataset.edge === "start" || handle?.dataset.edge === "end" ? handle.dataset.edge : null;
      if (handle && !edge) return;
      press = {
        pointerId: event.pointerId,
        target,
        line: Number(owner.dataset.line),
        edge,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
        preview: null,
      };
      target.setPointerCapture(event.pointerId);
      doc.addEventListener("keydown", onKey, true);
    },
    { signal },
  );

  root.addEventListener(
    "pointermove",
    (event) => {
      const current = press;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!current.active) {
        if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < SLOP) return;
        current.active = true;
        current.target.setAttribute("data-dragging", "");
      }
      current.preview = previewAt(current, event.clientX, event.clientY);
      host.preview(current.preview);
    },
    { signal },
  );

  function previewAt(current: Press, x: number, y: number): LyricPreview | null {
    const tick = host.tickAt(x);
    if (tick === null) return null;
    if (current.edge) {
      const plan = host.boundaryPlan(current.line, current.edge, tick);
      return plan ? { kind: "boundary", line: current.line, plan } : null;
    }
    if (!host.overLane(x, y)) return null;
    const plan = host.dropPlan(current.line, tick);
    return plan ? { kind: "drop", line: current.line, plan } : null;
  }

  root.addEventListener(
    "pointerup",
    (event) => {
      if (press && event.pointerId === press.pointerId) end(true);
    },
    { signal },
  );
  root.addEventListener(
    "pointercancel",
    (event) => {
      if (press && event.pointerId === press.pointerId) end(false);
    },
    { signal },
  );
  root.addEventListener(
    "lostpointercapture",
    (event) => {
      if (press && event.pointerId === press.pointerId) end(false);
    },
    { signal },
  );
  root.ownerDocument.defaultView?.addEventListener("blur", () => end(false), { signal });
  signal.addEventListener("abort", () => end(false), { once: true });

  // The click that ends a drag is not a choice of the line it ends on.
  root.addEventListener(
    "click",
    (event) => {
      if (!dragged) return;
      dragged = false;
      event.stopPropagation();
    },
    { capture: true, signal },
  );
}

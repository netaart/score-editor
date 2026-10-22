// ABOUTME: The time axis the view parts share: one controller per session applies zoom to every part, then scrolls every scroll surface.
// ABOUTME: Also the zoom actions (anchored zoom, fit, steps) and the zoom gestures, so the zoom control and the tracks zoom alike.
import { stepZoom, ZOOM_MAX, ZOOM_MIN } from "./arrangement";
import type { EditingSession } from "./session";

/** What anchored zoom and fitting measure: the scroll surface, its pinned corner and the time axis it scrolls. */
export interface AxisFrame {
  readonly scroller: HTMLElement;
  /** The pinned corner: its width is the pitch column's. */
  readonly corner: HTMLElement;
  /** An element as wide as the whole score at the current zoom. */
  readonly timeline: HTMLElement;
  /** The length of the score in ticks. */
  readonly ticks: number;
}

/** A part that draws on the time axis and takes its widths from the session's zoom. */
export interface AxisMember {
  /** The element that scrolls the part horizontally: the part itself, or the default editor's scroller around it. */
  readonly surface: HTMLElement;
  /**
   * Sets the widths, the grid and the bar-number thinning for `zoom`. `width` is the time axis' width at that zoom when
   * it is known; without it the member measures. Returns the width, or 0 when nothing is drawn.
   */
  layout(zoom: number, width: number | null): number;
  /** The geometry of what is drawn, or null when nothing is. */
  frame(): AxisFrame | null;
}

/** A scroll offset closer than this to the wanted one counts as reached, since the browser rounds to device pixels. */
const SCROLL_TOLERANCE = 0.5;

interface Surface {
  count: number;
  /** The offset the controller itself scrolled to, so the scroll event that follows is not taken for the user's. */
  expected: number | null;
  stop(): void;
}

const controllers = new WeakMap<EditingSession, AxisController>();

class AxisController {
  private readonly members = new Set<AxisMember>();
  private readonly surfaces = new Map<HTMLElement, Surface>();
  private zoom: number;
  private scrollLeft: number;
  /** The width of the time axis at zoom 1, in pixels; 0 until somebody has measured it. */
  private widthAtZoomOne = 0;
  private readonly unsubscribe: () => void;

  constructor(private readonly session: EditingSession) {
    this.zoom = session.view.zoom;
    this.scrollLeft = session.view.scrollLeft;
    this.unsubscribe = session.subscribe(() => this.onChange());
  }

  join(member: AxisMember): () => void {
    this.members.add(member);
    this.holdSurface(member.surface);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.members.delete(member);
      this.releaseSurface(member.surface);
      if (this.members.size === 0) {
        this.unsubscribe();
        if (controllers.get(this.session) === this) controllers.delete(this.session);
      }
    };
  }

  /** Lays `member` out for the session's zoom, measuring it, and brings its surface to the session's scroll offset. */
  place(member: AxisMember): void {
    const { zoom, scrollLeft } = this.session.view;
    this.rememberWidth(member.layout(zoom, null), zoom);
    this.scrollTo(member.surface, scrollLeft);
  }

  /** Learns the width of the time axis at zoom 1 from a measurement of it at `zoom`; a width of nothing teaches nothing. */
  rememberWidth(width: number, zoom: number): void {
    if (width > 0) this.widthAtZoomOne = width / zoom;
  }

  frame(): AxisFrame | null {
    for (const member of this.members) {
      const frame = member.frame();
      if (frame) return frame;
    }
    return null;
  }

  /** First every member's widths, so the document lays out once, then every surface's scroll offset. */
  private onChange(): void {
    const { zoom, scrollLeft } = this.session.view;
    const zoomed = zoom !== this.zoom;
    if (zoomed) {
      this.zoom = zoom;
      const known = this.widthAtZoomOne > 0 ? this.widthAtZoomOne * zoom : null;
      for (const member of this.members) this.rememberWidth(member.layout(zoom, known), zoom);
    }
    if (zoomed || scrollLeft !== this.scrollLeft) {
      this.scrollLeft = scrollLeft;
      for (const surface of this.surfaces.keys()) this.scrollTo(surface, scrollLeft);
    }
  }

  private scrollTo(surface: HTMLElement, offset: number): void {
    const entry = this.surfaces.get(surface);
    if (!entry || Math.abs(surface.scrollLeft - offset) < SCROLL_TOLERANCE) return;
    const before = surface.scrollLeft;
    surface.scrollLeft = offset;
    const after = surface.scrollLeft;
    entry.expected = after === before ? null : after;
  }

  private holdSurface(surface: HTMLElement): void {
    const held = this.surfaces.get(surface);
    if (held) {
      held.count += 1;
      return;
    }
    const abort = new AbortController();
    const entry: Surface = { count: 1, expected: null, stop: () => abort.abort() };
    surface.addEventListener(
      "scroll",
      () => {
        const offset = surface.scrollLeft;
        const echo = entry.expected !== null && Math.abs(offset - entry.expected) < SCROLL_TOLERANCE;
        entry.expected = null;
        if (!echo) this.session.setView({ scrollLeft: offset });
      },
      { signal: abort.signal, passive: true },
    );
    this.surfaces.set(surface, entry);
  }

  private releaseSurface(surface: HTMLElement): void {
    const entry = this.surfaces.get(surface);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return;
    entry.stop();
    this.surfaces.delete(surface);
  }
}

/** Adds `member` to the session's time axis. Returns the controller to place it with, and the way out. */
export function joinAxis(session: EditingSession, member: AxisMember): { place(): void; leave(): void } {
  let controller = controllers.get(session);
  if (!controller) {
    controller = new AxisController(session);
    controllers.set(session, controller);
  }
  const joined = controller;
  return { place: () => joined.place(member), leave: joined.join(member) };
}

/** The instant a zoom keeps where it was on screen, and the part whose geometry it is measured in. */
export interface ZoomAnchor {
  /** The pointer's x in the page; without it, the middle of what `frame` shows. */
  clientX?: number | undefined;
  /** The part the gesture reached, so its own left edge and scroll offset are used; default: the first part on the axis. */
  frame?: AxisFrame | null | undefined;
}

/** Changes the zoom and keeps the anchor where it was on screen. Layout is read once, before the change. */
export function zoomTo(session: EditingSession, next: number, anchor: ZoomAnchor = {}): void {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  const before = session.view.zoom;
  if (Math.abs(zoom - before) < 1e-9) return;
  const controller = controllers.get(session);
  const frame = anchor.frame ?? controller?.frame();
  if (!controller || !frame) {
    session.setView({ zoom });
    return;
  }
  const { scroller, corner, timeline, ticks } = frame;
  const box = scroller.getBoundingClientRect();
  const scale = box.width / scroller.offsetWidth || 1;
  const keys = corner.offsetWidth;
  const at =
    anchor.clientX === undefined ? keys + (scroller.clientWidth - keys) / 2 : (anchor.clientX - box.left) / scale;
  const width = timeline.offsetWidth;
  const pixelsPerTick = ticks > 0 ? width / ticks : 0;
  const tick = pixelsPerTick > 0 ? (scroller.scrollLeft + at - keys) / pixelsPerTick : 0;
  controller.rememberWidth(width, before);
  session.setView({ zoom, scrollLeft: tick * pixelsPerTick * (zoom / before) + keys - at });
}

/** How much of the next stretch of time stays in view beside a tick that is brought into view, in pixels. */
const REVEAL_MARGIN = 24;

/**
 * Scrolls the time axis just far enough to show `tick`, with a little of what is around it. Nothing moves when it is
 * already in view. `frame` says whose geometry counts; without it, the first part on the axis.
 */
export function revealTick(session: EditingSession, tick: number, frame?: AxisFrame | null): void {
  const found = frame ?? controllers.get(session)?.frame();
  if (!found || !(found.ticks > 0)) return;
  const { scroller, corner, timeline, ticks } = found;
  const width = timeline.offsetWidth;
  if (!(width > 0)) return;
  const at = (tick / ticks) * width;
  const from = scroller.scrollLeft;
  // The pitch column covers the left of the scroller, so the time in view runs from `from` for the rest of its width.
  const shown = scroller.clientWidth - corner.offsetWidth;
  let to = from;
  if (at - REVEAL_MARGIN < from) to = at - REVEAL_MARGIN;
  else if (at + REVEAL_MARGIN > from + shown) to = at + REVEAL_MARGIN - shown;
  to = Math.max(0, to);
  if (Math.abs(to - from) >= SCROLL_TOLERANCE) session.setView({ scrollLeft: to });
}

/** Where a tick stands against what the axis shows: before its left edge, inside it, or after its right edge. */
type TickPlace = "before" | "inside" | "after";

/** The axis `frame` measures (default: the first part on the axis) and the width of its timeline, or null when nothing is drawn. */
function measuredAxis(session: EditingSession, frame?: AxisFrame | null): { axis: AxisFrame; width: number } | null {
  const axis = frame ?? controllers.get(session)?.frame();
  if (!axis || !(axis.ticks > 0)) return null;
  const width = axis.timeline.offsetWidth;
  return width > 0 ? { axis, width } : null;
}

/**
 * The place of `tick` on the axis `frame` measures (default: the first part on the axis), or null when nothing is drawn.
 * A `margin` in pixels counts the strip that far in from the right edge as already past it.
 */
export function tickPlace(
  session: EditingSession,
  tick: number,
  frame?: AxisFrame | null,
  margin = 0,
): TickPlace | null {
  const measured = measuredAxis(session, frame);
  if (!measured) return null;
  const { scroller, corner, ticks } = measured.axis;
  const at = (tick / ticks) * measured.width;
  const from = scroller.scrollLeft;
  if (at < from) return "before";
  return at > from + scroller.clientWidth - corner.offsetWidth - margin ? "after" : "inside";
}

/** Scrolls the time axis so that `tick` stands a little in from its left edge: a page turn, for a tick that moves on. */
export function turnTo(session: EditingSession, tick: number, frame?: AxisFrame | null): void {
  const measured = measuredAxis(session, frame);
  if (!measured) return;
  session.setView({ scrollLeft: Math.max(0, (tick / measured.axis.ticks) * measured.width - REVEAL_MARGIN) });
}

/** Zooms so that the whole score is exactly as wide as the first part on the axis shows, and scrolls to its start. */
export function fitZoom(session: EditingSession): void {
  const controller = controllers.get(session);
  const frame = controller?.frame();
  if (!controller || !frame || frame.ticks <= 0) return;
  const { scroller, corner, timeline } = frame;
  const width = timeline.offsetWidth;
  const wholeScore = width / session.view.zoom;
  if (!(wholeScore > 0)) return;
  controller.rememberWidth(width, session.view.zoom);
  const zoom = Math.floor(((scroller.clientWidth - corner.offsetWidth) / wholeScore) * 1000) / 1000;
  session.setView({ zoom, scrollLeft: 0 });
}

export function stepZoomBy(session: EditingSession, direction: "in" | "out", frame?: AxisFrame | null): void {
  const next = stepZoom(session.view.zoom, direction);
  if (next !== null) zoomTo(session, next, { frame });
}

function onZoomKey(event: KeyboardEvent, session: EditingSession, frame: () => AxisFrame | null): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof Element && event.target.closest(".sce-menu-item")) return;
  // A plus or a minus typed into a text box is text; the text view has one inside the editor.
  if (event.target instanceof Element && event.target.closest("input, textarea, select")) return;
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    stepZoomBy(session, "in", frame());
  } else if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    stepZoomBy(session, "out", frame());
  }
}

function onZoomWheel(event: WheelEvent, session: EditingSession, frame: () => AxisFrame | null): void {
  if (event.defaultPrevented || !event.ctrlKey || !(event.target instanceof Element)) return;
  // A trackpad pinch arrives as a control-wheel too. Without this the page itself would zoom.
  event.preventDefault();
  const lines = event.deltaMode === 1 ? 16 : 1;
  const delta = Math.max(-100, Math.min(100, event.deltaY * lines));
  zoomTo(session, session.view.zoom * Math.exp(-delta * 0.0025), { clientX: event.clientX, frame: frame() });
}

/**
 * Zoom with the plus and minus keys, and with control and the wheel around the pointer, on whatever `target` holds.
 * `frame` says whose geometry the pointer is in; without it, the first part on the axis is measured. A part inside
 * another that has the same gestures zooms once: the first to handle an event marks it handled.
 */
export function installZoomGestures(
  target: HTMLElement,
  session: EditingSession,
  signal: AbortSignal,
  options: { wheel: boolean; frame?: () => AxisFrame | null },
): void {
  const frame = options.frame ?? (() => null);
  target.addEventListener("keydown", (event) => onZoomKey(event, session, frame), { signal });
  if (options.wheel) {
    target.addEventListener("wheel", (event) => onZoomWheel(event, session, frame), { signal, passive: false });
  }
}

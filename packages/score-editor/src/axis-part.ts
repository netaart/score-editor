// ABOUTME: The shared body of the three view parts that draw on the time axis: the ruler, the chord track and a voice track.
// ABOUTME: It owns the part's root, redraws when the reading or the language changes, and leaves zoom and scroll to the axis controller.

import { barLabelStep, type GridRun, gridTicks, MIN_BAR_LINE_PIXELS, MIN_BEAT_LINE_PIXELS } from "./arrangement";
import { type AxisFrame, type AxisMember, installZoomGestures, joinAxis } from "./axis";
import { create, requireDom } from "./dom";
import { type Messages, messagesFor } from "./i18n";
import { type Score, TICKS_PER_QUARTER } from "./score";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { AxisPartOptions, Language, ViewPart } from "./types";

/** The grid lines of a lane: one element for each stretch of bars in one meter. */
export interface Grid {
  element: HTMLElement;
  run: GridRun;
}

/** What a part built for a score: the elements zoom and fitting need to find again. */
export interface BuiltAxis {
  /** The elements that each carry the time axis: their width is the score's length at the current zoom. */
  axes: HTMLElement[];
  grids: Grid[];
  /** The pinned corner: its width is the pitch column's. */
  corner: HTMLElement;
  /** An element as wide as the whole score. */
  timeline: HTMLElement;
  /** The bars whose numbers thin out as the zoom changes; 0 where the part has no bar numbers. */
  barCount: number;
}

export interface AxisSpec {
  /** The part's name: its root's class suffix. */
  readonly kind: "time-ruler" | "chord-track" | "voice-track";
  /** The public function that mounts it, named in the error where there is no DOM. */
  readonly who: string;
  /** What the part is called where it is its own focusable scroll surface. */
  region(t: Messages): string;
  /** Builds the part's content into `canvas`, or returns null when the score has nothing for this part. */
  build(canvas: HTMLElement, score: Score, t: Messages, language: Language): BuiltAxis | null;
  /** Wires what the part does on its root, once, before the first draw. Its listeners go with `signal`. */
  attach?(root: HTMLElement, signal: AbortSignal): void;
  /**
   * Shows what the session holds beyond the score, such as the selection. It runs after every draw and after every
   * other change of the session, so it must be cheap when nothing it shows has changed.
   */
  refresh?(): void;
}

/** A row of the pinned header: the pinned corner and the timeline that carries the row's items. */
export function headerRow(
  canvas: HTMLElement,
  className: string,
  label: string,
): { corner: HTMLElement; timeline: HTMLElement } {
  const doc = canvas.ownerDocument;
  const row = create(doc, "div", `sce-row ${className}`, canvas);
  const corner = create(doc, "div", "sce-corner", row);
  const timeline = create(doc, "div", "sce-timeline", row);
  timeline.setAttribute("role", "list");
  timeline.setAttribute("aria-label", label);
  return { corner, timeline };
}

/**
 * Says which grid lines a lane draws and how far apart they are, in beats; the stylesheet draws them as gradients,
 * so they cost no nodes per line. A line is left out where lines would sit too close to read.
 */
function drawGrid(grids: ReadonlyArray<Grid>, zoom: number, pixelsPerTick: number): void {
  for (const { element, run } of grids) {
    const lines: string[] = [];
    if (run.barTicks * pixelsPerTick >= MIN_BAR_LINE_PIXELS) lines.push("bar");
    if (run.beatTicks * pixelsPerTick >= MIN_BEAT_LINE_PIXELS) lines.push("beat");
    element.style.setProperty("--bar-beats", String((zoom * run.barTicks) / TICKS_PER_QUARTER));
    element.style.setProperty("--beat-beats", String((zoom * run.beatTicks) / TICKS_PER_QUARTER));
    if (lines.length > 0) element.dataset.lines = lines.join(" ");
    else delete element.dataset.lines;
  }
}

export function mountAxisPart(
  host: HTMLElement,
  session: EditingSession,
  spec: AxisSpec,
  options: AxisPartOptions = {},
): ViewPart {
  requireDom(spec.who);
  const doc = host.ownerDocument;
  const abort = new AbortController();
  const releaseStyles = acquireStyles(host);
  const root = create(doc, "div", `sce-root sce-part sce-axis sce-part-${spec.kind}`);
  host.appendChild(root);
  spec.attach?.(root, abort.signal);
  const ownSurface = options.scroller === undefined;
  const surface = options.scroller ?? root;
  if (!ownSurface) root.classList.add("sce-in-scroller");

  let reading = session.reading;
  let language = session.view.language;
  let canvas: HTMLElement | null = null;
  let built: BuiltAxis | null = null;
  let ticks = 0;
  let destroyed = false;

  const member: AxisMember = {
    surface,
    layout(zoom, width) {
      if (!built || !canvas) return 0;
      const span = `var(--sce-ticks) * var(--sce-_beat) * ${zoom} / ${TICKS_PER_QUARTER}`;
      canvas.style.width = `calc(var(--sce-_keys) + ${span})`;
      for (const axis of built.axes) axis.style.width = `calc(${span})`;
      const measured = width ?? built.timeline.offsetWidth;
      if (built.barCount > 0 && measured > 0) root.dataset.labelStep = String(barLabelStep(measured / built.barCount));
      else delete root.dataset.labelStep;
      if (built.grids.length > 0 && ticks > 0) drawGrid(built.grids, zoom, measured / ticks);
      return measured;
    },
    frame(): AxisFrame | null {
      return built ? { scroller: surface, corner: built.corner, timeline: built.timeline, ticks } : null;
    },
  };
  const axis = joinAxis(session, member);

  function render(): void {
    reading = session.reading;
    language = session.view.language;
    root.lang = language;
    root.replaceChildren();
    delete root.dataset.labelStep;
    canvas = null;
    built = null;
    ticks = 0;
    const t = messagesFor(language);
    if (reading.kind === "score") {
      ticks = gridTicks(reading.score);
      const fresh = create(doc, "div", "sce-canvas");
      fresh.style.setProperty("--sce-ticks", String(ticks));
      const result = spec.build(fresh, reading.score, t, language);
      if (result) {
        root.appendChild(fresh);
        canvas = fresh;
        built = result;
      }
    }
    if (ownSurface) markAsRegion(built !== null, t);
    axis.place();
    spec.refresh?.();
  }

  /** A part that scrolls itself must be reachable and named for a keyboard or a screen reader, as a region is. */
  function markAsRegion(drawn: boolean, t: Messages): void {
    if (drawn) {
      root.tabIndex = 0;
      root.setAttribute("role", "region");
      root.setAttribute("aria-label", spec.region(t));
    } else {
      root.removeAttribute("tabindex");
      root.removeAttribute("role");
      root.removeAttribute("aria-label");
    }
  }

  installZoomGestures(root, session, abort.signal, { wheel: true, frame: () => member.frame() });
  render();
  const unsubscribe = session.subscribe(() => {
    if (session.reading !== reading || session.view.language !== language) render();
    else spec.refresh?.();
  });

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribe();
      axis.leave();
      root.remove();
      releaseStyles();
    },
  };
}

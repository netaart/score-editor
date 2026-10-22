// ABOUTME: The shared body of the three view parts that draw on the time axis: the ruler, the chord track and a voice track.
// ABOUTME: It owns the part's root, redraws when the reading or the language changes, and leaves zoom and scroll to the axis controller.

import { barLabelStep, type GridRun, gridTicks, MIN_BAR_LINE_PIXELS, MIN_BEAT_LINE_PIXELS } from "./arrangement";
import { type AxisFrame, type AxisMember, installZoomGestures, joinAxis } from "./axis";
import { create, requireDom } from "./dom";
import { type Messages, messagesFor } from "./i18n";
import { type Score, TICKS_PER_QUARTER } from "./score";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

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
  /** Builds the part's content into `canvas`, or returns null when the score has nothing for this part. */
  build(canvas: HTMLElement, score: Score, t: Messages, language: Language): BuiltAxis | null;
}

/**
 * Draws the bar and beat lines: a strong line at every bar start and a light one at every beat of the bar's meter,
 * from the position the stretch of bars starts at. They are gradients, so they cost no nodes per line.
 */
function drawGrid(grids: ReadonlyArray<Grid>, zoom: number, pixelsPerTick: number): void {
  for (const { element, run } of grids) {
    const line = (color: string, ticks: number) => {
      const period = `calc(var(--sce-_beat) * ${(zoom * ticks) / TICKS_PER_QUARTER})`;
      return `repeating-linear-gradient(to right, ${color} 0 1px, transparent 1px ${period})`;
    };
    const layers: string[] = [];
    if (run.barTicks * pixelsPerTick >= MIN_BAR_LINE_PIXELS) layers.push(line("var(--sce-_line-strong)", run.barTicks));
    if (run.beatTicks * pixelsPerTick >= MIN_BEAT_LINE_PIXELS) layers.push(line("var(--sce-_line)", run.beatTicks));
    element.style.backgroundImage = layers.join(", ");
  }
}

export function mountAxisPart(host: HTMLElement, session: EditingSession, spec: AxisSpec): ViewPart {
  requireDom(spec.who);
  const doc = host.ownerDocument;
  const abort = new AbortController();
  const releaseStyles = acquireStyles(host);
  const root = create(doc, "div", `sce-root sce-part sce-axis sce-part-${spec.kind}`);
  host.appendChild(root);
  const surface = root.closest<HTMLElement>(".sce-scroller") ?? root;

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
    canvas = null;
    built = null;
    ticks = 0;
    if (reading.kind === "score") {
      ticks = gridTicks(reading.score);
      const fresh = create(doc, "div", "sce-canvas");
      fresh.style.setProperty("--sce-ticks", String(ticks));
      const result = spec.build(fresh, reading.score, messagesFor(language), language);
      if (result) {
        root.appendChild(fresh);
        canvas = fresh;
        built = result;
      }
    }
    axis.place();
  }

  installZoomGestures(root, session, abort.signal, { wheel: true });
  render();
  const unsubscribe = session.subscribe(() => {
    if (session.reading !== reading || session.view.language !== language) render();
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

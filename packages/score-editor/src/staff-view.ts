// ABOUTME: The staff view part: the score drawn on a staff by abcjs, read-only, for those who check a score by reading it.
// ABOUTME: abcjs is loaded when the part is mounted, and draws inside a shadow root of its own, out of reach of the page's rules.
import { barIndexAt } from "./arrangement";
import { create, requireDom } from "./dom";
import { messagesFor, viewName } from "./i18n";
import { holdPreviewPlayer } from "./preview-player";
import type { Score } from "./score";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import { tickAtSeconds } from "./tempo";
import type { Language, ViewPart } from "./types";

type Abcjs = typeof import("abcjs");

/** The narrowest staff drawn; a box narrower than this scrolls sideways instead of squeezing the notes. */
const MIN_STAFF_WIDTH = 240;

/** The height of one staff step in abcjs's drawing coordinates, used when a staff has not reported its lines. */
const STAFF_STEP = 3.875;

/** How far in from the edge of the region a position is brought when it has gone out of view. */
const REVEAL_MARGIN = 16;

/**
 * What the drawing's own shadow root is styled with: it fills its box and takes the part's colour from outside. The
 * cursor is here because it is drawn over the same shadow root as the staff, so page rules cannot reach either.
 */
const DRAWING_CSS = `
:host { display: block; position: relative; }
svg { display: block; }
.sce-staff-cursor {
  position: absolute;
  z-index: 1;
  width: 3px;
  margin-left: -1px;
  background: linear-gradient(
    to right,
    var(--sce-_bg) 0 1px,
    var(--sce-_text) 1px 2px,
    var(--sce-_bg) 2px 3px
  );
  pointer-events: none;
}
@media (forced-colors: active) {
  .sce-staff-cursor { background: CanvasText; }
}
`;

export interface StaffViewPart extends ViewPart {
  /**
   * Draws the play cursor at `seconds` from the start of the score, or takes it away for null. The time is turned into
   * a position through the score's tempo, including a change part-way through; a time past the end stays at the end.
   * A preview playing on the session's player drives the same cursor until it stops.
   */
  setPlayPosition(seconds: number | null): void;
}

/** One bar as abcjs drew it: the model's ticks and the drawing's coordinates. */
interface CursorBar {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly bottom: number;
}

interface CursorGeometry {
  readonly bars: ReadonlyArray<CursorBar>;
}

/** A box in the coordinates the cursor is positioned in: pixels from the drawing element's own corner. */
interface DrawingBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface AbcElement {
  readonly type?: string;
  readonly x?: number;
}

interface AbcStaffGroup {
  readonly line?: number;
  readonly staffs?: ReadonlyArray<{
    readonly topLine?: number;
    readonly bottomLine?: number;
    readonly absoluteY?: number;
  }>;
  readonly voices?: ReadonlyArray<{ readonly children?: ReadonlyArray<AbcElement> }>;
}

let loading: Promise<Abcjs> | null = null;

/**
 * Loads abcjs once for the page. It is a dynamic import so that importing the package, on a server or in a bundle
 * that never shows a staff, does not load it. A load that failed is tried again by the next staff view.
 */
function loadAbcjs(): Promise<Abcjs> {
  loading ??= import("abcjs").then(
    // abcjs is a CommonJS module: a bundler may hand over its functions as the namespace or under `default`.
    (loaded) => (loaded as { default?: Abcjs }).default ?? loaded,
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** A shadow root's style sheet, as the stylesheet object model makes it, which a strict style policy does not govern. */
function styleDrawing(doc: Document, shadow: ShadowRoot): void {
  const view = doc.defaultView;
  if (view && typeof view.CSSStyleSheet?.prototype.replaceSync === "function") {
    const sheet = new view.CSSStyleSheet();
    sheet.replaceSync(DRAWING_CSS);
    shadow.adoptedStyleSheets = [sheet];
    return;
  }
  const style = doc.createElement("style");
  style.textContent = DRAWING_CSS;
  shadow.appendChild(style);
}

/** A drawn element's box, measured from the drawing host's corner: the coordinates the cursor's left and top use. */
function boxIn(host: HTMLElement, node: Element): DrawingBox {
  const base = host.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  return {
    left: box.left - base.left,
    top: box.top - base.top,
    right: box.right - base.left,
    bottom: box.bottom - base.top,
    width: box.width,
    height: box.height,
  };
}

/**
 * Where each bar of `score` sits in the drawing: the bar line that opens it, the line that closes it, and the staff
 * lines above and below. abcjs orders each line's voice by its measures, so the bars of the drawing follow the model.
 * The boxes are read from the drawn `.abcjs-bar`, `.abcjs-note` and `.abcjs-staff` elements themselves, in the
 * drawing host's pixels: that is the cursor's containing block, the only space its own left and top mean anything in.
 * The elements are picked by the marks abcjs writes on them (`abcjs-v<n>`, `abcjs-l<n>`), so a later voice or staff
 * cannot be mistaken for the voice and line being walked. A bar starts at the drawn line that closes the one before
 * it; the first bar of a system has no line of its own, so it starts at its first drawn note or rest. On a two-staff
 * system the staff box is the span from the first staff's top line to the last staff's bottom line.
 */
function geometryOf(tune: unknown, score: Score, host: HTMLElement): CursorGeometry {
  const svg = host.shadowRoot?.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) return { bars: [] };
  const engraver = (tune as { engraver?: { staffgroups?: ReadonlyArray<AbcStaffGroup> } } | null)?.engraver;
  const groups = engraver?.staffgroups ?? [];
  const allBars = [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-bar")];
  const allNotes = [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-note, .abcjs-rest")];
  const allStaffs = [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-staff")];
  const bars: CursorBar[] = [];
  let index = 0;
  for (const [groupIndex, group] of groups.entries()) {
    const voice = group.voices?.[0];
    if (!voice) continue;
    const line = group.line ?? groupIndex;
    const lineClass = `abcjs-l${line}`;
    const voiceClass = "abcjs-v0";
    const barNodes = allBars.filter(
      (node) => node.classList.contains(lineClass) && node.classList.contains(voiceClass),
    );
    const noteNodes = allNotes.filter(
      (node) => node.classList.contains(lineClass) && node.classList.contains(voiceClass),
    );
    const staffNodes = allStaffs.filter((node) => node.classList.contains(lineClass));
    const staffBoxes = staffNodes.map((node) => boxIn(host, node));
    const fallbackTops = (group.staffs ?? []).map((staff) => {
      const middle = staff.absoluteY ?? 0;
      return staff.topLine ?? middle - 10 * STAFF_STEP;
    });
    const fallbackBottoms = (group.staffs ?? []).map((staff) => {
      const middle = staff.absoluteY ?? 0;
      return staff.bottomLine ?? middle + 2 * STAFF_STEP;
    });
    const top = staffBoxes.length > 0 ? Math.min(...staffBoxes.map((box) => box.top)) : Math.min(...fallbackTops);
    const bottom =
      staffBoxes.length > 0 ? Math.max(...staffBoxes.map((box) => box.bottom)) : Math.max(...fallbackBottoms);
    const children = voice.children ?? [];
    let startX: number | null = null;
    let hasContent = false;
    let barAt = 0;
    let noteAt = 0;
    for (const child of children) {
      if (child.type === "note" || child.type === "rest") {
        const note = noteNodes[noteAt];
        noteAt += 1;
        hasContent = true;
        if (startX === null) startX = note ? boxIn(host, note).left : (child.x ?? 0);
      }
      if (child.type !== "bar") continue;
      const barNode = barNodes[barAt];
      barAt += 1;
      const barX = barNode ? boxIn(host, barNode).left : (child.x ?? startX ?? 0);
      if (!hasContent) {
        // The bar line at the start of a system opens its first measure rather than closing one.
        startX = barX;
        continue;
      }
      const model = score.bars[index];
      if (model) {
        bars.push({
          index,
          start: model.start,
          end: model.start + model.length,
          x0: startX ?? barX,
          x1: barX,
          top,
          bottom,
        });
      }
      index += 1;
      startX = barX;
      hasContent = false;
    }
  }
  return { bars };
}

/**
 * Mounts the staff view on `el`: the project's score drawn by abcjs, read-only. abcjs is loaded by this call and not by
 * importing the package. The states of the part and the isolation of the drawing are in DESIGN.md, "Staff view".
 */
export function mountStaffView(el: HTMLElement, session: EditingSession): StaffViewPart {
  requireDom("mountStaffView");
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;
  const releaseStyles = acquireStyles(el);

  const root = create(doc, "div", "sce-root sce-part sce-part-staff");
  el.appendChild(root);
  const scroller = create(doc, "div", "sce-staff", root);
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "region");
  const message = create(doc, "p", "sce-staff-message", scroller);
  const holder = create(doc, "div", "sce-staff-drawing", scroller);
  holder.setAttribute("role", "img");
  holder.style.minWidth = `${MIN_STAFF_WIDTH}px`;
  const shadow = holder.attachShadow({ mode: "open" });
  styleDrawing(doc, shadow);
  const target = doc.createElement("div");
  shadow.appendChild(target);
  const cursor = doc.createElement("div");
  cursor.className = "sce-staff-cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.hidden = true;
  shadow.appendChild(cursor);

  const abort = new AbortController();
  const hold = holdPreviewPlayer(session);
  const { player } = hold;

  let abcjs: Abcjs | null = null;
  let failed = false;
  let destroyed = false;
  let frame: number | null = null;
  /** What the drawing shows now, so a change that does not alter it costs nothing. */
  let drawnText: string | null = null;
  let drawnWidth = 0;
  let language: Language | null = null;
  /** The score the drawing was made for, and where its bars are in it. */
  let score: Score | null = null;
  let geometry: CursorGeometry = { bars: [] };
  /** The host's own position, in seconds, kept while the preview plays and shown again when it stops. */
  let hostSeconds: number | null = null;

  function say(words: string, role: "status" | "alert"): void {
    message.textContent = words;
    message.setAttribute("role", role);
    message.hidden = false;
  }

  function hideCursor(): void {
    cursor.hidden = true;
  }

  function clear(): void {
    target.replaceChildren();
    drawnText = null;
    drawnWidth = 0;
    score = null;
    geometry = { bars: [] };
    hideCursor();
  }

  /** The tick the host's seconds name in the score that is drawn now. */
  function hostTick(): number | null {
    return score === null || hostSeconds === null ? null : tickAtSeconds(score, hostSeconds);
  }

  /** Brings a cursor that has gone out of the region back into it, near the start of the line it is on. */
  function reveal(): void {
    const line = cursor.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    if (line.left < view.left || line.right > view.right) {
      scroller.scrollLeft = Math.max(0, scroller.scrollLeft + line.left - view.left - REVEAL_MARGIN);
    }
    if (line.top < view.top || line.bottom > view.bottom) {
      scroller.scrollTop = Math.max(0, scroller.scrollTop + line.top - view.top - REVEAL_MARGIN);
    }
  }

  /** Draws the cursor at `tick`, or hides it when there is no tick or no bar to put it on. */
  function placeCursor(tick: number | null): void {
    if (tick === null || score === null || score.bars.length === 0) {
      hideCursor();
      return;
    }
    const bar = geometry.bars[barIndexAt(score.bars, tick)];
    if (!bar) {
      hideCursor();
      return;
    }
    const span = bar.end - bar.start;
    const fraction = span > 0 ? Math.min(1, Math.max(0, (tick - bar.start) / span)) : 0;
    cursor.hidden = false;
    cursor.style.left = `${bar.x0 + fraction * (bar.x1 - bar.x0)}px`;
    cursor.style.top = `${bar.top - 2}px`;
    cursor.style.height = `${bar.bottom - bar.top + 4}px`;
    reveal();
  }

  /** The bar a point on the drawing is over, preferring the staff line that point is nearest. */
  function barAt(x: number, y: number): CursorBar | null {
    let best: CursorBar | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const bar of geometry.bars) {
      const vertical = y < bar.top ? bar.top - y : y > bar.bottom ? y - bar.bottom : 0;
      const horizontal = x < bar.x0 ? bar.x0 - x : x > bar.x1 ? x - bar.x1 : 0;
      const distance = vertical * 2 + horizontal;
      if (distance < nearest) {
        nearest = distance;
        best = bar;
      }
    }
    return best;
  }

  /** A pointer's place in the drawing host's coordinates, whatever element it landed on. */
  function pointInDrawing(event: MouseEvent): { x: number; y: number } {
    const base = holder.getBoundingClientRect();
    return { x: event.clientX - base.left, y: event.clientY - base.top };
  }

  /** The drawn note or rest a point is on, from the boxes rather than the element under the pointer. */
  function noteBoxAt(x: number, y: number): DrawingBox | null {
    let found: DrawingBox | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const note of target.querySelectorAll<SVGGraphicsElement>(".abcjs-note, .abcjs-rest")) {
      const box = boxIn(holder, note);
      const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
      const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
      const distance = Math.hypot(dx, dy);
      if (distance < nearest) {
        nearest = distance;
        found = box;
      }
    }
    // A one-pixel slack takes the antialiased edge of a note head; an empty part of the staff has no note near it.
    return nearest <= 1 ? found : null;
  }

  /** The onset of the note nearest to `tick` in `bar`, so a press on a note starts the preview at that note. */
  function onsetNear(bar: CursorBar, tick: number): number {
    if (!score) return tick;
    let found = tick;
    let nearest = Number.POSITIVE_INFINITY;
    for (const note of score.notes) {
      if (note.start < bar.start || note.start >= bar.end) continue;
      const distance = Math.abs(note.start - tick);
      if (distance < nearest) {
        nearest = distance;
        found = note.start;
      }
    }
    return found;
  }

  target.addEventListener(
    "click",
    (event) => {
      if (destroyed) return;
      const point = pointInDrawing(event);
      const box = noteBoxAt(point.x, point.y);
      if (!box) return;
      const bar = barAt(box.left + box.width / 2, box.top + box.height / 2);
      if (!bar) return;
      const span = bar.x1 - bar.x0;
      const fraction = span > 0 ? Math.min(1, Math.max(0, (box.left + box.width / 2 - bar.x0) / span)) : 0;
      const tick = onsetNear(bar, bar.start + fraction * (bar.end - bar.start));
      if (player.playing) player.stop();
      void player.start(tick);
    },
    { signal: abort.signal },
  );

  function draw(): void {
    frame = null;
    if (destroyed) return;
    const t = messagesFor(session.view.language);
    if (language !== session.view.language) {
      language = session.view.language;
      root.lang = language;
      scroller.setAttribute("aria-label", viewName(t, "staff"));
      holder.setAttribute("aria-label", t.staffDrawing);
    }
    if (failed) {
      say(t.staffFailed, "alert");
      return;
    }
    if (abcjs === null) {
      say(t.staffLoading, "status");
      return;
    }
    message.hidden = true;
    if (session.reading.kind !== "score") {
      clear();
      return;
    }
    const width = Math.floor(holder.clientWidth);
    // A box that is not shown has no width: the drawing waits until it has one, and keeps what it drew before.
    if (width <= 0) return;
    const current = session.reading.score;
    const text = current.drawingText ?? session.project.score;
    if (text === drawnText && width === drawnWidth && current === score) {
      placeCursor(player.playing ? player.tick : hostTick());
      return;
    }
    try {
      target.replaceChildren();
      score = current;
      const [tune] = abcjs.renderAbc(target, text, {
        staffwidth: Math.max(MIN_STAFF_WIDTH, width),
        paddingtop: 6,
        paddingbottom: 12,
        paddingleft: 0,
        paddingright: 0,
        wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
        add_classes: true,
      });
      geometry = geometryOf(tune, score, holder);
      drawnText = text;
      drawnWidth = width;
    } catch {
      clear();
      failed = true;
      say(t.staffFailed, "alert");
      return;
    }
    placeCursor(player.playing ? player.tick : hostTick());
  }

  function schedule(): void {
    if (destroyed || frame !== null) return;
    frame = win.requestAnimationFrame(draw);
  }

  draw();
  loadAbcjs().then(
    (loaded) => {
      abcjs = loaded;
      schedule();
    },
    () => {
      failed = true;
      schedule();
    },
  );
  const observer = new win.ResizeObserver(schedule);
  observer.observe(scroller);
  let heard = session.project.score;
  let heardReading = session.reading;
  const unsubscribe = session.subscribe(() => {
    if (session.project.score === heard && session.reading === heardReading && session.view.language === language)
      return;
    heard = session.project.score;
    heardReading = session.reading;
    schedule();
  });
  const unsubscribePlayer = player.subscribe(() => {
    placeCursor(player.playing ? player.tick : hostTick());
  });

  return {
    setPlayPosition(seconds) {
      if (destroyed) return;
      hostSeconds = seconds;
      if (player.playing) {
        placeCursor(player.tick);
        return;
      }
      placeCursor(hostTick());
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) win.cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
      unsubscribePlayer();
      abort.abort();
      hold.release();
      root.remove();
      releaseStyles();
    },
  };
}

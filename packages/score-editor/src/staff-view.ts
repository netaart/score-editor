// ABOUTME: The staff view part: the score drawn on a staff by abcjs, read-only, for those who check a score by reading it.
// ABOUTME: abcjs is loaded when the part is mounted, and draws inside a shadow root of its own, out of reach of the page's rules.
import { barIndexAt } from "./arrangement";
import { create, requireDom } from "./dom";
import { messagesFor, viewName } from "./i18n";
import { holdPreviewPlayer } from "./preview-player";
import type { Note, Score } from "./score";
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
  left: 0;
  top: 0;
  box-sizing: border-box;
  width: 7px;
  margin-left: -3px;
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--sce-_text) 20%, transparent) 0 2px,
    var(--sce-_bg) 2px 3px,
    var(--sce-_text) 3px 4px,
    var(--sce-_bg) 4px 5px,
    color-mix(in srgb, var(--sce-_text) 20%, transparent) 5px 7px
  );
  pointer-events: none;
}
@media (forced-colors: active) {
  /* Forced colours drop a background image, so the band is two 2 px borders and the ink a pseudo-element. */
  .sce-staff-cursor {
    background: Canvas;
    border-left: 2px solid Highlight;
    border-right: 2px solid Highlight;
  }
  .sce-staff-cursor::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 1px;
    width: 1px;
    background: CanvasText;
  }
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

/** A drawn onset inside a bar: its tick and the x abcjs drew it at. */
interface CursorAnchor {
  readonly tick: number;
  readonly x: number;
}

/** One bar as abcjs drew it: the model's ticks, the drawing's coordinates, and its drawn onsets. */
interface CursorBar {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly bottom: number;
  readonly systemTop: number;
  readonly system: number;
  readonly anchors: ReadonlyArray<CursorAnchor>;
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

/** One drawn note or rest, with the model event it draws and the x abcjs placed its left edge at. */
interface DrawnOnset {
  readonly bar: number;
  readonly tick: number;
  readonly duration: number;
  readonly rest: boolean;
  readonly x: number;
}

/**
 * Every note and rest drawn on one system, paired with its model event by the marks abcjs writes: `abcjs-v<n>` names
 * the voice, `abcjs-mm<n>` the bar in the score. The events of a voice are in time order, as its measures are.
 */
function drawnOnsetsOf(
  score: Score,
  allNotes: ReadonlyArray<SVGGraphicsElement>,
  lineClass: string,
  host: HTMLElement,
): DrawnOnset[] {
  const drawn: DrawnOnset[] = [];
  for (const [voiceIndex, voice] of score.voices.entries()) {
    const voiceClass = `abcjs-v${voiceIndex}`;
    const nodes = allNotes.filter((node) => node.classList.contains(lineClass) && node.classList.contains(voiceClass));
    const nodesByBar = new Map<number, SVGGraphicsElement[]>();
    for (const node of nodes) {
      const bar = Number(/abcjs-mm(\d+)/.exec(node.getAttribute("class") ?? "")?.[1]);
      if (!Number.isInteger(bar)) continue;
      const found = nodesByBar.get(bar);
      if (found) found.push(node);
      else nodesByBar.set(bar, [node]);
    }
    const modelByBar = new Map<number, Note[]>();
    for (const note of score.notes) {
      if (note.voice !== voice) continue;
      const found = modelByBar.get(note.bar);
      if (found) found.push(note);
      else modelByBar.set(note.bar, [note]);
    }
    for (const [bar, barNodes] of nodesByBar) {
      const model = (modelByBar.get(bar) ?? []).sort((a, b) => a.start - b.start);
      for (const [at, node] of barNodes.entries()) {
        const note = model[at];
        if (!note) continue;
        drawn.push({
          bar,
          tick: note.start,
          duration: note.duration,
          rest: note.midi === null,
          x: boxIn(host, node).left,
        });
      }
    }
  }
  return drawn;
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
 * The elements are picked by the marks abcjs writes on them (`abcjs-v<n>`, `abcjs-l<n>`, `abcjs-mm<n>`), so a later
 * voice or staff cannot be mistaken for the voice and line being walked. Every bar starts at the leftmost onset
 * drawn at its first tick (a note, or a rest shorter than the bar); with none, at the opening bar line, or after the
 * clef, key and meter on a system's first bar. Its last segment runs to the next bar's start on the same system, or to
 * its closing line on the last bar of a system. On a two-staff system the staff box is the span from the first staff's
 * top line to the last staff's bottom line.
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
    // The first system's top is the drawing's top, so going back to bar 1 scrolls all the way and shows its tempo.
    const tempoTops = [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-tempo")]
      .filter((node) => node.classList.contains(lineClass))
      .map((node) => boxIn(host, node).top);
    const systemTop = index === 0 ? 0 : Math.min(...tempoTops, top);
    const drawn = drawnOnsetsOf(score, allNotes, lineClass, host);
    const extras = [
      ...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-clef, .abcjs-key-signature, .abcjs-time-signature"),
    ]
      .filter((node) => node.classList.contains(lineClass))
      .map((node) => boxIn(host, node).right);
    const afterExtras = extras.length > 0 ? Math.max(...extras) + 2 : null;
    const children = voice.children ?? [];
    let startX: number | null = null;
    let hasContent = false;
    let firstOfSystem = true;
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
        // A whole-bar rest is drawn in the middle of the bar, not at its onset; any voice's onset can open a system.
        const starts = drawn
          .filter((onset) => onset.bar === index && onset.tick === model.start)
          .filter((onset) => !onset.rest || onset.duration < model.length)
          .map((onset) => onset.x);
        const x0 =
          starts.length > 0 ? Math.min(...starts) : firstOfSystem ? (afterExtras ?? startX ?? barX) : (startX ?? barX);
        // A tick with onsets in both voices has one x: the leftmost of them, as the bar's start does.
        const xAt = new Map<number, number>();
        for (const onset of drawn) {
          if (onset.bar !== index) continue;
          if (onset.rest && onset.duration >= model.length) continue;
          const known = xAt.get(onset.tick);
          if (known === undefined || onset.x < known) xAt.set(onset.tick, onset.x);
        }
        xAt.set(model.start, x0);
        xAt.set(model.start + model.length, barX);
        bars.push({
          index,
          start: model.start,
          end: model.start + model.length,
          x0,
          x1: barX,
          top,
          bottom,
          systemTop,
          system: line,
          anchors: [...xAt].map(([tick, x]) => ({ tick, x })).sort((a, b) => a.tick - b.tick),
        });
        // A bar on the same system runs its last segment to the next bar's start, not to the line between them.
        const previousBar = bars[bars.length - 2];
        if (previousBar && previousBar.system === line) {
          (previousBar.anchors as CursorAnchor[])[previousBar.anchors.length - 1] = {
            tick: previousBar.end,
            x: x0,
          };
        }
        firstOfSystem = false;
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
  /** The last bar the cursor stood in, so a seek can be told from the next frame of a preview. */
  let lastBar = -1;
  /** False while the reader has scrolled the cursor out of view: their scroll is left alone until it is back. */
  let following = true;
  /** Set around the part's own reveal, so its scroll event is not taken for the reader's. */
  let ownScroll = false;
  let ownTop = 0;
  let ownLeft = 0;
  /** The system the cursor's height was last set for, so an unchanged system writes no box properties. */
  let cursorTop = Number.NaN;
  let cursorBottom = Number.NaN;
  /** The drawing's offset in the region's scroll content, and the region's inner size, read once per drawing. */
  let holderLeft = 0;
  let holderTop = 0;
  let regionWidth = 0;
  let regionHeight = 0;

  function say(words: string, role: "status" | "alert"): void {
    message.textContent = words;
    message.setAttribute("role", role);
    message.hidden = false;
  }

  function hideCursor(): void {
    cursor.hidden = true;
    lastBar = -1;
    cursorTop = Number.NaN;
    cursorBottom = Number.NaN;
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

  /** Whether the whole cursor is inside the region's visible box. */
  function cursorInView(): boolean {
    if (cursor.hidden) return false;
    const line = cursor.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    return line.left >= view.left && line.right <= view.right && line.top >= view.top && line.bottom <= view.bottom;
  }

  /** Reads the drawing's place in the region's scroll content and the region's inner size, once per drawing. */
  function measureRegion(): void {
    const view = scroller.getBoundingClientRect();
    const base = holder.getBoundingClientRect();
    holderLeft = base.left - view.left + scroller.scrollLeft;
    holderTop = base.top - view.top + scroller.scrollTop;
    regionWidth = scroller.clientWidth;
    regionHeight = scroller.clientHeight;
  }

  /** Whether a cursor at `x` in `bar` is in the region, worked out from the cached layout rather than measured. */
  function visibleAt(x: number, bar: CursorBar): boolean {
    const left = holderLeft + x;
    const top = holderTop + bar.top - 2;
    const height = bar.bottom - bar.top + 4;
    const scrollLeft = scroller.scrollLeft;
    const scrollTop = scroller.scrollTop;
    return (
      left >= scrollLeft &&
      left + 7 <= scrollLeft + regionWidth &&
      top >= scrollTop &&
      top + height <= scrollTop + regionHeight
    );
  }

  /** Scrolls the region as the part's own move, so the scroll event it causes does not count as the reader's. */
  function scrollTo(top: number, left: number): void {
    const nextTop = Math.max(0, top);
    const nextLeft = Math.max(0, left);
    if (Math.abs(nextTop - scroller.scrollTop) < 0.5 && Math.abs(nextLeft - scroller.scrollLeft) < 0.5) return;
    ownScroll = true;
    ownTop = nextTop;
    ownLeft = nextLeft;
    scroller.scrollTop = nextTop;
    scroller.scrollLeft = nextLeft;
    win.requestAnimationFrame(() => {
      ownScroll = false;
    });
  }

  /**
   * Brings a cursor that has gone out of the region back into it. Vertically it brings the top of the cursor's
   * system, not the cursor, to the margin: the system's tempo and part names are what a reader needs with it.
   */
  function reveal(bar: CursorBar): void {
    if (cursor.hidden) return;
    const line = cursor.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const sideways = line.left < view.left || line.right > view.right;
    const vertical = line.top < view.top || line.bottom > view.bottom;
    if (!sideways && !vertical) return;
    const left = sideways ? scroller.scrollLeft + line.left - view.left - REVEAL_MARGIN : scroller.scrollLeft;
    let top = scroller.scrollTop;
    if (vertical) {
      const holderInView = holder.getBoundingClientRect().top - view.top;
      top = scroller.scrollTop + holderInView + bar.systemTop - REVEAL_MARGIN;
    }
    scrollTo(top, left);
  }

  /** The x of `tick` in `bar`, linear between the drawn onsets around it rather than across the whole bar. */
  function xAtTick(bar: CursorBar, tick: number): number {
    const anchors = bar.anchors;
    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    if (!first || !last) return bar.x0;
    if (tick <= first.tick) return first.x;
    if (tick >= last.tick) return last.x;
    for (let at = 1; at < anchors.length; at += 1) {
      const before = anchors[at - 1];
      const after = anchors[at];
      if (!before || !after || tick > after.tick) continue;
      const span = after.tick - before.tick;
      const fraction = span > 0 ? (tick - before.tick) / span : 0;
      return before.x + fraction * (after.x - before.x);
    }
    return last.x;
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
    const jump = lastBar < 0 || bar.index < lastBar || bar.index - lastBar > 1;
    const x = xAtTick(bar, tick);
    cursor.hidden = false;
    if (bar.top !== cursorTop || bar.bottom !== cursorBottom) {
      cursor.style.top = `${bar.top - 2}px`;
      cursor.style.height = `${bar.bottom - bar.top + 4}px`;
      cursorTop = bar.top;
      cursorBottom = bar.bottom;
    }
    cursor.style.transform = `translate(${x}px, 0)`;
    const visible = visibleAt(x, bar);
    if (following) {
      if (!visible) reveal(bar);
    } else if (visible) following = true;
    else if (jump) {
      // A seek or a press on a note is not the next frame of a preview: it brings the cursor back at once.
      reveal(bar);
      following = true;
    }
    lastBar = bar.index;
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
  scroller.addEventListener(
    "scroll",
    () => {
      if (destroyed) return;
      const own = ownScroll && Math.abs(scroller.scrollTop - ownTop) < 1 && Math.abs(scroller.scrollLeft - ownLeft) < 1;
      if (own || cursor.hidden) return;
      following = cursorInView();
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
    measureRegion();
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

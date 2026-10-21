// ABOUTME: The mounted editor: reads the song project's score with its dialect and builds the read-only arrangement view.
// ABOUTME: Every listener is registered with one AbortSignal, so destroy() removes them all and leaves no node behind.
import {
  barLabelStep,
  cutOf,
  type GridRun,
  gridRunsOf,
  gridTicks,
  labelRank,
  lengthInBeats,
  MIN_BAR_LINE_PIXELS,
  MIN_BEAT_LINE_PIXELS,
  marksOf,
  notesByVoice,
  pitchName,
  pitchRangeOf,
  positionOf,
  stepZoom,
  tieJoins,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_PRESETS,
} from "./arrangement";
import type { Diagnostic } from "./diagnostics";
import { formatDiagnostic } from "./diagnostics";
import { messagesFor } from "./i18n";
import { type Note, type Score, TICKS_PER_QUARTER } from "./score";
import { acquireStyles } from "./styles";
import type { MountedEditor, MountOptions } from "./types";

let instanceCount = 0;

function create<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  parent?: Element,
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  el.className = className;
  parent?.appendChild(el);
  return el;
}

/** What reading the project's score came to: a score to show, or the reason there is none. */
type Reading =
  | { kind: "score"; score: Score }
  | { kind: "unreadable"; diagnostics: ReadonlyArray<Diagnostic> }
  | { kind: "no-dialect"; modelId: string };

/** The most diagnostics listed; a score that fails everywhere should not fill the screen with it. */
const MAX_LISTED_DIAGNOSTICS = 20;

/** The first voice's lane, which the first scroll opens on the middle of. */
interface FirstLane {
  lane: HTMLElement;
  head: HTMLElement;
  hi: number;
  rows: number;
  middle: number;
}

/** The parts of a built arrangement that zooming and the first scroll need to find again. */
interface Grid {
  element: HTMLElement;
  run: GridRun;
}

interface View {
  scroller: HTMLElement;
  /** Holds the pitch column and the time axis. */
  canvas: HTMLElement;
  /** The elements that each carry the time axis: the timeline rows and the lanes. */
  axes: HTMLElement[];
  /** The grid lines of every lane, one element for each stretch of bars in one meter. */
  grids: Grid[];
  /** The pinned header block. */
  top: HTMLElement;
  /** The pinned corner of the ruler: its width is the pitch column's. */
  corner: HTMLElement;
  /** The ruler's timeline: as wide as the whole score. */
  timeline: HTMLElement;
  ticks: number;
  barCount: number;
  first: FirstLane | null;
}

export class Editor implements MountedEditor {
  private options: MountOptions;
  private readonly doc: Document;
  private readonly root: HTMLElement;
  private readonly releaseStyles: () => void;
  private readonly abort = new AbortController();
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly body: HTMLElement;
  private readonly zoomGroup: HTMLElement;
  private readonly zoomOut: HTMLButtonElement;
  private readonly zoomIn: HTMLButtonElement;
  private readonly zoomButton: HTMLButtonElement;
  private readonly zoomLabel: HTMLElement;
  private readonly zoomValue: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly menuItems = new Map<number, HTMLButtonElement>();
  private readonly fitItem: HTMLButtonElement;
  private zoom = 1;
  private axes: HTMLElement[] = [];
  private grids: Grid[] = [];
  private reading: Reading;
  private view: View | null = null;
  private destroyed = false;

  constructor(
    host: HTMLElement,
    options: MountOptions,
    private readonly onDestroy: () => void,
  ) {
    this.options = { ...options };
    this.doc = host.ownerDocument;
    const doc = this.doc;
    const signal = this.abort.signal;
    const n = ++instanceCount;

    this.releaseStyles = acquireStyles(host);
    this.root = create(doc, "div", "sce-root");

    const toolbar = create(doc, "div", "sce-toolbar", this.root);
    this.title = create(doc, "span", "sce-title", toolbar);
    this.zoomGroup = create(doc, "div", "sce-zoom", toolbar);
    this.zoomGroup.setAttribute("role", "group");
    this.zoomOut = this.stepButton("out");
    this.zoomButton = create(doc, "button", "sce-button sce-zoom-value", this.zoomGroup);
    this.zoomButton.type = "button";
    this.zoomButton.setAttribute("aria-haspopup", "menu");
    this.zoomButton.setAttribute("aria-expanded", "false");
    this.zoomLabel = create(doc, "span", "sce-sr-only", this.zoomButton);
    this.zoomValue = create(doc, "span", "sce-button-value", this.zoomButton);
    this.zoomIn = this.stepButton("in");
    create(doc, "span", "sce-spacer", toolbar);
    this.badge = create(doc, "span", "sce-badge", toolbar);

    this.notice = create(doc, "div", "sce-notice", this.root);
    this.notice.setAttribute("role", "note");
    this.hint = create(doc, "div", "sce-sr-only", this.root);
    this.hint.id = `sce-hint-${n}`;
    this.body = create(doc, "div", "sce-body", this.root);

    this.menu = create(doc, "div", "sce-popover", this.root);
    this.menu.setAttribute("popover", "auto");
    this.menu.setAttribute("role", "menu");
    for (const preset of ZOOM_PRESETS) {
      const item = this.menuItem("menuitemradio");
      item.addEventListener("click", () => this.chooseZoom(preset), { signal });
      this.menuItems.set(preset, item);
    }
    create(doc, "div", "sce-menu-rule", this.menu).setAttribute("role", "separator");
    this.fitItem = this.menuItem("menuitem");
    this.fitItem.addEventListener("click", () => this.chooseFit(), { signal });
    this.zoomButton.popoverTargetElement = this.menu;
    this.zoomButton.popoverTargetAction = "toggle";
    this.menu.addEventListener("beforetoggle", (event) => this.placeMenu(event as ToggleEvent), { signal });
    this.menu.addEventListener("toggle", (event) => this.menuToggled(event as ToggleEvent), { signal });

    this.zoomOut.addEventListener("click", () => this.step("out"), { signal });
    this.zoomIn.addEventListener("click", () => this.step("in"), { signal });
    this.root.addEventListener("keydown", this.onKeyDown, { signal });
    this.body.addEventListener("wheel", this.onWheel, { signal, passive: false });

    this.reading = this.read();
    this.applyLanguage();
    this.applyEditable();
    this.render();
    host.appendChild(this.root);
    this.afterRender();
  }

  update(patch: Partial<MountOptions>): void {
    if (this.destroyed) return;
    const before = this.options;
    this.options = { ...before, ...patch };
    if (this.options.language !== before.language) this.applyLanguage();
    if (this.options.editable !== before.editable) this.applyEditable();
    const sameScore =
      this.options.project.modelId === before.project.modelId &&
      this.options.project.score === before.project.score &&
      this.options.dialects === before.dialects;
    if (sameScore && this.options.language === before.language) return;
    const kept = sameScore ? this.view?.scroller : null;
    const offset = kept ? { left: kept.scrollLeft, top: kept.scrollTop } : null;
    if (!sameScore) this.reading = this.read();
    this.render();
    this.afterRender();
    if (offset && this.view) this.view.scroller.scrollTo(offset.left, offset.top);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    this.root.remove();
    this.releaseStyles();
    this.onDestroy();
  }

  private get editable(): boolean {
    return this.options.editable !== false;
  }

  private stepButton(direction: "in" | "out"): HTMLButtonElement {
    const button = create(this.doc, "button", "sce-button sce-step", this.zoomGroup);
    button.type = "button";
    button.dataset.step = direction;
    return button;
  }

  private menuItem(role: "menuitem" | "menuitemradio"): HTMLButtonElement {
    const item = create(this.doc, "button", "sce-menu-item", this.menu);
    item.type = "button";
    item.setAttribute("role", role);
    return item;
  }

  // --- texts and flags ---------------------------------------------------------------------------

  private applyLanguage(): void {
    const t = messagesFor(this.options.language);
    this.root.lang = this.options.language;
    this.title.textContent = t.title;
    this.hint.textContent = t.hint;
    this.badge.textContent = t.readOnly;
    this.zoomGroup.setAttribute("aria-label", t.zoom);
    this.zoomOut.setAttribute("aria-label", t.zoomOut);
    this.zoomIn.setAttribute("aria-label", t.zoomIn);
    this.zoomLabel.textContent = t.zoom;
    this.menu.setAttribute("aria-label", t.zoom);
    for (const [preset, item] of this.menuItems) item.textContent = `${Math.round(preset * 100)}%`;
    this.fitItem.textContent = t.zoomFit;
  }

  private applyEditable(): void {
    this.root.toggleAttribute("data-readonly", !this.editable);
    this.badge.hidden = this.editable;
  }

  // --- building the view -------------------------------------------------------------------------

  private read(): Reading {
    const { project, dialects } = this.options;
    const dialect = dialects.find(project.modelId);
    if (!dialect) return { kind: "no-dialect", modelId: project.modelId };
    const { score, diagnostics } = dialect.parse(project.score);
    return score ? { kind: "score", score } : { kind: "unreadable", diagnostics };
  }

  private render(): void {
    const reading = this.reading;
    const score = reading.kind === "score" ? reading.score : null;
    this.body.replaceChildren();
    this.view = null;
    const cut = score ? cutOf(score) : null;
    this.notice.hidden = !cut;
    this.notice.textContent = cut ? messagesFor(this.options.language).cutNotice(cut) : "";
    if (reading.kind === "score") this.body.appendChild(this.buildArrangement(reading.score));
    else this.body.appendChild(this.buildProblem(reading));
  }

  /** Instead of the arrangement: why there is none, in the interface language. */
  private buildProblem(reading: Exclude<Reading, { kind: "score" }>): HTMLElement {
    const t = messagesFor(this.options.language);
    const panel = create(this.doc, "div", "sce-problem");
    panel.setAttribute("role", "alert");
    if (reading.kind === "no-dialect") {
      create(this.doc, "p", "sce-problem-title", panel).textContent = t.noDialect(reading.modelId);
      return panel;
    }
    create(this.doc, "p", "sce-problem-title", panel).textContent = t.unreadable;
    const list = create(this.doc, "ul", "sce-problem-list", panel);
    for (const diagnostic of reading.diagnostics.slice(0, MAX_LISTED_DIAGNOSTICS)) {
      create(this.doc, "li", "sce-problem-item", list).textContent = formatDiagnostic(
        diagnostic,
        this.options.language,
      );
    }
    const more = reading.diagnostics.length - MAX_LISTED_DIAGNOSTICS;
    if (more > 0) create(this.doc, "p", "sce-problem-more", panel).textContent = t.moreProblems(more);
    return panel;
  }

  /** What needs the built view to be in the page: the zoom variable and bar numbers, then the first scroll. */
  private afterRender(): void {
    this.applyZoom();
    const view = this.view;
    const first = view?.first;
    if (!view || !first || view.scroller.scrollHeight <= view.scroller.clientHeight) return;
    const { scroller } = view;
    const lane = first.lane.getBoundingClientRect();
    const frame = scroller.getBoundingClientRect();
    const rowPixels = lane.height / first.rows;
    const middle = lane.top - frame.top + scroller.scrollTop + (first.hi - 1 - first.middle + 0.5) * rowPixels;
    const pinned = view.top.offsetHeight + first.head.offsetHeight;
    scroller.scrollTop = Math.max(0, middle - pinned - (scroller.clientHeight - pinned) / 2);
  }

  private buildArrangement(score: Score): HTMLElement {
    const doc = this.doc;
    const t = messagesFor(this.options.language);
    const scroller = create(doc, "div", "sce-scroller");
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", t.title);
    scroller.setAttribute("aria-describedby", this.hint.id);

    const ticks = gridTicks(score);
    this.axes = [];
    this.grids = [];
    const canvas = create(doc, "div", "sce-canvas", scroller);
    canvas.style.setProperty("--sce-ticks", String(ticks));

    const top = create(doc, "div", "sce-top", canvas);
    const ruler = this.buildRuler(top, score);
    this.buildSections(top, score);
    this.buildMarks(top, score);
    this.buildChords(top, score);

    const notes = notesByVoice(score);
    let first: FirstLane | null = null;
    for (const voice of score.voices) {
      const built = this.buildTrack(canvas, score, voice, notes.get(voice) ?? []);
      first ??= built;
    }
    this.view = {
      scroller,
      canvas,
      axes: this.axes,
      grids: this.grids,
      top,
      corner: ruler.corner,
      timeline: ruler.timeline,
      ticks,
      barCount: score.bars.length,
      first,
    };
    return scroller;
  }

  /** A row of the pinned header: the pinned corner and the timeline that carries the row's items. */
  private headerRow(
    top: HTMLElement,
    className: string,
    label: string,
  ): { corner: HTMLElement; timeline: HTMLElement } {
    const row = create(this.doc, "div", `sce-row ${className}`, top);
    const corner = create(this.doc, "div", "sce-corner", row);
    const timeline = create(this.doc, "div", "sce-timeline", row);
    this.axes.push(timeline);
    timeline.setAttribute("role", "list");
    timeline.setAttribute("aria-label", label);
    return { corner, timeline };
  }

  private buildRuler(top: HTMLElement, score: Score): { corner: HTMLElement; timeline: HTMLElement } {
    const row = this.headerRow(top, "sce-ruler", messagesFor(this.options.language).bars);
    const numbers = this.doc.createDocumentFragment();
    for (const bar of score.bars) {
      const label = create(this.doc, "span", "sce-bar-number");
      label.setAttribute("role", "listitem");
      label.dataset.rank = String(labelRank(bar.index));
      label.style.setProperty("--t", String(bar.start));
      label.textContent = String(bar.index + 1);
      numbers.appendChild(label);
    }
    row.timeline.appendChild(numbers);
    return row;
  }

  /** One band per section that has bars; a marker with no bars after it has nothing to cover. */
  private buildSections(top: HTMLElement, score: Score): void {
    const t = messagesFor(this.options.language);
    const { timeline } = this.headerRow(top, "sce-sections", t.sections);
    for (const section of score.sections) {
      const first = score.bars[section.firstBar];
      const last = score.bars[section.firstBar + section.barCount - 1];
      if (section.barCount < 1 || !first || !last) continue;
      const band = create(this.doc, "div", "sce-section", timeline);
      band.setAttribute("role", "listitem");
      band.style.cssText = `--t:${first.start};--d:${last.start + last.length - first.start}`;
      create(this.doc, "span", "sce-section-name", band).textContent = section.name ?? t.unnamedSection;
    }
  }

  /** The chord track: each chord's name at its position, or one line saying the score has none. */
  private buildChords(top: HTMLElement, score: Score): void {
    const t = messagesFor(this.options.language);
    const { corner, timeline } = this.headerRow(top, "sce-chords", t.chords);
    corner.textContent = t.chords;
    if (score.chords.length === 0) {
      timeline.removeAttribute("role");
      timeline.removeAttribute("aria-label");
      create(this.doc, "span", "sce-empty", timeline).textContent = t.noChords;
      return;
    }
    const end = gridTicks(score);
    const chords = this.doc.createDocumentFragment();
    score.chords.forEach((chord, index) => {
      const next = score.chords[index + 1]?.start ?? end;
      const item = create(this.doc, "div", "sce-chord");
      item.setAttribute("role", "listitem");
      item.style.cssText = `--t:${chord.start};--w:${next - chord.start}`;
      item.textContent = chord.name;
      chords.appendChild(item);
    });
    timeline.appendChild(chords);
  }

  /** The key and meter flags: what is in force at the start, then each change at the position it takes effect. */
  private buildMarks(top: HTMLElement, score: Score): void {
    const t = messagesFor(this.options.language);
    const { timeline } = this.headerRow(top, "sce-marks", t.marks);
    const end = gridTicks(score);
    const marks = marksOf(score);
    const flags = this.doc.createDocumentFragment();
    marks.forEach((mark, index) => {
      const next = marks[index + 1]?.at ?? end;
      const flag = create(this.doc, "div", "sce-mark");
      flag.setAttribute("role", "listitem");
      flag.style.cssText = `--t:${mark.at};--w:${Math.max(0, next - mark.at)}`;
      const items = create(this.doc, "div", "sce-mark-items", flag);
      const names: string[] = [];
      if (mark.meter) {
        create(this.doc, "span", "sce-mark-item", items).textContent = t.meterText(mark.meter);
        names.push(t.meterName(mark.meter));
      }
      if (mark.key) {
        create(this.doc, "span", "sce-mark-item", items).textContent = t.keyText(mark.key);
        names.push(t.keyText(mark.key));
      }
      if (mark.cut) {
        const text = mark.cut.short ? t.incompleteBar : t.cutOff;
        create(this.doc, "span", "sce-mark-item", items).textContent = text;
        names.push(text);
        if (!mark.cut.short) flag.dataset.edge = "end";
      }
      flag.setAttribute("aria-label", names.join(", "));
      flags.appendChild(flag);
    });
    timeline.appendChild(flags);
  }

  /** One piano-roll track: its head, the pitch column and the lane with a block for every pitched note. */
  private buildTrack(canvas: HTMLElement, score: Score, voice: string, notes: ReadonlyArray<Note>): FirstLane {
    const doc = this.doc;
    const t = messagesFor(this.options.language);
    const range = pitchRangeOf(notes);
    const group = create(doc, "div", "sce-track-group", canvas);
    const head = create(doc, "div", "sce-track-head", group);
    create(doc, "span", "sce-track-name", head).textContent = voice;
    const track = create(doc, "div", "sce-track", group);
    const keys = create(doc, "div", "sce-keys", track);
    for (let octave = range.hi - 12; octave >= range.lo; octave -= 12) {
      create(doc, "div", "sce-octave", keys).textContent = pitchName(octave);
    }
    const lane = create(doc, "div", "sce-lane", track);
    this.axes.push(lane);
    for (const run of gridRunsOf(score)) {
      const element = create(doc, "div", "sce-grid", lane);
      element.setAttribute("aria-hidden", "true");
      element.style.cssText = `--t:${run.start};--d:${run.end - run.start}`;
      this.grids.push({ element, run });
    }
    lane.style.setProperty("--sce-rows", String(range.hi - range.lo));
    const cut = cutOf(score);
    if (cut && cut.voice === voice && gridTicks(score) > cut.missingFrom) {
      const tail = create(doc, "div", "sce-cut", lane);
      tail.setAttribute("aria-hidden", "true");
      tail.style.cssText = `--t:${cut.missingFrom};--d:${gridTicks(score) - cut.missingFrom}`;
    }
    const list = create(doc, "div", "sce-notes", lane);
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", voice);

    const joins = tieJoins(notes);
    const blocks = doc.createDocumentFragment();
    let lowest = 127;
    let highest = 0;
    for (const [index, note] of notes.entries()) {
      if (note.midi === null) continue;
      lowest = Math.min(lowest, note.midi);
      highest = Math.max(highest, note.midi);
      const block = create(doc, "div", "sce-note");
      block.setAttribute("role", "listitem");
      block.style.cssText = `--t:${note.start};--d:${note.duration};--r:${range.hi - 1 - note.midi}`;
      const tiedToNext = joins.has(note.id);
      if (tiedToNext) block.dataset.tieNext = "";
      if (index > 0 && joins.has(notes[index - 1]?.id ?? "")) block.dataset.tiePrev = "";
      const position = positionOf(score.bars, note.bar, note.start);
      block.setAttribute(
        "aria-label",
        t.noteLabel(pitchName(note.midi), position, lengthInBeats(note.duration, position.beatTicks), tiedToNext),
      );
      blocks.appendChild(block);
    }
    list.appendChild(blocks);
    const middle = highest >= lowest ? (lowest + highest) / 2 : (range.lo + range.hi) / 2;
    return { lane, head, hi: range.hi, rows: range.hi - range.lo, middle };
  }

  // --- zoom --------------------------------------------------------------------------------------

  /**
   * Sets the width of the time axis, the readout, the menu, the grid and the bar numbers that still have room.
   * `timelineWidth` is the width of the time axis at this zoom, when the caller knows it; reading it back would
   * lay the page out again.
   */
  private applyZoom(timelineWidth?: number): void {
    const view = this.view;
    if (view) this.widen(view);
    const width = timelineWidth ?? view?.timeline.offsetWidth ?? 0;
    this.zoomValue.textContent = `${Math.round(this.zoom * 100)}%`;
    for (const [preset, item] of this.menuItems) {
      item.setAttribute("aria-checked", String(Math.abs(preset - this.zoom) < 1e-6));
    }
    this.zoomOut.setAttribute("aria-disabled", String(stepZoom(this.zoom, "out") === null));
    this.zoomIn.setAttribute("aria-disabled", String(stepZoom(this.zoom, "in") === null));
    this.zoomGroup.hidden = !view;
    if (view && view.barCount > 0 && width > 0) {
      this.root.dataset.labelStep = String(barLabelStep(width / view.barCount));
    } else {
      delete this.root.dataset.labelStep;
    }
    if (view && view.ticks > 0) this.drawGrid(view, width / view.ticks);
  }

  /** Sets the width of the elements that carry the time axis to the score's length at the current zoom. */
  private widen({ canvas, axes }: View): void {
    const span = `var(--sce-ticks) * var(--sce-_beat) * ${this.zoom} / ${TICKS_PER_QUARTER}`;
    canvas.style.width = `calc(var(--sce-_keys) + ${span})`;
    for (const axis of axes) axis.style.width = `calc(${span})`;
  }

  /**
   * Draws the bar and beat lines: a strong line at every bar start and a light one at every beat of the bar's meter,
   * from the position the stretch of bars starts at. They are gradients, so they cost no nodes per line.
   */
  private drawGrid({ grids }: View, pixelsPerTick: number): void {
    for (const { element, run } of grids) {
      const line = (color: string, ticks: number) => {
        const period = `calc(var(--sce-_beat) * ${(this.zoom * ticks) / TICKS_PER_QUARTER})`;
        return `repeating-linear-gradient(to right, ${color} 0 1px, transparent 1px ${period})`;
      };
      const layers: string[] = [];
      if (run.barTicks * pixelsPerTick >= MIN_BAR_LINE_PIXELS)
        layers.push(line("var(--sce-_line-strong)", run.barTicks));
      if (run.beatTicks * pixelsPerTick >= MIN_BEAT_LINE_PIXELS) layers.push(line("var(--sce-_line)", run.beatTicks));
      element.style.backgroundImage = layers.join(", ");
    }
  }

  /**
   * Changes the zoom and keeps the instant under `anchorClientX` where it was on screen; without an anchor,
   * the middle of what the roll shows. Layout is read once, before the change.
   */
  private setZoom(next: number, anchorClientX?: number): void {
    const view = this.view;
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    if (!view || Math.abs(zoom - this.zoom) < 1e-9) return;
    const { scroller } = view;
    const frame = scroller.getBoundingClientRect();
    const scale = frame.width / scroller.offsetWidth || 1;
    const keys = view.corner.offsetWidth;
    const anchor =
      anchorClientX === undefined ? keys + (scroller.clientWidth - keys) / 2 : (anchorClientX - frame.left) / scale;
    const width = view.timeline.offsetWidth;
    const pixelsPerTick = view.ticks > 0 ? width / view.ticks : 0;
    const tick = pixelsPerTick > 0 ? (scroller.scrollLeft + anchor - keys) / pixelsPerTick : 0;
    const before = this.zoom;
    this.zoom = zoom;
    this.applyZoom((width * zoom) / before);
    scroller.scrollLeft = tick * pixelsPerTick * (zoom / before) + keys - anchor;
  }

  private step(direction: "in" | "out"): void {
    const next = stepZoom(this.zoom, direction);
    if (next !== null) this.setZoom(next);
  }

  private chooseZoom(preset: number): void {
    this.menu.hidePopover();
    this.setZoom(preset);
  }

  /** The zoom at which the whole score is exactly as wide as the roll shows. */
  private chooseFit(): void {
    this.menu.hidePopover();
    const view = this.view;
    if (!view || view.ticks <= 0) return;
    const { scroller } = view;
    const wholeScore = view.timeline.offsetWidth / this.zoom;
    this.setZoom(Math.floor(((scroller.clientWidth - view.corner.offsetWidth) / wholeScore) * 1000) / 1000);
    scroller.scrollLeft = 0;
  }

  private readonly onWheel = (event: WheelEvent): void => {
    const view = this.view;
    if (!event.ctrlKey || !view || !(event.target instanceof Element) || !view.scroller.contains(event.target)) return;
    // A trackpad pinch arrives as a control-wheel too. Without this the page itself would zoom.
    event.preventDefault();
    const lines = event.deltaMode === 1 ? 16 : 1;
    const delta = Math.max(-100, Math.min(100, event.deltaY * lines));
    this.setZoom(this.zoom * Math.exp(-delta * 0.0025), event.clientX);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof Element && event.target.closest(".sce-menu-item")) {
      this.walkMenu(event);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      this.step("in");
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      this.step("out");
    }
  };

  // --- the zoom popover --------------------------------------------------------------------------

  /** Arrow, Home and End keys move between the items of the open menu, as a menu is expected to behave. */
  private walkMenu(event: KeyboardEvent): void {
    const items = [...this.menuItems.values(), this.fitItem];
    const at = event.target instanceof HTMLButtonElement ? items.indexOf(event.target) : -1;
    let next = -1;
    if (event.key === "ArrowDown") next = (at + 1) % items.length;
    else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  }

  /** Puts the menu under its button. A popover lives in the top layer, so its position is viewport based. */
  private placeMenu(event: ToggleEvent): void {
    if (event.newState !== "open") return;
    const rect = this.zoomButton.getBoundingClientRect();
    this.menu.style.left = `${rect.left}px`;
    this.menu.style.top = `${rect.bottom + 4}px`;
  }

  private menuToggled(event: ToggleEvent): void {
    const open = event.newState === "open";
    this.zoomButton.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const view = this.doc.defaultView;
    if (view) {
      const rect = this.menu.getBoundingClientRect();
      const overflow = rect.right - (view.innerWidth - 8);
      if (overflow > 0) this.menu.style.left = `${Math.max(8, rect.left - overflow)}px`;
    }
    const checked = [...this.menuItems.values()].find((item) => item.getAttribute("aria-checked") === "true");
    (checked ?? this.fitItem).focus();
  }
}

// ABOUTME: The mounted editor: builds the piano-roll DOM, owns its state and handles pointer, keyboard and popover events.
// ABOUTME: Every listener is registered with one AbortSignal, so destroy() removes them all and leaves no node behind.
import { type MoveBounds, moveNote, resolveMove } from "./commands";
import { messagesFor } from "./i18n";
import {
  DEFAULT_GRID,
  GRID_CHOICES,
  type GridChoice,
  type Note,
  noteId,
  notesFromScore,
  type PitchRange,
  pitchName,
  pitchRangeOf,
  TICKS_PER_BAR,
  voicesOf,
} from "./model";
import { acquireStyles } from "./styles";
import type { MountedEditor, MountOptions, NoticeCode } from "./types";

interface Lane {
  voice: string;
  range: PitchRange;
  rows: number;
  el: HTMLElement;
  /** The sticky pitch column and track head, which cover the edges of the scroller. */
  keys: HTMLElement;
  head: HTMLElement;
}

/** Where a dragged pointer is "at the edge": the part of the scroller not covered by sticky parts, in screen pixels. */
interface View {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Pixels the roll scrolls per frame at full speed while a dragged note is held at its edge. */
const EDGE_SPEED = 18;

/** The state of one drag gesture. Distances are in screen pixels unless named css*. */
interface Drag {
  noteId: string;
  el: HTMLElement;
  lane: Lane;
  pointerId: number;
  /** A finger or pen: needs a larger drag threshold and a readout held clear of the hand. */
  touch: boolean;
  threshold: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  /** The latest pointer position, so the edge scroll can recompute the target without a pointer event. */
  x: number;
  y: number;
  view: View;
  /** Width of the band along the scroller's edges in which holding the pointer scrolls. */
  zone: number;
  raf: number;
  /** Screen pixels per CSS pixel: 1 unless the host scales the editor. */
  scale: number;
  pxPerTick: number;
  rowPx: number;
  cssPerTick: number;
  cssRow: number;
  rootRect: DOMRect;
  readoutWidth: number;
  moved: boolean;
  dTicks: number;
  dMidi: number;
  abort: AbortController;
}

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

export class Editor implements MountedEditor {
  private options: MountOptions;
  private readonly doc: Document;
  private readonly root: HTMLElement;
  private readonly releaseStyles: () => void;
  private readonly abort = new AbortController();
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly gridLabel: HTMLElement;
  private readonly gridValue: HTMLElement;
  private readonly gridButton: HTMLButtonElement;
  private readonly menu: HTMLElement;
  private readonly menuItems = new Map<GridChoice["id"], HTMLButtonElement>();
  private readonly scroller: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly live: HTMLElement;

  private canvas: HTMLElement | null = null;
  private ruler: HTMLElement | null = null;
  private notes: Note[] = [];
  private bars = 0;
  private lanes = new Map<string, Lane>();
  private noteEls = new Map<string, HTMLElement>();
  private selectedId: string | null = null;
  private tabStop: HTMLElement | null = null;
  private grid: GridChoice = DEFAULT_GRID;
  private drag: Drag | null = null;
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
    this.gridButton = create(doc, "button", "sce-button", toolbar);
    this.gridButton.type = "button";
    this.gridButton.setAttribute("aria-haspopup", "menu");
    this.gridButton.setAttribute("aria-expanded", "false");
    this.gridLabel = create(doc, "span", "sce-button-label", this.gridButton);
    this.gridValue = create(doc, "span", "sce-button-value", this.gridButton);
    create(doc, "span", "sce-spacer", toolbar);
    this.badge = create(doc, "span", "sce-badge", toolbar);

    this.hint = create(doc, "div", "sce-sr-only", this.root);
    this.hint.id = `sce-hint-${n}`;
    const body = create(doc, "div", "sce-body", this.root);
    this.scroller = create(doc, "div", "sce-scroller", body);
    this.scroller.tabIndex = 0;
    this.scroller.setAttribute("role", "region");
    this.scroller.setAttribute("aria-describedby", this.hint.id);

    this.live = create(doc, "div", "sce-sr-only", this.root);
    this.live.setAttribute("role", "status");
    this.readout = create(doc, "div", "sce-readout", this.root);
    this.readout.hidden = true;
    this.readout.setAttribute("aria-hidden", "true");

    this.menu = create(doc, "div", "sce-popover", this.root);
    this.menu.setAttribute("popover", "auto");
    this.menu.setAttribute("role", "menu");
    for (const choice of GRID_CHOICES) {
      const item = create(doc, "button", "sce-menu-item", this.menu);
      item.type = "button";
      item.setAttribute("role", "menuitemradio");
      item.addEventListener("click", () => this.chooseGrid(choice), { signal });
      this.menuItems.set(choice.id, item);
    }
    this.gridButton.popoverTargetElement = this.menu;
    this.gridButton.popoverTargetAction = "toggle";
    this.menu.addEventListener("beforetoggle", (event) => this.placeMenu(event as ToggleEvent), { signal });
    this.menu.addEventListener("toggle", (event) => this.menuToggled(event as ToggleEvent), { signal });

    this.root.addEventListener("pointerdown", this.onPointerDown, { signal });
    this.root.addEventListener("click", this.onClick, { signal });
    this.root.addEventListener("keydown", this.onKeyDown, { signal });

    this.applyLanguage();
    this.applyEditable();
    this.applyGrid();
    this.loadScore();
    host.appendChild(this.root);
    this.centerOnFirstLane();
  }

  update(patch: Partial<MountOptions>): void {
    if (this.destroyed) return;
    const before = this.options;
    this.options = { ...before, ...patch };
    if (this.options.language !== before.language) this.applyLanguage();
    if (this.options.editable !== before.editable) this.applyEditable();
    if (this.options.spikeScore !== before.spikeScore) {
      this.loadScore();
      this.centerOnFirstLane();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.finishDrag(false);
    this.abort.abort();
    this.root.remove();
    this.releaseStyles();
    this.onDestroy();
  }

  private get editable(): boolean {
    return this.options.editable !== false;
  }

  private notify(code: NoticeCode, level: "info" | "warning" | "error", message: string): void {
    this.options.notify?.({ code, level, message });
  }

  // --- texts and flags ---------------------------------------------------------------------------

  private applyLanguage(): void {
    const t = messagesFor(this.options.language);
    this.root.lang = this.options.language;
    this.title.textContent = t.title;
    this.hint.textContent = t.hint;
    this.scroller.setAttribute("aria-label", t.title);
    this.gridLabel.textContent = t.grid;
    this.menu.setAttribute("aria-label", t.grid);
    for (const [id, item] of this.menuItems) item.textContent = t.gridChoices[id];
    this.badge.textContent = t.readOnly;
    for (const [id, el] of this.noteEls) {
      const note = this.notes.find((candidate) => candidate.id === id);
      if (note) el.setAttribute("aria-label", t.noteLabel(note));
    }
  }

  private applyEditable(): void {
    this.root.toggleAttribute("data-readonly", !this.editable);
    this.badge.hidden = this.editable;
    this.gridButton.hidden = !this.editable;
    if (!this.editable && this.menu.matches(":popover-open")) this.menu.hidePopover();
  }

  private applyGrid(): void {
    this.gridValue.textContent = this.grid.id;
    this.root.style.setProperty("--sce-grid-div", String(this.grid.perBeat));
    for (const [id, item] of this.menuItems) item.setAttribute("aria-checked", String(id === this.grid.id));
  }

  // --- building the roll -------------------------------------------------------------------------

  private loadScore(): void {
    this.finishDrag(false);
    const score = this.options.spikeScore ?? { bars: 8, notes: [] };
    this.notes = notesFromScore(score);
    this.bars = Math.max(1, score.bars);
    this.lanes = new Map();
    this.noteEls = new Map();
    this.selectedId = null;
    this.tabStop = null;

    const doc = this.doc;
    const t = messagesFor(this.options.language);
    const canvas = create(doc, "div", "sce-canvas");
    canvas.style.setProperty("--sce-bars", String(this.bars));

    const ruler = create(doc, "div", "sce-ruler", canvas);
    this.ruler = ruler;
    create(doc, "div", "sce-corner", ruler);
    const bars = create(doc, "div", "sce-bars", ruler);
    const numbers = doc.createDocumentFragment();
    for (let bar = 0; bar < this.bars; bar++) {
      const label = create(doc, "span", "sce-bar-number");
      label.style.setProperty("--i", String(bar));
      label.textContent = String(bar + 1);
      numbers.appendChild(label);
    }
    bars.appendChild(numbers);

    for (const voice of voicesOf(this.notes)) {
      const range = pitchRangeOf(this.notes, voice);
      const rows = range.hi - range.lo;
      const group = create(doc, "div", "sce-track-group", canvas);
      const head = create(doc, "div", "sce-track-head", group);
      create(doc, "span", "sce-track-name", head).textContent = voice;
      const track = create(doc, "div", "sce-track", group);
      const keys = create(doc, "div", "sce-keys", track);
      for (let octave = range.hi - 12; octave >= range.lo; octave -= 12) {
        create(doc, "div", "sce-octave", keys).textContent = pitchName(octave);
      }
      const laneEl = create(doc, "div", "sce-lane", track);
      laneEl.setAttribute("role", "group");
      laneEl.setAttribute("aria-label", voice);
      laneEl.style.setProperty("--sce-rows", String(rows));
      this.lanes.set(voice, { voice, range, rows, el: laneEl, keys, head });
    }

    const fragments = new Map<string, DocumentFragment>();
    for (const note of this.notes) {
      const lane = this.lanes.get(note.voice);
      if (!lane) continue;
      const el = create(doc, "div", "sce-note");
      el.setAttribute("role", "button");
      el.setAttribute("aria-pressed", "false");
      el.tabIndex = -1;
      el.dataset.sceId = note.id;
      this.placeNote(el, note, lane);
      el.setAttribute("aria-label", t.noteLabel(note));
      this.noteEls.set(note.id, el);
      let fragment = fragments.get(note.voice);
      if (!fragment) {
        fragment = doc.createDocumentFragment();
        fragments.set(note.voice, fragment);
      }
      fragment.appendChild(el);
    }
    for (const [voice, fragment] of fragments) this.lanes.get(voice)?.el.appendChild(fragment);

    const first = this.notes[0] ? this.noteEls.get(this.notes[0].id) : undefined;
    if (first) this.setTabStop(first);

    if (this.canvas) this.canvas.replaceWith(canvas);
    else this.scroller.appendChild(canvas);
    this.canvas = canvas;
  }

  private placeNote(el: HTMLElement, note: Note, lane: Lane): void {
    el.style.cssText = `--t:${note.start};--d:${note.duration};--r:${lane.range.hi - 1 - note.midi}`;
  }

  /** Scrolls the roll so the middle of the first voice's pitch range is in view. Layout is read once. */
  private centerOnFirstLane(): void {
    const lane = this.lanes.values().next().value as Lane | undefined;
    if (!lane || this.scroller.scrollHeight <= this.scroller.clientHeight) return;
    const pitches = this.notes.filter((note) => note.voice === lane.voice).map((note) => note.midi);
    if (pitches.length === 0) return;
    const middle = (Math.min(...pitches) + Math.max(...pitches)) / 2;
    const laneRect = lane.el.getBoundingClientRect();
    const scrollerRect = this.scroller.getBoundingClientRect();
    const rowPx = laneRect.height / lane.rows;
    const y = laneRect.top - scrollerRect.top + this.scroller.scrollTop + (lane.range.hi - 1 - middle) * rowPx;
    this.scroller.scrollTop = Math.max(0, y - this.scroller.clientHeight / 2);
  }

  // --- selection ---------------------------------------------------------------------------------

  private select(id: string | null): void {
    if (this.selectedId) this.noteEls.get(this.selectedId)?.setAttribute("aria-pressed", "false");
    this.selectedId = id;
    const el = id ? this.noteEls.get(id) : undefined;
    if (el) {
      el.setAttribute("aria-pressed", "true");
      this.setTabStop(el);
    }
  }

  private setTabStop(el: HTMLElement): void {
    if (this.tabStop && this.tabStop !== el) this.tabStop.tabIndex = -1;
    el.tabIndex = 0;
    this.tabStop = el;
  }

  private noteElementOf(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>(".sce-note");
    return el && this.root.contains(el) ? el : null;
  }

  private readonly onClick = (event: MouseEvent): void => {
    if (this.noteElementOf(event.target)) return;
    if (event.target instanceof Element && event.target.closest(".sce-toolbar, .sce-popover")) return;
    this.select(null);
  };

  // --- pointer gestures --------------------------------------------------------------------------

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.drag || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const el = this.noteElementOf(event.target);
    if (!el) return;
    const id = el.dataset.sceId;
    const note = id ? this.notes.find((candidate) => candidate.id === id) : undefined;
    const lane = note ? this.lanes.get(note.voice) : undefined;
    if (!id || !note || !lane) return;

    event.preventDefault();
    this.select(id);
    el.focus({ preventScroll: true });

    const laneRect = lane.el.getBoundingClientRect();
    const total = this.bars * TICKS_PER_BAR;
    const scale = laneRect.width / lane.el.offsetWidth || 1;
    const abort = new AbortController();
    this.drag = {
      noteId: id,
      el,
      lane,
      pointerId: event.pointerId,
      touch: event.pointerType !== "mouse",
      threshold: event.pointerType === "mouse" ? 3 : 6,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: this.scroller.scrollLeft,
      startScrollTop: this.scroller.scrollTop,
      x: event.clientX,
      y: event.clientY,
      view: this.visibleView(lane, scale),
      zone: event.pointerType === "mouse" ? 32 : 48,
      raf: 0,
      scale,
      pxPerTick: laneRect.width / total,
      rowPx: laneRect.height / lane.rows,
      cssPerTick: lane.el.offsetWidth / total,
      cssRow: lane.el.offsetHeight / lane.rows,
      rootRect: this.root.getBoundingClientRect(),
      readoutWidth: 0,
      moved: false,
      dTicks: 0,
      dMidi: 0,
      abort,
    };
    el.setPointerCapture(event.pointerId);
    const options = { signal: abort.signal };
    el.addEventListener("pointermove", this.onPointerMove, options);
    el.addEventListener("pointerup", this.onPointerUp, options);
    el.addEventListener("pointercancel", this.onPointerCancel, options);
    el.addEventListener("lostpointercapture", this.onPointerCancel, options);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.moved) {
      const { dx, dy } = this.dragOffset(drag);
      if (Math.hypot(dx, dy) < drag.threshold) return;
      drag.moved = true;
      if (!this.editable) {
        this.notify("read-only", "info", messagesFor(this.options.language).noticeReadOnly);
        return;
      }
      drag.el.dataset.dragging = "";
      this.readout.hidden = false;
    }
    if (!this.editable) return;
    this.updateDrag(drag);
    this.scrollAtEdge(drag);
  };

  /** How far the pointer is from where it went down, counting what the roll has scrolled since. Screen pixels. */
  private dragOffset(drag: Drag): { dx: number; dy: number } {
    return {
      dx: drag.x - drag.startX + (this.scroller.scrollLeft - drag.startScrollLeft) * drag.scale,
      dy: drag.y - drag.startY + (this.scroller.scrollTop - drag.startScrollTop) * drag.scale,
    };
  }

  /** Shows where the drag would drop the note: the snapped ghost position, the blocked cue and the readout. */
  private updateDrag(drag: Drag): void {
    const note = this.notes.find((candidate) => candidate.id === drag.noteId);
    if (!note) return;
    const { dx, dy } = this.dragOffset(drag);
    drag.dTicks = Math.round(dx / drag.pxPerTick / this.grid.ticks) * this.grid.ticks;
    drag.dMidi = -Math.round(dy / drag.rowPx);
    const target = resolveMove(note, drag.dTicks, drag.dMidi, this.boundsOf(drag.lane));
    drag.el.style.translate = `${(target.start - note.start) * drag.cssPerTick}px ${(note.midi - target.midi) * drag.cssRow}px`;
    const takenBy = noteId(note.voice, target.start);
    drag.el.toggleAttribute("data-blocked", takenBy !== note.id && this.noteEls.has(takenBy));

    this.readout.textContent = messagesFor(this.options.language).position(target.midi, target.start);
    // Measured once, with real text; the slack covers a bar number gaining a digit.
    if (drag.readoutWidth === 0) drag.readoutWidth = this.readout.offsetWidth + 16;
    const x = drag.x - drag.rootRect.left + 14;
    const y = drag.y - drag.rootRect.top - (drag.touch ? 56 : 34);
    const maxX = Math.max(0, drag.rootRect.width - drag.readoutWidth - 8);
    this.readout.style.translate = `${Math.min(Math.max(0, x), maxX)}px ${Math.max(0, y)}px`;
  }

  /** The part of the scroller a note can be seen in: what the sticky ruler, track head and pitch column leave free. */
  private visibleView(lane: Lane, scale: number): View {
    const box = this.scroller.getBoundingClientRect();
    const covered = Math.max(this.ruler?.getBoundingClientRect().bottom ?? 0, lane.head.getBoundingClientRect().bottom);
    return {
      left: lane.keys.getBoundingClientRect().right,
      right: box.left + this.scroller.clientWidth * scale,
      top: covered,
      bottom: box.top + this.scroller.clientHeight * scale,
    };
  }

  /** While a dragged note is held near the edge of the roll, scrolls it, so a note can travel further than the screen. */
  private scrollAtEdge(drag: Drag): void {
    if (drag.raf !== 0) return;
    const win = this.doc.defaultView;
    if (!win) return;
    const speed = (at: number, low: number, high: number): number => {
      if (at < low + drag.zone) return -EDGE_SPEED * Math.min(1, (low + drag.zone - at) / drag.zone) ** 2;
      if (at > high - drag.zone) return EDGE_SPEED * Math.min(1, (at - (high - drag.zone)) / drag.zone) ** 2;
      return 0;
    };
    const step = (): void => {
      drag.raf = 0;
      if (this.drag !== drag) return;
      const vx = speed(drag.x, drag.view.left, drag.view.right);
      const vy = speed(drag.y, drag.view.top, drag.view.bottom);
      const { scrollLeft, scrollTop } = this.scroller;
      this.scroller.scrollLeft = scrollLeft + vx;
      this.scroller.scrollTop = scrollTop + vy;
      // At the end of the roll nothing moves: stop until the next pointer move asks again.
      if (this.scroller.scrollLeft === scrollLeft && this.scroller.scrollTop === scrollTop) return;
      this.updateDrag(drag);
      drag.raf = win.requestAnimationFrame(step);
    };
    if (speed(drag.x, drag.view.left, drag.view.right) !== 0 || speed(drag.y, drag.view.top, drag.view.bottom) !== 0) {
      drag.raf = win.requestAnimationFrame(step);
    }
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.finishDrag(true);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.finishDrag(false);
  };

  private finishDrag(commit: boolean): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    drag.abort.abort();
    if (drag.raf !== 0) this.doc.defaultView?.cancelAnimationFrame(drag.raf);
    if (drag.el.hasPointerCapture(drag.pointerId)) drag.el.releasePointerCapture(drag.pointerId);
    drag.el.style.removeProperty("translate");
    delete drag.el.dataset.dragging;
    drag.el.removeAttribute("data-blocked");
    this.readout.hidden = true;
    if (commit && drag.moved && this.editable) this.commitMove(drag.noteId, drag.dTicks, drag.dMidi, false);
  }

  // --- the one edit ------------------------------------------------------------------------------

  private boundsOf(lane: Lane): MoveBounds {
    return { totalTicks: this.bars * TICKS_PER_BAR, lo: lane.range.lo, hi: lane.range.hi };
  }

  /** Applies a move from a drag or a key press; both go through the same command. */
  private commitMove(id: string, dTicks: number, dMidi: number, reveal: boolean): void {
    const note = this.notes.find((candidate) => candidate.id === id);
    const lane = note ? this.lanes.get(note.voice) : undefined;
    const el = this.noteEls.get(id);
    if (!note || !lane || !el) return;
    const t = messagesFor(this.options.language);
    const result = moveNote(this.notes, id, dTicks, dMidi, this.boundsOf(lane));
    if (!result.ok) {
      this.notify("move-blocked", "info", t.noticeMoveBlocked);
      this.announce(t.noticeMoveBlocked);
      return;
    }
    this.notes = result.notes;
    const moved = result.notes.find((candidate) => candidate.id === result.id);
    if (!moved) return;
    this.noteEls.delete(id);
    this.noteEls.set(result.id, el);
    el.dataset.sceId = result.id;
    this.placeNote(el, moved, lane);
    el.setAttribute("aria-label", t.noteLabel(moved));
    if (this.selectedId === id) this.selectedId = result.id;
    this.announce(t.noteLabel(moved));
    if (result.clampedPitch) this.notify("pitch-out-of-range", "info", t.noticePitchRange);
    if (reveal) this.reveal(el, lane);
  }

  /**
   * Tells assistive technology what a move did: the new label of a note is not read out again by itself.
   * A fresh text node each time, so the same sentence twice in a row is still announced.
   */
  private announce(text: string): void {
    this.live.replaceChildren(this.doc.createTextNode(text));
  }

  /** Scrolls the roll just enough that a note moved by key stays clear of the edges and of the sticky parts. */
  private reveal(el: HTMLElement, lane: Lane): void {
    const box = this.scroller.getBoundingClientRect();
    const note = el.getBoundingClientRect();
    const margin = 6;
    const left = lane.keys.getBoundingClientRect().right + margin;
    const right = box.left + this.scroller.clientWidth - margin;
    const top =
      Math.max(this.ruler?.getBoundingClientRect().bottom ?? 0, lane.head.getBoundingClientRect().bottom) + margin;
    const bottom = box.top + this.scroller.clientHeight - margin;
    // The start edge wins when a note is wider than the view, so the right-hand rule goes first.
    if (note.right > right) this.scroller.scrollLeft += note.right - right;
    if (note.left < left) this.scroller.scrollLeft -= left - note.left;
    if (note.bottom > bottom) this.scroller.scrollTop += note.bottom - bottom;
    if (note.top < top) this.scroller.scrollTop -= top - note.top;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.drag) {
      // Cancelling a drag must not also close a host dialog that listens for the same key.
      event.preventDefault();
      event.stopPropagation();
      this.finishDrag(false);
      return;
    }
    if (event.target instanceof Element && event.target.closest(".sce-menu-item")) {
      this.walkMenu(event);
      return;
    }
    const el = this.noteElementOf(event.target);
    const id = el?.dataset.sceId;
    if (!el || !id || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.select(this.selectedId === id ? null : id);
      return;
    }
    let dTicks = 0;
    let dMidi = 0;
    if (event.key === "ArrowLeft") dTicks = -this.grid.ticks;
    else if (event.key === "ArrowRight") dTicks = this.grid.ticks;
    else if (event.key === "ArrowUp") dMidi = event.shiftKey ? 12 : 1;
    else if (event.key === "ArrowDown") dMidi = event.shiftKey ? -12 : -1;
    else return;
    event.preventDefault();
    if (!this.editable) {
      this.notify("read-only", "info", messagesFor(this.options.language).noticeReadOnly);
      return;
    }
    this.commitMove(id, dTicks, dMidi, true);
  };

  /** Arrow, Home and End keys move between the items of the open menu, as a menu is expected to behave. */
  private walkMenu(event: KeyboardEvent): void {
    const items = [...this.menuItems.values()];
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

  // --- the grid popover --------------------------------------------------------------------------

  private chooseGrid(choice: GridChoice): void {
    this.grid = choice;
    this.applyGrid();
    this.menu.hidePopover();
  }

  /** Puts the menu under its button. A popover lives in the top layer, so its position is viewport based. */
  private placeMenu(event: ToggleEvent): void {
    if (event.newState !== "open") return;
    const rect = this.gridButton.getBoundingClientRect();
    this.menu.style.left = `${rect.left}px`;
    this.menu.style.top = `${rect.bottom + 4}px`;
  }

  private menuToggled(event: ToggleEvent): void {
    const open = event.newState === "open";
    this.gridButton.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const view = this.doc.defaultView;
    if (view) {
      const rect = this.menu.getBoundingClientRect();
      const overflow = rect.right - (view.innerWidth - 8);
      if (overflow > 0) this.menu.style.left = `${Math.max(8, rect.left - overflow)}px`;
    }
    this.menuItems.get(this.grid.id)?.focus();
  }
}

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
}

/** The state of one drag gesture. Distances are in screen pixels unless named css*. */
interface Drag {
  noteId: string;
  el: HTMLElement;
  lane: Lane;
  pointerId: number;
  threshold: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
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

  private canvas: HTMLElement | null = null;
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
    this.scroller = create(doc, "div", "sce-scroller", this.root);
    this.scroller.tabIndex = 0;
    this.scroller.setAttribute("role", "region");
    this.scroller.setAttribute("aria-describedby", this.hint.id);

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
      const head = create(doc, "div", "sce-track-head", canvas);
      create(doc, "span", "sce-track-name", head).textContent = voice;
      const track = create(doc, "div", "sce-track", canvas);
      const keys = create(doc, "div", "sce-keys", track);
      for (let octave = range.hi - 12; octave >= range.lo; octave -= 12) {
        create(doc, "div", "sce-octave", keys).textContent = pitchName(octave);
      }
      const laneEl = create(doc, "div", "sce-lane", track);
      laneEl.setAttribute("role", "group");
      laneEl.setAttribute("aria-label", voice);
      laneEl.style.setProperty("--sce-rows", String(rows));
      this.lanes.set(voice, { voice, range, rows, el: laneEl });
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
      threshold: event.pointerType === "mouse" ? 3 : 6,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: this.scroller.scrollLeft,
      startScrollTop: this.scroller.scrollTop,
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
    const dx = event.clientX - drag.startX + (this.scroller.scrollLeft - drag.startScrollLeft) * drag.scale;
    const dy = event.clientY - drag.startY + (this.scroller.scrollTop - drag.startScrollTop) * drag.scale;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < drag.threshold) return;
      drag.moved = true;
      if (!this.editable) {
        this.notify("read-only", "info", messagesFor(this.options.language).noticeReadOnly);
        return;
      }
      drag.el.dataset.dragging = "";
      this.readout.hidden = false;
      drag.readoutWidth = this.readout.offsetWidth;
    }
    if (!this.editable) return;

    const note = this.notes.find((candidate) => candidate.id === drag.noteId);
    if (!note) return;
    drag.dTicks = Math.round(dx / drag.pxPerTick / this.grid.ticks) * this.grid.ticks;
    drag.dMidi = -Math.round(dy / drag.rowPx);
    const target = resolveMove(note, drag.dTicks, drag.dMidi, this.boundsOf(drag.lane));
    drag.el.style.translate = `${(target.start - note.start) * drag.cssPerTick}px ${(note.midi - target.midi) * drag.cssRow}px`;
    const takenBy = noteId(note.voice, target.start);
    drag.el.toggleAttribute("data-blocked", takenBy !== note.id && this.noteEls.has(takenBy));

    this.readout.textContent = messagesFor(this.options.language).position(target.midi, target.start);
    const x = event.clientX - drag.rootRect.left + 14;
    const y = event.clientY - drag.rootRect.top - (event.pointerType === "mouse" ? 34 : 56);
    const maxX = Math.max(0, drag.rootRect.width - drag.readoutWidth - 8);
    this.readout.style.translate = `${Math.min(Math.max(0, x), maxX)}px ${Math.max(0, y)}px`;
  };

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
    if (drag.el.hasPointerCapture(drag.pointerId)) drag.el.releasePointerCapture(drag.pointerId);
    drag.el.style.removeProperty("translate");
    delete drag.el.dataset.dragging;
    drag.el.removeAttribute("data-blocked");
    this.readout.hidden = true;
    if (commit && drag.moved && this.editable) this.commitMove(drag.noteId, drag.dTicks, drag.dMidi);
  }

  // --- the one edit ------------------------------------------------------------------------------

  private boundsOf(lane: Lane): MoveBounds {
    return { totalTicks: this.bars * TICKS_PER_BAR, lo: lane.range.lo, hi: lane.range.hi };
  }

  /** Applies a move from a drag or a key press; both go through the same command. */
  private commitMove(id: string, dTicks: number, dMidi: number): void {
    const note = this.notes.find((candidate) => candidate.id === id);
    const lane = note ? this.lanes.get(note.voice) : undefined;
    const el = this.noteEls.get(id);
    if (!note || !lane || !el) return;
    const result = moveNote(this.notes, id, dTicks, dMidi, this.boundsOf(lane));
    if (!result.ok) return;
    this.notes = result.notes;
    const moved = result.notes.find((candidate) => candidate.id === result.id);
    if (!moved) return;
    this.noteEls.delete(id);
    this.noteEls.set(result.id, el);
    el.dataset.sceId = result.id;
    this.placeNote(el, moved, lane);
    el.setAttribute("aria-label", messagesFor(this.options.language).noteLabel(moved));
    if (this.selectedId === id) this.selectedId = result.id;
    if (result.clampedPitch) {
      this.notify("pitch-out-of-range", "info", messagesFor(this.options.language).noticePitchRange);
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const el = this.noteElementOf(event.target);
    const id = el?.dataset.sceId;
    if (!el || !id || event.altKey || event.ctrlKey || event.metaKey) return;
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
    this.commitMove(id, dTicks, dMidi);
  };

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

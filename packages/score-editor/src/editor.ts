// ABOUTME: The mounted editor: reads the song project's score with its dialect and builds the read-only arrangement view.
// ABOUTME: Every listener is registered with one AbortSignal, so destroy() removes them all and leaves no node behind.
import {
  cutOf,
  gridTicks,
  lengthInBeats,
  marksOf,
  notesByVoice,
  pitchName,
  pitchRangeOf,
  positionOf,
  tieJoins,
} from "./arrangement";
import { messagesFor } from "./i18n";
import type { Note, Score } from "./score";
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
  private destroyed = false;

  constructor(
    host: HTMLElement,
    options: MountOptions,
    private readonly onDestroy: () => void,
  ) {
    this.options = { ...options };
    this.doc = host.ownerDocument;
    const doc = this.doc;
    const n = ++instanceCount;

    this.releaseStyles = acquireStyles(host);
    this.root = create(doc, "div", "sce-root");

    const toolbar = create(doc, "div", "sce-toolbar", this.root);
    this.title = create(doc, "span", "sce-title", toolbar);
    create(doc, "span", "sce-spacer", toolbar);
    this.badge = create(doc, "span", "sce-badge", toolbar);

    this.notice = create(doc, "div", "sce-notice", this.root);
    this.notice.setAttribute("role", "note");
    this.hint = create(doc, "div", "sce-sr-only", this.root);
    this.hint.id = `sce-hint-${n}`;
    this.body = create(doc, "div", "sce-body", this.root);

    this.applyLanguage();
    this.applyEditable();
    this.render();
    host.appendChild(this.root);
  }

  update(patch: Partial<MountOptions>): void {
    if (this.destroyed) return;
    const before = this.options;
    this.options = { ...before, ...patch };
    if (this.options.language !== before.language) this.applyLanguage();
    if (this.options.editable !== before.editable) this.applyEditable();
    if (this.options.language !== before.language || this.options.project !== before.project) this.render();
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

  // --- texts and flags ---------------------------------------------------------------------------

  private applyLanguage(): void {
    const t = messagesFor(this.options.language);
    this.root.lang = this.options.language;
    this.title.textContent = t.title;
    this.hint.textContent = t.hint;
    this.badge.textContent = t.readOnly;
  }

  private applyEditable(): void {
    this.root.toggleAttribute("data-readonly", !this.editable);
    this.badge.hidden = this.editable;
  }

  // --- building the view -------------------------------------------------------------------------

  private render(): void {
    const { project, dialects } = this.options;
    const dialect = dialects.find(project.modelId);
    const score = dialect?.parse(project.score).score;
    this.body.replaceChildren();
    const cut = score ? cutOf(score) : null;
    this.notice.hidden = !cut;
    this.notice.textContent = cut ? messagesFor(this.options.language).cutNotice(cut) : "";
    if (score) this.body.appendChild(this.buildArrangement(score));
  }

  private buildArrangement(score: Score): HTMLElement {
    const doc = this.doc;
    const t = messagesFor(this.options.language);
    const scroller = create(doc, "div", "sce-scroller");
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", t.title);
    scroller.setAttribute("aria-describedby", this.hint.id);

    const canvas = create(doc, "div", "sce-canvas", scroller);
    canvas.style.setProperty("--sce-ticks", String(gridTicks(score)));

    const top = create(doc, "div", "sce-top", canvas);
    this.buildRuler(top, score);
    this.buildSections(top, score);
    this.buildMarks(top, score);
    this.buildChords(top, score);

    const notes = notesByVoice(score);
    for (const voice of score.voices) this.buildTrack(canvas, score, voice, notes.get(voice) ?? []);
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
    timeline.setAttribute("role", "list");
    timeline.setAttribute("aria-label", label);
    return { corner, timeline };
  }

  private buildRuler(top: HTMLElement, score: Score): void {
    const { timeline } = this.headerRow(top, "sce-ruler", messagesFor(this.options.language).bars);
    const numbers = this.doc.createDocumentFragment();
    for (const bar of score.bars) {
      const label = create(this.doc, "span", "sce-bar-number");
      label.setAttribute("role", "listitem");
      label.style.setProperty("--t", String(bar.start));
      label.textContent = String(bar.index + 1);
      numbers.appendChild(label);
    }
    timeline.appendChild(numbers);
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

  /** One piano-roll track: its head, the pitch column and the lane with a block for every pitched note. */
  private buildTrack(canvas: HTMLElement, score: Score, voice: string, notes: ReadonlyArray<Note>): void {
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
    for (const [index, note] of notes.entries()) {
      if (note.midi === null) continue;
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
      const names: string[] = [];
      if (mark.meter) {
        create(this.doc, "span", "sce-mark-item", flag).textContent = t.meterText(mark.meter);
        names.push(t.meterName(mark.meter));
      }
      if (mark.key) {
        create(this.doc, "span", "sce-mark-item", flag).textContent = t.keyText(mark.key);
        names.push(t.keyText(mark.key));
      }
      if (mark.cut) {
        const text = mark.cut.short ? t.incompleteBar : t.cutOff;
        create(this.doc, "span", "sce-mark-item", flag).textContent = text;
        names.push(text);
        if (!mark.cut.short) flag.dataset.edge = "end";
      }
      flag.setAttribute("aria-label", names.join(", "));
      flags.appendChild(flag);
    });
    timeline.appendChild(flags);
  }
}

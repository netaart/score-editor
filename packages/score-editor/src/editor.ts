// ABOUTME: The mounted editor: reads the song project's score with its dialect and builds the read-only arrangement view.
// ABOUTME: Every listener is registered with one AbortSignal, so destroy() removes them all and leaves no node behind.
import { messagesFor } from "./i18n";
import type { Score } from "./score";
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

/** Length of the shared bar grid, in ticks. */
function gridTicks(score: Score): number {
  const last = score.bars[score.bars.length - 1];
  return last ? last.start + last.length : 0;
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

    for (const voice of score.voices) {
      const group = create(doc, "div", "sce-track-group", canvas);
      const head = create(doc, "div", "sce-track-head", group);
      create(doc, "span", "sce-track-name", head).textContent = voice;
      const track = create(doc, "div", "sce-track", group);
      create(doc, "div", "sce-corner", track);
      const lane = create(doc, "div", "sce-lane", track);
      lane.setAttribute("role", "list");
      lane.setAttribute("aria-label", voice);
    }
    return scroller;
  }

  /** A row of the pinned header: the pinned corner and the timeline that carries the row's items. */
  private headerRow(top: HTMLElement, className: string, label: string): HTMLElement {
    const row = create(this.doc, "div", `sce-row ${className}`, top);
    create(this.doc, "div", "sce-corner", row);
    const timeline = create(this.doc, "div", "sce-timeline", row);
    timeline.setAttribute("role", "list");
    timeline.setAttribute("aria-label", label);
    return timeline;
  }

  private buildRuler(top: HTMLElement, score: Score): void {
    const timeline = this.headerRow(top, "sce-ruler", messagesFor(this.options.language).bars);
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
    const timeline = this.headerRow(top, "sce-sections", t.sections);
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
}

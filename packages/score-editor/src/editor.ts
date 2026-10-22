// ABOUTME: The default editor: one editing session and the public view parts, laid out in a toolbar, a scroller and a problem view.
// ABOUTME: Everything it adds is registered so destroy() removes it: the parts remove their own, the frame removes the rest.

import { notesByVoice, pitchRangeOf } from "./arrangement";
import { installZoomGestures } from "./axis";
import { mountChordTrack } from "./chord-track";
import { mountCutNotice } from "./cut-notice";
import { create } from "./dom";
import { messagesFor } from "./i18n";
import { mountProblemView } from "./problem-view";
import { createEditingSession, type EditingSession, type ScoreReading, type SessionChange } from "./session";
import { acquireStyles } from "./styles";
import { mountTimeRuler } from "./time-ruler";
import type { Language, MountedEditor, MountOptions, ViewPart } from "./types";
import { mountVoiceTrack } from "./voice-track";
import { mountZoomControl } from "./zoom-control";

let instanceCount = 0;

export class Editor implements MountedEditor {
  private options: MountOptions;
  private readonly doc: Document;
  private readonly root: HTMLElement;
  private readonly releaseStyles: () => void;
  private readonly abort = new AbortController();
  private readonly session: EditingSession;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly content: HTMLElement;
  private readonly top: HTMLElement;
  private readonly parts: ViewPart[] = [];
  private tracks: ViewPart[] = [];
  private voices: string[] = [];
  private reading: ScoreReading;
  private language: Language;
  private openingViewDue = false;
  private readonly unsubscribe: Array<() => void> = [];
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
    this.session = createEditingSession({
      project: options.project,
      dialects: options.dialects,
      language: options.language,
    });
    this.reading = this.session.reading;
    this.language = this.session.view.language;
    // The frame hears a change before the parts do, so it shows the scroller and sets up the tracks they draw into.
    this.unsubscribe.push(this.session.subscribe((change) => this.beforeParts(change)));

    this.root = create(doc, "div", "sce-root sce-editor");
    host.appendChild(this.root);

    const toolbar = create(doc, "div", "sce-toolbar", this.root);
    this.title = create(doc, "span", "sce-title", toolbar);
    this.parts.push(mountZoomControl(toolbar, this.session));
    create(doc, "span", "sce-spacer", toolbar);
    this.badge = create(doc, "span", "sce-badge", toolbar);

    this.parts.push(mountCutNotice(this.root, this.session));
    this.hint = create(doc, "div", "sce-sr-only", this.root);
    this.hint.id = `sce-hint-${n}`;
    const body = create(doc, "div", "sce-body", this.root);
    this.scroller = create(doc, "div", "sce-scroller", body);
    this.scroller.tabIndex = 0;
    this.scroller.setAttribute("role", "region");
    this.scroller.setAttribute("aria-describedby", this.hint.id);
    this.content = create(doc, "div", "sce-content", this.scroller);
    this.top = create(doc, "div", "sce-top", this.content);

    this.parts.push(mountTimeRuler(this.top, this.session, { scroller: this.scroller }));
    this.parts.push(mountChordTrack(this.top, this.session, { scroller: this.scroller }));
    this.syncTracks();
    this.parts.push(mountProblemView(body, this.session));

    installZoomGestures(this.root, this.session, this.abort.signal, { wheel: false });
    installZoomGestures(this.scroller, this.session, this.abort.signal, { wheel: true });

    this.applyLanguage();
    this.applyEditable();
    this.scroller.hidden = this.reading.kind !== "score";
    // The frame hears a change after the parts have drawn it, so it can scroll to what they drew.
    this.unsubscribe.push(this.session.subscribe(() => this.afterParts()));
    this.centreFirstTrack();
  }

  update(patch: Partial<MountOptions>): void {
    if (this.destroyed) return;
    const before = this.options;
    this.options = { ...before, ...patch };
    if (patch.language !== undefined) this.session.setView({ language: patch.language });
    if (this.options.editable !== before.editable) this.applyEditable();
    if (patch.dialects !== undefined) this.session.replaceDialects(patch.dialects);
    if (patch.project !== undefined) this.session.replaceProject(patch.project);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    for (const stop of this.unsubscribe) stop();
    for (const part of [...this.parts, ...this.tracks]) part.destroy();
    this.root.remove();
    this.releaseStyles();
    this.onDestroy();
  }

  private get editable(): boolean {
    return this.options.editable !== false;
  }

  private applyLanguage(): void {
    const { language } = this.session.view;
    this.language = language;
    const t = messagesFor(language);
    this.root.lang = language;
    this.title.textContent = t.title;
    this.hint.textContent = t.hint;
    this.badge.textContent = t.readOnly;
    this.scroller.setAttribute("aria-label", t.title);
  }

  private applyEditable(): void {
    this.root.toggleAttribute("data-readonly", !this.editable);
    this.badge.hidden = this.editable;
  }

  /** One track part for each voice of the score; the parts of a score with other voices are replaced. */
  private syncTracks(): void {
    const voices = this.reading.kind === "score" ? [...this.reading.score.voices] : [];
    if (voices.length === this.voices.length && voices.every((voice, at) => voice === this.voices[at])) return;
    for (const track of this.tracks) track.destroy();
    this.voices = voices;
    this.tracks = voices.map((voice) =>
      mountVoiceTrack(this.content, this.session, { voice, scroller: this.scroller }),
    );
  }

  private beforeParts(change: SessionChange): void {
    if (this.session.view.language !== this.language) this.applyLanguage();
    if (this.session.reading === this.reading) return;
    this.reading = this.session.reading;
    this.scroller.hidden = this.reading.kind !== "score";
    this.syncTracks();
    if (change.cause === "replace") this.openingViewDue = true;
  }

  private afterParts(): void {
    if (!this.openingViewDue) return;
    this.openingViewDue = false;
    this.session.setView({ scrollLeft: 0 });
    this.scroller.scrollTop = 0;
    this.centreFirstTrack();
  }

  private centreFirstTrack(): void {
    const { reading, scroller } = this;
    if (reading.kind !== "score" || scroller.scrollHeight <= scroller.clientHeight) return;
    const voice = reading.score.voices[0];
    const lane = scroller.querySelector<HTMLElement>(".sce-lane");
    const head = scroller.querySelector<HTMLElement>(".sce-track-head");
    if (voice === undefined || !lane || !head) return;
    const notes = notesByVoice(reading.score).get(voice) ?? [];
    const range = pitchRangeOf(notes);
    let lowest = 127;
    let highest = 0;
    for (const note of notes) {
      if (note.midi === null) continue;
      lowest = Math.min(lowest, note.midi);
      highest = Math.max(highest, note.midi);
    }
    const middle = highest >= lowest ? (lowest + highest) / 2 : (range.lo + range.hi) / 2;
    const laneBox = lane.getBoundingClientRect();
    const frame = scroller.getBoundingClientRect();
    const rowPixels = laneBox.height / (range.hi - range.lo);
    const target = laneBox.top - frame.top + scroller.scrollTop + (range.hi - 1 - middle + 0.5) * rowPixels;
    const pinned = this.top.offsetHeight + head.offsetHeight;
    scroller.scrollTop = Math.max(0, target - pinned - (scroller.clientHeight - pinned) / 2);
  }
}

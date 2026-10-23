// ABOUTME: The default editor: one editing session and the public view parts, laid out in a toolbar, a scroller and a problem view.
// ABOUTME: Everything it adds is registered so destroy() removes it: the parts remove their own, the frame removes the rest.

import { notesByVoice, pitchRangeOf } from "./arrangement";
import { installZoomGestures } from "./axis";
import { mountChordTrack } from "./chord-track";
import { mountCutNotice } from "./cut-notice";
import { type Diagnostic, formatDiagnostic } from "./diagnostics";
import { create } from "./dom";
import { createDraftBinding, type DraftBinding, type DraftTarget, sameOriginal } from "./draft-binding";
import { mountDraftConflict } from "./draft-conflict";
import { installEditKeys } from "./edit-keys";
import { messagesFor } from "./i18n";
import { createLiveRegion, sayRefusals } from "./live-region";
import { mountProblemView } from "./problem-view";
import {
  createEditingSession,
  type EditingSession,
  type ScoreReading,
  type SessionChange,
  type ViewName,
} from "./session";
import { mountStaffView } from "./staff-view";
import { mountStaleNotice } from "./stale-notice";
import { acquireStyles } from "./styles";
import { mountTextView } from "./text-view";
import { mountTimeRuler } from "./time-ruler";
import { mountToolbar } from "./toolbar";
import type { Language, MountedEditor, MountOptions, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";
import { mountVoiceTrack } from "./voice-track";

let instanceCount = 0;

/** A region of the frame for one part: the view switch shows and hides the whole region, not the part's own nodes. */
const pane = (parent: HTMLElement): HTMLElement => create(parent.ownerDocument, "div", "sce-pane", parent);

export class Editor implements MountedEditor {
  private options: MountOptions;
  private readonly doc: Document;
  private readonly root: HTMLElement;
  private readonly releaseStyles: () => void;
  private readonly abort = new AbortController();
  private readonly session: EditingSession;
  private readonly drafts: DraftBinding;
  private readonly scroller: HTMLElement;
  private readonly content: HTMLElement;
  private readonly top: HTMLElement;
  /** The wrappers that show and hide a view's parts as one: they take no box of their own. */
  private readonly stalePane: HTMLElement;
  private readonly problemPane: HTMLElement;
  private readonly staffPane: HTMLElement;
  private readonly textPane: HTMLElement;
  private readonly parts: ViewPart[] = [];
  private staffMounted = false;
  private textMounted = false;
  private shownView: ViewName = "arrangement";
  /** A project was opened while another view was shown: the arrangement opens at its start when it is shown again. */
  private centreDue = false;
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
      editable: options.editable !== false,
    });
    // A keeper opening keeps the session read-only until it is ready, so no edit can start before the restore has run.
    this.drafts = createDraftBinding(this.session, (notice) => this.options.notify?.(notice));
    this.drafts.follow(this.draftTarget());
    this.applyEditable();
    this.reading = this.session.reading;
    this.language = this.session.view.language;
    // The frame hears a change before the parts do, so it shows the scroller and sets up the tracks they draw into.
    this.unsubscribe.push(this.session.subscribe((change) => this.beforeParts(change)));
    this.unsubscribe.push(this.drafts.subscribe(() => this.applyEditable()));

    this.root = create(doc, "div", "sce-root sce-editor");
    host.appendChild(this.root);

    const hintId = `sce-hint-${n}`;
    const onRefused = (diagnostics: ReadonlyArray<Diagnostic>) => this.refused(diagnostics);
    this.parts.push(
      mountToolbar(this.root, this.session, { hintId, onRefused, viewSwitch: true, draftKeeper: this.drafts }),
    );
    this.parts.push(mountDraftConflict(this.root, this.session, this.drafts));
    this.parts.push(mountCutNotice(this.root, this.session));
    this.stalePane = pane(this.root);
    this.parts.push(mountStaleNotice(this.stalePane, this.session));
    const body = create(doc, "div", "sce-body", this.root);
    this.scroller = create(doc, "div", "sce-scroller", body);
    this.scroller.tabIndex = 0;
    this.scroller.setAttribute("role", "region");
    this.scroller.setAttribute("aria-describedby", hintId);
    this.content = create(doc, "div", "sce-content", this.scroller);
    this.top = create(doc, "div", "sce-top", this.content);

    this.parts.push(mountTimeRuler(this.top, this.session, { scroller: this.scroller, onRefused }));
    this.parts.push(mountChordTrack(this.top, this.session, { scroller: this.scroller, onRefused }));
    this.syncTracks();
    this.problemPane = pane(body);
    this.parts.push(mountProblemView(this.problemPane, this.session));
    // The staff view and the text view are mounted when each is first shown: the staff view asks for abcjs, and the text
    // view draws a number for each line of the score, a cost nobody pays who never opens it.
    this.staffPane = pane(body);
    this.textPane = pane(body);

    installZoomGestures(this.root, this.session, this.abort.signal, { wheel: false });
    installZoomGestures(this.scroller, this.session, this.abort.signal, { wheel: true });
    // Keys pressed with the focus on the scroller, outside every part, are heard here, so the frame says their refusals.
    const live = createLiveRegion(this.root);
    installEditKeys(this.root, this.session, this.abort.signal, {
      onRefused: sayRefusals(live, this.session, onRefused),
    });

    this.applyLanguage();
    this.applyEditable();
    this.showView();
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
    const target = this.draftTarget();
    this.drafts.follow(target, () => {
      if (patch.project === undefined) return;
      // While drafts are kept, the host passing its original again is not news: the editor holds the user's edits.
      if (target !== null && sameOriginal(before.project, patch.project)) return;
      this.session.replaceProject(patch.project);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    for (const stop of this.unsubscribe) stop();
    for (const part of [...this.parts, ...this.tracks]) part.destroy();
    this.root.remove();
    this.releaseStyles();
    this.drafts.destroy();
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
    this.scroller.setAttribute("aria-label", t.title);
  }

  /** The keeper the options call for: one while the editor is editable and the host gave a store. */
  private draftTarget(): DraftTarget | null {
    const { drafts, project } = this.options;
    return drafts !== undefined && this.editable ? { store: drafts, original: project } : null;
  }

  private applyEditable(): void {
    this.session.setView({ editable: this.editable && this.drafts.status !== "opening" });
  }

  /** A command the user's keys caused was refused and nothing changed: tell the host once, in the current language. */
  private refused(diagnostics: ReadonlyArray<Diagnostic>): void {
    const first = diagnostics[0];
    if (first === undefined) return;
    this.options.notify?.({
      code: "command-refused",
      level: "warning",
      message: formatDiagnostic(first, this.session.view.language),
    });
  }

  /** One track part for each voice of the score; the parts of a score with other voices are replaced. */
  private syncTracks(): void {
    const voices = this.reading.kind === "score" ? [...this.reading.score.voices] : [];
    if (voices.length === this.voices.length && voices.every((voice, at) => voice === this.voices[at])) return;
    for (const track of this.tracks) track.destroy();
    this.voices = voices;
    this.tracks = voices.map((voice) =>
      mountVoiceTrack(this.content, this.session, {
        voice,
        scroller: this.scroller,
        onRefused: (diagnostics) => this.refused(diagnostics),
      }),
    );
  }

  /**
   * Shows the view the session says is shown, and no other: the arrangement when the score reads, the problem view for the
   * arrangement and the staff, the stale notice above the two that draw the project, the text view on its own.
   */
  private showView(): void {
    const view = this.session.activeView;
    const arrangement = arrangementShown(this.session) && this.reading.kind === "score";
    const returning = this.shownView !== "arrangement" && view === "arrangement";
    this.shownView = view;
    this.scroller.hidden = !arrangement;
    this.stalePane.hidden = view === "text";
    this.problemPane.hidden = view === "text";
    this.staffPane.hidden = view !== "staff";
    this.textPane.hidden = view !== "text";
    if (view === "staff" && !this.staffMounted) {
      this.staffMounted = true;
      this.parts.push(mountStaffView(this.staffPane, this.session));
    }
    if (view === "text" && !this.textMounted) {
      this.textMounted = true;
      this.parts.push(mountTextView(this.textPane, this.session));
    }
    if (returning && arrangement && this.centreDue) {
      this.centreDue = false;
      this.openArrangement();
    }
  }

  private beforeParts(change: SessionChange): void {
    if (this.session.view.language !== this.language) this.applyLanguage();
    const readingChanged = this.session.reading !== this.reading;
    if (readingChanged) this.reading = this.session.reading;
    if (readingChanged || this.session.activeView !== this.shownView) this.showView();
    if (!readingChanged) return;
    this.syncTracks();
    if (change.cause === "replace") this.openingViewDue = true;
  }

  private afterParts(): void {
    if (!this.openingViewDue) return;
    this.openingViewDue = false;
    // A project opened while another view is shown opens the arrangement at its start when it is shown again.
    if (this.shownView !== "arrangement") this.centreDue = true;
    else this.openArrangement();
  }

  /** Scrolls the arrangement to the start of the score and the middle of its first track. */
  private openArrangement(): void {
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

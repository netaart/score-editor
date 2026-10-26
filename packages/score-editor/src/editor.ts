// ABOUTME: The default editor: one editing session and the public view parts, laid out in a toolbar, a scroller and a problem view.
// ABOUTME: Everything it adds is registered so destroy() removes it: the parts remove their own, the frame removes the rest.

import { applyProjectCommand } from "./apply";
import { notesByVoice, pitchRangeOf } from "./arrangement";
import { installZoomGestures } from "./axis";
import { mountChordTrack } from "./chord-track";
import type { ProjectCommand } from "./commands-project";
import { mountCutNotice } from "./cut-notice";
import { type Diagnostic, formatDiagnostic, isNoticeDiagnostic } from "./diagnostics";
import { create } from "./dom";
import { createDraftBinding, type DraftBinding } from "./draft-binding";
import { mountDraftConflict } from "./draft-conflict";
import { installEditKeys } from "./edit-keys";
import { hostChanges } from "./host-changes";
import { messagesFor } from "./i18n";
import { createLiveRegion, sayRefusals } from "./live-region";
import { mountLyricTrack } from "./lyric-track";
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
import type { DraftStore, Language, MountedEditor, MountOptions, ViewPart } from "./types";
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
  /** The chrome above the body: toolbar, conflict strip, cut sentence and stale notice, bounded by the music's floor. */
  private readonly chrome: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly content: HTMLElement;
  private readonly top: HTMLElement;
  /** The wrappers that show and hide a view's parts as one: they take no box of their own. */
  private readonly stalePane: HTMLElement;
  private readonly problemPane: HTMLElement;
  private readonly staffPane: HTMLElement;
  private readonly textPane: HTMLElement;
  private readonly parts: ViewPart[] = [];
  /** Where the draft conflict strip goes, between the toolbar and the cut notice; a comment so it takes no box. */
  private readonly draftAnchor: Comment;
  private conflict: ViewPart | null = null;
  private staffMounted = false;
  private textMounted = false;
  private shownView: ViewName = "arrangement";
  /** A project was opened while another view was shown: the arrangement opens at its start when it is shown again. */
  private centreDue = false;
  private tracks: ViewPart[] = [];
  private voices: string[] = [];
  /** The lyric track, the bottom track of the arrangement: it is mounted after the voice tracks and replaced with them. */
  private lyricTrack: ViewPart | null = null;
  private reading: ScoreReading;
  private language: Language;
  private openingViewDue = false;
  /** The lane window's centre as it was when the scroller last had this height, so chrome can grow without moving it. */
  private pinWindow: { clientHeight: number; pinned: number; scrollTop: number } | null = null;
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
    this.drafts.follow(this.draftStore(), options.project);
    this.applyEditable();
    this.reading = this.session.reading;
    this.language = this.session.view.language;
    // The frame hears a change before the parts do, so it shows the scroller and sets up the tracks they draw into.
    this.unsubscribe.push(this.session.subscribe((change) => this.beforeParts(change)));
    this.unsubscribe.push(this.drafts.subscribe(() => this.applyEditable()));

    this.root = create(doc, "div", "sce-root sce-editor");
    host.appendChild(this.root);
    this.chrome = create(doc, "div", "sce-chrome", this.root);

    const hintId = `sce-hint-${n}`;
    const onRefused = (diagnostics: ReadonlyArray<Diagnostic>) => this.refused(diagnostics);
    this.parts.push(
      mountToolbar(this.chrome, this.session, {
        hintId,
        onRefused,
        viewSwitch: true,
        tempoKey: true,
        projectPanel: true,
        draftKeeper: this.drafts,
        onChooseBars: (bar) => {
          this.root.querySelector<HTMLElement>(`.sce-bar-number[data-bar="${bar}"]`)?.focus();
        },
      }),
    );
    this.draftAnchor = doc.createComment("draft conflict");
    this.chrome.appendChild(this.draftAnchor);
    this.syncDraftParts();
    this.parts.push(mountCutNotice(this.chrome, this.session, { onRefused }));
    this.stalePane = pane(this.chrome);
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
    // The header is pinned only if the lane under it keeps six rows; the opening scroll must know which before it runs.
    this.syncPin();
    this.centreFirstTrack();
    const Observer = this.doc.defaultView?.ResizeObserver;
    if (Observer) {
      const observer = new Observer(() => {
        const before = this.pinWindow;
        this.syncPin();
        this.keepPinWindow(before);
        this.rememberPinWindow();
      });
      observer.observe(this.scroller);
      this.abort.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
    }
  }

  update(patch: Partial<MountOptions>): void {
    if (this.destroyed) return;
    const before = this.options;
    this.options = { ...before, ...patch };
    if (patch.language !== undefined) this.session.setView({ language: patch.language });
    if (this.options.editable !== before.editable) this.applyEditable();
    if (patch.dialects !== undefined) this.session.replaceDialects(patch.dialects);
    const store = this.draftStore();
    this.drafts.follow(store, this.options.project, (sameOriginal) => {
      if (patch.project === undefined) return;
      // While drafts are kept, the original the user is editing stays in the session; the host's other fields come in as commands.
      if (store !== null && sameOriginal) this.carry(hostChanges(before.project, patch.project));
      else this.session.replaceProject(patch.project);
    });
    this.syncDraftParts();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abort.abort();
    for (const stop of this.unsubscribe) stop();
    for (const part of [...this.parts, ...this.tracks]) part.destroy();
    this.lyricTrack?.destroy();
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

  /** The store the keeper is made for: the host's, while the editor is editable; none otherwise. */
  private draftStore(): DraftStore | null {
    return this.options.drafts !== undefined && this.editable ? this.options.drafts : null;
  }

  /** Builds the conflict strip only while a keeper exists, so an editor without a store has no draft DOM. */
  private syncDraftParts(): void {
    if (this.draftStore() !== null) {
      if (this.conflict === null) {
        const part = mountDraftConflict(this.chrome, this.session, this.drafts);
        const node = this.chrome.lastElementChild;
        if (node !== null) this.chrome.insertBefore(node, this.draftAnchor);
        this.conflict = part;
        this.parts.push(part);
      }
    } else if (this.conflict !== null) {
      this.conflict.destroy();
      const at = this.parts.indexOf(this.conflict);
      if (at >= 0) this.parts.splice(at, 1);
      this.conflict = null;
    }
  }

  /**
   * Puts the fields the host changed into the session, once a draft being read has been put there: the draft holds the
   * fields of an older project, and what the host passed after it is newer. The fields go in as one history step; a
   * value a command refuses goes to the host, and the other fields still go in.
   */
  private carry(commands: ReadonlyArray<ProjectCommand>): void {
    if (commands.length === 0) return;
    this.drafts.afterOpening(() => {
      const dialect = this.options.dialects.find(this.session.project.modelId);
      if (dialect === undefined) {
        const result = this.session.dispatchAll(commands);
        if (!result.ok) this.refused(result.diagnostics);
        return;
      }
      const accepted: ProjectCommand[] = [];
      let current = this.session.project;
      for (const command of commands) {
        const applied = applyProjectCommand(dialect, current, command);
        const refusals = applied.diagnostics.filter((diagnostic) => !isNoticeDiagnostic(diagnostic));
        if (refusals.length > 0) {
          this.refused(refusals);
          continue;
        }
        current = applied.project;
        accepted.push(command);
      }
      if (accepted.length === 0) return;
      const result = this.session.dispatchAll(accepted);
      if (!result.ok) this.refused(result.diagnostics);
    });
  }

  private applyEditable(): void {
    this.session.setView({ editable: this.editable && this.drafts.status !== "opening" });
  }

  /**
   * A command was refused and nothing changed (the user's keys caused it, or a value the host passed): tell the host
   * once, in the current language.
   */
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
    this.lyricTrack?.destroy();
    this.voices = voices;
    this.tracks = voices.map((voice) =>
      mountVoiceTrack(this.content, this.session, {
        voice,
        scroller: this.scroller,
        onRefused: (diagnostics) => this.refused(diagnostics),
      }),
    );
    this.lyricTrack =
      voices.length === 0
        ? null
        : mountLyricTrack(this.content, this.session, {
            scroller: this.scroller,
            onRefused: (diagnostics) => this.refused(diagnostics),
          });
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
    if (!arrangement) this.pinWindow = null;
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

  /** Whether the arrangement with the lane window is shown. */
  private pinShown(): boolean {
    return this.shownView === "arrangement" && !this.scroller.hidden && this.reading.kind === "score";
  }

  /** What covers the scroller's top: the header while it is sticky, and the track head. */
  private pinnedHeight(): number {
    const head = this.scroller.querySelector<HTMLElement>(".sce-track-head");
    if (!head) return 0;
    const header = this.doc.defaultView?.getComputedStyle(this.top).position === "sticky" ? this.top.offsetHeight : 0;
    return header + head.offsetHeight;
  }

  /** Remembers the lane window's centre, for the next change in the scroller's height. */
  private rememberPinWindow(): void {
    this.pinWindow = this.pinShown()
      ? { clientHeight: this.scroller.clientHeight, pinned: this.pinnedHeight(), scrollTop: this.scroller.scrollTop }
      : null;
  }

  /**
   * Keeps the content at the centre of the lane window where it was before the scroller's height changed, so chrome that
   * appears above the music does not move the notes out from under the person. The pinned height is read after the pin
   * rule, so a header that becomes static takes its 94px out of the window in the same step.
   */
  private keepPinWindow(before: { clientHeight: number; pinned: number; scrollTop: number } | null): void {
    if (!before || !this.pinShown()) return;
    const clientHeight = this.scroller.clientHeight;
    if (clientHeight === before.clientHeight) return;
    const centre = before.scrollTop + before.pinned + (before.clientHeight - before.pinned) / 2;
    const pinned = this.pinnedHeight();
    this.scroller.scrollTop = Math.max(0, centre - pinned - (clientHeight - pinned) / 2);
  }

  /**
   * Pins the header block only while the lane under it keeps six rows. Below that the 116px of pinned rows cost more than
   * they give, so `data-pin="none"` makes the header static and leaves only the track head pinned.
   */
  private syncPin(): void {
    if (!this.pinShown()) {
      this.pinWindow = null;
      return;
    }
    const top = this.top;
    const head = this.scroller.querySelector<HTMLElement>(".sce-track-head");
    const lane = this.scroller.querySelector<HTMLElement>(".sce-lane");
    if (!head || !lane) {
      this.pinWindow = null;
      return;
    }
    const rows = Number(lane.style.getPropertyValue("--sce-rows"));
    const laneHeight = lane.getBoundingClientRect().height;
    if (!(rows > 0) || laneHeight <= 0) {
      this.pinWindow = null;
      return;
    }
    const rowPixels = laneHeight / rows;
    const unpinned = this.scroller.clientHeight < top.offsetHeight + head.offsetHeight + 6 * rowPixels;
    if (unpinned) this.root.dataset.pin = "none";
    else delete this.root.dataset.pin;
  }

  private centreFirstTrack(): void {
    const { reading, scroller } = this;
    if (reading.kind !== "score" || scroller.scrollHeight <= scroller.clientHeight) {
      this.rememberPinWindow();
      return;
    }
    const voice = reading.score.voices[0];
    const lane = scroller.querySelector<HTMLElement>(".sce-lane");
    const head = scroller.querySelector<HTMLElement>(".sce-track-head");
    if (voice === undefined || !lane || !head) {
      this.rememberPinWindow();
      return;
    }
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
    const topPinned = this.doc.defaultView?.getComputedStyle(this.top).position === "sticky";
    const pinned = (topPinned ? this.top.offsetHeight : 0) + head.offsetHeight;
    scroller.scrollTop = Math.max(0, target - pinned - (scroller.clientHeight - pinned) / 2);
    this.rememberPinWindow();
  }
}

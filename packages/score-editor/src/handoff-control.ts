// ABOUTME: The toolbar's handoff control: a button that opens a review of the change log and, on confirmation, hands the score to the host.
// ABOUTME: It follows the session and the draft keeper; the change log is recomputed from the original and the current project every time it opens.
import { changeLogEntries, handoffInstruction } from "./change-log";
import type { DialectRegistry } from "./dialect";
import { create } from "./dom";
import type { DraftHandoffResult, DraftKeeperStatus } from "./draft-keeper";
import { preHandoffNotices } from "./handoff-notices";
import { messagesFor } from "./i18n";
import { anchorOf, placePopover } from "./popover-menu";
import type { SongProject } from "./score";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { HandoffPayload, Language, Notice, ProjectField } from "./types";

/** What the control needs to know at the moment it draws or hands off; null takes the control away. */
export interface HandoffSource {
  readonly original: SongProject;
  readonly title?: string;
  readonly dialects: DialectRegistry;
  readonly onHandoff: (handoff: HandoffPayload) => void;
  /** Saves the generated draft, or the score file, before the host is called. */
  readonly save: () => Promise<DraftHandoffResult>;
  /** The required inputs the host says are missing now, in the order they should be filled. */
  readonly missingRequired?: () => ReadonlyArray<ProjectField>;
  /** Opens the Project panel on one missing field, instead of the handoff review. */
  readonly openProject?: (field: ProjectField) => void;
  /** Where an unexpected rejection of the save goes, as the keeper sends its own failures. */
  readonly notify?: (notice: Notice) => void;
  /** Says a refused handoff in the toolbar's live region, once. */
  readonly say?: (words: string) => void;
  /** Draws the refused handoff's sentence in the chrome; a conflict leaves it to the conflict banner. */
  readonly notSent?: (kind: "conflict" | "failed") => void;
  /** The file name while a dirty score file is saved before the handoff; null when no line is needed. */
  readonly savesFirst?: () => string | null;
  /** The score's file for the instruction when the host's handoff travels as text; null keeps the attachment wording. */
  readonly scorePath?: () => string | null;
}

/** What the control needs from the keeper whose state it follows: the opening badge and the state changes. */
export interface HandoffKeeper {
  readonly status: DraftKeeperStatus;
  subscribe(listener: () => void): () => void;
}

export interface HandoffControl {
  destroy(): void;
  /** Redraws the trigger after the editor's options changed. */
  refresh(): void;
}

let instanceCount = 0;

/**
 * Mounts the handoff trigger on `el`, before `before` when given. `source` reads the current options so a later
 * `update` is seen; with no callback, or while the editor cannot edit, the control is hidden.
 */
export function mountHandoffControl(
  el: HTMLElement,
  session: EditingSession,
  keeper: HandoffKeeper,
  source: () => HandoffSource | null,
  before?: ChildNode | null,
): HandoffControl {
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-handoff", el);
  el.insertBefore(root, before ?? null);

  const button = create(doc, "button", "sce-button sce-handoff-button", root);
  button.type = "button";
  const popover = create(doc, "div", "sce-popover sce-handoff-popover", root);
  popover.setAttribute("popover", "auto");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "false");
  const heading = create(doc, "h2", "sce-handoff-heading", popover);
  heading.id = `sce-handoff-title-${++instanceCount}`;
  const logLabel = create(doc, "p", "sce-handoff-log-label", popover);
  logLabel.id = `sce-handoff-log-${instanceCount}`;
  const changes = create(doc, "ul", "sce-handoff-changes", popover);
  changes.setAttribute("aria-labelledby", logLabel.id);
  changes.id = `sce-handoff-list-${instanceCount}`;
  const empty = create(doc, "p", "sce-handoff-empty", popover);
  empty.id = `sce-handoff-empty-${instanceCount}`;
  const fileNote = create(doc, "p", "sce-handoff-note sce-handoff-file", popover);
  fileNote.hidden = true;
  const rejected = create(doc, "p", "sce-handoff-note", popover);
  const notices = create(doc, "div", "sce-handoff-notices", popover);
  const actions = create(doc, "div", "sce-handoff-actions", popover);
  const cancel = create(doc, "button", "sce-button", actions);
  cancel.type = "button";
  const confirm = create(doc, "button", "sce-button sce-handoff-confirm", actions);
  confirm.type = "button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.popoverTargetElement = popover;
  button.popoverTargetAction = "toggle";
  popover.setAttribute("aria-labelledby", heading.id);

  let language: Language | null = null;
  let busy = false;
  let destroyed = false;

  function missingNow(): ReadonlyArray<ProjectField> {
    return source()?.missingRequired?.() ?? [];
  }

  /** The one placement rule: under the trigger, with the room below it, and never past the window. */
  function place(): void {
    const anchor = anchorOf(button);
    const view = popover.ownerDocument.defaultView;
    const room = view === null ? undefined : Math.max(1, view.innerHeight - anchor.bottom - 12);
    placePopover(popover, anchor, room === undefined ? {} : { maxHeight: room });
  }

  function setBusy(next: boolean): void {
    busy = next;
    button.disabled = next;
    button.setAttribute("aria-busy", String(next));
    const t = messagesFor(session.view.language);
    button.textContent = next ? t.handoffSaving : t.handoffReview;
  }

  function applyLanguage(): void {
    language = session.view.language;
    const t = messagesFor(language);
    root.lang = language;
    button.textContent = t.handoffReview;
    heading.textContent = t.handoffTitle;
    logLabel.textContent = t.changeLog;
    cancel.textContent = t.handoffCancel;
    confirm.textContent = t.handoffAction;
    rejected.textContent = t.handoffRejected;
    if (busy) button.textContent = t.handoffSaving;
  }

  /** The pre-handoff notices of the project as it stands, or none while the dialect cannot read it. */
  function noticesNow(): ReadonlyArray<Notice> {
    const config = source();
    if (config === null) return [];
    const dialect = config.dialects.find(session.project.modelId) ?? config.dialects.find(config.original.modelId);
    return dialect === undefined ? [] : preHandoffNotices(dialect, session.project, session.view.language);
  }

  function renderLog(): void {
    const config = source();
    if (config === null) return;
    const t = messagesFor(session.view.language);
    const dialect = config.dialects.find(session.project.modelId) ?? config.dialects.find(config.original.modelId);
    const entries = changeLogEntries(config.original, session.project, {
      language: session.view.language,
      ...(dialect === undefined ? {} : { dialect }),
    });
    const rewritten = new Set(session.rewrittenBars);
    changes.replaceChildren(
      ...entries.map((entry) => {
        const item = create(doc, "li", "", changes);
        item.textContent = entry.text;
        if (entry.bars.some((bar) => rewritten.has(bar))) item.dataset.rewritten = "";
        return item;
      }),
    );
    changes.hidden = entries.length === 0;
    empty.hidden = entries.length > 0;
    empty.textContent = t.changeLogNone;
    notices.replaceChildren(
      ...noticesNow().map((notice) => {
        const line = create(doc, "p", "sce-handoff-note sce-handoff-notice", notices);
        line.textContent = notice.message;
        return line;
      }),
    );
    notices.hidden = notices.childElementCount === 0;
    const first = config.savesFirst?.() ?? null;
    fileNote.hidden = first === null;
    fileNote.textContent = first === null ? "" : t.handoffSavesFirst(first);
    rejected.hidden = session.rejectedText === null;
    popover.setAttribute("aria-describedby", entries.length === 0 ? empty.id : changes.id);
  }

  /** Sends each pre-handoff notice to the host once, when the review opens; redraws while it stays open send nothing. */
  function announceNotices(): void {
    const config = source();
    if (config === null) return;
    for (const notice of noticesNow()) config.notify?.(notice);
  }

  /** The trigger's normal word, so a language change and the busy state do not fight the missing-input word. */
  function buttonText(): string {
    const t = messagesFor(session.view.language);
    return busy ? t.handoffSaving : t.handoffReview;
  }

  function draw(): void {
    const config = source();
    const present = !destroyed && config !== null && session.view.editable;
    root.hidden = !present;
    if (!present && popover.matches(":popover-open")) popover.hidePopover();
    if (!present) return;
    if (session.view.language !== language) applyLanguage();
    const missing = missingNow();
    const t = messagesFor(session.view.language);
    const word =
      missing.length === 0
        ? buttonText()
        : missing.length === 1
          ? t.requiredAddOne(t.requiredInputName(missing[0] as ProjectField))
          : t.requiredAddMany(missing.length);
    button.textContent = word;
    if (missing.length > 0) button.setAttribute("aria-description", t.requiredHint);
    else button.removeAttribute("aria-description");
    if (missing.length > 0 && popover.matches(":popover-open")) popover.hidePopover();
    if (popover.matches(":popover-open")) renderLog();
  }

  popover.addEventListener(
    "beforetoggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      if (open) {
        const missing = missingNow();
        const first = missing[0];
        if (first !== undefined) {
          event.preventDefault();
          // A popover cannot open while another show operation is running; this one is being cancelled.
          setTimeout(() => {
            if (!destroyed) source()?.openProject?.(first);
          }, 0);
          return;
        }
      }
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      place();
    },
    { signal },
  );
  popover.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      renderLog();
      announceNotices();
      place();
      cancel.focus();
    },
    { signal },
  );
  cancel.addEventListener("click", () => popover.hidePopover(), { signal });
  popover.addEventListener(
    "focusout",
    (event) => {
      const next = (event as FocusEvent).relatedTarget;
      // A press on plain text inside the review moves focus to nothing; that is not leaving it.
      if (!(next instanceof Node)) return;
      if (popover.contains(next) || button.contains(next)) return;
      popover.hidePopover();
    },
    { signal },
  );

  function payloadOf(config: HandoffSource): HandoffPayload {
    const dialect = config.dialects.find(session.project.modelId) ?? config.dialects.find(config.original.modelId);
    const scorePath = config.scorePath?.() ?? null;
    return {
      attachment: { name: "score.abc", mediaType: "text/plain", text: session.project.score },
      instruction: handoffInstruction({
        original: config.original,
        current: session.project,
        language: session.view.language,
        ...(config.title === undefined ? {} : { title: config.title }),
        ...(dialect === undefined ? {} : { dialect }),
        ...(scorePath === null ? {} : { scorePath }),
      }),
      project: session.project,
    };
  }

  async function handOff(): Promise<void> {
    if (busy || destroyed) return;
    const config = source();
    if (config === null || !session.view.editable) return;
    // The review shows this project; the save must not race an edit made while it is pending.
    const handoff = payloadOf(config);
    popover.hidePopover();
    setBusy(true);
    let result: "written" | "unchanged" | "conflict" | "failed";
    try {
      result = await config.save();
    } catch {
      const t = messagesFor(session.view.language);
      if (!destroyed) {
        config.notify?.({ code: "draft-save-failed", level: "error", message: t.draftSaveFailed });
        config.notify?.({ code: "handoff-not-sent", level: "warning", message: t.handoffNotSentFailed });
        config.say?.(t.handoffNotSentFailed);
        config.notSent?.("failed");
      }
      if (!destroyed) setBusy(false);
      return;
    }
    if (!destroyed) setBusy(false);
    if (destroyed) return;
    // A conflict goes to the conflict strip and a failure to the keeper's own notice; neither hands off.
    if (result === "written" || result === "unchanged") {
      config.onHandoff(handoff);
      return;
    }
    const t = messagesFor(session.view.language);
    const message = result === "conflict" ? t.handoffNotSentConflict : t.handoffNotSentFailed;
    config.notify?.({ code: "handoff-not-sent", level: "warning", message });
    config.say?.(message);
    config.notSent?.(result === "conflict" ? "conflict" : "failed");
  }

  confirm.addEventListener("click", () => void handOff(), { signal });

  draw();
  const unsubscribeSession = session.subscribe(draw);
  const unsubscribeKeeper = keeper.subscribe(draw);

  return {
    refresh: draw,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribeSession();
      unsubscribeKeeper();
      root.remove();
      releaseStyles();
    },
  };
}

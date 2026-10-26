// ABOUTME: The toolbar's handoff control: a button that opens a review of the change log and, on confirmation, hands the score to the host.
// ABOUTME: It follows the session and the draft keeper; the change log is recomputed from the original and the current project every time it opens.
import { changeLog, handoffInstruction } from "./change-log";
import type { DialectRegistry } from "./dialect";
import { create } from "./dom";
import type { DraftKeeper } from "./draft-keeper";
import { messagesFor } from "./i18n";
import { keepInside, placeUnder } from "./popover-menu";
import type { SongProject } from "./score";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { HandoffPayload, Language, Notice } from "./types";

/** What the control needs to know at the moment it draws or hands off; null takes the control away. */
export interface HandoffSource {
  readonly original: SongProject;
  readonly title?: string;
  readonly dialects: DialectRegistry;
  readonly onHandoff: (handoff: HandoffPayload) => void;
  /** Where an unexpected rejection of the save goes, as the keeper sends its own failures. */
  readonly notify?: (notice: Notice) => void;
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
  keeper: DraftKeeper,
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
  const rejected = create(doc, "p", "sce-handoff-note", popover);
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

  function renderLog(): void {
    const config = source();
    if (config === null) return;
    const t = messagesFor(session.view.language);
    const dialect = config.dialects.find(session.project.modelId) ?? config.dialects.find(config.original.modelId);
    const entries = changeLog(config.original, session.project, {
      language: session.view.language,
      ...(dialect === undefined ? {} : { dialect }),
    });
    changes.replaceChildren(
      ...entries.map((entry) => {
        const item = create(doc, "li", "", changes);
        item.textContent = entry;
        return item;
      }),
    );
    changes.hidden = entries.length === 0;
    empty.hidden = entries.length > 0;
    empty.textContent = t.changeLogNone;
    rejected.hidden = session.rejectedText === null;
    popover.setAttribute("aria-describedby", entries.length === 0 ? empty.id : changes.id);
  }

  function draw(): void {
    const config = source();
    const present = !destroyed && config !== null && session.view.editable;
    root.hidden = !present;
    if (!present && popover.matches(":popover-open")) popover.hidePopover();
    if (!present) return;
    if (session.view.language !== language) applyLanguage();
    if (popover.matches(":popover-open")) renderLog();
  }

  popover.addEventListener(
    "beforetoggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      const view = popover.ownerDocument.defaultView;
      const room =
        view === null ? undefined : Math.max(0, view.innerHeight - button.getBoundingClientRect().bottom - 12);
      placeUnder(popover, button, room === undefined ? {} : { maxHeight: room });
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
      keepInside(popover);
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
    return {
      attachment: { name: "score.abc", mediaType: "text/plain", text: session.project.score },
      instruction: handoffInstruction({
        original: config.original,
        current: session.project,
        language: session.view.language,
        ...(config.title === undefined ? {} : { title: config.title }),
        ...(dialect === undefined ? {} : { dialect }),
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
      result = await keeper.handoff();
    } catch {
      const t = messagesFor(session.view.language);
      if (!destroyed) {
        config.notify?.({ code: "draft-save-failed", level: "error", message: t.draftSaveFailed });
      }
      if (!destroyed) setBusy(false);
      return;
    }
    if (!destroyed) setBusy(false);
    if (destroyed) return;
    // A conflict goes to the conflict strip and a failure to the keeper's own notice; neither hands off.
    if (result === "written" || result === "unchanged") config.onHandoff(handoff);
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

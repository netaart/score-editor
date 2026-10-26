// ABOUTME: The toolbar's handoff control: a button that opens a review of the change log and, on confirmation, hands the score to the host.
// ABOUTME: It follows the session and the draft keeper; the change log is recomputed from the original and the current project every time it opens.
import { changeLog, handoffInstruction } from "./change-log";
import type { DialectRegistry } from "./dialect";
import { create } from "./dom";
import type { DraftKeeper } from "./draft-keeper";
import { messagesFor } from "./i18n";
import { nudgeIntoWindow, placeUnder } from "./popover-menu";
import type { SongProject } from "./score";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { HandoffPayload, Language } from "./types";

/** What the control needs to know at the moment it draws or hands off; null takes the control away. */
export interface HandoffSource {
  readonly original: SongProject;
  readonly title?: string;
  readonly dialects: DialectRegistry;
  readonly onHandoff: (handoff: HandoffPayload) => void;
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
  const empty = create(doc, "p", "sce-handoff-empty", popover);
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
  }

  function draw(): void {
    const config = source();
    const present = config !== null;
    root.hidden = !present;
    if (!present && popover.matches(":popover-open")) popover.hidePopover();
    if (!present) return;
    if (session.view.language !== language) applyLanguage();
    if (popover.matches(":popover-open")) renderLog();
  }

  popover.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState === "open") placeUnder(button, popover);
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
      nudgeIntoWindow(popover);
      cancel.focus();
    },
    { signal },
  );
  cancel.addEventListener("click", () => popover.hidePopover(), { signal });

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
    if (busy) return;
    const config = source();
    if (config === null) return;
    popover.hidePopover();
    busy = true;
    try {
      // No keeper means no store was given: there is nowhere to save a draft, so the host still gets the handoff.
      if (keeper.status !== "destroyed") {
        const result = await keeper.handoff();
        if (result !== "written" && result !== "unchanged") return;
      }
      config.onHandoff(payloadOf(config));
    } finally {
      busy = false;
    }
  }

  confirm.addEventListener("click", () => void handOff(), { signal });

  draw();
  const unsubscribeSession = session.subscribe(draw);
  const unsubscribeKeeper = keeper.subscribe(draw);

  let destroyed = false;
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

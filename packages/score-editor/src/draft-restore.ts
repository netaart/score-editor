// ABOUTME: The Restore original control of the toolbar: a button that opens a question in the editor's own popover, then puts the original back.
// ABOUTME: It is there only while a draft keeper is ready and the session is editable; the keeper does the restoring and clears the draft.

import { create } from "./dom";
import type { DraftKeeperStatus } from "./draft-keeper";
import { messagesFor } from "./i18n";
import { anchorOf, keepInside, placeUnder } from "./popover-menu";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/** What the Restore control needs: the state it waits for, its changes, and the restore action. */
export interface RestoreKeeper {
  readonly status: DraftKeeperStatus | "clean" | "dirty" | "saving";
  subscribe(listener: () => void): () => void;
  restoreOriginal(): Promise<boolean>;
  /** Whether there is anything to restore; a score file with no unsaved change is muted. Defaults to true. */
  canRestore?: () => boolean;
}

/**
 * Mounts the Restore original button and its question on `el`, before `before` when given; `say` is how the toolbar
 * tells a screen reader the outcome. `savedVersion` is the score-file wording, where there is no draft and the target
 * is the last saved version. The design is in DESIGN.md, "Restore original".
 */
export function mountRestoreControl(
  el: HTMLElement,
  session: EditingSession,
  keeper: RestoreKeeper,
  say: (words: string) => void,
  before?: ChildNode | null,
  savedVersion = false,
): ViewPart {
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-restore");
  el.insertBefore(root, before ?? null);

  const button = create(doc, "button", "sce-button sce-restore-button", root);
  button.type = "button";
  const popover = create(doc, "div", "sce-popover sce-restore-popover", root);
  popover.setAttribute("popover", "auto");
  popover.setAttribute("role", "dialog");
  const question = create(doc, "p", "sce-restore-question", popover);
  const warning = create(doc, "p", "sce-restore-warning", popover);
  const actions = create(doc, "div", "sce-restore-actions", popover);
  const cancel = create(doc, "button", "sce-button", actions);
  cancel.type = "button";
  const confirm = create(doc, "button", "sce-button sce-restore-confirm", actions);
  confirm.type = "button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.popoverTargetElement = popover;
  button.popoverTargetAction = "toggle";

  popover.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      if (!canRestore()) {
        event.preventDefault();
        return;
      }
      placeUnder(anchorOf(button), popover);
    },
    { signal },
  );
  popover.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      keepInside(popover, anchorOf(button));
      cancel.focus();
    },
    { signal },
  );
  cancel.addEventListener("click", () => popover.hidePopover(), { signal });
  let destroyed = false;
  confirm.addEventListener(
    "click",
    () => {
      popover.hidePopover();
      void keeper.restoreOriginal().then((cleared) => {
        if (destroyed) return;
        const t = messagesFor(session.view.language);
        say(cleared ? (savedVersion ? t.restoreSavedDone : t.restoreDone) : t.restoreNotCleared);
      });
    },
    { signal },
  );

  function canRestore(): boolean {
    return keeper.canRestore?.() ?? true;
  }

  let language: Language | null = null;
  function applyLanguage(): void {
    language = session.view.language;
    const t = messagesFor(language);
    root.lang = language;
    button.textContent = t.restoreOriginal;
    const asked = savedVersion ? t.restoreSavedQuestion : t.restoreQuestion;
    popover.setAttribute("aria-label", asked);
    popover.setAttribute("aria-description", savedVersion ? t.restoreSavedWarning : t.restoreWarning);
    question.textContent = asked;
    warning.textContent = savedVersion ? t.restoreSavedWarning : t.restoreWarning;
    cancel.textContent = t.restoreCancel;
    confirm.textContent = savedVersion ? t.restoreSavedConfirm : t.restoreOriginal;
  }

  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    const { status } = keeper;
    const present =
      session.view.editable &&
      (savedVersion ? status !== "opening" && status !== "destroyed" : status === "ready" || status === "conflict");
    root.hidden = !present;
    button.setAttribute("aria-disabled", String(savedVersion && !canRestore()));
    if (!present && popover.matches(":popover-open")) popover.hidePopover();
  }

  draw();
  const unsubscribeSession = session.subscribe(draw);
  const unsubscribeKeeper = keeper.subscribe(draw);
  return {
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

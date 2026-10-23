// ABOUTME: The Restore original control of the toolbar: a button that opens a question in the editor's own popover, then puts the original back.
// ABOUTME: It is there only while a draft keeper is ready and the session is editable; the keeper does the restoring and clears the draft.

import { create } from "./dom";
import type { DraftKeeper } from "./draft-keeper";
import { messagesFor } from "./i18n";
import { nudgeIntoWindow, placeUnder } from "./popover-menu";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/**
 * Mounts the Restore original button and its question on `el`. The restore resets the history, so the edits it drops cannot
 * be undone; the question, a native popover so that it stacks above a host's full-screen layer, says so and starts with
 * the focus on Cancel. `say` is how the toolbar tells a screen reader that the original is back.
 */
export function mountRestoreControl(
  el: HTMLElement,
  session: EditingSession,
  keeper: DraftKeeper,
  say: (words: string) => void,
): ViewPart {
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-restore");
  el.appendChild(root);

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
      nudgeIntoWindow(popover);
      cancel.focus();
    },
    { signal },
  );
  cancel.addEventListener("click", () => popover.hidePopover(), { signal });
  confirm.addEventListener(
    "click",
    () => {
      popover.hidePopover();
      void keeper.restoreOriginal();
      say(messagesFor(session.view.language).restoreDone);
    },
    { signal },
  );

  let language: Language | null = null;
  function applyLanguage(): void {
    language = session.view.language;
    const t = messagesFor(language);
    root.lang = language;
    button.textContent = t.restoreOriginal;
    popover.setAttribute("aria-label", t.restoreQuestion);
    popover.setAttribute("aria-description", t.restoreWarning);
    question.textContent = t.restoreQuestion;
    warning.textContent = t.restoreWarning;
    cancel.textContent = t.restoreCancel;
    confirm.textContent = t.restoreOriginal;
  }

  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    const { status } = keeper;
    const present = session.view.editable && (status === "ready" || status === "conflict");
    root.hidden = !present;
    if (!present && popover.matches(":popover-open")) popover.hidePopover();
  }

  draw();
  const unsubscribeSession = session.subscribe(draw);
  const unsubscribeKeeper = keeper.subscribe(draw);
  let destroyed = false;
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

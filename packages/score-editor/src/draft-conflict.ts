// ABOUTME: The draft conflict view part: the strip that says another writer changed the draft first, with the two ways out and what each does.
// ABOUTME: It follows the keeper's status and never takes the focus; while it stands the editor goes on editing and the keeper writes nothing.

import { create, requireDom } from "./dom";
import type { DraftKeeper } from "./draft-keeper";
import { messagesFor } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/**
 * Mounts the conflict strip on `el`, bound to `keeper`. A host puts it between the toolbar and the views. It is hidden
 * until the keeper's status is `"conflict"`; then it says that the draft was changed somewhere else and offers the
 * keeper's two ways out, each with a sentence on what it does. The sentence is an alert and the strip takes no focus, so
 * a person in the middle of an edit is told and not interrupted. It follows the session's language.
 */
export function mountDraftConflict(el: HTMLElement, session: EditingSession, keeper: DraftKeeper): ViewPart {
  requireDom("mountDraftConflict");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-draft-conflict");
  el.appendChild(root);

  const abort = new AbortController();
  const { signal } = abort;
  const strip = create(doc, "div", "sce-notice sce-draft-conflict", root);
  strip.setAttribute("role", "group");
  const sentence = create(doc, "p", "sce-draft-conflict-text", strip);
  sentence.setAttribute("role", "alert");
  const choices = create(doc, "div", "sce-draft-choices", strip);

  /**
   * A button of two lines: what it is, and under it what it does, so the cost is inside the thing that is pressed. A
   * screen reader gets the second line as the button's description, and not twice.
   */
  const choice = (act: () => Promise<void>) => {
    const button = create(doc, "button", "sce-button sce-draft-choice", choices);
    button.type = "button";
    const label = create(doc, "span", "sce-draft-label", button);
    const note = create(doc, "span", "sce-draft-note", button);
    note.setAttribute("aria-hidden", "true");
    button.addEventListener("click", () => void run(act), { signal });
    return { button, label, note };
  };

  /** One way out at a time: a second press while the first is being answered by the store does nothing. */
  let busy = false;
  const buttons: HTMLButtonElement[] = [];
  async function run(act: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    for (const button of buttons) button.setAttribute("aria-disabled", "true");
    try {
      await act();
    } finally {
      busy = false;
      for (const button of buttons) button.setAttribute("aria-disabled", "false");
    }
  }

  const overwrite = choice(() => keeper.overwrite());
  const loadTheirs = choice(() => keeper.loadTheirs());
  buttons.push(overwrite.button, loadTheirs.button);
  for (const button of buttons) button.setAttribute("aria-disabled", "false");

  let language: Language | null = null;
  function applyLanguage(): void {
    language = session.view.language;
    const t = messagesFor(language);
    root.lang = language;
    strip.setAttribute("aria-label", t.draftConflict);
    sentence.textContent = t.draftConflictText;
    for (const [part, label, note] of [
      [overwrite, t.draftOverwrite, t.draftOverwriteNote],
      [loadTheirs, t.draftLoadTheirs, t.draftLoadTheirsNote],
    ] as const) {
      part.label.textContent = label;
      part.button.setAttribute("aria-description", note);
      part.note.textContent = note;
    }
  }

  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    strip.hidden = keeper.status !== "conflict";
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

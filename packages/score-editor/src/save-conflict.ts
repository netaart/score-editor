// ABOUTME: The score-file conflict strip: the draft conflict's shape and choices, for a file another writer changed first.
// ABOUTME: It follows the score-file keeper and never takes the focus; while it stands the editor goes on editing and saves nothing.
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import { revealConflictInChrome } from "./reveal-conflict";
import type { ScoreFileKeeper } from "./score-source";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/** Mounts the score-file conflict strip on `el`, bound to `keeper`; see DESIGN.md, "Draft conflict strip". */
export function mountSaveConflict(el: HTMLElement, session: EditingSession, keeper: ScoreFileKeeper): ViewPart {
  requireDom("mountSaveConflict");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-save-conflict");
  el.appendChild(root);

  const abort = new AbortController();
  const { signal } = abort;
  const strip = create(doc, "div", "sce-notice sce-draft-conflict sce-save-conflict", root);
  strip.setAttribute("role", "group");
  const sentence = create(doc, "p", "sce-draft-conflict-text", strip);
  sentence.setAttribute("role", "alert");
  const choices = create(doc, "div", "sce-draft-choices", strip);

  /** A button of two lines, as the draft conflict's choices: what it is, and what it does. */
  const choice = (act: () => Promise<void>) => {
    const button = create(doc, "button", "sce-button sce-draft-choice", choices);
    button.type = "button";
    const label = create(doc, "span", "sce-draft-label", button);
    const note = create(doc, "span", "sce-draft-note", button);
    note.setAttribute("aria-hidden", "true");
    button.addEventListener("click", () => void run(act), { signal });
    return { button, label, note };
  };

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
    strip.setAttribute("aria-label", t.saveConflict);
    sentence.textContent = t.saveConflictText;
    for (const [part, label, note] of [
      [overwrite, t.saveOverwrite, t.saveOverwriteNote],
      [loadTheirs, t.saveLoadTheirs, t.saveLoadTheirsNote],
    ] as const) {
      part.label.textContent = label;
      part.button.setAttribute("aria-description", note);
      part.note.textContent = note;
    }
  }

  let visible = false;
  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    const next = keeper.status === "conflict";
    strip.hidden = !next;
    if (next && !visible) revealConflictInChrome(strip);
    visible = next;
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

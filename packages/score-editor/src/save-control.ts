// ABOUTME: The toolbar control of a score source: Save with the file's unsaved state, or Save as for a generated score.
// ABOUTME: It follows the score-file keeper; Ctrl/Cmd+S saves only while the focus is inside the editor it was given.
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import { lineIcon } from "./icons";
import type { ScoreFileKeeper } from "./score-source";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/** What the control needs: a file keeper, a save-as callback, or neither (it then draws nothing). */
export interface ScoreSourceControlOptions {
  /** The score-file keeper, while the source is a file. */
  keeper?: ScoreFileKeeper | null;
  /** Reads the host's save-as callback; a generated score shows the entry when it answers one. */
  saveAs?: () => ((text: string) => void) | undefined;
  /** The element whose focus makes Ctrl/Cmd+S the editor's, not the browser's or the host's. */
  scope: HTMLElement;
  /** Where in `el` the part goes; the toolbar's right-hand group puts it before the view switch. */
  before?: ChildNode | null;
}

/**
 * Mounts the Save / Save as control on `el`. It is hidden when the source is a generated score and the host gave no
 * save-as callback. The design is in DESIGN.md, "Score source, save and save as".
 */
export function mountScoreSourceControl(
  el: HTMLElement,
  session: EditingSession,
  options: ScoreSourceControlOptions,
): ViewPart {
  requireDom("mountScoreSourceControl");
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-save", el);
  el.insertBefore(root, options.before ?? null);

  const button = create(doc, "button", "sce-button sce-save-button", root);
  button.type = "button";
  // A floppy outline, so the compact phone version still says what the control is.
  button.appendChild(
    lineIcon(doc, ["3,2.5 13,2.5 13,12.5 3,12.5", "6,2.5 6,6.5 10,6.5 10,2.5", "5.5,8.5 10.5,8.5 10.5,12.5 5.5,12.5"]),
  );
  const label = create(doc, "span", "sce-save-label", button);
  const dot = create(doc, "span", "sce-save-dot", button);
  dot.setAttribute("aria-hidden", "true");
  dot.hidden = true;
  const state = create(doc, "span", "sce-save-state", root);
  state.hidden = true;

  const keeper = options.keeper ?? null;
  const saveAs = options.saveAs;

  /** The toolbar is 320px wide on a small phone: the word and the pill give way to the icon and its dot. */
  function syncCompact(): void {
    root.dataset.compact = String(options.scope.clientWidth < 360);
  }
  syncCompact();
  const Observer = doc.defaultView?.ResizeObserver;
  if (Observer) {
    const observer = new Observer(syncCompact);
    observer.observe(options.scope);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }

  /** Saves the file, or hands the current text to the host's save-as callback. */
  function act(): void {
    if (keeper !== null) {
      if (keeper.status === "clean" || keeper.status === "dirty") void keeper.save();
      return;
    }
    const callback = saveAs?.();
    if (callback !== undefined) callback(session.project.score);
  }

  button.addEventListener(
    "click",
    () => {
      if (keeper !== null && (keeper.status === "saving" || keeper.status === "conflict")) return;
      act();
    },
    { signal },
  );

  // The editor's own save shortcut. Outside the editor the browser's and the host's own shortcuts are untouched.
  options.scope.addEventListener(
    "keydown",
    (event) => {
      if (keeper === null || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s")
        return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      if (keeper.status === "clean" || keeper.status === "dirty") void keeper.save();
    },
    { signal, capture: true },
  );

  let language: Language | null = null;
  let drawn = "";
  function draw(): void {
    const callback = keeper === null ? saveAs?.() : undefined;
    const present = keeper !== null || callback !== undefined;
    root.hidden = !present || !session.view.editable;
    if (!present || !session.view.editable) return;
    if (session.view.language !== language) {
      language = session.view.language;
      drawn = "";
    }
    const t = messagesFor(session.view.language);
    const status = keeper?.status ?? "clean";
    const unsaved = keeper?.unsaved ?? false;
    const failed = keeper?.failed ?? false;
    const shown = `${language}:${keeper === null ? "save-as" : `${status}:${unsaved}:${failed}`}`;
    if (shown === drawn) return;
    drawn = shown;
    if (keeper === null) {
      root.dataset.kind = "save-as";
      label.textContent = t.saveAs;
      button.title = t.saveAsScoreFile;
      button.setAttribute("aria-label", t.saveAsScoreFile);
      button.removeAttribute("aria-keyshortcuts");
      button.removeAttribute("aria-disabled");
      state.hidden = true;
      dot.hidden = true;
      return;
    }
    root.dataset.kind = "save";
    label.textContent = status === "saving" ? t.saving : t.save;
    button.title = `${t.save} (Ctrl/Cmd+S)`;
    button.setAttribute("aria-label", status === "saving" ? t.saving : t.save);
    if (unsaved) button.setAttribute("aria-description", t.unsaved);
    else button.removeAttribute("aria-description");
    dot.hidden = !unsaved;
    button.setAttribute("aria-keyshortcuts", "Control+S Meta+S");
    button.setAttribute("aria-busy", String(status === "saving"));
    button.setAttribute("aria-disabled", String(status === "saving" || status === "conflict" || !unsaved));
    state.hidden = status === "clean" || status === "destroyed";
    state.textContent = failed && status !== "saving" ? t.saveFailed : status === "saving" ? t.saving : t.unsaved;
    state.dataset.state = failed ? "failed" : status;
    root.dataset.unsaved = String(unsaved);
  }

  draw();
  const unsubscribeSession = session.subscribe((change) => {
    if (change.project || change.view) draw();
  });
  const unsubscribeKeeper = keeper?.subscribe(draw);
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribeSession();
      unsubscribeKeeper?.();
      root.remove();
      releaseStyles();
    },
  };
}

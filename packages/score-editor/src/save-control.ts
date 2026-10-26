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
  /** Says a save result once, in the toolbar's live region. */
  say?: (words: string) => void;
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
  const mark = create(doc, "span", "sce-save-mark", button);
  mark.setAttribute("aria-hidden", "true");
  mark.hidden = true;
  const state = create(doc, "span", "sce-save-state", root);
  state.setAttribute("aria-hidden", "true");
  state.hidden = true;

  const keeper = options.keeper ?? null;
  const saveAs = options.saveAs;
  let awaitingSave = false;

  const toolbar = (): HTMLElement => options.scope.querySelector<HTMLElement>(".sce-toolbar") ?? options.scope;
  const heightNow = (): number => toolbar().offsetHeight;

  /** Saves the file, or hands the current text to the host's save-as callback. */
  function act(): void {
    if (keeper !== null) {
      if (keeper.status !== "clean" && keeper.status !== "dirty") return;
      awaitingSave = true;
      void keeper.save();
      return;
    }
    const callback = saveAs?.();
    if (callback !== undefined) callback(session.project.score);
  }

  button.addEventListener(
    "click",
    () => {
      if (keeper !== null && (keeper.status === "saving" || keeper.status === "conflict" || !keeper.unsaved)) return;
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
      if (keeper.status === "clean" || keeper.status === "dirty") act();
    },
    { signal, capture: true },
  );

  /** The action word, the state word and the fallback mark for one status; all in the current language. */
  function wordsFor(status: string, unsaved: boolean, failed: boolean, language: Language) {
    const t = messagesFor(language);
    const failure = failed && status !== "saving";
    const saving = status === "saving";
    const action = saving ? t.saving : failure ? t.saveAgain : t.save;
    const stateWord =
      saving || status === "clean" || status === "destroyed" || !unsaved ? "" : failure ? t.saveFailed : t.unsaved;
    const markWord = saving ? "…" : failure ? "!" : status === "conflict" ? "?" : unsaved ? "•" : "";
    const description = failure
      ? t.scoreSaveFailed
      : saving
        ? t.saving
        : status === "conflict"
          ? t.unsaved
          : unsaved
            ? t.unsaved
            : "";
    return { t, failure, saving, action, stateWord, markWord, description };
  }

  let language: Language | null = null;
  let drawn = "";
  let lastWidth = -1;

  function draw(): void {
    const callback = keeper === null ? saveAs?.() : undefined;
    const present = keeper !== null || callback !== undefined;
    root.hidden = !present || !session.view.editable;
    if (!present || !session.view.editable) {
      return;
    }
    if (session.view.language !== language) {
      language = session.view.language;
      drawn = "";
    }
    if (options.scope.clientWidth !== lastWidth) {
      lastWidth = options.scope.clientWidth;
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
      root.dataset.compact = String(options.scope.clientWidth < 360);
      root.dataset.word = "false";
      label.textContent = t.saveAs;
      button.title = t.saveAsScoreFile;
      button.setAttribute("aria-label", t.saveAsScoreFile);
      button.removeAttribute("aria-keyshortcuts");
      button.removeAttribute("aria-disabled");
      state.hidden = true;
      mark.hidden = true;
      return;
    }

    root.dataset.kind = "save";
    const { failure, saving, action, stateWord, markWord, description } = wordsFor(
      status,
      unsaved,
      failed,
      session.view.language,
    );
    label.textContent = action;
    button.title = failure ? `${t.saveAgain} (Ctrl/Cmd+S). ${t.scoreSaveFailed}` : `${t.save} (Ctrl/Cmd+S)`;
    button.setAttribute("aria-label", action);
    if (description !== "") button.setAttribute("aria-description", description);
    else button.removeAttribute("aria-description");
    button.setAttribute("aria-keyshortcuts", "Control+S Meta+S");
    button.setAttribute("aria-busy", String(saving));
    button.setAttribute("aria-disabled", String(saving || status === "conflict" || !unsaved));
    state.textContent = stateWord;
    state.dataset.state = failure ? "failed" : unsaved ? "dirty" : status;
    mark.textContent = markWord;

    // Decide by measured fit in the element: never by a fixed window breakpoint. Start from the icon and no state word.
    root.dataset.compact = "true";
    root.dataset.word = "false";
    state.hidden = true;
    mark.hidden = true;
    const iconHeight = heightNow();
    root.dataset.compact = "false";
    const labelHeight = heightNow();
    if (labelHeight > iconHeight) {
      root.dataset.compact = "true";
      root.dataset.word = "false";
      state.hidden = true;
      mark.hidden = markWord === "";
    } else if (stateWord === "") {
      root.dataset.word = "false";
      state.hidden = true;
      mark.hidden = true;
    } else {
      state.hidden = false;
      root.dataset.word = "true";
      const stateHeight = heightNow();
      if (stateHeight > labelHeight) {
        root.dataset.word = "false";
        state.hidden = true;
        mark.hidden = false;
      } else {
        mark.hidden = true;
      }
    }
    root.dataset.unsaved = String(unsaved);

    if (awaitingSave && status !== "saving") {
      awaitingSave = false;
      if (failed) options.say?.(t.scoreSaveFailed);
      else if (status === "clean" && !unsaved) options.say?.(t.saveSaved);
    }
  }

  draw();
  const unsubscribeSession = session.subscribe((change) => {
    if (change.project || change.view) draw();
  });
  const unsubscribeKeeper = keeper?.subscribe(draw);
  const Observer = doc.defaultView?.ResizeObserver;
  if (Observer) {
    const observer = new Observer(() => {
      if (options.scope.clientWidth !== lastWidth) draw();
    });
    observer.observe(options.scope);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }
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

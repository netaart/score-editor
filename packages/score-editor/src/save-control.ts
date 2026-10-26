// ABOUTME: The toolbar control of a score source: Save with the file's unsaved state, or Save as for a generated score.
// ABOUTME: It follows the score-file keeper; Ctrl/Cmd+S saves only while the focus is inside the editor it was given.
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import { lineIcon } from "./icons";
import type { ScoreFileHandoffResult, ScoreFileKeeper } from "./score-source";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/** The control as a part, with the host's save action on the same path as its button. */
export interface ScoreSourceControl extends ViewPart {
  /**
   * Saves a score file now. Resolves `saved` when the host write succeeds, `unchanged` when there is nothing to write
   * (no keeper, a generated score, read-only, a save already in flight, a conflict, or after destroy), else `conflict`
   * or `failed` from the keeper.
   */
  save(): Promise<ScoreFileHandoffResult>;
}

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
): ScoreSourceControl {
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
  let destroyed = false;

  // The room the form is chosen from is the bar's: Save sits there with the view switch and the preview control, and a
  // wider state must not wrap that bar.
  const toolbar = (): HTMLElement =>
    options.scope.querySelector<HTMLElement>(".sce-bar") ??
    options.scope.querySelector<HTMLElement>(".sce-toolbar") ??
    options.scope;
  const heightNow = (): number => toolbar().offsetHeight;

  /** The one score-file save path: the Save button, Ctrl/Cmd+S and `save()` all come through here. */
  async function saveFile(): Promise<ScoreFileHandoffResult> {
    if (destroyed || keeper === null || !session.view.editable) return "unchanged";
    if (keeper.status !== "clean" && keeper.status !== "dirty") return "unchanged";
    if (!keeper.unsaved) return "unchanged";
    awaitingSave = true;
    const result = await keeper.save();
    return result.ok ? "saved" : result.reason;
  }

  /** Saves the file, or hands the current text to the host's save-as callback. */
  function act(): void {
    if (keeper !== null) {
      void saveFile();
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
  /** The one form this box, language and font metrics get; null until the first draw. */
  let form: "words" | "icon" | null = null;
  let formKey = "";

  // A fixed string in the button's font, measured off the layout: when the font metrics move, the width moves.
  const fontCanvas = doc.createElement("canvas").getContext("2d");
  let probeFont = "";
  function metricWidth(): number {
    if (fontCanvas === null) return 0;
    const style = doc.defaultView?.getComputedStyle(button);
    if (style === undefined) return 0;
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (font !== probeFont) {
      probeFont = font;
      fontCanvas.font = font;
    }
    return fontCanvas.measureText("Save again Save failed Saving… Unsaved 重新保存 保存失败 保存中… 未保存").width;
  }

  /** What the form is chosen from: the box, the language and the font metrics, never the save state. */
  function formKeyNow(): string {
    return `${toolbar().clientWidth}\u0000${session.view.language}\u0000${metricWidth()}`;
  }

  /** The words of the five save states, whose widest sets the room the one form needs. */
  function wordCandidates(forLanguage: Language): Array<{ action: string; stateWord: string }> {
    return [
      wordsFor("clean", false, false, forLanguage),
      wordsFor("dirty", true, false, forLanguage),
      wordsFor("saving", true, false, forLanguage),
      wordsFor("dirty", true, true, forLanguage),
      wordsFor("conflict", true, false, forLanguage),
    ].map(({ action, stateWord }) => ({ action, stateWord }));
  }

  /**
   * Picks one form for the box from the widest state's words. The toolbar is measured with the control hidden, so the
   * room is the toolbar's own and not a window breakpoint; words are kept only while every state's words leave that
   * height alone, and otherwise every state uses the icon and its mark. Measured again only for a new form key.
   */
  function chooseForm(key: string): "words" | "icon" {
    root.hidden = true;
    const base = heightNow();
    root.hidden = false;
    let widest = base;
    for (const candidate of wordCandidates(session.view.language)) {
      root.dataset.compact = "false";
      root.dataset.word = candidate.stateWord === "" ? "false" : "true";
      label.textContent = candidate.action;
      state.textContent = candidate.stateWord;
      state.hidden = candidate.stateWord === "";
      mark.hidden = true;
      widest = Math.max(widest, heightNow());
    }
    formKey = key;
    return widest > base ? "icon" : "words";
  }

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
    if (keeper === null) {
      const shown = `${language}:save-as`;
      if (shown === drawn) return;
      drawn = shown;
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

    const status = keeper.status;
    const unsaved = keeper.unsaved;
    const failed = keeper.failed;
    const key = formKeyNow();
    let measured = false;
    if (form === null || key !== formKey) {
      form = chooseForm(key);
      measured = true;
    }
    const shown = `${language}:${status}:${unsaved}:${failed}:${form}`;
    if (!measured && shown === drawn) return;
    drawn = shown;

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

    root.dataset.compact = form === "icon" ? "true" : "false";
    if (form === "icon") {
      root.dataset.word = "false";
      state.hidden = true;
      mark.hidden = markWord === "";
    } else {
      root.dataset.word = stateWord === "" ? "false" : "true";
      state.hidden = stateWord === "";
      mark.hidden = true;
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
    const observer = new Observer(() => draw());
    observer.observe(options.scope);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }
  // Fonts can arrive after the first draw, and then the room the words need has changed under the chosen form.
  const fonts = doc.fonts;
  if (fonts !== undefined) {
    const onFonts = () => {
      form = null;
      draw();
    };
    fonts.addEventListener("loadingdone", onFonts);
    signal.addEventListener("abort", () => fonts.removeEventListener("loadingdone", onFonts), { once: true });
    void fonts.ready.then(() => {
      if (signal.aborted) return;
      form = null;
      draw();
    });
  }
  return {
    save: saveFile,
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

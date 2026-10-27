// ABOUTME: The one-action banner a score-file save failure and a refused handoff draw in the chrome.
// ABOUTME: It says the sentence with role="alert", offers Save again, takes no focus, and leaves with the next successful save.
import { create } from "./dom";
import { messagesFor } from "./i18n";
import { restoreConflictInChrome, revealConflictInChrome } from "./reveal-conflict";
import type { ScoreFileKeeper } from "./score-source";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { ViewPart } from "./types";

/** What refused a handoff; a conflict already has the conflict banner, so only a failed save needs this one. */
export type SaveNoticeKind = "conflict" | "failed";

export interface SaveNoticeOptions {
  /** The one save path the Save button and Ctrl/Cmd+S use, so a retry also says Saved. */
  readonly save?: () => void;
}

export interface SaveNotice extends ViewPart {
  /** Shows the handoff's sentence on a failed save; a conflict is the conflict banner's to say. */
  notSent(kind: SaveNoticeKind): void;
}

/**
 * Mounts the save notice on `el`, bound to the score file's keeper. It stands while the keeper says its last write failed,
 * and after a handoff was not sent for that failure, until the next save succeeds.
 */
export function mountSaveNotice(
  el: HTMLElement,
  session: EditingSession,
  keeper: ScoreFileKeeper,
  options: SaveNoticeOptions = {},
): SaveNotice {
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const abort = new AbortController();
  const { signal } = abort;
  const root = create(doc, "div", "sce-root sce-part sce-part-save-notice", el);
  const strip = create(doc, "div", "sce-notice sce-draft-conflict sce-save-notice", root);
  strip.hidden = true;
  const sentence = create(doc, "p", "sce-draft-conflict-text", strip);
  sentence.setAttribute("role", "alert");
  const again = create(doc, "button", "sce-button sce-save-again", strip);
  again.type = "button";
  again.addEventListener(
    "click",
    () => {
      if (keeper.status === "saving") return;
      options.save?.();
    },
    { signal },
  );

  let notSent: SaveNoticeKind | null = null;
  let visible = false;
  let drawn = "";

  function apply(): void {
    const t = messagesFor(session.view.language);
    root.lang = session.view.language;
    sentence.textContent = notSent === "failed" ? t.handoffNotSentFailed : t.scoreSaveFailed;
    again.textContent = t.saveAgain;
    drawn = `${session.view.language}:${notSent === "failed" ? "failed" : "save"}`;
  }

  /** Shows or hides the banner, revealing it in the chrome and putting the chrome back when it leaves. */
  function present(next: boolean): void {
    if (next === visible) return;
    visible = next;
    if (next) {
      strip.hidden = false;
      revealConflictInChrome(strip);
      return;
    }
    restoreConflictInChrome(strip);
    strip.hidden = true;
  }

  function draw(): void {
    if (keeper.status === "clean" && !keeper.failed) notSent = null;
    // A conflict has its own banner, and its answer is what clears the handoff's sentence; this one never stands over it.
    if (notSent === "conflict" && keeper.status !== "conflict") notSent = null;
    const key = `${session.view.language}:${notSent === "failed" ? "failed" : "save"}`;
    if (key !== drawn) apply();
    present(keeper.status !== "conflict" && (keeper.failed || notSent === "failed"));
    again.setAttribute("aria-disabled", String(keeper.status === "saving"));
  }

  apply();
  draw();
  const unsubscribeSession = session.subscribe(draw);
  const unsubscribeKeeper = keeper.subscribe(draw);
  let destroyed = false;
  signal.addEventListener("abort", () => root.remove(), { once: true });
  return {
    notSent(kind) {
      notSent = kind;
      draw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribeSession();
      unsubscribeKeeper();
      releaseStyles();
    },
  };
}

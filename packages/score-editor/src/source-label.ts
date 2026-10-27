// ABOUTME: The toolbar's source label: says whether the score is generated (the original is kept) or a score file (saves back).
// ABOUTME: It reads the mount's source through a getter, so a source that changes after Save as is shown without a remount.
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { ScoreSource, ViewPart } from "./types";

/** What the label reads besides its session: the mount's current source, and where in `el` to stand. */
export interface SourceLabelOptions {
  /** The host's source; absent or `{ kind: "generated" }` means a generated score. */
  readonly source: () => ScoreSource | undefined;
  /** Where in `el` the label goes; the default editor puts it first in the toolbar's scrolling strip. */
  readonly before?: ChildNode | null;
  /** Says the new label once when the source changes after Save as. */
  readonly say?: (words: string) => void;
}

export interface SourceLabelPart extends ViewPart {
  /** Reads the source again and redraws, for a host that changed it with `update`. */
  refresh(): void;
}

/**
 * Mounts the source label on `el`. It is the one place a person reads where their edits go: a generated score keeps the
 * original, while a score file saves back to the file. See DESIGN.md, "The source label".
 */
export function mountSourceLabel(
  el: HTMLElement,
  session: EditingSession,
  options: SourceLabelOptions,
): SourceLabelPart {
  requireDom("mountSourceLabel");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const label = create(doc, "span", "sce-source-label", el);
  const main = create(doc, "span", "sce-source-label-main", label);
  const rest = create(doc, "span", "sce-source-label-rest", label);
  el.insertBefore(label, options.before ?? null);
  let language = session.view.language;
  let kind: "generated" | "scoreFile" | null = null;

  function applyLanguage(): void {
    if (session.view.language === language && kind !== null) return;
    language = session.view.language;
    label.lang = language;
    kind = null;
  }

  /** The words unchanged; the opening-bracket half is its own span, a block on a phone so it takes the second line. */
  function wordsOf(words: string): { readonly main: string; readonly rest: string } {
    const cut = words.indexOf(" (") >= 0 ? words.indexOf(" (") : words.indexOf("（");
    return cut < 0 ? { main: words, rest: "" } : { main: words.slice(0, cut), rest: words.slice(cut) };
  }

  function draw(): void {
    const t = messagesFor(language);
    const source = options.source();
    const next = source?.kind === "scoreFile" ? "scoreFile" : "generated";
    if (next === kind) return;
    const previous = kind;
    kind = next;
    const words = next === "scoreFile" ? t.sourceLabelScoreFile : t.sourceLabelGenerated;
    label.dataset.kind = next;
    const parts = wordsOf(words);
    main.textContent = parts.main;
    rest.textContent = parts.rest;
    if (previous !== null) options.say?.(words);
  }

  applyLanguage();
  draw();
  const unsubscribe = session.subscribe((change) => {
    if (change.view) {
      if (session.view.language !== language) applyLanguage();
      draw();
    }
  });
  let destroyed = false;
  return {
    refresh() {
      applyLanguage();
      draw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      label.remove();
      releaseStyles();
    },
  };
}

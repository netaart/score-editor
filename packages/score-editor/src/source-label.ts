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
  el.insertBefore(label, options.before ?? null);
  let language = session.view.language;
  let kind: "generated" | "scoreFile" | null = null;

  function applyLanguage(): void {
    language = session.view.language;
    label.lang = language;
    kind = null;
  }

  function draw(): void {
    const t = messagesFor(language);
    const source = options.source();
    const next = source?.kind === "scoreFile" ? "scoreFile" : "generated";
    if (next === kind) return;
    kind = next;
    label.dataset.kind = next;
    label.textContent = next === "scoreFile" ? t.sourceLabelScoreFile : t.sourceLabelGenerated;
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

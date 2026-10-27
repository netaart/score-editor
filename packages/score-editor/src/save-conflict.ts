// ABOUTME: The score-file conflict view part: the shared banner for a file another writer changed first, with one Choose button.
// ABOUTME: It follows the score-file keeper and never takes the focus; while it stands the editor goes on editing and saves nothing.

import { mountConflictBanner } from "./conflict-banner";
import { requireDom } from "./dom";
import { messagesFor } from "./i18n";
import type { ScoreFileKeeper } from "./score-source";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/** Mounts the score-file conflict banner on `el`, bound to `keeper`; see DESIGN.md, "Draft conflict banner". */
export function mountSaveConflict(
  el: HTMLElement,
  session: EditingSession,
  keeper: ScoreFileKeeper,
  options: { say?: (words: string) => void } = {},
): ViewPart {
  requireDom("mountSaveConflict");
  const releaseStyles = acquireStyles(el);
  const abort = new AbortController();
  const { signal } = abort;
  let language: Language | null = null;
  const banner = mountConflictBanner(el, {
    part: "save-conflict",
    stripClass: "sce-save-conflict",
    copy: () => {
      const t = messagesFor(session.view.language);
      return {
        name: t.saveConflict,
        sentence: t.saveConflictText,
        choose: t.draftChoose,
        choices: [
          { label: t.saveOverwrite, note: t.saveOverwriteNote },
          { label: t.saveLoadTheirs, note: t.saveLoadTheirsNote },
        ],
        cancel: t.draftConflictCancel,
        outcomes: [t.draftConflictOverwritten, t.draftConflictLoaded],
      };
    },
    actions: [() => keeper.overwrite(), () => keeper.loadTheirs()],
    ...(options.say === undefined ? {} : { say: options.say }),
    succeeded: () => keeper.status !== "conflict",
  });

  function draw(): void {
    if (session.view.language !== language) {
      language = session.view.language;
      banner.apply();
    }
    banner.show(keeper.status === "conflict");
  }

  draw();
  const unsubscribeSession = session.subscribe(draw);
  const unsubscribeKeeper = keeper.subscribe(draw);
  let destroyed = false;
  signal.addEventListener("abort", () => banner.destroy(), { once: true });
  return {
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

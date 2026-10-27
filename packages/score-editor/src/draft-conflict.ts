// ABOUTME: The draft conflict view part: the shared banner says another writer changed the draft first, with one Choose button.
// ABOUTME: It follows the keeper's status and never takes the focus; while it stands the editor goes on editing and the keeper writes nothing.

import { mountConflictBanner } from "./conflict-banner";
import { requireDom } from "./dom";
import type { DraftKeeper } from "./draft-keeper";
import { messagesFor } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/** Mounts the conflict banner on `el`, bound to `keeper`; see DESIGN.md, "Draft conflict banner". */
export function mountDraftConflict(
  el: HTMLElement,
  session: EditingSession,
  keeper: DraftKeeper,
  options: { say?: (words: string) => void } = {},
): ViewPart {
  requireDom("mountDraftConflict");
  const releaseStyles = acquireStyles(el);
  const abort = new AbortController();
  const { signal } = abort;
  let language: Language | null = null;
  const banner = mountConflictBanner(el, {
    part: "draft-conflict",
    copy: () => {
      const t = messagesFor(session.view.language);
      return {
        name: t.draftConflict,
        sentence: t.draftConflictText,
        choose: t.draftChoose,
        choices: [
          { label: t.draftOverwrite, note: t.draftOverwriteNote },
          { label: t.draftLoadTheirs, note: t.draftLoadTheirsNote },
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

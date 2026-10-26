// ABOUTME: The default editor's hold on a draft keeper: one DraftKeeper that stands for whichever keeper the mount options call for.
// ABOUTME: The parts bound to it outlive a keeper that is replaced; with no keeper it reports the status of an ended one and its actions do nothing.
import {
  createDraftKeeper,
  type DraftHandoffResult,
  type DraftKeeper,
  type DraftKeeperChange,
  type DraftKeeperStatus,
} from "./draft-keeper";
import type { SongProject } from "./score";
import type { EditingSession } from "./session";
import type { DraftStore, Notice } from "./types";

/**
 * What a binding with no keeper reports. It is the status of an ended keeper, because with no keeper nothing is kept,
 * whether the host gave no store or the editor is read-only; a part that has to tell the two apart asks the options.
 */
const NO_KEEPER: DraftKeeperStatus = "destroyed";

export interface DraftBinding extends DraftKeeper {
  /**
   * Makes the keeper that `store` and `project` call for, or none for a null store. A keeper that already serves this
   * store and this original stays; any other is destroyed first (it writes what it still holds), then `between` runs,
   * then the new one starts. `between` is where a new original reaches the session, so the new keeper opens on it; it is
   * told whether `project` is the same original as the one the binding was last given.
   */
  follow(store: DraftStore | null, project: SongProject, between?: (sameOriginal: boolean) => void): void;
  /**
   * Runs `action` when the keeper has opened, at once if it is not opening. A keeper that is replaced or ended before it
   * has opened drops the action: it was meant for a session the keeper has not yet restored a draft into.
   */
  afterOpening(action: () => void): void;
}

/**
 * Whether two projects are one original: the same source key, the same lyrics and the same score text. These are what a
 * draft is saved under and checked against; the other fields of a project are the user's to change.
 */
export function sameOriginal(a: SongProject, b: SongProject): boolean {
  return a.sourceKey === b.sourceKey && a.lyrics === b.lyrics && a.score === b.score;
}

export function createDraftBinding(session: EditingSession, notify: (notice: Notice) => void): DraftBinding {
  const listeners = new Set<(change: DraftKeeperChange) => void>();
  let keeper: DraftKeeper | null = null;
  let served: DraftStore | null = null;
  let offered: SongProject | null = null;
  let unsubscribeKeeper = (): void => {};
  let announced: DraftKeeperStatus = NO_KEEPER;
  let finished = false;

  /** Tells the listeners the status when it is not the one they were told last. */
  function announce(): void {
    const { status } = binding;
    if (status === announced) return;
    announced = status;
    for (const listener of [...listeners]) listener({ status });
  }

  function stop(): void {
    const old = keeper;
    keeper = null;
    served = null;
    unsubscribeKeeper();
    unsubscribeKeeper = () => {};
    old?.destroy();
    announce();
  }

  function start(store: DraftStore, original: SongProject): void {
    const made = createDraftKeeper({ session, store, original, notify });
    keeper = made;
    served = store;
    unsubscribeKeeper = made.subscribe(announce);
    announce();
  }

  const binding: DraftBinding = {
    get status() {
      return keeper?.status ?? NO_KEEPER;
    },
    get ready() {
      return keeper?.ready ?? Promise.resolve();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    overwrite: () => keeper?.overwrite() ?? Promise.resolve(),
    loadTheirs: () => keeper?.loadTheirs() ?? Promise.resolve(),
    restoreOriginal: () => keeper?.restoreOriginal() ?? Promise.resolve(false),
    handoff: (): Promise<DraftHandoffResult> => keeper?.handoff() ?? Promise.resolve("unchanged"),
    follow(store, project, between) {
      if (finished) return;
      const same = offered !== null && sameOriginal(offered, project);
      offered = project;
      const kept = keeper !== null && store === served && same;
      if (!kept) stop();
      between?.(same);
      if (!kept && store !== null) start(store, project);
    },
    afterOpening(action) {
      const waiting = keeper;
      if (waiting === null || waiting.status !== "opening") {
        action();
        return;
      }
      void waiting.ready.then(() => {
        if (keeper === waiting) action();
      });
    },
    destroy() {
      if (finished) return;
      stop();
      finished = true;
      listeners.clear();
    },
  };
  return binding;
}

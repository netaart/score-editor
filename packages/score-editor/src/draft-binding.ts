// ABOUTME: The default editor's hold on a draft keeper: one DraftKeeper that stands for whichever keeper the mount options call for.
// ABOUTME: The parts bound to it outlive a keeper that is replaced; with no keeper its status is "destroyed" and its actions do nothing.
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

/** What a keeper is made for: the host's store and the project it saves drafts of. */
export interface DraftTarget {
  readonly store: DraftStore;
  readonly original: SongProject;
}

export interface DraftBinding extends DraftKeeper {
  /**
   * Makes the keeper the target calls for, or none for a null target. A keeper that already serves this store and
   * this original stays; any other is destroyed first (it writes what it still holds), then `between` runs, then the
   * new one starts. `between` is where a new original reaches the session, so the new keeper opens on it.
   */
  follow(target: DraftTarget | null, between?: () => void): void;
}

/**
 * Whether two projects are the same original: every field equal, the lyric lines by content. A host that passes its
 * project again after a re-render passes a new object with the same content.
 */
export function sameOriginal(a: SongProject, b: SongProject): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof SongProject>;
  for (const key of keys) {
    if (key === "lyricLines" ? JSON.stringify(a[key]) !== JSON.stringify(b[key]) : !Object.is(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

export function createDraftBinding(session: EditingSession, notify: (notice: Notice) => void): DraftBinding {
  const listeners = new Set<(change: DraftKeeperChange) => void>();
  let keeper: DraftKeeper | null = null;
  let target: DraftTarget | null = null;
  let unsubscribeKeeper = (): void => {};
  let announced: DraftKeeperStatus = "destroyed";
  let finished = false;

  /** Tells the listeners the status when it is not the one they were told last. */
  function announce(): void {
    const status = self.status;
    if (status === announced) return;
    announced = status;
    for (const listener of [...listeners]) listener({ status });
  }

  function stop(): void {
    const old = keeper;
    keeper = null;
    target = null;
    unsubscribeKeeper();
    unsubscribeKeeper = () => {};
    old?.destroy();
    announce();
  }

  function start(next: DraftTarget): void {
    const made = createDraftKeeper({ session, store: next.store, original: next.original, notify });
    keeper = made;
    target = next;
    unsubscribeKeeper = made.subscribe(announce);
    announce();
  }

  const self: DraftBinding = {
    get status() {
      return keeper?.status ?? "destroyed";
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
    restoreOriginal: () => keeper?.restoreOriginal() ?? Promise.resolve(),
    handoff: (): Promise<DraftHandoffResult> => keeper?.handoff() ?? Promise.resolve("failed"),
    follow(next, between) {
      if (finished) return;
      const kept =
        next === null
          ? target === null
          : target !== null && target.store === next.store && sameOriginal(target.original, next.original);
      if (!kept) stop();
      between?.();
      if (!kept && next !== null) start(next);
    },
    destroy() {
      if (finished) return;
      stop();
      finished = true;
      listeners.clear();
    },
  };
  return self;
}

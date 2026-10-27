// ABOUTME: The keeper of a score file: it tracks the last saved version, saves explicitly, and resolves a version conflict.
// ABOUTME: Headless like the session: it calls the host's file only through the source's versioned save and read.
import { messagesFor } from "./i18n";
import type { SongProject } from "./score";
import type { EditingSession } from "./session";
import type { Notice, NoticeCode, ScoreFileSaveResult, ScoreFileSource } from "./types";

/** Where the keeper is: the file matches the session, there are changes, a save is in flight, or a conflict stands. */
export type ScoreFileKeeperStatus = "clean" | "dirty" | "saving" | "conflict" | "destroyed";

/** What a handoff came to: the file was saved, it was already saved, a conflict stands, or the save failed. */
export type ScoreFileHandoffResult = "saved" | "unchanged" | "conflict" | "failed";

/** One state change of the keeper; the host draws its own save state from it. */
export interface ScoreFileKeeperChange {
  readonly status: ScoreFileKeeperStatus;
  readonly unsaved: boolean;
  /** True after a failed save or read, until the next save, load or restore starts. */
  readonly failed: boolean;
  /** True after a save was refused because access was removed; the notice offers no Save again. */
  readonly accessLost: boolean;
}

export interface ScoreFileKeeperOptions {
  /** The session whose score text is saved. */
  session: EditingSession;
  /** The project as it was opened; the first last-saved version, and what a load of their version keeps. */
  original: SongProject;
  /** The host's file. */
  source: ScoreFileSource;
  /** Receives a failed save or read in the session's language. Conflicts are the keeper's status, not a notice. */
  notify?: (notice: Notice) => void;
  /** Called when the unsaved state changes, so a host can guard closing or leaving. */
  onUnsavedChange?: (unsaved: boolean) => void;
}

export interface ScoreFileKeeper {
  readonly status: ScoreFileKeeperStatus;
  /** Whether the score text differs from the last saved version. */
  readonly unsaved: boolean;
  /** True after a failed save or read, until the next save, load or restore starts. */
  readonly failed: boolean;
  /** True after a save was refused because access was removed; the notice offers no Save again. */
  readonly accessLost: boolean;
  /** The project at the last save or load of their version; the change log's original and Restore's target. */
  readonly savedProject: SongProject;
  /** The version the file is known to be at: opened, last saved, or loaded from the other writer. */
  readonly version: string;
  /** Saves now. With nothing to write it answers the current version without calling the host. */
  save(): Promise<ScoreFileSaveResult>;
  /** The conflict's first way out: reads their version and writes ours over it, if it can be read. */
  overwrite(): Promise<void>;
  /** The conflict's second way out: reads their version and puts it into the session as a new document. */
  loadTheirs(): Promise<void>;
  /** Puts the last saved version back and resets the history; it never writes or reads the host's file. */
  restoreOriginal(): Promise<boolean>;
  /** Saves first when there are changes, then answers whether the host may be handed the file. */
  handoff(): Promise<ScoreFileHandoffResult>;
  /** Calls `listener` after every status or unsaved state change, and returns the unsubscribe function. */
  subscribe(listener: (change: ScoreFileKeeperChange) => void): () => void;
  /** Stops the subscription. It never writes. */
  destroy(): void;
}

export function createScoreFileKeeper(options: ScoreFileKeeperOptions): ScoreFileKeeper {
  const { session, original, source } = options;
  const listeners = new Set<(change: ScoreFileKeeperChange) => void>();
  let status: ScoreFileKeeperStatus = "clean";
  let savedProject = original;
  let version = source.version;
  let busy = false;
  let failed = false;
  let accessLost = false;
  let finished = false;
  let announced: ScoreFileKeeperChange | null = null;
  let announcedUnsaved = false;

  function unsaved(): boolean {
    return session.project.score !== savedProject.score;
  }

  function sendNotice(code: NoticeCode): void {
    if (finished) return;
    const messages = messagesFor(session.view.language);
    options.notify?.({
      code,
      level: "error",
      message: code === "score-load-failed" ? messages.scoreLoadFailed : messages.scoreSaveFailed,
    });
  }

  function announce(): void {
    if (
      announced?.status === status &&
      announced.unsaved === unsaved() &&
      announced.failed === failed &&
      announced.accessLost === accessLost
    ) {
      return;
    }
    const change: ScoreFileKeeperChange = { status, unsaved: unsaved(), failed, accessLost };
    announced = change;
    for (const listener of [...listeners]) listener(change);
    const now = change.unsaved;
    if (now !== announcedUnsaved) {
      announcedUnsaved = now;
      options.onUnsavedChange?.(now);
    }
  }

  function setStatus(next: ScoreFileKeeperStatus): void {
    status = next;
    announce();
  }

  function unchanged(): ScoreFileSaveResult {
    return { ok: true, version };
  }

  async function write(expected: string, fromConflict: boolean): Promise<ScoreFileSaveResult> {
    const saved = session.project;
    let result: ScoreFileSaveResult;
    try {
      result = await source.save(saved.score, expected);
    } catch {
      result = { ok: false, reason: "failed" };
    }
    if (finished) return { ok: false, reason: "failed" };
    if (result.ok) {
      version = result.version;
      savedProject = saved;
      setStatus(unsaved() ? "dirty" : "clean");
      return result;
    }
    if (result.reason === "conflict") {
      setStatus("conflict");
      return result;
    }
    failed = true;
    accessLost = result.reason === "no-access";
    sendNotice("score-save-failed");
    setStatus(fromConflict ? "conflict" : "dirty");
    return result;
  }

  async function read(): Promise<{ text: string; version: string } | null> {
    try {
      return await source.read();
    } catch {
      return null;
    }
  }

  const unsubscribe = session.subscribe((change) => {
    if (finished || !change.project) return;
    if (status !== "saving" && status !== "conflict") status = unsaved() ? "dirty" : "clean";
    announce();
  });

  async function saveNow(): Promise<ScoreFileSaveResult> {
    if (finished) return { ok: false, reason: "failed" };
    if (status === "conflict") return { ok: false, reason: "conflict" };
    if (busy) return { ok: false, reason: "failed" };
    if (!unsaved()) return unchanged();
    busy = true;
    failed = false;
    accessLost = false;
    setStatus("saving");
    try {
      return await write(version, false);
    } finally {
      busy = false;
    }
  }

  return {
    get status() {
      return status;
    },
    get unsaved() {
      return unsaved();
    },
    get failed() {
      return failed;
    },
    get accessLost() {
      return accessLost;
    },
    get savedProject() {
      return savedProject;
    },
    get version() {
      return version;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    save: saveNow,
    async overwrite() {
      if (finished || status !== "conflict" || busy) return;
      busy = true;
      failed = false;
      accessLost = false;
      setStatus("saving");
      try {
        const entry = await read();
        if (finished) return;
        if (entry === null) {
          failed = true;
          sendNotice("score-save-failed");
          setStatus("conflict");
          return;
        }
        await write(entry.version, true);
      } finally {
        busy = false;
      }
    },
    async loadTheirs() {
      if (finished || status !== "conflict" || busy) return;
      busy = true;
      failed = false;
      accessLost = false;
      setStatus("saving");
      try {
        const entry = await read();
        if (finished) return;
        if (entry === null) {
          failed = true;
          sendNotice("score-load-failed");
          setStatus("conflict");
          return;
        }
        const next: SongProject = { ...session.project, score: entry.text };
        session.replaceProject(next);
        if (finished) return;
        version = entry.version;
        savedProject = next;
        setStatus("clean");
      } finally {
        busy = false;
      }
    },
    async restoreOriginal() {
      if (finished) return false;
      failed = false;
      accessLost = false;
      const target = savedProject;
      session.replaceProject(target);
      if (finished) return false;
      setStatus("clean");
      return true;
    },
    async handoff() {
      if (finished) return "failed";
      if (!unsaved()) return "unchanged";
      const result = await saveNow();
      if (result.ok) return "saved";
      return result.reason === "no-access" ? "failed" : result.reason;
    },
    destroy() {
      if (finished) return;
      finished = true;
      unsubscribe();
      status = "destroyed";
      announce();
      listeners.clear();
    },
  };
}

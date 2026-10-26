// ABOUTME: The draft keeper binds one editing session to a host store: it restores, inherits, debounces writes, and resolves conflicts.
// ABOUTME: Headless like the session: it touches no DOM, calls the store only by source key, and never changes the original project.
import { contentHash, DRAFT_FORMAT_VERSION, type DraftProject, draftText, readDraft, type ScoreDraft } from "./drafts";
import { messagesFor } from "./i18n";
import { joinLyrics, lyricLinesOf } from "./lyrics";
import type { LyricLine, SongProject } from "./score";
import type { EditingSession, SessionChange } from "./session";
import type { DraftStore, DraftStoreEntry, DraftWriteResult, Notice, NoticeCode } from "./types";

/** Where the keeper is: opening, keeping silently, waiting for a conflict choice, or shut down. */
export type DraftKeeperStatus = "opening" | "ready" | "conflict" | "destroyed";

/** A keeper state change. The status is the whole announcement; the host shows its own prompt for a conflict. */
export interface DraftKeeperChange {
  readonly status: DraftKeeperStatus;
}

/** What a handoff came to: the draft was written, there was nothing to write, or the store refused it. */
export type DraftHandoffResult = "written" | "unchanged" | "conflict" | "failed";

export interface DraftKeeperOptions {
  /** The one session whose project changes the keeper saves. */
  session: EditingSession;
  /** The host's draft storage. The keeper uses the original's source key for every write and removal. */
  store: DraftStore;
  /** The untouched source project; the keeper never changes it. */
  original: SongProject;
  /** Receives the draft notices, in the session's language: a stale source and a save or removal that did not reach the host. */
  notify?: (notice: Notice) => void;
  /** The clock for `updatedAt`; tests inject one. Defaults to `Date.now`. */
  now?: () => number;
  /** How long the last project change waits before its write. Defaults to 1000 ms. */
  debounceMs?: number;
}

export interface DraftKeeper {
  readonly status: DraftKeeperStatus;
  /** Settles when opening and inheritance are done, whatever they found; callers may subscribe before or after. */
  readonly ready: Promise<void>;
  /** Calls `listener` after every status change and returns the unsubscribe function. */
  subscribe(listener: (change: DraftKeeperChange) => void): () => void;
  /** The conflict's first way out: read their version and write ours over it. Does nothing outside a conflict. */
  overwrite(): Promise<void>;
  /** The conflict's second way out: read their draft and put its project into the session. */
  loadTheirs(): Promise<void>;
  /**
   * Puts the original back and removes whatever draft is stored, even one this keeper believes does not exist. It
   * resets the history through `replaceProject`: the edits it discards are the whole story of this draft. Resolves true
   * when the draft is cleared, and false when a conflict or a failure leaves it there, which is reported as for a write.
   */
  restoreOriginal(): Promise<boolean>;
  /** Saves at once with the content hash of the current joined lyrics and score as the handoff hash. */
  handoff(): Promise<DraftHandoffResult>;
  /**
   * Stops the timer and the subscription. A write still pending is started once, because unmounting is also how a
   * route change leaves the editor and the last second of edits should not be lost.
   */
  destroy(): void;
}

/** How many other drafts an open reads while looking for a handoff match; a bound on a device with many drafts. */
const INHERIT_MAX_DRAFTS = 50;

/** The draft the keeper believes is stored: no draft, a version it read or wrote, or a text it cannot read. */
type DraftCursor =
  | { readonly kind: "none" }
  | { readonly kind: "known"; readonly version: string }
  | { readonly kind: "unknown" };

function sameLines(left: ReadonlyArray<LyricLine>, right: ReadonlyArray<LyricLine>): boolean {
  if (left.length !== right.length) return false;
  return left.every((line, index) => {
    const other = right[index] as LyricLine;
    if (line.text !== other.text) return false;
    if (line.phrase === null || other.phrase === null) return line.phrase === other.phrase;
    return line.phrase.firstBar === other.phrase.firstBar && line.phrase.barCount === other.phrase.barCount;
  });
}

function reportListenerError(error: unknown): void {
  if (typeof reportError === "function") {
    reportError(error);
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}

export function createDraftKeeper(options: DraftKeeperOptions): DraftKeeper {
  const { session, store, original } = options;
  const now = options.now ?? Date.now;
  const debounceMs = options.debounceMs ?? 1000;
  const key = original.sourceKey;
  const changeListeners = new Set<(change: DraftKeeperChange) => void>();

  let status: DraftKeeperStatus = "opening";
  let sourceHash = "";
  let cursor: DraftCursor = { kind: "none" };
  let handoffHash: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let suppressKeep = 0;

  /** The one place the draft cursor moves, so a removal, a write and an unreadable text cannot drift apart. */
  function setCursor(next: DraftCursor): void {
    cursor = next;
  }

  function expectedVersion(): string | null {
    return cursor.kind === "known" ? cursor.version : null;
  }

  function isDestroyed(): boolean {
    return status === "destroyed";
  }

  function setStatus(next: DraftKeeperStatus): void {
    if (status === next) return;
    status = next;
    const change: DraftKeeperChange = { status: next };
    for (const listener of [...changeListeners]) {
      try {
        listener(change);
      } catch (error) {
        reportListenerError(error);
      }
    }
  }

  function sendNotice(code: NoticeCode): void {
    if (isDestroyed()) return;
    const messages = messagesFor(session.view.language);
    options.notify?.({
      code,
      level: code === "draft-save-failed" ? "error" : "warning",
      message: code === "draft-save-failed" ? messages.draftSaveFailed : messages.draftSourceChanged,
    });
  }

  /** The lines a project carries now: its stored ones, or the layout computed from its score when it stores none. */
  function effectiveLines(project: SongProject): ReadonlyArray<LyricLine> {
    const reading = session.reading;
    if (reading.kind === "score") return lyricLinesOf(project, reading.score);
    return project.lyricLines ?? [];
  }

  function storedProject(project: SongProject): DraftProject {
    return {
      style: project.style,
      lyrics: project.lyrics,
      lyricLines: effectiveLines(project),
      score: project.score,
      scoreMode: project.scoreMode,
      seed: project.seed,
    };
  }

  function fromDraft(draft: ScoreDraft): SongProject {
    return {
      ...original,
      style: draft.project.style,
      lyrics: draft.project.lyrics,
      lyricLines: draft.project.lyricLines,
      score: draft.project.score,
      scoreMode: draft.project.scoreMode,
      seed: draft.project.seed,
    };
  }

  function sameAsOriginal(project: SongProject): boolean {
    if (
      project.style !== original.style ||
      project.lyrics !== original.lyrics ||
      project.score !== original.score ||
      project.scoreMode !== original.scoreMode ||
      project.seed !== original.seed
    ) {
      return false;
    }
    return sameLines(effectiveLines(project), effectiveLines(original));
  }

  function joinedLyrics(project: SongProject): string {
    const reading = session.reading;
    if (reading.kind === "score") return joinLyrics(reading.score, effectiveLines(project));
    return project.lyrics;
  }

  /** Runs a session replacement without treating its "project changed" announcement as a user edit to save. */
  function withoutKeep(action: () => void): void {
    suppressKeep += 1;
    try {
      action();
    } finally {
      suppressKeep -= 1;
    }
  }

  async function writeDraft(expected: string | null, handoff: string | null): Promise<boolean> {
    const draft: ScoreDraft = {
      version: DRAFT_FORMAT_VERSION,
      sourceKey: key,
      sourceHash,
      project: storedProject(session.project),
      handoffHash: handoff,
      updatedAt: now(),
    };
    let result: DraftWriteResult;
    try {
      result = await store.write(key, draftText(draft), expected);
    } catch {
      result = { ok: false, reason: "failed" };
    }
    if (result.ok) {
      setCursor({ kind: "known", version: result.version });
      handoffHash = handoff;
      if (!isDestroyed() && status === "conflict") setStatus("ready");
      return true;
    }
    if (isDestroyed()) return false;
    if (result.reason === "conflict") {
      setCursor({ kind: "unknown" });
      setStatus("conflict");
    } else {
      sendNotice("draft-save-failed");
    }
    return false;
  }

  async function removeDraft(expected: string | null): Promise<boolean> {
    let result: DraftWriteResult;
    try {
      result = await store.remove(key, expected);
    } catch {
      result = { ok: false, reason: "failed" };
    }
    if (result.ok) {
      // A removed key has no version to pass on: the next write creates with `expected: null`.
      setCursor({ kind: "none" });
      return true;
    }
    if (isDestroyed()) return false;
    // After a failed removal the old version is not safe to reuse; the next write asks the host for a conflict.
    setCursor({ kind: "unknown" });
    if (result.reason === "conflict") setStatus("conflict");
    else sendNotice("draft-save-failed");
    return false;
  }

  function cancelTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function scheduleKeep(): void {
    if (isDestroyed() || status === "conflict") return;
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      void flushPending();
    }, debounceMs);
  }

  async function flushPending(): Promise<void> {
    if (isDestroyed() || status === "conflict") return;
    if (sameAsOriginal(session.project)) {
      if (cursor.kind === "known") await removeDraft(cursor.version);
      return;
    }
    await writeDraft(expectedVersion(), handoffHash);
  }

  function onSessionChange(change: SessionChange): void {
    if (isDestroyed() || suppressKeep > 0 || !change.project || status !== "ready") return;
    scheduleKeep();
  }

  const unsubscribeSession = session.subscribe(onSessionChange);

  async function readEntry(entryKey: string): Promise<DraftStoreEntry | null> {
    try {
      return await store.read(entryKey);
    } catch {
      return null;
    }
  }

  async function inherit(): Promise<void> {
    let keys: ReadonlyArray<string>;
    try {
      keys = await store.list();
    } catch {
      return;
    }
    if (isDestroyed()) return;
    const reading = session.reading;
    if (reading.kind !== "score") return;
    const candidates = keys.filter((candidate) => candidate !== key).slice(0, INHERIT_MAX_DRAFTS);
    let best: { draft: ScoreDraft; version: string } | null = null;
    for (const other of candidates) {
      const entry = await readEntry(other);
      if (isDestroyed()) return;
      if (entry === null) continue;
      const draft = readDraft(entry.text);
      if (draft === null || draft.sourceKey !== other || draft.handoffHash !== sourceHash) continue;
      // The lines must join to the new song's own lyrics byte for byte; a draft for other words is not its draft.
      if (joinLyrics(reading.score, draft.project.lyricLines) !== original.lyrics) continue;
      if (best === null || draft.updatedAt > best.draft.updatedAt) best = { draft, version: entry.version };
    }
    if (best === null) return;
    const match = best;
    handoffHash = null;
    withoutKeep(() => {
      session.replaceProject({ ...original, lyricLines: match.draft.project.lyricLines });
    });
    scheduleKeep();
  }

  async function start(): Promise<void> {
    sourceHash = await contentHash(original.lyrics, original.score);
    if (isDestroyed()) return;
    const own = await readEntry(key);
    if (isDestroyed()) return;
    if (own !== null) {
      const draft = readDraft(own.text);
      if (draft !== null && draft.sourceKey === key && draft.sourceHash === sourceHash) {
        setCursor({ kind: "known", version: own.version });
        handoffHash = draft.handoffHash;
        withoutKeep(() => session.replaceProject(fromDraft(draft)));
        return;
      }
      if (draft !== null && draft.sourceKey === key) {
        const removed = await removeDraft(own.version);
        if (removed) sendNotice("draft-source-changed");
        return;
      }
      // A text of a version this package does not know is left alone: only the user's conflict choices may replace it.
      setCursor({ kind: "unknown" });
    }
    await inherit();
  }

  const ready = start().then(
    () => {
      if (status === "opening") setStatus("ready");
    },
    (error: unknown) => {
      reportListenerError(error);
      if (status === "opening") setStatus("ready");
    },
  );

  return {
    get status() {
      return status;
    },
    ready,
    subscribe(listener) {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    async overwrite() {
      if (isDestroyed() || status !== "conflict") return;
      const entry = await readEntry(key);
      if (isDestroyed()) return;
      setCursor(entry === null ? { kind: "none" } : { kind: "unknown" });
      if (!sameAsOriginal(session.project)) {
        if (await writeDraft(entry?.version ?? null, handoffHash)) setStatus("ready");
        return;
      }
      if (entry === null) {
        setStatus("ready");
        return;
      }
      if (await removeDraft(entry.version)) setStatus("ready");
    },
    async loadTheirs() {
      if (isDestroyed() || status !== "conflict") return;
      const entry = await readEntry(key);
      if (isDestroyed()) return;
      if (entry === null) {
        setCursor({ kind: "none" });
        handoffHash = null;
        setStatus("ready");
        return;
      }
      const draft = readDraft(entry.text);
      if (draft === null || draft.sourceKey !== key) {
        // There is nothing this package can read as their draft: leave the conflict for overwrite to answer.
        setCursor({ kind: "unknown" });
        return;
      }
      setCursor({ kind: "known", version: entry.version });
      handoffHash = draft.handoffHash;
      withoutKeep(() => session.replaceProject(fromDraft(draft)));
      setStatus("ready");
    },
    async restoreOriginal() {
      if (isDestroyed()) return false;
      cancelTimer();
      withoutKeep(() => session.replaceProject(original));
      handoffHash = null;
      // Story 71 clears the draft even when this keeper believes there is none: another window may have written one.
      const entry = await readEntry(key);
      if (isDestroyed()) return false;
      if (entry === null) {
        setCursor({ kind: "none" });
        setStatus("ready");
        return true;
      }
      setCursor({ kind: "unknown" });
      if (await removeDraft(entry.version)) {
        setStatus("ready");
        return true;
      }
      return false;
    },
    async handoff() {
      if (isDestroyed()) return "failed";
      cancelTimer();
      const hash = await contentHash(joinedLyrics(session.project), session.project.score);
      if (isDestroyed()) return "failed";
      if (sameAsOriginal(session.project)) {
        if (cursor.kind === "known") await removeDraft(cursor.version);
        handoffHash = null;
        return "unchanged";
      }
      if (await writeDraft(expectedVersion(), hash)) return "written";
      return status === "conflict" ? "conflict" : "failed";
    },
    destroy() {
      if (isDestroyed()) return;
      const pending = timer !== null;
      cancelTimer();
      unsubscribeSession();
      if (pending) void flushPending();
      setStatus("destroyed");
    },
  };
}

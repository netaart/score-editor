// ABOUTME: The draft keeper binds one editing session to a host store: it restores, inherits, debounces writes, and resolves conflicts.
// ABOUTME: Headless like the session: it touches no DOM, calls the store only by source key, and never changes the original project.
import { contentHash, type DraftProject, draftText, readDraft, type ScoreDraft } from "./drafts";
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
  /** Receives the draft notices, in the session's language: a stale source and a save that did not reach the host. */
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
   * Puts the original back and removes its draft. It resets the history through `replaceProject`: the edits it
   * discards are the whole story of this draft, so there is no meaningful step to undo back to.
   */
  restoreOriginal(): Promise<void>;
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
  let draftVersion: string | null = null;
  let draftExists = false;
  let handoffHash: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let suppressKeep = 0;

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
    if (destroyed) return;
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
      version: 1,
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
      draftVersion = result.version;
      draftExists = true;
      handoffHash = handoff;
      if (!destroyed && status === "conflict") setStatus("ready");
      return true;
    }
    if (destroyed) return false;
    if (result.reason === "conflict") setStatus("conflict");
    else sendNotice("draft-save-failed");
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
      draftVersion = result.version;
      draftExists = false;
      return true;
    }
    if (destroyed) return false;
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
    if (destroyed || status === "conflict") return;
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      void flushPending();
    }, debounceMs);
  }

  async function flushPending(): Promise<void> {
    if (destroyed || status === "conflict") return;
    if (sameAsOriginal(session.project)) {
      if (!draftExists) return;
      await removeDraft(draftVersion);
      return;
    }
    await writeDraft(draftVersion, handoffHash);
  }

  function onSessionChange(change: SessionChange): void {
    if (destroyed || suppressKeep > 0 || !change.project || status !== "ready") return;
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
    if (destroyed) return;
    const candidates = keys.filter((candidate) => candidate !== key).slice(0, INHERIT_MAX_DRAFTS);
    let best: { draft: ScoreDraft; version: string } | null = null;
    for (const other of candidates) {
      const entry = await readEntry(other);
      if (destroyed) return;
      if (entry === null) continue;
      const draft = readDraft(entry.text);
      if (draft === null || draft.sourceKey !== other || draft.handoffHash !== sourceHash) continue;
      if (best === null || draft.updatedAt > best.draft.updatedAt) best = { draft, version: entry.version };
    }
    if (best === null) return;
    const match = best;
    handoffHash = null;
    withoutKeep(() => {
      session.replaceProject({
        ...original,
        lyrics: match.draft.project.lyrics,
        lyricLines: match.draft.project.lyricLines,
      });
    });
    scheduleKeep();
  }

  async function start(): Promise<void> {
    sourceHash = await contentHash(original.lyrics, original.score);
    if (destroyed) return;
    const own = await readEntry(key);
    if (destroyed) return;
    if (own !== null) {
      const draft = readDraft(own.text);
      if (draft !== null && draft.sourceKey === key && draft.sourceHash === sourceHash) {
        draftVersion = own.version;
        draftExists = true;
        handoffHash = draft.handoffHash;
        withoutKeep(() => session.replaceProject(fromDraft(draft)));
        return;
      }
      if (draft !== null && draft.sourceKey === key) {
        draftVersion = own.version;
        draftExists = true;
        await removeDraft(own.version);
        sendNotice("draft-source-changed");
        return;
      }
      // A text that is not a draft of this version leaves the key occupied: a later write replaces that version.
      draftVersion = own.version;
      draftExists = true;
    }
    await inherit();
  }

  const ready = start().then(
    () => {
      if (!destroyed && status === "opening") setStatus("ready");
    },
    (error: unknown) => {
      reportListenerError(error);
      if (!destroyed && status === "opening") setStatus("ready");
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
      if (destroyed || status !== "conflict") return;
      const entry = await readEntry(key);
      if (destroyed) return;
      draftVersion = entry?.version ?? null;
      draftExists = entry !== null;
      if (!sameAsOriginal(session.project)) {
        if (await writeDraft(draftVersion, handoffHash)) setStatus("ready");
        return;
      }
      if (draftExists && !(await removeDraft(draftVersion))) return;
      setStatus("ready");
    },
    async loadTheirs() {
      if (destroyed || status !== "conflict") return;
      const entry = await readEntry(key);
      if (destroyed) return;
      if (entry === null) {
        draftVersion = null;
        draftExists = false;
        handoffHash = null;
        setStatus("ready");
        return;
      }
      draftVersion = entry.version;
      draftExists = true;
      const draft = readDraft(entry.text);
      if (draft !== null && draft.sourceKey === key) {
        handoffHash = draft.handoffHash;
        withoutKeep(() => session.replaceProject(fromDraft(draft)));
      }
      setStatus("ready");
    },
    async restoreOriginal() {
      if (destroyed) return;
      cancelTimer();
      withoutKeep(() => session.replaceProject(original));
      handoffHash = null;
      if (!draftExists) {
        setStatus("ready");
        return;
      }
      if (await removeDraft(draftVersion)) {
        setStatus("ready");
        return;
      }
      // This action discards the edits; if another window wrote meanwhile, read its version and remove that too.
      if (!destroyed && status === "conflict") {
        const entry = await readEntry(key);
        if (destroyed) return;
        if (entry === null) {
          draftVersion = null;
          draftExists = false;
          setStatus("ready");
          return;
        }
        draftVersion = entry.version;
        if (await removeDraft(entry.version)) setStatus("ready");
      }
    },
    async handoff() {
      if (destroyed) return "failed";
      cancelTimer();
      const hash = await contentHash(joinedLyrics(session.project), session.project.score);
      if (destroyed) return "failed";
      if (sameAsOriginal(session.project)) {
        if (draftExists) await removeDraft(draftVersion);
        handoffHash = null;
        return "unchanged";
      }
      if (await writeDraft(draftVersion, hash)) return "written";
      return status === "conflict" ? "conflict" : "failed";
    },
    destroy() {
      if (destroyed) return;
      const pending = timer !== null;
      cancelTimer();
      unsubscribeSession();
      if (pending) void flushPending();
      destroyed = true;
      setStatus("destroyed");
    },
  };
}

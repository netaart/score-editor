// ABOUTME: Seam 1 for the draft keeper: a fake host store records every key, version and text, and a fake clock makes the debounce exact.
// ABOUTME: The keeper is imported from the package entry and driven through the real editing session and song2 dialect.
import { createHash } from "node:crypto";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createDraftKeeper,
  createEditingSession,
  type DraftStore,
  type DraftStoreEntry,
  type DraftWriteResult,
  type EditingSession,
  joinLyrics,
  lyricLinesOf,
  type Notice,
  readDraft,
  type ScoreDraft,
  type SongProject,
} from "@neta-art/score-editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

/** Bar 1: C D E F as quarter notes. Bar 2: a whole note G. */
const SCORE = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16|`;

/** The same score after the D of bar 1 becomes a rest. */
const SCORE_WITHOUT_D = `${HEADER}
K:C
V: Vocal
C4z4E4F4|G16|`;

/** The same score after the F of bar 1 becomes a rest too. */
const SCORE_WITHOUT_F = `${HEADER}
K:C
V: Vocal
C4D4E4z4|G16|`;

const dialects = createDialectRegistry([song2Dialect]);

const ORIGINAL: SongProject = {
  style: "pop",
  lyrics: "la la",
  score: SCORE,
  scoreMode: "full",
  seed: 7,
  modelId: "song2",
  sourceKey: "song-1",
};

/** Lines that join to ORIGINAL.lyrics ("la la"), so the old song's line arrangement belongs to the new song. */
const INHERITED_LINES = [{ text: "la la", phrase: { firstBar: 0, barCount: 2 } }] as const;

let clock = 1_000;

type StoreCall =
  | { readonly method: "read"; readonly key: string }
  | { readonly method: "list" }
  | { readonly method: "write"; readonly key: string; readonly text: string; readonly expected: string | null }
  | { readonly method: "remove"; readonly key: string; readonly expected: string | null };

/** A host store that records calls and answers versions the way a real one would, including a conflict and a failure. */
class FakeStore implements DraftStore {
  readonly files = new Map<string, DraftStoreEntry>();
  readonly calls: StoreCall[] = [];
  failWrites = 0;
  failRemoves = 0;
  private nextId = 1;

  seed(key: string, text: string, version = "seed-version"): void {
    this.files.set(key, { text, version });
  }

  versionOf(key: string): string | null {
    return this.files.get(key)?.version ?? null;
  }

  async read(key: string): Promise<DraftStoreEntry | null> {
    this.calls.push({ method: "read", key });
    const found = this.files.get(key);
    return found === undefined ? null : { text: found.text, version: found.version };
  }

  async write(key: string, text: string, expected: string | null): Promise<DraftWriteResult> {
    this.calls.push({ method: "write", key, text, expected });
    if (this.failWrites > 0) {
      this.failWrites -= 1;
      return { ok: false, reason: "failed" };
    }
    const current = this.versionOf(key);
    if (current !== expected) return { ok: false, reason: "conflict" };
    const version = `w${this.nextId}`;
    this.nextId += 1;
    this.files.set(key, { text, version });
    return { ok: true, version };
  }

  async remove(key: string, expected: string | null): Promise<DraftWriteResult> {
    this.calls.push({ method: "remove", key, expected });
    if (this.failRemoves > 0) {
      this.failRemoves -= 1;
      return { ok: false, reason: "failed" };
    }
    if (this.versionOf(key) !== expected) return { ok: false, reason: "conflict" };
    this.files.delete(key);
    return { ok: true, version: `removed-${this.nextId++}` };
  }

  async list(): Promise<ReadonlyArray<string>> {
    this.calls.push({ method: "list" });
    return [...this.files.keys()];
  }

  writes(): Array<{ key: string; text: string; expected: string | null }> {
    return this.calls.flatMap((call) => (call.method === "write" ? [call] : []));
  }

  removes(): Array<{ key: string; expected: string | null }> {
    return this.calls.flatMap((call) => (call.method === "remove" ? [call] : []));
  }
}

let store: FakeStore;

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1_000;
  store = new FakeStore();
});

afterEach(() => {
  vi.useRealTimers();
});

function openSession(project: SongProject = ORIGINAL): EditingSession {
  return createEditingSession({ project, dialects });
}

function openKeeper(session: EditingSession = openSession(), original: SongProject = ORIGINAL) {
  const notices: Notice[] = [];
  const keeper = createDraftKeeper({
    session,
    store,
    original,
    notify: (notice) => notices.push(notice),
    now: () => clock,
  });
  sessions.set(keeper, session);
  return { keeper, notices, session };
}

function parse(text: string) {
  const { score } = song2Dialect.parse(text);
  if (score === null) throw new Error(`the test score did not read: ${text}`);
  return score;
}

function projectLines(project: SongProject) {
  return lyricLinesOf(project, parse(project.score));
}

function draftProject(project: SongProject): ScoreDraft["project"] {
  return {
    style: project.style,
    lyrics: project.lyrics,
    lyricLines: projectLines(project),
    score: project.score,
    scoreMode: project.scoreMode,
    seed: project.seed,
  };
}

async function makeDraft(project: SongProject = ORIGINAL, overrides: Partial<ScoreDraft> = {}): Promise<ScoreDraft> {
  return {
    version: 1,
    sourceKey: project.sourceKey,
    sourceHash: expectedHash(ORIGINAL.lyrics, ORIGINAL.score),
    project: draftProject(project),
    handoffHash: null,
    updatedAt: 100,
    ...overrides,
  };
}

function sourceHashOf(project: SongProject = ORIGINAL): string {
  return expectedHash(project.lyrics, project.score);
}

function expectedHash(lyrics: string, score: string): string {
  return createHash("sha256")
    .update(Buffer.from(JSON.stringify([lyrics, score]), "utf8"))
    .digest("hex");
}

describe("opening a draft", () => {
  it("restores the draft whose source hash matches the original", async () => {
    const restored = await makeDraft(ORIGINAL, {
      project: { ...draftProject(ORIGINAL), score: SCORE_WITHOUT_D },
    });
    store.seed(ORIGINAL.sourceKey, JSON.stringify(restored));
    const session = openSession();

    const { keeper, notices } = openKeeper(session);
    await keeper.ready;

    expect(session.project).toEqual({ ...ORIGINAL, score: SCORE_WITHOUT_D, lyricLines: restored.project.lyricLines });
    expect(notices).toEqual([]);
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(true);
    expect(keeper.status).toBe("ready");
  });

  it("discards a draft whose source hash is stale and says the original changed", async () => {
    const stale = await makeDraft(ORIGINAL, { sourceHash: expectedHash("an older lyric", ORIGINAL.score) });
    store.seed(ORIGINAL.sourceKey, JSON.stringify(stale), "stale-version");
    const session = openSession();

    const { keeper, notices } = openKeeper(session);
    await keeper.ready;

    expect(session.project).toBe(ORIGINAL);
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);
    expect(store.removes()).toEqual([{ method: "remove", key: ORIGINAL.sourceKey, expected: "stale-version" }]);
    expect(notices.map((notice) => notice.code)).toEqual(["draft-source-changed"]);
    expect(notices[0]?.level).toBe("warning");
    expect(notices[0]?.message).toMatch(/original has changed/i);
  });

  it("neither restores nor inherits after discarding a stale draft", async () => {
    const stale = await makeDraft(ORIGINAL, { sourceHash: expectedHash("an older lyric", ORIGINAL.score) });
    store.seed(ORIGINAL.sourceKey, JSON.stringify(stale));
    const inherited = await makeDraft(
      { ...ORIGINAL, sourceKey: "old-song" },
      { sourceKey: "old-song", handoffHash: sourceHashOf() },
    );
    store.seed("old-song", JSON.stringify(inherited));
    const session = openSession();

    const { keeper } = openKeeper(session);
    await keeper.ready;

    expect(session.project).toBe(ORIGINAL);
    expect(store.calls.some((call) => call.method === "list")).toBe(false);
  });

  it("is normal when there is no draft: no notice, no store change", async () => {
    const session = openSession();
    const { keeper, notices } = openKeeper(session);
    await keeper.ready;

    expect(session.project).toBe(ORIGINAL);
    expect(notices).toEqual([]);
    expect(store.writes()).toEqual([]);
    expect(store.removes()).toEqual([]);
    expect(keeper.status).toBe("ready");
  });

  it("leaves a draft of a version it does not know alone, conflicts on the next write, and lets go only by overwrite", async () => {
    const futureText = JSON.stringify({ ...(await makeDraft()), version: 2 });
    store.seed(ORIGINAL.sourceKey, futureText, "unknown-version");
    const session = openSession();

    const { keeper, notices } = openKeeper(session);
    await keeper.ready;

    expect(session.project).toBe(ORIGINAL);
    expect(store.files.get(ORIGINAL.sourceKey)?.text).toBe(futureText);
    expect(store.removes()).toEqual([]);
    expect(notices).toEqual([]);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.writes()).toHaveLength(1);
    expect(store.writes()[0]?.expected).toBeNull();
    expect(keeper.status).toBe("conflict");
    expect(store.files.get(ORIGINAL.sourceKey)?.text).toBe(futureText);

    // Loading a text this package cannot read does not throw and leaves the conflict for overwrite to answer.
    await expect(keeper.loadTheirs()).resolves.toBeUndefined();
    expect(keeper.status).toBe("conflict");
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
    expect(store.files.get(ORIGINAL.sourceKey)?.text).toBe(futureText);

    await keeper.overwrite();

    expect(keeper.status).toBe("ready");
    expect(store.files.get(ORIGINAL.sourceKey)?.text).not.toBe(futureText);
  });

  it("sends the save-failed notice, not the source-changed one, when discarding a stale draft fails", async () => {
    const stale = await makeDraft(ORIGINAL, { sourceHash: expectedHash("an older lyric", ORIGINAL.score) });
    store.seed(ORIGINAL.sourceKey, JSON.stringify(stale), "stale-version");
    store.failRemoves = 1;
    const session = openSession();

    const { keeper, notices } = openKeeper(session);
    await keeper.ready;

    expect(store.files.get(ORIGINAL.sourceKey)?.text).toBe(JSON.stringify(stale));
    expect(notices.map((notice) => notice.code)).toEqual(["draft-save-failed"]);
    expect(keeper.status).toBe("ready");
  });

  it("creates again after discarding a stale draft instead of passing the removal's version", async () => {
    const stale = await makeDraft(ORIGINAL, { sourceHash: expectedHash("an older lyric", ORIGINAL.score) });
    store.seed(ORIGINAL.sourceKey, JSON.stringify(stale), "stale-version");
    const session = openSession();

    const { keeper } = openKeeper(session);
    await keeper.ready;
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.writes()).toHaveLength(1);
    expect(store.writes()[0]?.expected).toBeNull();
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(true);
    expect(keeper.status).toBe("ready");
  });
});

describe("inheriting lyric lines", () => {
  it("takes the draft whose handoff hash matches, with its lyric lines, and keeps the new song's lyrics byte for byte", async () => {
    const inherited = await makeDraft(
      { ...ORIGINAL, sourceKey: "old-song" },
      {
        sourceKey: "old-song",
        handoffHash: sourceHashOf(),
        project: { ...draftProject(ORIGINAL), lyrics: "old stored words", lyricLines: INHERITED_LINES },
      },
    );
    store.seed("old-song", JSON.stringify(inherited));
    const session = openSession();

    const { keeper } = openKeeper(session);
    await keeper.ready;

    expect(session.project).toEqual({ ...ORIGINAL, lyricLines: INHERITED_LINES });
    expect(session.project.lyrics).toBe(ORIGINAL.lyrics);
    expect(session.project.sourceKey).toBe(ORIGINAL.sourceKey);
    expect(session.project.modelId).toBe(ORIGINAL.modelId);
    expect(session.project.score).toBe(SCORE);
  });

  it("writes the inherited project under its own key after the debounce", async () => {
    const inherited = await makeDraft(
      { ...ORIGINAL, sourceKey: "old-song" },
      {
        sourceKey: "old-song",
        handoffHash: sourceHashOf(),
        project: { ...draftProject(ORIGINAL), lyrics: "old stored words", lyricLines: INHERITED_LINES },
      },
    );
    store.seed("old-song", JSON.stringify(inherited));
    const { keeper } = openKeeper();
    await keeper.ready;
    expect(store.writes()).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);

    const written = store.writes();
    expect(written).toHaveLength(1);
    expect(written[0]?.key).toBe(ORIGINAL.sourceKey);
    const draft = readDraft(written[0]?.text ?? "");
    expect(draft?.project.lyrics).toBe(ORIGINAL.lyrics);
    expect(draft?.project.lyricLines).toEqual(INHERITED_LINES);
    // Inheritance is not a handoff, so the new draft records none.
    expect(draft?.handoffHash).toBeNull();
  });

  it("takes the latest update time when two drafts match the handoff hash", async () => {
    const older = await makeDraft(
      { ...ORIGINAL, sourceKey: "old-a" },
      {
        sourceKey: "old-a",
        handoffHash: sourceHashOf(),
        updatedAt: 100,
        project: {
          ...draftProject(ORIGINAL),
          lyrics: "older words",
          lyricLines: [{ text: "older words", phrase: { firstBar: 0, barCount: 1 } }],
        },
      },
    );
    const newer = await makeDraft(
      { ...ORIGINAL, sourceKey: "old-b" },
      {
        sourceKey: "old-b",
        handoffHash: sourceHashOf(),
        updatedAt: 200,
        project: { ...draftProject(ORIGINAL), lyrics: "old stored words", lyricLines: INHERITED_LINES },
      },
    );
    store.seed("old-a", JSON.stringify(older));
    store.seed("old-b", JSON.stringify(newer));
    const session = openSession();

    const { keeper } = openKeeper(session);
    await keeper.ready;

    expect(session.project.lyrics).toBe(ORIGINAL.lyrics);
    expect(session.project.lyricLines).toEqual(INHERITED_LINES);
  });

  it("inherits a handoff whose score comes back without its final line break", async () => {
    const oldOriginal: SongProject = { ...ORIGINAL, sourceKey: "old-song", score: `${SCORE}\n` };
    const oldSession = openSession(oldOriginal);
    const { keeper: oldKeeper } = openKeeper(oldSession, oldOriginal);
    await oldKeeper.ready;
    const oldLines = (() => {
      const session = keeperSession(oldKeeper);
      session.dispatch({ type: "toRest", noteId: "Vocal:256" });
      return projectLines(session.project);
    })();
    expect(await oldKeeper.handoff()).toBe("written");
    oldKeeper.destroy();

    const newOriginal: SongProject = { ...ORIGINAL, sourceKey: "new-song", score: SCORE_WITHOUT_D };
    const session = openSession(newOriginal);
    const { keeper } = openKeeper(session, newOriginal);
    await keeper.ready;

    expect(session.project.lyricLines).toEqual(oldLines);
  });

  it("inherits when the new song's lyrics lack the final line break the handoff had", async () => {
    const oldOriginal: SongProject = {
      ...ORIGINAL,
      sourceKey: "old-song",
      lyrics: "la la\n",
      score: `${SCORE}\n`,
      lyricLines: [{ text: "la la\n", phrase: { firstBar: 0, barCount: 2 } }],
    };
    const oldSession = openSession(oldOriginal);
    const { keeper: oldKeeper } = openKeeper(oldSession, oldOriginal);
    await oldKeeper.ready;
    const session = keeperSession(oldKeeper);
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    expect(await oldKeeper.handoff()).toBe("written");
    oldKeeper.destroy();

    const newOriginal: SongProject = { ...ORIGINAL, sourceKey: "new-song", score: SCORE_WITHOUT_D, lyrics: "la la" };
    const newSession = openSession(newOriginal);
    const { keeper } = openKeeper(newSession, newOriginal);
    await keeper.ready;

    expect(newSession.project.lyricLines).toEqual([{ text: "la la\n", phrase: { firstBar: 0, barCount: 2 } }]);
  });

  it("keeps accepting a handoff recorded with the raw source hash", async () => {
    const newOriginal: SongProject = { ...ORIGINAL, sourceKey: "new-song", score: SCORE };
    const inherited = await makeDraft(
      { ...ORIGINAL, sourceKey: "old-song" },
      {
        sourceKey: "old-song",
        handoffHash: expectedHash("la la", SCORE),
        project: { ...draftProject(ORIGINAL), lyricLines: INHERITED_LINES },
      },
    );
    store.seed("old-song", JSON.stringify(inherited));
    const session = openSession(newOriginal);

    const { keeper } = openKeeper(session, newOriginal);
    await keeper.ready;

    expect(session.project.lyricLines).toEqual(INHERITED_LINES);
  });

  it("does not inherit when a note inside the score differs", async () => {
    const oldOriginal: SongProject = { ...ORIGINAL, sourceKey: "old-song", score: `${SCORE}\n` };
    const oldSession = openSession(oldOriginal);
    const { keeper: oldKeeper } = openKeeper(oldSession, oldOriginal);
    await oldKeeper.ready;
    const session = keeperSession(oldKeeper);
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    expect(await oldKeeper.handoff()).toBe("written");
    oldKeeper.destroy();
    const writesBefore = store.writes().length;

    const newOriginal: SongProject = { ...ORIGINAL, sourceKey: "new-song", score: SCORE_WITHOUT_F };
    const newSession = openSession(newOriginal);
    const { keeper } = openKeeper(newSession, newOriginal);
    await keeper.ready;

    expect(newSession.project).toBe(newOriginal);
    expect(store.writes()).toHaveLength(writesBefore);
  });

  it("restores a song's own draft written with the old raw source hash", async () => {
    // sha256(JSON.stringify(["la la", <SCORE with one trailing newline>])), the old raw formula.
    const oldRawHash = "6e8181f2bbcbeba9128e4cea1ccdd39f35b0a353a824ba2244b624fdf47af090";
    const ownOriginal: SongProject = { ...ORIGINAL, sourceKey: "own-song", score: `${SCORE}\n` };
    const ownDraft = await makeDraft(ownOriginal, {
      sourceKey: "own-song",
      sourceHash: oldRawHash,
      project: { ...draftProject(ownOriginal), score: `${SCORE_WITHOUT_D}\n` },
    });
    store.seed("own-song", JSON.stringify(ownDraft));
    const session = openSession(ownOriginal);

    const { keeper } = openKeeper(session, ownOriginal);
    await keeper.ready;

    expect(session.project.score).toBe(`${SCORE_WITHOUT_D}\n`);
    expect(keeper.status).toBe("ready");
  });

  it("inherits nothing when the lines join to other lyrics than the new song has", async () => {
    const inherited = await makeDraft(
      { ...ORIGINAL, sourceKey: "old-song" },
      {
        sourceKey: "old-song",
        handoffHash: sourceHashOf(),
        project: {
          ...draftProject(ORIGINAL),
          lyrics: "other words",
          lyricLines: [{ text: "other words", phrase: { firstBar: 0, barCount: 1 } }],
        },
      },
    );
    store.seed("old-song", JSON.stringify(inherited));
    const session = openSession();

    const { keeper } = openKeeper(session);
    await keeper.ready;

    expect(session.project).toBe(ORIGINAL);
    expect(store.writes()).toEqual([]);
  });

  it("stays the original when no draft matches", async () => {
    const first = await makeDraft(
      { ...ORIGINAL, sourceKey: "old-a" },
      { sourceKey: "old-a", handoffHash: expectedHash("not", "this") },
    );
    store.seed("old-a", JSON.stringify(first));
    const session = openSession();

    const { keeper, notices } = openKeeper(session);
    await keeper.ready;

    expect(session.project).toBe(ORIGINAL);
    expect(notices).toEqual([]);
    expect(store.writes()).toEqual([]);
  });
});

describe("keeping a draft", () => {
  it("writes once, about a second after the last project change, and not before", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;

    const session = keeperSession(keeper);
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(999);
    expect(store.writes()).toEqual([]);

    session.select(["Vocal:768"]);
    session.setView({ zoom: 2 });
    session.setInsertionPoint({ tick: 0 });
    await vi.advanceTimersByTimeAsync(1);

    const writes = store.writes();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.key).toBe(ORIGINAL.sourceKey);
    const draft = readDraft(writes[0]?.text ?? "");
    expect(draft?.project).toEqual({
      ...draftProject(session.project),
      score: SCORE_WITHOUT_D,
    });
    expect(draft?.sourceKey).toBe(ORIGINAL.sourceKey);
    expect(draft?.sourceHash).toBe(sourceHashOf());
    expect(draft?.handoffHash).toBeNull();
    expect(draft?.updatedAt).toBe(clock);
  });

  it("restarts the delay on every project change, so several changes make one write", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(600);
    session.dispatch({ type: "toRest", noteId: "Vocal:768" });
    await vi.advanceTimersByTimeAsync(600);
    expect(store.writes()).toEqual([]);

    await vi.advanceTimersByTimeAsync(400);
    expect(store.writes()).toHaveLength(1);
    expect(readDraft(store.writes()[0]?.text ?? "")?.project.score).toBe(session.project.score);
  });

  it("writes nothing for a selection, view or insertion point change", async () => {
    const session = openSession();
    const { keeper } = openKeeper(session);
    await keeper.ready;

    session.select(["Vocal:0"]);
    session.setView({ zoom: 3, scrollLeft: 20 });
    session.setInsertionPoint({ tick: 512 });
    session.undo();
    session.redo();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(store.writes()).toEqual([]);
    expect(store.removes()).toEqual([]);
  });

  it("removes the draft when the project returns to the original", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);
    const version = store.versionOf(ORIGINAL.sourceKey);
    expect(version).not.toBeNull();

    session.undo();
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);
    expect(store.removes()).toEqual([{ method: "remove", key: ORIGINAL.sourceKey, expected: version }]);
  });

  it("removes nothing when there is no draft and the change comes back inside the delay", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    session.undo();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.writes()).toEqual([]);
    expect(store.removes()).toEqual([]);
  });

  it("creates again after a removal instead of passing the removal's version", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);
    session.undo();
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.writes()).toHaveLength(2);
    expect(store.writes()[1]?.expected).toBeNull();
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(true);
    expect(keeper.status).toBe("ready");
  });
});

describe("a conflict", () => {
  async function conflict(beforeConflict?: (keeper: ReturnType<typeof createDraftKeeper>) => void) {
    const { keeper, notices } = openKeeper();
    await keeper.ready;
    beforeConflict?.(keeper);
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.writes()).toHaveLength(1);

    // Another window writes the same key after the version this keeper last saw.
    const theirs = await makeDraft(ORIGINAL, {
      project: { ...draftProject(ORIGINAL), score: SCORE_WITHOUT_F },
    });
    store.seed(ORIGINAL.sourceKey, JSON.stringify(theirs), "their-version");

    session.dispatch({ type: "toRest", noteId: "Vocal:768" });
    await vi.advanceTimersByTimeAsync(1000);

    return { keeper, notices, session, theirs };
  }

  it("stops writing and announces its state", async () => {
    const states: string[] = [];
    const { keeper } = await conflict((opening) => {
      opening.subscribe((change) => states.push(change.status));
    });

    expect(keeper.status).toBe("conflict");
    expect(states).toEqual(["conflict"]);

    const before = store.writes().length;
    const session = keeperSession(keeper);
    session.dispatch({ type: "toRest", noteId: "Vocal:1024" });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.writes()).toHaveLength(before);
    expect(keeper.status).toBe("conflict");
    expect(states).toEqual(["conflict"]);
  });

  it("overwrite reads their version and writes ours over it", async () => {
    const { keeper, session } = await conflict();
    const before = store.writes().length;

    await keeper.overwrite();

    const writes = store.writes();
    expect(writes).toHaveLength(before + 1);
    expect(writes[before]?.expected).toBe("their-version");
    expect(writes[before]?.key).toBe(ORIGINAL.sourceKey);
    expect(readDraft(store.files.get(ORIGINAL.sourceKey)?.text ?? "")?.project.score).toBe(session.project.score);
    expect(keeper.status).toBe("ready");
  });

  it("writes at the overwritten version on the next edit, with no new conflict", async () => {
    const { keeper, session } = await conflict();
    await keeper.overwrite();
    const version = store.versionOf(ORIGINAL.sourceKey);
    const before = store.writes().length;

    session.dispatch({ type: "toRest", noteId: "Vocal:1024" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.writes()).toHaveLength(before + 1);
    expect(store.writes()[before]?.expected).toBe(version);
    expect(keeper.status).toBe("ready");
  });

  it("load theirs puts their project into the session and leaves their text", async () => {
    const { keeper, session } = await conflict();
    const theirText = store.files.get(ORIGINAL.sourceKey)?.text ?? "";
    const writes = store.writes().length;

    await keeper.loadTheirs();

    expect(session.project.score).toBe(SCORE_WITHOUT_F);
    expect(session.project.sourceKey).toBe(ORIGINAL.sourceKey);
    expect(store.files.get(ORIGINAL.sourceKey)?.text).toBe(theirText);
    expect(store.writes()).toHaveLength(writes);
    expect(keeper.status).toBe("ready");
  });
});

describe("a failed write", () => {
  it("says the draft was not saved and the next project change tries again", async () => {
    const { keeper, notices } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);
    store.failWrites = 1;

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);
    expect(notices.map((notice) => notice.code)).toEqual(["draft-save-failed"]);
    expect(notices[0]?.level).toBe("error");
    expect(keeper.status).toBe("ready");

    session.dispatch({ type: "toRest", noteId: "Vocal:768" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.files.has(ORIGINAL.sourceKey)).toBe(true);
    expect(notices).toHaveLength(1);
  });
});

describe("restoring the original", () => {
  it("puts the original back, resets the history and removes the draft", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.canUndo).toBe(true);
    const version = store.versionOf(ORIGINAL.sourceKey);

    await keeper.restoreOriginal();

    expect(session.project).toEqual(ORIGINAL);
    expect(session.canUndo).toBe(false);
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);
    expect(store.removes()).toEqual([{ method: "remove", key: ORIGINAL.sourceKey, expected: version }]);
    expect(keeper.status).toBe("ready");
  });

  it("cancels a pending write", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await keeper.restoreOriginal();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.writes()).toEqual([]);
    expect(store.removes()).toEqual([]);
    expect(session.project).toEqual(ORIGINAL);
  });

  it("reads and removes a draft another window created after open", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    expect(store.calls.some((call) => call.method === "remove")).toBe(false);

    const ours = await makeDraft(ORIGINAL, {
      project: { ...draftProject(ORIGINAL), score: SCORE_WITHOUT_D },
    });
    store.seed(ORIGINAL.sourceKey, JSON.stringify(ours), "another-window");

    await keeper.restoreOriginal();

    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);
    expect(store.removes()).toEqual([{ method: "remove", key: ORIGINAL.sourceKey, expected: "another-window" }]);
    expect(keeper.status).toBe("ready");
  });

  it("reads and removes a text it cannot read", async () => {
    const futureText = JSON.stringify({ ...(await makeDraft()), version: 2 });
    store.seed(ORIGINAL.sourceKey, futureText, "unknown-version");
    const { keeper } = openKeeper();
    await keeper.ready;

    await keeper.restoreOriginal();

    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);
    expect(store.removes()).toEqual([{ method: "remove", key: ORIGINAL.sourceKey, expected: "unknown-version" }]);
  });

  it("creates again after restore instead of passing the removal's version", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);
    await keeper.restoreOriginal();
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.writes()).toHaveLength(2);
    expect(store.writes()[1]?.expected).toBeNull();
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(true);
    expect(keeper.status).toBe("ready");
  });
});

describe("a handoff", () => {
  it("writes the current draft at once with the joined lyrics and score hash", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });

    const joined = joinLyrics(parse(session.project.score), projectLines(session.project));
    const handoffHash = expectedHash(joined, session.project.score);
    const result = await keeper.handoff();

    expect(result).toBe("written");
    expect(store.writes()).toHaveLength(1);
    const draft = readDraft(store.writes()[0]?.text ?? "");
    expect(draft?.handoffHash).toBe(handoffHash);
    expect(draft?.updatedAt).toBe(clock);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.writes()).toHaveLength(1);
  });

  it("hashes the joined lyrics, so an unaligned line is not in the handoff hash", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);
    const withUnaligned: SongProject = {
      ...ORIGINAL,
      lyrics: "sung\nunsung",
      lyricLines: [
        { text: "sung", phrase: { firstBar: 0, barCount: 1 } },
        { text: "unsung", phrase: null },
      ],
    };
    session.replaceProject(withUnaligned);

    const joined = joinLyrics(parse(withUnaligned.score), withUnaligned.lyricLines ?? []);
    expect(joined).toBe("sung");
    await keeper.handoff();

    const draft = readDraft(store.writes()[0]?.text ?? "");
    expect(draft?.handoffHash).toBe(expectedHash("sung", withUnaligned.score));
    expect(draft?.project.lyrics).toBe("sung\nunsung");
  });

  it("writes nothing when the project equals the original, because there is nothing to inherit", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;

    const result = await keeper.handoff();

    expect(result).toBe("unchanged");
    expect(store.writes()).toEqual([]);
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(false);
  });

  it("keeps the last handoff hash when a later edit is saved", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await keeper.handoff();
    const handoffHash = readDraft(store.writes()[0]?.text ?? "")?.handoffHash;

    session.dispatch({ type: "toRest", noteId: "Vocal:768" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.writes()).toHaveLength(2);
    expect(readDraft(store.writes()[1]?.text ?? "")?.handoffHash).toBe(handoffHash);
  });
});

describe("destroying the keeper", () => {
  it("flushes a pending write, then stops the timer and the subscription", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    keeper.destroy();
    expect(store.files.has(ORIGINAL.sourceKey)).toBe(true);
    expect(keeper.status).toBe("destroyed");

    const writes = store.writes().length;
    session.dispatch({ type: "toRest", noteId: "Vocal:768" });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.writes()).toHaveLength(writes);
  });

  it("writes nothing on destroy when there is no pending change", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    keeper.destroy();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.writes()).toEqual([]);
  });

  it("is safe to destroy twice", async () => {
    const { keeper } = openKeeper();
    await keeper.ready;
    keeper.destroy();
    keeper.destroy();
    expect(keeper.status).toBe("destroyed");
  });
});

describe("the original", () => {
  it("is never changed, and only its own key is written or removed", async () => {
    const snapshot = JSON.stringify(ORIGINAL);
    const inherited = await makeDraft(
      { ...ORIGINAL, sourceKey: "old-song" },
      { sourceKey: "old-song", handoffHash: sourceHashOf() },
    );
    store.seed("old-song", JSON.stringify(inherited));
    const { keeper } = openKeeper();
    await keeper.ready;
    const session = keeperSession(keeper);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await vi.advanceTimersByTimeAsync(1000);
    const theirs = await makeDraft(ORIGINAL, { project: { ...draftProject(ORIGINAL), score: SCORE_WITHOUT_F } });
    store.seed(ORIGINAL.sourceKey, JSON.stringify(theirs), "their-version");
    session.dispatch({ type: "toRest", noteId: "Vocal:768" });
    await vi.advanceTimersByTimeAsync(1000);
    await keeper.overwrite();
    await keeper.handoff();
    await keeper.restoreOriginal();

    expect(JSON.stringify(ORIGINAL)).toBe(snapshot);
    const keyedCalls = store.calls.filter((call) => call.method === "write" || call.method === "remove");
    expect(keyedCalls.length).toBeGreaterThan(0);
    expect(keyedCalls.every((call) => call.key === ORIGINAL.sourceKey)).toBe(true);
    expect(store.calls.some((call) => call.method === "read" && call.key === "old-song")).toBe(true);
  });
});

/** The session a keeper was opened on, for a test that only kept the keeper. */
function keeperSession(keeper: ReturnType<typeof createDraftKeeper>): EditingSession {
  const session = sessions.get(keeper);
  if (session === undefined) throw new Error("the test keeper has no session");
  return session;
}

const sessions = new WeakMap<object, EditingSession>();

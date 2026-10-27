// ABOUTME: Seam 1 for a score file: a fake host file records every read and versioned save, and the keeper is driven through the real session.
// ABOUTME: The expected scores are written by hand; the file versions are the fake host's own opaque strings, not the package's values.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  createScoreFileKeeper,
  type EditingSession,
  type Notice,
  type ScoreFileSaveResult,
  type ScoreFileSource,
  type SongProject,
} from "@neta-art/score-editor";
import { beforeEach, describe, expect, it } from "vitest";

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

/** The version another writer made; its text is what "load theirs" must put in the session. */
const THEIR_SCORE = `${HEADER}
K:C
V: Vocal
C4D4E4G4|A16|`;

const PROJECT: SongProject = {
  style: "",
  lyrics: "",
  score: SCORE,
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "tune.abc",
  lyricLines: [],
};

const dialects = createDialectRegistry([song2Dialect]);

type SaveCall = { readonly text: string; readonly expected: string };

/** A host's score file, with the versions a real host owns and a knob for a conflict and a failure. */
class FakeFile implements ScoreFileSource {
  readonly kind = "scoreFile" as const;
  readonly name = "tune.abc";
  readonly version = "open-version";
  readonly saves: SaveCall[] = [];
  readonly reads: string[] = [];
  file = { text: SCORE, version: "open-version" };
  failSaves = 0;
  noAccessSaves = 0;
  failReads = 0;
  missing = false;
  private next = 1;

  async save(text: string, expected: string): Promise<ScoreFileSaveResult> {
    this.saves.push({ text, expected });
    if (this.noAccessSaves > 0) {
      this.noAccessSaves -= 1;
      return { ok: false, reason: "no-access" };
    }
    if (this.failSaves > 0) {
      this.failSaves -= 1;
      return { ok: false, reason: "failed" };
    }
    if (this.missing) {
      this.missing = false;
      const version = `save-${this.next++}`;
      this.file = { text, version };
      return { ok: true, version };
    }
    if (expected !== this.file.version) return { ok: false, reason: "conflict" };
    const version = `save-${this.next++}`;
    this.file = { text, version };
    return { ok: true, version };
  }

  async read() {
    this.reads.push(this.file.version);
    if (this.missing) return { ok: false as const, reason: "missing" as const };
    if (this.failReads > 0) {
      this.failReads -= 1;
      throw new Error("the file could not be read");
    }
    return { text: this.file.text, version: this.file.version };
  }

  /** Another window writes the file; its version is one the keeper has not seen. */
  external(text: string): string {
    const version = `other-${this.next++}`;
    this.file = { text, version };
    return version;
  }
}

let file: FakeFile;

beforeEach(() => {
  file = new FakeFile();
});

function openSession(project: SongProject = PROJECT): EditingSession {
  return createEditingSession({ project, dialects });
}

function openKeeper(session = openSession()) {
  const notices: Notice[] = [];
  const unsaved: boolean[] = [];
  const keeper = createScoreFileKeeper({
    session,
    original: session.project,
    source: file,
    notify: (notice) => notices.push(notice),
    onUnsavedChange: (value) => unsaved.push(value),
  });
  return { keeper, notices, unsaved, session };
}

/** Turns the D of bar 1 into a rest through the real command layer. */
function deleteD(session: EditingSession): void {
  const result = session.dispatch({ type: "toRest", noteId: "Vocal:256" });
  expect(result.ok).toBe(true);
}

describe("saving a score file", () => {
  it("writes nothing before the save, then sends the score and the opened version, and keeps the new version", async () => {
    const { keeper, unsaved, session } = openKeeper();
    expect(file.saves).toEqual([]);
    expect(file.reads).toEqual([]);
    expect(keeper.unsaved).toBe(false);

    deleteD(session);
    expect(keeper.unsaved).toBe(true);
    expect(unsaved).toEqual([true]);
    expect(file.saves).toEqual([]);

    const result = await keeper.save();
    expect(result).toEqual({ ok: true, version: "save-1" });
    expect(file.saves).toEqual([{ text: SCORE_WITHOUT_D, expected: "open-version" }]);
    expect(keeper.version).toBe("save-1");
    expect(keeper.unsaved).toBe(false);
    expect(unsaved).toEqual([true, false]);
    expect(keeper.savedProject.score).toBe(SCORE_WITHOUT_D);

    deleteDAgain(session);
    expect(keeper.unsaved).toBe(true);
    expect(await keeper.save()).toEqual({ ok: true, version: "save-2" });
    expect(file.saves.at(-1)).toEqual({ text: SCORE, expected: "save-1" });
  });

  it("answers a save with nothing to write without calling the host", async () => {
    const { keeper } = openKeeper();
    expect(await keeper.save()).toEqual({ ok: true, version: "open-version" });
    expect(file.saves).toEqual([]);
  });
});

/** Undo puts the D back, which makes the session equal to the opened project again. */
function deleteDAgain(session: EditingSession): void {
  expect(session.undo()).toBe(true);
  expect(session.project.score).toBe(SCORE);
}

describe("a conflict", () => {
  it("shows the two ways out, and overwrite reads their version and writes ours over it", async () => {
    const { keeper, session } = openKeeper();
    file.external(THEIR_SCORE);
    deleteD(session);

    expect(await keeper.save()).toEqual({ ok: false, reason: "conflict" });
    expect(keeper.status).toBe("conflict");
    expect(keeper.unsaved).toBe(true);
    expect(file.reads).toEqual([]);

    await keeper.overwrite();
    expect(file.reads).toEqual(["other-1"]);
    expect(file.saves.at(-1)).toEqual({ text: SCORE_WITHOUT_D, expected: "other-1" });
    expect(keeper.status).toBe("clean");
    expect(keeper.unsaved).toBe(false);
    expect(keeper.version).toBe("save-2");
    expect(file.file.text).toBe(SCORE_WITHOUT_D);
  });

  it("load theirs puts their text in the session and makes it the last saved version, without a write", async () => {
    const { keeper, session } = openKeeper();
    file.external(THEIR_SCORE);
    deleteD(session);
    await keeper.save();
    expect(keeper.status).toBe("conflict");

    await keeper.loadTheirs();
    expect(file.reads).toEqual(["other-1"]);
    expect(file.saves).toHaveLength(1);
    expect(session.project.score).toBe(THEIR_SCORE);
    expect(keeper.savedProject.score).toBe(THEIR_SCORE);
    expect(keeper.status).toBe("clean");
    expect(keeper.unsaved).toBe(false);
    expect(keeper.version).toBe("other-1");
  });
});

describe("a failed save", () => {
  it("keeps the changes unsaved, tells the host, and retries with the same version", async () => {
    const { keeper, notices, session } = openKeeper();
    deleteD(session);
    file.failSaves = 1;

    expect(await keeper.save()).toEqual({ ok: false, reason: "failed" });
    expect(keeper.status).toBe("dirty");
    expect(keeper.unsaved).toBe(true);
    expect(keeper.failed).toBe(true);
    expect(notices.map((notice) => notice.code)).toEqual(["score-save-failed"]);

    expect(await keeper.save()).toEqual({ ok: true, version: "save-1" });
    expect(keeper.failed).toBe(false);
    expect(file.saves.map((call) => call.expected)).toEqual(["open-version", "open-version"]);
  });
});

describe("handoff and restore", () => {
  it("saves first when the file is dirty, so the handoff always describes the saved file", async () => {
    const { keeper, session } = openKeeper();
    deleteD(session);
    expect(await keeper.handoff()).toBe("saved");
    expect(file.saves).toEqual([{ text: SCORE_WITHOUT_D, expected: "open-version" }]);
    expect(keeper.unsaved).toBe(false);
    expect(await keeper.handoff()).toBe("unchanged");
    expect(file.saves).toHaveLength(1);
  });

  it("keeps the project, stays unsaved and clears the conflict when the file is gone", async () => {
    const { keeper, notices, session } = openKeeper();
    deleteD(session);
    file.external(THEIR_SCORE);
    expect(await keeper.save()).toEqual({ ok: false, reason: "conflict" });
    expect(keeper.status).toBe("conflict");
    file.missing = true;

    await keeper.loadTheirs();

    expect(session.project.score).toBe(SCORE_WITHOUT_D);
    expect(keeper.status).toBe("dirty");
    expect(keeper.unsaved).toBe(true);
    expect(keeper.accessLost).toBe(false);
    // The missing read is not a load failure: nothing failed to load, there was simply nothing to load.
    expect(notices).toEqual([]);

    const saved = await keeper.save();
    expect(saved.ok).toBe(true);
    expect(file.file.text).toBe(SCORE_WITHOUT_D);
    expect(keeper.status).toBe("clean");
  });

  it("says a save was refused for access and keeps it until a save works", async () => {
    const { keeper, session } = openKeeper();
    deleteD(session);
    file.noAccessSaves = 1;
    expect(await keeper.save()).toEqual({ ok: false, reason: "no-access" });
    expect(keeper.failed).toBe(true);
    expect(keeper.accessLost).toBe(true);
    expect(keeper.status).toBe("dirty");

    const retry = await keeper.save();
    expect(retry.ok).toBe(true);
    expect(keeper.failed).toBe(false);
    expect(keeper.accessLost).toBe(false);
    expect(keeper.status).toBe("clean");
  });

  it("does not hand off when the save conflicts", async () => {
    const { keeper, session } = openKeeper();
    file.external(THEIR_SCORE);
    deleteD(session);
    expect(await keeper.handoff()).toBe("conflict");
    expect(keeper.status).toBe("conflict");
  });

  it("restores the last saved version without touching the host file", async () => {
    const { keeper, session } = openKeeper();
    deleteD(session);
    await keeper.save();
    expect(session.project.score).toBe(SCORE_WITHOUT_D);

    expect(session.dispatch({ type: "toRest", noteId: "Vocal:512" }).ok).toBe(true);
    expect(keeper.unsaved).toBe(true);
    expect(await keeper.restoreOriginal()).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
    expect(keeper.unsaved).toBe(false);
    expect(keeper.status).toBe("clean");
    expect(file.saves).toHaveLength(1);
  });
});

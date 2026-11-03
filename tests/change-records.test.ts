// ABOUTME: Seam 1 for the change record: agent batches appended, listed, undone as a batch and cleared, through the package entry.
// ABOUTME: The expected projects are written out by hand from the song2 score text; the record is read only through its own functions and the command entry.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  type ChangeRecord,
  changeRecordsOf,
  createDialectRegistry,
  createEditingSession,
  recordChangeBatch,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

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

/** The same score after the E of bar 1 becomes a rest too. */
const SCORE_WITHOUT_E = `${HEADER}
K:C
V: Vocal
C4D4z4F4|G16|`;

const dialects = createDialectRegistry([song2Dialect]);

const PROJECT: SongProject = {
  style: "pop",
  lyrics: "la la",
  score: SCORE,
  scoreMode: "full",
  seed: 7,
  modelId: "song2",
  sourceKey: "song-1",
};

describe("appending a batch", () => {
  it("keeps the batch with its author, name, time, note and commands, and the project it started from", () => {
    const commands = [{ type: "replaceScoreText", text: SCORE_WITHOUT_D }] as const;
    const after: SongProject = { ...PROJECT, score: SCORE_WITHOUT_D };
    const recorded = recordChangeBatch(PROJECT, after, {
      author: "agent-a",
      batch: "run-1",
      at: 1_700_000_200_000,
      note: "Rested the D",
      commands: [...commands],
    });

    expect(recorded.score).toBe(SCORE_WITHOUT_D);
    expect(changeRecordsOf(recorded)).toStrictEqual([
      {
        author: "agent-a",
        batch: "run-1",
        at: 1_700_000_200_000,
        note: "Rested the D",
        commands: [{ type: "replaceScoreText", text: SCORE_WITHOUT_D }],
        before: PROJECT,
      },
    ]);
  });
});

/** A batch of the record: the score it leaves is the given one, and its one command writes that text. */
function batchOf(name: string, at: number, score: string) {
  return {
    author: "agent-a",
    batch: name,
    at,
    note: `batch ${name}`,
    commands: [{ type: "replaceScoreText" as const, text: score }],
  };
}

describe("undoing a batch of the change record", () => {
  it("replaces the project with the one saved before the batch, keeps the batches before it, and drops it and the ones after", () => {
    const afterFirst: SongProject = { ...PROJECT, score: SCORE_WITHOUT_D };
    const recorded = recordChangeBatch(PROJECT, afterFirst, batchOf("run-1", 1, SCORE_WITHOUT_D));
    const twoBatches = recordChangeBatch(
      recorded,
      { ...recorded, score: SCORE_WITHOUT_E },
      batchOf("run-2", 2, SCORE_WITHOUT_E),
    );
    const firstRecord: ChangeRecord = {
      author: "agent-a",
      batch: "run-1",
      at: 1,
      note: "batch run-1",
      commands: [{ type: "replaceScoreText", text: SCORE_WITHOUT_D }],
      before: PROJECT,
    };
    expect(changeRecordsOf(recorded)).toStrictEqual([firstRecord]);

    const undone = applyProjectCommand(song2Dialect, twoBatches, { type: "undoChangeBatch", batch: "run-2" });

    expect(undone.project).toStrictEqual({ ...afterFirst, changeRecords: [firstRecord] });
  });

  it("keeps the stop marks and the handed-out time as they are now, since they are the editor's and not the song's", () => {
    const afterFirst: SongProject = { ...PROJECT, score: SCORE_WITHOUT_D };
    const recorded = recordChangeBatch(PROJECT, afterFirst, batchOf("run-1", 1, SCORE_WITHOUT_D));
    const current = {
      ...recordChangeBatch(recorded, { ...recorded, score: SCORE_WITHOUT_E }, batchOf("run-2", 2, SCORE_WITHOUT_E)),
      stoppedBatches: ["run-9"],
      handedOutAt: 5,
    };

    const undone = applyProjectCommand(song2Dialect, current, { type: "undoChangeBatch", batch: "run-1" });

    expect(undone.project).toStrictEqual({ ...PROJECT, stoppedBatches: ["run-9"], handedOutAt: 5 });
  });

  it("is one history step of a session, and undo takes it back", () => {
    const afterFirst: SongProject = { ...PROJECT, score: SCORE_WITHOUT_D };
    const recorded = recordChangeBatch(PROJECT, afterFirst, batchOf("run-1", 1, SCORE_WITHOUT_D));
    const twoBatches = recordChangeBatch(
      recorded,
      { ...recorded, score: SCORE_WITHOUT_E },
      batchOf("run-2", 2, SCORE_WITHOUT_E),
    );
    const session = createEditingSession({ project: twoBatches, dialects });

    const result = session.dispatch({ type: "undoChangeBatch", batch: "run-2" });

    expect(result.ok).toBe(true);
    expect(session.project).toStrictEqual({ ...afterFirst, changeRecords: changeRecordsOf(recorded) });
    expect(session.steps).toStrictEqual([{ author: "user", note: "" }]);
    expect(session.undo()).toBe(true);
    expect(session.project).toStrictEqual(twoBatches);
  });

  it("refuses a batch the record does not hold, and leaves the project as it was", () => {
    const recorded = recordChangeBatch(
      PROJECT,
      { ...PROJECT, score: SCORE_WITHOUT_D },
      batchOf("run-1", 1, SCORE_WITHOUT_D),
    );

    const refused = applyProjectCommand(song2Dialect, recorded, { type: "undoChangeBatch", batch: "run-9" });

    expect(refused.project).toBe(recorded);
    expect(refused.diagnostics.map((diagnostic) => diagnostic.code)).toStrictEqual(["nothing-to-undo"]);
  });
});

describe("clearing the change record", () => {
  it("drops the record once the user has kept it, and leaves a project without one as it was", () => {
    const afterFirst: SongProject = { ...PROJECT, score: SCORE_WITHOUT_D };
    const recorded = recordChangeBatch(PROJECT, afterFirst, batchOf("run-1", 1, SCORE_WITHOUT_D));

    const cleared = applyProjectCommand(song2Dialect, recorded, { type: "clearChangeRecords" });

    expect(cleared.project).toStrictEqual(afterFirst);
    expect(changeRecordsOf(cleared.project)).toStrictEqual([]);
    expect(applyProjectCommand(song2Dialect, PROJECT, { type: "clearChangeRecords" }).project).toStrictEqual(PROJECT);
  });
});

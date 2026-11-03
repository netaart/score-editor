// ABOUTME: Seam 1 for the history's authors, batches and notes: the editing session driven through the entry with real commands.
// ABOUTME: Expected score texts are worked out by hand from the song2 score text; the history is read only through the session.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  type EditingSession,
  formatDiagnostic,
  type ScoreTool,
  type SessionChange,
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

/** The same score after the E of bar 1 becomes a rest. */
const SCORE_WITHOUT_E = `${HEADER}
K:C
V: Vocal
C4D4z4F4|G16|`;

/** The same score after the D and the E of bar 1 become rests. */
const SCORE_WITHOUT_D_AND_E = `${HEADER}
K:C
V: Vocal
C4z4z4F4|G16|`;

/** The same score after the D, the E and the F of bar 1 become rests. */
const SCORE_WITHOUT_D_E_AND_F = `${HEADER}
K:C
V: Vocal
C4z4z4z4|G16|`;

/** The same score after the E of bar 1 and the G of bar 2 become rests. */
const SCORE_WITHOUT_E_AND_G = `${HEADER}
K:C
V: Vocal
C4D4z4F4|z16|`;

const dialects = createDialectRegistry([song2Dialect]);

const project: SongProject = {
  style: "pop",
  lyrics: "la la",
  score: SCORE,
  scoreMode: "full",
  seed: 7,
  modelId: "song2",
  sourceKey: "history-test",
};

function open(): EditingSession {
  return createEditingSession({ project, dialects });
}

/** A custom tool that rests the D of bar 1, the way a person's tool would. */
const restTheD: ScoreTool = {
  id: "rest-the-d",
  name: { en: "Rest the D", zh: "休止 D" },
  commands: () => [{ type: "toRest", noteId: "Vocal:256" }],
};

describe("the author, batch and note of a history step", () => {
  it("are the user, in no batch and with no sentence, when the edit gives none", () => {
    const session = open();
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });

    expect(session.steps).toStrictEqual([{ author: "user", note: "" }]);
  });

  it("are the ones the edit gives", () => {
    const session = open();
    session.dispatch(
      { type: "toRest", noteId: "Vocal:256" },
      { author: "agent-a", batch: "run-1", note: "Rested the D in bar 1" },
    );

    expect(session.steps).toStrictEqual([{ author: "agent-a", batch: "run-1", note: "Rested the D in bar 1" }]);
  });
});

describe("undo and redo as commands", () => {
  it("are dispatched like an edit: undo takes back the last step, redo brings it back, and neither adds a step", () => {
    const session = open();
    session.dispatch(
      { type: "toRest", noteId: "Vocal:256" },
      { author: "agent-a", batch: "run-3", note: "Rested the D" },
    );
    session.dispatch({ type: "toRest", noteId: "Vocal:512" }, { note: "Rested the E" });
    const both = [
      { author: "agent-a", batch: "run-3", note: "Rested the D" },
      { author: "user", note: "Rested the E" },
    ];
    expect(session.steps).toStrictEqual(both);

    const undone = session.dispatch({ type: "undo" });
    expect(undone.ok).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
    expect(session.steps).toStrictEqual([both[0]]);

    const redone = session.dispatch({ type: "redo" });
    expect(redone.ok).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D_AND_E);
    expect(session.steps).toStrictEqual(both);
  });

  it("are refused with the reason when there is nothing to take back or bring back", () => {
    const session = open();

    const undo = session.dispatch({ type: "undo" });
    expect(undo.ok).toBe(false);
    expect(undo.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["nothing-to-undo"]);
    expect(undo.project).toBe(project);

    const redo = session.dispatch({ type: "redo" });
    expect(redo.ok).toBe(false);
    expect(redo.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["nothing-to-redo"]);
    expect(session.steps).toStrictEqual([]);
  });
});

describe("undoing a batch", () => {
  it("takes back every step from the batch's first one to the top, and redo brings them back one by one", () => {
    const session = open();
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    session.dispatch(
      { type: "toRest", noteId: "Vocal:512" },
      { author: "agent-a", batch: "run-4", note: "Rested the E" },
    );
    session.dispatch(
      { type: "toRest", noteId: "Vocal:768" },
      { author: "agent-a", batch: "run-4", note: "Rested the F" },
    );

    const result = session.dispatch({ type: "undoBatch", batch: "run-4" });
    expect(result.ok).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
    expect(session.steps).toStrictEqual([{ author: "user", note: "" }]);

    expect(session.dispatch({ type: "redo" }).ok).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D_AND_E);
    expect(session.dispatch({ type: "redo" }).ok).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D_E_AND_F);
    expect(session.steps.map((step) => step.batch)).toStrictEqual([undefined, "run-4", "run-4"]);
  });

  it("asks before it takes back the steps of another author, and takes nothing back until they are confirmed", () => {
    const session = open();
    session.dispatch(
      { type: "toRest", noteId: "Vocal:512" },
      { author: "agent-a", batch: "run-5", note: "Rested the E" },
    );
    session.dispatch({ type: "toRest", noteId: "Vocal:1024" }, { note: "Rested the G" });
    const before = session.project;

    const asked = session.dispatch({ type: "undoBatch", batch: "run-5" });
    expect(asked.ok).toBe(false);
    expect(asked.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["batch-undo-confirm"]);
    expect(asked).toMatchObject({ otherAuthorSteps: [{ author: "user", note: "Rested the G" }] });
    expect(asked.project).toBe(before);
    expect(session.project).toBe(before);
    expect(session.steps).toHaveLength(2);

    const confirmed = session.dispatch({ type: "undoBatch", batch: "run-5", confirm: true });
    expect(confirmed.ok).toBe(true);
    expect(session.project.score).toBe(SCORE);
    expect(session.steps).toStrictEqual([]);

    session.dispatch({ type: "redo" });
    session.dispatch({ type: "redo" });
    expect(session.project.score).toBe(SCORE_WITHOUT_E_AND_G);
  });

  it("is refused with nothing-to-undo, naming the batch, when no step of it is in the history", () => {
    const session = open();
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });

    const result = session.dispatch({ type: "undoBatch", batch: "run-x" });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["nothing-to-undo"]);
    expect(result.diagnostics[0]?.params).toStrictEqual({ batch: "run-x" });
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
  });
});

describe("stopping a batch", () => {
  it("refuses the batch's later edits, the reason saying the user stopped it, and leaves what it made in place", () => {
    const session = open();
    session.dispatch(
      { type: "toRest", noteId: "Vocal:512" },
      { author: "agent-a", batch: "run-6", note: "Rested the E" },
    );
    session.stopBatch("run-6");
    const before = session.project;
    const origin = { author: "agent-a", batch: "run-6" };

    const edit = session.dispatch({ type: "toRest", noteId: "Vocal:768" }, { ...origin, note: "Rested the F" });
    expect(edit.ok).toBe(false);
    expect(edit.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["batch-stopped"]);
    expect(edit.diagnostics[0]?.params).toStrictEqual({ batch: "run-6" });
    expect(edit.project).toBe(before);

    const list = session.dispatchAll([{ type: "toRest", noteId: "Vocal:256" }], origin);
    expect(list.ok).toBe(false);
    expect(list.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["batch-stopped"]);

    const tool = session.runTool(restTheD, {}, origin);
    expect(tool.ok).toBe(false);
    expect(tool.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["batch-stopped"]);

    expect(session.project).toBe(before);
    expect(session.project.score).toBe(SCORE_WITHOUT_E);
    expect(session.steps).toStrictEqual([{ ...origin, note: "Rested the E" }]);
  });

  it("does not refuse the edits of another batch or of the user", () => {
    const session = open();
    session.stopBatch("run-6");

    expect(session.dispatch({ type: "toRest", noteId: "Vocal:256" }, { author: "agent-b", batch: "run-7" }).ok).toBe(
      true,
    );
    expect(session.dispatch({ type: "toRest", noteId: "Vocal:512" }).ok).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D_AND_E);
  });

  it("still lets the user take the stopped batch back", () => {
    const session = open();
    session.dispatch(
      { type: "toRest", noteId: "Vocal:512" },
      { author: "agent-a", batch: "run-6", note: "Rested the E" },
    );
    session.stopBatch("run-6");

    const taken = session.dispatch({ type: "undoBatch", batch: "run-6" });
    expect(taken.ok).toBe(true);
    expect(session.project.score).toBe(SCORE);
  });

  it("refuses an agent's undo, redo and batch undo while its origin carries the stopped batch", () => {
    const session = open();
    session.dispatch(
      { type: "toRest", noteId: "Vocal:512" },
      { author: "agent-a", batch: "run-6", note: "Rested the E" },
    );
    session.dispatch({ type: "toRest", noteId: "Vocal:1024" }, { note: "Rested the G" });
    session.dispatch({ type: "undo" });
    session.stopBatch("run-6");
    const before = session.project;
    const origin = { author: "agent-a", batch: "run-6" };

    for (const command of [{ type: "undo" }, { type: "redo" }, { type: "undoBatch", batch: "run-6" }] as const) {
      const result = session.dispatch(command, origin);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["batch-stopped"]);
      expect(result.diagnostics[0]?.params).toStrictEqual({ batch: "run-6" });
      expect(result.project).toBe(before);
    }

    expect(session.project).toBe(before);
    expect(session.project.score).toBe(SCORE_WITHOUT_E);
    expect(session.canRedo).toBe(true);
    expect(session.steps).toStrictEqual([{ ...origin, note: "Rested the E" }]);
  });

  it("refuses an agent's undoBatch that names a stopped batch, whatever batch the agent's origin carries, and still lets the user take it back", () => {
    const session = open();
    session.dispatch(
      { type: "toRest", noteId: "Vocal:512" },
      { author: "agent-a", batch: "run-6", note: "Rested the E" },
    );
    session.stopBatch("run-6");
    const before = session.project;

    for (const origin of [{ author: "agent-b", batch: "run-7" }, { author: "agent-b" }]) {
      const result = session.dispatch({ type: "undoBatch", batch: "run-6" }, origin);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["batch-stopped"]);
      expect(result.diagnostics[0]?.params).toStrictEqual({ batch: "run-6" });
      expect(result.project).toBe(before);
    }
    expect(session.project.score).toBe(SCORE_WITHOUT_E);
    expect(session.steps).toStrictEqual([{ author: "agent-a", batch: "run-6", note: "Rested the E" }]);

    expect(session.dispatch({ type: "undoBatch", batch: "run-6" }).ok).toBe(true);
    expect(session.project.score).toBe(SCORE);
  });

  it("is kept on record, and is announced once as a change of its own", () => {
    const session = open();
    const changes: SessionChange[] = [];
    session.subscribe((change) => changes.push(change));

    session.stopBatch("run-6");
    session.stopBatch("run-6");

    expect(session.stoppedBatches).toStrictEqual(["run-6"]);
    expect(changes).toStrictEqual([
      { cause: "batch-stop", project: false, selection: false, insertionPoint: false, view: false },
    ]);
  });

  it("is kept when the project is replaced from outside, since the history goes but the stop does not", () => {
    const session = open();
    session.stopBatch("run-6");
    session.replaceProject({ ...project, sourceKey: "history-test-2" });

    expect(session.stoppedBatches).toStrictEqual(["run-6"]);
    expect(session.dispatch({ type: "toRest", noteId: "Vocal:256" }, { batch: "run-6" }).ok).toBe(false);
  });
});

describe("the refusals of a batch say what happened", () => {
  it("name the batch, and say the user stopped it or how many steps of others a batch undo would take back", () => {
    const stopped = { code: "batch-stopped", params: { batch: "run-6" }, at: {} } as const;
    const confirm = { code: "batch-undo-confirm", params: { batch: "run-6", count: 2 }, at: {} } as const;

    expect(formatDiagnostic(stopped, "en")).toContain("run-6");
    expect(formatDiagnostic(stopped, "en")).toContain("stopped");
    expect(formatDiagnostic(stopped, "zh")).toContain("run-6");
    expect(formatDiagnostic(stopped, "zh")).toContain("停下");
    expect(formatDiagnostic(confirm, "en")).toContain("2 step");
    expect(formatDiagnostic(confirm, "zh")).toContain("2 步");
  });
});

describe("the origin of a tool run and of a list of commands", () => {
  it("a run of a tool is one step that carries the origin it was given", () => {
    const session = open();
    const result = session.runTool(restTheD, {}, { author: "agent-a", batch: "run-2", note: "Rested the D by a tool" });

    expect(result.ok).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
    expect(session.steps).toStrictEqual([{ author: "agent-a", batch: "run-2", note: "Rested the D by a tool" }]);
  });

  it("a list of commands dispatched as one step carries the origin it was given", () => {
    const session = open();
    const result = session.dispatchAll(
      [
        { type: "toRest", noteId: "Vocal:256" },
        { type: "toRest", noteId: "Vocal:512" },
      ],
      { author: "agent-a", batch: "run-2", note: "Rested the D and the E" },
    );

    expect(result.ok).toBe(true);
    expect(session.steps).toStrictEqual([{ author: "agent-a", batch: "run-2", note: "Rested the D and the E" }]);
  });
});

describe("the changes a step makes, undoes or redoes carry the step", () => {
  it("a dispatch that makes a step carries the step its origin gives, and a user's step carries the user as its author", () => {
    const session = open();
    const changes: SessionChange[] = [];
    session.subscribe((change) => changes.push(change));

    session.dispatch(
      { type: "toRest", noteId: "Vocal:256" },
      { author: "agent-a", batch: "run-1", note: "Rested the D" },
    );
    session.dispatch({ type: "toRest", noteId: "Vocal:512" });

    expect(changes).toStrictEqual([
      {
        cause: "dispatch",
        project: true,
        selection: false,
        insertionPoint: false,
        view: false,
        step: { author: "agent-a", batch: "run-1", note: "Rested the D" },
      },
      {
        cause: "dispatch",
        project: true,
        selection: false,
        insertionPoint: false,
        view: false,
        step: { author: "user", note: "" },
      },
    ]);
  });

  it("an undo and a redo carry the step they move, so a view can say which step went back or came forward", () => {
    const session = open();
    session.dispatch(
      { type: "toRest", noteId: "Vocal:256" },
      { author: "agent-a", batch: "run-3", note: "Rested the D" },
    );
    const changes: SessionChange[] = [];
    session.subscribe((change) => changes.push(change));

    session.dispatch({ type: "undo" });
    session.dispatch({ type: "redo" });

    const step = { author: "agent-a", batch: "run-3", note: "Rested the D" };
    expect(changes).toStrictEqual([
      { cause: "undo", project: true, selection: false, insertionPoint: false, view: false, step },
      { cause: "redo", project: true, selection: false, insertionPoint: false, view: false, step },
    ]);
  });

  it("a batch undo announces one undo change for each step it takes back, each carrying its own step", () => {
    const session = open();
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    session.dispatch(
      { type: "toRest", noteId: "Vocal:512" },
      { author: "agent-a", batch: "run-4", note: "Rested the E" },
    );
    session.dispatch(
      { type: "toRest", noteId: "Vocal:768" },
      { author: "agent-a", batch: "run-4", note: "Rested the F" },
    );
    const changes: SessionChange[] = [];
    session.subscribe((change) => changes.push(change));

    session.dispatch({ type: "undoBatch", batch: "run-4" });

    expect(changes).toStrictEqual([
      {
        cause: "undo",
        project: true,
        selection: false,
        insertionPoint: false,
        view: false,
        step: { author: "agent-a", batch: "run-4", note: "Rested the F" },
      },
      {
        cause: "undo",
        project: true,
        selection: false,
        insertionPoint: false,
        view: false,
        step: { author: "agent-a", batch: "run-4", note: "Rested the E" },
      },
    ]);
  });
});

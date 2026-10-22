// ABOUTME: Seam 1 for the editing session: it is imported from the package entry in Node and driven with the real to-rest command.
// ABOUTME: Expected score texts are worked out by hand from RULES.md; the session is never compared with the layer it calls.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  type EditingSession,
  handleEditingInput,
  type SessionChange,
  type SongProject,
} from "@neta-art/score-editor";
import { afterEach, describe, expect, it, vi } from "vitest";

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
const SCORE_WITHOUT_D_AND_F = `${HEADER}
K:C
V: Vocal
C4z4E4z4|G16|`;

const dialects = createDialectRegistry([song2Dialect]);

const project: SongProject = {
  style: "pop",
  lyrics: "la la",
  score: SCORE,
  scoreMode: "full",
  seed: 7,
  modelId: "song2",
  sourceKey: "session-test",
};

function open(overrides: Partial<SongProject> = {}): EditingSession {
  return createEditingSession({ project: { ...project, ...overrides }, dialects });
}

function listen(session: EditingSession): SessionChange[] {
  const changes: SessionChange[] = [];
  session.subscribe((change) => changes.push(change));
  return changes;
}

describe("a session in node", () => {
  it("holds the project and reads it where there is no DOM to touch", () => {
    expect(typeof document).toBe("undefined");
    const session = open();
    expect(session.project).toEqual(project);
    expect(session.reading.kind).toBe("score");
  });
});

describe("dispatching a command", () => {
  it("applies to-rest to the project and reports no diagnostics", () => {
    const session = open();
    const result = session.dispatch({ type: "toRest", noteId: "Vocal:256" });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.project.score).toBe(SCORE_WITHOUT_D);
    expect(session.project).toBe(result.project);
    expect(session.project).toEqual({ ...project, score: SCORE_WITHOUT_D });
  });

  it("adds no step and announces nothing when the command leaves the project as it was", () => {
    // The headless layer hands back a new project object holding the same text, so the session has to compare fields.
    const writesTheTextBack = { ...song2Dialect, serialize: () => SCORE };
    const session = createEditingSession({ project, dialects: createDialectRegistry([writesTheTextBack]) });
    const changes = listen(session);

    const result = session.dispatch({ type: "toRest", noteId: "Vocal:256" });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(session.project).toBe(project);
    expect(result.project).toBe(project);
    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([]);
  });
});

describe("a refused command", () => {
  it("changes nothing and returns the diagnostic of the layer that refused it", () => {
    const session = open();
    const before = session.project;

    const missing = session.dispatch({ type: "toRest", noteId: "Vocal:999" });
    expect(missing.ok).toBe(false);
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["note-not-found"]);
    expect(missing.diagnostics[0]?.at).toEqual({ noteId: "Vocal:999" });
    expect(missing.project).toBe(before);
    expect(session.project).toBe(before);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    const rest = session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    expect(rest.ok).toBe(false);
    expect(rest.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["not-a-note"]);
    // The D is the second quarter of bar 1: a person counts it as beat 2.
    expect(rest.diagnostics[0]?.at).toEqual({ voice: "Vocal", bar: 1, beat: 2, noteId: "Vocal:256" });
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
  });

  it("is refused with the reading diagnostic when the score cannot be read", () => {
    const broken = `${HEADER}
K:C
V: Vocal
C5|`;
    const session = open({ score: broken });
    const result = session.dispatch({ type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["duration"]);
    expect(session.project.score).toBe(broken);
  });

  it("is refused with a diagnostic of its own when no dialect reads the project's model", () => {
    const session = open({ modelId: "other-model" });
    const result = session.dispatch({ type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["no-dialect"]);
    expect(result.diagnostics[0]?.params).toEqual({ modelId: "other-model" });
    expect(session.project.score).toBe(SCORE);
  });
});

describe("deleting the selection", () => {
  const deleteKey = { type: "key", key: "Delete" } as const;

  it("is one edit for notes of different chains: one history step, one announcement, one undo brings both back", () => {
    const session = open();
    session.select(["Vocal:256", "Vocal:768"]);
    const changes = listen(session);

    const result = handleEditingInput(session, deleteKey);

    expect(result).toEqual({ handled: true, refused: [] });
    expect(session.project.score).toBe(SCORE_WITHOUT_D_AND_F);
    expect(changes).toEqual([
      { cause: "dispatch", project: true, selection: false, insertionPoint: false, view: false },
    ]);
    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);
  });

  it("takes a tie chain whose segments are all selected as one command, so the second segment refuses nothing", () => {
    const tied = `${HEADER}
K:D
V: Vocal
A4^F12-|F16|`;
    const session = open({ score: tied });
    session.select(["Vocal:256", "Vocal:1024"]);
    const changes = listen(session);

    expect(handleEditingInput(session, deleteKey)).toEqual({ handled: true, refused: [] });
    expect(changes).toHaveLength(1);
    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(tied);
    expect(session.canUndo).toBe(false);
  });

  it("refuses the whole run when one of its notes is refused, leaving project, history and selection as they were", () => {
    // The C of bar 2 is tied into a cut tail: writing it as a rest would turn the cut into a finished score.
    const cut = `${HEADER}
K:C
V: Vocal
C4D4E4F4|C16-|B`;
    const session = open({ score: cut });
    session.select(["Vocal:256", "Vocal:1024"]);
    const before = { project: session.project, selection: session.selection };
    const changes = listen(session);

    const result = handleEditingInput(session, deleteKey);

    expect(result.handled).toBe(true);
    expect(result.refused.map((diagnostic) => diagnostic.code)).toEqual(["write-mismatch"]);
    expect(result.refused[0]?.at).toEqual({ voice: "Vocal", bar: 2, beat: 1, noteId: "Vocal:1024" });
    expect(session.project).toEqual(before.project);
    expect(session.selection).toEqual(before.selection);
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
    expect(changes).toEqual([]);
  });
});

describe("notifications", () => {
  it("announces an applied command once, naming what it touched, and a refused command not at all", () => {
    const session = open();
    const changes = listen(session);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    expect(changes).toEqual([
      { cause: "dispatch", project: true, selection: false, insertionPoint: false, view: false },
    ]);

    session.dispatch({ type: "toRest", noteId: "Vocal:999" });
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    expect(changes).toHaveLength(1);
  });

  it("stops announcing to a listener that unsubscribed, and keeps announcing to the others", () => {
    const session = open();
    const first: SessionChange[] = [];
    const second = listen(session);
    const stop = session.subscribe((change) => first.push(change));

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    stop();
    stop();
    session.dispatch({ type: "toRest", noteId: "Vocal:768" });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
  });

  it("delivers a change a listener causes after the current change has reached every listener, in order", () => {
    const session = open();
    const seen: string[] = [];
    session.subscribe((change) => {
      seen.push(`first:${change.cause}:${session.project.score === SCORE_WITHOUT_D ? "D" : "DF"}`);
      if (change.cause === "dispatch" && session.project.score === SCORE_WITHOUT_D) {
        session.dispatch({ type: "toRest", noteId: "Vocal:768" });
      }
    });
    session.subscribe((change) => {
      seen.push(`second:${change.cause}:${session.project.score === SCORE_WITHOUT_D ? "D" : "DF"}`);
    });

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });

    expect(session.project.score).toBe(SCORE_WITHOUT_D_AND_F);
    expect(seen).toEqual(["first:dispatch:D", "second:dispatch:DF", "first:dispatch:DF", "second:dispatch:DF"]);
  });
});

describe("undo and redo", () => {
  it("walk back and forward through the score texts, one step for each applied command", () => {
    const session = open();
    expect([session.canUndo, session.canRedo]).toEqual([false, false]);
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    session.dispatch({ type: "toRest", noteId: "Vocal:768" });
    expect([session.canUndo, session.canRedo]).toEqual([true, false]);
    const changes = listen(session);

    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(SCORE);
    expect(session.project).toEqual(project);
    expect([session.canUndo, session.canRedo]).toEqual([false, true]);

    expect(session.undo()).toBe(false);
    expect(session.project.score).toBe(SCORE);

    expect(session.redo()).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
    expect(session.redo()).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D_AND_F);
    expect(session.redo()).toBe(false);
    expect([session.canUndo, session.canRedo]).toEqual([true, false]);

    expect(changes.map((change) => change.cause)).toEqual(["undo", "undo", "redo", "redo"]);
    for (const change of changes) expect(change).toMatchObject({ project: true, view: false });
  });

  it("drop what could be redone once a new command is applied", () => {
    const session = open();
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    session.undo();
    expect(session.canRedo).toBe(true);

    session.dispatch({ type: "toRest", noteId: "Vocal:768" });

    expect(session.canRedo).toBe(false);
    expect(session.redo()).toBe(false);
    expect(session.project.score).toBe(`${HEADER}
K:C
V: Vocal
C4D4E4z4|G16|`);
  });

  it("do nothing, and say nothing, when there is nothing to undo or redo", () => {
    const session = open();
    const changes = listen(session);

    expect(session.undo()).toBe(false);
    expect(session.redo()).toBe(false);

    expect(changes).toEqual([]);
    expect(session.project).toEqual(project);
  });
});

describe("reading the project's score", () => {
  it("offers the score the dialect read, the same object until the score changes", () => {
    const session = open();
    const first = session.reading;

    expect(first.kind).toBe("score");
    if (first.kind !== "score") return;
    expect(first.score.notes.map((note) => note.id)).toEqual([
      "Vocal:0",
      "Vocal:256",
      "Vocal:512",
      "Vocal:768",
      "Vocal:1024",
    ]);
    expect(session.reading).toBe(first);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    const second = session.reading;
    expect(second).not.toBe(first);
    expect(second.kind === "score" && second.score.notes.filter((note) => note.midi === null)).toHaveLength(1);
    expect(session.reading).toBe(second);

    session.undo();
    expect(session.reading.kind === "score" && session.reading.score.notes.every((note) => note.midi !== null)).toBe(
      true,
    );
  });

  it("says why there is no score: the diagnostics of an unreadable text, or the model that has no dialect", () => {
    const unreadable = open({ score: `${HEADER}\nK:C\nV: Vocal\nC5|` }).reading;
    expect(unreadable.kind).toBe("unreadable");
    expect(unreadable.kind === "unreadable" && unreadable.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "duration",
    ]);

    expect(open({ modelId: "other-model" }).reading).toEqual({ kind: "no-dialect", modelId: "other-model" });
  });
});

describe("the selection", () => {
  it("holds note ids, leaves out ids that name no note, and says nothing when it stays the same", () => {
    const session = open();
    const changes = listen(session);
    expect(session.selection).toEqual([]);

    session.select(["Vocal:256", "Vocal:999", "Vocal:256", "Vocal:768"]);
    expect(session.selection).toEqual(["Vocal:256", "Vocal:768"]);
    session.select(["Vocal:256", "Vocal:768"]);
    expect(changes).toEqual([{ cause: "select", project: false, selection: true, insertionPoint: false, view: false }]);

    session.select([]);
    expect(session.selection).toEqual([]);
    expect(changes).toHaveLength(2);
  });

  it("selects nothing when the score cannot be read", () => {
    const session = open({ score: `${HEADER}\nK:C\nV: Vocal\nC5|` });
    session.select(["Vocal:0"]);
    expect(session.selection).toEqual([]);
  });

  it("is not part of the history: a selection change is no step to undo, and an edit is still one step", () => {
    const session = open();
    session.select(["Vocal:0"]);
    expect([session.canUndo, session.canRedo]).toEqual([false, false]);
    expect(session.undo()).toBe(false);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    session.select(["Vocal:512"]);
    session.select(["Vocal:512", "Vocal:768"]);
    session.select([]);

    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);
  });

  it("keeps naming the same notes through an edit, since a note that did not move keeps its id", () => {
    const session = open();
    const idsBefore = idsOf(session);
    session.select(["Vocal:0", "Vocal:256", "Vocal:1024"]);
    const changes = listen(session);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });

    expect(idsOf(session)).toEqual(idsBefore);
    expect(session.selection).toEqual(["Vocal:0", "Vocal:256", "Vocal:1024"]);
    expect(changes).toEqual([
      { cause: "dispatch", project: true, selection: false, insertionPoint: false, view: false },
    ]);

    session.undo();
    expect(session.selection).toEqual(["Vocal:0", "Vocal:256", "Vocal:1024"]);
  });
});

function idsOf(session: EditingSession): string[] {
  const { reading } = session;
  return reading.kind === "score" ? reading.score.notes.map((note) => note.id) : [];
}

describe("the insertion point", () => {
  it("is a position on the time axis, outside the history, and announced only when it moves", () => {
    const session = open();
    expect(session.insertionPoint).toBeNull();
    const changes = listen(session);

    session.setInsertionPoint({ tick: 512 });
    expect(session.insertionPoint).toEqual({ tick: 512 });
    session.setInsertionPoint({ tick: 512 });
    expect([session.canUndo, session.canRedo]).toEqual([false, false]);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    expect(session.insertionPoint).toEqual({ tick: 512 });
    session.setInsertionPoint(null);
    expect(session.insertionPoint).toBeNull();

    expect(changes.map((change) => [change.cause, change.insertionPoint, change.project])).toEqual([
      ["insertion-point", true, false],
      ["dispatch", false, true],
      ["insertion-point", true, false],
    ]);
    session.undo();
    expect(session.project.score).toBe(SCORE);
  });

  it("refuses a position that is not a whole, non-negative number of ticks", () => {
    const session = open();
    expect(() => session.setInsertionPoint({ tick: -1 })).toThrow(RangeError);
    expect(() => session.setInsertionPoint({ tick: 1.5 })).toThrow(RangeError);
    expect(() => session.setInsertionPoint({ tick: Number.NaN })).toThrow(RangeError);
    expect(session.insertionPoint).toBeNull();
  });
});

describe("the view state parts share", () => {
  it("starts at the host's beat width, scrolled to the start, in the language it was given", () => {
    expect(open().view).toEqual({ zoom: 1, scrollLeft: 0, language: "en", editable: true });
    const zh = createEditingSession({ project, dialects, language: "zh" });
    expect(zh.view).toEqual({ zoom: 1, scrollLeft: 0, language: "zh", editable: true });
  });

  it("says whether the user may edit, starting from the option and changing like the rest of the view state", () => {
    expect(createEditingSession({ project, dialects, editable: false }).view.editable).toBe(false);

    const session = open();
    const changes = listen(session);
    session.setView({ editable: false });
    expect(session.view).toEqual({ zoom: 1, scrollLeft: 0, language: "en", editable: false });
    session.setView({ editable: false });
    session.setView({ editable: true });

    expect(changes).toEqual([
      { cause: "view", project: false, selection: false, insertionPoint: false, view: true },
      { cause: "view", project: false, selection: false, insertionPoint: false, view: true },
    ]);
    expect(session.canUndo).toBe(false);
  });

  it("changes by the keys given, announces one change, and says nothing when nothing differs", () => {
    const session = open();
    const changes = listen(session);

    session.setView({ zoom: 2, scrollLeft: 300 });
    expect(session.view).toEqual({ zoom: 2, scrollLeft: 300, language: "en", editable: true });
    session.setView({ language: "zh" });
    expect(session.view).toEqual({ zoom: 2, scrollLeft: 300, language: "zh", editable: true });
    session.setView({ zoom: 2, scrollLeft: 300, language: "zh" });
    session.setView({});

    expect(changes).toEqual([
      { cause: "view", project: false, selection: false, insertionPoint: false, view: true },
      { cause: "view", project: false, selection: false, insertionPoint: false, view: true },
    ]);
  });

  it("keeps the zoom within the range the view draws and the scroll offset at zero or more", () => {
    const session = open();
    session.setView({ zoom: 100, scrollLeft: -5 });
    expect(session.view).toMatchObject({ zoom: 4, scrollLeft: 0 });
    session.setView({ zoom: 0 });
    expect(session.view.zoom).toBe(0.01);
    session.setView({ zoom: Number.NaN, scrollLeft: Number.NaN });
    expect(session.view).toMatchObject({ zoom: 0.01, scrollLeft: 0 });
  });

  it("is outside the history: zooming and scrolling are no step to undo", () => {
    const session = open();
    session.setView({ zoom: 0.5, scrollLeft: 40 });
    expect(session.canUndo).toBe(false);

    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    session.setView({ zoom: 1.5 });
    session.setView({ scrollLeft: 90, language: "zh" });
    expect(session.undo()).toBe(true);

    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);
    expect(session.view).toEqual({ zoom: 1.5, scrollLeft: 90, language: "zh", editable: true });
  });
});

describe("replacing the project from outside", () => {
  const other: SongProject = { ...project, score: `${HEADER}\nK:C\nV: Vocal\nA16|`, sourceKey: "another-song" };

  it("starts a new document: history, selection and insertion point go, zoom and scroll stay", () => {
    const session = open();
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    session.select(["Vocal:0"]);
    session.setInsertionPoint({ tick: 256 });
    session.setView({ zoom: 2, scrollLeft: 80 });
    const changes = listen(session);

    session.replaceProject(other);

    expect(session.project).toBe(other);
    expect(session.reading.kind === "score" && session.reading.score.notes.map((note) => note.id)).toEqual(["Vocal:0"]);
    expect([session.canUndo, session.canRedo]).toEqual([false, false]);
    expect(session.undo()).toBe(false);
    expect(session.selection).toEqual([]);
    expect(session.insertionPoint).toBeNull();
    expect(session.view).toEqual({ zoom: 2, scrollLeft: 80, language: "en", editable: true });
    expect(changes).toEqual([{ cause: "replace", project: true, selection: true, insertionPoint: true, view: false }]);
  });

  it("counts a field the project type does not know yet, so a field added later is never ignored", () => {
    const session = open();
    const changes = listen(session);

    session.replaceProject({ ...project, tempoOverride: 90 } as SongProject);

    expect(changes).toHaveLength(1);
    expect(session.project).toHaveProperty("tempoOverride", 90);
  });

  it("does nothing when the project it is given has the same fields as the current one", () => {
    const session = open();
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    const changes = listen(session);

    session.replaceProject({ ...session.project });

    expect(changes).toEqual([]);
    expect(session.canUndo).toBe(true);
  });

  it("keeps the reading when only a field the view does not draw differs", () => {
    const session = open();
    const reading = session.reading;
    const changes = listen(session);

    session.replaceProject({ ...project, style: "rock" });

    expect(session.project.style).toBe("rock");
    expect(session.reading).toBe(reading);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ cause: "replace", project: true });
  });

  it("reads again with other dialects and keeps the history", () => {
    const session = open();
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    const changes = listen(session);
    expect(session.reading.kind).toBe("score");

    session.replaceDialects(createDialectRegistry([]));
    expect(session.reading).toEqual({ kind: "no-dialect", modelId: "song2" });
    expect(session.canUndo).toBe(true);
    expect(changes).toEqual([
      { cause: "replace", project: true, selection: false, insertionPoint: false, view: false },
    ]);

    session.replaceDialects(dialects);
    expect(session.reading.kind).toBe("score");
    session.replaceDialects(dialects);
    expect(changes).toHaveLength(2);
  });
});

describe("a listener that throws", () => {
  const broke = new Error("a view broke");

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("neither reaches the caller of a change that is applied nor keeps the others from hearing it", () => {
    const reported: unknown[] = [];
    vi.stubGlobal("reportError", (error: unknown) => reported.push(error));
    const session = open();
    const heard: string[] = [];
    session.subscribe(() => {
      throw broke;
    });
    session.subscribe((change) => heard.push(change.cause));

    expect(session.dispatch({ type: "toRest", noteId: "Vocal:256" })).toMatchObject({ ok: true, diagnostics: [] });
    expect(session.undo()).toBe(true);
    expect(session.redo()).toBe(true);
    session.select(["Vocal:0"]);

    expect(heard).toEqual(["dispatch", "undo", "redo", "select"]);
    expect(session.project.score).toBe(SCORE_WITHOUT_D);
    expect(session.selection).toEqual(["Vocal:0"]);
    expect(reported).toEqual([broke, broke, broke, broke]);
  });

  it("is rethrown in a microtask where the platform has no reportError", () => {
    vi.stubGlobal("reportError", undefined);
    const microtasks: Array<() => void> = [];
    vi.stubGlobal("queueMicrotask", (task: () => void) => microtasks.push(task));
    const session = open();
    session.subscribe(() => {
      throw broke;
    });

    expect(session.dispatch({ type: "toRest", noteId: "Vocal:256" }).ok).toBe(true);

    expect(session.canUndo).toBe(true);
    expect(microtasks).toHaveLength(1);
    expect(() => microtasks[0]?.()).toThrow("a view broke");
  });
});

describe("replacing the score text", () => {
  const typed = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16|C16|`;
  const broken = `${HEADER}
K:C
V: Vocal
C5|`;

  it("is one step of the history that undo and redo carry, and the project's other fields stay", () => {
    const session = open();
    const changes = listen(session);

    const result = session.dispatch({ type: "replaceScoreText", text: typed });

    expect(result).toMatchObject({ ok: true, diagnostics: [] });
    expect(session.project).toEqual({ ...project, score: typed });
    expect(session.reading.kind === "score" && session.reading.score.bars.length).toBe(3);
    expect(changes).toEqual([
      { cause: "dispatch", project: true, selection: false, insertionPoint: false, view: false },
    ]);

    expect(session.undo()).toBe(true);
    expect(session.project).toEqual(project);
    expect(session.canUndo).toBe(false);
    expect(session.redo()).toBe(true);
    expect(session.project.score).toBe(typed);
  });

  it("is refused for an unreadable text: nothing changes, no step, nothing is announced", () => {
    const session = open();
    const changes = listen(session);
    const before = session.project;

    const result = session.dispatch({ type: "replaceScoreText", text: broken });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["duration"]);
    expect(result.project).toBe(before);
    expect(session.project).toBe(before);
    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([]);
  });

  it("adds no step when the text is the one the project already has", () => {
    const session = open();
    const changes = listen(session);

    expect(session.dispatch({ type: "replaceScoreText", text: SCORE }).ok).toBe(true);

    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([]);
  });

  it("is also no step when the text is the same but for its line endings", () => {
    const session = open();

    session.dispatch({ type: "replaceScoreText", text: SCORE.replace(/\n/g, "\r\n") });

    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);
  });

  it("drops a selected note that the new text no longer has, as any edit does", () => {
    const session = open();
    session.select(["Vocal:256", "Vocal:768"]);

    session.dispatch({ type: "replaceScoreText", text: `${HEADER}\nK:C\nV: Vocal\nC8D8|G16|` });

    expect(session.selection).toEqual([]);
  });

  it("lets a project whose own score cannot be read be fixed from the text", () => {
    const session = open({ score: broken });
    expect(session.reading.kind).toBe("unreadable");

    expect(session.dispatch({ type: "replaceScoreText", text: typed }).ok).toBe(true);

    expect(session.reading.kind).toBe("score");
    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(broken);
  });
});

describe("checking a text without taking it", () => {
  it("lists every way an unreadable text breaks the format, and none for a readable one", () => {
    const session = open();
    const twice = `${HEADER}
K:C
V: Vocal
C5|G5|`;
    const changes = listen(session);

    expect(session.checkScoreText(SCORE_WITHOUT_D)).toEqual([]);
    const found = session.checkScoreText(twice);

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((diagnostic) => diagnostic.code === "duration" && diagnostic.at.line === 9)).toBe(true);
    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([]);
  });

  it("names the missing dialect for a model nothing reads", () => {
    const session = open({ modelId: "other-model" });

    expect(session.checkScoreText(SCORE).map((diagnostic) => diagnostic.code)).toEqual(["no-dialect"]);
  });
});

describe("which view is shown", () => {
  it("is the arrangement view until a host or the user says otherwise, and starts from the option", () => {
    expect(open().activeView).toBe("arrangement");
    expect(createEditingSession({ project, dialects, activeView: "text" }).activeView).toBe("text");
  });

  it("changes like the rest of the UI state: one announcement, none when it stays, and nothing in the history", () => {
    const session = open();
    const changes = listen(session);

    session.setActiveView("staff");
    session.setActiveView("staff");
    session.setActiveView("text");

    expect(session.activeView).toBe("text");
    expect(changes).toEqual([
      { cause: "active-view", project: false, selection: false, insertionPoint: false, view: false },
      { cause: "active-view", project: false, selection: false, insertionPoint: false, view: false },
    ]);
    expect(session.canUndo).toBe(false);
  });

  it("is not a field of the view state, which keeps the four it had", () => {
    const session = open();
    session.setActiveView("staff");

    expect(session.view).toEqual({ zoom: 1, scrollLeft: 0, language: "en", editable: true });
  });

  it("stays when the project is replaced from outside, and refuses a name no view has", () => {
    const session = open();
    session.setActiveView("text");

    session.replaceProject({ ...project, sourceKey: "another-song", score: SCORE_WITHOUT_D });

    expect(session.activeView).toBe("text");
    expect(() => session.setActiveView("lyrics" as never)).toThrow(RangeError);
    expect(session.activeView).toBe("text");
  });

  it("is listed for hosts that draw their own switcher", async () => {
    const { VIEW_NAMES } = await import("@neta-art/score-editor");

    expect([...VIEW_NAMES]).toEqual(["arrangement", "staff", "text"]);
  });
});

describe("text a view could not hand over", () => {
  const broken = `${HEADER}
K:C
V: Vocal
C5|`;

  it("is none at first, is set with the text and what is wrong with it, and is announced", () => {
    const session = open();
    const changes = listen(session);
    expect(session.rejectedText).toBeNull();

    const diagnostics = session.checkScoreText(broken);
    session.setRejectedText({ text: broken, diagnostics });

    expect(session.rejectedText).toEqual({ text: broken, diagnostics });
    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([
      { cause: "rejected-text", project: false, selection: false, insertionPoint: false, view: false },
    ]);

    session.setRejectedText(null);
    expect(session.rejectedText).toBeNull();
    session.setRejectedText(null);
    expect(changes.map((change) => change.cause)).toEqual(["rejected-text", "rejected-text"]);
  });

  it("says nothing when it is set to what it already is", () => {
    const session = open();
    const diagnostics = session.checkScoreText(broken);
    session.setRejectedText({ text: broken, diagnostics });
    const changes = listen(session);

    session.setRejectedText({ text: broken, diagnostics });

    expect(changes).toEqual([]);
  });

  it("goes when the project changes under it: an edit, an undo, a redo, new data or new dialects", () => {
    const hold = (session: EditingSession) =>
      session.setRejectedText({ text: broken, diagnostics: session.checkScoreText(broken) });
    const session = open();

    hold(session);
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    expect(session.rejectedText).toBeNull();

    hold(session);
    session.undo();
    expect(session.rejectedText).toBeNull();

    hold(session);
    session.redo();
    expect(session.rejectedText).toBeNull();

    hold(session);
    session.replaceProject({ ...project, sourceKey: "another-song" });
    expect(session.rejectedText).toBeNull();

    hold(session);
    session.replaceDialects(createDialectRegistry([song2Dialect]));
    expect(session.rejectedText).toBeNull();
  });
});

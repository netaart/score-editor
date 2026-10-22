// ABOUTME: Seam 1 for custom tools: a hand-written tool is registered, previewed and run through the package entry in Node.
// ABOUTME: Expected projects are worked out by hand from the same score samples the session tests use, never from the tool layer.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  createToolRegistry,
  type EditingSession,
  previewTool,
  runTool,
  type ScoreTool,
  type SongProject,
  validateToolParameters,
} from "@neta-art/score-editor";
import { describe, expect, it, vi } from "vitest";

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

/** D (tick 256) and F (tick 768) become rests. */
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
  sourceKey: "tool-test",
};

function open(overrides: Partial<SongProject> = {}): EditingSession {
  return createEditingSession({ project: { ...project, ...overrides }, dialects });
}

/** Rest every Nth selected note, counting from one. */
const restEveryNth: ScoreTool = {
  id: "rest-every-nth",
  name: { en: "Rest every Nth note", zh: "每隔 N 个音变休止" },
  parameters: [{ name: "every", type: "number", min: 1, max: 8, default: 2 }],
  commands(_project, selection, values) {
    const every = values.every as number;
    return selection
      .filter((_noteId, index) => (index + 1) % every === 0)
      .map((noteId) => ({ type: "toRest" as const, noteId }));
  },
};

describe("the tool registry", () => {
  it("lists the tool with its parameter declaration", () => {
    const registry = createToolRegistry([restEveryNth]);

    expect(registry.list()).toEqual([restEveryNth]);
    expect(registry.list()[0]?.parameters).toEqual([{ name: "every", type: "number", min: 1, max: 8, default: 2 }]);
    expect(registry.find("rest-every-nth")).toBe(restEveryNth);
    expect(registry.get("rest-every-nth")).toBe(restEveryNth);
    expect(registry.tools).toEqual([restEveryNth]);
  });

  it("refuses a duplicate id in the list it is built from", () => {
    expect(() => createToolRegistry([restEveryNth, restEveryNth])).toThrow(/rest-every-nth/);
  });

  it("registers a tool after it is built and refuses the same id twice", () => {
    const registry = createToolRegistry();
    registry.register(restEveryNth);
    expect(registry.list()).toEqual([restEveryNth]);
    expect(() => registry.register(restEveryNth)).toThrow(/rest-every-nth/);
    expect(registry.list()).toEqual([restEveryNth]);
  });
});

/** E (tick 512) becomes a rest; D stays a note. */
const SCORE_WITHOUT_E = `${HEADER}
K:C
V: Vocal
C4D4z4F4|G16|`;

function listen(session: EditingSession): number[] {
  const changes: number[] = [];
  session.subscribe(() => changes.push(changes.length));
  return changes;
}

describe("tool parameters", () => {
  it("takes the default for a missing value and gives the builder every declared value", () => {
    const build = vi.fn(restEveryNth.commands);
    const tool: ScoreTool = { ...restEveryNth, commands: build };

    const result = previewTool(tool, project, ["Vocal:256", "Vocal:512"], {}, dialects);

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(SCORE_WITHOUT_E);
    expect(build).toHaveBeenCalledWith(project, ["Vocal:256", "Vocal:512"], { every: 2 });
  });

  it("refuses a wrong type or an out-of-range value before the builder runs", () => {
    const build = vi.fn(restEveryNth.commands);
    const tool: ScoreTool = { ...restEveryNth, commands: build };

    for (const values of [{ every: "two" }, { every: 0 }, { every: 9 }, { every: Number.NaN }]) {
      const result = previewTool(tool, project, ["Vocal:512"], values, dialects);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["tool-parameter"]);
      expect(result.project).toBe(project);
    }

    expect(build).not.toHaveBeenCalled();
  });
});

describe("previewing a tool", () => {
  it("computes the project the tool would make and gives the same answer twice", () => {
    const first = previewTool(restEveryNth, project, ["Vocal:256", "Vocal:512"], { every: 2 }, dialects);
    const second = previewTool(restEveryNth, project, ["Vocal:256", "Vocal:512"], { every: 2 }, dialects);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(first.project.score).toBe(SCORE_WITHOUT_E);
    expect(project.score).toBe(SCORE);
  });

  it("leaves the session's project, history, selection and listeners untouched", () => {
    const session = open();
    session.select(["Vocal:256", "Vocal:512"]);
    const changes = listen(session);
    const before = session.project;
    const history = [session.canUndo, session.canRedo];

    const preview = previewTool(restEveryNth, session.project, session.selection, { every: 2 }, dialects);
    const viaSession = session.previewTool(restEveryNth, { every: 2 });

    expect(preview.ok).toBe(true);
    expect(viaSession).toEqual(preview);
    expect(preview.project.score).toBe(SCORE_WITHOUT_E);
    expect(session.project).toBe(before);
    expect([session.canUndo, session.canRedo]).toEqual(history);
    expect(session.selection).toEqual(["Vocal:256", "Vocal:512"]);
    expect(changes).toEqual([]);
  });

  it("returns the diagnostic of the step that fails instead of a project", () => {
    const failsAtTheMiddle: ScoreTool = {
      id: "fails-in-the-middle",
      name: { en: "Fails in the middle", zh: "中途失败" },
      parameters: [],
      commands() {
        return [
          { type: "toRest", noteId: "Vocal:256" },
          { type: "toRest", noteId: "Vocal:999" },
          { type: "toRest", noteId: "Vocal:768" },
        ];
      },
    };

    const result = previewTool(failsAtTheMiddle, project, [], {}, dialects);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ code: "note-not-found", at: { noteId: "Vocal:999" } });
    expect(result.project).toBe(project);
  });
});

const failsInTheMiddle: ScoreTool = {
  id: "fails-in-the-middle",
  name: { en: "Fails in the middle", zh: "中途失败" },
  parameters: [],
  commands() {
    return [
      { type: "toRest", noteId: "Vocal:256" },
      { type: "toRest", noteId: "Vocal:999" },
      { type: "toRest", noteId: "Vocal:768" },
    ];
  },
};

describe("running a tool on a session", () => {
  it("applies the same project as dispatching its commands one by one", () => {
    const session = open();
    session.select(["Vocal:256", "Vocal:512"]);
    const oneByOne = open();

    const result = session.runTool(restEveryNth, { every: 2 });
    for (const command of result.commands) oneByOne.dispatch(command);

    expect(result.ok).toBe(true);
    expect(result.commands).toEqual([{ type: "toRest", noteId: "Vocal:512" }]);
    expect(result.project.score).toBe(SCORE_WITHOUT_E);
    expect(session.project.score).toBe(oneByOne.project.score);
    expect(session.project.score).toBe(SCORE_WITHOUT_E);
  });

  it("is one history step: one undo restores the project and one redo reapplies it", () => {
    const session = open();
    session.select(["Vocal:0", "Vocal:256", "Vocal:512", "Vocal:768"]);

    const result = session.runTool(restEveryNth, { every: 2 });
    expect(result.commands).toHaveLength(2);
    expect(session.canUndo).toBe(true);

    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);

    expect(session.redo()).toBe(true);
    expect(session.project.score).toBe(SCORE_WITHOUT_D_AND_F);
  });

  it("refuses the whole run when a middle step fails, leaving project and history unchanged", () => {
    const session = open();
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    session.undo();
    const before = session.project;
    const history = [session.canUndo, session.canRedo];
    const changes = listen(session);

    const result = session.runTool(failsInTheMiddle, {});

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ code: "note-not-found", at: { noteId: "Vocal:999" } });
    expect(result.project).toBe(before);
    expect(session.project).toBe(before);
    expect([session.canUndo, session.canRedo]).toEqual(history);
    expect(changes).toEqual([]);
  });

  it("refuses bad parameters before the builder runs and changes nothing", () => {
    const session = open();
    session.select(["Vocal:512"]);
    const build = vi.fn(restEveryNth.commands);
    const tool: ScoreTool = { ...restEveryNth, commands: build };
    const history = [session.canUndo, session.canRedo];
    const changes = listen(session);

    for (const values of [{ every: "two" }, { every: 0 }, { every: 9 }]) {
      const result = session.runTool(tool, values);
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("tool-parameter");
      expect(result.project).toBe(session.project);
    }

    expect(build).not.toHaveBeenCalled();
    expect([session.canUndo, session.canRedo]).toEqual(history);
    expect(changes).toEqual([]);
  });

  it("gives the same result twice for the same project, selection and parameters", () => {
    const first = open();
    const second = open();
    first.select(["Vocal:256", "Vocal:512", "Vocal:768"]);
    second.select(["Vocal:256", "Vocal:512", "Vocal:768"]);

    const one = first.runTool(restEveryNth, { every: 3 });
    const two = second.runTool(restEveryNth, { every: 3 });

    expect(one).toEqual(two);
    expect(one.project.score).toBe(two.project.score);
  });

  it("adds no history step for a run whose commands leave the project as it was", () => {
    const noCommand: ScoreTool = {
      id: "no-command",
      name: { en: "No command", zh: "没有命令" },
      parameters: [],
      commands: () => [],
    };
    const session = open();
    const before = session.project;
    const changes = listen(session);

    const result = session.runTool(noCommand, {});

    expect(result.ok).toBe(true);
    expect(session.project).toBe(before);
    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([]);
  });
});

describe("the free run function", () => {
  it("runs the tool through the session it is given, as one step", () => {
    const session = open();
    session.select(["Vocal:256", "Vocal:512"]);

    const result = runTool(session, restEveryNth, { every: 2 });

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(SCORE_WITHOUT_E);
    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(SCORE);
  });
});

describe("every parameter type", () => {
  const tool: ScoreTool = {
    id: "all-types",
    name: { en: "All types", zh: "所有类型" },
    parameters: [
      { name: "count", type: "number", min: 0, max: 4, default: 1 },
      { name: "loud", type: "boolean", default: false },
      { name: "mode", type: "choice", values: ["up", "down"], default: "up" },
      { name: "label", type: "text", default: "x" },
    ],
    commands: () => [],
  };

  it("fills every default and refuses each value outside its declaration", () => {
    expect(validateToolParameters(tool, {})).toEqual({
      ok: true,
      values: { count: 1, loud: false, mode: "up", label: "x" },
    });

    for (const values of [{ count: 5 }, { loud: "yes" }, { mode: "sideways" }, { mode: 2 }, { label: 3 }]) {
      const checked = validateToolParameters(tool, values);
      expect(checked.ok).toBe(false);
      expect(checked.ok === false && checked.diagnostics[0]?.code).toBe("tool-parameter");
    }
  });
});

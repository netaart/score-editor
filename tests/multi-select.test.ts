// ABOUTME: Seam 1 for selecting several notes: the inputs that build a selection and the delete that acts on all of it, fed to a session in Node.
// ABOUTME: Expected texts and ids are worked out by hand from RULES.md and the bar grid, never from the code under test.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  type EditingSession,
  handleEditingInput,
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

/** Bar 1: C D E F as quarter notes, which start at 0, 256, 512 and 768 ticks. Bar 2: a whole note G at 1024. */
const SCORE = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16|`;

const dialects = createDialectRegistry([song2Dialect]);

const project: SongProject = {
  style: "pop",
  lyrics: "la la",
  score: SCORE,
  scoreMode: "full",
  seed: 7,
  modelId: "song2",
  sourceKey: "multi-select-test",
};

function open(overrides: Partial<SongProject> = {}, editable?: boolean): EditingSession {
  return createEditingSession({
    project: { ...project, ...overrides },
    dialects,
    ...(editable === undefined ? {} : { editable }),
  });
}

function listen(session: EditingSession): SessionChange[] {
  const changes: SessionChange[] = [];
  session.subscribe((change) => changes.push(change));
  return changes;
}

describe("Delete on several selected notes", () => {
  /** The dialect with its writes and checks counted, to read how often a delete touches the score text. */
  function openCounting(score: string = SCORE): {
    session: EditingSession;
    calls: { serialize: number; check: number };
  } {
    const calls = { serialize: 0, check: 0 };
    const counting = {
      ...song2Dialect,
      serialize: (...args: Parameters<typeof song2Dialect.serialize>) => {
        calls.serialize += 1;
        return song2Dialect.serialize(...args);
      },
      check: (...args: Parameters<typeof song2Dialect.check>) => {
        calls.check += 1;
        return song2Dialect.check(...args);
      },
    };
    const session = createEditingSession({
      project: { ...project, score },
      dialects: createDialectRegistry([counting]),
    });
    return { session, calls };
  }

  it("writes the score and checks it once, however many notes are selected", () => {
    const { session, calls } = openCounting();
    session.select(["Vocal:0", "Vocal:512", "Vocal:768", "Vocal:1024"]);

    const result = handleEditingInput(session, { type: "delete" });

    expect(result).toEqual({ handled: true, refused: [] });
    expect(session.project.score).toBe(`${HEADER}
K:C
V: Vocal
z4D4z4z4|z16|`);
    expect(calls).toEqual({ serialize: 1, check: 1 });
    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);
  });

  describe("when the score would not take it", () => {
    /** The G of bar 2 is tied into a cut tail: written as a rest, it would turn the cut into a finished score. */
    const CUT = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16-|B`;

    it("changes neither the score nor the selection, reports the code, and records no history", () => {
      const { session, calls } = openCounting(CUT);
      session.select(["Vocal:1024", "Vocal:256", "Vocal:0"]);
      const before = { project: session.project, selection: session.selection };
      const changes = listen(session);

      const result = handleEditingInput(session, { type: "delete" });

      expect(result.handled).toBe(true);
      expect(result.refused.map((diagnostic) => diagnostic.code)).toEqual(["write-mismatch"]);
      expect(session.project).toEqual(before.project);
      expect(session.selection).toEqual(before.selection);
      expect(session.canUndo).toBe(false);
      expect(changes).toEqual([]);
      // W14/W16 refuse the cut rewrite before the score is written or checked.
      expect(calls.check).toBe(0);
    });

    it("points at the first of the selected notes in the score, whatever order they were selected in", () => {
      const { session } = openCounting(CUT);
      session.select(["Vocal:1024", "Vocal:256", "Vocal:0"]);

      const result = handleEditingInput(session, { type: "delete" });

      expect(result.refused[0]?.at).toEqual({ voice: "Vocal", bar: 1, beat: 1, noteId: "Vocal:0" });
    });
  });
});

const key = (name: string, modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  ({
    type: "key",
    key: name,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
    altKey: modifiers.alt ?? false,
  }) as const;

const ALL = ["Vocal:0", "Vocal:256", "Vocal:512", "Vocal:768", "Vocal:1024"];

/** A second voice: its notes start at 0, 512 and 1024, and its ids follow the same rule as Vocal's. */
const TWO_VOICES = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% a
V: Vocal
C4D4E4F4|G16|
V: Ins
E8G8|c16|`;

/** A tie chain of two segments, Vocal:256 and Vocal:1024, between two notes that are not tied. */
const TIED = `${HEADER}
K:D
V: Vocal
A4^F12-|F16|`;

/** The same score as SCORE with the D already a rest. */
const WITH_REST = `${HEADER}
K:C
V: Vocal
C4z4E4F4|G16|`;

describe("Ctrl+A and Cmd+A", () => {
  it("select every pitched note, as one change of the selection that is no step of the history", () => {
    const session = open();
    const changes = listen(session);

    expect(handleEditingInput(session, key("a", { ctrl: true }))).toEqual({ handled: true, refused: [] });

    expect(session.selection).toEqual(ALL);
    expect(changes).toEqual([{ cause: "select", project: false, selection: true, insertionPoint: false, view: false }]);
    expect(session.canUndo).toBe(false);

    const mac = open();
    expect(handleEditingInput(mac, key("a", { meta: true })).handled).toBe(true);
    expect(mac.selection).toEqual(ALL);
  });

  it("select the notes of every voice, not only of one", () => {
    const session = open({ score: TWO_VOICES });

    handleEditingInput(session, key("a", { ctrl: true }));

    expect([...session.selection].sort()).toEqual(
      ["Ins:0", "Ins:1024", "Ins:512", "Vocal:0", "Vocal:1024", "Vocal:256", "Vocal:512", "Vocal:768"].sort(),
    );
  });

  it("leave out the rests, which cannot be selected", () => {
    const session = open({ score: WITH_REST });

    handleEditingInput(session, key("A", { ctrl: true }));

    expect(session.selection).toEqual(["Vocal:0", "Vocal:512", "Vocal:768", "Vocal:1024"]);
  });

  it("are handled even when every note is selected already or the score has no note, so the browser keeps its select all away", () => {
    const session = open();
    session.select(ALL);
    const changes = listen(session);
    expect(handleEditingInput(session, key("a", { ctrl: true }))).toEqual({ handled: true, refused: [] });
    expect(changes).toEqual([]);

    const empty = open({ score: `${HEADER}\nK:C\nV: Vocal\nz16|` });
    expect(handleEditingInput(empty, key("a", { ctrl: true })).handled).toBe(true);
    expect(empty.selection).toEqual([]);
  });

  it("are not taken with Alt, or without Ctrl or Cmd, which leaves A to the browser and to typing", () => {
    const session = open();
    for (const input of [
      key("a"),
      key("a", { alt: true }),
      key("a", { ctrl: true, alt: true }),
      key("a", { shift: true }),
    ]) {
      expect(handleEditingInput(session, input), JSON.stringify(input)).toEqual({ handled: false, refused: [] });
    }
    expect(session.selection).toEqual([]);
  });
});

describe("Ctrl+Shift+A and Cmd+Shift+A", () => {
  it("select the notes that were not selected and let go of those that were", () => {
    const session = open();
    session.select(["Vocal:256", "Vocal:768"]);

    expect(handleEditingInput(session, key("A", { ctrl: true, shift: true }))).toEqual({ handled: true, refused: [] });
    expect(session.selection).toEqual(["Vocal:0", "Vocal:512", "Vocal:1024"]);

    handleEditingInput(session, key("a", { meta: true, shift: true }));
    expect(session.selection).toEqual(["Vocal:256", "Vocal:768"]);
    expect(session.canUndo).toBe(false);
  });

  it("select everything when nothing is selected, and nothing when everything is", () => {
    const session = open();
    handleEditingInput(session, key("A", { ctrl: true, shift: true }));
    expect(session.selection).toEqual(ALL);
    expect(handleEditingInput(session, key("A", { ctrl: true, shift: true })).handled).toBe(true);
    expect(session.selection).toEqual([]);
  });

  it("treat a tie chain as one thing: it is selected when any of its segments is", () => {
    const session = open({ score: TIED });
    session.select(["Vocal:1024"]);

    handleEditingInput(session, key("A", { ctrl: true, shift: true }));

    expect(session.selection).toEqual(["Vocal:0"]);
  });

  it("work over the pitched notes only, so notes turned into rests are neither selected nor kept", () => {
    const session = open();
    session.select(["Vocal:256"]);
    handleEditingInput(session, key("Delete"));
    expect(session.selection).toEqual(["Vocal:256"]);

    handleEditingInput(session, key("A", { ctrl: true, shift: true }));

    expect(session.selection).toEqual(["Vocal:0", "Vocal:512", "Vocal:768", "Vocal:1024"]);
  });
});

describe("Escape", () => {
  it("clears the selection and says it meant something", () => {
    const session = open();
    session.select(["Vocal:256", "Vocal:512"]);
    const changes = listen(session);

    expect(handleEditingInput(session, key("Escape"))).toEqual({ handled: true, refused: [] });

    expect(session.selection).toEqual([]);
    expect(changes).toEqual([{ cause: "select", project: false, selection: true, insertionPoint: false, view: false }]);
    expect(session.canUndo).toBe(false);
  });

  it("leaves the insertion point where it is", () => {
    const session = open();
    session.setInsertionPoint({ tick: 512 });
    session.select(["Vocal:256"]);

    handleEditingInput(session, key("Escape"));

    expect(session.insertionPoint).toEqual({ tick: 512 });
  });

  it("is not handled when the selection is empty, so a host layer can take it to close itself", () => {
    const session = open();
    expect(handleEditingInput(session, key("Escape"))).toEqual({ handled: false, refused: [] });

    session.select(["Vocal:256"]);
    handleEditingInput(session, key("Escape"));
    expect(handleEditingInput(session, key("Escape"))).toEqual({ handled: false, refused: [] });
  });

  it("clears what Delete leaves selected: the ids of notes that are rests now", () => {
    const session = open();
    session.select(["Vocal:256", "Vocal:768"]);
    handleEditingInput(session, key("Delete"));
    expect(session.selection).toEqual(["Vocal:256", "Vocal:768"]);

    expect(handleEditingInput(session, key("Escape"))).toEqual({ handled: true, refused: [] });

    expect(session.selection).toEqual([]);
    expect(handleEditingInput(session, key("Escape"))).toEqual({ handled: false, refused: [] });
  });

  it("is not taken with a modifier", () => {
    const session = open();
    session.select(["Vocal:256"]);
    for (const modifiers of [{ shift: true }, { ctrl: true }, { meta: true }, { alt: true }]) {
      expect(handleEditingInput(session, key("Escape", modifiers)).handled, JSON.stringify(modifiers)).toBe(false);
    }
    expect(session.selection).toEqual(["Vocal:256"]);
  });
});

describe("a click on a note with Shift held", () => {
  const toggle = (noteId: string) => ({ type: "toggle-note", noteId }) as const;

  it("adds a note that was not selected, after those already selected", () => {
    const session = open();
    session.select(["Vocal:512"]);

    expect(handleEditingInput(session, toggle("Vocal:0"))).toEqual({ handled: true, refused: [] });

    expect(session.selection).toEqual(["Vocal:512", "Vocal:0"]);
  });

  it("takes out a note that was selected, and leaves the others", () => {
    const session = open();
    session.select(["Vocal:0", "Vocal:512", "Vocal:768"]);

    handleEditingInput(session, toggle("Vocal:512"));

    expect(session.selection).toEqual(["Vocal:0", "Vocal:768"]);
    handleEditingInput(session, toggle("Vocal:0"));
    handleEditingInput(session, toggle("Vocal:768"));
    expect(session.selection).toEqual([]);
  });

  it("takes a whole tie chain in or out, since a chain is selected as a whole", () => {
    const session = open({ score: TIED });
    session.select(["Vocal:0", "Vocal:256"]);

    // The chain shows as selected through its first segment; toggling the other segment takes the chain out.
    handleEditingInput(session, toggle("Vocal:1024"));
    expect(session.selection).toEqual(["Vocal:0"]);

    handleEditingInput(session, toggle("Vocal:256"));
    expect(session.selection).toEqual(["Vocal:0", "Vocal:256"]);
  });

  it("is not handled for a rest or an id that names no note, and not while read-only", () => {
    const session = open({ score: WITH_REST });
    session.select(["Vocal:0"]);
    expect(handleEditingInput(session, toggle("Vocal:256"))).toEqual({ handled: false, refused: [] });
    expect(handleEditingInput(session, toggle("Vocal:999"))).toEqual({ handled: false, refused: [] });
    expect(session.selection).toEqual(["Vocal:0"]);

    const readOnly = open({}, false);
    expect(handleEditingInput(readOnly, toggle("Vocal:0"))).toEqual({ handled: false, refused: [] });
    expect(readOnly.selection).toEqual([]);
  });
});

describe("a box that has been drawn", () => {
  const box = (noteIds: string[], add?: boolean) =>
    ({ type: "select-notes", noteIds, ...(add === undefined ? {} : { add }) }) as const;

  it("selects exactly the notes in it, and lets go of the others", () => {
    const session = open();
    session.select(["Vocal:0"]);

    expect(handleEditingInput(session, box(["Vocal:512", "Vocal:768"]))).toEqual({ handled: true, refused: [] });

    expect(session.selection).toEqual(["Vocal:512", "Vocal:768"]);
  });

  it("adds its notes to the selection when it was drawn with Shift held", () => {
    const session = open();
    session.select(["Vocal:0", "Vocal:512"]);

    handleEditingInput(session, box(["Vocal:512", "Vocal:1024"], true));

    expect(session.selection).toEqual(["Vocal:0", "Vocal:512", "Vocal:1024"]);
  });

  it("clears the selection when it holds no note, and leaves it alone when it holds none and adds", () => {
    const session = open();
    session.select(["Vocal:0"]);
    handleEditingInput(session, box([], true));
    expect(session.selection).toEqual(["Vocal:0"]);

    expect(handleEditingInput(session, box([])).handled).toBe(true);
    expect(session.selection).toEqual([]);
  });

  it("leaves out rests and ids that name no note, and names none twice", () => {
    const session = open({ score: WITH_REST });

    handleEditingInput(session, box(["Vocal:0", "Vocal:256", "Vocal:999", "Vocal:0", "Vocal:512"]));

    expect(session.selection).toEqual(["Vocal:0", "Vocal:512"]);
  });

  it("selects nothing while read-only", () => {
    const readOnly = open({}, false);
    expect(handleEditingInput(readOnly, box(["Vocal:0"]))).toEqual({ handled: false, refused: [] });
    expect(readOnly.selection).toEqual([]);
  });
});

describe("the select-all, invert and clear inputs, which a control without a key sends", () => {
  it("do what Ctrl+A, Ctrl+Shift+A and Escape do", () => {
    const session = open();

    expect(handleEditingInput(session, { type: "select-all" })).toEqual({ handled: true, refused: [] });
    expect(session.selection).toEqual(ALL);

    session.select(["Vocal:256"]);
    expect(handleEditingInput(session, { type: "invert-selection" })).toEqual({ handled: true, refused: [] });
    expect(session.selection).toEqual(["Vocal:0", "Vocal:512", "Vocal:768", "Vocal:1024"]);

    expect(handleEditingInput(session, { type: "clear-selection" })).toEqual({ handled: true, refused: [] });
    expect(session.selection).toEqual([]);
    expect(handleEditingInput(session, { type: "clear-selection" })).toEqual({ handled: false, refused: [] });
  });

  it("are not handled while read-only, and not when the score cannot be read", () => {
    const readOnly = open({}, false);
    const unreadable = open({ score: `${HEADER}\nK:C\nV: Vocal\nC5|` });
    for (const type of ["select-all", "invert-selection", "clear-selection"] as const) {
      expect(handleEditingInput(readOnly, { type }), type).toEqual({ handled: false, refused: [] });
      expect(handleEditingInput(unreadable, { type }), type).toEqual({ handled: false, refused: [] });
    }
    expect(readOnly.selection).toEqual([]);
  });

  it("leave the session's own select working while read-only, which is how a filter panel selects there", () => {
    const readOnly = open({}, false);

    readOnly.select(["Vocal:256", "Vocal:512"]);

    expect(readOnly.selection).toEqual(["Vocal:256", "Vocal:512"]);
  });
});

describe("the selection after an edit", () => {
  it("stays on the edited notes through Delete, undo and redo, since a note turned into a rest keeps its id", () => {
    const session = open();
    session.select(["Vocal:256", "Vocal:768"]);

    handleEditingInput(session, key("Delete"));
    expect(session.selection).toEqual(["Vocal:256", "Vocal:768"]);

    session.undo();
    expect(session.selection).toEqual(["Vocal:256", "Vocal:768"]);

    session.redo();
    expect(session.selection).toEqual(["Vocal:256", "Vocal:768"]);
  });

  it("stays on the segments that were selected when a tie chain is turned into rests", () => {
    const session = open({ score: TIED });
    session.select(["Vocal:1024", "Vocal:0"]);

    handleEditingInput(session, key("Delete"));
    expect(session.selection).toEqual(["Vocal:1024", "Vocal:0"]);

    session.undo();
    expect(session.selection).toEqual(["Vocal:1024", "Vocal:0"]);
  });

  it("lets Delete take the same notes again after an undo, with nothing selected anew", () => {
    const session = open();
    session.select(["Vocal:0", "Vocal:512"]);
    handleEditingInput(session, key("Delete"));
    session.undo();

    expect(handleEditingInput(session, key("Delete"))).toEqual({ handled: true, refused: [] });
    expect(session.project.score).toBe(`${HEADER}
K:C
V: Vocal
z4D4z4F4|G16|`);
  });
});

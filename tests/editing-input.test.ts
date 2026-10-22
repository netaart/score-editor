// ABOUTME: Seam 1 for the editing input: keys and clicks are fed to a session in Node and the session's state is read back.
// ABOUTME: Expected texts and tick positions are worked out by hand from RULES.md and the bar grid, never from the code under test.
import { readFileSync } from "node:fs";
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

/** Bar 1: C D E F as quarter notes. Bar 2: a whole note G. A quarter note is 256 ticks. */
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
  sourceKey: "editing-input-test",
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

const key = (name: string, modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  ({
    type: "key",
    key: name,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
    altKey: modifiers.alt ?? false,
  }) as const;

describe("Delete", () => {
  it("turns the selected note into a rest, leaves the later notes where they are, and is one step to undo", () => {
    const session = open();
    session.select(["Vocal:256"]);

    const result = handleEditingInput(session, key("Delete"));

    expect(result).toEqual({ handled: true, refused: [] });
    expect(session.project.score).toBe(`${HEADER}
K:C
V: Vocal
C4z4E4F4|G16|`);
    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);
  });
});

describe("Delete and Backspace in detail", () => {
  it("treat Backspace as Delete", () => {
    const session = open();
    session.select(["Vocal:512"]);

    expect(handleEditingInput(session, key("Backspace")).handled).toBe(true);
    expect(session.project.score).toBe(`${HEADER}
K:C
V: Vocal
C4D4z4F4|G16|`);
  });

  it("are not handled, and change nothing, when no note is selected", () => {
    const session = open();
    const changes = listen(session);

    expect(handleEditingInput(session, key("Delete"))).toEqual({ handled: false, refused: [] });
    expect(session.project.score).toBe(SCORE);
    expect(changes).toEqual([]);
  });

  it("do nothing while the session is read-only, even for a selection set through the session", () => {
    const session = open({}, false);
    session.select(["Vocal:256"]);
    const changes = listen(session);

    expect(handleEditingInput(session, key("Delete"))).toEqual({ handled: false, refused: [] });
    expect(handleEditingInput(session, key("Backspace"))).toEqual({ handled: false, refused: [] });
    expect(session.project.score).toBe(SCORE);
    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([]);
  });

  it("turn the whole tie chain into rests as one step, whichever segment is selected", () => {
    const tied = `${HEADER}
K:D
V: Vocal
A4^F12-|F16|`;
    const afterwards = `${HEADER}
K:D
V: Vocal
A4z12|z16|`;

    const one = open({ score: tied });
    one.select(["Vocal:1024"]);
    handleEditingInput(one, key("Delete"));
    expect(one.project.score).toBe(afterwards);
    one.undo();
    expect(one.project.score).toBe(tied);
    expect(one.canUndo).toBe(false);

    const both = open({ score: tied });
    both.select(["Vocal:256", "Vocal:1024"]);
    const result = handleEditingInput(both, key("Delete"));
    expect(result).toEqual({ handled: true, refused: [] });
    expect(both.project.score).toBe(afterwards);
    both.undo();
    expect(both.project.score).toBe(tied);
    expect(both.canUndo).toBe(false);
  });

  it("leave the selection on the edited note, so undo brings the note back selected and Delete takes it again", () => {
    const session = open();
    session.select(["Vocal:256"]);

    handleEditingInput(session, key("Delete"));
    expect(session.selection).toEqual(["Vocal:256"]);
    const again = handleEditingInput(session, key("Delete"));
    expect(again).toEqual({ handled: false, refused: [] });
    expect(session.canUndo).toBe(true);

    session.undo();
    expect(session.selection).toEqual(["Vocal:256"]);
    expect(handleEditingInput(session, key("Delete")).handled).toBe(true);
    expect(session.project.score).toContain("C4z4E4F4|");
  });

  it("hand back the diagnostics of a refused edit and leave the project and the selection alone", () => {
    const vectors = (
      JSON.parse(
        readFileSync(new URL("../packages/score-dialect-song2/tests/vectors.json", import.meta.url), "utf8"),
      ) as { vectors: Array<{ id: string; text: string }> }
    ).vectors;
    const cut = vectors.find((vector) => vector.id === "truncate-tie-mismatch-final");
    if (cut === undefined) throw new Error("the vector is missing");
    const session = open({ score: cut.text });
    session.select(["Vocal:0"]);
    const changes = listen(session);

    const result = handleEditingInput(session, key("Delete"));

    expect(result.handled).toBe(true);
    expect(result.refused.map((diagnostic) => diagnostic.code)).toEqual(["write-mismatch"]);
    expect(session.project.score).toBe(cut.text);
    expect(session.selection).toEqual(["Vocal:0"]);
    expect(session.canUndo).toBe(false);
    expect(changes).toEqual([]);
  });
});

describe("the delete input, which a control without a key sends", () => {
  const press = { type: "delete" } as const;

  it("does what the Delete key does: the selected note becomes a rest, in one step to undo", () => {
    const session = open();
    session.select(["Vocal:256"]);

    expect(handleEditingInput(session, press)).toEqual({ handled: true, refused: [] });
    expect(session.project.score).toContain("C4z4E4F4|");
    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(SCORE);
  });

  it("is not handled when no pitched note is selected, and not while the session is read-only", () => {
    const session = open();
    expect(handleEditingInput(session, press)).toEqual({ handled: false, refused: [] });

    const readOnly = open({}, false);
    readOnly.select(["Vocal:256"]);
    expect(handleEditingInput(readOnly, press)).toEqual({ handled: false, refused: [] });
    expect(readOnly.project.score).toBe(SCORE);
  });
});

describe("the undo and redo keys", () => {
  /** A session with one applied command: the D of bar 1 is a rest. */
  function afterDelete(editable = true): EditingSession {
    const session = open({}, editable);
    session.dispatch({ type: "toRest", noteId: "Vocal:256" });
    return session;
  }

  it("undo with Ctrl+Z or Cmd+Z and redo with Ctrl+Shift+Z, Cmd+Shift+Z or Ctrl+Y", () => {
    const session = afterDelete();
    const withoutD = session.project.score;

    expect(handleEditingInput(session, key("z", { ctrl: true })).handled).toBe(true);
    expect(session.project.score).toBe(SCORE);
    expect(handleEditingInput(session, key("Z", { ctrl: true, shift: true })).handled).toBe(true);
    expect(session.project.score).toBe(withoutD);

    handleEditingInput(session, key("z", { meta: true }));
    expect(session.project.score).toBe(SCORE);
    handleEditingInput(session, key("Z", { meta: true, shift: true }));
    expect(session.project.score).toBe(withoutD);

    handleEditingInput(session, key("z", { ctrl: true }));
    handleEditingInput(session, key("y", { ctrl: true }));
    expect(session.project.score).toBe(withoutD);
  });

  it("leave the other combinations to the browser", () => {
    const session = afterDelete();
    const withoutD = session.project.score;

    for (const input of [
      key("z"),
      key("z", { shift: true }),
      key("z", { ctrl: true, alt: true }),
      key("y", { meta: true }),
      key("y"),
      key("x", { ctrl: true }),
    ]) {
      expect(handleEditingInput(session, input), JSON.stringify(input)).toEqual({ handled: false, refused: [] });
    }
    expect(session.project.score).toBe(withoutD);
    expect(session.canRedo).toBe(false);
  });

  it("are handled, and change nothing, when there is nothing to undo or redo", () => {
    const session = open();
    const changes = listen(session);

    expect(handleEditingInput(session, key("z", { ctrl: true }))).toEqual({ handled: true, refused: [] });
    expect(handleEditingInput(session, key("y", { ctrl: true }))).toEqual({ handled: true, refused: [] });
    expect(changes).toEqual([]);
  });

  it("do nothing while the session is read-only", () => {
    const session = afterDelete(false);
    const withoutD = session.project.score;

    expect(handleEditingInput(session, key("z", { ctrl: true }))).toEqual({ handled: false, refused: [] });
    expect(session.project.score).toBe(withoutD);
    session.undo();
    expect(handleEditingInput(session, key("y", { ctrl: true }))).toEqual({ handled: false, refused: [] });
    expect(session.project.score).toBe(SCORE);
  });
});

const click = {
  note: (noteId: string) => ({ type: "click-note", noteId }) as const,
  empty: (tick: number) => ({ type: "click-empty", tick }) as const,
};

/** Bar 1 is 4/4 (1024 ticks, beats of 256); bar 2 is 6/8 (768 ticks, beats of 128). The grid ends at 1792. */
const MIXED_METERS = `${HEADER}
K:C
V: Vocal
C16|
V: Vocal
M:6/8
C12|`;

describe("a click on a note", () => {
  it("selects that note and only that note, and leaves the insertion point where it was", () => {
    const session = open();
    session.setInsertionPoint({ tick: 512 });
    session.select(["Vocal:0"]);
    const changes = listen(session);

    expect(handleEditingInput(session, click.note("Vocal:256"))).toEqual({ handled: true, refused: [] });

    expect(session.selection).toEqual(["Vocal:256"]);
    expect(session.insertionPoint).toEqual({ tick: 512 });
    expect(changes).toEqual([{ cause: "select", project: false, selection: true, insertionPoint: false, view: false }]);
    expect(session.canUndo).toBe(false);
  });

  it("says nothing when the note is already the one selected", () => {
    const session = open();
    session.select(["Vocal:256"]);
    const changes = listen(session);

    expect(handleEditingInput(session, click.note("Vocal:256")).handled).toBe(true);
    expect(changes).toEqual([]);
  });

  it("is not handled for a rest or for an id that names no note, and the selection stays", () => {
    const session = open({ score: `${HEADER}\nK:C\nV: Vocal\nC4z4E4F4|G16|` });
    session.select(["Vocal:0"]);

    expect(handleEditingInput(session, click.note("Vocal:256"))).toEqual({ handled: false, refused: [] });
    expect(handleEditingInput(session, click.note("Vocal:999"))).toEqual({ handled: false, refused: [] });
    expect(session.selection).toEqual(["Vocal:0"]);
  });

  it("selects nothing while the session is read-only", () => {
    const session = open({}, false);
    expect(handleEditingInput(session, click.note("Vocal:256"))).toEqual({ handled: false, refused: [] });
    expect(session.selection).toEqual([]);
  });
});

describe("a click on empty space", () => {
  it("clears the selection and drops the insertion point on the nearest beat line", () => {
    const session = open();
    session.select(["Vocal:256"]);
    const changes = listen(session);

    expect(handleEditingInput(session, click.empty(400))).toEqual({ handled: true, refused: [] });

    expect(session.selection).toEqual([]);
    expect(session.insertionPoint).toEqual({ tick: 512 });
    expect(changes.map((change) => change.cause)).toEqual(["select", "insertion-point"]);
    expect(session.canUndo).toBe(false);

    handleEditingInput(session, click.empty(300));
    expect(session.insertionPoint).toEqual({ tick: 256 });
  });

  it("measures beats in the meter of the bar it lands in: eighths in 6/8", () => {
    const session = open({ score: MIXED_METERS });
    expect(session.reading.kind).toBe("score");

    handleEditingInput(session, click.empty(190));
    expect(session.insertionPoint).toEqual({ tick: 256 });
    handleEditingInput(session, click.empty(1100));
    expect(session.insertionPoint).toEqual({ tick: 1152 });
    handleEditingInput(session, click.empty(1700));
    expect(session.insertionPoint).toEqual({ tick: 1664 });
  });

  it("keeps the point within the score: before the start it is the start, past the end it is the end", () => {
    const session = open();
    handleEditingInput(session, click.empty(-80));
    expect(session.insertionPoint).toEqual({ tick: 0 });
    handleEditingInput(session, click.empty(99999));
    expect(session.insertionPoint).toEqual({ tick: 2048 });
  });

  it("is not handled for a position that is not a number, while read-only, or when the score cannot be read", () => {
    const session = open();
    expect(handleEditingInput(session, click.empty(Number.NaN)).handled).toBe(false);
    expect(session.insertionPoint).toBeNull();

    const readOnly = open({}, false);
    expect(handleEditingInput(readOnly, click.empty(300)).handled).toBe(false);
    expect(readOnly.insertionPoint).toBeNull();

    const unreadable = open({ score: `${HEADER}\nK:C\nV: Vocal\nC5|` });
    expect(handleEditingInput(unreadable, click.empty(300)).handled).toBe(false);
    expect(unreadable.insertionPoint).toBeNull();
  });
});

describe("the arrow keys, Home and End", () => {
  it("leave Left and Right to the browser's scrolling while there is no insertion point", () => {
    const session = open();
    expect(handleEditingInput(session, key("ArrowRight"))).toEqual({ handled: false, refused: [] });
    expect(handleEditingInput(session, key("ArrowLeft"))).toEqual({ handled: false, refused: [] });
    expect(session.insertionPoint).toBeNull();
  });

  it("move the insertion point one beat line at a time, and stop at the start and at the end of the score", () => {
    const session = open();
    session.setInsertionPoint({ tick: 0 });
    const changes = listen(session);

    expect(handleEditingInput(session, key("ArrowRight"))).toEqual({ handled: true, refused: [] });
    expect(session.insertionPoint).toEqual({ tick: 256 });
    for (let step = 0; step < 3; step++) handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 1024 });
    handleEditingInput(session, key("ArrowLeft"));
    expect(session.insertionPoint).toEqual({ tick: 768 });

    for (let step = 0; step < 20; step++) handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 2048 });
    expect(handleEditingInput(session, key("ArrowRight")).handled).toBe(true);
    expect(session.insertionPoint).toEqual({ tick: 2048 });

    for (let step = 0; step < 20; step++) handleEditingInput(session, key("ArrowLeft"));
    expect(session.insertionPoint).toEqual({ tick: 0 });
    expect(changes.every((change) => change.cause === "insertion-point")).toBe(true);
    expect(session.canUndo).toBe(false);
  });

  it("go to the next beat line in the direction pressed from a point that is not on one", () => {
    const session = open();
    session.setInsertionPoint({ tick: 300 });
    handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 512 });
    session.setInsertionPoint({ tick: 300 });
    handleEditingInput(session, key("ArrowLeft"));
    expect(session.insertionPoint).toEqual({ tick: 256 });
  });

  it("follow the beats of each bar's meter across a change of meter", () => {
    const session = open({ score: MIXED_METERS });
    session.setInsertionPoint({ tick: 768 });
    handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 1024 });
    handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 1152 });
    handleEditingInput(session, key("ArrowLeft"));
    handleEditingInput(session, key("ArrowLeft"));
    expect(session.insertionPoint).toEqual({ tick: 768 });
    handleEditingInput(session, key("End"));
    expect(session.insertionPoint).toEqual({ tick: 1792 });
  });

  it("put the point at the start with Home and at the end with End, with or without a point before", () => {
    const session = open();
    expect(handleEditingInput(session, key("End"))).toEqual({ handled: true, refused: [] });
    expect(session.insertionPoint).toEqual({ tick: 2048 });
    expect(handleEditingInput(session, key("Home")).handled).toBe(true);
    expect(session.insertionPoint).toEqual({ tick: 0 });

    const fresh = open();
    handleEditingInput(fresh, key("Home"));
    expect(fresh.insertionPoint).toEqual({ tick: 0 });
  });

  it("leave a key with another modifier, and every key while read-only or unreadable, alone", () => {
    const session = open();
    session.setInsertionPoint({ tick: 512 });
    for (const modifiers of [{ shift: true }, { ctrl: true }, { alt: true }, { meta: true }]) {
      for (const name of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
        expect(handleEditingInput(session, key(name, modifiers)).handled, `${name} ${JSON.stringify(modifiers)}`).toBe(
          false,
        );
      }
    }
    expect(session.insertionPoint).toEqual({ tick: 512 });

    const readOnly = open({}, false);
    readOnly.setInsertionPoint({ tick: 512 });
    for (const name of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(handleEditingInput(readOnly, key(name)).handled, name).toBe(false);
    }
    expect(readOnly.insertionPoint).toEqual({ tick: 512 });

    const unreadable = open({ score: `${HEADER}\nK:C\nV: Vocal\nC5|` });
    expect(handleEditingInput(unreadable, key("Home")).handled).toBe(false);
    expect(unreadable.insertionPoint).toBeNull();
  });
});

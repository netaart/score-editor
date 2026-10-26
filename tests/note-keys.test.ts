// ABOUTME: Seam 1 for moving and resizing the selection: the arrow keys and the move and resize inputs of a drag, through a session.
// ABOUTME: Expected texts and ticks are worked by hand from RULES.md and the bar grid (a quarter note is 256 ticks, written 4 at L:1/16).
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  type EditingInput,
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

const score = (body: string) => `${HEADER}\nK:C\nV: Vocal\n${body}`;

/** One quarter note C at the start of bar 1, rests to the bar line, and a whole note G in bar 2. */
const LONE = score("C4z12|G16|");
/** Four quarter notes C D E F, then a whole note G. */
const QUARTERS = score("C4D4E4F4|G16|");

const dialects = createDialectRegistry([song2Dialect]);

function open(text: string, editable = true): EditingSession {
  const project: SongProject = {
    style: "pop",
    lyrics: "",
    score: text,
    scoreMode: "full",
    seed: 1,
    modelId: "song2",
    sourceKey: "note-keys-test",
  };
  return createEditingSession({ project, dialects, editable });
}

const key = (name: string, modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  ({
    type: "key",
    key: name,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
    altKey: modifiers.alt ?? false,
  }) as const satisfies EditingInput;

/** The pitched notes of the session's score as [id, midi, start, duration]. */
function notesOf(session: EditingSession): Array<[string, number, number, number]> {
  const { reading } = session;
  if (reading.kind !== "score") throw new Error("the score does not read");
  return reading.score.notes
    .filter((note) => note.midi !== null)
    .map((note): [string, number, number, number] => [note.id, note.midi ?? 0, note.start, note.duration]);
}

describe("Left and Right with a note selected", () => {
  it("move it by one step of the grid, keep it selected where it went, and are one step to undo", () => {
    const session = open(LONE);
    session.select(["Vocal:0"]);

    expect(handleEditingInput(session, key("ArrowRight"))).toEqual({ handled: true, refused: [] });

    // A quarter step: C now starts a quarter in, the quarter it left is a rest, and nothing after it moved.
    expect(session.project.score).toBe(score("z4C4z8|G16|"));
    expect(session.selection).toEqual(["Vocal:256"]);

    expect(session.undo()).toBe(true);
    expect(session.project.score).toBe(LONE);
    expect(session.selection).toEqual(["Vocal:0"]);
    expect(session.canUndo).toBe(false);
    expect(session.redo()).toBe(true);
    expect(session.selection).toEqual(["Vocal:256"]);
  });

  it("follow the grid the session has", () => {
    const session = open(LONE);
    session.setGrid({ value: 16 });
    session.select(["Vocal:0"]);

    handleEditingInput(session, key("ArrowRight"));
    handleEditingInput(session, key("ArrowRight"));

    expect(notesOf(session)).toContainEqual(["Vocal:128", 60, 128, 256]);
    expect(session.selection).toEqual(["Vocal:128"]);
  });

  it("move a note back with Left, and say so when it cannot go further", () => {
    const session = open(score("z4C4z8|G16|"));
    session.select(["Vocal:256"]);

    handleEditingInput(session, key("ArrowLeft"));
    // The quarter the note left is a rest of its own beside the rest that was there.
    expect(session.project.score).toBe(score("C4z4z8|G16|"));
    expect(session.selection).toEqual(["Vocal:0"]);

    const refused = handleEditingInput(session, key("ArrowLeft"));
    expect(refused.handled).toBe(true);
    expect(refused.refused.map((found) => found.code)).toEqual(["note-before-start"]);
    expect(session.project.score).toBe(score("C4z4z8|G16|"));
    expect(session.selection).toEqual(["Vocal:0"]);
  });

  it("cover the next note when they land on its start, as the command's result says", () => {
    const session = open(QUARTERS);
    session.select(["Vocal:0"]);

    handleEditingInput(session, key("ArrowRight"));

    expect(session.project.score).toBe(score("z4C4E4F4|G16|"));
    expect(notesOf(session).map(([id]) => id)).toEqual(["Vocal:256", "Vocal:512", "Vocal:768", "Vocal:1024"]);
    expect(session.selection).toEqual(["Vocal:256"]);
  });

  it("move every selected note by the same step, as one step of the history", () => {
    const session = open(score("C4z4E4z4|z16|"));
    session.select(["Vocal:0", "Vocal:512"]);

    handleEditingInput(session, key("ArrowRight"));

    expect(session.project.score).toBe(score("z4C4z4E4|z16|"));
    expect(session.selection).toEqual(["Vocal:256", "Vocal:768"]);
    session.undo();
    expect(session.project.score).toBe(score("C4z4E4z4|z16|"));
    expect(session.canUndo).toBe(false);
  });
});

describe("a tie chain across a bar line", () => {
  it("moves as one note, is written again split at the bar line, and the selection follows to its first piece", () => {
    // A half note C at the end of bar 1 tied to a half note C at the start of bar 2: one note a half note and a half long.
    const session = open(score("z8C8-|C8z8|"));
    session.select(["Vocal:1024"]);

    handleEditingInput(session, key("ArrowRight"));

    // It now starts a quarter later, three quarters into bar 1: a quarter in bar 1 tied to three quarters in bar 2.
    expect(session.project.score).toBe(score("z8z4C4-|C12z4|"));
    expect(session.selection).toEqual(["Vocal:768"]);
    session.undo();
    expect(session.project.score).toBe(score("z8C8-|C8z8|"));
    expect(session.selection).toEqual(["Vocal:1024"]);
  });
});

describe("Up and Down with a note selected", () => {
  it("raise and lower it by a semitone, and Shift raises and lowers it by an octave", () => {
    const session = open(LONE);
    session.select(["Vocal:0"]);

    handleEditingInput(session, key("ArrowUp"));
    expect(session.project.score).toBe(score("^C4z12|G16|"));
    handleEditingInput(session, key("ArrowDown"));
    handleEditingInput(session, key("ArrowDown"));
    expect(session.project.score).toBe(score("B,4z12|G16|"));

    handleEditingInput(session, key("ArrowUp", { shift: true }));
    expect(session.project.score).toBe(score("B4z12|G16|"));
    handleEditingInput(session, key("ArrowDown", { shift: true }));
    handleEditingInput(session, key("ArrowDown", { shift: true }));
    expect(session.project.score).toBe(score("B,,4z12|G16|"));
    // The id is the start, which pitch does not change.
    expect(session.selection).toEqual(["Vocal:0"]);
  });

  it("leave an off-grid start where it is, since only time snaps", () => {
    // A sixty-fourth of the bar in, as a rest of one unit puts it: 64 ticks, which a quarter grid does not hold.
    const session = open(score("z1C4z3z8|G16|"));
    session.select(["Vocal:64"]);

    handleEditingInput(session, key("ArrowUp"));

    expect(notesOf(session)).toContainEqual(["Vocal:64", 61, 64, 256]);
    expect(session.selection).toEqual(["Vocal:64"]);
  });

  it("are refused below MIDI 0, and nothing changes", () => {
    // C0 is MIDI 12: one octave down is MIDI 0 and the next would be -12.
    const session = open(score("C,,,,4z12|G16|"));
    session.select(["Vocal:0"]);
    expect(handleEditingInput(session, key("ArrowDown", { shift: true })).refused).toEqual([]);
    const before = session.project.score;

    const result = handleEditingInput(session, key("ArrowDown", { shift: true }));

    expect(result.handled).toBe(true);
    expect(result.refused.map((found) => found.code)).toEqual(["pitch-out-of-range"]);
    expect(session.project.score).toBe(before);
  });
});

describe("Shift with Left and Right with a note selected", () => {
  it("lengthen and shorten it from its end edge by a step, and the start stays", () => {
    const session = open(LONE);
    session.select(["Vocal:0"]);

    handleEditingInput(session, key("ArrowRight", { shift: true }));
    expect(session.project.score).toBe(score("C8z8|G16|"));
    expect(session.selection).toEqual(["Vocal:0"]);

    handleEditingInput(session, key("ArrowLeft", { shift: true }));
    expect(session.project.score).toBe(score("C4z4z8|G16|"));
  });

  it("refuse a length of less than one step, and a length past the end of the score", () => {
    const session = open(LONE);
    session.select(["Vocal:0"]);
    const tooShort = handleEditingInput(session, key("ArrowLeft", { shift: true }));
    expect(tooShort.refused.map((found) => found.code)).toEqual(["note-too-short"]);
    expect(session.project.score).toBe(LONE);

    session.select(["Vocal:1024"]);
    const tooLong = handleEditingInput(session, key("ArrowRight", { shift: true }));
    expect(tooLong.refused.map((found) => found.code)).toEqual(["note-past-end"]);
    expect(session.project.score).toBe(LONE);
  });
});

describe("the arrow keys with nothing to edit", () => {
  it("keep their meaning for the insertion point, and Up and Down are left to the browser, with no note selected", () => {
    const session = open(LONE);
    session.setInsertionPoint({ tick: 0 });

    expect(handleEditingInput(session, key("ArrowRight")).handled).toBe(true);
    expect(session.insertionPoint).toEqual({ tick: 256 });
    expect(handleEditingInput(session, key("ArrowUp"))).toEqual({ handled: false, refused: [] });
    expect(handleEditingInput(session, key("ArrowDown", { shift: true }))).toEqual({ handled: false, refused: [] });
    expect(session.project.score).toBe(LONE);
  });

  it("do the same when only rests are selected, which is what a delete leaves", () => {
    const session = open(LONE);
    session.select(["Vocal:0"]);
    handleEditingInput(session, key("Delete"));
    expect(session.selection).toEqual(["Vocal:0"]);
    session.setInsertionPoint({ tick: 0 });
    const deleted = session.project.score;

    handleEditingInput(session, key("ArrowRight"));

    expect(session.insertionPoint).toEqual({ tick: 256 });
    expect(session.project.score).toBe(deleted);
    expect(handleEditingInput(session, key("ArrowUp")).handled).toBe(false);
  });

  it("leave a key with Ctrl, Cmd or Alt alone, so the focus keys of the notes and the system keep them", () => {
    const session = open(LONE);
    session.select(["Vocal:0"]);
    for (const modifiers of [{ ctrl: true }, { meta: true }, { alt: true }, { ctrl: true, shift: true }]) {
      for (const name of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
        const result = handleEditingInput(session, key(name, modifiers));
        expect(result.handled, `${name} ${JSON.stringify(modifiers)}`).toBe(false);
      }
    }
    expect(session.project.score).toBe(LONE);
    expect(session.canUndo).toBe(false);
  });

  it("do nothing to the score while the session is read-only", () => {
    const session = open(LONE, false);
    session.select(["Vocal:0"]);
    for (const input of [
      key("ArrowRight"),
      key("ArrowUp"),
      key("ArrowUp", { shift: true }),
      key("ArrowRight", { shift: true }),
    ]) {
      expect(handleEditingInput(session, input)).toEqual({ handled: false, refused: [] });
    }
    expect(session.project.score).toBe(LONE);
    expect(session.canUndo).toBe(false);
  });

  it("do nothing to the score while the staff or the text is shown", () => {
    for (const view of ["staff", "text"] as const) {
      const session = open(LONE);
      session.select(["Vocal:0"]);
      session.setActiveView(view);
      expect(handleEditingInput(session, key("ArrowRight")).handled, view).toBe(false);
      expect(session.project.score, view).toBe(LONE);
    }
  });
});

describe("a grid the score cannot write", () => {
  it("makes the keys refuse with grid-not-allowed, and change nothing", () => {
    const session = open(LONE);
    session.setGrid({ value: 32 });
    session.select(["Vocal:0"]);

    const result = handleEditingInput(session, key("ArrowRight"));

    expect(result.handled).toBe(true);
    expect(result.refused.map((found) => found.code)).toEqual(["grid-not-allowed"]);
    expect(session.project.score).toBe(LONE);
    expect(session.selection).toEqual(["Vocal:0"]);
  });
});

describe("the inputs of a drag", () => {
  it("move-notes moves the selection by an offset that snaps to the grid and by a pitch, as one step", () => {
    const session = open(LONE);
    session.select(["Vocal:0"]);
    const changes: SessionChange[] = [];
    session.subscribe((change) => changes.push(change));

    const result = handleEditingInput(session, { type: "move-notes", timeTicks: 300, semitones: 2 });

    // 300 ticks is nearest the line at 256; two semitones up from C is D.
    expect(result).toEqual({ handled: true, refused: [] });
    expect(session.project.score).toBe(score("z4D4z8|G16|"));
    expect(session.selection).toEqual(["Vocal:256"]);
    expect(changes).toEqual([
      { cause: "dispatch", project: true, selection: true, insertionPoint: false, view: false },
    ]);
    session.undo();
    expect(session.project.score).toBe(LONE);
  });

  it("move-notes with an offset that comes to no change is not a step of the history", () => {
    const session = open(LONE);
    session.select(["Vocal:0"]);

    expect(handleEditingInput(session, { type: "move-notes", timeTicks: 40, semitones: 0 }).handled).toBe(true);

    expect(session.project.score).toBe(LONE);
    expect(session.canUndo).toBe(false);
  });

  it("resize-notes moves the edge it names to the grid and leaves the other where it is", () => {
    const session = open(score("z4C4z8|G16|"));
    session.select(["Vocal:256"]);

    handleEditingInput(session, { type: "resize-notes", edge: "end", timeTicks: 200 });
    expect(session.project.score).toBe(score("z4C8z4|G16|"));
    expect(session.selection).toEqual(["Vocal:256"]);

    // Pulled back by 300 ticks the start edge is nearest the line at 256 less 256: the start lands on 0.
    handleEditingInput(session, { type: "resize-notes", edge: "start", timeTicks: -300 });
    expect(session.project.score).toBe(score("C12z4|G16|"));
    expect(session.selection).toEqual(["Vocal:0"]);
  });

  it("report a refusal and change nothing, and leave an unreadable offset to the command", () => {
    const session = open(LONE);
    session.select(["Vocal:0"]);

    const past = handleEditingInput(session, { type: "move-notes", timeTicks: 5000, semitones: 0 });
    expect(past.refused.map((found) => found.code)).toEqual(["note-past-end"]);
    expect(session.project.score).toBe(LONE);
    expect(session.selection).toEqual(["Vocal:0"]);
  });

  it("are not handled with no pitched note selected, while read-only, or with the staff shown", () => {
    const empty = open(LONE);
    expect(handleEditingInput(empty, { type: "move-notes", timeTicks: 256, semitones: 0 }).handled).toBe(false);

    const readOnly = open(LONE, false);
    readOnly.select(["Vocal:0"]);
    expect(handleEditingInput(readOnly, { type: "move-notes", timeTicks: 256, semitones: 0 }).handled).toBe(false);
    expect(handleEditingInput(readOnly, { type: "resize-notes", edge: "end", timeTicks: 256 }).handled).toBe(false);
    expect(readOnly.project.score).toBe(LONE);

    const staff = open(LONE);
    staff.select(["Vocal:0"]);
    staff.setActiveView("staff");
    expect(handleEditingInput(staff, { type: "resize-notes", edge: "end", timeTicks: 256 }).handled).toBe(false);
  });
});

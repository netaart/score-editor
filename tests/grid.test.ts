// ABOUTME: Seam 1 for the grid of an editing session: its state, what a score allows, and the insertion point on the grid.
// ABOUTME: Expected values are worked by hand from the bar grid (256 ticks to a quarter note) and from the written unit of each score.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  type EditingSession,
  type Grid,
  handleEditingInput,
  type SessionChange,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

function header(unit: string): string {
  return `X:1
T:
M:4/4
L:${unit}
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;
}

/** Bar 1: four quarter notes. Bar 2: a whole note. At L:1/16 a quarter is written 4. */
function scoreAt(unit: string, body = "C4D4E4F4|G16|"): string {
  return `${header(unit)}\nK:C\nV: Vocal\n${body}`;
}

const dialects = createDialectRegistry([song2Dialect]);

function open(options: { score?: string; editable?: boolean; grid?: Grid } = {}): EditingSession {
  const project: SongProject = {
    style: "pop",
    lyrics: "",
    score: options.score ?? scoreAt("1/16"),
    scoreMode: "full",
    seed: 1,
    modelId: "song2",
    sourceKey: "grid-test",
  };
  return createEditingSession({
    project,
    dialects,
    ...(options.editable === undefined ? {} : { editable: options.editable }),
    ...(options.grid === undefined ? {} : { grid: options.grid }),
  });
}

function listen(session: EditingSession): SessionChange[] {
  const changes: SessionChange[] = [];
  session.subscribe((change) => changes.push(change));
  return changes;
}

describe("the grid of a session", () => {
  it("starts at 1/4, or at the grid the host gives", () => {
    expect(open().grid).toEqual({ value: 4 });
    expect(open({ grid: { value: 16, dotted: true } }).grid).toEqual({ value: 16, dotted: true });
  });

  it("changes with setGrid, which announces one change told by its cause alone", () => {
    const session = open();
    const changes = listen(session);

    session.setGrid({ value: 8 });

    expect(session.grid).toEqual({ value: 8 });
    expect(changes).toEqual([{ cause: "grid", project: false, selection: false, insertionPoint: false, view: false }]);
  });

  it("says nothing for the grid it already has, however it is written", () => {
    const session = open({ grid: { value: 8, dotted: true } });
    const changes = listen(session);

    session.setGrid({ value: 8, dotted: true });
    session.setGrid({ value: 8, dotted: true });

    expect(changes).toEqual([]);
  });

  it("is not part of the project and not a step of the history, and the project keeps it", () => {
    const session = open();
    session.setGrid({ value: 16 });
    expect(session.canUndo).toBe(false);

    session.replaceProject({ ...session.project, score: scoreAt("1/16", "C4D4E4F4|C16|") });
    expect(session.grid).toEqual({ value: 16 });
    expect(Object.keys(session.project)).not.toContain("grid");
  });

  it("refuses a grid the editor does not offer, and keeps the one it had", () => {
    const session = open();
    expect(() => session.setGrid({ value: 3 } as unknown as Grid)).toThrow(RangeError);
    expect(() => session.setGrid({ value: 64 } as unknown as Grid)).toThrow(RangeError);
    expect(() => session.setGrid({ value: 8, dotted: "yes" } as unknown as Grid)).toThrow(RangeError);
    expect(session.grid).toEqual({ value: 4 });
  });
});

describe("what a score allows of the grid", () => {
  it("allows 1/4, 1/8, 1/16 and dotted 1/4 and 1/8 under L:1/16, and not 1/32 or dotted 1/16", () => {
    const session = open();
    for (const grid of [
      { value: 4 },
      { value: 8 },
      { value: 16 },
      { value: 4, dotted: true },
      { value: 8, dotted: true },
    ] as const) {
      expect(session.allowsGrid(grid), JSON.stringify(grid)).toBe(true);
    }
    // 1/32 is 32 ticks and one written unit is 64; dotted 1/16 is 96, a unit and a half.
    expect(session.allowsGrid({ value: 32 })).toBe(false);
    expect(session.allowsGrid({ value: 16, dotted: true })).toBe(false);
  });

  it("allows 1/32 and dotted 1/16 under L:1/32, and dotted 1/32 only under L:1/64", () => {
    const thirtySeconds = open({ score: scoreAt("1/32", "C8D8E8F8|G32|") });
    expect(thirtySeconds.allowsGrid({ value: 32 })).toBe(true);
    expect(thirtySeconds.allowsGrid({ value: 16, dotted: true })).toBe(true);
    // Dotted 1/32 is 48 ticks; a unit is 32.
    expect(thirtySeconds.allowsGrid({ value: 32, dotted: true })).toBe(false);

    const sixtyFourths = open({ score: scoreAt("1/64", "C16D16E16F16|G32G32|") });
    expect(sixtyFourths.allowsGrid({ value: 32, dotted: true })).toBe(true);
  });

  it("allows nothing while the score cannot be read, and nothing for a grid that does not exist", () => {
    expect(open({ score: scoreAt("1/16", "C5|") }).allowsGrid({ value: 4 })).toBe(false);
    expect(open().allowsGrid({ value: 3 } as unknown as Grid)).toBe(false);
  });
});

const click = (tick: number) => ({ type: "click-empty", tick }) as const;
const key = (name: string) =>
  ({ type: "key", key: name, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }) as const;

describe("a click on empty space with a grid", () => {
  it("drops the insertion point on the nearest line of the current grid", () => {
    const session = open({ grid: { value: 16 } });

    handleEditingInput(session, click(100));
    expect(session.insertionPoint).toEqual({ tick: 128 });
    handleEditingInput(session, click(90));
    expect(session.insertionPoint).toEqual({ tick: 64 });

    session.setGrid({ value: 8 });
    handleEditingInput(session, click(100));
    expect(session.insertionPoint).toEqual({ tick: 128 });
    handleEditingInput(session, click(60));
    expect(session.insertionPoint).toEqual({ tick: 0 });
  });

  it("counts the lines of a dotted grid from the start of the score", () => {
    // Dotted 1/8 is 192 ticks: lines at 0, 192, 384, 576.
    const session = open({ grid: { value: 8, dotted: true } });
    handleEditingInput(session, click(450));
    expect(session.insertionPoint).toEqual({ tick: 384 });
    handleEditingInput(session, click(500));
    expect(session.insertionPoint).toEqual({ tick: 576 });
  });

  it("keeps the point inside the score, and on the end when the end is nearer than the last line", () => {
    // Two bars of 4/4 end at 2048. Dotted 1/4 is 384 ticks, so the last of its lines is 1920 and the end is not one of them.
    const session = open({ score: scoreAt("1/16", "C4D4E4F4|G16|"), grid: { value: 4, dotted: true } });
    handleEditingInput(session, click(99999));
    expect(session.insertionPoint).toEqual({ tick: 2048 });
    handleEditingInput(session, click(-5));
    expect(session.insertionPoint).toEqual({ tick: 0 });

    // The end of the score is a line of every grid: 2030 is 18 from it and 110 from 1920.
    handleEditingInput(session, click(2030));
    expect(session.insertionPoint).toEqual({ tick: 2048 });
    handleEditingInput(session, click(1950));
    expect(session.insertionPoint).toEqual({ tick: 1920 });
  });
});

describe("Left and Right with a grid", () => {
  it("step the insertion point by one step of the current grid, and stop at the ends", () => {
    const session = open({ grid: { value: 16 } });
    session.setInsertionPoint({ tick: 0 });

    handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 64 });
    handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 128 });
    handleEditingInput(session, key("ArrowLeft"));
    expect(session.insertionPoint).toEqual({ tick: 64 });

    session.setGrid({ value: 4 });
    handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 256 });

    for (let step = 0; step < 20; step++) handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 2048 });
    for (let step = 0; step < 20; step++) handleEditingInput(session, key("ArrowLeft"));
    expect(session.insertionPoint).toEqual({ tick: 0 });
  });

  it("go to the next line in the direction pressed from a point that is on none", () => {
    const session = open({ grid: { value: 4 } });
    session.setInsertionPoint({ tick: 300 });
    handleEditingInput(session, key("ArrowRight"));
    expect(session.insertionPoint).toEqual({ tick: 512 });
    session.setInsertionPoint({ tick: 300 });
    handleEditingInput(session, key("ArrowLeft"));
    expect(session.insertionPoint).toEqual({ tick: 256 });
  });
});

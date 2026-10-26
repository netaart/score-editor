// ABOUTME: Seam 1 for the built-in note tools: each tool on hand-written scores through the editing session.
// ABOUTME: Every expected score is written out from the music, never worked out by rerunning the code under test.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  createDialectRegistry,
  createEditingSession,
  type EditingSession,
  NOTE_TOOLS,
  type ScoreTool,
  type SongProject,
  TICKS_PER_QUARTER,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { parse, pitched, splitBars } from "./song2-support";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

function scoreOf(body: string): string {
  return `${HEADER}
K:C
V: Vocal
${body}`;
}

/** C D E F as quarter notes in bar 1, a whole G in bar 2. */
const C_D_E_F = scoreOf("C4D4E4F4|G16|");

const project: SongProject = {
  style: "pop",
  lyrics: "",
  score: C_D_E_F,
  scoreMode: "full",
  seed: null,
  modelId: "song2",
  sourceKey: "note-tools-test",
};

const dialects = createDialectRegistry([song2Dialect]);

function tool(id: string): ScoreTool {
  const found = NOTE_TOOLS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no note tool ${id}`);
  return found;
}

function sessionWith(score: string, ids: ReadonlyArray<string> = []): EditingSession {
  const session = createEditingSession({ project: { ...project, score }, dialects, grid: { value: 16 } });
  session.select(ids);
  return session;
}

const idsAt = (...starts: ReadonlyArray<number>): string[] => starts.map((start) => `Vocal:${start}`);

const QUARTER = TICKS_PER_QUARTER;

describe("chop", () => {
  it("cuts D into eighths on the 1/8 grid", () => {
    const session = createEditingSession({
      project: { ...project, score: C_D_E_F },
      dialects,
      grid: { value: 8 },
    });
    session.select(idsAt(QUARTER));

    const result = session.runTool(tool("chop"));

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("C4D2D2E4F4|G16|"));
  });
});

describe("join", () => {
  it("merges two adjacent selected C quarter notes into a half note", () => {
    const session = sessionWith(scoreOf("C4C4D4E4|G16|"), idsAt(0, QUARTER));

    const result = session.runTool(tool("join"));

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("C8D4E4|G16|"));
  });
});

describe("legato", () => {
  it("extends C over the rest to where D starts", () => {
    const session = sessionWith(scoreOf("C4z4D4E4|G16|"), idsAt(0, 2 * QUARTER));

    const result = session.runTool(tool("legato"));

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("C8D4E4|G16|"));
  });
});

describe("flip", () => {
  it("mirrors C and G around the middle of the two", () => {
    const session = sessionWith(scoreOf("C8G8|G16|"), idsAt(0, 2 * QUARTER));

    const result = session.runTool(tool("flip"));

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("G8C8|G16|"));
  });
});

describe("snap to key", () => {
  it("moves F sharp up to G in C major", () => {
    const session = sessionWith(scoreOf("^F4E4D4C4|G16|"), idsAt(0));

    const result = session.runTool(tool("snap-to-key"));

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("G4E4D4C4|G16|"));
  });
});

describe("length x2", () => {
  it("doubles D and takes the E its longer body covers", () => {
    const session = sessionWith(C_D_E_F, idsAt(QUARTER));

    const result = session.runTool(tool("length-double"));

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("C4D8F4|G16|"));
  });
});

describe("length /2", () => {
  it("halves C and leaves its second half a rest", () => {
    const session = sessionWith(C_D_E_F, idsAt(0));

    const result = session.runTool(tool("length-halve"));

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("C2z2D4E4F4|G16|"));
  });
});

describe("set length", () => {
  it("gives E the length of an eighth note", () => {
    const session = sessionWith(C_D_E_F, idsAt(2 * QUARTER));

    const result = session.runTool(tool("set-length"), { length: "1/8" });

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("C4D4E2z2F4|G16|"));
  });
});

describe("fit into bars", () => {
  it("stretches the four notes of bar 1 over bar 2", () => {
    const session = sessionWith(C_D_E_F, idsAt(0, QUARTER, 2 * QUARTER, 3 * QUARTER));

    const result = session.runTool(tool("fit-range"), { from: 2, to: 2 });

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("z16|C4D4E4F4|"));
  });
});

describe("every note tool", () => {
  interface Example {
    readonly id: string;
    readonly score: string;
    readonly ids: ReadonlyArray<string>;
    readonly values?: Readonly<Record<string, string | number>>;
    readonly grid?: number;
    readonly insertionPoint?: number;
  }

  const examples: ReadonlyArray<Example> = [
    { id: "split", score: C_D_E_F, ids: idsAt(QUARTER), insertionPoint: QUARTER + 128 },
    { id: "chop", score: C_D_E_F, ids: idsAt(QUARTER), grid: 8 },
    { id: "join", score: scoreOf("C4C4D4E4|G16|"), ids: idsAt(0, QUARTER) },
    { id: "legato", score: scoreOf("C4z4D4E4|G16|"), ids: idsAt(0, 2 * QUARTER) },
    { id: "reverse", score: C_D_E_F, ids: idsAt(0, QUARTER, 2 * QUARTER, 3 * QUARTER) },
    { id: "flip", score: scoreOf("C8G8|G16|"), ids: idsAt(0, 2 * QUARTER) },
    { id: "snap-to-key", score: scoreOf("^F4E4D4C4|G16|"), ids: idsAt(0) },
    { id: "length-double", score: C_D_E_F, ids: idsAt(QUARTER) },
    { id: "length-halve", score: C_D_E_F, ids: idsAt(0) },
    { id: "set-length", score: C_D_E_F, ids: idsAt(2 * QUARTER), values: { length: "1/8" } },
    {
      id: "fit-range",
      score: C_D_E_F,
      ids: idsAt(0, QUARTER, 2 * QUARTER, 3 * QUARTER),
      values: { from: 2, to: 2 },
    },
  ];

  function opened(example: Example): EditingSession {
    const session = createEditingSession({
      project: { ...project, score: example.score },
      dialects,
      grid: { value: (example.grid ?? 16) as 4 | 8 | 16 | 32 },
    });
    session.select(example.ids);
    if (example.insertionPoint !== undefined) session.setInsertionPoint({ tick: example.insertionPoint });
    return session;
  }

  for (const example of examples) {
    it(`${example.id} keeps one note a time, lands on the grid, and gives the same result twice`, () => {
      const session = opened(example);
      const result = session.runTool(tool(example.id), example.values ?? {});
      expect(result.ok).toBe(true);

      const score = parse(result.project.score);
      const step = (4 * TICKS_PER_QUARTER) / (example.grid ?? 16);
      for (const voice of score.voices) {
        const notes = pitched(score, voice);
        let reached = -1;
        for (const note of notes) {
          expect(note.start).toBeGreaterThanOrEqual(reached);
          reached = note.start + note.duration;
          expect(note.start % step).toBe(0);
          expect(note.duration % step).toBe(0);
        }
      }

      const again = opened(example).runTool(tool(example.id), example.values ?? {});
      expect(again.ok).toBe(true);
      expect(again.project).toEqual(result.project);
    });
  }
});

describe("reverse", () => {
  it("turns C D E F into F E D C", () => {
    const session = sessionWith(C_D_E_F, idsAt(0, QUARTER, 2 * QUARTER, 3 * QUARTER));

    const result = session.runTool(tool("reverse"));

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("F4E4D4C4|G16|"));
  });
});

describe("split", () => {
  it("splits D at the insertion point into two eighths", () => {
    const session = sessionWith(C_D_E_F, idsAt(QUARTER));
    session.setInsertionPoint({ tick: QUARTER + 128 });

    const result = session.runTool(tool("split"));

    expect(result.ok).toBe(true);
    expect(result.project.score).toBe(scoreOf("C4D2D2E4F4|G16|"));
  });
});

describe("a tool that has nothing to act on", () => {
  it("split without an insertion point changes nothing and adds no history step", () => {
    const session = sessionWith(C_D_E_F, idsAt(QUARTER));
    const before = session.project;

    const result = session.runTool(tool("split"));

    expect(result.ok).toBe(true);
    expect(result.project).toEqual(before);
    expect(session.canUndo).toBe(false);
  });

  it("fit into bars outside the score is refused and leaves the score alone", () => {
    const session = sessionWith(C_D_E_F, idsAt(0, QUARTER, 2 * QUARTER, 3 * QUARTER));
    const before = session.project;

    const result = session.runTool(tool("fit-range"), { from: 1, to: 99 });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["bar-out-of-range"]);
    expect(result.project).toBe(before);
    expect(session.canUndo).toBe(false);
  });
});

describe("the built-in note tools on the real score", () => {
  /** Two voices, Z runs, four bars a line: the score the editor skill edits, read from disk. */
  const REAL = readFileSync(
    new URL("../packages/score-editor/skills/score-editor/assets/edit-one-bar/score.abc", import.meta.url),
    "utf8",
  );
  /** The chorus's Vocal line is bars 9-12 (0-based 8-11); Ins there is a whole-bar rest run. */
  const FIRST = 8;
  const LAST = 11;
  const STEP = 64;

  function openReal(): EditingSession {
    const session = createEditingSession({ project: { ...project, score: REAL }, dialects, grid: { value: 16 } });
    const score = parse(REAL);
    const ids = score.notes
      .filter((note) => note.voice === "Vocal" && note.bar >= FIRST && note.bar <= LAST && note.midi !== null)
      .map((note) => note.id);
    session.select(ids);
    const first = score.notes.find((note) => ids.includes(note.id) && note.duration >= 2 * STEP);
    if (first !== undefined) session.setInsertionPoint({ tick: first.start + STEP });
    return session;
  }

  const valuesOf: ReadonlyArray<{ id: string; values?: Readonly<Record<string, string | number>> }> = [
    { id: "split" },
    { id: "chop" },
    { id: "join" },
    { id: "legato" },
    { id: "reverse" },
    { id: "flip" },
    { id: "snap-to-key" },
    { id: "length-double" },
    { id: "length-halve" },
    { id: "set-length", values: { length: "1/8" } },
    { id: "fit-range", values: { from: FIRST + 1, to: FIRST + 1 } },
  ];

  for (const example of valuesOf) {
    it(`${example.id} reads and checks, keeps one note a time, stays on the grid and leaves untouched bars alone`, () => {
      const session = openReal();
      const before = parse(REAL);
      const result = session.runTool(tool(example.id), example.values ?? {});

      expect(result.ok).toBe(true);
      const score = parse(result.project.score);
      expect(song2Dialect.check(score)).toEqual([]);

      for (const voice of score.voices) {
        const notes = pitched(score, voice);
        let reached = -1;
        for (const note of notes) {
          expect(note.start, `${voice} ${note.id}`).toBeGreaterThanOrEqual(reached);
          reached = note.start + note.duration;
          expect(note.start % STEP, `${voice} start ${note.id}`).toBe(0);
          expect(note.duration % STEP, `${voice} length ${note.id}`).toBe(0);
        }
      }

      const untouched = (bar: number): boolean => bar < FIRST || bar > LAST + 1;
      const afterBars = splitBars(result.project.score);
      const beforeBars = splitBars(REAL);
      for (const [key, piece] of beforeBars.pieces) {
        const bar = Number(key.split(":")[1]);
        if (!untouched(bar)) continue;
        expect(afterBars.pieces.get(key), key).toBe(piece);
      }
      for (const line of beforeBars.otherLines) expect(afterBars.otherLines).toContain(line);

      const again = openReal().runTool(tool(example.id), example.values ?? {});
      expect(again.ok).toBe(true);
      expect(again.project.score).toBe(result.project.score);
    });
  }
});

// ABOUTME: The note commands with song2 at seam 2: move and resize, their grid, their overlap rule and bar-line splits.
// ABOUTME: Every expected text is worked by hand from RULES.md; the sample sweep checks the invariants on every score.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  applyScoreCommand,
  type GridValue,
  type Score,
  type ScoreCommand,
  type Note as ScoreNote,
  type SongProject,
  TICKS_PER_QUARTER,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { chainAround, parse, pitched, splitBars, spread } from "./song2-support";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

function scoreOf(body: string, header = HEADER): string {
  return `${header}
K:C
V: Vocal
${body}`;
}

/** A score with four quarter notes in the first bar and a whole note in the second, the shared base of the hand cases. */
const SCORE = scoreOf("C4D4E4F4|G16|");

function move(
  noteIds: ReadonlyArray<string>,
  timeTicks: number,
  semitones: number,
  value: GridValue = 16,
  dotted = false,
): ScoreCommand {
  return { type: "moveNotes", noteIds, timeTicks, semitones, grid: { value, dotted } };
}

function resize(
  noteIds: ReadonlyArray<string>,
  edge: "start" | "end",
  timeTicks: number,
  value: GridValue = 16,
  dotted = false,
): ScoreCommand {
  return { type: "resizeNotes", noteIds, edge, timeTicks, grid: { value, dotted } };
}

function gridStep(value: GridValue, dotted: boolean): number {
  const base = (4 * TICKS_PER_QUARTER) / value;
  return dotted ? (base * 3) / 2 : base;
}

function snap(tick: number, step: number): number {
  return Math.round(tick / step) * step;
}

function refusedCode(result: ReturnType<typeof applyScoreCommand>): string | null {
  return result.ok ? null : result.diagnostic.code;
}

function expectUnchanged(text: string, command: ScoreCommand): void {
  const result = applyScoreCommand(song2Dialect, text, command);
  expect(result.ok).toBe(false);
  expect(result).not.toEqual({ ok: true, text: expect.anything() });
  const project: SongProject = {
    style: "",
    lyrics: "",
    score: text,
    scoreMode: "full",
    seed: null,
    modelId: "song2",
    sourceKey: "notes-test",
  };
  expect(applyProjectCommand(song2Dialect, project, command).project).toBe(project);
}

describe("moveNotes on a hand-worked score", () => {
  it("moves a note into a rest by whole grid steps and leaves its length alone", () => {
    const text = scoreOf("C4D4z4F4|G16|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:256"], 256, 0, 4))).toEqual({
      ok: true,
      text: scoreOf("C4z4D4F4|G16|"),
    });
  });

  it("moves time and pitch together: a semitone is a semitone and the length is kept", () => {
    expect(applyScoreCommand(song2Dialect, SCORE, move(["Vocal:256"], 256, 1, 4))).toEqual({
      ok: true,
      text: scoreOf("C4z4^D4F4|G16|"),
    });
  });

  it("removes a note whose start the placed note covers, and fills its old time with a rest", () => {
    // C moves from 0 to a quarter note later: it covers D's start at 256, so D goes; nothing moves up.
    expect(applyScoreCommand(song2Dialect, SCORE, move(["Vocal:0"], 256, 0, 4))).toEqual({
      ok: true,
      text: scoreOf("z4C4E4F4|G16|"),
    });
  });

  it("shortens a note the placed note starts inside, and leaves a rest where its tail was", () => {
    // C (0-256) moves to 384, inside D (256-768): D is cut at 384 and its tail becomes a rest.
    const text = scoreOf("C4D8F4|G4z12|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 384, 0, 8))).toEqual({
      ok: true,
      text: scoreOf("z4D2C4z2F4|G4z12|"),
    });
  });

  it("shortens a note whose end the placed note really covers", () => {
    // D (512-1024) moves to 256-768: C starts before the placed note and ends inside it, so C is cut at 256.
    const text = scoreOf("C8D8|G16|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:512"], -256, 0, 8))).toEqual({
      ok: true,
      text: scoreOf("C4D8z4|G16|"),
    });
  });

  it("splits a note that crosses a bar line there and ties the pieces", () => {
    // C (0-256) moves to 896 and runs to 1152: it is C2 in bar 1 tied to C2 in bar 2. F is cut at 896.
    const text = scoreOf("C4D4E4F4|z4G4z8|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 896, 0, 8))).toEqual({
      ok: true,
      text: scoreOf("z4D4E4F2C2-|C2z2G4z8|"),
    });
  });

  it("acts on a whole tie chain when the middle segment is the note it names", () => {
    const text = scoreOf("C8-C8|z16|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:512"], 256, 1, 4))).toEqual({
      ok: true,
      text: scoreOf("z4^C12-|^C4z12|"),
    });
  });

  it("acts on a three-piece tie chain when its middle segment is the note it names", () => {
    const text = scoreOf("C4-C4-C4z4|G16|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:256"], 128, 1, 8))).toEqual({
      ok: true,
      text: scoreOf("z2^C12z2|G16|"),
    });
  });

  it("moves several notes as one command, keeping the order they had", () => {
    expect(applyScoreCommand(song2Dialect, SCORE, move(["Vocal:0", "Vocal:512"], 256, 0, 4))).toEqual({
      ok: true,
      text: scoreOf("z4C4z4E4|G16|"),
    });
  });

  it("snaps an off-grid start to the nearest grid line rather than moving by whole steps from where it was", () => {
    // D starts at 64, off a quarter-note grid. A quarter-note move would put it at 320; the nearest line is 256.
    const text = scoreOf("C1D4E4F4z3|G16|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:64"], 256, 1, 4))).toEqual({
      ok: true,
      text: scoreOf("Cz3^D4zF4z3|G16|"),
    });
  });

  it("keeps an off-grid start when only the pitch moves", () => {
    const text = scoreOf("C1D4E4F4z3|G16|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:64"], 0, 1, 4))).toEqual({
      ok: true,
      text: scoreOf("C^D4E4F4z3|G16|"),
    });
  });

  it("keeps a length shorter than the grid when only the pitch moves", () => {
    const text = scoreOf("C1D4E4F4z3|G16|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 0, 1, 4))).toEqual({
      ok: true,
      text: scoreOf("^CD4E4F4z3|G16|"),
    });
  });

  it("leaves an untouched dangling tie at the end of the score alone", () => {
    const text = scoreOf("C4D4E4F4|G16-|");
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 256, 0, 4))).toEqual({
      ok: true,
      text: scoreOf("z4C4E4F4|G16-|"),
    });
  });

  it("accepts a dotted grid and lands on it", () => {
    // Dotted eighths are 192 ticks under L:1/16, three written units.
    expect(applyScoreCommand(song2Dialect, SCORE, move(["Vocal:0"], 192, 0, 8, true))).toEqual({
      ok: true,
      text: scoreOf("z3C4zE4F4|G16|"),
    });
  });

  it("accepts a 1/32 grid when the written unit allows it", () => {
    const header = `${HEADER.replace("L:1/16", "L:1/32")}`;
    const text = scoreOf("C8D8E8F8|G32|", header);
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 32, 0, 32))).toEqual({
      ok: true,
      text: scoreOf("zC8zzzzzzzE8F8|G32|", header),
    });
  });

  it("accepts a dotted 1/32 grid when the written unit allows it", () => {
    const header = HEADER.replace("L:1/16", "L:1/64");
    const four = "C3D3E3F3";
    const text = scoreOf(`${four.repeat(5)}z4|G32-G32|`, header);
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 48, 0, 32, true))).toEqual({
      ok: true,
      text: scoreOf(`z3C3E3F3${"C3D3E3F3".repeat(4)}z4|G32-G32|`, header),
    });
  });

  it("keeps a chord where it is when the Vocal note under it moves, and rebinds it to the event now there", () => {
    const text = scoreOf('"C"C4"D"D4E4F4|G16|');
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 256, 0, 4))).toEqual({
      ok: true,
      text: scoreOf('"C"z4"D"C4E4F4|G16|'),
    });
  });

  it("splits a note under a chord that stays where it is, so the chord keeps a token boundary", () => {
    const text = scoreOf('C8"D"D8|G16|');
    expect(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 256, 0, 8))).toEqual({
      ok: true,
      text: scoreOf('z4C4-"D"C4z4|G16|'),
    });
  });

  it("changes the score text of a project and leaves its lyric lines where they are", () => {
    const lyricLines = [{ text: "la", phrase: { firstBar: 0, barCount: 1 } }];
    const project: SongProject = {
      style: "",
      lyrics: "la",
      score: SCORE,
      scoreMode: "full",
      seed: null,
      modelId: "song2",
      sourceKey: "notes-test",
      lyricLines,
    };
    const done = applyProjectCommand(song2Dialect, project, move(["Vocal:0"], 256, 0, 4));
    expect(done.diagnostics).toEqual([]);
    expect(done.project.score).toBe(scoreOf("z4C4E4F4|G16|"));
    expect(done.project.lyricLines).toEqual(lyricLines);
  });

  it("returns the score as it was for an empty set of notes", () => {
    expect(applyScoreCommand(song2Dialect, SCORE, move([], 256, 0, 4))).toEqual({ ok: true, text: SCORE });
  });
});

describe("resizeNotes on a hand-worked score", () => {
  it("moves the end edge and leaves the start edge where it is", () => {
    const text = scoreOf("C4z4D4E4|G16|");
    expect(applyScoreCommand(song2Dialect, text, resize(["Vocal:0"], "end", 128, 8))).toEqual({
      ok: true,
      text: scoreOf("C6z2D4E4|G16|"),
    });
  });

  it("moves the start edge and leaves the end edge where it is", () => {
    expect(applyScoreCommand(song2Dialect, SCORE, resize(["Vocal:0"], "start", 128, 8))).toEqual({
      ok: true,
      text: scoreOf("z2C2D4E4F4|G16|"),
    });
  });

  it("splits a resize of the end edge that crosses a bar line there and ties the pieces", () => {
    const text = scoreOf("C4D4E4F4|z4G4z8|");
    expect(applyScoreCommand(song2Dialect, text, resize(["Vocal:768"], "end", 256, 4))).toEqual({
      ok: true,
      text: scoreOf("C4D4E4F4-|F4G4z8|"),
    });
  });

  it("splits a resize of the start edge that crosses a bar line there and ties the pieces", () => {
    expect(applyScoreCommand(song2Dialect, SCORE, resize(["Vocal:1024"], "start", -512, 4))).toEqual({
      ok: true,
      text: scoreOf("C4D4G8-|G16|"),
    });
  });

  it("splits a note that now crosses a mid-bar key change there and ties the pieces", () => {
    // C runs from 0 to 768, over the inline [K:G] at 512: it is C8 in C tied to C4 in G. D's start is covered.
    const text = scoreOf("C8[K:G]D8|G8D8|");
    expect(applyScoreCommand(song2Dialect, text, resize(["Vocal:0"], "end", 256, 16))).toEqual({
      ok: true,
      text: scoreOf("C8-[K:G]C4z4|G8D8|"),
    });
  });

  it("shortens a tie chain to a new end when the middle segment is named", () => {
    const text = scoreOf("C8-C8|z16|");
    expect(applyScoreCommand(song2Dialect, text, resize(["Vocal:512"], "end", -256, 4))).toEqual({
      ok: true,
      text: scoreOf("C12z4|z16|"),
    });
  });

  it("resizes a three-piece tie chain when its middle segment is the note it names", () => {
    const text = scoreOf("C4-C4-C4z4|G16|");
    expect(applyScoreCommand(song2Dialect, text, resize(["Vocal:256"], "end", -512, 4))).toEqual({
      ok: true,
      text: scoreOf("C4z8z4|G16|"),
    });
  });

  it("resizes several notes as one command, one note at a time in the voice", () => {
    expect(applyScoreCommand(song2Dialect, SCORE, resize(["Vocal:0", "Vocal:512"], "end", 128, 8))).toEqual({
      ok: true,
      text: scoreOf("C6z2E6z2|G16|"),
    });
  });

  it("returns the score as it was for a zero offset", () => {
    expect(applyScoreCommand(song2Dialect, SCORE, resize(["Vocal:0"], "end", 0, 8))).toEqual({
      ok: true,
      text: SCORE,
    });
  });
});

describe("the refusals of the note commands", () => {
  it("locates a refusal at the middle segment the command names, not at the chain's first one", () => {
    const text = scoreOf("C4-C4-C4z4|G16|");
    const result = applyScoreCommand(song2Dialect, text, move(["Vocal:256"], 0, -100));
    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "pitch-out-of-range",
        params: { midi: -40 },
        at: { voice: "Vocal", bar: 1, beat: 2, noteId: "Vocal:256" },
      },
    });
    expectUnchanged(text, move(["Vocal:256"], 0, -100));
  });

  it("refuses a pitch outside MIDI 0-127 and leaves the text as it was", () => {
    const text = scoreOf("C4D4E4F4|G16|");
    const result = applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 0, -100));
    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "pitch-out-of-range",
        params: { midi: -40 },
        at: { voice: "Vocal", bar: 1, beat: 1, noteId: "Vocal:0" },
      },
    });
    expectUnchanged(text, move(["Vocal:0"], 0, -100));
  });

  it("refuses a note pushed before the start of the score", () => {
    const text = scoreOf("C4D4E4F4|G16|");
    const result = applyScoreCommand(song2Dialect, text, move(["Vocal:0"], -256, 0, 4));
    expect(refusedCode(result)).toBe("note-before-start");
    expectUnchanged(text, move(["Vocal:0"], -256, 0, 4));
  });

  it("refuses a note pushed past the end of the score rather than clamping it", () => {
    const text = scoreOf("C4D4E4F4|G16|");
    const result = applyScoreCommand(song2Dialect, text, move(["Vocal:1024"], 256, 0, 4));
    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "note-past-end",
        params: {},
        at: { voice: "Vocal", bar: 2, beat: 1, noteId: "Vocal:1024" },
      },
    });
    expectUnchanged(text, move(["Vocal:1024"], 256, 0, 4));
  });

  it("refuses a length shorter than one grid step and names an undotted grid as undotted", () => {
    const text = scoreOf("C4D4E4F4|G16|");
    const result = applyScoreCommand(song2Dialect, text, resize(["Vocal:0"], "end", -256, 4));
    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "note-too-short",
        params: { grid: "1/4", dotted: false },
        at: { voice: "Vocal", bar: 1, beat: 1, noteId: "Vocal:0" },
      },
    });
    expectUnchanged(text, resize(["Vocal:0"], "end", -256, 4));
  });

  it("carries the dotted flag when a dotted grid makes a resize too short", () => {
    const text = scoreOf("C4D4E4F4|G16|");
    const result = applyScoreCommand(song2Dialect, text, resize(["Vocal:0"], "end", -192, 8, true));
    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "note-too-short",
        params: { grid: "1/8", dotted: true },
        at: { voice: "Vocal", bar: 1, beat: 1, noteId: "Vocal:0" },
      },
    });
  });

  it("refuses with unit-unknown when a score does not state its written unit", () => {
    const parsed = song2Dialect.parse(SCORE);
    if (parsed.score === null) throw new Error("the test score does not read");
    const { unitTicks, ...withoutUnit } = parsed.score;
    expect(unitTicks).toBe(64);
    const dialect = {
      ...song2Dialect,
      parse: (_text: string) => ({ score: { ...withoutUnit }, diagnostics: [] as const }),
    };
    const result = applyScoreCommand(dialect, SCORE, move(["Vocal:0"], 0, 0));
    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "unit-unknown",
        params: {},
        at: { voice: "Vocal", bar: 1, beat: 1, noteId: "Vocal:0" },
      },
    });
  });

  it("refuses a grid the score's written unit cannot express", () => {
    const text = scoreOf("C4D4E4F4|G16|");
    const result = applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 32, 0, 32));
    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "grid-not-allowed",
        params: { grid: "1/32", dotted: false },
        at: { voice: "Vocal", bar: 1, beat: 1, noteId: "Vocal:0" },
      },
    });
    expectUnchanged(text, move(["Vocal:0"], 32, 0, 32));
  });

  it("refuses a dotted grid the written unit cannot express", () => {
    const text = scoreOf("C4D4E4F4|G16|");
    const result = applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 96, 0, 16, true));
    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "grid-not-allowed",
        params: { grid: "1/16", dotted: true },
        at: { voice: "Vocal", bar: 1, beat: 1, noteId: "Vocal:0" },
      },
    });
    expectUnchanged(text, move(["Vocal:0"], 96, 0, 16, true));
  });

  it("refuses an id that names no note, and an id that names a rest", () => {
    const text = scoreOf("C4z4E4F4|G16|");
    const missing = applyScoreCommand(song2Dialect, text, move(["Vocal:0", "Vocal:999"], 0, 0));
    expect(missing).toEqual({
      ok: false,
      diagnostic: { code: "note-not-found", params: { noteId: "Vocal:999" }, at: { noteId: "Vocal:999" } },
    });
    const rest = applyScoreCommand(song2Dialect, text, move(["Vocal:256"], 0, 0));
    expect(rest).toEqual({
      ok: false,
      diagnostic: {
        code: "not-a-note",
        params: { noteId: "Vocal:256" },
        at: { voice: "Vocal", bar: 1, beat: 2, noteId: "Vocal:256" },
      },
    });
  });

  it("points a writer refusal at the first note the command names", () => {
    const throwing = {
      ...song2Dialect,
      serialize() {
        throw new Error("writer refused");
      },
    };
    const result = applyScoreCommand(throwing, SCORE, move(["Vocal:256"], 256, 0, 4));
    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "write-mismatch",
        params: {},
        at: { voice: "Vocal", bar: 1, beat: 2, noteId: "Vocal:256" },
      },
    });
  });

  it("refuses a non-integer time or pitch offset and changes nothing", () => {
    const text = scoreOf("C4D4E4F4|G16|");
    expect(refusedCode(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 1.5, 0)))).toBe("offset-not-integer");
    expect(refusedCode(applyScoreCommand(song2Dialect, text, move(["Vocal:0"], 0, 0.5)))).toBe("offset-not-integer");
    expectUnchanged(text, move(["Vocal:0"], 1.5, 0));
  });
});

interface SampleFact {
  file: string;
}

interface Vector {
  id: string;
  text: string;
  expect: "accept" | "reject";
  notes?: Record<string, unknown[]>;
}

const directory = new URL("../packages/score-dialect-song2/tests/", import.meta.url);
const facts = JSON.parse(readFileSync(new URL("samples.json", directory), "utf8")) as SampleFact[];
const vectors = (JSON.parse(readFileSync(new URL("vectors.json", directory), "utf8")) as { vectors: Vector[] }).vectors;

const REFUSALS = new Set([
  "write-mismatch",
  "truncated-tail",
  "pitch-out-of-range",
  "note-before-start",
  "note-past-end",
  "note-too-short",
  "grid-not-allowed",
]);

/** The coarsest offered grid the score's written unit can express, so the sweep uses a grid the score has. */
function gridFor(score: Score): { value: GridValue; dotted: boolean } | null {
  const unitTicks = score.unitTicks;
  if (unitTicks === undefined) return null;
  for (const value of [16, 8, 4, 32] as GridValue[]) {
    const units = gridStep(value, false) / unitTicks;
    if (Number.isInteger(units) && song2Dialect.constraints.durations.includes(units)) return { value, dotted: false };
  }
  return null;
}

/**
 * Applies one note command to one target and holds the result to every promise the command makes: it reads, untouched
 * bars keep their bytes and untouched notes their facts, the voice stays one note at a time, and the target reaches the
 * place the grid gives it.
 */
function exercise(label: string, text: string, command: ScoreCommand, target: ScoreNote, voice: string): boolean {
  const input = parse(text);
  const chain = chainAround(input, target.id);
  const first = chain[0] as ScoreNote;
  const last = chain[chain.length - 1] as ScoreNote;
  const duration = last.start + last.duration - first.start;
  const step = gridStep(
    (command as { grid: { value: GridValue; dotted?: boolean } }).grid.value,
    (command as { grid: { value: number; dotted?: boolean } }).grid.dotted === true,
  );
  const isMove = command.type === "moveNotes";
  const start = isMove
    ? command.timeTicks === 0
      ? first.start
      : snap(first.start + command.timeTicks, step)
    : first.start;
  let end = start + duration;
  let newStart = start;
  let newEnd = end;
  if (command.type === "resizeNotes") {
    newStart = command.edge === "start" ? snap(first.start + command.timeTicks, step) : first.start;
    newEnd =
      command.edge === "end" ? snap(last.start + last.duration + command.timeTicks, step) : last.start + last.duration;
    end = newEnd;
  }

  const result = applyScoreCommand(song2Dialect, text, command);
  if (!result.ok) {
    expect(REFUSALS.has(result.diagnostic.code), `${label}: refusal ${result.diagnostic.code}`).toBe(true);
    expectUnchanged(text, command);
    return false;
  }

  const output = parse(result.text);
  expect(song2Dialect.check(output), `${label}: check`).toEqual([]);

  const targetIds = new Set(chain.map((note) => note.id));
  const affected = new Set(targetIds);
  for (const note of input.notes) {
    if (note.voice !== voice || targetIds.has(note.id)) continue;
    const noteEnd = note.start + note.duration;
    if (note.start < newEnd && noteEnd > newStart) {
      for (const member of chainAround(input, note.id)) affected.add(member.id);
    }
  }
  for (const candidateVoice of input.voices) {
    const notes = input.notes
      .filter((note) => note.voice === candidateVoice)
      .sort((left, right) => left.start - right.start);
    for (let index = notes.length - 2; index >= 0; index -= 1) {
      const note = notes[index] as ScoreNote;
      const next = notes[index + 1] as ScoreNote;
      if (note.tie && affected.has(next.id)) affected.add(note.id);
    }
  }
  const touchedBars = new Set<string>();
  for (const note of input.notes) {
    if (!affected.has(note.id)) continue;
    touchedBars.add(`${note.voice}:${note.bar}`);
  }
  for (let index = 0; index < input.bars.length; index += 1) {
    const bar = input.bars[index];
    if (bar === undefined) continue;
    if (bar.start < newEnd && bar.start + bar.length > newStart) touchedBars.add(`${voice}:${index}`);
  }

  const before = splitBars(text);
  const after = splitBars(result.text);
  // One Z, Z2, Z3 or Z4 writes several bars; a rewrite of one bar rewrites the whole run, so a touched bar touches
  // every bar that run carries.
  const wholeRestRuns: string[][] = [];
  for (const [key, piece] of before.pieces) {
    const run = /^Z([234])$/.exec(piece.trim());
    if (run === null) continue;
    const [runVoice = "", barText = ""] = key.split(":");
    const first = Number(barText);
    wholeRestRuns.push(Array.from({ length: Number(run[1]) }, (_item, offset) => `${runVoice}:${first + offset}`));
  }
  for (const run of wholeRestRuns) {
    if (!run.some((key) => touchedBars.has(key))) continue;
    for (const key of run) touchedBars.add(key);
  }
  for (const [key, piece] of before.pieces) {
    if (touchedBars.has(key)) continue;
    expect(after.pieces.get(key), `${label}: untouched bar ${key}`).toBe(piece);
  }
  expect(after.otherLines, `${label}: non-music lines`).toEqual(before.otherLines);

  for (const note of input.notes) {
    if (affected.has(note.id)) continue;
    expect(
      output.notes.find((candidate) => candidate.id === note.id),
      `${label}: ${note.id}`,
    ).toMatchObject({
      voice: note.voice,
      start: note.start,
      duration: note.duration,
      midi: note.midi,
      tie: note.tie,
    });
  }

  for (const candidateVoice of output.voices) {
    const notes = output.notes
      .filter((note) => note.voice === candidateVoice)
      .sort((left, right) => left.start - right.start);
    for (let index = 1; index < notes.length; index += 1) {
      const previous = notes[index - 1] as ScoreNote;
      const note = notes[index] as ScoreNote;
      expect(note.start, `${label}: ${candidateVoice} one note at a time at ${note.id}`).toBeGreaterThanOrEqual(
        previous.start + previous.duration,
      );
    }
  }

  const noteAtStart = output.notes.find((note) => note.voice === voice && note.start === newStart);
  const reached = noteAtStart === undefined ? [] : chainAround(output, noteAtStart.id);
  const reachedFirst = reached[0];
  expect(reachedFirst, `${label}: the target starts at ${newStart}`).toBeDefined();
  if (reachedFirst === undefined) return false;
  expect(reachedFirst.midi, `${label}: the target pitch`).toBe(
    target.midi === null ? null : target.midi + (isMove ? command.semitones : 0),
  );
  const reachedLast = reached[reached.length - 1];
  const reachedLength =
    reachedFirst === undefined || reachedLast === undefined
      ? 0
      : reachedLast.start + reachedLast.duration - reachedFirst.start;
  expect(reachedLength, `${label}: the target length`).toBe(newEnd - newStart);
  expect(newStart % step, `${label}: the start is on the grid`).toBe(0);
  if (command.type === "resizeNotes") {
    const movedEdge = command.edge === "start" ? newStart : newStart + reachedLength;
    expect(movedEdge % step, `${label}: the moved edge is on the grid`).toBe(0);
    const fixedEdge = command.edge === "start" ? newStart + reachedLength : newStart;
    expect(fixedEdge, `${label}: the other edge stays`).toBe(
      command.edge === "start" ? last.start + last.duration : first.start,
    );
  } else if (command.type === "moveNotes") {
    expect(reachedLength, `${label}: a move keeps the length`).toBe(duration);
    if (command.timeTicks === 0) expect(newStart, `${label}: a pitch-only move keeps its start`).toBe(first.start);
  }
  return true;
}

function exerciseAll(label: string, text: string, requireSuccess: boolean): void {
  const input = parse(text);
  const grid = gridFor(input);
  if (grid === null) return;
  let succeeded = 0;
  for (const note of spread(input)) {
    const target = input.notes.find((candidate) => candidate.id === note);
    if (target === undefined) continue;
    const step = gridStep(grid.value, false);
    if (exercise(`${label}: move ${note}`, text, move([note], step, 1, grid.value), target, target.voice)) {
      succeeded += 1;
    }
    if (exercise(`${label}: resize ${note}`, text, resize([note], "end", step, grid.value), target, target.voice)) {
      succeeded += 1;
    }
  }
  if (requireSuccess) expect(succeeded, `${label}: at least one target was moved or resized`).toBeGreaterThan(0);
}

describe("move and resize on every sample: untouched bars, one note a time, target reached", () => {
  for (const fact of facts) {
    it(`${fact.file}: the sweep holds every invariant`, () => {
      exerciseAll(fact.file, readFileSync(new URL(`samples/${fact.file}`, directory), "utf8"), true);
    });
  }

  for (const fact of facts) {
    it(`${fact.file}: moves the first pitched note`, () => {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const input = parse(text);
      const note = input.notes.find((candidate) => candidate.midi !== null);
      const grid = gridFor(input);
      expect(note, `${fact.file}: a pitched note`).toBeDefined();
      expect(grid, `${fact.file}: an offered grid`).not.toBeNull();
      if (note === undefined || grid === null) return;
      const result = applyScoreCommand(song2Dialect, text, move([note.id], gridStep(grid.value, false), 1, grid.value));
      expect(result.ok, `${fact.file}: ${result.ok ? "" : result.diagnostic.code}`).toBe(true);
      if (result.ok) expect(song2Dialect.check(parse(result.text)), `${fact.file}: check`).toEqual([]);
    });
  }
});

describe("move and resize on every accepted vector with notes", () => {
  for (const vector of vectors) {
    if (vector.expect !== "accept" || vector.notes === undefined) continue;
    it(`${vector.id}: the sweep holds every invariant`, () => {
      exerciseAll(vector.id, vector.text, false);
    });
  }

  it("refuses a 1/32 grid on every score whose L: unit is 1/16", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      if (!text.includes("L:1/16")) continue;
      const input = parse(text);
      const note = pitched(input, input.voices[0] as string)[0];
      if (note === undefined) continue;
      const result = applyScoreCommand(song2Dialect, text, move([note.id], 32, 0, 32));
      expect(result.ok, `${fact.file}: 1/32`).toBe(false);
      if (!result.ok) expect(result.diagnostic.code, `${fact.file}: 1/32 code`).toBe("grid-not-allowed");
    }
  });
});

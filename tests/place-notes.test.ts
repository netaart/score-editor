// ABOUTME: Seam 1 for placing new notes with song2: add a note, paste copied notes at the insertion point, duplicate a selection.
// ABOUTME: Every expected text is worked by hand from RULES.md; the sample sweep holds the untouched-bars and one-note-a-time promises.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  applyScoreCommand,
  type Score,
  type ScoreCommand,
  type Note as ScoreNote,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { chainAround, parse, pitched, splitBars } from "./song2-support";

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

const SCORE = scoreOf("C4D4E4F4|G16|");

function add(voice: string, start: number, midi: number, value: 4 | 8 | 16 | 32 = 4): ScoreCommand {
  return { type: "addNote", voice, start, midi, grid: { value } };
}

describe("addNote on a hand-worked score", () => {
  it("puts an empty lane cell's note on the grid with one grid step as its length", () => {
    const text = scoreOf("C4z4D4E4|G16|");
    expect(applyScoreCommand(song2Dialect, text, add("Vocal", 256, 65, 4))).toEqual({
      ok: true,
      text: scoreOf("C4F4D4E4|G16|"),
    });
  });

  it("removes a note whose start the new note covers and shortens one it starts inside", () => {
    // C (0-384) is cut at 256; D starts at 384 inside the new note, so it goes; 512-640 is a rest.
    expect(applyScoreCommand(song2Dialect, scoreOf("C6D4E4z2|G16|"), add("Vocal", 256, 65, 4))).toEqual({
      ok: true,
      text: scoreOf("C4F4z2E4z2|G16|"),
    });
  });
});

function paste(
  notes: ReadonlyArray<{ voice: string; start: number; duration: number; midi: number }>,
  at: number,
  value: 4 | 8 | 16 | 32 = 4,
): ScoreCommand {
  return { type: "pasteNotes", notes, at, grid: { value } };
}

function duplicate(noteIds: ReadonlyArray<string>, value: 4 | 8 | 16 | 32 = 4): ScoreCommand {
  return { type: "duplicateNotes", noteIds, grid: { value } };
}

describe("duplicateNotes on a hand-worked score", () => {
  it("repeats the selection right after itself as one step", () => {
    const text = scoreOf("C4D4z8|z16|");
    expect(applyScoreCommand(song2Dialect, text, duplicate(["Vocal:0", "Vocal:256"]))).toEqual({
      ok: true,
      text: scoreOf("C4D4C4D4|z16|"),
    });
  });
});

function copy(
  noteIds: ReadonlyArray<string>,
  timeTicks: number,
  semitones: number,
  value: 4 | 8 | 16 | 32 = 4,
): ScoreCommand {
  return { type: "copyNotes", noteIds, timeTicks, semitones, grid: { value } };
}

describe("copyNotes, the Alt-drag", () => {
  it("puts copies where the drag lands and leaves the originals alone", () => {
    expect(applyScoreCommand(song2Dialect, SCORE, copy(["Vocal:0"], 512, 1, 4))).toEqual({
      ok: true,
      text: scoreOf("C4D4^C4F4|G16|"),
    });
  });
});

describe("pasteNotes on a hand-worked score", () => {
  it("puts the copied notes at the insertion point, keeping their distance, on the grid", () => {
    const text = scoreOf("C4D4E4F4|z16|");
    const notes = [
      { voice: "Vocal", start: 0, duration: 256, midi: 60 },
      { voice: "Vocal", start: 256, duration: 256, midi: 62 },
    ];
    expect(applyScoreCommand(song2Dialect, text, paste(notes, 1024, 4))).toEqual({
      ok: true,
      text: scoreOf("C4D4E4F4|C4D4z8|"),
    });
  });
});

interface SampleFact {
  file: string;
}

const directory = new URL("../packages/score-dialect-song2/tests/", import.meta.url);
const facts = JSON.parse(readFileSync(new URL("samples.json", directory), "utf8")) as SampleFact[];

function gridFor(score: Score): { value: 4 | 8 | 16 | 32; step: number } | null {
  const unitTicks = score.unitTicks;
  if (unitTicks === undefined) return null;
  for (const value of [16, 8, 4, 32] as const) {
    const step = (4 * 256) / value;
    const units = step / unitTicks;
    if (Number.isInteger(units) && song2Dialect.constraints.durations.includes(units)) return { value, step };
  }
  return null;
}

function barAt(score: Score, tick: number): number {
  let found = 0;
  for (const bar of score.bars) if (bar.start <= tick) found = bar.index;
  return found;
}

function snapped(tick: number, step: number): number {
  return Math.round(tick / step) * step + 0;
}

/** Asserts the promises every placing command makes on one score and the spans the command is contracted to put there. */
function exercisePlaced(
  label: string,
  text: string,
  command: ScoreCommand,
  expected: ReadonlyArray<{ voice: string; start: number; end: number; midi: number }>,
  step: number,
): void {
  const input = parse(text);
  const result = applyScoreCommand(song2Dialect, text, command);
  expect(result.ok, `${label}: ${result.ok ? "" : result.diagnostic.code}`).toBe(true);
  if (!result.ok) return;
  const output = parse(result.text);
  expect(song2Dialect.check(output), `${label}: check`).toEqual([]);

  const touchedBars = new Set<string>();
  const affected = new Set<string>();
  for (const span of expected) {
    expect(span.start % step, `${label}: a start on the grid`).toBe(0);
    for (let bar = barAt(input, span.start); bar < input.bars.length; bar += 1) {
      const found = input.bars[bar];
      if (found === undefined || found.start >= span.end) break;
      touchedBars.add(`${span.voice}:${bar}`);
    }
    for (const note of input.notes) {
      if (note.voice !== span.voice) continue;
      if (note.start < span.end && note.start + note.duration > span.start) {
        affected.add(note.id);
        touchedBars.add(`${note.voice}:${note.bar}`);
      }
    }
  }

  const before = splitBars(text);
  const after = splitBars(result.text);
  for (const [key, piece] of before.pieces) {
    if (touchedBars.has(key)) continue;
    expect(after.pieces.get(key), `${label}: untouched bar ${key}`).toBe(piece);
  }
  expect(after.otherLines, `${label}: non-music lines`).toEqual(before.otherLines);

  for (const note of input.notes) {
    if (affected.has(note.id)) continue;
    expect(
      output.notes.find((candidate) => candidate.id === note.id),
      `${label}: untouched ${note.id}`,
    ).toMatchObject({
      voice: note.voice,
      start: note.start,
      duration: note.duration,
      midi: note.midi,
      tie: note.tie,
    });
  }

  for (const voice of output.voices) {
    const notes = output.notes.filter((note) => note.voice === voice).sort((left, right) => left.start - right.start);
    for (let index = 1; index < notes.length; index += 1) {
      const previous = notes[index - 1] as ScoreNote;
      const note = notes[index] as ScoreNote;
      expect(note.start, `${label}: ${voice} one note at a time at ${note.id}`).toBeGreaterThanOrEqual(
        previous.start + previous.duration,
      );
    }
  }

  for (const span of expected) {
    const at = output.notes.find(
      (note) => note.voice === span.voice && note.start === span.start && note.midi === span.midi,
    );
    expect(at, `${label}: the placed note at ${span.voice}:${span.start}`).toBeDefined();
    if (at === undefined) continue;
    const chain = chainAround(output, at.id);
    const first = chain[0] as ScoreNote;
    const last = chain[chain.length - 1] as ScoreNote;
    expect(last.start + last.duration - first.start, `${label}: the placed length`).toBe(span.end - span.start);
  }
}

/** One placing command per sample, with a command that fits the sample's grid and end. */
function exerciseSample(file: string): void {
  const text = readFileSync(new URL(`samples/${file}`, directory), "utf8");
  const input = parse(text);
  const grid = gridFor(input);
  if (grid === null) return;
  const first = pitched(input, input.voices[0] as string)[0];
  if (first === undefined) return;
  const span = chainAround(input, first.id);
  const start = (span[0] as ScoreNote).start;
  const end = (span[span.length - 1] as ScoreNote).start + (span[span.length - 1] as ScoreNote).duration;
  const midi = first.midi as number;
  const step = grid.step;

  exercisePlaced(
    `${file}: add`,
    text,
    add(first.voice, 0, midi, grid.value),
    [{ voice: first.voice, start: 0, end: step, midi }],
    step,
  );
  exercisePlaced(
    `${file}: duplicate`,
    text,
    duplicate([first.id], grid.value),
    [
      {
        voice: first.voice,
        start: snapped(start + Math.max(step, snapped(end, step) - snapped(start, step)), step),
        end: snapped(start + Math.max(step, snapped(end, step) - snapped(start, step)), step) + (end - start),
        midi,
      },
    ],
    step,
  );
  exercisePlaced(
    `${file}: paste`,
    text,
    paste([{ voice: first.voice, start, duration: end - start, midi }], 0, grid.value),
    [{ voice: first.voice, start: 0, end: snapped(end - start, step) + 0, midi }],
    step,
  );
}

describe("placing on every sample: untouched bars, one note a time, the target reached", () => {
  for (const fact of facts) {
    it(`${fact.file}: the sweep holds every invariant`, () => {
      exerciseSample(fact.file);
    });
  }
});

/** Applies a command that must be refused and holds the score and the project to their bytes. */
function expectPlaceRefused(label: string, text: string, command: ScoreCommand, code: string): void {
  const result = applyScoreCommand(song2Dialect, text, command);
  expect(result.ok, label).toBe(false);
  if (!result.ok) expect(result.diagnostic.code, label).toBe(code);
  const project = {
    style: "",
    lyrics: "",
    score: text,
    scoreMode: "full" as const,
    seed: null,
    modelId: "song2",
    sourceKey: "place-notes-test",
  };
  expect(applyProjectCommand(song2Dialect, project, command).project, `${label}: unchanged`).toBe(project);
}

describe("the placing commands' refusals leave the score as it was", () => {
  it("refuses a pitch outside MIDI's range", () => {
    expectPlaceRefused(
      "pitch",
      SCORE,
      { type: "addNote", voice: "Vocal", start: 0, midi: 128, grid: { value: 4 } },
      "pitch-out-of-range",
    );
  });

  it("refuses a grid the score's written unit cannot make", () => {
    expectPlaceRefused(
      "grid",
      SCORE,
      { type: "addNote", voice: "Vocal", start: 0, midi: 60, grid: { value: 32 } },
      "grid-not-allowed",
    );
  });

  it("refuses a note that would start before the score or end past it", () => {
    expectPlaceRefused(
      "before",
      SCORE,
      { type: "addNote", voice: "Vocal", start: -256, midi: 60, grid: { value: 4 } },
      "note-before-start",
    );
    expectPlaceRefused(
      "past",
      SCORE,
      { type: "addNote", voice: "Vocal", start: 2048, midi: 60, grid: { value: 4 } },
      "note-past-end",
    );
    expectPlaceRefused(
      "paste past",
      SCORE,
      paste([{ voice: "Vocal", start: 0, duration: 512, midi: 60 }], 1792, 4),
      "note-past-end",
    );
  });

  it("names a note or a rest that a duplicate or a copy cannot take", () => {
    expectPlaceRefused("missing", SCORE, duplicate(["Vocal:999"]), "note-not-found");
    const withRest = scoreOf("C4z4D4E4|G16|");
    expectPlaceRefused("rest", withRest, copy(["Vocal:256"], 256, 0), "not-a-note");
  });

  it("refuses an offset that is not a whole number of ticks", () => {
    expectPlaceRefused("fraction", SCORE, copy(["Vocal:0"], 0.5, 0), "offset-not-integer");
  });
});

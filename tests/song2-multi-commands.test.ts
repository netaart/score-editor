// ABOUTME: Seam 1 for the command that turns several notes into rests: on hand-worked scores, on every sample and accepted vector.
// ABOUTME: Expected texts come from RULES.md by hand; the all-or-nothing and write-once guarantees are read from the dialect's calls.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  type ApplyScoreResult,
  applyProjectCommand,
  applyScoreCommand,
  formatDiagnostic,
  type Score,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { chainAround, noteFacts, parse, pitched, SAMPLE_SWEEP_TIMEOUT, splitBars } from "./song2-support";

/** The result without the additive `rewrittenBars` field; tests/rewritten-bars.test.ts asserts that field. */
function textOnly(text: string, command: Parameters<typeof applyScoreCommand>[2]): ApplyScoreResult {
  const result = applyScoreCommand(song2Dialect, text, command);
  return result.ok ? { ok: true, text: result.text } : result;
}

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

/** Bar 1: C D E F as quarter notes, so the notes start at 0, 256, 512 and 768 ticks. Bar 2: a whole note G. */
const SCORE = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16|`;

describe("toRests on a hand-worked score", () => {
  it("turns every named note into a rest, and leaves the others and the bars they sit in as they were", () => {
    const result = textOnly(SCORE, { type: "toRests", noteIds: ["Vocal:0", "Vocal:512"] });

    expect(result).toEqual({
      ok: true,
      text: `${HEADER}
K:C
V: Vocal
z4D4z4F4|G16|`,
    });
  });

  it("gives the text the same single commands give one after the other", () => {
    const first = textOnly(SCORE, { type: "toRest", noteId: "Vocal:256" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = textOnly(first.text, { type: "toRest", noteId: "Vocal:768" });
    const both = textOnly(SCORE, { type: "toRests", noteIds: ["Vocal:768", "Vocal:256"] });

    expect(second).toEqual(both);
    expect(both).toEqual({
      ok: true,
      text: `${HEADER}
K:C
V: Vocal
C4z4E4z4|G16|`,
    });
  });

  it("takes the tie chain of every note it names once, however many of its segments and how often are named", () => {
    const tied = `${HEADER}
K:D
V: Vocal
A4^F12-|F16|`;

    const named = textOnly(tied, {
      type: "toRests",
      noteIds: ["Vocal:1024", "Vocal:256", "Vocal:1024", "Vocal:0"],
    });

    expect(named).toEqual({
      ok: true,
      text: `${HEADER}
K:D
V: Vocal
z4z12|z16|`,
    });
  });

  it("turns nothing into a rest when it names nothing: the text comes back as it was", () => {
    expect(textOnly(SCORE, { type: "toRests", noteIds: [] })).toEqual({
      ok: true,
      text: SCORE,
    });
  });

  it("is refused as a whole by an id that names no note, and says which id", () => {
    const result = textOnly(SCORE, { type: "toRests", noteIds: ["Vocal:0", "Vocal:999"] });

    expect(result).toEqual({
      ok: false,
      diagnostic: { code: "note-not-found", params: { noteId: "Vocal:999" }, at: { noteId: "Vocal:999" } },
    });
  });

  it("is refused as a whole by an id that names a rest, and says where that rest is", () => {
    const withRest = `${HEADER}
K:C
V: Vocal
C4z4E4F4|G16|`;

    const result = textOnly(withRest, {
      type: "toRests",
      noteIds: ["Vocal:0", "Vocal:256", "Vocal:512"],
    });

    expect(result).toEqual({
      ok: false,
      diagnostic: {
        code: "not-a-note",
        params: { noteId: "Vocal:256" },
        at: { voice: "Vocal", bar: 1, beat: 2, noteId: "Vocal:256" },
      },
    });
  });

  it("names the first of two bad ids in the order the command lists them", () => {
    const result = textOnly(SCORE, {
      type: "toRests",
      noteIds: ["Vocal:0", "Vocal:999", "Vocal:998"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.params.noteId).toBe("Vocal:999");
  });

  it("changes the score text of a project and nothing else, and hands back the project it was given when it is refused", () => {
    const project: SongProject = {
      style: "pop",
      lyrics: "la la",
      score: SCORE,
      scoreMode: "full",
      seed: 7,
      modelId: "song2",
      sourceKey: "multi-commands-test",
    };

    const done = applyProjectCommand(song2Dialect, project, { type: "toRests", noteIds: ["Vocal:0", "Vocal:256"] });
    expect(done.diagnostics).toEqual([]);
    expect(done.project).toEqual({
      ...project,
      score: `${HEADER}
K:C
V: Vocal
z4z4E4F4|G16|`,
    });

    const refused = applyProjectCommand(song2Dialect, project, { type: "toRests", noteIds: ["Vocal:0", "Vocal:999"] });
    expect(refused.project).toBe(project);
    expect(refused.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["note-not-found"]);
  });
});

/** G is tied into a note of the cut tail: writing it as a rest would make the cut a complete score. */
const CUT = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16-|B`;

describe("toRests writes once and checks once", () => {
  /** The song2 dialect with its calls counted, so the number of writes and checks can be read. */
  function counted() {
    const calls = { parse: 0, serialize: 0, check: 0 };
    const dialect = {
      ...song2Dialect,
      parse: (text: string) => {
        calls.parse += 1;
        return song2Dialect.parse(text);
      },
      serialize: (...args: Parameters<typeof song2Dialect.serialize>) => {
        calls.serialize += 1;
        return song2Dialect.serialize(...args);
      },
      check: (...args: Parameters<typeof song2Dialect.check>) => {
        calls.check += 1;
        return song2Dialect.check(...args);
      },
    };
    return { calls, dialect };
  }

  it("serializes and checks the score once for any number of notes, where single commands do it once each", () => {
    const { calls, dialect } = counted();
    const result = applyScoreCommand(dialect, SCORE, {
      type: "toRests",
      noteIds: ["Vocal:0", "Vocal:256", "Vocal:512", "Vocal:768", "Vocal:1024"],
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual({ parse: 1, serialize: 1, check: 1 });
  });

  it("checks the score once when the check refuses it, however many notes the command names", () => {
    const { calls, dialect } = counted();
    const result = applyScoreCommand(dialect, CUT, {
      type: "toRests",
      noteIds: ["Vocal:0", "Vocal:256", "Vocal:512", "Vocal:768", "Vocal:1024"],
    });

    expect(result.ok).toBe(false);
    expect(calls).toEqual({ parse: 1, serialize: 1, check: 1 });
  });
});

describe("toRests refused by the check", () => {
  it("is refused as a whole, with the score left as it was", () => {
    const result = textOnly(CUT, { type: "toRests", noteIds: ["Vocal:0", "Vocal:1024"] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("write-mismatch");
  });

  it("points at the first note the command names when the check names no place of its own", () => {
    const result = textOnly(CUT, {
      type: "toRests",
      noteIds: ["Vocal:256", "Vocal:1024", "Vocal:0"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.at).toEqual({ voice: "Vocal", bar: 1, beat: 2, noteId: "Vocal:256" });
    expect(formatDiagnostic(result.diagnostic, "en")).toBe(
      "This change can't be written into the score safely, so the score was left as it was. (bar 1, beat 2)",
    );
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

/** First, middle and last pitched note of each voice, a tied one, and one in each incomplete bar. */
function spread(score: Score): string[] {
  const chosen = new Set<string>();
  for (const voice of score.voices) {
    const notes = pitched(score, voice);
    if (notes.length === 0) continue;
    for (const note of [notes[0], notes[Math.floor(notes.length / 2)], notes[notes.length - 1]]) {
      if (note !== undefined) chosen.add(note.id);
    }
    const voiceNotes = score.notes.filter((note) => note.voice === voice).sort((a, b) => a.start - b.start);
    const tied = voiceNotes.find(
      (note, index) => note.midi !== null && (note.tie || voiceNotes[index - 1]?.tie === true),
    );
    if (tied !== undefined) chosen.add(tied.id);
  }
  for (const bar of score.bars) {
    if (!bar.incomplete) continue;
    const note = score.notes.find((candidate) => candidate.bar === bar.index && candidate.midi !== null);
    if (note !== undefined) chosen.add(note.id);
  }
  return [...chosen];
}

/** Every second pitched note of each voice, so the untouched notes sit between the touched ones. */
function everyOther(score: Score): string[] {
  return score.voices.flatMap((voice) =>
    pitched(score, voice)
      .filter((_, at) => at % 2 === 0)
      .map((note) => note.id),
  );
}

/** Every pitched note: what Select all and Delete do. */
function allNotes(score: Score): string[] {
  return score.voices.flatMap((voice) => pitched(score, voice).map((note) => note.id));
}

/** Every segment of the first tie chain that has two, then the first pitched note outside it. */
function chainAndAnother(score: Score): string[] {
  for (const note of score.notes) {
    if (note.midi === null || !note.tie) continue;
    const chain = chainAround(score, note.id);
    const inside = new Set(chain.map((member) => member.id));
    const outside = score.notes.find((other) => other.midi !== null && !inside.has(other.id));
    return [...chain.map((member) => member.id), ...(outside === undefined ? [] : [outside.id])];
  }
  return [];
}

/** The sets small enough to be compared with the single commands applied one after the other, which is slow. */
const SMALL_SETS = new Set(["a spread of notes", "a whole tie chain and another note"]);

const SETS: ReadonlyArray<[string, (score: Score) => string[]]> = [
  ["a spread of notes", spread],
  ["every other note", everyOther],
  ["every note", allNotes],
  ["a whole tie chain and another note", chainAndAnother],
];

const counts = { applied: 0, refused: 0 };

/**
 * The single commands applied one after the other: the text they come to, or the refusal of the first that is refused.
 * A note whose tie chain an earlier one already turned into rests is skipped, since it is a rest by then.
 */
function oneByOne(text: string, ids: string[], input: Score) {
  const done = new Set<string>();
  let current = text;
  for (const noteId of ids) {
    if (done.has(noteId)) continue;
    const step = textOnly(current, { type: "toRest", noteId });
    if (!step.ok) return step;
    current = step.text;
    for (const member of chainAround(input, noteId)) done.add(member.id);
  }
  return { ok: true, text: current } as const;
}

/**
 * Turns the notes named by `ids` into rests with one command, and holds the result to what is asked of the command for one note:
 * it reads, untouched bars are the same bytes, untouched notes keep their pitch and start, every target is a rest. A
 * refused set changes nothing and points at the first note of the command.
 */
function exerciseSet(
  label: string,
  name: string,
  text: string,
  ids: string[],
  input: Score,
  before: ReturnType<typeof splitBars>,
): void {
  const command = { type: "toRests", noteIds: ids } as const;
  const result = textOnly(text, command);

  if (SMALL_SETS.has(name))
    expect(result, `${label}: against the single commands one by one`).toEqual(oneByOne(text, ids, input));

  if (!result.ok) {
    counts.refused += 1;
    expect(result.diagnostic.code, `${label}: code`).toBe("write-mismatch");
    expect(result.diagnostic.at.noteId, `${label}: the refusal points at the first note of the command`).toBe(ids[0]);
    const project: SongProject = {
      style: "",
      lyrics: "",
      score: text,
      scoreMode: "full",
      seed: null,
      modelId: "song2",
      sourceKey: "samples",
    };
    expect(applyProjectCommand(song2Dialect, project, command).project, `${label}: refused project`).toBe(project);
    return;
  }

  counts.applied += 1;
  expect(result.ok, `${label}: ${ids.length} notes`).toBe(true);
  if (!result.ok) return;

  const output = parse(result.text);

  const touched = new Set<string>();
  const chainIds = new Set<string>();
  for (const id of ids) {
    const chain = chainAround(input, id);
    for (const note of chain) {
      touched.add(`${note.voice}:${note.bar}`);
      chainIds.add(note.id);
    }
    const last = chain[chain.length - 1];
    if (input.truncation !== null && last?.tie === true) touched.add(`${last.voice}:${input.truncation.bar}`);
  }

  const after = splitBars(result.text);
  for (const [key, piece] of before.pieces) {
    if (touched.has(key)) continue;
    expect(after.pieces.get(key), `${label}: untouched bar ${key}`).toBe(piece);
  }
  expect(
    [...after.pieces.keys()].filter((key) => !before.pieces.has(key)),
    `${label}: new bars`,
  ).toEqual([]);
  expect(after.otherLines, `${label}: non-music lines`).toEqual(before.otherLines);

  expect(
    output.notes.filter((note) => !chainIds.has(note.id)).map(noteFacts),
    `${label}: notes outside the chains`,
  ).toEqual(input.notes.filter((note) => !chainIds.has(note.id)).map(noteFacts));
  for (const note of input.notes.filter((found) => chainIds.has(found.id))) {
    expect(
      output.notes.find((candidate) => candidate.id === note.id),
      `${label}: chain note ${note.id}`,
    ).toMatchObject({ start: note.start, duration: note.duration, midi: null, tie: false });
  }
  expect(output.chords, `${label}: chords`).toEqual(input.chords);
}

function exerciseSets(label: string, text: string): void {
  const input = parse(text);
  const before = splitBars(text);
  for (const [name, choose] of SETS) {
    const ids = choose(input);
    if (ids.length === 0) continue;
    exerciseSet(`${label}, ${name}`, name, text, ids, input, before);
  }
}

describe("toRests on every sample", () => {
  for (const fact of facts) {
    it(`${fact.file}`, { timeout: SAMPLE_SWEEP_TIMEOUT }, () => {
      exerciseSets(fact.file, readFileSync(new URL(`samples/${fact.file}`, directory), "utf8"));
    });
  }
});

describe("toRests on every accepted vector with notes", () => {
  for (const vector of vectors) {
    if (vector.expect !== "accept" || vector.notes === undefined) continue;
    it(`${vector.id}`, () => {
      exerciseSets(vector.id, vector.text);
    });
  }

  it("met both sets that apply and sets that are refused, so neither branch above was empty", () => {
    expect(counts.applied).toBeGreaterThan(50);
    expect(counts.refused).toBeGreaterThan(0);
  });
});

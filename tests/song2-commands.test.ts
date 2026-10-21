// ABOUTME: Exercises the first edit command through the package entries: to-rest on every sample and accepted vector, plus hand-worked writer cases.
// ABOUTME: Expected text and facts come from RULES.md by hand; untouched bars are compared as raw music-line pieces.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  applyScoreCommand,
  type Note,
  type Score,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

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

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

function parse(text: string): Score {
  const { score, diagnostics } = song2Dialect.parse(text);
  expect(diagnostics).toEqual([]);
  expect(score).not.toBeNull();
  if (score === null) throw new Error("the score did not read");
  return score;
}

function wholeRestCount(body: string): number {
  if (body === "Z") return 1;
  if (body.length === 2 && body[0] === "Z" && body[1] !== undefined && "234".includes(body[1])) {
    return Number(body[1]);
  }
  return 1;
}

/**
 * Splits a score text into the raw piece of every bar, keyed by voice and 0-based bar number, plus
 * every line that is not a music line. It follows the reader's T2 stripping so the pieces are the
 * bytes the reader saw.
 */
function splitBars(text: string): { pieces: Map<string, string>; otherLines: string[] } {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""));
  let bodyStart = lines.findIndex((line) => line.startsWith("K:"));
  bodyStart = bodyStart < 0 ? lines.length : bodyStart + 1;
  const pieces = new Map<string, string>();
  const otherLines = lines.slice(0, bodyStart);
  const nextBar = new Map<string, number>();
  let voice: string | null = null;

  for (const line of lines.slice(bodyStart)) {
    if (line === "V: Vocal" || line === "V: Ins") {
      voice = line.slice(3);
      otherLines.push(line);
      continue;
    }
    if (line === "" || line.startsWith("M:") || line.startsWith("K:") || line.startsWith("%")) {
      otherLines.push(line);
      continue;
    }
    if (voice === null) {
      otherLines.push(line);
      continue;
    }

    const closes = line.endsWith("|");
    const bodies = line.split("|");
    if (closes) bodies.pop();
    for (const raw of bodies) {
      const body = raw.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
      const count = wholeRestCount(body);
      const first = nextBar.get(voice) ?? 0;
      for (let offset = 0; offset < count; offset += 1) {
        pieces.set(`${voice}:${first + offset}`, raw);
      }
      nextBar.set(voice, first + count);
    }
  }

  return { pieces, otherLines };
}

/** The whole tie chain around a note, worked from the reading result by the rule P9-P13 states. */
function chainAround(score: Score, id: string): Note[] {
  const target = score.notes.find((note) => note.id === id);
  if (target === undefined) return [];
  const voiceNotes = score.notes.filter((note) => note.voice === target.voice).sort((a, b) => a.start - b.start);
  const index = voiceNotes.findIndex((note) => note.id === id);
  let first = index;
  while (first > 0 && (voiceNotes[first - 1] as Note).tie) first -= 1;
  let last = index;
  while (last < voiceNotes.length - 1 && (voiceNotes[last] as Note).tie) last += 1;
  return voiceNotes.slice(first, last + 1);
}

function noteFacts(note: Note): [string, number, number, number | null, boolean] {
  return [note.voice, note.start, note.duration, note.midi, note.tie];
}

function pitched(score: Score, voice: string): Note[] {
  return score.notes.filter((note) => note.voice === voice && note.midi !== null).sort((a, b) => a.start - b.start);
}

function targets(score: Score): Note[] {
  const chosen = new Map<string, Note>();
  for (const voice of score.voices) {
    const notes = pitched(score, voice);
    if (notes.length === 0) continue;
    const first = notes[0] as Note;
    const last = notes[notes.length - 1] as Note;
    const middle = notes[Math.floor(notes.length / 2)] as Note;
    for (const note of [first, last, middle]) chosen.set(note.id, note);

    const voiceNotes = score.notes.filter((note) => note.voice === voice).sort((a, b) => a.start - b.start);
    const tied = voiceNotes.find(
      (note, index) => note.midi !== null && (note.tie || (index > 0 && (voiceNotes[index - 1] as Note).tie)),
    );
    if (tied !== undefined) chosen.set(tied.id, tied);
  }

  for (const bar of score.bars) {
    if (!bar.incomplete) continue;
    const note = score.notes.find((candidate) => candidate.bar === bar.index && candidate.midi !== null);
    if (note !== undefined) chosen.set(note.id, note);
  }

  return [...chosen.values()];
}

function check(score: Score): void {
  expect(song2Dialect.check(score)).toEqual([]);
}

function exercise(label: string, text: string): void {
  const input = parse(text);
  for (const target of targets(input)) {
    const chain = chainAround(input, target.id);
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: target.id });
    expect(result.ok, `${label}: toRest ${target.id}`).toBe(true);
    if (!result.ok) continue;

    const output = parse(result.text);
    check(output);

    const touched = new Set(chain.map((note) => `${note.voice}:${note.bar}`));
    const last = chain[chain.length - 1];
    if (input.truncation !== null && last?.tie === true) {
      touched.add(`${last.voice}:${input.truncation.bar}`);
    }
    const before = splitBars(text);
    const after = splitBars(result.text);
    for (const [key, piece] of before.pieces) {
      if (touched.has(key)) continue;
      expect(after.pieces.get(key), `${label}: untouched bar ${key} after ${target.id}`).toBe(piece);
    }
    expect(
      [...after.pieces.keys()].filter((key) => !before.pieces.has(key)),
      `${label}: new bars after ${target.id}`,
    ).toEqual([]);
    expect(after.otherLines, `${label}: non-music lines after ${target.id}`).toEqual(before.otherLines);

    const chainIds = new Set(chain.map((note) => note.id));
    expect(
      output.notes.filter((note) => !chainIds.has(note.id)).map(noteFacts),
      `${label}: notes outside the chain after ${target.id}`,
    ).toEqual(input.notes.filter((note) => !chainIds.has(note.id)).map(noteFacts));

    for (const note of chain) {
      const rest = output.notes.find((candidate) => candidate.id === note.id);
      expect(rest, `${label}: chain note ${note.id} after ${target.id}`).toMatchObject({
        start: note.start,
        duration: note.duration,
        midi: null,
        tie: false,
      });
    }

    expect(output.chords, `${label}: chords after ${target.id}`).toEqual(input.chords);
  }
}

describe("toRest on every sample", () => {
  for (const fact of facts) {
    it(`${fact.file}`, () => {
      exercise(fact.file, readFileSync(new URL(`samples/${fact.file}`, directory), "utf8"));
    });
  }
});

describe("toRest on every accepted vector with notes", () => {
  for (const vector of vectors) {
    if (vector.expect !== "accept" || vector.notes === undefined) continue;
    it(`${vector.id}`, () => {
      exercise(vector.id, vector.text);
    });
  }
});

describe("toRest failures", () => {
  it("reports note-not-found and leaves the text unchanged", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:999" });

    expect(result).toEqual({
      ok: false,
      diagnostic: { code: "note-not-found", params: { noteId: "Vocal:999" }, at: { noteId: "Vocal:999" } },
    });
  });

  it("reports not-a-note for a rest and leaves the text unchanged", () => {
    const text = `${HEADER}
K:C
V: Vocal
z16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("not-a-note");
    expect(result.diagnostic.at.noteId).toBe("Vocal:0");
  });

  it("returns the reading diagnostic when the text does not read", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16||`;
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("token");
  });
});

describe("applyProjectCommand", () => {
  const project: SongProject = {
    style: "pop",
    lyrics: "la",
    score: `${HEADER}
K:C
V: Vocal
C16|`,
    scoreMode: "full",
    seed: 7,
    modelId: "song2",
    sourceKey: "source",
  };

  it("replaces only the score text", () => {
    const result = applyProjectCommand(song2Dialect, project, { type: "toRest", noteId: "Vocal:0" });

    expect(result.diagnostics).toEqual([]);
    expect(result.project).not.toBe(project);
    expect(result.project).toEqual({ ...project, score: result.project.score });
    expect(result.project.score).toContain("z16|");
    expect(result.project.score).not.toBe(project.score);
    expect(project.score).toContain("C16|");
  });

  it("returns the project unchanged on a command failure", () => {
    const result = applyProjectCommand(song2Dialect, project, { type: "toRest", noteId: "Vocal:999" });

    expect(result.project).toBe(project);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["note-not-found"]);
  });
});

describe("check", () => {
  it("returns the reading code when the written text does not read", () => {
    const score = parse(`${HEADER}
K:C
V: Vocal
C16|`);
    const notes = score.notes.map((note) => ({ ...note, midi: 200 }));
    const diagnostics = song2Dialect.check({ ...score, notes });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["pitch-range"]);
  });

  it("returns write-mismatch when the written text reads differently", () => {
    const score = parse(`${HEADER}
K:C
V: Vocal
C16|`);
    const bars = score.bars.map((bar) => ({ ...bar, meter: { numerator: 3, denominator: 4 } }));
    const diagnostics = song2Dialect.check({ ...score, bars });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["write-mismatch"]);
  });
});

describe("hand-worked write-back", () => {
  it("writes = on a later note of the same letter in another octave when the natural is removed (P4)", () => {
    const text = `${HEADER}
K:C
V: Vocal
^F4=F4f4B4|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:256" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
^F4z4=f4B4|`);
    check(parse(result.text));
  });

  it("turns a tie chain across a barline in a sharp key into rests", () => {
    const text = `${HEADER}
K:D
V: Vocal
A4^F12-|F16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:1024" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:D
V: Vocal
A4z12|z16|`);
    check(parse(result.text));
  });

  it("keeps a chord and an inline key change at their positions", () => {
    const text = `${HEADER}
K:C
V: Vocal
"C"C8[K:G]F8|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
"C"z8[K:G]F8|`);
    const output = parse(result.text);
    expect(output.chords).toEqual([{ name: "C", start: 0, noteId: "Vocal:0" }]);
    check(output);
  });

  it("keeps an inline key written at the bar's first instant", () => {
    const text = `${HEADER}
K:C
V: Vocal
[K:G]G8D8|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
[K:G]z8D8|`);
    check(parse(result.text));
  });

  it("rewrites a cut bar short, without its unfinished token and without a closing barline", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|D8E4^`;
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:1024" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
C16|z8E4`);
    check(parse(result.text));
  });
});

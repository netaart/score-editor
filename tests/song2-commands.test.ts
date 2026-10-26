// ABOUTME: Exercises the first edit command through the package entries: to-rest on every sample and accepted vector, plus hand-worked writer cases.
// ABOUTME: Expected text and facts come from RULES.md by hand; untouched bars are compared as raw music-line pieces.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  applyScoreCommand,
  formatDiagnostic,
  type Note,
  type Score,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { UNREADABLE_SCORE } from "./scores";
import { normalizeLineBreaks, stripTrailingWhitespace, trimWhitespace } from "./song2-text";

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
const tieMismatch = vectors.find((vector) => vector.id === "truncate-tie-mismatch-final");
if (tieMismatch === undefined) throw new Error("the truncate-tie-mismatch-final vector is missing");

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
  const lines = normalizeLineBreaks(text)
    .split("\n")
    .map((line) => stripTrailingWhitespace(line));
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
      const body = trimWhitespace(raw);
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
    // The X5 cut vector needs its tie to keep the cut; its refusal is pinned in "toRest and cut tails".
    if (vector.id === tieMismatch.id) continue;
    it(`${vector.id}`, () => {
      exercise(vector.id, vector.text);
    });
  }
});

describe("toRest and cut tails", () => {
  it("refuses the X5 tail that would stop being a cut when its tie is removed", () => {
    const result = applyScoreCommand(song2Dialect, tieMismatch.text, { type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("write-mismatch");
    expect(result.diagnostic.params.field).toBe("bars");
  });

  it("says where the refused note is, in the bar and beat a person counts, in both languages", () => {
    const result = applyScoreCommand(song2Dialect, tieMismatch.text, { type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.at).toEqual({ voice: "Vocal", bar: 1, beat: 1, noteId: "Vocal:0" });
    expect(formatDiagnostic(result.diagnostic, "en")).toBe(
      "This change can't be written into the score safely, so the score was left as it was. (bar 1, beat 1)",
    );
    expect(formatDiagnostic(result.diagnostic, "zh")).toBe(
      "这个改动没法安全地写进乐谱，乐谱保持原样。（第 1 小节，第 1 拍）",
    );
  });

  it("keeps an X4-only cut measure and its incomplete bar when a note before it becomes a rest", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|"Cm`;
    const input = parse(text);
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
z16|"Cm`);
    const output = parse(result.text);
    const bar = output.bars[output.bars.length - 1];
    expect(bar?.index).toBe(input.truncation?.bar);
    expect(bar?.incomplete).toBe(true);
    expect(output.truncation).toEqual(input.truncation);
    check(output);
  });

  it("keeps an X5-only cut measure and its incomplete bar when a note outside the tie becomes a rest", () => {
    const text = `${HEADER}
K:C
V: Vocal
C8D8-|B`;
    const input = parse(text);
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:0" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
z8D8-|B`);
    const output = parse(result.text);
    const bar = output.bars[output.bars.length - 1];
    expect(bar?.index).toBe(input.truncation?.bar);
    expect(bar?.incomplete).toBe(true);
    expect(output.truncation).toEqual(input.truncation);
    check(output);
  });

  it("keeps the X5 tail inside a partial measure that still has a finished token", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|D2-B`;
    const input = parse(text);
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:1024" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
C16|z2`);
    const output = parse(result.text);
    expect(output.truncation).toEqual(input.truncation);
    check(output);
  });

  it("keeps an unfinished chord string at the end of a rewritten partial measure", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|D8"C`;
    const input = parse(text);
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:1024" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
C16|z8"C`);
    const output = parse(result.text);
    expect(output.truncation).toEqual(input.truncation);
    expect(output.hasChords).toBe(true);
    check(output);
  });

  it("keeps the X5 tail when only a note before the tied last note becomes a rest", () => {
    const text = `${HEADER}
K:C
V: Vocal
C16|D2-D2D2-B`;
    const input = parse(text);
    const result = applyScoreCommand(song2Dialect, text, { type: "toRest", noteId: "Vocal:1024" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${HEADER}
K:C
V: Vocal
C16|z2z2D2-B`);
    const output = parse(result.text);
    expect(output.truncation).toEqual(input.truncation);
    check(output);
  });
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

  it("returns the project unchanged with write-mismatch when the cut cannot be kept", () => {
    const cutProject: SongProject = { ...project, score: tieMismatch.text };
    const result = applyProjectCommand(song2Dialect, cutProject, { type: "toRest", noteId: "Vocal:0" });

    expect(result.project).toBe(cutProject);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["write-mismatch"]);
    expect(result.diagnostics[0]?.params.field).toBe("bars");
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
    expect(diagnostics[0]?.params.field).toBe("bars");
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

  it("rewrites a cut bar short, keeps its unfinished accidental, and omits the closing barline", () => {
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
C16|z8E4^`);
    check(parse(result.text));
  });
});

describe("replaceScoreText through applyProjectCommand", () => {
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
  const typed = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16|`;
  const broken = UNREADABLE_SCORE;

  it("runs the song-project rules after the replacement: a melody project given chords carries the notice", () => {
    const withChords = `${HEADER}
K:C
V: Vocal
"C"C16|`;

    const melody = applyProjectCommand(
      song2Dialect,
      { ...project, scoreMode: "melody" },
      { type: "replaceScoreText", text: withChords },
    );
    const full = applyProjectCommand(song2Dialect, project, { type: "replaceScoreText", text: withChords });

    expect(melody.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["melody-with-chords"]);
    expect(melody.project.score).toBe(withChords);
    expect(full.diagnostics).toEqual([]);
  });

  it("replaces the score text with a readable one and changes no other field", () => {
    const result = applyProjectCommand(song2Dialect, project, { type: "replaceScoreText", text: typed });

    expect(result.diagnostics).toEqual([]);
    expect(result.project).toEqual({ ...project, score: typed });
  });

  it("refuses an unreadable text with the reading diagnostic and returns the project it was given", () => {
    const result = applyProjectCommand(song2Dialect, project, { type: "replaceScoreText", text: broken });

    expect(result.project).toBe(project);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["duration"]);
    expect(result.diagnostics[0]?.at.line).toBe(9);
  });

  it("is the way out of a project whose own score cannot be read", () => {
    const stuck: SongProject = { ...project, score: broken };

    expect(applyProjectCommand(song2Dialect, stuck, { type: "replaceScoreText", text: typed }).project.score).toBe(
      typed,
    );
    expect(applyProjectCommand(song2Dialect, stuck, { type: "replaceScoreText", text: "" }).project).toBe(stuck);
  });

  it("stores line endings as the dialect writes them: LF only", () => {
    const result = applyProjectCommand(song2Dialect, project, {
      type: "replaceScoreText",
      text: typed.replace(/\n/g, "\r\n"),
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.project.score).toBe(typed);
  });

  it("keeps a cut score as the text wrote it", () => {
    const cut = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G8`;
    const result = applyProjectCommand(song2Dialect, project, { type: "replaceScoreText", text: cut });

    expect(result.diagnostics).toEqual([]);
    expect(result.project.score).toBe(cut);
  });

  it("says in zh and en where the text broke", () => {
    const [diagnostic] = applyProjectCommand(song2Dialect, project, {
      type: "replaceScoreText",
      text: broken,
    }).diagnostics;
    if (diagnostic === undefined) throw new Error("the broken text was taken");

    expect(formatDiagnostic(diagnostic, "en")).toMatch(/line 9/);
    expect(formatDiagnostic(diagnostic, "zh")).toMatch(/第 9 行/);
  });
});

// ABOUTME: Exercises set-chord through the package entries: set, replace and remove on every sample, plus hand-worked writer cases.
// ABOUTME: Expected text comes from RULES.md by hand; untouched bars are compared as raw music-line pieces.
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

const directory = new URL("../packages/score-dialect-song2/tests/", import.meta.url);
const facts = JSON.parse(readFileSync(new URL("samples.json", directory), "utf8")) as SampleFact[];

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

const INS_HEADER = 'V: Ins clef=treble name="Ins Melody" snm="Inst."';

function scoreText(body: string): string {
  return `${HEADER}
K:C
V: Vocal
${body}`;
}

function parse(text: string): Score {
  const { score, diagnostics } = song2Dialect.parse(text);
  expect(diagnostics).toEqual([]);
  expect(score).not.toBeNull();
  if (score === null) throw new Error("the score did not read");
  return score;
}

function check(score: Score): void {
  expect(song2Dialect.check(score)).toEqual([]);
}

function wholeRestCount(body: string): number {
  if (body === "Z") return 1;
  if (body.length === 2 && body[0] === "Z" && body[1] !== undefined && "234".includes(body[1])) {
    return Number(body[1]);
  }
  return 1;
}

/** Splits a score text into the raw piece of every bar, keyed by voice and 0-based bar number, plus every other line. */
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

function noteFacts(note: Note): [string, string, number, number, number, number | null, boolean] {
  return [note.id, note.voice, note.bar, note.start, note.duration, note.midi, note.tie];
}

function expectOnlyBar(label: string, beforeText: string, afterText: string, voice: string, bar: number): void {
  const before = splitBars(beforeText);
  const after = splitBars(afterText);
  expect(after.otherLines, `${label}: non-music lines`).toEqual(before.otherLines);
  const target = `${voice}:${bar}`;
  for (const [key, piece] of before.pieces) {
    if (key === target) continue;
    expect(after.pieces.get(key), `${label}: untouched bar ${key}`).toBe(piece);
  }
  expect(
    [...after.pieces.keys()].filter((key) => !before.pieces.has(key)),
    `${label}: new bars`,
  ).toEqual([]);
}

function chordsOn(score: Score, id: string) {
  return score.chords.filter((chord) => chord.noteId === id);
}

function vocalTargets(score: Score): Note[] {
  const vocal = score.notes.filter((note) => note.voice === "Vocal").sort((a, b) => a.start - b.start);
  const chosen = new Map<string, Note>();
  for (const note of [
    vocal[0],
    vocal.find((candidate) => candidate.midi !== null),
    vocal.find((candidate) => candidate.midi === null),
    vocal.find((candidate) => score.chords.some((chord) => chord.noteId === candidate.id)),
    vocal.find((candidate) => score.bars[candidate.bar]?.keyChanges.length),
  ]) {
    if (note !== undefined) chosen.set(note.id, note);
  }
  return [...chosen.values()];
}

function applyOk(text: string, noteId: string, name: string): string {
  const result = applyScoreCommand(song2Dialect, text, { type: "setChord", noteId, name });
  expect(result.ok, `setChord ${noteId} ${name === "" ? "remove" : name}`).toBe(true);
  if (!result.ok) throw new Error("the command failed");
  return result.text;
}

function exercise(label: string, text: string, target: Note): void {
  let current = text;
  // Set, then replace, then remove, each on the text the previous command produced.
  for (const name of ["C", "G7", ""]) {
    const beforeText = current;
    const before = parse(beforeText);
    const written = applyOk(beforeText, target.id, name);
    const after = parse(written);
    check(after);

    expect(after.notes.map(noteFacts), `${label}: notes after ${target.id} ${name || "remove"}`).toEqual(
      before.notes.map(noteFacts),
    );
    expect(
      after.chords.filter((chord) => chord.noteId !== target.id),
      `${label}: other chords after ${target.id} ${name || "remove"}`,
    ).toEqual(before.chords.filter((chord) => chord.noteId !== target.id));

    if (name === "") {
      expect(chordsOn(after, target.id), `${label}: removed chord on ${target.id}`).toEqual([]);
    } else {
      expect(chordsOn(after, target.id), `${label}: set chord on ${target.id}`).toEqual([
        { name, start: target.start, noteId: target.id },
      ]);
    }
    expect(after.hasChords, `${label}: hasChords after ${target.id} ${name || "remove"}`).toBe(after.chords.length > 0);
    expectOnlyBar(`${label}: ${target.id} ${name || "remove"}`, beforeText, written, target.voice, target.bar);
    current = written;
  }
}

describe("setChord on every sample", () => {
  for (const fact of facts) {
    it(`${fact.file}`, () => {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const input = parse(text);
      for (const target of vocalTargets(input)) exercise(fact.file, text, target);
    });
  }
});

describe("hand-worked write-back", () => {
  it("writes a chord before the rest that carries it", () => {
    const result = applyOk(scoreText("z16|"), "Vocal:0", "G7");

    expect(result).toBe(scoreText('"G7"z16|'));
    check(parse(result));
  });

  it("replaces the chord on a note and removes it again, leaving the pitches alone", () => {
    const original = scoreText('"C"C8D8|');
    const input = parse(original);
    const replaced = applyOk(original, "Vocal:0", "G7");
    expect(replaced).toBe(scoreText('"G7"C8D8|'));

    const removed = applyOk(replaced, "Vocal:0", "");
    expect(removed).toBe(scoreText("C8D8|"));
    expect(parse(removed).hasChords).toBe(false);
    expect(parse(removed).notes.map(noteFacts)).toEqual(input.notes.map(noteFacts));
    check(parse(removed));
  });

  it("changes only the target's chord", () => {
    const text = scoreText('"C"C8"D"D8|');

    expect(applyOk(text, "Vocal:0", "G7")).toBe(scoreText('"G7"C8"D"D8|'));
    expect(applyOk(text, "Vocal:512", "Am")).toBe(scoreText('"C"C8"Am"D8|'));
  });

  it("collapses several chords on the target into the one it sets", () => {
    const result = applyOk(scoreText('"C""G7"C16|'), "Vocal:0", "Am");

    expect(result).toBe(scoreText('"Am"C16|'));
    expect(parse(result).chords).toEqual([{ name: "Am", start: 0, noteId: "Vocal:0" }]);
    check(parse(result));
  });

  it("keeps the other chord until the last one is removed", () => {
    const text = scoreText('"C"C8"D"D8|');
    const first = parse(applyOk(text, "Vocal:0", ""));
    expect(first.hasChords).toBe(true);
    expect(first.chords).toEqual([{ name: "D", start: 512, noteId: "Vocal:512" }]);

    const last = parse(applyOk(applyOk(text, "Vocal:0", ""), "Vocal:512", ""));
    expect(last.hasChords).toBe(false);
    expect(last.chords).toEqual([]);
  });

  it("writes a chord after an inline key change at its offset", () => {
    const result = applyOk(scoreText("C8[K:G]D8|"), "Vocal:512", "D");

    expect(result).toBe(scoreText('C8[K:G]"D"D8|'));
    check(parse(result));
  });

  it("writes a chord before a note when an inline key change stands at the same instant", () => {
    const result = applyOk(scoreText("[K:G]G8D8|"), "Vocal:0", "G");

    expect(result).toBe(scoreText('[K:G]"G"G8D8|'));
    check(parse(result));
  });

  it("turns a whole-measure rest into a rest token so it can carry the chord", () => {
    const original = scoreText("Z|");
    const input = parse(original);
    const result = applyOk(original, "Vocal:0", "C");

    expect(result).toBe(scoreText('"C"z16|'));
    expect(parse(result).notes.map(noteFacts)).toEqual(input.notes.map(noteFacts));
    check(parse(result));
  });

  it("accepts a chord with a slash bass from the vocabulary", () => {
    const result = applyOk(scoreText("C16|"), "Vocal:0", "F#m7/C#");

    expect(result).toBe(scoreText('"F#m7/C#"C16|'));
    check(parse(result));
  });

  it("treats removing a chord that is not there as a successful no-op", () => {
    const text = scoreText("C16|");
    const result = applyOk(text, "Vocal:0", "");

    expect(result).toBe(text);
    expect(parse(result).hasChords).toBe(false);
  });
});

describe("setChord failures", () => {
  it("reports note-not-found for an unknown id and leaves the text unchanged", () => {
    const result = applyScoreCommand(song2Dialect, scoreText("C16|"), {
      type: "setChord",
      noteId: "Vocal:999",
      name: "C",
    });

    expect(result).toEqual({
      ok: false,
      diagnostic: { code: "note-not-found", params: { noteId: "Vocal:999" }, at: { noteId: "Vocal:999" } },
    });
  });

  it("reports chord-voice for a note in Ins", () => {
    const text = `${HEADER}
${INS_HEADER}
K:C
V: Vocal
C16|
V: Ins
C16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "setChord", noteId: "Ins:0", name: "C" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("chord-voice");
    expect(result.diagnostic.params.voice).toBe("Ins");
    expect(result.diagnostic.at.voice).toBe("Ins");
    expect(result.diagnostic.at.noteId).toBe("Ins:0");
  });

  it("reports chord-vocabulary for a name outside the dialect vocabulary", () => {
    const text = scoreText("C16|");
    const result = applyScoreCommand(song2Dialect, text, { type: "setChord", noteId: "Vocal:0", name: "C13" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("chord-vocabulary");
    expect(result.diagnostic.params.name).toBe("C13");
    expect(result.diagnostic.at.noteId).toBe("Vocal:0");
  });

  it("reports chord-vocabulary for a malformed slash bass", () => {
    for (const name of ["C/E/G", "C/", "/E", "C/3"]) {
      const result = applyScoreCommand(song2Dialect, scoreText("C16|"), { type: "setChord", noteId: "Vocal:0", name });
      expect(result.ok, name).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostic.code).toBe("chord-vocabulary");
    }
  });

  it("treats removing a chord from a voice that never had one as a successful no-op", () => {
    const text = `${HEADER}
${INS_HEADER}
K:C
V: Vocal
C16|
V: Ins
C16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "setChord", noteId: "Ins:0", name: "" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(text);
    expect(parse(result.text).hasChords).toBe(false);
  });

  it("returns the project unchanged when the command fails", () => {
    const project: SongProject = {
      style: "pop",
      lyrics: "la",
      score: scoreText("C16|"),
      scoreMode: "full",
      seed: 7,
      modelId: "song2",
      sourceKey: "source",
    };
    const result = applyProjectCommand(song2Dialect, project, {
      type: "setChord",
      noteId: "Vocal:0",
      name: "C13",
    });

    expect(result.project).toBe(project);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["chord-vocabulary"]);
  });
});

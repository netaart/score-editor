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

const TWO_VOICE_TEXT = `${HEADER}
${INS_HEADER}
K:C
V: Vocal
C16|
V: Ins
C16|`;

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

interface RawBar {
  readonly raw: string;
  readonly group: string;
}

/** Splits a score text into the raw piece of every bar, delimiters and whitespace included, plus every other line. */
function splitBars(text: string): { pieces: Map<string, RawBar>; otherLines: string[] } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let bodyStart = lines.findIndex((line) => line.replace(/[ \t]+$/, "").startsWith("K:"));
  bodyStart = bodyStart < 0 ? lines.length : bodyStart + 1;
  const pieces = new Map<string, RawBar>();
  const otherLines = lines.slice(0, bodyStart);
  const nextBar = new Map<string, number>();
  let voice: string | null = null;

  for (const [lineIndex, line] of lines.slice(bodyStart).entries()) {
    const clean = line.replace(/[ \t]+$/, "");
    if (clean === "V: Vocal" || clean === "V: Ins") {
      voice = clean.slice(3);
      otherLines.push(line);
      continue;
    }
    if (clean === "" || clean.startsWith("M:") || clean.startsWith("K:") || clean.startsWith("%")) {
      otherLines.push(line);
      continue;
    }
    if (voice === null) {
      otherLines.push(line);
      continue;
    }

    const suffix = line.slice(clean.length);
    const closes = clean.endsWith("|");
    const bodies = clean.split("|");
    if (closes) bodies.pop();
    for (const [segmentIndex, body] of bodies.entries()) {
      const count = wholeRestCount(body.replace(/^[ \t]+/, "").replace(/[ \t]+$/, ""));
      const first = nextBar.get(voice) ?? 0;
      const endsBar = segmentIndex < bodies.length - 1 || closes;
      const raw = `${body}${endsBar ? "|" : ""}${segmentIndex === bodies.length - 1 ? suffix : ""}`;
      const group = `${voice}:${lineIndex}:${segmentIndex}`;
      for (let offset = 0; offset < count; offset += 1) {
        pieces.set(`${voice}:${first + offset}`, { raw, group });
      }
      nextBar.set(voice, first + count);
    }
  }

  return { pieces, otherLines };
}

function noteFacts(note: Note): [string, string, number, number, number, number | null, boolean] {
  return [note.id, note.voice, note.bar, note.start, note.duration, note.midi, note.tie];
}

function expectOnlyBar(
  label: string,
  beforeText: string,
  afterText: string,
  voice: string,
  bars: number | ReadonlyArray<number>,
): void {
  const before = splitBars(beforeText);
  const after = splitBars(afterText);
  expect(after.otherLines, `${label}: non-music lines`).toEqual(before.otherLines);
  const changed = new Set(
    (Array.isArray(bars) ? bars : [bars]).map((bar) => before.pieces.get(`${voice}:${bar}`)?.group),
  );
  for (const [key, piece] of before.pieces) {
    if (changed.has(piece.group)) continue;
    expect(after.pieces.get(key)?.raw, `${label}: untouched bar ${key}`).toBe(piece.raw);
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

type SetChordCommand = { readonly type: "setChord"; readonly noteId: string; readonly name: string };

function projectWithScore(score: string): SongProject {
  return {
    style: "pop",
    lyrics: "la",
    score,
    scoreMode: "full",
    seed: 7,
    modelId: "song2",
    sourceKey: "source",
  };
}

/** Runs a refusal through the project entry and returns its codes after asserting the project was left untouched. */
function refusedProject(text: string, command: SetChordCommand): ReadonlyArray<string> {
  const project = projectWithScore(text);
  const result = applyProjectCommand(song2Dialect, project, command);
  expect(result.project).toBe(project);
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function exercise(label: string, text: string, target: Note): void {
  let current = text;
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

  it("reads and writes a chord-only cut tail byte for byte", () => {
    const text = scoreText('C16|D8"C');
    const score = parse(text);

    expect(score.hasChords).toBe(true);
    expect(score.chords).toEqual([]);
    expect(score.truncation?.unfinishedChord).toBe(true);
    expect(song2Dialect.serialize(score)).toBe(text);
  });

  it("drops an unfinished chord tail when the last chord is removed", () => {
    const original = scoreText('"C"C16|D8"C');
    const input = parse(original);
    const result = applyOk(original, "Vocal:0", "");

    expect(result).toBe(scoreText("C16|D8"));
    const output = parse(result);
    expect(output.hasChords).toBe(false);
    expect(input.truncation?.unfinishedChord).toBe(true);
    expect(output.truncation).toEqual({
      voice: input.truncation?.voice,
      bar: input.truncation?.bar,
      short: input.truncation?.short,
    });
    expect(output.notes.map(noteFacts)).toEqual(input.notes.map(noteFacts));
    check(output);
  });

  it("rewrites only the partial measure when removing the last chord drops its unfinished chord", () => {
    const original = scoreText('C16 |"C"C16|D8"C');
    const input = parse(original);
    const result = applyOk(original, "Vocal:1024", "");

    expect(result).toBe(scoreText("C16 |C16|D8"));
    expectOnlyBar("cut-tail drop", original, result, "Vocal", [1, 2]);
    const output = parse(result);
    expect(output.hasChords).toBe(false);
    expect(input.truncation?.unfinishedChord).toBe(true);
    expect(output.truncation).toEqual({
      voice: input.truncation?.voice,
      bar: input.truncation?.bar,
      short: input.truncation?.short,
    });
    check(output);
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
    const text = scoreText("C16|");
    const command = { type: "setChord", noteId: "Vocal:999", name: "C" } as const;
    const result = applyScoreCommand(song2Dialect, text, command);

    expect(result).toEqual({
      ok: false,
      diagnostic: { code: "note-not-found", params: { noteId: "Vocal:999" }, at: { noteId: "Vocal:999" } },
    });
    expect(refusedProject(text, command)).toEqual(["note-not-found"]);
  });

  it("reports chord-voice for a note in Ins", () => {
    const command = { type: "setChord", noteId: "Ins:0", name: "C" } as const;
    const result = applyScoreCommand(song2Dialect, TWO_VOICE_TEXT, command);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("chord-voice");
    expect(result.diagnostic.params.voice).toBe("Ins");
    expect(result.diagnostic.at.voice).toBe("Ins");
    expect(result.diagnostic.at.noteId).toBe("Ins:0");
    expect(refusedProject(TWO_VOICE_TEXT, command)).toEqual(["chord-voice"]);
  });

  it("reports chord-vocabulary for a name outside the dialect vocabulary", () => {
    const text = scoreText("C16|");
    const command = { type: "setChord", noteId: "Vocal:0", name: "C13" } as const;
    const result = applyScoreCommand(song2Dialect, text, command);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("chord-vocabulary");
    expect(result.diagnostic.params.name).toBe("C13");
    expect(result.diagnostic.at.noteId).toBe("Vocal:0");
    expect(refusedProject(text, command)).toEqual(["chord-vocabulary"]);
  });

  it("reports chord-vocabulary for a malformed slash bass", () => {
    const text = scoreText("C16|");
    for (const name of ["C/E/G", "C/", "/E", "C/3"]) {
      const command = { type: "setChord", noteId: "Vocal:0", name } as const;
      const result = applyScoreCommand(song2Dialect, text, command);
      expect(result.ok, name).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostic.code, name).toBe("chord-vocabulary");
      expect(refusedProject(text, command), name).toEqual(["chord-vocabulary"]);
    }
  });

  it("locates a refusal of the dialect's check at the chord's note", () => {
    const refusing = {
      ...song2Dialect,
      check: () => [{ code: "write-mismatch", params: {}, at: {} }] as const,
    };
    const result = applyScoreCommand(refusing, scoreText("C16|"), { type: "setChord", noteId: "Vocal:0", name: "C" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("write-mismatch");
    expect(result.diagnostic.at).toEqual({ voice: "Vocal", bar: 1, beat: 1, noteId: "Vocal:0" });
  });

  it("treats removing a chord from a voice that never had one as a successful no-op", () => {
    const result = applyScoreCommand(song2Dialect, TWO_VOICE_TEXT, { type: "setChord", noteId: "Ins:0", name: "" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(TWO_VOICE_TEXT);
    expect(parse(result.text).hasChords).toBe(false);
  });
});

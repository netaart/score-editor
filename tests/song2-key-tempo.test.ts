// ABOUTME: Exercises transpose, set key, set tempo, the melody/chord rule and the project commands through the package entries.
// ABOUTME: Expected text is worked by hand from RULES.md and the spec; sample cases assert the spec's invariants instead.
import { readFileSync } from "node:fs";
import { song2Constraints, song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  applyScoreCommand,
  checkProject,
  isNoticeDiagnostic,
  type Note,
  type ProjectCommand,
  type Score,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

interface SampleFact {
  file: string;
}

const directory = new URL("../packages/score-dialect-song2/tests/", import.meta.url);
const facts = JSON.parse(readFileSync(new URL("samples.json", directory), "utf8")) as SampleFact[];

const TWO_VOICES = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."`;

const ONE_VOICE = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

const SIMPLE = `${ONE_VOICE}
K:C
V: Vocal
C16|D4E4F4G4|`;

const NOTE_SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function parse(text: string): Score {
  const { score, diagnostics } = song2Dialect.parse(text);
  expect(diagnostics).toEqual([]);
  if (score === null) throw new Error("the score did not read");
  return score;
}

function check(score: Score): void {
  expect(song2Dialect.check(score)).toEqual([]);
}

function apply(text: string, command: Parameters<typeof applyScoreCommand>[2]): string {
  const result = applyScoreCommand(song2Dialect, text, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`the command was refused: ${result.diagnostic.code}`);
  return result.text;
}

function project(overrides: Partial<SongProject> = {}): SongProject {
  return {
    style: "pop",
    lyrics: "",
    score: SIMPLE,
    scoreMode: "full",
    seed: 7,
    modelId: "song2",
    sourceKey: "source",
    ...overrides,
  };
}

function keyPitchClass(key: string): number {
  const match = /^([A-G])(bb|b|##|#)?m?$/.exec(key);
  expect(match, key).not.toBeNull();
  if (match === null) return 0;
  const letter = match[1] as string;
  const mark = match[2] ?? "";
  const accidental = mark === "bb" ? -2 : mark === "b" ? -1 : mark === "##" ? 2 : mark === "#" ? 1 : 0;
  return ((((NOTE_SEMITONES[letter] as number) + accidental) % 12) + 12) % 12;
}

function keyIsMinor(key: string): boolean {
  return key.endsWith("m");
}

function chordParts(name: string): { root: number; bass: number | null } {
  const match = /^([A-G](?:bb|b|##|#)?)(.*)$/.exec(name);
  expect(match, name).not.toBeNull();
  if (match === null) return { root: 0, bass: null };
  const root = match[1] as string;
  const slash = (match[2] as string).indexOf("/");
  const bass = slash < 0 ? null : (match[2] as string).slice(slash + 1);
  return { root: keyPitchClass(root), bass: bass === null ? null : keyPitchClass(bass) };
}

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
      const first = nextBar.get(voice) ?? 0;
      pieces.set(`${voice}:${first}`, raw.trim());
      nextBar.set(voice, first + 1);
    }
  }
  return { pieces, otherLines };
}

/** Every non-music line with both kinds of key line blanked, so only the key lines may differ. */
function otherLinesWithoutKeys(text: string): string[] {
  return splitBars(text).otherLines.map((line) => (line.startsWith("K:") ? "K:" : line));
}

function notesById(score: Score): Map<string, Note> {
  return new Map(score.notes.map((note) => [note.id, note]));
}

function expectNotesMoved(before: Score, after: Score, semitones: number): void {
  const old = notesById(before);
  expect(after.notes).toHaveLength(before.notes.length);
  for (const note of after.notes) {
    const source = old.get(note.id);
    expect(source, note.id).toBeDefined();
    if (source === undefined) continue;
    expect(note.start, note.id).toBe(source.start);
    expect(note.duration, note.id).toBe(source.duration);
    expect(note.tie, note.id).toBe(source.tie);
    expect(note.midi, note.id).toBe(source.midi === null ? null : source.midi + semitones);
  }
}

describe("transpose", () => {
  const twoGroups = `${TWO_VOICES}
K:C
V: Vocal
C8[K:G]D8|
V: Ins
C8[K:G]D8|
V: Vocal
K:G
D16|
V: Ins
K:G
D16|`;

  it("moves notes, chord roots and basses, and the header and body key lines together", () => {
    const text = `${TWO_VOICES}
K:C
V: Vocal
"C"C8"G/B"D8|
V: Ins
C8D8|
V: Vocal
K:G
D16|
V: Ins
K:G
D16|`;
    const output = apply(text, { type: "transpose", semitones: 2 });

    expect(output).toBe(`${TWO_VOICES}
K:D
V: Vocal
"D"D8"A/C#"E8|
V: Ins
D8E8|
V: Vocal
K:A
E16|
V: Ins
K:A
E16|`);
    check(parse(output));
  });

  it("moves an inline key and a body key line", () => {
    const output = apply(twoGroups, { type: "transpose", semitones: 2 });

    expect(output).toBe(`${TWO_VOICES}
K:D
V: Vocal
D8[K:A]E8|
V: Ins
D8[K:A]E8|
V: Vocal
K:A
E16|
V: Ins
K:A
E16|`);
    const score = parse(output);
    check(score);
    expect(score.keys).toEqual([
      { at: 0, key: "D" },
      { at: 512, key: "A" },
      { at: 1024, key: "A" },
    ]);
  });

  it("keeps comments, sections, the bar count, the voices and every header except K: on every sample", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const before = parse(text);
      const output = apply(text, { type: "transpose", semitones: 2 });
      const after = parse(output);
      check(after);

      expect(otherLinesWithoutKeys(output), fact.file).toEqual(otherLinesWithoutKeys(text));
      expect(after.bars.length, fact.file).toBe(before.bars.length);
      expect(after.voices, fact.file).toEqual(before.voices);
      expect(after.sections, fact.file).toEqual(before.sections);
      expect(after.truncation, fact.file).toEqual(before.truncation);
      expectNotesMoved(before, after, 2);
    }
  });

  it("moves every chord root and bass by the same semitones on every sample that has chords", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const before = parse(text);
      if (before.chords.length === 0) continue;
      const after = parse(apply(text, { type: "transpose", semitones: 2 }));

      expect(after.chords, fact.file).toHaveLength(before.chords.length);
      for (const [index, chord] of after.chords.entries()) {
        const source = before.chords[index] as { start: number; noteId: string | null };
        const old = chordParts((before.chords[index] as { name: string }).name);
        const moved = chordParts(chord.name);
        expect(chord.start, fact.file).toBe(source.start);
        expect(chord.noteId, fact.file).toBe(source.noteId);
        expect(moved.root, fact.file).toBe((old.root + 2) % 12);
        expect(moved.bass, fact.file).toBe(old.bass === null ? null : (old.bass + 2) % 12);
      }
    }
  });

  it("moves every key by the same semitones and keeps its mode on every sample", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const before = parse(text);
      const after = parse(apply(text, { type: "transpose", semitones: 2 }));

      expect(after.keys, fact.file).toHaveLength(before.keys.length);
      for (const [index, entry] of after.keys.entries()) {
        const source = before.keys[index] as { at: number; key: string };
        expect(entry.at, fact.file).toBe(source.at);
        expect(keyIsMinor(entry.key), fact.file).toBe(keyIsMinor(source.key));
        expect(keyPitchClass(entry.key), fact.file).toBe((keyPitchClass(source.key) + 2) % 12);
        expect([...song2Constraints.keys.major, ...song2Constraints.keys.minor]).toContain(entry.key);
      }
    }
  });

  it("restores every note's MIDI after transposing N and then -N, on every sample", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const before = parse(text);
      const up = apply(text, { type: "transpose", semitones: 3 });
      const back = apply(up, { type: "transpose", semitones: -3 });
      const after = parse(back);
      check(after);

      const original = notesById(before);
      expect(after.notes, fact.file).toHaveLength(before.notes.length);
      for (const note of after.notes) {
        expect(note.midi, `${fact.file} ${note.id}`).toBe((original.get(note.id) as Note).midi);
      }
    }
  });

  it("fails the whole command when one note would leave MIDI 0-127", () => {
    const text = `${ONE_VOICE}
K:C
V: Vocal
C16|g''''16|`;
    const result = applyScoreCommand(song2Dialect, text, { type: "transpose", semitones: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("pitch-out-of-range");
    expect(result.diagnostic.at.noteId).toBe("Vocal:1024");
    expect(result.diagnostic.at.bar).toBe(2);
  });

  it("leaves the bytes alone for a transposition of zero", () => {
    expect(apply(SIMPLE, { type: "transpose", semitones: 0 })).toBe(SIMPLE);
  });

  it("reports a transposition that is not a whole number of semitones", () => {
    const result = applyScoreCommand(song2Dialect, SIMPLE, { type: "transpose", semitones: 1.5 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("semitones-not-integer");
  });
});

describe("set key", () => {
  it("transposes the whole score to the chosen key, keeping the target's spelling", () => {
    const output = apply(
      `${ONE_VOICE}
K:C
V: Vocal
C16|D16|`,
      { type: "setKey", key: "Db" },
    );

    expect(output).toBe(`${ONE_VOICE}
K:Db
V: Vocal
D16|E16|`);
    const score = parse(output);
    expect(score.keys).toEqual([{ at: 0, key: "Db" }]);
    expect(score.notes.map((note) => note.midi)).toEqual([61, 63]);
    check(score);
  });

  it("transposes only from the chosen key change on, notes, chords and later keys", () => {
    const text = `${TWO_VOICES}
K:C
V: Vocal
C16|
V: Ins
C16|
V: Vocal
K:G
"D"D16|
V: Ins
K:G
D16|
V: Vocal
E16|
V: Ins
E16|`;
    const output = apply(text, { type: "setKey", key: "A", from: 1024 });

    expect(output).toBe(`${TWO_VOICES}
K:C
V: Vocal
C16|
V: Ins
C16|
V: Vocal
K:A
"E"E16|
V: Ins
K:A
E16|
V: Vocal
F16|
V: Ins
F16|`);
    const score = parse(output);
    expect(score.keys).toEqual([
      { at: 0, key: "C" },
      { at: 1024, key: "A" },
    ]);
    expect(score.notes.map((note) => [note.id, note.midi])).toEqual([
      ["Vocal:0", 60],
      ["Vocal:1024", 64],
      ["Vocal:2048", 66],
      ["Ins:0", 60],
      ["Ins:1024", 64],
      ["Ins:2048", 66],
    ]);
    check(score);
  });

  it("can start from a key change written inline in the bar", () => {
    const text = `${TWO_VOICES}
K:C
V: Vocal
C8[K:G]D8|
V: Ins
C8[K:G]D8|`;
    const output = apply(text, { type: "setKey", key: "D", from: 512 });

    expect(output).toBe(`${TWO_VOICES}
K:C
V: Vocal
C8[K:D]A,8|
V: Ins
C8[K:D]A,8|`);
    const score = parse(output);
    expect(score.keys).toEqual([
      { at: 0, key: "C" },
      { at: 512, key: "D" },
    ]);
    expect(score.notes.map((note) => [note.id, note.midi])).toEqual([
      ["Vocal:0", 60],
      ["Vocal:512", 57],
      ["Ins:0", 60],
      ["Ins:512", 57],
    ]);
    check(score);
  });

  it("leaves the score's bytes alone when the key is already the chosen one", () => {
    expect(apply(SIMPLE, { type: "setKey", key: "C" })).toBe(SIMPLE);
  });

  it("sets the whole score's key on every sample and transposes every note by the shortest interval", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const before = parse(text);
      const current = (before.keys[0] as { key: string }).key;
      let shift = (keyPitchClass("C") - keyPitchClass(current) + 12) % 12;
      if (shift > 6) shift -= 12;
      const after = parse(apply(text, { type: "setKey", key: "C" }));
      check(after);

      expect(after.keys[0], fact.file).toEqual({ at: 0, key: "C" });
      expectNotesMoved(before, after, shift);
      expect(after.bars.length, fact.file).toBe(before.bars.length);
      expect(otherLinesWithoutKeys(apply(text, { type: "setKey", key: "C" })), fact.file).toEqual(
        otherLinesWithoutKeys(text),
      );
    }
  });

  it("refuses a key outside constraints.keys and leaves the text unchanged", () => {
    const result = applyScoreCommand(song2Dialect, SIMPLE, { type: "setKey", key: "D#" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("key-not-allowed");
    expect(result.diagnostic.params.key).toBe("D#");
  });

  it("refuses a position that is not a key change", () => {
    const result = applyScoreCommand(song2Dialect, SIMPLE, { type: "setKey", key: "G", from: 256 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("key-change-not-found");
  });
});

describe("set tempo", () => {
  it("writes Q:1/4= and changes no pitch on every sample", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const before = parse(text);
      const output = apply(text, { type: "setTempo", bpm: 133 });
      const after = parse(output);
      check(after);

      expect(after.tempo, fact.file).toEqual({ unit: "1/4", bpm: 133 });
      expect(after.notes, fact.file).toEqual(before.notes);
      expect(after.chords, fact.file).toEqual(before.chords);
      expect(after.keys, fact.file).toEqual(before.keys);
      expect(after.bars, fact.file).toEqual(before.bars);
      expect(after.sections, fact.file).toEqual(before.sections);

      const lines = text.replace(/\r\n?/g, "\n").split("\n");
      const outputLines = output.split("\n");
      expect(outputLines.length, fact.file).toBe(lines.length);
      for (const [index, line] of lines.entries()) {
        if (index === 4) continue;
        expect(outputLines[index], `${fact.file} line ${index + 1}`).toBe(line);
      }
      expect(outputLines[4]).toBe("Q:1/4=133");
    }
  });

  it("refuses a tempo outside the dialect's range", () => {
    for (const bpm of [19, 401, 120.5]) {
      const result = applyScoreCommand(song2Dialect, SIMPLE, { type: "setTempo", bpm });
      expect(result.ok, String(bpm)).toBe(false);
      if (result.ok) continue;
      expect(result.diagnostic.code).toBe("tempo-out-of-range");
    }
  });
});

describe("project commands and the style BPM", () => {
  const forms: ReadonlyArray<readonly [string, string]> = [
    ["pop, 120 BPM", "pop, 140 BPM"],
    ["pop, 120bpm", "pop, 140bpm"],
    ["pop, BPM: 120", "pop, BPM: 140"],
    ["pop, bpm=120", "pop, bpm=140"],
    ["pop, BPM 120", "pop, BPM 140"],
    ["流行风格，120 BPM，温暖的钢琴", "流行风格，140 BPM，温暖的钢琴"],
    ["3/4 拍，2 段，120 BPM，第 3 段", "3/4 拍，2 段，140 BPM，第 3 段"],
  ];

  it("moves a BPM written in the style text with the tempo, in each form", () => {
    for (const [style, expected] of forms) {
      const result = applyProjectCommand(song2Dialect, project({ style }), { type: "setTempo", bpm: 140 });

      expect(result.project.style, style).toBe(expected);
      expect(parse(result.project.score).tempo.bpm, style).toBe(140);
      expect(result.diagnostics, style).toEqual([]);
    }
  });

  it("changes no number that is not a BPM", () => {
    const result = applyProjectCommand(song2Dialect, project({ style: "3/4 拍，2 段，88 个音，120 BPM" }), {
      type: "setTempo",
      bpm: 100,
    });

    expect(result.project.style).toBe("3/4 拍，2 段，88 个音，100 BPM");
  });

  it("leaves a style without a BPM as it is and reports it as a notice", () => {
    const result = applyProjectCommand(song2Dialect, project({ style: "warm pop, 3/4" }), {
      type: "setTempo",
      bpm: 100,
    });

    expect(result.project.style).toBe("warm pop, 3/4");
    expect(parse(result.project.score).tempo.bpm).toBe(100);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["style-no-bpm"]);
    expect(isNoticeDiagnostic(result.diagnostics[0] as (typeof result.diagnostics)[number])).toBe(true);
  });

  it("changes only the requested project field", () => {
    const style = applyProjectCommand(song2Dialect, project(), { type: "setStyle", style: "rock" });
    expect(style.project).toEqual({ ...project(), style: "rock" });
    expect(style.diagnostics).toEqual([]);

    const mode = applyProjectCommand(song2Dialect, project(), { type: "setScoreMode", scoreMode: "melody" });
    expect(mode.project).toEqual({ ...project(), scoreMode: "melody" });
    expect(mode.diagnostics).toEqual([]);

    const seed = applyProjectCommand(song2Dialect, project(), { type: "setSeed", seed: 42 });
    expect(seed.project).toEqual({ ...project(), seed: 42 });
    expect(seed.diagnostics).toEqual([]);

    const cleared = applyProjectCommand(song2Dialect, project(), { type: "setSeed", seed: null });
    expect(cleared.project).toEqual({ ...project(), seed: null });
    expect(cleared.diagnostics).toEqual([]);
  });

  it("refuses a seed that is not a whole number and leaves the project as it was", () => {
    const input = project();
    const result = applyProjectCommand(song2Dialect, input, { type: "setSeed", seed: 1.5 });

    expect(result.project).toBe(input);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["seed-not-integer"]);
  });

  it("keeps the existing score commands working through applyProjectCommand", () => {
    const result = applyProjectCommand(song2Dialect, project(), { type: "toRest", noteId: "Vocal:0" });

    expect(result.diagnostics).toEqual([]);
    expect(result.project.score).toContain("z16|");
  });
});

describe("melody mode with chords", () => {
  const withChords = `${ONE_VOICE}
K:C
V: Vocal
"C"C16|`;

  it("reports the diagnostic when a project in melody mode carries chords", () => {
    const input = project({ score: withChords, scoreMode: "melody" });

    expect(checkProject(song2Dialect, input).map((diagnostic) => diagnostic.code)).toEqual(["melody-with-chords"]);

    const result = applyProjectCommand(song2Dialect, input, { type: "setStyle", style: "new" });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["melody-with-chords"]);
  });

  it("fixes it by deleting all chords", () => {
    const input = project({ score: withChords, scoreMode: "melody" });
    const result = applyProjectCommand(song2Dialect, input, { type: "removeChords" });

    expect(result.diagnostics).toEqual([]);
    expect(parse(result.project.score).chords).toEqual([]);
    expect(parse(result.project.score).hasChords).toBe(false);
    expect(result.project.score).not.toContain('"C"');
    expect(checkProject(song2Dialect, result.project)).toEqual([]);
  });

  it("fixes it by switching back to full", () => {
    const input = project({ score: withChords, scoreMode: "melody" });
    const result = applyProjectCommand(song2Dialect, input, { type: "setScoreMode", scoreMode: "full" });

    expect(result.diagnostics).toEqual([]);
    expect(result.project.scoreMode).toBe("full");
    expect(checkProject(song2Dialect, result.project)).toEqual([]);
  });

  it("does not report a full project with chords, or a melody project without them", () => {
    expect(checkProject(song2Dialect, project({ score: withChords, scoreMode: "full" }))).toEqual([]);
    expect(checkProject(song2Dialect, project({ score: SIMPLE, scoreMode: "melody" }))).toEqual([]);
  });

  it("reports both notices when a tempo change meets a melody project with chords and no style BPM", () => {
    const input = project({ score: withChords, scoreMode: "melody", style: "warm" });
    const result = applyProjectCommand(song2Dialect, input, { type: "setTempo", bpm: 100 });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["style-no-bpm", "melody-with-chords"]);
  });
});

describe("project command types", () => {
  it("names the union ProjectCommand", () => {
    const command: ProjectCommand = { type: "setScoreMode", scoreMode: "full" };
    expect(command.type).toBe("setScoreMode");
  });
});

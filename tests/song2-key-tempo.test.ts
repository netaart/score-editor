// ABOUTME: Exercises transpose, set key, set tempo, the song-project rules and the project commands through the package entries.
// ABOUTME: Expected text and key spellings are worked by hand from RULES.md; sample sweeps use hand-written expected values.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  applyScoreCommand,
  checkProject,
  isNoticeDiagnostic,
  type Note,
  type ProjectCommand,
  type Score,
  type ScoreCommand,
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

// Worked by hand from RULES.md H9: each sample's header key, transposed up two semitones. key-changes.abc also
// states G inline at tick 512 and D at the start of the verse, so those two entries move with the header.
const TRANSPOSE_UP_2_KEYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "chords-cut-tail.abc": ["Fm"],
  "chords-eight-sections.abc": ["Gm"],
  "chords-long.abc": ["Fm"],
  "compact-three-sections.abc": ["G"],
  "dense-accidentals.abc": ["E"],
  "key-changes.abc": ["D", "A", "E"],
  "melody-cut-tail.abc": ["Fm"],
  "short-three-sections.abc": ["Gb"],
  "short-two-sections.abc": ["Gb"],
  "vocal-only-melody.abc": ["Fm"],
};

// The shortest interval from each sample's header key to C, worked by hand: D#m down 3, Fm down 5, F down 5,
// D down 2, E down 4, C none.
const SET_KEY_C_SHIFT: Readonly<Record<string, number>> = {
  "chords-cut-tail.abc": -3,
  "chords-eight-sections.abc": -5,
  "chords-long.abc": -3,
  "compact-three-sections.abc": -5,
  "dense-accidentals.abc": -2,
  "key-changes.abc": 0,
  "melody-cut-tail.abc": -3,
  "short-three-sections.abc": -4,
  "short-two-sections.abc": -4,
  "vocal-only-melody.abc": -3,
};

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

  it("respells a flat slash chord with a double accidental into a sharp key", () => {
    const text = `${ONE_VOICE}
K:F
V: Vocal
"Dbb/Fb"C4D4E4F4|`;
    const output = apply(text, { type: "transpose", semitones: 2 });

    expect(output).toBe(`${ONE_VOICE}
K:G
V: Vocal
"D/F#"D4E4F4G4|`);
    const score = parse(output);
    expect(score.chords).toEqual([{ name: "D/F#", start: 0, noteId: "Vocal:0" }]);
    check(score);
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

  it("moves every key by the same semitones on every sample", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const after = parse(apply(text, { type: "transpose", semitones: 2 }));

      expect(
        after.keys.map((entry) => entry.key),
        fact.file,
      ).toEqual(TRANSPOSE_UP_2_KEYS[fact.file]);
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

describe("spelling after a transposition", () => {
  it("spells an out-of-key note with a flat key's accidental and cancels the signature", () => {
    const text = `${ONE_VOICE}
K:C
V: Vocal
^F16|`;
    const output = apply(text, { type: "transpose", semitones: 1 });

    expect(output).toBe(`${ONE_VOICE}
K:Db
V: Vocal
=G16|`);
    expect(parse(output).notes.map((note) => note.midi)).toEqual([67]);
    check(parse(output));
  });

  it("keeps a minor key minor and spells its out-of-key note in the new sharp key", () => {
    const text = `${ONE_VOICE}
K:Am
V: Vocal
^C16|`;
    const output = apply(text, { type: "transpose", semitones: 2 });

    expect(output).toBe(`${ONE_VOICE}
K:Bm
V: Vocal
^D16|`);
    expect(parse(output).notes.map((note) => note.midi)).toEqual([63]);
    check(parse(output));
  });

  it("takes the flat spelling of a tritone tie, and lets set key force the sharp side", () => {
    const text = `${ONE_VOICE}
K:C
V: Vocal
C16|`;
    const transposed = apply(text, { type: "transpose", semitones: 6 });
    expect(transposed).toBe(`${ONE_VOICE}
K:Gb
V: Vocal
G16|`);
    expect(parse(transposed).notes.map((note) => note.midi)).toEqual([66]);

    const forced = apply(text, { type: "setKey", key: "F#" });
    expect(forced).toBe(`${ONE_VOICE}
K:F#
V: Vocal
F16|`);
    expect(parse(forced).notes.map((note) => note.midi)).toEqual([66]);
  });

  it("takes E-flat minor on the enharmonic tie, and lets set key force D-sharp minor", () => {
    const text = `${ONE_VOICE}
K:Cm
V: Vocal
C16|`;
    const transposed = apply(text, { type: "transpose", semitones: 3 });
    expect(transposed).toBe(`${ONE_VOICE}
K:Ebm
V: Vocal
E16|`);
    expect(parse(transposed).keys).toEqual([{ at: 0, key: "Ebm" }]);

    const forced = apply(text, { type: "setKey", key: "D#m" });
    expect(forced).toBe(`${ONE_VOICE}
K:D#m
V: Vocal
D16|`);
    expect(parse(forced).keys).toEqual([{ at: 0, key: "D#m" }]);
  });

  it("handles the extreme keys Cb and C# as both a start and a target", () => {
    const fromCb = apply(
      `${ONE_VOICE}
K:Cb
V: Vocal
C16|`,
      { type: "transpose", semitones: 1 },
    );
    expect(fromCb).toBe(`${ONE_VOICE}
K:C
V: Vocal
C16|`);
    expect(parse(fromCb).notes.map((note) => note.midi)).toEqual([60]);

    const fromCSharp = apply(
      `${ONE_VOICE}
K:C#
V: Vocal
C16|`,
      { type: "transpose", semitones: -1 },
    );
    expect(fromCSharp).toBe(`${ONE_VOICE}
K:C
V: Vocal
C16|`);
    expect(parse(fromCSharp).notes.map((note) => note.midi)).toEqual([60]);

    const toCb = apply(
      `${ONE_VOICE}
K:C
V: Vocal
C16|`,
      { type: "setKey", key: "Cb" },
    );
    expect(toCb).toBe(`${ONE_VOICE}
K:Cb
V: Vocal
=B,16|`);
    expect(parse(toCb).notes.map((note) => note.midi)).toEqual([59]);

    const toCSharp = apply(
      `${ONE_VOICE}
K:C
V: Vocal
C16|`,
      { type: "setKey", key: "C#" },
    );
    expect(toCSharp).toBe(`${ONE_VOICE}
K:C#
V: Vocal
C16|`);
    expect(parse(toCSharp).notes.map((note) => note.midi)).toEqual([61]);
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
      const output = apply(text, { type: "setKey", key: "C" });
      const after = parse(output);
      check(after);

      expect(
        after.keys.map((entry) => entry.key),
        fact.file,
      ).toEqual(fact.file === "key-changes.abc" ? ["C", "G", "D"] : ["C"]);
      expectNotesMoved(before, after, SET_KEY_C_SHIFT[fact.file] as number);
      expect(after.bars.length, fact.file).toBe(before.bars.length);
      expect(otherLinesWithoutKeys(output), fact.file).toEqual(otherLinesWithoutKeys(text));
    }
  });

  it("sets the key from the verse of key-changes.abc, leaving the earlier bars byte-identical", () => {
    const text = readFileSync(new URL("samples/key-changes.abc", directory), "utf8");
    const output = apply(text, { type: "setKey", key: "G", from: 2048 });

    expect(output).toBe(`X:1
T:
M:4/4
L:1/16
Q:1/4=112
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% intro
V: Vocal
C8[K:G]D8|"G"G8D8|
V: Ins
C8[K:G]D8|G8D8|
% verse
V: Vocal
K:G
G16|"G"G8B8|
V: Ins
K:G
G16|G8B8|
`);
    const before = parse(text);
    const after = parse(output);
    check(after);

    const oldBars = splitBars(text).pieces;
    const newBars = splitBars(output).pieces;
    for (const bar of ["Vocal:0", "Vocal:1", "Ins:0", "Ins:1"]) {
      expect(newBars.get(bar), bar).toBe(oldBars.get(bar));
    }
    const oldNotes = notesById(before);
    for (const note of before.notes) {
      if (note.start >= 2048) continue;
      expect(after.notes.find((moved) => moved.id === note.id)?.midi, note.id).toBe(note.midi);
    }
    expect(after.keys).toEqual([
      { at: 0, key: "C" },
      { at: 512, key: "G" },
      { at: 2048, key: "G" },
    ]);
    expect(oldNotes.get("Vocal:3584")?.midi).toBe(66);
    expect(after.notes.find((moved) => moved.id === "Vocal:3584")?.midi).toBe(71);
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
    ["pop, BPM：120", "pop, BPM：140"],
    ["3/4 BPM: 120", "3/4 BPM: 140"],
    ["4/4, 120 BPM", "4/4, 140 BPM"],
    ["流行风格，120 BPM，温暖的钢琴", "流行风格，140 BPM，温暖的钢琴"],
    ["3/4 拍，2 段，120 BPM，第 3 段", "3/4 拍，2 段，140 BPM，第 3 段"],
    ["120 BPM，另一次 BPM: 90", "140 BPM，另一次 BPM: 140"],
    ["2019 年写了 12 首，120 BPM", "2019 年写了 12 首，140 BPM"],
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

  it("runs the style rule even when the score already has the requested tempo", () => {
    const at140 = `${ONE_VOICE.replace("Q:1/4=120", "Q:1/4=140")}
K:C
V: Vocal
C16|`;

    const synced = applyProjectCommand(song2Dialect, project({ score: at140, style: "120 BPM" }), {
      type: "setTempo",
      bpm: 140,
    });
    expect(synced.project.style).toBe("140 BPM");
    expect(synced.project.score).toBe(at140);
    expect(synced.diagnostics).toEqual([]);

    const missing = applyProjectCommand(song2Dialect, project({ score: at140, style: "warm pop" }), {
      type: "setTempo",
      bpm: 140,
    });
    expect(missing.project.style).toBe("warm pop");
    expect(missing.project.score).toBe(at140);
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["style-no-bpm"]);
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

describe("removeChords on every sample", () => {
  it("removes every chord and leaves every other bar and every note untouched", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const before = parse(text);
      const result = applyScoreCommand(song2Dialect, text, { type: "removeChords" });
      expect(result.ok, fact.file).toBe(true);
      if (!result.ok) continue;

      if (!before.hasChords) {
        expect(result.text, fact.file).toBe(text);
        continue;
      }

      const after = parse(result.text);
      check(after);
      expect(after.hasChords, fact.file).toBe(false);
      expect(after.chords, fact.file).toEqual([]);
      expect(after.notes, fact.file).toEqual(before.notes);
      expect(after.keys, fact.file).toEqual(before.keys);
      expect(after.bars, fact.file).toEqual(before.bars);
      expect(after.sections, fact.file).toEqual(before.sections);
      expect(after.truncation, fact.file).toEqual(before.truncation);

      const touched = new Set<string>();
      for (const chord of before.chords) {
        const bar = before.bars.find((entry) => chord.start >= entry.start && chord.start < entry.start + entry.length);
        if (bar !== undefined) touched.add(`Vocal:${bar.index}`);
      }
      const oldBars = splitBars(text).pieces;
      const newBars = splitBars(result.text).pieces;
      expect(
        [...newBars.keys()].filter((key) => !oldBars.has(key)),
        fact.file,
      ).toEqual([]);
      for (const [key, piece] of oldBars) {
        if (touched.has(key)) continue;
        expect(newBars.get(key), `${fact.file} ${key}`).toBe(piece);
      }
      expect(splitBars(result.text).otherLines, fact.file).toEqual(splitBars(text).otherLines);
    }
  });

  it("removes an unfinished chord string at the cut when it is the only chord material", () => {
    const result = applyScoreCommand(song2Dialect, `${ONE_VOICE}\nK:C\nV: Vocal\nC16|D8"C`, { type: "removeChords" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe(`${ONE_VOICE}\nK:C\nV: Vocal\nC16|D8`);
    const after = parse(result.text);
    check(after);
    expect(after.hasChords).toBe(false);
    expect(after.chords).toEqual([]);
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

describe("the two command unions", () => {
  it("refuses a ProjectCommand passed to applyScoreCommand at run time", () => {
    const command = { type: "setStyle", style: "jazz" } as unknown as ScoreCommand;
    const result = applyScoreCommand(song2Dialect, SIMPLE, command);

    expect(result.ok).toBe(false);
    expect("text" in result).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("not-a-score-command");
    expect(result.diagnostic.params.type).toBe("setStyle");
  });

  it("applies a ProjectCommand through applyProjectCommand", () => {
    const command: ProjectCommand = { type: "setStyle", style: "jazz" };
    const result = applyProjectCommand(song2Dialect, project(), command);

    expect(result.project.style).toBe("jazz");
    expect(result.diagnostics).toEqual([]);
  });
});

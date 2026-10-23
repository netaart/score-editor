// ABOUTME: Pins the write-back cases these commands must keep: cuts at bar ends, short Ins blocks, cut chord bars, ties and header bytes.
// ABOUTME: Expected text is worked by hand from RULES.md; where the rules leave a choice, the test names the choice it accepts.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { applyScoreCommand, formatDiagnostic, type Score, type ScoreCommand } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { splitBars } from "./song2-support";

const H1 = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

const H2 = `${H1}
V: Ins clef=treble name="Ins Melody" snm="Inst."`;

function parse(text: string): Score {
  const { score, diagnostics } = song2Dialect.parse(text);
  expect(diagnostics).toEqual([]);
  expect(score).not.toBeNull();
  if (score === null) throw new Error("the score did not read");
  return score;
}

function roundTrip(text: string): Score {
  const score = parse(text);
  expect(song2Dialect.check(score)).toEqual([]);
  return score;
}

function succeed(text: string, command: ScoreCommand): string {
  const result = applyScoreCommand(song2Dialect, text, command);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("the command was refused");
  return result.text;
}

describe("a score cut at a measure end", () => {
  it("inserts after the last complete measure without closing it", () => {
    const input = `${H1}
K:C
V: Vocal
C16`;
    const output = succeed(input, { type: "insertBar", bar: 1 });

    expect(output).toBe(`${H1}
K:C
V: Vocal
C16|z16`);
    const score = roundTrip(output);
    expect(score.truncation).toEqual({ voice: "Vocal", bar: 2, short: false });
    expect(score.notes.map((note) => [note.start, note.duration, note.midi])).toEqual([
      [0, 1024, 60],
      [1024, 1024, null],
    ]);
  });

  it("inserts before the last complete measure and keeps its bytes", () => {
    const input = `${H1}
K:C
V: Vocal
C16`;
    const output = succeed(input, { type: "insertBar", bar: 0 });

    expect(output).toBe(`${H1}
K:C
V: Vocal
z16|C16`);
    roundTrip(output);
  });

  it("deletes before the cut and keeps every surviving bar", () => {
    const input = `${H1}
K:C
V: Vocal
C16|D16|E16`;
    const output = succeed(input, { type: "deleteBars", from: 0, count: 1 });

    expect(output).toBe(`${H1}
K:C
V: Vocal
D16|E16`);
    const before = splitBars(input);
    const after = splitBars(output);
    expect(after.pieces.get("Vocal:0")).toBe(before.pieces.get("Vocal:1"));
    expect(after.pieces.get("Vocal:1")).toBe(before.pieces.get("Vocal:2"));
    roundTrip(output);
  });

  it("redraws the meter and still stops at the cut", () => {
    const input = `${H1}
K:C
V: Vocal
C16|D16`;
    const output = succeed(input, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 2, denominator: 4 },
    });

    expect(output).toBe(`${H1}
K:C
V: Vocal
M:2/4
C8-|C8|D8-|D8`);
    roundTrip(output);
  });

  it("cuts the Ins block at its last complete measure", () => {
    const input = `${H2}
K:C
V: Vocal
C16|D16|
V: Ins
z16|z16`;
    const output = succeed(input, { type: "insertBar", bar: 0 });

    expect(output).toBe(`${H2}
K:C
V: Vocal
z16|C16|D16|
V: Ins
z16|z16|z16`);
    roundTrip(output);
  });

  it("states a moved cut in Ins when a command outside the bar grid writes it", () => {
    const input = `${H2}
K:C
V: Vocal
C16`;
    const output = succeed(input, { type: "setTempo", bpm: 88 });

    expect(output).toBe(`${H2.replace("Q:1/4=120", "Q:1/4=88")}
K:C
V: Vocal
C16|`);
    const score = roundTrip(output);
    expect(score.truncation).toEqual({ voice: "Ins", bar: 0, short: false });
  });

  it("keeps the Vocal bars when the Ins block is missing", () => {
    const input = `${H2}
K:C
V: Vocal
C16`;
    const output = succeed(input, { type: "insertBar", bar: 0 });

    // Choice: with no Ins bar for the Vocal cut, the cut reads in the required Ins voice instead.
    expect(output).toBe(`${H2}
K:C
V: Vocal
z16|
V: Ins
z16|
V: Vocal
C16|`);
    roundTrip(output);
  });
});

describe("the Ins block is missing or short", () => {
  it("inserts a rest bar in both voices when the last line is a V: prefix", () => {
    const input = `${H2}
K:C
V: Vocal
C16|
V: Ins
Z|
V: Vocal
D16|
V: In`;
    const output = succeed(input, { type: "insertBar", bar: 0 });

    expect(output).toBe(`${H2}
K:C
V: Vocal
z16|C16|
V: Ins
z16|Z|
V: Vocal
D16|
V: In`);
    roundTrip(output);
  });

  it("writes the inserted Ins bar when the Ins block is missing", () => {
    const input = `${H2}
K:C
V: Vocal
Z|`;
    const output = succeed(input, { type: "insertBar", bar: 0 });

    expect(output).toBe(`${H2}
K:C
V: Vocal
Z|
V: Ins
z16|
V: Vocal
Z|`);
    roundTrip(output);
  });
});

describe("the cut is inside the last Vocal block", () => {
  it("keeps a later Vocal block and its unfinished chord after the Ins block", () => {
    const input = `${H2}
K:C
V: Vocal
z16|
V: Ins
Z|
V: Vocal
"Cm`;
    const output = succeed(input, { type: "insertBar", bar: 0 });

    expect(output).toBe(`${H2}
K:C
V: Vocal
z16|z16|
V: Ins
Z|Z|
V: Vocal
"Cm`);
    const score = roundTrip(output);
    expect(score.truncation).toEqual({ voice: "Vocal", bar: 2, short: true, unfinishedChord: true });
  });

  it("keeps the cut inside the Vocal block when the Ins block is missing", () => {
    const input = `${H2}
K:C
V: Vocal
C16|D16|"`;
    const output = succeed(input, { type: "insertBar", bar: 0 });

    expect(output).toBe(`${H2}
K:C
V: Vocal
z16|
V: Ins
z16|
V: Vocal
C16|D16|"`);
    roundTrip(output);
  });

  it("deletes a bar of the cut group and keeps the Ins fragment", () => {
    const input = `${H2}
K:C
V: Vocal
C16|D16|
V: Ins
Z2|
V: Vocal
E16|F16|c4`;
    const output = succeed(input, { type: "deleteBars", from: 2, count: 1 });

    expect(output).toBe(`${H2}
K:C
V: Vocal
C16|D16|
V: Ins
Z2|
V: Vocal
F16|c4`);
    roundTrip(output);
  });

  it("deletes the only chord bar and keeps the partial measure", () => {
    const input = `${H1}
K:C
V: Vocal
C16|C16|"E#sus2"C16|C`;
    const output = succeed(input, { type: "deleteBars", from: 2, count: 1 });

    expect(output).toBe(`${H1}
K:C
V: Vocal
C16|C16|C`);
    const score = roundTrip(output);
    expect(score.hasChords).toBe(false);
    expect(score.truncation).toEqual({ voice: "Vocal", bar: 2, short: true });
  });
});

describe("a short final Ins block", () => {
  it("keeps the later Vocal measures in the final short Ins group", () => {
    const input = `${H2}
K:C
% a
V: Vocal
C16|D16|
V: Ins
z16|z16|
V: Vocal
E16|F16|G16|
V: Ins
z8`;
    const output = succeed(input, { type: "insertBar", bar: 0 });

    expect(output).toBe(`${H2}
K:C
% a
V: Vocal
z16|C16|D16|
V: Ins
z16|z16|z16|
V: Vocal
E16|F16|G16|
V: Ins
z8`);
    const score = roundTrip(output);
    expect(score.truncation).toEqual({ voice: "Ins", bar: 3, short: true });
    expect(score.bars).toHaveLength(6);
  });

  it("keeps several later Vocal measures after a multi-bar Ins fragment", () => {
    const input = `${H2}
K:C
V: Vocal
C16|C16|C16|C16|
V: Ins
z16|z16|z8`;
    const output = succeed(input, { type: "insertBar", bar: 0 });

    expect(output).toBe(`${H2}
K:C
V: Vocal
z16|C16|C16|
V: Ins
z16|z16|z16|
V: Vocal
C16|C16|
V: Ins
z8`);
    const score = roundTrip(output);
    expect(score.truncation).toEqual({ voice: "Ins", bar: 3, short: true });
    expect(score.bars).toHaveLength(5);
  });
});

describe("a bar inside a whole-measure rest run", () => {
  it("turns a two-bar Z run into one bar", () => {
    const input = `${H1}
K:C
V: Vocal
Z2|`;
    const output = succeed(input, { type: "deleteBars", from: 0, count: 1 });

    expect(output).toBe(`${H1}
K:C
V: Vocal
Z|`);
    roundTrip(output);
  });

  it("turns a two-bar Ins run into one bar and keeps the Vocal bars", () => {
    const input = `${H2}
K:C
V: Vocal
F4=F4F4z4|F4z12|
V: Ins
Z2|`;
    const output = succeed(input, { type: "deleteBars", from: 1, count: 1 });

    expect(output).toBe(`${H2}
K:C
V: Vocal
F4=F4F4z4|
V: Ins
Z|`);
    roundTrip(output);
  });

  it("keeps both sections when a Z4 run in Ins loses a bar", () => {
    const input = `${H2}
K:C
% a
V: Vocal
C16|C16|C16|C16|
V: Ins
Z4|
% b
V: Vocal
D16|D16|
V: Ins
Z2|`;
    const output = succeed(input, { type: "deleteBars", from: 0, count: 1 });

    expect(output).toBe(`${H2}
K:C
% a
V: Vocal
C16|C16|C16|
V: Ins
Z3|
% b
V: Vocal
D16|D16|
V: Ins
Z2|`);
    roundTrip(output);
  });
});

describe("the cut measure holds only a chord", () => {
  it("drops an unfinished chord string with its empty partial measure", () => {
    const input = `${H2}
K:C
V: Vocal
C16|
V: Ins
Z|
V: Vocal
"Cm`;
    const output = succeed(input, { type: "removeChords" });

    expect(output).toBe(`${H2}
K:C
V: Vocal
C16|
V: Ins
Z|
V: Vocal`);
    const score = roundTrip(output);
    expect(score.hasChords).toBe(false);
    expect(score.truncation).toEqual({ voice: "Vocal", bar: 1, short: false });
  });

  it("drops a finished chord with its empty partial measure", () => {
    const input = `${H2}
K:C
V: Vocal
C16|
V: Ins
Z|
V: Vocal
"G7"`;
    const output = succeed(input, { type: "removeChords" });

    expect(output).toBe(`${H2}
K:C
V: Vocal
C16|
V: Ins
Z|
V: Vocal`);
    roundTrip(output);
  });
});

describe("fill pads a cut measure that ends in a chord", () => {
  it("writes the rests after a finished chord and attaches it", () => {
    const input = `${H1}
K:C
V: Vocal
C16|"G7"`;
    const output = succeed(input, { type: "fillTruncatedBar" });

    expect(output).toBe(`${H1}
K:C
V: Vocal
C16|"G7"z16|`);
    const score = roundTrip(output);
    expect(score.chords).toEqual([{ name: "G7", start: 1024, noteId: "Vocal:1024" }]);
  });

  it("attaches a trailing chord to the rest that fills after it", () => {
    const input = `${H1}
K:C
V: Vocal
C16|E4F4G"Cm7"`;
    const output = succeed(input, { type: "fillTruncatedBar" });

    // Choice: seven unit rests keep the fill in the format's own unit; they are not regrouped.
    expect(output).toBe(`${H1}
K:C
V: Vocal
C16|E4F4G"Cm7"zzzzzzz|`);
    roundTrip(output);
  });
});

describe("a key change beyond the cut of the shorter voice", () => {
  it("transposes the Vocal key change and leaves the Ins cut bytes alone", () => {
    const input = `${H2}
K:C
V: Vocal
C8[K:F]C8|C16|
V: Ins
z`;
    const output = succeed(input, { type: "transpose", semitones: 2 });

    expect(output).toBe(`${H2}
K:D
V: Vocal
D8[K:G]D8|D16|
V: Ins
z`);
    roundTrip(output);
  });

  it("sets the key beyond the cut and leaves the Ins cut bytes alone", () => {
    const input = `${H2}
K:C
V: Vocal
C8[K:F]C8|C16|
V: Ins
z`;
    const output = succeed(input, { type: "setKey", key: "A#m" });

    expect(output).toBe(`${H2}
K:A#m
V: Vocal
A,8[K:Eb]B,8|B,16|
V: Ins
z`);
    roundTrip(output);
  });
});

describe("padding rests after a dangling tie", () => {
  it("pads the last bar and drops the tie into the rests", () => {
    const input = `X:1
T:
M:2/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:D
V: Vocal
C8|C8|C8|C6C2-|`;
    const output = succeed(input, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 9, denominator: 8 },
    });

    expect(output).toBe(`X:1
T:
M:2/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:D
V: Vocal
M:9/8
C8C8C2-|C6C6C2z4|`);
    const score = roundTrip(output);
    expect(score.notes[score.notes.length - 2]?.tie).toBe(false);
  });
});

it("writes a same-length meter change and keeps the short Ins cut", () => {
  const input = `${H2}
K:Fm
% intro
V: Vocal
"Fm"z16|"Fm"z16|"Fm"z16|"Fm"z8"Eb6"z8|
V: Ins
F2G2A2e2c8-|c16|F2G2A2e2c4B4-|B8G8|
V: Vocal
"Db"z16|"Db"z16|"Bbm"z16|"Bbm"z16|
V: Ins
F2G2A2e2c8-|c8B8|F2G2A2e2c4B4-|B8G8|
V: Vocal
"Fm"z16`;
  const output = succeed(input, {
    type: "setSectionMeter",
    section: 0,
    meter: { numerator: 2, denominator: 2 },
  });

  const score = roundTrip(output);
  expect(output.match(/M:2\/2/g)).toHaveLength(2);
  expect(score.bars).toHaveLength(9);
  expect(score.truncation).toEqual({ voice: "Ins", bar: 8, short: false });
});

describe("trailing whitespace on the header M: line", () => {
  const text = `X:1  \t
T:  \t
M:4/4  \t
L:1/16  \t
Q:1/4=100  \t
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"  \t
K:C  \t
% a  \t
V: Vocal  \t
C16|  \t`;

  it("inserts a bar and keeps the untouched header bytes", () => {
    const output = succeed(text, { type: "insertBar", bar: 1 });
    const score = roundTrip(output);
    expect(score.bars).toHaveLength(2);
    expect(score.notes.map((note) => note.midi)).toEqual([60, null]);
  });

  it("writes a changed section meter without trailing whitespace", () => {
    const output = succeed(text, {
      type: "setSectionMeter",
      section: 0,
      meter: { numerator: 6, denominator: 8 },
    });
    const score = roundTrip(output);
    expect(score.bars[0]?.meter).toEqual({ numerator: 6, denominator: 8 });
    expect(output.split("\n").filter((line) => line.startsWith("M:6/8"))).not.toHaveLength(0);
    for (const line of output.split("\n")) {
      if (line.startsWith("M:6/8")) expect(line).not.toMatch(/[ \t]$/);
    }
  });
});

describe("an X5 cut tail after a tied note", () => {
  it("transposes the tied note and rewrites the tail so the cut stays", () => {
    const input = `${H1}
K:C
V: Vocal
C16-|B`;
    const output = succeed(input, { type: "transpose", semitones: 10 });

    const score = roundTrip(output);
    expect(score.truncation).toEqual({ voice: "Vocal", bar: 1, short: true });
    expect(score.notes).toHaveLength(1);
    expect(score.notes[0]).toMatchObject({ start: 0, duration: 1024, midi: 70, tie: true });
    expect(output.split("\n").slice(-1)[0]).toBe("B16-|=A");
  });

  it("compares a kept tail under the key state an edit leaves", () => {
    const input = `${H1}
K:Ab
V: Vocal
^C16-|
V: Vocal
[K:D]D`;
    const parsed = parse(input);
    const keys = parsed.keys.filter((change) => change.key !== "D");
    const bars = parsed.bars.map((bar) => (bar.index === 1 ? { ...bar, key: "Ab", keyChanges: [] } : bar));
    const output = song2Dialect.serialize({ ...parsed, keys, bars });

    expect(output).toBe(`${H1}
K:Ab
V: Vocal
^C16-|
V: Vocal
=C`);
    const score = roundTrip(output);
    expect(score.notes).toHaveLength(1);
    expect(score.notes[0]).toMatchObject({ start: 0, midi: 61, tie: true });
    expect(score.truncation).toEqual({ voice: "Vocal", bar: 1, short: true });
  });

  it("deletes a bar before the cut and keeps the tie into the X5 tail", () => {
    const input = `${H1}
K:C
V: Vocal
z16|c8e8-|C`;
    const output = succeed(input, { type: "deleteBars", from: 0, count: 1 });

    expect(output).toBe(`${H1}
K:C
V: Vocal
c8e8-|C`);
    const score = roundTrip(output);
    expect(score.notes.filter((note) => note.midi !== null).map((note) => [note.start, note.midi, note.tie])).toEqual([
      [0, 72, false],
      [512, 76, true],
    ]);
    expect(score.truncation).toEqual({ voice: "Vocal", bar: 1, short: true });
  });
});

describe("deleteTruncatedBar when another voice lacks whole bars", () => {
  const input = `${H2}
K:C
V: Vocal
C16|D16|
V: Ins
z16|z16|
V: Vocal
E16|F16|G8`;

  it("refuses with its own code and names filling the cut bar instead", () => {
    const result = applyScoreCommand(song2Dialect, input, { type: "deleteTruncatedBar" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("cut-other-voice-short");
    expect(result.diagnostic.params.voice).toBe("Ins");
    expect(result.diagnostic.at).toEqual({ bar: 5, voice: "Ins" });
    expect(formatDiagnostic(result.diagnostic, "en")).toContain("fill the cut bar");
    expect(formatDiagnostic(result.diagnostic, "zh")).toContain("填充截断小节");
  });

  it("fills the same cut bar", () => {
    const output = succeed(input, { type: "fillTruncatedBar" });
    roundTrip(output);
    expect(parse(output).truncation).toBeNull();
  });
});

describe("a transposition by zero", () => {
  it("returns the score as it is, including a key the shortest-spelling rule would change", () => {
    const input = `${H1}
K:C#
V: Vocal
C16|`;
    const output = succeed(input, { type: "transpose", semitones: 0 });

    expect(output).toBe(input);
    expect(parse(output).keys).toEqual([{ at: 0, key: "C#" }]);
  });
});

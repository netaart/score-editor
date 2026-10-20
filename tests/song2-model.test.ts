// ABOUTME: Hand-worked song2 cases for the reading facts the shared vectors do not reach: sections, cut positions, chord attachment and tempo.
// ABOUTME: Expected values come from RULES.md by hand; the parser is only the thing under test.

import { song2Dialect } from "@neta-art/score-dialect-song2";
import { TICKS_PER_QUARTER } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const TWO_VOICES = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C`;

const ONE_VOICE = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C`;

const BAR = 4 * TICKS_PER_QUARTER;
const UNIT = TICKS_PER_QUARTER / 4;

describe("song2 reading, worked by hand", () => {
  it("reports sections with their first bar and bar count, and the tempo as written", () => {
    const text = `${TWO_VOICES}
V: Vocal
C16|
V: Ins
Z|
% verse
V: Vocal
D16|E16|
V: Ins
Z2|
`;
    const { score, diagnostics } = song2Dialect.parse(text);

    expect(diagnostics).toEqual([]);
    expect(score?.tempo).toEqual({ unit: "1/4", bpm: 120 });
    expect(score?.voices).toEqual(["Vocal", "Ins"]);
    expect(score?.sections).toEqual([
      { name: null, firstBar: 0, barCount: 1 },
      { name: "verse", firstBar: 1, barCount: 2 },
    ]);
    expect(score?.bars.map((bar) => [bar.index, bar.start, bar.length, bar.incomplete])).toEqual([
      [0, 0, BAR, false],
      [1, BAR, BAR, false],
      [2, 2 * BAR, BAR, false],
    ]);
    expect(score?.notes.filter((note) => note.voice === "Vocal").map((note) => note.id)).toEqual([
      "Vocal:0",
      `Vocal:${BAR}`,
      `Vocal:${2 * BAR}`,
    ]);
    expect(score?.notes.filter((note) => note.voice === "Vocal").map((note) => note.bar)).toEqual([0, 1, 2]);
    expect(score?.notes.filter((note) => note.voice === "Ins").map((note) => note.start)).toEqual([0, BAR, 2 * BAR]);
  });

  it("keeps a partial final measure in the bar grid and points at it", () => {
    const text = `${ONE_VOICE}
V: Vocal
C16|D8`;
    const { score, diagnostics } = song2Dialect.parse(text);

    expect(diagnostics).toEqual([]);
    expect(score?.truncation).toEqual({ voice: "Vocal", bar: 1, short: true });
    expect(score?.bars).toHaveLength(2);
    expect(score?.bars[1]).toEqual({
      index: 1,
      start: BAR,
      length: BAR,
      meter: { numerator: 4, denominator: 4 },
      key: "C",
      keyChanges: [],
      incomplete: true,
    });
    expect(score?.notes.find((note) => note.id === `Vocal:${BAR}`)).toMatchObject({
      start: BAR,
      duration: 8 * UNIT,
      midi: 62,
      tie: false,
    });
  });

  it("points past the last complete measure when a cut measure was exactly full", () => {
    const text = `${ONE_VOICE}
V: Vocal
C16|D16`;
    const { score, diagnostics } = song2Dialect.parse(text);

    expect(diagnostics).toEqual([]);
    expect(score?.bars).toHaveLength(2);
    expect(score?.bars.every((bar) => !bar.incomplete)).toBe(true);
    expect(score?.truncation).toEqual({ voice: "Vocal", bar: 2, short: false });
  });

  it("attaches a chord to the Vocal note or rest that starts at its position", () => {
    const text = `${ONE_VOICE}
V: Vocal
"C"C4"Am7"z4G8|`;
    const { score, diagnostics } = song2Dialect.parse(text);

    expect(diagnostics).toEqual([]);
    expect(score?.hasChords).toBe(true);
    expect(score?.chords).toEqual([
      { name: "C", start: 0, noteId: "Vocal:0" },
      { name: "Am7", start: 4 * UNIT, noteId: `Vocal:${4 * UNIT}` },
    ]);
    expect(score?.notes.map((note) => [note.id, note.duration, note.midi])).toEqual([
      ["Vocal:0", 4 * UNIT, 60],
      [`Vocal:${4 * UNIT}`, 4 * UNIT, null],
      [`Vocal:${8 * UNIT}`, 8 * UNIT, 67],
    ]);
  });

  it("records a key change inside its bar and the bar's key at its start", () => {
    const text = `${ONE_VOICE}
V: Vocal
C4[K:G]D12|`;
    const { score, diagnostics } = song2Dialect.parse(text);

    expect(diagnostics).toEqual([]);
    expect(score?.keys).toEqual([
      { at: 0, key: "C" },
      { at: 4 * UNIT, key: "G" },
    ]);
    expect(score?.bars[0]?.key).toBe("C");
    expect(score?.bars[0]?.keyChanges).toEqual([{ at: 4 * UNIT, key: "G" }]);
    expect(score?.notes.map((note) => [note.start, note.duration, note.midi])).toEqual([
      [0, 4 * UNIT, 60],
      [4 * UNIT, 12 * UNIT, 62],
    ]);
  });
});

describe("song2 cuts in a later group", () => {
  it("reports the Ins measure number in the whole voice, not in the group", () => {
    const text = `${TWO_VOICES}
V: Vocal
C16|
V: Ins
Z|
V: Vocal
D16|E16|
V: Ins
Z|`;
    const { score, diagnostics } = song2Dialect.parse(text);

    expect(diagnostics).toEqual([]);
    expect(score?.truncation).toEqual({ voice: "Ins", bar: 2, short: false });
    expect(score?.bars.map((bar) => [bar.index, bar.start, bar.incomplete])).toEqual([
      [0, 0, false],
      [1, BAR, false],
      [2, 2 * BAR, false],
    ]);
  });
});

describe("song2 key changes at a bar's first instant", () => {
  it("uses an inline key written at offset 0 as the bar's effective key", () => {
    const text = `${ONE_VOICE}
V: Vocal
[K:G]G16|`;
    const { score, diagnostics } = song2Dialect.parse(text);

    expect(diagnostics).toEqual([]);
    expect(score?.keys).toEqual([
      { at: 0, key: "C" },
      { at: 0, key: "G" },
    ]);
    expect(score?.bars[0]?.key).toBe("G");
    expect(score?.bars[0]?.keyChanges).toEqual([]);
    expect(score?.notes[0]?.midi).toBe(67);
  });
});

// ABOUTME: Seam 1 for the headless half of the lyric track: rows, the commands a boundary drag, a drop and a split send.
// ABOUTME: Every expected value is worked by hand from the bars of the scores below, through the package entry only.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyCommandList,
  barLineTick,
  type LyricLine,
  lyricBoundaryPlan,
  lyricDropPlan,
  lyricRows,
  lyricSplitCommand,
  type SongProject,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { parse } from "./song2-support";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."`;

// Eight bars of 1024 ticks, one whole note each: Intro is bars 0-1, Verse 2-5, Chorus 6-7.
const SCORE_TEXT = `${HEADER}
K:C
% Intro
V: Vocal
C16|D16|
V: Ins
Z2|
% Verse
V: Vocal
E16|F16|G16|A16|
V: Ins
Z4|
% Chorus
V: Vocal
B16|c16|
V: Ins
Z2|`;

// Three bars of four quarter notes each, in one section: twelve note starts, 256 ticks apart.
const QUARTERS_TEXT = `${HEADER}
K:C
% Verse
V: Vocal
C4D4E4F4|G4A4B4c4|C4D4E4F4|`;

const BAR = 1024;
const score = parse(SCORE_TEXT);
const quarters = parse(QUARTERS_TEXT);

const LINES: ReadonlyArray<LyricLine> = [
  { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
  { text: "verse one", phrase: { firstBar: 2, barCount: 2 } },
  { text: "verse two", phrase: { firstBar: 4, barCount: 2 } },
  { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
];

describe("the rows of the lyric track", () => {
  it("gives every line its index, its phrase and what the phrase's notes say about its syllables", () => {
    const rows = lyricRows(quarters, [
      { text: "一二三四五六七八九十甲乙", phrase: { firstBar: 0, barCount: 3 } },
      { text: "一二", phrase: null },
    ]);

    expect(rows.map((row) => [row.index, row.phrase])).toEqual([
      [0, { firstBar: 0, barCount: 3 }],
      [1, null],
    ]);
    expect(rows[0]?.alignment?.syllables.length).toBe(12);
    expect(rows[0]?.alignment?.onsets.length).toBe(12);
    expect(rows[0]?.alignment?.equal).toBe(true);
    expect(rows[1]?.alignment).toBeNull();
  });

  it("reads a phrase that does not fit the score as the unaligned area, and keeps the line's place in the list", () => {
    const rows = lyricRows(score, [
      { text: "fits", phrase: { firstBar: 6, barCount: 2 } },
      { text: "past the end", phrase: { firstBar: 7, barCount: 2 } },
      { text: "crosses a section", phrase: { firstBar: 1, barCount: 2 } },
    ]);

    expect(rows.map((row) => [row.index, row.phrase !== null])).toEqual([
      [0, true],
      [1, false],
      [2, false],
    ]);
    expect(rows[1]?.alignment).toBeNull();
  });

  it("says a phrase of three syllables over four note starts is not equal", () => {
    const rows = lyricRows(quarters, [{ text: "一二三", phrase: { firstBar: 0, barCount: 1 } }]);

    expect(rows[0]?.alignment?.syllables).toEqual(["一", "二", "三"]);
    expect(rows[0]?.alignment?.onsets.length).toBe(4);
    expect(rows[0]?.alignment?.equal).toBe(false);
    expect(rows[0]?.alignment?.notes).toBeNull();
  });
});

describe("the tick of a bar line", () => {
  it("is where the bar starts, and the ends of the score for a line before the first bar or after the last", () => {
    expect(barLineTick(score, 0)).toBe(0);
    expect(barLineTick(score, 3)).toBe(3 * BAR);
    expect(barLineTick(score, 8)).toBe(8 * BAR);
    expect(barLineTick(score, 9)).toBe(8 * BAR);
    expect(barLineTick(score, -1)).toBe(0);
  });

  it("leaves the first phrase where it is when its start edge is stepped to the line before the score", () => {
    const lines: ReadonlyArray<LyricLine> = [{ text: "intro", phrase: { firstBar: 0, barCount: 2 } }];

    const plan = lyricBoundaryPlan(score, lines, { line: 0, edge: "start", tick: barLineTick(score, -1) });

    expect(plan?.boundary).toBe(0);
    expect(plan?.moves).toEqual([]);
    expect(plan?.commands).toEqual([]);
  });
});

describe("dragging the edge of a phrase", () => {
  it("lands on the bar line nearest the pointer", () => {
    // Bar 3 starts at 3072 and bar 4 at 4096: 3500 is nearer to 3072, 3700 to 4096. "verse one" is bars 2-3, so its end is
    // the line before bar 4 that it shares with "verse two" (bars 4-5); the nearest line decides where it goes.
    const near = lyricBoundaryPlan(score, LINES, { line: 1, edge: "end", tick: 3500 });
    const far = lyricBoundaryPlan(score, LINES, { line: 1, edge: "end", tick: 3700 });

    expect(near?.boundary).toBe(3);
    expect(far?.boundary).toBe(4);
  });

  it("moves one edge into free room with one command", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "early", phrase: { firstBar: 2, barCount: 1 } },
      { text: "late", phrase: { firstBar: 5, barCount: 1 } },
    ];

    const plan = lyricBoundaryPlan(score, lines, { line: 0, edge: "end", tick: 5 * BAR });

    expect(plan?.boundary).toBe(5);
    expect(plan?.moves).toEqual([{ line: 0, phrase: { firstBar: 2, barCount: 3 } }]);
    expect(plan?.commands).toEqual([{ type: "setLyricLinePhrase", line: 0, phrase: { firstBar: 2, barCount: 3 } }]);
  });

  it("stops at the next phrase and at the end of the section", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "early", phrase: { firstBar: 2, barCount: 1 } },
      { text: "late", phrase: { firstBar: 5, barCount: 1 } },
    ];

    // The pointer is past "late", which starts at bar 5: the end can reach the line before bar 5 and no further.
    expect(lyricBoundaryPlan(score, lines, { line: 0, edge: "end", tick: 7 * BAR })?.boundary).toBe(5);
    // "late" ends the Verse at the line before bar 6; the Chorus beyond it is another section.
    expect(lyricBoundaryPlan(score, lines, { line: 1, edge: "end", tick: 8 * BAR })?.boundary).toBe(6);
    // Its start may go back to the line after "early" and no further.
    expect(lyricBoundaryPlan(score, lines, { line: 1, edge: "start", tick: 0 })?.boundary).toBe(3);
  });

  it("moves a shared boundary right by shrinking the line that gives up bars first", () => {
    // "verse one" (bars 2-3) and "verse two" (bars 4-5) meet at the line before bar 4; the same worked list as the
    // seam 2 case for a shared boundary.
    const plan = lyricBoundaryPlan(score, LINES, { line: 1, edge: "end", tick: 5 * BAR });

    expect(plan?.boundary).toBe(5);
    expect(plan?.moves).toEqual([
      { line: 2, phrase: { firstBar: 5, barCount: 1 } },
      { line: 1, phrase: { firstBar: 2, barCount: 3 } },
    ]);
    expect(plan?.commands).toEqual([
      { type: "setLyricLinePhrase", line: 2, phrase: { firstBar: 5, barCount: 1 } },
      { type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 2, barCount: 3 } },
    ]);
  });

  it("moves the same shared boundary left, shrinking the earlier line first, when grabbed by the other edge", () => {
    const plan = lyricBoundaryPlan(score, LINES, { line: 2, edge: "start", tick: 3 * BAR });

    expect(plan?.boundary).toBe(3);
    expect(plan?.moves).toEqual([
      { line: 1, phrase: { firstBar: 2, barCount: 1 } },
      { line: 2, phrase: { firstBar: 3, barCount: 3 } },
    ]);
  });

  it("never lets a line lose its last bar", () => {
    // "verse one" is bars 2-3. Its end dragged back to its own first bar line is held one bar after it.
    const end = lyricBoundaryPlan(score, LINES, { line: 1, edge: "end", tick: 2 * BAR });
    // "verse two" is bars 4-5. Its start dragged to the end of the section is held one bar before it.
    const start = lyricBoundaryPlan(score, LINES, { line: 2, edge: "start", tick: 6 * BAR });

    expect(end?.boundary).toBe(3);
    expect(end?.moves).toEqual([
      { line: 1, phrase: { firstBar: 2, barCount: 1 } },
      { line: 2, phrase: { firstBar: 3, barCount: 3 } },
    ]);
    expect(start?.boundary).toBe(5);
    expect(start?.moves).toEqual([
      { line: 2, phrase: { firstBar: 5, barCount: 1 } },
      { line: 1, phrase: { firstBar: 2, barCount: 3 } },
    ]);
  });

  it("does not cross into another section, and sends nothing when the edge stays where it is", () => {
    // The intro runs to the end of the Intro, bars 0-1, and "verse one" starts the Verse: they touch, but across a section
    // line, so the start of "verse one" cannot move into the Intro and the intro does not give up a bar.
    const touching: ReadonlyArray<LyricLine> = [
      { text: "intro line", phrase: { firstBar: 0, barCount: 2 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 2 } },
    ];
    const plan = lyricBoundaryPlan(score, touching, { line: 1, edge: "start", tick: BAR });

    expect(plan?.boundary).toBe(2);
    expect(plan?.moves).toEqual([]);
    expect(plan?.commands).toEqual([]);
  });

  it("is made of commands the song project takes, in the order it gives them", () => {
    const plan = lyricBoundaryPlan(score, LINES, { line: 1, edge: "end", tick: 5 * BAR });
    const project: SongProject = {
      style: "",
      lyrics: "",
      score: SCORE_TEXT,
      scoreMode: "full",
      seed: null,
      modelId: "song2",
      sourceKey: "lyric-edit-test",
      lyricLines: LINES,
    };

    const result = applyCommandList(song2Dialect, project, plan?.commands ?? []);

    expect(result.ok).toBe(true);
    expect(result.project.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 3 } },
      { text: "verse two", phrase: { firstBar: 5, barCount: 1 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ]);
  });

  it("has no plan for a line that is not in a phrase, or is not there", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "placed", phrase: { firstBar: 2, barCount: 1 } },
      { text: "waiting", phrase: null },
      { text: "stale", phrase: { firstBar: 7, barCount: 3 } },
    ];

    expect(lyricBoundaryPlan(score, lines, { line: 1, edge: "end", tick: 3 * BAR })).toBeNull();
    expect(lyricBoundaryPlan(score, lines, { line: 2, edge: "end", tick: 3 * BAR })).toBeNull();
    expect(lyricBoundaryPlan(score, lines, { line: 3, edge: "end", tick: 3 * BAR })).toBeNull();
    expect(lyricBoundaryPlan(score, lines, { line: -1, edge: "end", tick: 3 * BAR })).toBeNull();
  });
});

describe("dropping a line from the unaligned area", () => {
  const lines: ReadonlyArray<LyricLine> = [
    { text: "placed", phrase: { firstBar: 2, barCount: 2 } },
    { text: "waiting", phrase: null },
  ];

  it("gives it one bar, the bar under the pointer", () => {
    // Bar 4 runs from 4096 to 5120.
    const plan = lyricDropPlan(score, lines, { line: 1, tick: 4500 });

    expect(plan?.phrase).toEqual({ firstBar: 4, barCount: 1 });
    expect(plan?.free).toBe(true);
    expect(plan?.commands).toEqual([{ type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 4, barCount: 1 } }]);
  });

  it("says when the bar already belongs to another line, and still names the command", () => {
    const plan = lyricDropPlan(score, lines, { line: 1, tick: 3 * BAR + 10 });

    expect(plan?.phrase).toEqual({ firstBar: 3, barCount: 1 });
    expect(plan?.free).toBe(false);
    expect(plan?.commands).toEqual([{ type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 3, barCount: 1 } }]);
  });

  it("keeps a pointer past either end of the score on the first or the last bar", () => {
    expect(lyricDropPlan(score, lines, { line: 1, tick: -50 })?.phrase).toEqual({ firstBar: 0, barCount: 1 });
    expect(lyricDropPlan(score, lines, { line: 1, tick: 9 * BAR })?.phrase).toEqual({ firstBar: 7, barCount: 1 });
  });

  it("has no plan for a line that is not there", () => {
    expect(lyricDropPlan(score, lines, { line: 2, tick: 0 })).toBeNull();
  });
});

describe("splitting a line at the caret", () => {
  const twelve = "一二三四五六七八九十甲乙";

  it("puts the bar line nearest the note of the first syllable after the caret", () => {
    const lines: ReadonlyArray<LyricLine> = [{ text: twelve, phrase: { firstBar: 0, barCount: 3 } }];

    // Four syllables before the caret: the next syllable is on the 5th note start, the first of bar 1.
    expect(lyricSplitCommand(quarters, lines, { line: 0, offset: 4 })).toEqual({
      type: "splitLyricLine",
      line: 0,
      offset: 4,
      bar: 1,
    });
    // Seven before: the 8th note start is at tick 1792, nearer to bar 2 (2048) than to bar 1 (1024).
    expect(lyricSplitCommand(quarters, lines, { line: 0, offset: 7 })).toEqual({
      type: "splitLyricLine",
      line: 0,
      offset: 7,
      bar: 2,
    });
  });

  it("splits the bars in the proportion of the syllables when the counts are not equal", () => {
    const lines: ReadonlyArray<LyricLine> = [{ text: "一二三四五六", phrase: { firstBar: 0, barCount: 3 } }];

    // Four of six syllables before the caret: two thirds of three bars is bar 2.
    expect(lyricSplitCommand(quarters, lines, { line: 0, offset: 4 })).toMatchObject({ bar: 2 });
    // One of six: half a bar, rounded up, is bar 1, the first line a split can use.
    expect(lyricSplitCommand(quarters, lines, { line: 0, offset: 1 })).toMatchObject({ bar: 1 });
    // Five of six: two and a half bars rounds to 3, which would be the end of the phrase, so it is held at bar 2.
    expect(lyricSplitCommand(quarters, lines, { line: 0, offset: 5 })).toMatchObject({ bar: 2 });
  });

  it("counts the caret in code points, as the command does", () => {
    const lines: ReadonlyArray<LyricLine> = [{ text: "a😀b😀c", phrase: null }];

    expect(lyricSplitCommand(quarters, lines, { line: 0, offset: 3 })).toEqual({
      type: "splitLyricLine",
      line: 0,
      offset: 3,
    });
  });

  it("sends no bar for a phrase of one bar or for a line that is not in a phrase", () => {
    const placed: ReadonlyArray<LyricLine> = [{ text: "一二三四", phrase: { firstBar: 1, barCount: 1 } }];
    const waiting: ReadonlyArray<LyricLine> = [{ text: "一二三四", phrase: null }];

    expect(lyricSplitCommand(quarters, placed, { line: 0, offset: 2 })).toEqual({
      type: "splitLyricLine",
      line: 0,
      offset: 2,
    });
    expect(lyricSplitCommand(quarters, waiting, { line: 0, offset: 2 })).toEqual({
      type: "splitLyricLine",
      line: 0,
      offset: 2,
    });
  });

  it("has no command for a line that is not there", () => {
    expect(lyricSplitCommand(quarters, [], { line: 0, offset: 1 })).toBeNull();
  });
});

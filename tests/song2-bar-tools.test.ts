// ABOUTME: Seam 1 for the three bar tools with the song2 dialect: bar-by-bar comparison, fragment extraction and adopting bars.
// ABOUTME: Every case states hand-written scores and lyric lines; the expected bars and facts are written out by hand, not rerun from the code.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { compareBars, type LyricLine, type SongProject } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";
import { UNREADABLE_SCORE } from "./scores";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."`;

/** Six bars: Intro (0-based indices 0-1) and Verse (indices 2-5). Ins rests under the Verse. */
const SIX = `${HEADER}
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
Z4|`;

function project(score: string, lines?: ReadonlyArray<LyricLine>): SongProject {
  return {
    style: "pop",
    lyrics: "",
    score,
    scoreMode: "full",
    seed: 7,
    modelId: "song2",
    sourceKey: "bar-tools-test",
    ...(lines === undefined ? {} : { lyricLines: lines }),
  };
}

function compared(current: SongProject, other: SongProject): number[] {
  const result = compareBars(song2Dialect, current, other);
  if (!result.ok) throw new Error(`expected both scores to read: ${JSON.stringify(result.diagnostics)}`);
  return [...result.bars];
}

describe("compareBars", () => {
  it("returns no bars for the same score", () => {
    expect(compared(project(SIX), project(SIX))).toEqual([]);
  });

  it("names the bar whose notes changed, by its 0-based index", () => {
    const other = SIX.replace("E16|F16|G16|A16|", "E16|F8G8|G16|A16|");

    expect(compared(project(SIX), project(other))).toEqual([3]);
  });

  it("names the bar whose chord changed", () => {
    const other = SIX.replace("E16|F16|G16|A16|", '"Am"E16|F16|G16|A16|');

    expect(compared(project(SIX), project(other))).toEqual([2]);
  });

  it("names every bar of a section whose name changed", () => {
    const other = SIX.replace("% Verse", "% Refrain");

    expect(compared(project(SIX), project(other))).toEqual([2, 3, 4, 5]);
  });

  it("compares a lyric line by the bars it covers", () => {
    const lines = [{ text: "la", phrase: { firstBar: 2, barCount: 1 } }];

    expect(compared(project(SIX, lines), project(SIX, lines))).toEqual([]);
    expect(compared(project(SIX, lines), project(SIX, [{ text: "lo", phrase: { firstBar: 2, barCount: 1 } }]))).toEqual(
      [2],
    );
    expect(compared(project(SIX, lines), project(SIX, [{ text: "la", phrase: { firstBar: 3, barCount: 1 } }]))).toEqual(
      [2, 3],
    );
  });

  it("reads the same score with CRLF line endings as the same score", () => {
    expect(compared(project(SIX), project(SIX.replace(/\n/g, "\r\n")))).toEqual([]);
  });

  it("names a bar that only one of the two scores has", () => {
    const longer = `${SIX}
% Coda
V: Vocal
B16|
V: Ins
z16|`;

    expect(compared(project(SIX), project(longer))).toEqual([6]);
    expect(compared(project(longer), project(SIX))).toEqual([6]);
  });

  it("refuses a score that cannot be read, with the reading diagnostics", () => {
    const result = compareBars(song2Dialect, project(SIX), project(UNREADABLE_SCORE));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

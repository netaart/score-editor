// ABOUTME: Seam 1 for the three bar tools with the song2 dialect: bar-by-bar comparison, fragment extraction and adopting bars.
// ABOUTME: Every case states hand-written scores and lyric lines; the expected bars and facts are written out by hand, not rerun from the code.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  applyProjectCommand,
  compareBars,
  createDialectRegistry,
  createEditingSession,
  extractFragment,
  type LyricLine,
  type Score,
  type SongProject,
} from "@neta-art/score-editor";
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

function readScore(text: string): Score {
  const read = song2Dialect.parse(text);
  if (read.score === null) throw new Error(`expected the text to read: ${JSON.stringify(read.diagnostics)}`);
  return read.score;
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

/** The same score with a key change to G at the start of the Verse, written in both voices. */
const KEY_G = `${HEADER}
K:C
% Intro
V: Vocal
C16|D16|
V: Ins
Z2|
% Verse
V: Vocal
K:G
E16|F16|G16|A16|
V: Ins
K:G
Z4|`;

/** One voice ending in a partial measure: bar 0 is whole, bar 1 is the cut. */
const CUT = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
% a
V: Vocal
C16|D8`;

describe("extractFragment", () => {
  it("takes whole bars as a score of their own, with the header kept and the section marker at its start", () => {
    const result = extractFragment(song2Dialect, project(SIX), { from: 2, count: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.score.split("\n").slice(0, 8)).toEqual(SIX.split("\n").slice(0, 8));
    const score = readScore(result.project.score);
    expect(score.bars.length).toBe(2);
    expect(score.sections.map((section) => [section.name, section.firstBar, section.barCount])).toEqual([
      ["Verse", 0, 2],
    ]);
    expect(
      score.notes.filter((note) => note.voice === "Vocal").map((note) => [note.bar, note.start, note.midi]),
    ).toEqual([
      [0, 0, 64],
      [1, 1024, 65],
    ]);
    expect(score.notes.filter((note) => note.voice === "Ins").map((note) => [note.bar, note.midi])).toEqual([
      [0, null],
      [1, null],
    ]);
    expect(song2Dialect.check(score)).toEqual([]);
    expect(result.project).toMatchObject({ style: "pop", scoreMode: "full", seed: 7, modelId: "song2" });
  });

  it("keeps the lyric lines bound to its bars, clipped to them, and leaves the unbound ones out", () => {
    const lines: LyricLine[] = [
      { text: "one", phrase: { firstBar: 0, barCount: 1 } },
      { text: "two", phrase: { firstBar: 2, barCount: 2 } },
      { text: "three", phrase: { firstBar: 3, barCount: 2 } },
      { text: "four", phrase: null },
    ];
    const result = extractFragment(song2Dialect, project(SIX, lines), { from: 2, count: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.lyricLines).toEqual([
      { text: "two", phrase: { firstBar: 0, barCount: 2 } },
      { text: "three", phrase: { firstBar: 1, barCount: 1 } },
    ]);
    expect(result.project.lyrics).toBe("[Verse]\ntwo\nthree");
  });

  it("states the fragment's own starting key when it differs from the header's", () => {
    const result = extractFragment(song2Dialect, project(KEY_G), { from: 2, count: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.score.split("\n")).toContain("K:G");
    const score = readScore(result.project.score);
    expect(score.keys).toEqual([{ at: 0, key: "G" }]);
    expect(score.bars.map((bar) => bar.key)).toEqual(["G", "G"]);
    expect(song2Dialect.check(score)).toEqual([]);
  });

  it("takes a range that ends before the cut, and refuses one that reaches the cut", () => {
    const whole = extractFragment(song2Dialect, project(CUT), { from: 0, count: 1 });
    expect(whole.ok).toBe(true);

    const reaching = extractFragment(song2Dialect, project(CUT), { from: 0, count: 2 });
    expect(reaching.ok).toBe(false);
    if (reaching.ok) return;
    expect(reaching.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["truncated-tail"]);
  });

  it("cuts a tie that runs out of the range at its edge, so the fragment stands on its own", () => {
    const tied = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
% a
V: Vocal
C16-|C16|D16|`;
    const result = extractFragment(song2Dialect, project(tied), { from: 0, count: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const score = readScore(result.project.score);
    expect(score.notes.map((note) => [note.bar, note.midi, note.tie])).toEqual([[0, 60, false]]);
    expect(song2Dialect.check(score)).toEqual([]);
  });

  it("refuses a range outside the score, or one with no bars", () => {
    for (const range of [
      { from: 5, count: 2 },
      { from: -1, count: 1 },
      { from: 0, count: 0 },
    ]) {
      const result = extractFragment(song2Dialect, project(SIX), range);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["bar-out-of-range"]);
    }
  });
});

/** The same bars 2-3 written differently: the Verse opens on A and B. */
const OTHER_VERSE = `${HEADER}
K:C
% Intro
V: Vocal
C16|D16|
V: Ins
Z2|
% Verse
V: Vocal
A16|B16|G16|A16|
V: Ins
Z4|`;

/** Six bars with a Chorus of two bars after the Verse. */
const OTHER_CHORUS = `${SIX}
% Chorus
V: Vocal
B16|c16|
V: Ins
Z2|`;

/** A Chorus that starts inside the Verse: bars 3-5 are the Chorus, bar 2 is the Verse. */
const OTHER_CHORUS_IN_VERSE = `${HEADER}
K:C
% Intro
V: Vocal
C16|D16|
V: Ins
Z2|
% Verse
V: Vocal
E16|
V: Ins
z16|
% Chorus
V: Vocal
F16|G16|A16|
V: Ins
Z3|`;

/** The Verse in 2/4 bars: the bars after the Intro are 2/4, the Verse's second line carries the meter on. */
const OTHER_METER = `${HEADER}
K:C
% Intro
V: Vocal
C16|D16|
V: Ins
Z2|
% Verse
V: Vocal
M:2/4
E8-|E8|F8-|F8|
V: Ins
M:2/4
z8|z8|z8|z8|
V: Vocal
G8-|G8|A8-|A8|
V: Ins
z8|z8|z8|z8|`;

/** A score with no section markers: its bars are all in the unnamed opening section. */
const UNNAMED = `${HEADER}
K:C
V: Vocal
C16|D16|E16|F16|
V: Ins
Z4|`;

/** The Verse whose first bar is tied into the bar after it. */
const TIED_VERSE = `${HEADER}
K:C
% Intro
V: Vocal
C16|D16|
V: Ins
Z2|
% Verse
V: Vocal
E16-|E16|F16|G16|
V: Ins
Z4|`;

function vocalMidi(score: Score): Array<number | null> {
  return score.notes.filter((note) => note.voice === "Vocal").map((note) => note.midi);
}

describe("adoptBars", () => {
  const dialects = createDialectRegistry([song2Dialect]);

  it("adopts a run of bars in place of the same bars, as one undoable step, and leaves the other bars and lines alone", () => {
    const lines = [
      { text: "one", phrase: { firstBar: 0, barCount: 1 } },
      { text: "two", phrase: { firstBar: 2, barCount: 2 } },
    ];
    const session = createEditingSession({ project: project(SIX, lines), dialects });
    const before = session.project;

    const result = session.dispatch({ type: "adoptBars", other: OTHER_VERSE, bar: 2, count: 2 });

    expect(result.ok).toBe(true);
    const score = readScore(session.project.score);
    expect(vocalMidi(score)).toEqual([60, 62, 69, 71, 67, 69]);
    expect(song2Dialect.check(score)).toEqual([]);
    expect(session.project.lyricLines).toEqual(lines);
    expect(session.canUndo).toBe(true);
    session.undo();
    expect(session.project).toBe(before);
    session.redo();
    expect(readScore(session.project.score).notes.filter((note) => note.voice === "Vocal").length).toBe(6);
  });

  it("appends bars past the end of the score, with the other score's section for them", () => {
    const result = applyProjectCommand(song2Dialect, project(SIX), {
      type: "adoptBars",
      other: OTHER_CHORUS,
      bar: 6,
      count: 2,
    });

    expect(result.diagnostics).toEqual([]);
    const score = readScore(result.project.score);
    expect(score.sections.map((section) => [section.name, section.firstBar, section.barCount])).toEqual([
      ["Intro", 0, 2],
      ["Verse", 2, 4],
      ["Chorus", 6, 2],
    ]);
    expect(vocalMidi(score)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it("keeps the other score's section marker where an adopted run starts one, and the Verse after it", () => {
    const result = applyProjectCommand(song2Dialect, project(SIX), {
      type: "adoptBars",
      other: OTHER_CHORUS_IN_VERSE,
      bar: 3,
      count: 2,
    });

    expect(result.diagnostics).toEqual([]);
    const score = readScore(result.project.score);
    expect(score.sections.map((section) => [section.name, section.firstBar, section.barCount])).toEqual([
      ["Intro", 0, 2],
      ["Verse", 2, 1],
      ["Chorus", 3, 2],
      ["Verse", 5, 1],
    ]);
    expect(vocalMidi(score)).toEqual([60, 62, 64, 65, 67, 69]);
    expect(song2Dialect.check(score)).toEqual([]);
  });

  it("adopts a meter change and keeps the meter of the bars after it", () => {
    const result = applyProjectCommand(song2Dialect, project(SIX), {
      type: "adoptBars",
      other: OTHER_METER,
      bar: 2,
      count: 2,
    });

    expect(result.diagnostics).toEqual([]);
    const score = readScore(result.project.score);
    expect(score.bars.map((bar) => `${bar.meter.numerator}/${bar.meter.denominator}`)).toEqual([
      "4/4",
      "4/4",
      "2/4",
      "2/4",
      "4/4",
      "4/4",
    ]);
    expect(vocalMidi(score)).toEqual([60, 62, 64, 64, 67, 69]);
    expect(song2Dialect.check(score)).toEqual([]);
  });

  it("states the key of the adopted bars and returns to the score's key after them", () => {
    const result = applyProjectCommand(song2Dialect, project(SIX), {
      type: "adoptBars",
      other: KEY_G,
      bar: 2,
      count: 2,
    });

    expect(result.diagnostics).toEqual([]);
    const score = readScore(result.project.score);
    expect(score.bars.map((bar) => bar.key)).toEqual(["C", "C", "G", "G", "C", "C"]);
    expect(song2Dialect.check(score)).toEqual([]);
  });

  it("cuts a tie that leaves the adopted run at its end, since the other score's next bar is not adopted", () => {
    const result = applyProjectCommand(song2Dialect, project(SIX), {
      type: "adoptBars",
      other: TIED_VERSE,
      bar: 2,
      count: 1,
    });

    expect(result.diagnostics).toEqual([]);
    const score = readScore(result.project.score);
    const adopted = score.notes.filter((note) => note.voice === "Vocal" && note.bar === 2);
    expect(adopted.map((note) => note.tie)).toEqual([false]);
    expect(song2Dialect.check(score)).toEqual([]);
  });

  it("refuses a run the other score does not have, and leaves the score and its history unchanged", () => {
    const session = createEditingSession({ project: project(SIX), dialects });
    const before = session.project;

    const result = session.dispatch({ type: "adoptBars", other: OTHER_VERSE, bar: 5, count: 3 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["bar-out-of-range"]);
    expect(session.project).toBe(before);
    expect(session.canUndo).toBe(false);
  });

  it("refuses a run that starts past the end of the score", () => {
    const result = applyProjectCommand(song2Dialect, project(SIX), {
      type: "adoptBars",
      other: OTHER_CHORUS,
      bar: 7,
      count: 1,
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["bar-out-of-range"]);
    expect(result.project.score).toBe(SIX);
  });

  it("refuses a run that reaches the score's cut", () => {
    const result = applyProjectCommand(song2Dialect, project(CUT), {
      type: "adoptBars",
      other: SIX,
      bar: 1,
      count: 1,
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["truncated-tail"]);
    expect(result.project.score).toBe(CUT);
  });

  it("refuses a result the dialect cannot write, and leaves the score unchanged", () => {
    const result = applyProjectCommand(song2Dialect, project(SIX), {
      type: "adoptBars",
      other: UNNAMED,
      bar: 2,
      count: 1,
    });

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.project.score).toBe(SIX);
  });

  it("refuses another score that cannot be read, with its reading diagnostics", () => {
    const result = applyProjectCommand(song2Dialect, project(SIX), {
      type: "adoptBars",
      other: UNREADABLE_SCORE,
      bar: 0,
      count: 1,
    });

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.project.score).toBe(SIX);
  });
});

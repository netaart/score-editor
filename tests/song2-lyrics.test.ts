// ABOUTME: Seam 1 for lyric lines: syllables, note onsets, alignment, the legacy layout, the joined text and bar remapping.
// ABOUTME: Expected values are worked by hand from the spec; every case goes through the two package entries.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  alignedLyricLines,
  alignLyricLine,
  applyProjectCommand,
  applyScoreCommand,
  checkProject,
  joinLyrics,
  LYRICS_MAX_CHARACTERS,
  type LyricLine,
  layoutLyrics,
  lyricCharacterCount,
  lyricLinesOf,
  lyricSyllables,
  noteOnsets,
  type Score,
  type ScoreCommand,
  type SongProject,
  syllableCount,
  unalignedLyricLines,
} from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const HEADER = `X:1
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

const SCORE = `${HEADER}
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

const TWO_FOUR_SCORE = `X:1
T:
M:2/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% Intro
V: Vocal
C8|D8|
V: Ins
Z2|
% Verse
V: Vocal
E8|F8|G8|A8|
V: Ins
Z4|
% Chorus
V: Vocal
B8|c8|
V: Ins
Z2|`;

const UNNAMED_SCORE = `${HEADER}
K:C
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

const TIE_SCORE = `${HEADER}
K:C
% A
V: Vocal
C8-C8|D8E8|
V: Ins
Z2|`;

const CROSS_BAR_TIE = `${HEADER}
K:C
% A
V: Vocal
C8-C8-|C8D8|
V: Ins
Z2|`;

const CUT_SCORE = `${ONE_VOICE}
K:C
% A
V: Vocal
C16|D16|
% B
V: Vocal
E8`;

function parse(text: string): Score {
  const { score, diagnostics } = song2Dialect.parse(text);
  expect(diagnostics).toEqual([]);
  if (score === null) throw new Error("the score did not read");
  return score;
}

function project(overrides: Partial<SongProject> = {}): SongProject {
  return {
    style: "pop",
    lyrics: "",
    score: SCORE,
    scoreMode: "full",
    seed: 7,
    modelId: "song2",
    sourceKey: "source",
    ...overrides,
  };
}

function withLines(lines: ReadonlyArray<LyricLine>, overrides: Partial<SongProject> = {}): SongProject {
  return project({ score: SCORE, lyricLines: lines, lyrics: joinLyrics(parse(SCORE), lines), ...overrides });
}

function apply(input: SongProject, command: ScoreCommand): SongProject {
  const result = applyProjectCommand(song2Dialect, input, command);
  expect(result.diagnostics, command.type).toEqual([]);
  return result.project;
}

const LINES: ReadonlyArray<LyricLine> = [
  { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
  { text: "verse one", phrase: { firstBar: 2, barCount: 2 } },
  { text: "verse two", phrase: { firstBar: 4, barCount: 2 } },
  { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
];

const JOINED = `[Intro]
intro line
[Verse]
verse one
verse two
[Chorus]
chorus`;

const LEGACY_LYRICS = `[Intro]
intro line
[Verse]
v1
v2
v3
v4
[Chorus]
c1
c2`;

describe("syllables", () => {
  it("counts Han characters and kana one each", () => {
    expect(syllableCount("你好世界")).toBe(4);
    expect(syllableCount("こんにちは")).toBe(5);
    expect(syllableCount("カタカナ")).toBe(4);
  });

  it("counts an English word by vowel groups, with a manual hyphen split", () => {
    expect(syllableCount("hello world")).toBe(3);
    expect(syllableCount("beautiful")).toBe(3);
    expect(syllableCount("hel-lo")).toBe(2);
    expect(syllableCount("yellow")).toBe(2);
    expect(syllableCount("happy")).toBe(2);
    expect(syllableCount("rhythm")).toBe(1);
    expect(lyricSyllables("hello")).toEqual(["hel", "lo"]);
    expect(lyricSyllables("hel-lo")).toEqual(["hel", "lo"]);
  });

  it("does not sing spaces or punctuation and counts digits one by one", () => {
    expect(syllableCount("你好，世界！")).toBe(4);
    expect(syllableCount("Hi, 2024!")).toBe(5);
    expect(syllableCount("   ")).toBe(0);
    expect(syllableCount("...")).toBe(0);
  });
});

describe("note onsets and alignment", () => {
  it("counts Vocal notes that are not rests and not tied from the note before", () => {
    const score = parse(TIE_SCORE);
    expect(noteOnsets(score, { firstBar: 0, barCount: 1 }).map((note) => note.start)).toEqual([0]);
    expect(noteOnsets(score, { firstBar: 1, barCount: 1 }).map((note) => note.start)).toEqual([1024, 1536]);
    expect(noteOnsets(score, { firstBar: 0, barCount: 2 }).map((note) => note.start)).toEqual([0, 1024, 1536]);
  });

  it("excludes a continuation tied in from the bar before the phrase", () => {
    const score = parse(CROSS_BAR_TIE);
    expect(noteOnsets(score, { firstBar: 1, barCount: 1 }).map((note) => note.start)).toEqual([1536]);
  });

  it("gives each syllable its note when the counts are equal, and no notes when they are not", () => {
    const score = parse(TIE_SCORE);
    const equal = alignLyricLine(score, { text: "一 二 三", phrase: { firstBar: 0, barCount: 2 } });
    expect(equal.syllables).toEqual(["一", "二", "三"]);
    expect(equal.equal).toBe(true);
    expect(equal.notes?.map((entry) => [entry.syllable, entry.note.start])).toEqual([
      ["一", 0],
      ["二", 1024],
      ["三", 1536],
    ]);

    const unequal = alignLyricLine(score, { text: "一二", phrase: { firstBar: 0, barCount: 2 } });
    expect(unequal.equal).toBe(false);
    expect(unequal.notes).toBeNull();
    expect(unequal.onsets).toHaveLength(3);
  });

  it("gives an unaligned line no onsets and an unequal count", () => {
    const alignment = alignLyricLine(parse(TIE_SCORE), { text: "一二", phrase: null });
    expect(alignment.onsets).toEqual([]);
    expect(alignment.equal).toBe(false);
  });
});

describe("the legacy layout", () => {
  it("puts one line per bar into the matching section and the rest in the unaligned area", () => {
    const score = parse(SCORE);
    const lines = layoutLyrics(score, "[Verse]\nv1\nv2\nv3\nv4\nv5\n[Chorus]\nc1\n[Missing]\nm1\nm2");

    expect(lines.slice(0, 5)).toEqual([
      { text: "v1", phrase: { firstBar: 2, barCount: 1 } },
      { text: "v2", phrase: { firstBar: 3, barCount: 1 } },
      { text: "v3", phrase: { firstBar: 4, barCount: 1 } },
      { text: "v4", phrase: { firstBar: 5, barCount: 1 } },
      { text: "c1", phrase: { firstBar: 6, barCount: 1 } },
    ]);
    expect(unalignedLyricLines(lines, score).map((line) => line.text)).toEqual(["v5", "m1", "m2"]);
    expect(lines.filter((line) => line.phrase?.firstBar === 0 || line.phrase?.firstBar === 1)).toEqual([]);
  });

  it("puts lines before the first label in the unnamed opening section, and skips empty lines", () => {
    const lines = layoutLyrics(parse(UNNAMED_SCORE), "pre\n[Verse]\n\nv1\nv2");

    expect(lines).toEqual([
      { text: "pre", phrase: { firstBar: 0, barCount: 1 } },
      { text: "v1", phrase: { firstBar: 2, barCount: 1 } },
      { text: "v2", phrase: { firstBar: 3, barCount: 1 } },
    ]);
  });

  it("puts lines before the first label in the first section when there is no unnamed opening section", () => {
    const lines = layoutLyrics(parse(SCORE), "pre\n[Verse]\nv1");
    expect(lines).toEqual([
      { text: "pre", phrase: { firstBar: 0, barCount: 1 } },
      { text: "v1", phrase: { firstBar: 2, barCount: 1 } },
    ]);
  });

  it("matches each repeated label to the next unused section with that name", () => {
    const text = `${HEADER}
K:C
% Verse
V: Vocal
C16|D16|
V: Ins
Z2|
% Verse
V: Vocal
E16|F16|
V: Ins
Z2|`;
    const lines = layoutLyrics(parse(text), "[Verse]\na\n[Verse]\nb");
    expect(lines).toEqual([
      { text: "a", phrase: { firstBar: 0, barCount: 1 } },
      { text: "b", phrase: { firstBar: 2, barCount: 1 } },
    ]);
  });

  it("computes the layout without writing it into the project", () => {
    const input = project({ lyrics: "[Verse]\nv1" });
    const before = JSON.stringify(input);
    const lines = lyricLinesOf(input, parse(input.score));
    expect(lines).toEqual([{ text: "v1", phrase: { firstBar: 2, barCount: 1 } }]);
    expect(JSON.stringify(input)).toBe(before);
    expect("lyricLines" in input).toBe(false);
  });
});

describe("joining the lyrics text", () => {
  it("writes section labels in section order, leaving the unnamed section unlabelled", () => {
    expect(joinLyrics(parse(SCORE), LINES)).toBe(JOINED);
    expect(
      joinLyrics(parse(UNNAMED_SCORE), [
        { text: "pre", phrase: { firstBar: 0, barCount: 1 } },
        { text: "v1", phrase: { firstBar: 2, barCount: 1 } },
      ]),
    ).toBe("pre\n[Verse]\nv1\n[Chorus]");
  });

  it("keeps a named empty section's label and leaves the unaligned lines out", () => {
    const score = parse(SCORE);
    const lines: LyricLine[] = [
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
      { text: "loose", phrase: null },
    ];
    expect(joinLyrics(score, lines)).toBe("[Intro]\n[Verse]\n[Chorus]\nchorus");
    expect(alignedLyricLines(lines, score).map((line) => line.text)).toEqual(["chorus"]);
    expect(unalignedLyricLines(lines, score).map((line) => line.text)).toEqual(["loose"]);
  });

  it("counts characters as Unicode code points, line breaks included", () => {
    expect(lyricCharacterCount("你好")).toBe(2);
    expect(lyricCharacterCount("a\nb")).toBe(3);
    expect(lyricCharacterCount("😀")).toBe(1);
    expect(LYRICS_MAX_CHARACTERS).toBe(2000);
  });

  it("reports unaligned lines and a joined text over 2,000 characters as notices", () => {
    const oneLineScore = `${ONE_VOICE}
K:C
V: Vocal
C16|`;
    expect(checkProject(song2Dialect, project({ score: oneLineScore, lyrics: "字".repeat(2000) }))).toEqual([]);
    const tooLong = checkProject(song2Dialect, project({ score: oneLineScore, lyrics: "字".repeat(2001) }));
    expect(tooLong.map((diagnostic) => diagnostic.code)).toEqual(["lyrics-too-long"]);
    expect(tooLong[0]?.params).toEqual({ count: 2001, max: 2000 });

    const unaligned = checkProject(song2Dialect, project({ lyrics: "[Missing]\nloose" }));
    expect(unaligned.map((diagnostic) => diagnostic.code)).toEqual(["lyrics-unaligned"]);
    expect(unaligned[0]?.params).toEqual({ count: 1 });
  });

  it("hands stored lines to checkProject instead of laying the legacy text out again", () => {
    const input = withLines([{ text: "loose", phrase: null }], { lyrics: "not the joined text" });
    expect(checkProject(song2Dialect, input).map((diagnostic) => diagnostic.code)).toEqual(["lyrics-unaligned"]);
  });
});

describe("bar commands carry stored lines", () => {
  it("spans an inserted bar inside a phrase and shifts the phrase after it", () => {
    const result = apply(withLines(LINES), { type: "insertBar", bar: 3 });
    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 3 } },
      { text: "verse two", phrase: { firstBar: 5, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 7, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(JOINED);
  });

  it("keeps a stored lyrics text that differs from the join byte for byte on a command that changes no line", () => {
    const lines: LyricLine[] = [{ text: "verse one", phrase: { firstBar: 2, barCount: 2 } }];
    const stale = "[Verse]\na text the join would not write\n[Chorus]";
    const result = apply(project({ lyricLines: lines, lyrics: stale }), { type: "transpose", semitones: 1 });
    expect(result.lyricLines).toEqual(lines);
    expect(result.lyrics).toBe(stale);
  });

  it("closes a phrase over a deleted bar and drops a phrase that loses all its bars", () => {
    const one = apply(withLines(LINES), { type: "deleteBars", from: 3, count: 1 });
    expect(one.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 1 } },
      { text: "verse two", phrase: { firstBar: 3, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 5, barCount: 2 } },
    ]);

    const whole = apply(withLines(LINES), { type: "deleteBars", from: 2, count: 2 });
    expect(whole.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse two", phrase: { firstBar: 2, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 4, barCount: 2 } },
    ]);
  });

  it("keeps lines through a filled cut and drops the cut bar's line on delete", () => {
    const cut = parse(CUT_SCORE);
    const lines: LyricLine[] = [
      { text: "complete", phrase: { firstBar: 0, barCount: 2 } },
      { text: "cut", phrase: { firstBar: 2, barCount: 1 } },
    ];
    const input = project({ score: CUT_SCORE, lyricLines: lines, lyrics: joinLyrics(cut, lines) });

    const filled = apply(input, { type: "fillTruncatedBar" });
    expect(filled.lyricLines).toEqual(lines);
    expect(filled.lyrics).toBe("[A]\ncomplete\n[B]\ncut");

    const deleted = apply(input, { type: "deleteTruncatedBar" });
    expect(deleted.lyricLines).toEqual([{ text: "complete", phrase: { firstBar: 0, barCount: 2 } }]);
    expect(deleted.lyrics).toBe("[A]\ncomplete");
  });

  it("keeps a phrase's whole tick span when a shorter meter expands its bars", () => {
    const result = apply(withLines(LINES), {
      type: "setSectionMeter",
      section: 1,
      meter: { numerator: 2, denominator: 4 },
    });
    const lines = result.lyricLines ?? [];
    expect(lines[0]).toEqual({ text: "intro line", phrase: { firstBar: 0, barCount: 1 } });
    expect(lines[1]).toEqual({ text: "verse one", phrase: { firstBar: 2, barCount: 4 } });
    expect(lines[2]).toEqual({ text: "verse two", phrase: { firstBar: 6, barCount: 4 } });
    expect(lines[3]).toEqual({ text: "chorus", phrase: { firstBar: 10, barCount: 2 } });
  });

  it("closes two old bars into one new bar when a longer meter shrinks the section", () => {
    const before = parse(TWO_FOUR_SCORE);
    const lines: LyricLine[] = [
      { text: "compact", phrase: { firstBar: 2, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ];
    const result = apply(project({ score: TWO_FOUR_SCORE, lyricLines: lines, lyrics: joinLyrics(before, lines) }), {
      type: "setSectionMeter",
      section: 1,
      meter: { numerator: 4, denominator: 4 },
    });
    expect(result.lyricLines).toEqual([
      { text: "compact", phrase: { firstBar: 2, barCount: 1 } },
      { text: "chorus", phrase: { firstBar: 4, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe("[Intro]\n[Verse]\ncompact\n[Chorus]\nchorus");
  });
});

describe("section commands carry stored lines", () => {
  it("deletes a section's lines with it", () => {
    const result = apply(withLines(LINES), { type: "deleteSection", section: 1 });
    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "chorus", phrase: { firstBar: 2, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe("[Intro]\nintro line\n[Chorus]\nchorus");
  });

  it("copies a section's lines onto the copy's bars", () => {
    const result = apply(withLines(LINES), { type: "duplicateSection", section: 1 });
    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 2 } },
      { text: "verse two", phrase: { firstBar: 4, barCount: 2 } },
      { text: "verse one", phrase: { firstBar: 6, barCount: 2 } },
      { text: "verse two", phrase: { firstBar: 8, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 10, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
verse one
verse two
[Verse]
verse one
verse two
[Chorus]
chorus`);
  });

  it("moves a section's lines with it", () => {
    const result = apply(withLines(LINES), { type: "moveSection", section: 1, direction: "later" });
    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "chorus", phrase: { firstBar: 2, barCount: 2 } },
      { text: "verse one", phrase: { firstBar: 4, barCount: 2 } },
      { text: "verse two", phrase: { firstBar: 6, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Chorus]
chorus
[Verse]
verse one
verse two`);
  });

  it("keeps lines wholly on their side of a new section marker", () => {
    const renamed = apply(withLines(LINES), { type: "renameSection", section: 1, name: "Hook" });
    expect(renamed.lyricLines).toEqual(LINES);
    expect(renamed.lyrics).toBe(JOINED.replace("[Verse]", "[Hook]"));

    const split = apply(withLines(LINES), { type: "nameSection", bar: 4, name: "Bridge" });
    expect(split.lyricLines).toEqual(LINES);
    expect(split.lyrics).toBe(`[Intro]
intro line
[Verse]
verse one
[Bridge]
verse two
[Chorus]
chorus`);
  });

  it("keeps a phrase that spans a new marker in the section of its first bar", () => {
    const input = withLines([{ text: "long verse", phrase: { firstBar: 2, barCount: 4 } }]);
    const result = apply(input, { type: "nameSection", bar: 4, name: "Bridge" });
    expect(result.lyricLines).toEqual([{ text: "long verse", phrase: { firstBar: 2, barCount: 2 } }]);
    expect(result.lyrics).toBe(`[Intro]
[Verse]
long verse
[Bridge]
[Chorus]`);
  });
});

describe("a project without stored lyric lines", () => {
  function legacy(score = SCORE, lyrics = LEGACY_LYRICS): SongProject {
    return project({ score, lyrics });
  }

  it("deletes a section's old-song lines with it", () => {
    const result = apply(legacy(), { type: "deleteSection", section: 1 });
    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "c1", phrase: { firstBar: 2, barCount: 1 } },
      { text: "c2", phrase: { firstBar: 3, barCount: 1 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Chorus]
c1
c2`);
  });

  it("copies a section's old-song lines onto the copy's bars", () => {
    const result = apply(legacy(), { type: "duplicateSection", section: 1 });
    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "v1", phrase: { firstBar: 2, barCount: 1 } },
      { text: "v2", phrase: { firstBar: 3, barCount: 1 } },
      { text: "v3", phrase: { firstBar: 4, barCount: 1 } },
      { text: "v4", phrase: { firstBar: 5, barCount: 1 } },
      { text: "v1", phrase: { firstBar: 6, barCount: 1 } },
      { text: "v2", phrase: { firstBar: 7, barCount: 1 } },
      { text: "v3", phrase: { firstBar: 8, barCount: 1 } },
      { text: "v4", phrase: { firstBar: 9, barCount: 1 } },
      { text: "c1", phrase: { firstBar: 10, barCount: 1 } },
      { text: "c2", phrase: { firstBar: 11, barCount: 1 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
v1
v2
v3
v4
[Verse]
v1
v2
v3
v4
[Chorus]
c1
c2`);
  });

  it("moves a section's old-song lines with it", () => {
    const result = apply(legacy(), { type: "moveSection", section: 1, direction: "later" });
    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "c1", phrase: { firstBar: 2, barCount: 1 } },
      { text: "c2", phrase: { firstBar: 3, barCount: 1 } },
      { text: "v1", phrase: { firstBar: 4, barCount: 1 } },
      { text: "v2", phrase: { firstBar: 5, barCount: 1 } },
      { text: "v3", phrase: { firstBar: 6, barCount: 1 } },
      { text: "v4", phrase: { firstBar: 7, barCount: 1 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Chorus]
c1
c2
[Verse]
v1
v2
v3
v4`);
  });

  it("shifts old-song lines after an inserted bar", () => {
    const result = apply(legacy(), { type: "insertBar", bar: 3 });
    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "v1", phrase: { firstBar: 2, barCount: 1 } },
      { text: "v2", phrase: { firstBar: 4, barCount: 1 } },
      { text: "v3", phrase: { firstBar: 5, barCount: 1 } },
      { text: "v4", phrase: { firstBar: 6, barCount: 1 } },
      { text: "c1", phrase: { firstBar: 7, barCount: 1 } },
      { text: "c2", phrase: { firstBar: 8, barCount: 1 } },
    ]);
    expect(result.lyrics).toBe(LEGACY_LYRICS);
  });

  it("drops an old-song line whose bar is deleted and shifts the rest", () => {
    const result = apply(legacy(), { type: "deleteBars", from: 3, count: 1 });
    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "v1", phrase: { firstBar: 2, barCount: 1 } },
      { text: "v3", phrase: { firstBar: 3, barCount: 1 } },
      { text: "v4", phrase: { firstBar: 4, barCount: 1 } },
      { text: "c1", phrase: { firstBar: 5, barCount: 1 } },
      { text: "c2", phrase: { firstBar: 6, barCount: 1 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
v1
v3
v4
[Chorus]
c1
c2`);
  });

  it("leaves an old song that stores no lines untouched by a command that changes no line", () => {
    const input = legacy();
    const result = apply(input, { type: "transpose", semitones: 1 });
    expect("lyricLines" in result).toBe(false);
    expect(result.lyrics).toBe(input.lyrics);
  });

  it("applies every score command type to a 0.1.0-shaped project with no lyric field or lyrics rewrite", () => {
    const cases: ReadonlyArray<readonly [ScoreCommand, string?]> = [
      [{ type: "toRest", noteId: "Vocal:0" }],
      [{ type: "toRests", noteIds: ["Vocal:0"] }],
      [{ type: "setChord", noteId: "Vocal:0", name: "C" }],
      [{ type: "insertBar", bar: 3 }],
      [{ type: "deleteBars", from: 3, count: 1 }],
      [{ type: "setSectionMeter", section: 1, meter: { numerator: 2, denominator: 4 } }],
      [{ type: "fillTruncatedBar" }, CUT_SCORE],
      [{ type: "deleteTruncatedBar" }, CUT_SCORE],
      [{ type: "transpose", semitones: 1 }],
      [{ type: "setKey", key: "G" }],
      [{ type: "setTempo", bpm: 140 }],
      [{ type: "removeChords" }],
      [{ type: "deleteSection", section: 1 }],
      [{ type: "duplicateSection", section: 1 }],
      [{ type: "moveSection", section: 1, direction: "later" }],
      [{ type: "renameSection", section: 1, name: "Hook" }],
      [{ type: "nameSection", bar: 4, name: "Bridge" }],
    ];

    for (const [command, score] of cases) {
      const input = project({ score: score ?? SCORE, lyrics: "", style: "120 BPM" });
      const result = applyProjectCommand(song2Dialect, input, command);
      expect(result.diagnostics, command.type).toEqual([]);
      expect("lyricLines" in result.project, command.type).toBe(false);
      expect(result.project.lyrics, command.type).toBe("");
    }
  });
});

describe("stored lines on every sample", () => {
  const directory = new URL("../packages/score-dialect-song2/tests/", import.meta.url);
  const facts = JSON.parse(readFileSync(new URL("samples.json", directory), "utf8")) as Array<{ file: string }>;

  function validLines(score: Score, lines: ReadonlyArray<LyricLine>): void {
    for (const line of alignedLyricLines(lines, score)) {
      const phrase = line.phrase as LyricLine["phrase"];
      if (phrase === null) continue;
      expect(phrase.barCount, line.text).toBeGreaterThan(0);
      expect(phrase.firstBar, line.text).toBeGreaterThanOrEqual(0);
      expect(phrase.firstBar + phrase.barCount, line.text).toBeLessThanOrEqual(score.bars.length);
      const section = score.sections.find(
        (candidate) =>
          phrase.firstBar >= candidate.firstBar && phrase.firstBar < candidate.firstBar + candidate.barCount,
      );
      expect(section, line.text).toBeDefined();
      if (section === undefined) continue;
      expect(phrase.firstBar + phrase.barCount, line.text).toBeLessThanOrEqual(section.firstBar + section.barCount);
    }
  }

  it("keeps every binding inside one new section and rejoins the text after every bar and section command", () => {
    for (const fact of facts) {
      const text = readFileSync(new URL(`samples/${fact.file}`, directory), "utf8");
      const before = parse(text);
      const lines: LyricLine[] = before.bars.map((bar) => ({
        text: `bar ${bar.index}`,
        phrase: { firstBar: bar.index, barCount: 1 },
      }));
      const input: SongProject = {
        ...project(),
        score: text,
        lyricLines: lines,
        lyrics: joinLyrics(before, lines),
      };
      const middle = Math.floor(before.bars.length / 2);
      const commands: ScoreCommand[] = [
        { type: "insertBar", bar: 0 },
        { type: "insertBar", bar: middle },
        { type: "insertBar", bar: before.bars.length },
        { type: "deleteBars", from: middle, count: 1 },
        { type: "deleteBars", from: 0, count: Math.min(2, before.bars.length) },
        { type: "setSectionMeter", section: 0, meter: { numerator: 2, denominator: 4 } },
        { type: "fillTruncatedBar" },
        { type: "deleteTruncatedBar" },
      ];
      const sectionIndex = Math.max(
        0,
        before.sections.findIndex((section) => section.name !== null),
      );
      const section = before.sections[sectionIndex];
      if (section !== undefined) {
        commands.push({ type: "deleteSection", section: sectionIndex });
        if (section.name !== null) commands.push({ type: "duplicateSection", section: sectionIndex });
        if (sectionIndex > 0) commands.push({ type: "moveSection", section: sectionIndex, direction: "earlier" });
        if (sectionIndex + 1 < before.sections.length) {
          commands.push({ type: "moveSection", section: sectionIndex, direction: "later" });
        }
        commands.push({ type: "renameSection", section: sectionIndex, name: "R" });
        commands.push({ type: "nameSection", bar: section.firstBar, name: "S" });
      }

      for (const command of commands) {
        const expected = applyScoreCommand(song2Dialect, text, command);
        const result = applyProjectCommand(song2Dialect, input, command);
        if (!expected.ok) {
          expect(result.project, `${fact.file} ${command.type}`).toBe(input);
          continue;
        }
        const after = parse(expected.text);
        expect(result.project.score, `${fact.file} ${command.type}`).toBe(expected.text);
        const resultLines = result.project.lyricLines ?? [];
        validLines(after, resultLines);
      }
    }
  }, 30000);
});

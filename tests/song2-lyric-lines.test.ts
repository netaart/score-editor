// ABOUTME: Seam 2 for the lyric-line commands: set text, insert, delete, split, merge and set a phrase, through the package entry.
// ABOUTME: Every case states the hand-written lines and lyrics before and after; every refusal keeps the project byte for byte.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import {
  alignedLyricLines,
  alignLyricLine,
  applyCommandList,
  applyProjectCommand,
  applyScoreCommand,
  checkProject,
  formatDiagnostic,
  joinLyrics,
  type LyricLine,
  lyricLinesOf,
  type ScoreCommand,
  type SongProject,
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

const TWO_BAR_SCORE = `${HEADER}
K:C
V: Vocal
C16|D16|`;

const THREE_BAR_SCORE = `${HEADER}
K:C
V: Vocal
C16|D16|E16|`;

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

function project(overrides: Partial<SongProject> = {}): SongProject {
  return {
    style: "pop",
    lyrics: JOINED,
    score: SCORE,
    scoreMode: "full",
    seed: 7,
    modelId: "song2",
    sourceKey: "lyric-lines-test",
    lyricLines: LINES,
    ...overrides,
  };
}

function withLines(lines: ReadonlyArray<LyricLine>, lyrics: string, overrides: Partial<SongProject> = {}): SongProject {
  return project({ lyricLines: lines, lyrics, ...overrides });
}

function accepted(input: SongProject, command: Parameters<typeof applyProjectCommand>[2]) {
  const result = applyProjectCommand(song2Dialect, input, command);
  expect(result.diagnostics.filter((diagnostic) => diagnostic.code !== "lyrics-unaligned")).toEqual([]);
  return result.project;
}

function refused(input: SongProject, command: Parameters<typeof applyProjectCommand>[2], code: string) {
  const before = JSON.stringify(input);
  const result = applyProjectCommand(song2Dialect, input, command);
  expect(result.project).toBe(input);
  expect(JSON.stringify(input)).toBe(before);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([code]);
  return result.diagnostics[0];
}

function acceptWithNotice(input: SongProject, command: Parameters<typeof applyProjectCommand>[2], code: string) {
  const result = applyProjectCommand(song2Dialect, input, command);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([code]);
  return result.project;
}

describe("setting a lyric line's text", () => {
  it("changes the text, keeps its phrase and writes the joined lyrics", () => {
    const result = accepted(project(), { type: "setLyricLineText", line: 1, text: "new verse" });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "new verse", phrase: { firstBar: 2, barCount: 2 } },
      { text: "verse two", phrase: { firstBar: 4, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
new verse
verse two
[Chorus]
chorus`);
  });

  it("takes the computed layout of an old project first", () => {
    const { lyricLines: _stored, ...input } = project({ lyrics: "[Verse]\nv1\nv2\nv3\nv4" });
    const result = accepted(input, { type: "setLyricLineText", line: 0, text: "first" });

    expect(result.lyricLines).toEqual([
      { text: "first", phrase: { firstBar: 2, barCount: 1 } },
      { text: "v2", phrase: { firstBar: 3, barCount: 1 } },
      { text: "v3", phrase: { firstBar: 4, barCount: 1 } },
      { text: "v4", phrase: { firstBar: 5, barCount: 1 } },
    ]);
    expect(result.lyrics).toBe("[Intro]\n[Verse]\nfirst\nv2\nv3\nv4\n[Chorus]");
  });

  it("keeps a line that no longer fits its score unaligned when the text is set", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "one", phrase: { firstBar: 0, barCount: 1 } },
      { text: "two", phrase: { firstBar: 2, barCount: 1 } },
      { text: "three", phrase: { firstBar: 3, barCount: 1 } },
    ];
    const input = withLines(lines, "one\ntwo\nthree", { score: TWO_BAR_SCORE });
    const result = acceptWithNotice(input, { type: "setLyricLineText", line: 1, text: "changed" }, "lyrics-unaligned");

    expect(result.lyricLines).toEqual([
      { text: "one", phrase: { firstBar: 0, barCount: 1 } },
      { text: "changed", phrase: null },
      { text: "three", phrase: { firstBar: 3, barCount: 1 } },
    ]);
    expect(result.lyrics).toBe("one");
  });

  it("refuses a missing line, empty text, a line break and a section label", () => {
    const missing = refused(project(), { type: "setLyricLineText", line: 9, text: "x" }, "lyric-line-out-of-range");
    expect(missing?.at).toEqual({});

    refused(project(), { type: "setLyricLineText", line: 0, text: "   " }, "lyric-text-invalid");
    refused(project(), { type: "setLyricLineText", line: 0, text: "two\nlines" }, "lyric-text-invalid");
    refused(project(), { type: "setLyricLineText", line: 0, text: "[Verse]" }, "lyric-text-invalid");
  });
});

describe("a position that is not a lyric line", () => {
  it("names the value it was given and has no place", () => {
    for (const line of [-1, 1.5, 4]) {
      const input = project();
      const result = applyProjectCommand(song2Dialect, input, { type: "deleteLyricLine", line });

      expect(result.project).toBe(input);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["lyric-line-out-of-range"]);
      const diagnostic = result.diagnostics[0];
      if (diagnostic === undefined) throw new Error("the position refusal was not reported");
      expect(diagnostic.at).toEqual({});
      expect(formatDiagnostic(diagnostic, "en")).toBe(`There is no lyric line at position ${line}.`);
    }
  });

  it("puts a real line in the place", () => {
    const diagnostic = refused(project(), { type: "setLyricLineText", line: 1, text: "" }, "lyric-text-invalid");
    expect(diagnostic?.at).toEqual({ line: 2 });
  });
});

describe("inserting a lyric line", () => {
  it("puts an aligned line at its bar, with its text and phrase", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ];
    const input = withLines(lines, "[Intro]\nintro line\n[Chorus]\nchorus");
    const result = accepted(input, {
      type: "insertLyricLine",
      line: 1,
      text: "new line",
      phrase: { firstBar: 4, barCount: 2 },
    });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "new line", phrase: { firstBar: 4, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
new line
[Chorus]
chorus`);
  });

  it("puts a line with no phrase in the unaligned area, after the aligned lines", () => {
    const result = acceptWithNotice(
      project(),
      { type: "insertLyricLine", line: 0, text: "loose", phrase: null },
      "lyrics-unaligned",
    );

    expect(result.lyricLines).toEqual([...LINES, { text: "loose", phrase: null }]);
    expect(result.lyrics).toBe(JOINED);
    expect(checkProject(song2Dialect, result).map((diagnostic) => [diagnostic.code, diagnostic.params])).toEqual([
      ["lyrics-unaligned", { count: 1 }],
    ]);
  });

  it("places an inserted unaligned line among the existing unaligned lines at its position", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "loose one", phrase: null },
      { text: "loose two", phrase: null },
    ];
    const input = withLines(lines, "[Intro]\nintro line");
    const result = accepted(input, { type: "insertLyricLine", line: 1, text: "between", phrase: null });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "between", phrase: null },
      { text: "loose one", phrase: null },
      { text: "loose two", phrase: null },
    ]);
  });

  it("refuses a position outside the lines, bad text, an invalid phrase and an overlap", () => {
    refused(project(), { type: "insertLyricLine", line: -1, text: "x", phrase: null }, "lyric-line-out-of-range");
    refused(project(), { type: "insertLyricLine", line: 5, text: "x", phrase: null }, "lyric-line-out-of-range");
    refused(project(), { type: "insertLyricLine", line: 0, text: "", phrase: null }, "lyric-text-invalid");
    refused(
      project(),
      { type: "insertLyricLine", line: 0, text: "x", phrase: { firstBar: 0, barCount: 0 } },
      "lyric-phrase-invalid",
    );
    refused(
      project(),
      { type: "insertLyricLine", line: 0, text: "x", phrase: { firstBar: 0, barCount: 3 } },
      "lyric-phrase-invalid",
    );
    refused(
      project(),
      { type: "insertLyricLine", line: 0, text: "x", phrase: { firstBar: 6, barCount: 2 } },
      "lyric-phrase-overlap",
    );
  });
});

describe("deleting a lyric line", () => {
  it("removes the line and rewrites the join", () => {
    const result = accepted(project(), { type: "deleteLyricLine", line: 2 });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
verse one
[Chorus]
chorus`);
  });

  it("removes an unaligned line and leaves the joined lyrics unchanged", () => {
    const lines: ReadonlyArray<LyricLine> = [...LINES, { text: "loose", phrase: null }];
    const input = withLines(lines, JOINED);
    const result = accepted(input, { type: "deleteLyricLine", line: 4 });

    expect(result.lyricLines).toEqual(LINES);
    expect(result.lyrics).toBe(JOINED);
  });

  it("restores the stored order after a shorter score leaves a stale line in the middle", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "one", phrase: { firstBar: 0, barCount: 1 } },
      { text: "stale", phrase: { firstBar: 2, barCount: 1 } },
      { text: "valid", phrase: { firstBar: 1, barCount: 1 } },
    ];
    const replaced = accepted(withLines(lines, "one\nvalid", { score: THREE_BAR_SCORE }), {
      type: "replaceScoreText",
      text: TWO_BAR_SCORE,
    });

    const deleted = accepted(replaced, { type: "deleteLyricLine", line: 0 });

    expect(deleted.lyricLines).toEqual([
      { text: "valid", phrase: { firstBar: 1, barCount: 1 } },
      { text: "stale", phrase: { firstBar: 2, barCount: 1 } },
    ]);
  });

  it("refuses a missing line and leaves the project as it was", () => {
    refused(project(), { type: "deleteLyricLine", line: 4 }, "lyric-line-out-of-range");
  });
});

describe("splitting a lyric line", () => {
  const SPLIT_LINES: ReadonlyArray<LyricLine> = [
    { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
    { text: "一二三四", phrase: { firstBar: 2, barCount: 2 } },
    { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
  ];
  const SPLIT_JOINED = `[Intro]
intro line
[Verse]
一二三四
[Chorus]
chorus`;

  it("splits at a bar, the first part keeping the bars before it", () => {
    const result = accepted(withLines(SPLIT_LINES, SPLIT_JOINED), {
      type: "splitLyricLine",
      line: 1,
      offset: 2,
      bar: 3,
    });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "一二", phrase: { firstBar: 2, barCount: 1 } },
      { text: "三四", phrase: { firstBar: 3, barCount: 1 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
一二
三四
[Chorus]
chorus`);
  });

  it("counts the offset in code points", () => {
    const lines: ReadonlyArray<LyricLine> = [{ text: "a😀b", phrase: { firstBar: 2, barCount: 2 } }];
    const input = withLines(lines, "[Verse]\na😀b");
    const result = accepted(input, { type: "splitLyricLine", line: 0, offset: 2, bar: 3 });

    expect(result.lyricLines).toEqual([
      { text: "a😀", phrase: { firstBar: 2, barCount: 1 } },
      { text: "b", phrase: { firstBar: 3, barCount: 1 } },
    ]);
  });

  it("keeps the phrase on the first part and puts the second in the unaligned area when no bar is given", () => {
    const result = acceptWithNotice(
      withLines(SPLIT_LINES, SPLIT_JOINED),
      { type: "splitLyricLine", line: 1, offset: 2 },
      "lyrics-unaligned",
    );

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "一二", phrase: { firstBar: 2, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
      { text: "三四", phrase: null },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
一二
[Chorus]
chorus`);
  });

  it("splits an unaligned line into two unaligned lines", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "loose", phrase: null },
    ];
    const result = accepted(withLines(lines, "[Intro]\nintro line"), {
      type: "splitLyricLine",
      line: 1,
      offset: 2,
    });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "lo", phrase: null },
      { text: "ose", phrase: null },
    ]);
  });

  it("refuses an offset at either end or not a whole number", () => {
    refused(
      withLines(SPLIT_LINES, SPLIT_JOINED),
      { type: "splitLyricLine", line: 1, offset: 0 },
      "lyric-split-invalid",
    );
    refused(
      withLines(SPLIT_LINES, SPLIT_JOINED),
      { type: "splitLyricLine", line: 1, offset: 4 },
      "lyric-split-invalid",
    );
    refused(
      withLines(SPLIT_LINES, SPLIT_JOINED),
      { type: "splitLyricLine", line: 1, offset: 1.5 },
      "lyric-split-invalid",
    );
  });

  it("refuses a split that leaves an empty half", () => {
    refused(
      withLines([{ text: " a", phrase: { firstBar: 2, barCount: 1 } }], "[Verse]\n a"),
      { type: "splitLyricLine", line: 0, offset: 1 },
      "lyric-split-invalid",
    );
  });

  it("refuses a bar outside the phrase, at its start or at its end", () => {
    refused(
      withLines(SPLIT_LINES, SPLIT_JOINED),
      { type: "splitLyricLine", line: 1, offset: 2, bar: 2 },
      "lyric-split-invalid",
    );
    refused(
      withLines(SPLIT_LINES, SPLIT_JOINED),
      { type: "splitLyricLine", line: 1, offset: 2, bar: 4 },
      "lyric-split-invalid",
    );
    refused(
      withLines(SPLIT_LINES, SPLIT_JOINED),
      { type: "splitLyricLine", line: 1, offset: 2, bar: 1 },
      "lyric-split-invalid",
    );
  });

  it("refuses a negative or fractional bar with the value it was given", () => {
    for (const bar of [-1, 1.5]) {
      const diagnostic = refused(
        withLines(SPLIT_LINES, SPLIT_JOINED),
        { type: "splitLyricLine", line: 1, offset: 2, bar },
        "lyric-split-invalid",
      );
      expect(diagnostic?.params).toEqual({ reason: "bar", bar });
      expect(diagnostic?.at).toEqual({ line: 2 });
    }
  });

  it("refuses a split that would make a section label or a missing line", () => {
    refused(
      withLines([{ text: "[A]x", phrase: { firstBar: 2, barCount: 1 } }], "[Verse]\n[A]x"),
      { type: "splitLyricLine", line: 0, offset: 3 },
      "lyric-split-invalid",
    );
    refused(
      withLines(SPLIT_LINES, SPLIT_JOINED),
      { type: "splitLyricLine", line: 9, offset: 1 },
      "lyric-line-out-of-range",
    );
  });
});

describe("merging a lyric line with the next one", () => {
  it("joins the text with one space between Latin words and takes the union of adjacent phrases", () => {
    const result = accepted(project(), { type: "mergeLyricLines", line: 1 });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one verse two", phrase: { firstBar: 2, barCount: 4 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
verse one verse two
[Chorus]
chorus`);
  });

  it("joins Han and kana with no space", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "你好", phrase: { firstBar: 2, barCount: 1 } },
      { text: "世界", phrase: { firstBar: 3, barCount: 1 } },
    ];
    const han = accepted(withLines(lines, "[Verse]\n你好\n世界"), { type: "mergeLyricLines", line: 0 });
    expect(han.lyricLines).toEqual([{ text: "你好世界", phrase: { firstBar: 2, barCount: 2 } }]);

    const kanaLines: ReadonlyArray<LyricLine> = [
      { text: "こん", phrase: { firstBar: 2, barCount: 1 } },
      { text: "にちは", phrase: { firstBar: 3, barCount: 1 } },
    ];
    const kana = accepted(withLines(kanaLines, "[Verse]\nこん\nにちは"), { type: "mergeLyricLines", line: 0 });
    expect(kana.lyricLines).toEqual([{ text: "こんにちは", phrase: { firstBar: 2, barCount: 2 } }]);
  });

  it("trims the join edges before applying the one-space or no-space rule", () => {
    const latin: ReadonlyArray<LyricLine> = [
      { text: "foo ", phrase: { firstBar: 2, barCount: 1 } },
      { text: "bar", phrase: { firstBar: 3, barCount: 1 } },
    ];
    const spaced = accepted(withLines(latin, "[Verse]\nfoo \nbar"), { type: "mergeLyricLines", line: 0 });
    expect(spaced.lyricLines).toEqual([{ text: "foo bar", phrase: { firstBar: 2, barCount: 2 } }]);

    const han: ReadonlyArray<LyricLine> = [
      { text: "你 ", phrase: { firstBar: 2, barCount: 1 } },
      { text: "好", phrase: { firstBar: 3, barCount: 1 } },
    ];
    const joined = accepted(withLines(han, "[Verse]\n你 \n好"), { type: "mergeLyricLines", line: 0 });
    expect(joined.lyricLines).toEqual([{ text: "你好", phrase: { firstBar: 2, barCount: 2 } }]);
  });

  it("keeps the aligned phrase when an aligned line merges with an unaligned one", () => {
    const lines: ReadonlyArray<LyricLine> = [...LINES, { text: "loose", phrase: null }];
    const result = accepted(withLines(lines, JOINED), { type: "mergeLyricLines", line: 3 });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 2 } },
      { text: "verse two", phrase: { firstBar: 4, barCount: 2 } },
      { text: "chorus loose", phrase: { firstBar: 6, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
verse one
verse two
[Chorus]
chorus loose`);
  });

  it("leaves two unaligned lines unaligned", () => {
    const lines: ReadonlyArray<LyricLine> = [
      ...LINES,
      { text: "loose one", phrase: null },
      { text: "loose two", phrase: null },
    ];
    const result = acceptWithNotice(withLines(lines, JOINED), { type: "mergeLyricLines", line: 4 }, "lyrics-unaligned");

    expect(result.lyricLines).toEqual([...LINES, { text: "loose one loose two", phrase: null }]);
  });

  it("refuses aligned phrases that are not adjacent or not in one section", () => {
    const gapLines: ReadonlyArray<LyricLine> = [
      { text: "first", phrase: { firstBar: 2, barCount: 1 } },
      { text: "second", phrase: { firstBar: 4, barCount: 1 } },
    ];
    const gap = refused(
      withLines(gapLines, "[Verse]\nfirst\nsecond"),
      { type: "mergeLyricLines", line: 0 },
      "lyric-lines-not-mergeable",
    );
    expect(gap?.params.reason).toBe("not-adjacent");

    const acrossSections: ReadonlyArray<LyricLine> = [
      { text: "intro line", phrase: { firstBar: 0, barCount: 2 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 1 } },
    ];
    const section = refused(
      withLines(acrossSections, "[Intro]\nintro line\n[Verse]\nverse one"),
      { type: "mergeLyricLines", line: 0 },
      "lyric-lines-not-mergeable",
    );
    expect(section?.params.reason).toBe("not-one-section");
  });

  it("refuses a line with no next line and a missing line", () => {
    const noNext = refused(project(), { type: "mergeLyricLines", line: 3 }, "lyric-lines-not-mergeable");
    expect(noNext?.params.reason).toBe("no-next");
    refused(project(), { type: "mergeLyricLines", line: 9 }, "lyric-line-out-of-range");
  });
});

describe("setting a lyric line's phrase", () => {
  it("moves an aligned line's boundary to new bars", () => {
    const result = accepted(project(), { type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 2, barCount: 1 } });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 1 } },
      { text: "verse two", phrase: { firstBar: 4, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(JOINED);
  });

  it("places an unaligned line on a phrase", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
      { text: "loose", phrase: null },
    ];
    const input = withLines(lines, "[Intro]\nintro line\n[Chorus]\nchorus");
    const result = accepted(input, { type: "setLyricLinePhrase", line: 2, phrase: { firstBar: 4, barCount: 2 } });

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "loose", phrase: { firstBar: 4, barCount: 2 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
loose
[Chorus]
chorus`);
  });

  it("puts a line back in the unaligned area with no phrase, as a notice", () => {
    const result = acceptWithNotice(
      project(),
      { type: "setLyricLinePhrase", line: 3, phrase: null },
      "lyrics-unaligned",
    );

    expect(result.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 2 } },
      { text: "verse two", phrase: { firstBar: 4, barCount: 2 } },
      { text: "chorus", phrase: null },
    ]);
    expect(result.lyrics).toBe(`[Intro]
intro line
[Verse]
verse one
verse two
[Chorus]`);
  });

  it("refuses an empty, outside, cross-section or fractional phrase", () => {
    const empty = refused(
      project(),
      { type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 2, barCount: 0 } },
      "lyric-phrase-invalid",
    );
    expect(empty?.params.reason).toBe("empty");
    const outside = refused(
      project(),
      { type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 7, barCount: 2 } },
      "lyric-phrase-invalid",
    );
    expect(outside?.params.reason).toBe("outside-score");
    const cross = refused(
      project(),
      { type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 1, barCount: 2 } },
      "lyric-phrase-invalid",
    );
    expect(cross?.params.reason).toBe("cross-section");
    const fractional = refused(
      project(),
      { type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 2.5, barCount: 1 } },
      "lyric-phrase-invalid",
    );
    expect(fractional?.params.reason).toBe("not-integer");
  });

  it("names the first bar the new phrase shares with the other line", () => {
    const lines: ReadonlyArray<LyricLine> = [
      { text: "first", phrase: { firstBar: 3, barCount: 1 } },
      { text: "second", phrase: { firstBar: 4, barCount: 2 } },
    ];
    const diagnostic = refused(
      withLines(lines, "[Verse]\nfirst\nsecond"),
      { type: "setLyricLinePhrase", line: 0, phrase: { firstBar: 2, barCount: 3 } },
      "lyric-phrase-overlap",
    );

    expect(diagnostic?.at).toEqual({ line: 2, bar: 5 });
    expect(diagnostic?.params).toMatchObject({ line: 2, bar: 5 });
  });

  it("refuses to put a line whose text is a label on a phrase", () => {
    const input = withLines([{ text: "[Verse]", phrase: null }], "", { score: TWO_BAR_SCORE });
    const diagnostic = refused(
      input,
      { type: "setLyricLinePhrase", line: 0, phrase: { firstBar: 0, barCount: 1 } },
      "lyric-text-invalid",
    );

    expect(diagnostic?.params).toEqual({ reason: "label" });
    expect(diagnostic?.at).toEqual({ line: 1 });
  });

  it("refuses a phrase that overlaps another line instead of shrinking that line", () => {
    const overlap = refused(
      project(),
      { type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 0, barCount: 1 } },
      "lyric-phrase-overlap",
    );
    expect(overlap?.at).toEqual({ line: 1, bar: 1 });
    refused(project(), { type: "setLyricLinePhrase", line: 9, phrase: null }, "lyric-line-out-of-range");
  });
});

describe("a shared boundary moves as one command list", () => {
  it("applies the shrink and the extend together", () => {
    const result = applyCommandList(song2Dialect, project(), [
      { type: "setLyricLinePhrase", line: 2, phrase: { firstBar: 5, barCount: 1 } },
      { type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 2, barCount: 3 } },
    ]);

    expect(result.ok).toBe(true);
    expect(result.project.lyricLines).toEqual([
      { text: "intro line", phrase: { firstBar: 0, barCount: 1 } },
      { text: "verse one", phrase: { firstBar: 2, barCount: 3 } },
      { text: "verse two", phrase: { firstBar: 5, barCount: 1 } },
      { text: "chorus", phrase: { firstBar: 6, barCount: 2 } },
    ]);
  });

  it("refuses the whole list and leaves the project as it was when the second step overlaps", () => {
    const input = project();
    const before = JSON.stringify(input);
    const result = applyCommandList(song2Dialect, input, [
      { type: "setLyricLinePhrase", line: 2, phrase: { firstBar: 4, barCount: 1 } },
      { type: "setLyricLinePhrase", line: 1, phrase: { firstBar: 2, barCount: 3 } },
    ]);

    expect(result.ok).toBe(false);
    expect(result.project).toBe(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["lyric-phrase-overlap"]);
  });
});

describe("a lyric command is not a score command", () => {
  it("is refused by applyScoreCommand", () => {
    const result = applyScoreCommand(song2Dialect, SCORE, {
      type: "setLyricLineText",
      line: 0,
      text: "x",
    } as unknown as ScoreCommand);

    expect(result).toEqual({
      ok: false,
      diagnostic: { code: "not-a-score-command", params: { type: "setLyricLineText" }, at: {} },
    });
  });
});

describe("a stored phrase that no longer fits the score", () => {
  const ONE_BAR = `${HEADER}
K:C
V: Vocal
C16|`;
  const LINES_THREE: ReadonlyArray<LyricLine> = [
    { text: "one", phrase: { firstBar: 0, barCount: 1 } },
    { text: "two", phrase: { firstBar: 1, barCount: 1 } },
    { text: "three", phrase: { firstBar: 2, barCount: 1 } },
  ];

  it("is read as unaligned by the classifiers, the join, the alignment and the notice, but is not rewritten", () => {
    const input = withLines(LINES_THREE, "one\ntwo\nthree", { score: ONE_BAR });
    const { score } = song2Dialect.parse(ONE_BAR);
    expect(score).not.toBeNull();
    if (score === null) throw new Error("the one-bar score did not read");
    const parsed = lyricLinesOf(input, score);

    expect(parsed).toEqual(LINES_THREE);
    expect(joinLyrics(score, parsed)).toBe("one");
    const second = parsed[1] as LyricLine;
    const alignment = alignLyricLine(score, second);
    expect(alignment.onsets).toEqual([]);
    expect(alignment.equal).toBe(false);
    expect(alignedLyricLines(parsed, score)).toEqual([LINES_THREE[0]]);
    expect(unalignedLyricLines(parsed, score)).toEqual([LINES_THREE[1], LINES_THREE[2]]);
    expect(alignedLyricLines(parsed)).toHaveLength(3);
    expect(unalignedLyricLines(parsed)).toEqual([]);
    expect(checkProject(song2Dialect, input).map((diagnostic) => [diagnostic.code, diagnostic.params])).toEqual([
      ["lyrics-unaligned", { count: 2 }],
    ]);
    expect(input.lyricLines).toEqual(LINES_THREE);
  });
});

describe("the new diagnostic text", () => {
  it("names the line and the reason in both languages", () => {
    const missing = { code: "lyric-line-out-of-range", params: { line: 4, lines: 3 }, at: { line: 4 } } as const;
    expect(formatDiagnostic(missing, "en")).toContain("4");
    expect(formatDiagnostic(missing, "zh")).toContain("第 4 行");
    expect(formatDiagnostic({ ...missing, code: "lyric-text-invalid", params: { reason: "label" } }, "en")).toContain(
      "label",
    );
    expect(
      formatDiagnostic({ ...missing, code: "lyric-phrase-invalid", params: { reason: "cross-section" } }, "zh"),
    ).toContain("段落");
  });
});

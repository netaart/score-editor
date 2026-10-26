// ABOUTME: Seam 1 for the pre-handoff notices: hand-written projects, one for each rule and one clean, read through the package entry.
// ABOUTME: Expected counts and pitches are worked out by hand from the score texts; nothing is compared with the code under test.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { type LyricLine, preHandoffNotices, type SongProject } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

/** Two bars, one section, five Vocal notes from C4 to G4 and five syllables over two lines: nothing to warn about. */
const CLEAN_SCORE = `${HEADER}
K:C
% verse
V: Vocal
C4D4E4F4|G16|`;

const CLEAN_LINES: ReadonlyArray<LyricLine> = [
  { text: "la la la la", phrase: { firstBar: 0, barCount: 1 } },
  { text: "la", phrase: { firstBar: 1, barCount: 1 } },
];

function project(overrides: Partial<SongProject> = {}): SongProject {
  return {
    style: "pop",
    lyrics: "[verse]\nla la la la\nla",
    score: CLEAN_SCORE,
    scoreMode: "full",
    seed: 7,
    modelId: "song2",
    sourceKey: "handoff-notices-test",
    lyricLines: CLEAN_LINES,
    ...overrides,
  };
}

/** The same two bars with no `%` marker, so the score has no named section. */
const SECTIONLESS_SCORE = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16|`;

/** Five Vocal notes but one syllable in one line: the whole song's counts are four apart. */
const FEW_SYLLABLE_LINES: ReadonlyArray<LyricLine> = [{ text: "la", phrase: { firstBar: 0, barCount: 1 } }];

/** Five notes at B5 (83), above the singable range's top of 82. */
const HIGH_SCORE = `${HEADER}
K:C
% verse
V: Vocal
b4b4b4b4|b16|`;

/** Five notes at C3 (48), below the singable range's bottom of 60. */
const LOW_SCORE = `${HEADER}
K:C
% verse
V: Vocal
C,4C,4C,4C,4|C,16|`;

/** The clean score with a chord on its first note, for a melody project. */
const CHORD_SCORE = `${HEADER}
K:C
% verse
V: Vocal
"C"C4D4E4F4|G16|`;

const noticeCodes = (overrides: Partial<SongProject> = {}, language: "en" | "zh" = "en") =>
  preHandoffNotices(song2Dialect, project(overrides), language).map((notice) => notice.code);

describe("the pre-handoff notices", () => {
  it("reports a score with no sections", () => {
    expect(noticeCodes({ score: SECTIONLESS_SCORE })).toEqual(["prehandoff-no-sections"]);
  });

  it("reports a whole song whose syllable count is far from its note count", () => {
    expect(noticeCodes({ lyricLines: FEW_SYLLABLE_LINES })).toEqual(["prehandoff-syllables-far"]);
  });

  it("reports a Vocal median above the singable range", () => {
    expect(noticeCodes({ score: HIGH_SCORE })).toEqual(["prehandoff-vocal-range"]);
  });

  it("reports a Vocal median below the singable range", () => {
    expect(noticeCodes({ score: LOW_SCORE })).toEqual(["prehandoff-vocal-range"]);
  });

  it("reports a melody project with chords through the project rule", () => {
    expect(noticeCodes({ score: CHORD_SCORE, scoreMode: "melody" })).toEqual(["prehandoff-melody-chords"]);
  });

  it("reports none for a clean project", () => {
    expect(noticeCodes()).toEqual([]);
  });

  it("reports all four at once, in the ticket's order", () => {
    expect(
      noticeCodes({
        score: CHORD_SCORE.replace("C4D4E4F4|G16|", "b4b4b4b4|b16|").replace("% verse\n", "").replace("K:C", "K:C"),
        scoreMode: "melody",
        lyricLines: FEW_SYLLABLE_LINES,
      }),
    ).toEqual([
      "prehandoff-no-sections",
      "prehandoff-syllables-far",
      "prehandoff-vocal-range",
      "prehandoff-melody-chords",
    ]);
  });

  it("writes each notice in English and Chinese", () => {
    const en = preHandoffNotices(
      song2Dialect,
      project({
        score: CHORD_SCORE.replace("C4D4E4F4|G16|", "b4b4b4b4|b16|").replace("% verse\n", ""),
        scoreMode: "melody",
        lyricLines: FEW_SYLLABLE_LINES,
      }),
      "en",
    );
    const zh = preHandoffNotices(
      song2Dialect,
      project({
        score: CHORD_SCORE.replace("C4D4E4F4|G16|", "b4b4b4b4|b16|").replace("% verse\n", ""),
        scoreMode: "melody",
        lyricLines: FEW_SYLLABLE_LINES,
      }),
      "zh",
    );
    expect(en.map((notice) => notice.message)).toEqual([
      "This score has no sections, so the agent gets no section names.",
      "The whole song has 1 syllable and 5 note onsets, 4 apart.",
      "Vocal's median pitch is 83, outside the singable range 60–82.",
      "Melody mode cannot carry chords; delete all chords or switch to full.",
    ]);
    expect(zh.map((notice) => notice.message)).toEqual([
      "这份乐谱没有段落，交给 agent 时也就没有段落名。",
      "整首有 1 个音节和 5 个音符起点，相差 4 个。",
      "人声的中位音是 83，不在可唱区间 60–82 内。",
      "melody 模式不能带和弦；可以删掉所有和弦，或改回 full。",
    ]);
    expect([...en, ...zh].every((notice) => notice.level === "warning")).toBe(true);
  });

  it("does not report a difference of one syllable per line", () => {
    // Two lines, four syllables, five onsets: one syllable of melisma over two lines is ordinary.
    const withinGap: ReadonlyArray<LyricLine> = [
      { text: "la la la", phrase: { firstBar: 0, barCount: 1 } },
      { text: "la", phrase: { firstBar: 1, barCount: 1 } },
    ];
    expect(noticeCodes({ lyricLines: withinGap })).toEqual([]);
  });

  it("reports nothing for a score its dialect cannot read", () => {
    expect(noticeCodes({ score: "not a score" })).toEqual([]);
  });
});

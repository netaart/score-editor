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

/** Seven syllables over two lines under a label with no section: only the unaligned notice applies. */
const UNALIGNED_LYRICS = "[Missing]\noh it is a long way\nlost";

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

/** A project with no stored lines, so the legacy lyrics text is laid out against the score. */
function legacyProject(lyrics: string): SongProject {
  const base = { ...project({ lyrics }) } as Record<string, unknown>;
  delete base.lyricLines;
  return base as unknown as SongProject;
}

describe("the pre-handoff notices", () => {
  it("reports a score with no sections", () => {
    expect(noticeCodes({ score: SECTIONLESS_SCORE })).toEqual(["prehandoff-no-sections"]);
  });

  it("reports a whole song whose syllable count is far from its note count", () => {
    expect(noticeCodes({ lyricLines: FEW_SYLLABLE_LINES })).toEqual(["prehandoff-syllables-far"]);
  });

  it("reports a label with no section as lines in the unaligned area, with their number and first words", () => {
    const legacy = legacyProject(UNALIGNED_LYRICS);
    expect(preHandoffNotices(song2Dialect, legacy, "en").map((notice) => notice.code)).toEqual([
      "prehandoff-lyrics-unaligned",
    ]);
    const en = preHandoffNotices(song2Dialect, legacy, "en");
    const zh = preHandoffNotices(song2Dialect, legacy, "zh");
    expect(en.map((notice) => notice.message)).toEqual([
      "2 lyric lines are not aligned to a bar: “oh it is a…”, “lost”. Put them on bars or delete them; the joined lyrics leave them out.",
    ]);
    expect(zh.map((notice) => notice.message)).toEqual([
      "有 2 行歌词没有对上小节：“oh it is a…”、“lost”。请把它们放到小节上或删掉；拼回的歌词里没有这些行。",
    ]);
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
      "This score has no sections, so the new song has no section names. Click the “Unnamed” bar above the notes and choose “Name this section”.",
      "The lyrics have 1 syllable, but the melody has 5 notes. Check that each lyric line fits its notes.",
      "The vocal's middle note is B5, above its singable range (C4 to A#5). Lower it with the Voice octave tool.",
      "The score mode is Melody, but the score has chords. Delete the chords, or change Score mode to Full.",
    ]);
    expect(zh.map((notice) => notice.message)).toEqual([
      "这份乐谱没有段落，新歌就没有段落名。点乐谱上方的“未命名”段落条，选“给这段命名”。",
      "歌词有 1 个音节，旋律有 5 个音。请检查每行歌词是否对上它的音符。",
      "人声的中间音是 B5，高于可唱范围（C4 至 A#5）。可用人声移八度工具降下来。",
      "乐谱模式是旋律，但乐谱里有和弦。删掉和弦，或把乐谱模式改为完整。",
    ]);
    expect([...en, ...zh].every((notice) => notice.level === "warning")).toBe(true);
    // The Chinese sentences are Chinese apart from the note names B5, C4 and A#5.
    expect(zh.every((notice) => !/[A-Za-z]/.test(notice.message.replace(/[A-G]#?\d/g, "")))).toBe(true);
  });

  it("names the vocal's middle note and the range for a high and a low case", () => {
    const high = preHandoffNotices(song2Dialect, project({ score: HIGH_SCORE }), "en")[0]?.message;
    expect(high).toBe(
      "The vocal's middle note is B5, above its singable range (C4 to A#5). Lower it with the Voice octave tool.",
    );
    const low = preHandoffNotices(song2Dialect, project({ score: LOW_SCORE }), "en")[0]?.message;
    expect(low).toBe(
      "The vocal's middle note is C3, below its singable range (C4 to A#5). Raise it with the Voice octave tool.",
    );
    const zhHigh = preHandoffNotices(song2Dialect, project({ score: HIGH_SCORE }), "zh")[0]?.message;
    expect(zhHigh).toBe("人声的中间音是 B5，高于可唱范围（C4 至 A#5）。可用人声移八度工具降下来。");
    const zhLow = preHandoffNotices(song2Dialect, project({ score: LOW_SCORE }), "zh")[0]?.message;
    expect(zhLow).toBe("人声的中间音是 C3，低于可唱范围（C4 至 A#5）。可用人声移八度工具升上去。");
  });

  it("leaves no English mode word in the Chinese melody notice", () => {
    const melody = preHandoffNotices(song2Dialect, project({ score: CHORD_SCORE, scoreMode: "melody" }), "zh").find(
      (notice) => notice.code === "prehandoff-melody-chords",
    );
    expect(melody?.message).toBe("乐谱模式是旋律，但乐谱里有和弦。删掉和弦，或把乐谱模式改为完整。");
    expect(melody?.message).not.toMatch(/[A-Za-z]/);
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

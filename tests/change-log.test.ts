// ABOUTME: Seam 1 for the change log: pairs of original and current projects in, readable changes out.
// ABOUTME: Expected sentences are written by hand in both languages; the dialect is the real song2 reader.
import { readFileSync } from "node:fs";
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { changeLog, changeLogEntries, handoffInstruction, type SongProject } from "@neta-art/score-editor";
import { describe, expect, it } from "vitest";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

/** Verse (bars 1-2) and chorus (bars 3-4), one chord on each first bar, one lyric line on each first bar. */
const SCORE = `${HEADER}
K:C
% verse
V: Vocal
"C"C4D4E4F4|G16|
% chorus
V: Vocal
A16|B16|`;

/** The same music with one more blank line at the end: the text changed, the reading did not. */
const SCORE_WITH_TITLE = `${SCORE}\n`;

const LYRICS = "[verse]\nla la\n[chorus]\nha ha";

// The ticket's real request lyrics, whose `[Verse]` and `[Chorus]` labels differ from the score's lowercase sections.
const MORNING_WALK_LYRICS = readFileSync(new URL("fixtures/request-lyrics.txt", import.meta.url), "utf8");
const MORNING_WALK_SCORE = readFileSync(new URL("fixtures/morning-walk.abc", import.meta.url), "utf8");

const project: SongProject = {
  style: "pop",
  lyrics: LYRICS,
  score: SCORE,
  scoreMode: "full",
  seed: 7,
  modelId: "song2",
  sourceKey: "change-log-test",
};

const changed = (patch: Partial<SongProject> = {}): SongProject => ({ ...project, ...patch });

const log = (current: SongProject, language: "en" | "zh" = "en") =>
  changeLog(project, current, { language, dialect: song2Dialect });

/** The intro is the third line of every instruction: the title, a blank line, then the request. */
const introOf = (text: string): string => text.split("\n")[2] ?? "";

const INTRO_040 = {
  en: "Regenerate with song2. Use the score in the attached score.abc, passed with --text.",
  zh: "用 song2 重新生成，乐谱用附件里的 score.abc，用 --text 传。",
} as const;

describe("the structured change log", () => {
  it("keeps the sentences and names the bars a note entry reports", () => {
    const current = changed({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") });
    const options = { language: "en" as const, dialect: song2Dialect };
    const entries = changeLogEntries(project, current, options);
    expect(entries.map((entry) => entry.text)).toEqual(changeLog(project, current, options));
    expect(entries.find((entry) => entry.text.startsWith("The notes of"))?.bars).toEqual([1]);
  });
});

describe("the change log", () => {
  it("names a score text edit that leaves the parsed score as it was", () => {
    expect(log(changed({ score: SCORE_WITH_TITLE }))).toEqual(["Edited the score text directly."]);
    expect(log(changed({ score: SCORE_WITH_TITLE }), "zh")).toEqual(["直接修改了乐谱文本。"]);
  });
});

describe("section changes, read from the two scores", () => {
  const musicOnly: SongProject = { ...project, lyrics: "" };
  const musicLog = (score: string, language: "en" | "zh" = "en") =>
    changeLog(musicOnly, { ...musicOnly, score }, { language, dialect: song2Dialect });

  it("names a deleted section without calling its notes a note change", () => {
    const withoutChorus = `${HEADER}
K:C
% verse
V: Vocal
"C"C4D4E4F4|G16|`;
    expect(musicLog(withoutChorus)).toEqual(["Removed section “chorus”."]);
    expect(musicLog(withoutChorus, "zh")).toEqual(["删除了段落「chorus」。"]);
  });

  it("names a copied section", () => {
    const twice = `${SCORE}
% chorus
V: Vocal
A16|B16|`;
    expect(musicLog(twice)).toEqual(["Copied section “chorus”."]);
    expect(musicLog(twice, "zh")).toEqual(["复制了段落「chorus」。"]);
  });

  it("names the section that moved, not the ones whose bar numbers shifted", () => {
    const moved = `${HEADER}
K:C
% chorus
V: Vocal
A16|B16|
% verse
V: Vocal
"C"C4D4E4F4|G16|`;
    expect(musicLog(moved)).toEqual(["Moved section “verse”."]);
    expect(musicLog(moved, "zh")).toEqual(["移动了段落「verse」。"]);
  });

  it("names a renamed section", () => {
    const renamed = SCORE.replace("% chorus", "% outro");
    expect(musicLog(renamed)).toEqual(["Renamed section “chorus” to “outro”."]);
  });

  it("names the same changes in Chinese", () => {
    const renamed = SCORE.replace("% chorus", "% outro");
    expect(musicLog(renamed, "zh")).toEqual(["段落「chorus」改名为「outro」。"]);
  });
});

describe("the other kinds of change", () => {
  it("names the tempo, key, meter, chords, lyrics, style, score mode and seed", () => {
    const changedScore = `${HEADER.replace("Q:1/4=120", "Q:1/4=140").replace("M:4/4", "M:2/2")}
K:Am
% verse
V: Vocal
"Am"C4D4E4F4|G16|
% chorus
V: Vocal
A16|B16|`;
    const current = changed({
      score: changedScore,
      style: "rock",
      lyrics: "[verse]\nnew words\n[chorus]\nha ha",
      scoreMode: "melody",
      seed: 9,
    });
    expect(log(current)).toEqual([
      "Tempo changed from 120 to 140 BPM.",
      "Key changed from C to Am.",
      "Meter changed to 2/2 in bars 1–4.",
      "Chords changed.",
      "Lyrics changed.",
      "Style description changed.",
      "Score mode changed from Full to Melody.",
      "Seed changed from 7 to 9.",
    ]);
  });

  it("names the bars whose notes changed, and not a section move's shifted bars", () => {
    const noteChanged = SCORE.replace("C4D4E4F4", "C4E4E4F4");
    expect(log(changed({ score: noteChanged }))).toEqual(["The notes of bar 1 changed."]);
    expect(log(changed({ score: noteChanged }), "zh")).toEqual(["第 1 小节的音符有改动。"]);
  });

  it("names changed bars as one bar, a range or a list", () => {
    const twoBars = SCORE.replace("C4D4E4F4", "C4E4E4F4").replace("A16|B16|", "C16|B16|");
    expect(log(changed({ score: twoBars }))).toEqual(["The notes of bars 1, 3 changed."]);
    expect(log(changed({ score: twoBars }), "zh")).toEqual(["第 1、3 小节的音符有改动。"]);
  });

  it("names a removed seed in Chinese", () => {
    expect(log(changed({ seed: null }), "zh")).toEqual(["种子从 7 改为 无。"]);
  });
});

describe("the prefilled handoff instruction", () => {
  const noteChanged = SCORE.replace("C4D4E4F4", "C4E4E4F4");
  const current = changed({
    score: noteChanged,
    style: "rock",
    lyrics: "[verse]\nnew words\n[chorus]\nha ha",
    scoreMode: "melody",
    seed: 9,
  });

  it("states the title, the song2 command, the final fields and the change log", () => {
    const text = handoffInstruction({
      original: project,
      current,
      title: "My Song",
      language: "en",
      dialect: song2Dialect,
    });
    expect(text).toContain("Title: My Song");
    expect(text).toContain("Regenerate with song2");
    expect(text).toContain("--text");
    expect(text).toContain("score.abc");
    expect(text).toContain("Style description:\nrock");
    expect(text).toContain("Joined lyrics:\n[verse]\nnew words\n[chorus]\nha ha");
    expect(text).toContain("Score mode: melody");
    expect(text).toContain("Seed: 9");
    expect(text).toContain("Changes:");
    expect(text).toContain("- The notes of bar 1 changed.");
  });

  it("carries every requested line into the instruction for the real generation", () => {
    const morningWalk = changed({
      score: MORNING_WALK_SCORE,
      lyrics: MORNING_WALK_LYRICS,
      sourceKey: "morning-walk",
    });
    const text = handoffInstruction({
      original: morningWalk,
      current: morningWalk,
      title: "Morning Walk",
      language: "en",
      dialect: song2Dialect,
    });
    const joined = text.split("Joined lyrics:\n")[1]?.split("\n\nScore mode:")[0];
    expect(joined).toBe(`[intro]
[verse]
Morning light on the station
I wait for the first train
Coffee steam and a quiet song
Carry me along
[chorus]
Run with me, run with me
Into the open sky
Run with me, run with me
We will learn to fly
[outro]`);
    expect(joined).toContain("Run with me, run with me");
  });

  it("writes the same instruction in Chinese, without a seed line when there is none", () => {
    const text = handoffInstruction({
      original: project,
      current: { ...current, seed: null },
      title: "我的歌",
      language: "zh",
      dialect: song2Dialect,
    });
    expect(text).toContain("标题: 我的歌");
    expect(text).toContain("用 song2 重新生成");
    expect(text).toContain("--text");
    expect(text).toContain("score.abc");
    expect(text).toContain("风格描述:\nrock");
    expect(text).toContain("拼回的歌词:\n[verse]\nnew words\n[chorus]\nha ha");
    expect(text).toContain("乐谱模式: melody");
    expect(text).not.toContain("Seed:");
    expect(text).toContain("改动记录:");
    expect(text).toContain("- 第 1 小节的音符有改动。");
    expect(text).toContain("- 乐谱模式从 完整 改为 旋律。");
    expect(text).toContain("- 种子从 7 改为 无。");
  });

  it("uses the source key as the title when none is given", () => {
    const text = handoffInstruction({ original: project, current, language: "en", dialect: song2Dialect });
    expect(text).toContain("Title: change-log-test");
  });

  it("names the score's file instead of the attachment when scorePath is given", () => {
    const path = "songs/My Song.abc";
    for (const language of ["en", "zh"] as const) {
      const text = handoffInstruction({
        original: project,
        current,
        title: "My Song",
        language,
        dialect: song2Dialect,
        scorePath: path,
      });
      expect(introOf(text)).toBe(
        language === "en"
          ? `Regenerate with song2. Use the score in the file \`${path}\`, passed with --text.`
          : `用 song2 重新生成，乐谱用文件 \`${path}\`，用 --text 传。`,
      );
      expect(text).not.toContain("attached");
      expect(text).not.toContain("附件");
      expect(text).not.toContain("score.abc");
    }
  });

  it("keeps the 0.4.0 intro when scorePath is absent or blank", () => {
    for (const language of ["en", "zh"] as const) {
      const base = { original: project, current, title: "My Song", language, dialect: song2Dialect };
      const absent = handoffInstruction(base);
      const blank = handoffInstruction({ ...base, scorePath: "   " });
      expect(introOf(absent)).toBe(INTRO_040[language]);
      expect(introOf(blank)).toBe(INTRO_040[language]);
      expect(blank).toBe(absent);
    }
  });
});

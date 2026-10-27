// ABOUTME: Seam 5 for App-05: the pre-handoff notices in the review, the rewritten-bar highlight, and the source label.
// ABOUTME: Every case runs on the desktop and phone projects; what a person must see is checked by its box, not only by visibility.
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, test } from "./fixtures";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

/** Two bars, one section, five Vocal notes from C4 to G4. */
const CLEAN = `${HEADER}
K:C
% verse
V: Vocal
C4D4E4F4|G16|`;

/** The same music with no `%` marker. */
const SECTIONLESS = `${HEADER}
K:C
V: Vocal
C4D4E4F4|G16|`;

/** Five notes at B5 (83), above the singable range. */
const HIGH = `${HEADER}
K:C
% verse
V: Vocal
b4b4b4b4|b16|`;

/** A chord on a melody project's first note. */
const CHORD = `${HEADER}
K:C
% verse
V: Vocal
"C"C4D4E4F4|G16|`;

/** Every rule at once: no section, a chord, a melody project, a high voice and one syllable for five notes. */
const ALL_FOUR = `${HEADER}
K:C
V: Vocal
"C"b4b4b4b4|b16|`;

/** The F at the end of bar 1 ties into the F at the start of bar 2. */
const TIED = `${HEADER}
K:C
% verse
V: Vocal
C4D4E4F4-|F4G4A4B4|`;

/** The editor skill's real two-voice score: sections, an Ins voice, Z4 intro runs and Vocal notes up to B5. */
const REAL_SCORE = readFileSync("packages/score-editor/skills/score-editor/assets/edit-one-bar/score.abc", "utf8");

const CLEAN_LINES = [
  { text: "la la la la", phrase: { firstBar: 0, barCount: 1 } },
  { text: "la", phrase: { firstBar: 1, barCount: 1 } },
];
const FEW_LINES = [{ text: "la", phrase: { firstBar: 0, barCount: 1 } }];

const handoffButton = (page: Page, language: "en" | "zh" = "en") =>
  page.getByRole("button", { name: language === "zh" ? "重新生成…" : "Regenerate…", exact: true });

const dialog = (page: Page, language: "en" | "zh" = "en") =>
  page.getByRole("dialog", { name: language === "zh" ? "重新生成前核对" : "Check before regenerating", exact: true });

const noticeLines = (page: Page, language: "en" | "zh" = "en") => dialog(page, language).locator(".sce-handoff-notice");

/** Whether the element's whole box is inside the container's visible box and the window; `toBeVisible` would not say. */
async function inSight(page: Page, target: Locator, container: Locator): Promise<boolean> {
  const area = await box(target);
  const frame = await box(container);
  const viewport = page.viewportSize();
  if (viewport === null) return false;
  return (
    area.x >= frame.x - 1 &&
    area.y >= frame.y - 1 &&
    area.x + area.width <= frame.x + frame.width + 1 &&
    area.y + area.height <= frame.y + frame.height + 1 &&
    area.x >= -1 &&
    area.y >= -1 &&
    area.x + area.width <= viewport.width + 1 &&
    area.y + area.height <= viewport.height + 1
  );
}

async function mountProject(
  harness: Harness,
  score: string,
  options: {
    language?: "en" | "zh";
    lyrics?: string;
    lyricLines?: ReadonlyArray<{ text: string; phrase: { firstBar: number; barCount: number } }>;
    scoreMode?: "full" | "melody";
    scoreFile?: boolean;
    saveAs?: boolean;
  } = {},
) {
  await harness.destroy();
  await harness.mount({
    language: options.language ?? "en",
    score: { text: score },
    project: {
      style: "pop",
      lyrics: options.lyrics ?? "[verse]\nla la la la\nla",
      lyricLines: options.lyricLines ?? CLEAN_LINES,
      scoreMode: options.scoreMode ?? "full",
      seed: 7,
    },
    handoff: true,
    drafts: false,
    ...(options.scoreFile === true ? { scoreFile: { name: "tune.abc" } } : {}),
    ...(options.saveAs === true ? { saveAs: true } : {}),
  });
}

const prehandoffCodes = async (harness: Harness) =>
  (await harness.notices()).map((notice) => notice.code).filter((code) => code.startsWith("prehandoff-"));

test.describe("the pre-handoff notices in the review", () => {
  test("shows one line for each notice, in sight, in English and Chinese", async ({ page, harness }) => {
    const cases = [
      {
        score: SECTIONLESS,
        lines: CLEAN_LINES,
        mode: "full" as const,
        code: "prehandoff-no-sections",
        en: "This score has no sections, so the agent gets no section names.",
        zh: "这份乐谱没有段落，交给 agent 时也就没有段落名。",
      },
      {
        score: CLEAN,
        lines: FEW_LINES,
        mode: "full" as const,
        code: "prehandoff-syllables-far",
        en: "The whole song has 1 syllable and 5 note onsets, 4 apart.",
        zh: "整首有 1 个音节和 5 个音符起点，相差 4 个。",
      },
      {
        score: HIGH,
        lines: CLEAN_LINES,
        mode: "full" as const,
        code: "prehandoff-vocal-range",
        en: "Vocal's median pitch is 83, outside the singable range 60–82.",
        zh: "人声的中位音是 83，不在可唱区间 60–82 内。",
      },
      {
        score: CHORD,
        lines: CLEAN_LINES,
        mode: "melody" as const,
        code: "prehandoff-melody-chords",
        en: "Melody mode cannot carry chords; delete all chords or switch to full.",
        zh: "melody 模式不能带和弦；可以删掉所有和弦，或改回 full。",
      },
    ];
    for (const language of ["en", "zh"] as const) {
      for (const one of cases) {
        await mountProject(harness, one.score, {
          language,
          lyricLines: one.lines,
          scoreMode: one.mode,
        });
        await handoffButton(page, language).click();
        await expect(noticeLines(page, language)).toHaveText([language === "en" ? one.en : one.zh]);
        expect(await inSight(page, noticeLines(page, language).first(), dialog(page, language))).toBe(true);
        expect(await prehandoffCodes(harness)).toEqual([one.code]);
        await page.keyboard.press("Escape");
      }
    }
  });

  test("shows all four lines and reports each code once", async ({ page, harness }) => {
    await mountProject(harness, ALL_FOUR, { lyricLines: FEW_LINES, scoreMode: "melody" });
    await handoffButton(page).click();
    await expect(noticeLines(page)).toHaveCount(4);
    const lines = await noticeLines(page).allTextContents();
    expect(lines).toEqual([
      "This score has no sections, so the agent gets no section names.",
      "The whole song has 1 syllable and 5 note onsets, 4 apart.",
      "Vocal's median pitch is 83, outside the singable range 60–82.",
      "Melody mode cannot carry chords; delete all chords or switch to full.",
    ]);
    for (const line of await noticeLines(page).all()) {
      expect(await inSight(page, line, dialog(page))).toBe(true);
    }
    expect(await prehandoffCodes(harness)).toEqual([
      "prehandoff-no-sections",
      "prehandoff-syllables-far",
      "prehandoff-vocal-range",
      "prehandoff-melody-chords",
    ]);
  });

  test("shows its lines on a real score, in sight, in English and Chinese", async ({ page, harness }) => {
    for (const language of ["en", "zh"] as const) {
      await mountProject(harness, REAL_SCORE, { language, lyrics: "", lyricLines: [] });
      await handoffButton(page, language).click();
      await expect(noticeLines(page, language)).toHaveText([
        language === "zh"
          ? "整首有 0 个音节和 25 个音符起点，相差 25 个。"
          : "The whole song has 0 syllables and 25 note onsets, 25 apart.",
        language === "zh"
          ? "人声的中位音是 83，不在可唱区间 60–82 内。"
          : "Vocal's median pitch is 83, outside the singable range 60–82.",
      ]);
      for (const line of await noticeLines(page, language).all()) {
        expect(await inSight(page, line, dialog(page, language))).toBe(true);
      }
      expect(await prehandoffCodes(harness)).toEqual(["prehandoff-syllables-far", "prehandoff-vocal-range"]);
      await page.keyboard.press("Escape");
    }
  });

  test("shows no line and sends no notice for a clean project", async ({ page, harness }) => {
    await mountProject(harness, CLEAN);
    await handoffButton(page).click();
    await expect(noticeLines(page)).toHaveCount(0);
    expect(await prehandoffCodes(harness)).toEqual([]);
  });

  test("follows an edit while the review stays open and reports only on opening", async ({ page, harness }) => {
    await mountProject(harness, CLEAN);
    await handoffButton(page).click();
    await expect(noticeLines(page)).toHaveCount(0);
    expect(await prehandoffCodes(harness)).toEqual([]);

    await harness.update({ score: { text: HIGH } });
    await expect(noticeLines(page)).toHaveText(["Vocal's median pitch is 83, outside the singable range 60–82."]);
    expect(await prehandoffCodes(harness)).toEqual([]);

    await page.keyboard.press("Escape");
    await handoffButton(page).click();
    await expect(noticeLines(page)).toHaveCount(1);
    expect(await prehandoffCodes(harness)).toEqual(["prehandoff-vocal-range"]);
  });
});

test.describe("the rewritten bars in the change log", () => {
  const note = (page: Page, name: string | RegExp) =>
    page.getByRole("list", { name: "Vocal" }).getByRole("listitem", { name });

  test("highlights the entry of a one-bar edit, in sight", async ({ page, harness }) => {
    await mountProject(harness, CLEAN);
    await note(page, /^F4, bar 1 beat 4/).click();
    await page.keyboard.press("Delete");
    await handoffButton(page).click();
    const entry = dialog(page).locator(".sce-handoff-changes li[data-rewritten]");
    await expect(entry).toHaveText(["The notes of bar 1 changed."]);
    expect(await inSight(page, entry, dialog(page))).toBe(true);
  });

  test("highlights both bars a tied edit rewrote, in English and Chinese", async ({ page, harness }) => {
    for (const language of ["en", "zh"] as const) {
      await mountProject(harness, TIED, { language });
      const tied = language === "zh" ? /^F4，第 1 小节第 4 拍/ : /^F4, bar 1 beat 4/;
      await note(page, tied).click();
      await page.keyboard.press("Delete");
      await handoffButton(page, language).click();
      const entry = dialog(page, language).locator(".sce-handoff-changes li[data-rewritten]");
      await expect(entry).toHaveText([
        language === "zh" ? "第 1–2 小节的音符有改动。" : "The notes of bars 1–2 changed.",
      ]);
      expect(await inSight(page, entry, dialog(page, language))).toBe(true);
      await page.keyboard.press("Escape");
    }
  });
});

test.describe("the source label", () => {
  const label = (page: Page) => page.locator(".sce-source-label");
  const strip = (page: Page) => page.locator(".sce-tools");
  const bar = (page: Page) => page.locator(".sce-bar");

  test("says where the edits go at every width, in English and Chinese", async ({ page, harness, isMobile }) => {
    const widths = isMobile ? ([412, 360, 320] as const) : ([1280] as const);
    for (const language of ["en", "zh"] as const) {
      for (const [width, kind, text] of widths.flatMap((at) => [
        [at, "generated", language === "zh" ? "生成的乐谱（原版保留）" : "Generated score (original kept)"] as const,
        [at, "file", language === "zh" ? "乐谱文件（存回原文件）" : "Score file (saves to the file)"] as const,
      ])) {
        await page.setViewportSize({ width, height: 720 });
        await mountProject(harness, CLEAN, { language, scoreFile: kind === "file" });
        await expect(label(page)).toHaveText(text);
        expect(await inSight(page, label(page), strip(page))).toBe(true);
        const toolbar = await box(page.locator(".sce-toolbar"));
        if (width === 1280) {
          // One row: the bar shares the strip's line.
          expect(toolbar.height).toBeLessThanOrEqual(45);
        } else {
          // Two rows: the bar sits on its own line under the strip, and the whole toolbar stays within its budget.
          const stripBox = await box(strip(page));
          const barBox = await box(bar(page));
          expect(barBox.y).toBeGreaterThanOrEqual(stripBox.y + stripBox.height - 1);
          expect(toolbar.height).toBeLessThanOrEqual(width === 320 ? 96 : 89);
        }
      }
    }
  });

  test("follows the language switch and a source that changes after Save as", async ({ page, harness }) => {
    await page.setViewportSize({ width: 412, height: 720 });
    await mountProject(harness, CLEAN, { saveAs: true });
    await expect(label(page)).toHaveText("Generated score (original kept)");
    await harness.update({ language: "zh" });
    await expect(label(page)).toHaveText("生成的乐谱（原版保留）");
    await harness.update({ scoreFile: { name: "tune.abc" }, project: { style: "pop" } });
    await expect(label(page)).toHaveText("乐谱文件（存回原文件）");
  });
});

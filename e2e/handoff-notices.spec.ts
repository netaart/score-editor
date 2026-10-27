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

/** Five notes at C3 (48), below the singable range. */
const LOW = `${HEADER}
K:C
% verse
V: Vocal
C,4C,4C,4C,4|C,16|`;

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
  page.getByRole("button", { name: language === "zh" ? "交给 agent…" : "Hand to agent…", exact: true });

const dialog = (page: Page, language: "en" | "zh" = "en") =>
  page.getByRole("dialog", {
    name: language === "zh" ? "交给 agent 前核对" : "Check before you hand to agent",
    exact: true,
  });

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
    /** Leave `lyricLines` off the project, so the legacy `lyrics` text is laid out by the editor. */
    legacyLyrics?: boolean;
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
      ...(options.legacyLyrics === true ? {} : { lyricLines: options.lyricLines ?? CLEAN_LINES }),
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

const noticeLead = (page: Page, language: "en" | "zh" = "en") =>
  dialog(page, language).locator(".sce-handoff-notices-lead");

const markedLegend = (page: Page, language: "en" | "zh" = "en") =>
  dialog(page, language).locator(".sce-handoff-marked");

const sourceLine = (page: Page, language: "en" | "zh" = "en") => dialog(page, language).locator(".sce-handoff-source");

const toolbarLive = (page: Page) => page.locator(".sce-part-toolbar .sce-sr-only[role=status]");

test.describe("the pre-handoff notices in the review", () => {
  test("shows one line for each notice, in sight, in English and Chinese", async ({ page, harness }) => {
    const cases = [
      {
        score: SECTIONLESS,
        lines: CLEAN_LINES,
        mode: "full" as const,
        code: "prehandoff-no-sections",
        en: "This score has no sections, so the new song has no section names. Click the “Unnamed” bar above the notes and choose “Name this section”.",
        zh: "这份乐谱没有段落，新歌就没有段落名。点乐谱上方的“未命名”段落条，选“给这段命名”。",
      },
      {
        score: CLEAN,
        lines: FEW_LINES,
        mode: "full" as const,
        code: "prehandoff-syllables-far",
        en: "The lyrics have 1 syllable, but the melody has 5 notes. Check that each lyric line fits its notes.",
        zh: "歌词有 1 个音节，旋律有 5 个音。请检查每行歌词是否对上它的音符。",
      },
      {
        score: HIGH,
        lines: CLEAN_LINES,
        mode: "full" as const,
        code: "prehandoff-vocal-range",
        en: "The vocal's middle note is B5, above its singable range (C4 to A#5). Lower it with the Voice octave tool.",
        zh: "人声的中间音是 B5，高于可唱范围（C4 至 A#5）。可用人声移八度工具降下来。",
      },
      {
        score: CHORD,
        lines: CLEAN_LINES,
        mode: "melody" as const,
        code: "prehandoff-melody-chords",
        en: "The score mode is Melody, but the score has chords. Delete the chords, or change Score mode to Full.",
        zh: "乐谱模式是旋律，但乐谱里有和弦。删掉和弦，或把乐谱模式改为完整。",
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

  test("shows lines in the unaligned area with their first words, in both languages", async ({ page, harness }) => {
    const lyrics = "[Missing]\noh it is a long way\nlost";
    for (const language of ["en", "zh"] as const) {
      await mountProject(harness, CLEAN, { language, lyrics, legacyLyrics: true });
      await handoffButton(page, language).click();
      await expect(noticeLines(page, language)).toHaveText([
        language === "zh"
          ? "有 2 行歌词没有对上小节：“oh it is a…”、“lost”。请把它们放到小节上或删掉；拼回的歌词里没有这些行。"
          : "2 lyric lines are not aligned to a bar: “oh it is a…”, “lost”. Put them on bars or delete them; the joined lyrics leave them out.",
      ]);
      expect(await inSight(page, noticeLines(page, language).first(), dialog(page, language))).toBe(true);
      expect(await prehandoffCodes(harness)).toEqual(["prehandoff-lyrics-unaligned"]);
      await page.keyboard.press("Escape");
    }
  });

  test("shows all four lines and reports each code once", async ({ page, harness }) => {
    await mountProject(harness, ALL_FOUR, { lyricLines: FEW_LINES, scoreMode: "melody" });
    await handoffButton(page).click();
    await expect(noticeLines(page)).toHaveCount(4);
    const lines = await noticeLines(page).allTextContents();
    expect(lines).toEqual([
      "This score has no sections, so the new song has no section names. Click the “Unnamed” bar above the notes and choose “Name this section”.",
      "The lyrics have 1 syllable, but the melody has 5 notes. Check that each lyric line fits its notes.",
      "The vocal's middle note is B5, above its singable range (C4 to A#5). Lower it with the Voice octave tool.",
      "The score mode is Melody, but the score has chords. Delete the chords, or change Score mode to Full.",
    ]);
    await expect(noticeLead(page)).toHaveText("4 things to check before you hand to agent");
    for (const line of await noticeLines(page).all()) {
      expect(await inSight(page, line, dialog(page))).toBe(true);
    }
    const order = await dialog(page).evaluate((el) =>
      [...el.querySelectorAll(".sce-handoff-notices, .sce-handoff-log-label, .sce-handoff-changes")].map(
        (child) => child.className,
      ),
    );
    expect(order[0]).toContain("sce-handoff-notices");
    const [noticeColour, textColour] = await Promise.all([
      noticeLines(page)
        .first()
        .evaluate((el) => getComputedStyle(el).color),
      noticeLines(page)
        .first()
        .evaluate((el) => getComputedStyle(el.closest(".sce-handoff-popover") as Element).color),
    ]);
    expect(noticeColour).toBe(textColour);
    expect(
      await noticeLines(page)
        .first()
        .evaluate((el) => getComputedStyle(el).textWrap),
    ).toBe("pretty");
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
          ? "歌词有 0 个音节，旋律有 25 个音。请检查每行歌词是否对上它的音符。"
          : "The lyrics have 0 syllables, but the melody has 25 notes. Check that each lyric line fits its notes.",
        language === "zh"
          ? "人声的中间音是 B5，高于可唱范围（C4 至 A#5）。可用人声移八度工具降下来。"
          : "The vocal's middle note is B5, above its singable range (C4 to A#5). Lower it with the Voice octave tool.",
      ]);
      for (const line of await noticeLines(page, language).all()) {
        expect(await inSight(page, line, dialog(page, language))).toBe(true);
      }
      expect(await prehandoffCodes(harness)).toEqual(["prehandoff-syllables-far", "prehandoff-vocal-range"]);
      await page.keyboard.press("Escape");
    }
  });

  test("names the vocal's middle note below the range, in both languages", async ({ page, harness }) => {
    for (const language of ["en", "zh"] as const) {
      await mountProject(harness, LOW, { language });
      await handoffButton(page, language).click();
      await expect(noticeLines(page, language)).toHaveText([
        language === "zh"
          ? "人声的中间音是 C3，低于可唱范围（C4 至 A#5）。可用人声移八度工具升上去。"
          : "The vocal's middle note is C3, below its singable range (C4 to A#5). Raise it with the Voice octave tool.",
      ]);
      await page.keyboard.press("Escape");
    }
  });

  test("leads with the count in both languages, and the Chinese melody line has no English", async ({
    page,
    harness,
  }) => {
    await mountProject(harness, ALL_FOUR, { language: "zh", lyricLines: FEW_LINES, scoreMode: "melody" });
    await handoffButton(page, "zh").click();
    await expect(noticeLead(page, "zh")).toHaveText("交给 agent 前有 4 处要看");
    const melody = noticeLines(page, "zh").last();
    await expect(melody).toHaveText("乐谱模式是旋律，但乐谱里有和弦。删掉和弦，或把乐谱模式改为完整。");
    expect(await melody.textContent()).not.toMatch(/[A-Za-z]/);
  });

  test("shows no line and sends no notice for a clean project", async ({ page, harness }) => {
    await mountProject(harness, CLEAN);
    await handoffButton(page).click();
    await expect(noticeLines(page)).toHaveCount(0);
    await expect(markedLegend(page)).toBeHidden();
    expect(await prehandoffCodes(harness)).toEqual([]);
  });

  test("follows an edit while the review stays open and reports only on opening", async ({ page, harness }) => {
    await mountProject(harness, CLEAN);
    await handoffButton(page).click();
    await expect(noticeLines(page)).toHaveCount(0);
    await expect(markedLegend(page)).toBeHidden();
    expect(await prehandoffCodes(harness)).toEqual([]);

    await harness.update({ score: { text: HIGH } });
    await expect(noticeLines(page)).toHaveText([
      "The vocal's middle note is B5, above its singable range (C4 to A#5). Lower it with the Voice octave tool.",
    ]);
    expect(await prehandoffCodes(harness)).toEqual([]);

    await page.keyboard.press("Escape");
    await handoffButton(page).click();
    await expect(noticeLines(page)).toHaveCount(1);
    expect(await prehandoffCodes(harness)).toEqual(["prehandoff-vocal-range"]);
  });
});

test.describe("the review's announcements and actions", () => {
  test("describes itself with the notices and the change list, and says the lead once on opening", async ({
    page,
    harness,
  }) => {
    await mountProject(harness, ALL_FOUR, { lyricLines: FEW_LINES, scoreMode: "melody" });
    await handoffButton(page).click();
    const described = (await dialog(page).getAttribute("aria-describedby"))?.split(" ") ?? [];
    const noticeId = await dialog(page).locator(".sce-handoff-notices").getAttribute("id");
    const emptyId = await dialog(page).locator(".sce-handoff-empty").getAttribute("id");
    expect(described).toContain(noticeId);
    expect(described).toContain(emptyId);
    await expect(toolbarLive(page)).toHaveText("4 things to check before you hand to agent");

    await harness.update({ score: { text: CLEAN } });
    await expect(noticeLines(page)).toHaveCount(1);
    await expect(toolbarLive(page)).toHaveText("4 things to check before you hand to agent");
  });

  test("shares one row at 320 and gives both actions the coarse-pointer height", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "the 320 phone row and the coarse pointer are the phone project's");
    await page.setViewportSize({ width: 320, height: 720 });
    await mountProject(harness, ALL_FOUR, { lyricLines: FEW_LINES, scoreMode: "melody" });
    await handoffButton(page).click();
    const cancel = dialog(page).getByRole("button", { name: "Cancel", exact: true });
    const confirm = dialog(page).getByRole("button", { name: "Hand to agent", exact: true });
    const [cancelBox, confirmBox] = await Promise.all([box(cancel), box(confirm)]);
    expect(Math.abs(cancelBox.y - confirmBox.y)).toBeLessThanOrEqual(2);
    expect(cancelBox.height).toBeGreaterThanOrEqual(36);
    expect(confirmBox.height).toBeGreaterThanOrEqual(36);
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
    const style = await entry.evaluate((el) => {
      const own = getComputedStyle(el);
      const dot = getComputedStyle(el, "::before");
      return {
        weight: own.fontWeight,
        border: own.borderInlineStartWidth,
        background: own.backgroundColor,
        image: own.backgroundImage,
        listStyle: own.listStyleType,
        dotWidth: dot.width,
        dotColour: dot.backgroundColor,
        textColour: own.color,
      };
    });
    expect(style.weight).toBe("600");
    expect(style.border).toBe("0px");
    expect(style.background).toBe("rgba(0, 0, 0, 0)");
    expect(style.image).toBe("none");
    expect(style.listStyle).toBe("none");
    expect(style.dotWidth).toBe("6px");
    expect(style.dotColour).toBe(style.textColour);
    await expect(markedLegend(page)).toHaveText("Marked: changed by your last step.");
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
      await expect(markedLegend(page, language)).toHaveText(
        language === "zh" ? "带标记的条目是你上一步改动的。" : "Marked: changed by your last step.",
      );
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
        const labelStyle = await label(page).evaluate((el) => {
          const own = getComputedStyle(el);
          return {
            border: own.borderTopWidth,
            radius: own.borderTopLeftRadius,
            height: el.getBoundingClientRect().height,
            line: Number.parseFloat(own.lineHeight),
          };
        });
        expect(labelStyle.border).toBe("0px");
        expect(labelStyle.radius).toBe("0px");
        if (width <= 480) expect(labelStyle.height).toBeGreaterThanOrEqual(labelStyle.line * 1.7);
        else expect(labelStyle.height).toBeLessThanOrEqual(labelStyle.line * 1.5);
        const toolbar = await box(page.locator(".sce-toolbar"));
        const stripBox = await box(strip(page));
        const barBox = await box(bar(page));
        if (width === 1280) {
          // Wrapped desktop: the label is first in a strip that shows every control, and the bar is its own line under it.
          expect(
            await strip(page).evaluate((el) => el.firstElementChild?.classList.contains("sce-source-label")),
            "the source label is the strip's first item",
          ).toBe(true);
          expect(
            await strip(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            "the wrapped strip does not scroll",
          ).toBe(true);
          expect(barBox.y).toBeGreaterThanOrEqual(stripBox.y + stripBox.height - 1);
          expect(toolbar.height).toBeGreaterThan(45);
          expect(toolbar.height).toBeLessThanOrEqual(stripBox.height + barBox.height + 4);
        } else {
          // Two rows: the bar sits on its own line under the strip, and the whole toolbar stays within its budget.
          expect(barBox.y).toBeGreaterThanOrEqual(stripBox.y + stripBox.height - 1);
          expect(toolbar.height).toBeLessThanOrEqual(width === 320 ? 96 : 89);
        }
      }
    }
  });

  test("names the three source states on the review's first line, in both languages", async ({ page, harness }) => {
    for (const language of ["en", "zh"] as const) {
      await mountProject(harness, CLEAN, { language });
      await handoffButton(page, language).click();
      await expect(sourceLine(page, language)).toHaveText(
        language === "zh"
          ? "原版会保留。改过的版本会放进聊天输入框，由你发出。"
          : "Your original is kept. Your edited version goes into the chat box; you send it.",
      );
      await expect(sourceLine(page, language)).toBeInViewport();
      await page.keyboard.press("Escape");

      await mountProject(harness, CLEAN, { language, scoreFile: true });
      await handoffButton(page, language).click();
      await expect(sourceLine(page, language)).toHaveText(
        language === "zh"
          ? "tune.abc 已保存。歌曲会放进聊天输入框，由你发出。"
          : "tune.abc is saved. The song goes into the chat box; you send it.",
      );
      await page.keyboard.press("Escape");

      await mountProject(harness, CLEAN, { language, scoreFile: true });
      await page.getByRole("list", { name: "Vocal" }).getByRole("listitem", { name: /F4/ }).click();
      await page.keyboard.press("Delete");
      await handoffButton(page, language).click();
      await expect(sourceLine(page, language)).toHaveText(
        language === "zh"
          ? "先保存 tune.abc，再把歌曲放进聊天输入框。"
          : "Saves tune.abc first, then puts the song in the chat box.",
      );
      await page.keyboard.press("Escape");
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
    await expect(toolbarLive(page)).toHaveText("乐谱文件（存回原文件）");
  });
});

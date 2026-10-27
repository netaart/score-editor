// ABOUTME: Seam 5 for the one-action notice a failed save and a refused handoff draw in the chrome.
// ABOUTME: The sentence is in sight, Save again saves, and the banner leaves with the next successful save.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, test, vocalOnly } from "./fixtures";

const QUARTERS = vocalOnly("C4D4E4F4|G16|");
const THEIR_SCORE = QUARTERS.replace("C4D4E4F4|G16|", "C4D4E4G4|A16|");
const D4 = /^D4[,，]/;

const noteNamed = (page: Page, pitch: RegExp) => page.getByRole("listitem", { name: pitch });
const notice = (page: Page) => page.locator(".sce-save-notice");
const action = (page: Page, language: "en" | "zh") =>
  notice(page).getByRole("button", { name: language === "zh" ? "重新保存" : "Save again", exact: true });
const handoffTrigger = (page: Page, language: "en" | "zh") =>
  page.getByRole("button", { name: language === "zh" ? "重新生成…" : "Regenerate…", exact: true });
const handoffConfirm = (page: Page, language: "en" | "zh") =>
  page.getByRole("button", {
    name: language === "zh" ? "用这版重新生成" : "Regenerate with this version",
    exact: true,
  });

const recovery = {
  en: "The score file was not saved. Your changes are still here; try Save again.",
  zh: "乐谱文件没有保存成功，你的修改还在，再按保存试一次。",
} as const;
const notSent = {
  en: "Not sent: the score file was not saved. Try again, then regenerate.",
  zh: "未发送：乐谱文件没有保存成功。再试一次，然后重新生成。",
} as const;

async function deleteD(page: Page, press: (target: Locator) => Promise<void>): Promise<void> {
  await press(noteNamed(page, D4));
  await page.keyboard.press("Delete");
}

/** The visible box of the chrome, to tell a sentence in sight from one scrolled out of it. */
async function chromeVisibleBox(page: Page) {
  const chrome = page.locator(".sce-chrome");
  return chrome.evaluate((el) => {
    const frame = el.getBoundingClientRect();
    return {
      left: frame.left,
      right: frame.left + el.clientWidth,
      top: frame.top,
      bottom: frame.top + el.clientHeight,
      scrollTop: el.scrollTop,
    };
  });
}

async function assertSentenceInChrome(page: Page, where: string): Promise<void> {
  await expect(notice(page)).toBeVisible();
  const sentence = notice(page).getByRole("alert");
  await expect(sentence).toBeVisible();
  const sentenceBox = await box(sentence);
  const chrome = await chromeVisibleBox(page);
  expect(sentenceBox.y, `${where}: the sentence starts in the chrome`).toBeGreaterThanOrEqual(chrome.top - 0.5);
  expect(sentenceBox.y + sentenceBox.height, `${where}: the sentence ends in the chrome`).toBeLessThanOrEqual(
    chrome.bottom + 0.5,
  );
  expect(sentenceBox.x, `${where}: the sentence starts in the chrome`).toBeGreaterThanOrEqual(chrome.left - 0.5);
  expect(sentenceBox.x + sentenceBox.width, `${where}: the sentence ends in the chrome`).toBeLessThanOrEqual(
    chrome.right + 0.5,
  );
}

async function openFile(harness: Harness, language: "en" | "zh", handoff = false): Promise<void> {
  await harness.mount({
    score: { text: QUARTERS },
    scoreFile: { name: "tune.abc" },
    handoff,
    language,
  });
}

for (const language of ["en", "zh"] as const) {
  test(`a failed save, ${language}: the sentence is in the chrome and Save again saves`, async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.setTimeout(180_000);
    const widths = isMobile ? [412, 360, 320] : [1280];
    for (const width of widths) {
      await page.goto("/");
      await page.setViewportSize({ width, height: isMobile ? 839 : 720 });
      await harness.stageHeight(420);
      await openFile(harness, language);
      await deleteD(page, press);
      await harness.failScoreNext("save");
      await press(page.locator(".sce-save-button"));
      const where = `failed save ${language} ${width}`;
      await expect(notice(page).getByRole("alert")).toHaveText(recovery[language]);
      await assertSentenceInChrome(page, where);
      await press(action(page, language));
      await expect.poll(async () => (await harness.scoreCalls()).length).toBe(2);
      await expect(notice(page)).toBeHidden();
      await expect(page.locator(".sce-save-button")).toHaveAttribute("aria-label", language === "zh" ? "保存" : "Save");
      await expect(page.locator(".sce-part-toolbar .sce-sr-only[role=status]")).toHaveText(
        language === "zh" ? "已保存" : "Saved",
      );
    }
  });

  test(`a handoff refused by a failed save, ${language}: it says it was not sent`, async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.setTimeout(180_000);
    const widths = isMobile ? [412, 320] : [1280];
    for (const width of widths) {
      await page.goto("/");
      await page.setViewportSize({ width, height: isMobile ? 839 : 720 });
      await harness.stageHeight(420);
      await openFile(harness, language, true);
      await deleteD(page, press);
      await harness.failScoreNext("save");
      await press(handoffTrigger(page, language));
      await press(handoffConfirm(page, language));
      const where = `handoff failed ${language} ${width}`;
      await expect(notice(page).getByRole("alert")).toHaveText(notSent[language]);
      await assertSentenceInChrome(page, where);
      expect(await harness.handoffs()).toEqual([]);
      await press(action(page, language));
      await expect.poll(async () => (await harness.scoreCalls()).length).toBe(2);
      await expect(notice(page)).toBeHidden();
    }
  });

  test(`a handoff refused by a conflict, ${language}: the conflict banner is the one that speaks`, async ({
    page,
    harness,
    press,
  }) => {
    await page.setViewportSize({ width: 412, height: 839 });
    await harness.stageHeight(420);
    await openFile(harness, language, true);
    await deleteD(page, press);
    await harness.externalScore(THEIR_SCORE);
    await press(handoffTrigger(page, language));
    await press(handoffConfirm(page, language));
    await expect(page.locator(".sce-save-conflict")).toBeVisible();
    await expect(page.locator(".sce-draft-choose")).toBeVisible();
    await expect(notice(page)).toBeHidden();
    expect(await harness.handoffs()).toEqual([]);
  });
}

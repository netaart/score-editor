// ABOUTME: Seam 5 for the handoff: the change log and the trigger in the mounted editor, on the desktop and phone projects.
// ABOUTME: Every current project comes from a draft the fake store returns, so the log is read from the difference, not from a command.
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { box, expect, type Harness, test } from "./fixtures";

const HEADER = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"`;

const VERSE = `% verse
V: Vocal
"C"C4D4E4F4|G16|`;
const CHORUS = `% chorus
V: Vocal
A16|B16|`;
const SCORE = `${HEADER}
K:C
${VERSE}
${CHORUS}`;
const SCORE_WITHOUT_CHORUS = `${HEADER}
K:C
${VERSE}`;
const SCORE_WITH_TWO_CHORUSES = `${SCORE}
${CHORUS}`;
const SCORE_WITH_VERSE_MOVED = `${HEADER}
K:C
${CHORUS}
${VERSE}`;
const SCORE_RENAMED = SCORE.replace("% chorus", "% outro");

/**
 * The score with a different tempo, meter, key and chord, one changed lyric line, and the other project fields changed.
 * `K:Am` keeps every written pitch where it was, so only the named kinds differ.
 */
const SCORE_CHANGED_FIELDS = `${HEADER.replace("M:4/4", "M:2/2").replace("Q:1/4=120", "Q:1/4=140")}
K:Am
% verse
V: Vocal
"Am"C4D4E4F4|G16|
${CHORUS}`;

const LYRICS = "[verse]\nla la\n[chorus]\nha ha";
const LINES = [
  { text: "la la", phrase: { firstBar: 0, barCount: 1 } },
  { text: "ha ha", phrase: { firstBar: 2, barCount: 1 } },
];
const CHANGED_LYRICS = "[verse]\nnew words\n[chorus]\nha ha";
const CHANGED_LINES = [
  { text: "new words", phrase: { firstBar: 0, barCount: 1 } },
  { text: "ha ha", phrase: { firstBar: 2, barCount: 1 } },
];

const KEY = "test-page";

const hashOf = (lyrics: string, score: string) =>
  createHash("sha256")
    .update(JSON.stringify([lyrics, score]), "utf8")
    .digest("hex");

interface DraftProject {
  style: string;
  lyrics: string;
  lyricLines: ReadonlyArray<{ text: string; phrase: { firstBar: number; barCount: number } | null }>;
  score: string;
  scoreMode: "full" | "melody";
  seed: number | null;
}

/** A stored draft the way the host would have written it, with the source hash worked out here. */
function storedDraft(project: Partial<DraftProject> = {}): string {
  return JSON.stringify({
    version: 1,
    sourceKey: KEY,
    sourceHash: hashOf(LYRICS, SCORE),
    project: {
      style: "pop",
      lyrics: LYRICS,
      lyricLines: LINES,
      score: SCORE,
      scoreMode: "full",
      seed: 7,
      ...project,
    },
    handoffHash: null,
    updatedAt: 1_000,
  });
}

/** Twelve one-bar sections, all renamed in the draft, so the review has a twelve-line change log. */
function manySections(prefix: string): string {
  const sections = Array.from({ length: 12 }, (_item, index) => `% ${prefix}${index + 1}\nV: Vocal\nC16|`);
  return `${HEADER}\nK:C\n${sections.join("\n")}`;
}

interface PageStore {
  seed(key: string, text: string): string;
  external(key: string, text: string): string;
  failNext(method: "read" | "write" | "remove" | "list", count?: number): void;
  holdWrite(): void;
  releaseWrite(): void;
}

type PageWithStore = { harness: { drafts: PageStore } };

function seed(page: Page, text: string) {
  return page.evaluate(
    ([key, body]: readonly [string, string]) => (window as unknown as PageWithStore).harness.drafts.seed(key, body),
    [KEY, text] as const,
  );
}

function external(page: Page, text: string) {
  return page.evaluate(
    ([key, body]: readonly [string, string]) => (window as unknown as PageWithStore).harness.drafts.external(key, body),
    [KEY, text] as const,
  );
}

function failNext(page: Page, method: "read" | "write" | "remove" | "list") {
  return page.evaluate(
    (kind: "read" | "write" | "remove" | "list") => (window as unknown as PageWithStore).harness.drafts.failNext(kind),
    method,
  );
}

function holdWrite(page: Page) {
  return page.evaluate(() => (window as unknown as PageWithStore).harness.drafts.holdWrite());
}

function releaseWrite(page: Page) {
  return page.evaluate(() => (window as unknown as PageWithStore).harness.drafts.releaseWrite());
}

async function openEditor(harness: Harness, draft: string, options: Record<string, unknown> = {}) {
  await seed(harness.page, draft);
  await harness.mount({
    score: { text: SCORE },
    project: { style: "pop", lyrics: LYRICS, scoreMode: "full", seed: 7 },
    handoff: true,
    drafts: true,
    title: "My Song",
    ...options,
  });
}

const handoffButton = (page: Page, language: "en" | "zh" = "en") =>
  page.getByRole("button", { name: language === "zh" ? "重新生成…" : "Regenerate…", exact: true });

const dialog = (page: Page, language: "en" | "zh" = "en") =>
  page.getByRole("dialog", { name: language === "zh" ? "重新生成前核对" : "Check before regenerating", exact: true });

const changeList = (page: Page, language: "en" | "zh" = "en") =>
  dialog(page, language).getByRole("list", { name: language === "zh" ? "改动记录" : "Changes", exact: true });

const confirmButton = (page: Page, language: "en" | "zh" = "en") =>
  page.getByRole("button", {
    name: language === "zh" ? "用这版重新生成" : "Regenerate with this version",
    exact: true,
  });

const cancelButton = (page: Page, language: "en" | "zh" = "en") =>
  dialog(page, language).getByRole("button", { name: language === "zh" ? "取消" : "Cancel", exact: true });

test.describe("the change log in the mounted editor", () => {
  test("lists the section changes a draft carries", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE_WITHOUT_CHORUS }));
    await handoffButton(page).click();
    await expect(changeList(page).getByRole("listitem")).toHaveText(["Removed section “chorus”."]);
  });

  test("lists a copied section", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE_WITH_TWO_CHORUSES }));
    await handoffButton(page).click();
    await expect(changeList(page).getByRole("listitem")).toHaveText(["Copied section “chorus”."]);
  });

  test("lists a moved section", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE_WITH_VERSE_MOVED }));
    await handoffButton(page).click();
    await expect(changeList(page).getByRole("listitem")).toHaveText(["Moved section “verse”."]);
  });

  test("lists a renamed section", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE_RENAMED }));
    await handoffButton(page).click();
    await expect(changeList(page).getByRole("listitem")).toHaveText(["Renamed section “chorus” to “outro”."]);
  });

  test("lists tempo, key, meter, chords, lyrics, style, score mode and seed in Chinese", async ({ page, harness }) => {
    await openEditor(
      harness,
      storedDraft({
        score: SCORE_CHANGED_FIELDS,
        lyrics: CHANGED_LYRICS,
        lyricLines: CHANGED_LINES,
        style: "rock",
        scoreMode: "melody",
        seed: 9,
      }),
      { language: "zh" },
    );
    await handoffButton(page, "zh").click();
    await expect(changeList(page, "zh").getByRole("listitem")).toHaveText([
      "速度从 120 改为 140 BPM。",
      "调从 C 改为 Am。",
      "第 1–4 小节的拍号改为 2/2。",
      "和弦有改动。",
      "歌词有改动。",
      "风格描述有改动。",
      "乐谱模式从 完整（full） 改为 旋律（melody）。",
      "种子从 7 改为 9。",
    ]);
  });

  test("lists the bars whose notes changed", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }));
    await handoffButton(page).click();
    await expect(changeList(page).getByRole("listitem")).toHaveText(["The notes of bar 1 changed."]);
  });

  test("says the score text was edited directly when the text changed and the score did not", async ({
    page,
    harness,
  }) => {
    await openEditor(harness, storedDraft({ score: `${SCORE}\n` }));
    await handoffButton(page).click();
    await expect(changeList(page).getByRole("listitem")).toHaveText(["Edited the score text directly."]);
  });
});

test.describe("handing off", () => {
  test("saves the draft with the handoff hash before the callback gets the attachment, instruction and project", async ({
    page,
    harness,
  }) => {
    const changedScore = SCORE.replace("C4D4E4F4", "C4E4E4F4");
    await openEditor(harness, storedDraft({ score: changedScore }));
    await handoffButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(changeList(page).getByRole("listitem")).toHaveText(["The notes of bar 1 changed."]);
    await confirmButton(page).click();

    await expect.poll(async () => (await harness.handoffs()).length).toBe(1);
    const handoff = (await harness.handoffs())[0];
    if (handoff === undefined) throw new Error("the host callback did not run");
    expect(handoff.payload.attachment).toEqual({
      name: "score.abc",
      mediaType: "text/plain",
      text: changedScore,
    });
    expect(handoff.payload.project.score).toBe(changedScore);
    expect(handoff.payload.instruction).toContain("Title: My Song");
    expect(handoff.payload.instruction).toContain("Regenerate with song2");
    expect(handoff.payload.instruction).toContain("--text");
    expect(handoff.payload.instruction).toContain("score.abc");
    expect(handoff.payload.instruction).toContain("Style description:\npop");
    expect(handoff.payload.instruction).toContain("Joined lyrics:\n[verse]\nla la\n[chorus]\nha ha");
    expect(handoff.payload.instruction).toContain("Score mode: full");
    expect(handoff.payload.instruction).toContain("Seed: 7");
    expect(handoff.payload.instruction).toContain("- The notes of bar 1 changed.");

    const writes = handoff.calls.filter((call) => call.method === "write");
    expect(writes).toHaveLength(1);
    const stored = JSON.parse(String(writes[0]?.text)) as {
      project: { score: string };
      handoffHash: string | null;
    };
    expect(stored.project.score).toBe(changedScore);
    expect(stored.handoffHash).toBe(hashOf("[verse]\nla la\n[chorus]\nha ha", changedScore));
  });

  test("writes the instruction in the interface language", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }), {
      language: "zh",
      title: "我的歌",
    });
    await handoffButton(page, "zh").click();
    await confirmButton(page, "zh").click();
    await expect.poll(async () => (await harness.handoffs()).length).toBe(1);
    const handoff = (await harness.handoffs())[0];
    if (handoff === undefined) throw new Error("the host callback did not run");
    expect(handoff.payload.instruction).toContain("标题: 我的歌");
    expect(handoff.payload.instruction).toContain("用 song2 重新生成");
    expect(handoff.payload.instruction).toContain("拼回的歌词:\n[verse]\nla la\n[chorus]\nha ha");
    expect(handoff.payload.instruction).toContain("乐谱模式: full");
    expect(handoff.payload.instruction).toContain("- 第 1 小节的音符有改动。");
  });

  test("hands off an unchanged original without writing a draft", async ({ page, harness }) => {
    await harness.mount({
      score: { text: SCORE },
      project: { style: "pop", lyrics: LYRICS, scoreMode: "full", seed: 7 },
      handoff: true,
      drafts: true,
      title: "My Song",
    });
    await handoffButton(page).click();
    await expect(dialog(page).getByText("No changes from the original.")).toBeVisible();
    await confirmButton(page).click();
    await expect.poll(async () => (await harness.handoffs()).length).toBe(1);
    const handoff = (await harness.handoffs())[0];
    if (handoff === undefined) throw new Error("the host callback did not run");
    expect(handoff.payload.attachment.text).toBe(SCORE);
    expect(handoff.calls.filter((call) => call.method === "write")).toEqual([]);
  });

  test("shows the button when an update adds the callback and the store", async ({ page, harness }) => {
    await harness.mount({ score: { text: SCORE } });
    await expect(handoffButton(page)).toHaveCount(0);
    await harness.update({ handoff: true, drafts: true });
    await expect(handoffButton(page)).toBeVisible();
  });

  test("has no button while read-only, and calls nothing", async ({ page, harness }) => {
    await seed(harness.page, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }));
    await harness.mount({
      score: { text: SCORE },
      project: { style: "pop", lyrics: LYRICS, scoreMode: "full", seed: 7 },
      handoff: true,
      drafts: true,
      editable: false,
    });
    await expect(handoffButton(page)).toHaveCount(0);
  });

  test("has no button without a host callback", async ({ page, harness }) => {
    await harness.mount({ score: { text: SCORE } });
    await expect(handoffButton(page)).toHaveCount(0);
  });

  test("does not call the host when the keeper answers a conflict", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }));
    await external(page, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4"), seed: 8 }));
    await handoffButton(page).click();
    await confirmButton(page).click();
    await expect(page.getByText(/changed somewhere else/)).toBeVisible();
    expect(await harness.handoffs()).toEqual([]);
  });

  test("does not call the host when the draft save fails, and says so to the host", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }));
    await failNext(page, "write");
    await handoffButton(page).click();
    await confirmButton(page).click();
    await expect
      .poll(async () => (await harness.notices()).map((notice) => notice.code))
      .toContain("draft-save-failed");
    expect(await harness.handoffs()).toEqual([]);
  });
});

test.describe("the review", () => {
  test("marks the trigger expanded while it is open", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }));
    await handoffButton(page).click();
    await expect(handoffButton(page)).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(handoffButton(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("closes when Tab leaves it, lets Shift+Tab reach the trigger, and returns focus on Escape", async ({
    page,
    harness,
  }) => {
    await openEditor(harness, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }));
    await handoffButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(cancelButton(page)).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(handoffButton(page)).toBeFocused();
    await expect(dialog(page)).toBeVisible();

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(dialog(page)).toBeHidden();

    await handoffButton(page).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(handoffButton(page)).toBeFocused();
  });

  test("keeps the list and its description one state at a time, and the heading at the Title step", async ({
    page,
    harness,
  }) => {
    await openEditor(harness, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }));
    await handoffButton(page).click();
    const list = changeList(page);
    await expect(list).toBeVisible();
    const described = await dialog(page).getAttribute("aria-describedby");
    expect(described).toBe(await list.getAttribute("id"));
    expect(await list.evaluate((el) => getComputedStyle(el).display)).not.toBe("flex");
    expect(await list.evaluate((el) => getComputedStyle(el).overflowWrap)).toBe("anywhere");
    expect(await list.evaluate((el) => getComputedStyle(el).fontVariantNumeric)).toContain("lining-nums");
    const [headingSize, dialogSize] = await Promise.all([
      dialog(page)
        .locator(".sce-handoff-heading")
        .evaluate((el) => getComputedStyle(el).fontSize),
      dialog(page).evaluate((el) => getComputedStyle(el).fontSize),
    ]);
    expect(headingSize).toBe(dialogSize);
    await cancelButton(page).click();

    await harness.destroy();
    await harness.mount({
      score: { text: SCORE },
      project: { style: "pop", lyrics: LYRICS, scoreMode: "full", seed: 7, sourceKey: "empty-review" },
      handoff: true,
      drafts: true,
    });
    await handoffButton(page).click();
    const empty = dialog(page).locator(".sce-handoff-empty");
    await expect(empty).toBeVisible();
    expect(await dialog(page).getAttribute("aria-describedby")).toBe(await empty.getAttribute("id"));
    expect(
      await dialog(page)
        .locator(".sce-handoff-changes")
        .evaluate((el) => (el as HTMLElement).hidden),
    ).toBe(true);
  });

  test("keeps its height inside a short window and scrolls a twelve-line log", async ({ page, harness }) => {
    for (const [width, height] of [
      [412, 390],
      [1280, 300],
    ] as const) {
      await page.setViewportSize({ width, height });
      await harness.destroy();
      await openEditor(harness, storedDraft({ score: manySections("r") }));
      await handoffButton(page).click();
      await expect(dialog(page)).toBeVisible();
      const area = await dialog(page).boundingBox();
      if (area === null) throw new Error("the review has no box");
      expect(area.y + area.height).toBeLessThanOrEqual(height + 1);
      const scroll = await changeList(page).evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
      await expect(confirmButton(page)).toBeEnabled();
      await confirmButton(page).click();
      await expect.poll(async () => (await harness.handoffs()).length).toBe(1);
    }
  });
});

test.describe("a slow handoff", () => {
  test("keeps the reviewed project in the payload when the save is delayed", async ({ page, harness }) => {
    const reviewed = SCORE.replace("C4D4E4F4", "C4E4E4F4");
    await openEditor(harness, storedDraft({ score: reviewed }));
    await handoffButton(page).click();
    await expect(changeList(page).getByRole("listitem")).toHaveText(["The notes of bar 1 changed."]);
    await holdWrite(page);
    await confirmButton(page).click();
    const trigger = page.locator(".sce-handoff-button");
    await expect(trigger).toHaveText("Saving…");

    await page.getByRole("button", { name: "Score text", exact: true }).click();
    const box = page.getByRole("textbox", { name: "Score text" });
    await box.fill(SCORE.replace("C4D4E4F4", "C4F4E4F4"));
    await box.press("Tab");
    await page.getByRole("button", { name: "Arrangement", exact: true }).click();
    await expect(
      page.getByRole("list", { name: "Vocal" }).getByRole("listitem", { name: "F4, bar 1 beat 2, length 1 beat" }),
    ).toBeVisible();

    await releaseWrite(page);
    await expect.poll(async () => (await harness.handoffs()).length).toBe(1);
    const handoff = (await harness.handoffs())[0];
    if (handoff === undefined) throw new Error("the host callback did not run");
    expect(handoff.payload.attachment.text).toBe(reviewed);
    expect(handoff.payload.project.score).toBe(reviewed);
    expect(handoff.payload.instruction).toContain("- The notes of bar 1 changed.");
    const writes = handoff.calls.filter((call) => call.method === "write");
    expect(writes).toHaveLength(1);
    const stored = JSON.parse(String(writes[0]?.text)) as { project: { score: string } };
    expect(stored.project.score).toBe(reviewed);
  });

  test("calls nothing after the editor is destroyed while the save is pending", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }));
    await handoffButton(page).click();
    await holdWrite(page);
    await confirmButton(page).click();
    await expect(page.locator(".sce-handoff-button")).toHaveText("Saving…");
    await harness.destroy();
    await releaseWrite(page);
    await page.waitForTimeout(200);
    expect(await harness.handoffs()).toEqual([]);
  });

  test("shows Saving… and refuses to open the review until the save settles", async ({ page, harness }) => {
    await openEditor(harness, storedDraft({ score: SCORE.replace("C4D4E4F4", "C4E4E4F4") }));
    await handoffButton(page).click();
    await holdWrite(page);
    await confirmButton(page).click();
    const trigger = page.locator(".sce-handoff-button");
    await expect(trigger).toHaveText("Saving…");
    await expect(trigger).toHaveAttribute("aria-busy", "true");
    await expect(trigger).toBeDisabled();
    await expect(dialog(page)).toBeHidden();

    await releaseWrite(page);
    await expect.poll(async () => (await harness.handoffs()).length).toBe(1);
    await expect(trigger).toHaveText("Regenerate…");
    await expect(trigger).toHaveAttribute("aria-busy", "false");
    await expect(trigger).toBeEnabled();
  });
});

test.describe("the trigger and the toolbar", () => {
  // Only the desktop width: whether the trigger fits a phone-width row depends on the fonts of the machine.
  test("adds no toolbar height at the desktop width, in either language", async ({ page, harness }) => {
    const cases = [
      [1280, "en"],
      [1280, "zh"],
    ] as const;
    for (const [width, language] of cases) {
      await page.setViewportSize({ width, height: 900 });
      await harness.destroy();
      await harness.mount({
        language,
        score: { text: SCORE },
        project: { style: "pop", lyrics: LYRICS, scoreMode: "full", seed: 7 },
        drafts: true,
      });
      await expect(page.locator(".sce-part-restore")).toBeVisible();
      await harness.frames(1);
      const without = (await box(page.locator(".sce-toolbar"))).height;

      await harness.destroy();
      await harness.mount({
        language,
        score: { text: SCORE },
        project: { style: "pop", lyrics: LYRICS, scoreMode: "full", seed: 7 },
        drafts: true,
        handoff: true,
      });
      await expect(handoffButton(page, language)).toBeVisible();
      await harness.frames(1);
      const withTrigger = (await box(page.locator(".sce-toolbar"))).height;

      expect(withTrigger, `${language} ${width}px: ${without} -> ${withTrigger}`).toBeLessThanOrEqual(without);
    }
  });

  test("places the trigger after Select and Grid, before Restore original", async ({ page, harness }) => {
    await harness.mount({
      score: { text: SCORE },
      project: { style: "pop", lyrics: LYRICS, scoreMode: "full", seed: 7 },
      drafts: true,
      handoff: true,
    });
    await expect(handoffButton(page)).toBeVisible();
    const order = await page.locator(".sce-toolbar").evaluate((el) =>
      [...el.children]
        .map((child) => [...child.classList].find((name) => /^sce-part-(select|grid|handoff|restore)$/.test(name)))
        .filter((name) => name !== undefined)
        .map((name) => `.${name}`),
    );
    expect(order).toEqual([".sce-part-select", ".sce-part-grid", ".sce-part-handoff", ".sce-part-restore"]);
  });

  test("hands off a host without a draft store without writing one", async ({ page, harness }) => {
    await harness.mount({
      score: { text: SCORE },
      project: { style: "pop", lyrics: LYRICS, scoreMode: "full", seed: 7 },
      handoff: true,
      title: "My Song",
    });
    await handoffButton(page).click();
    await confirmButton(page).click();
    await expect.poll(async () => (await harness.handoffs()).length).toBe(1);
    const handoff = (await harness.handoffs())[0];
    if (handoff === undefined) throw new Error("the host callback did not run");
    expect(handoff.payload.attachment.text).toBe(SCORE);
    expect(handoff.calls).toEqual([]);
  });
});

// ABOUTME: Seam 5, the first test: the mounted editor driven in real Chromium through a bare test page.
// ABOUTME: Covers dragging with mouse and touch, scrolling, language switching and what destroy leaves behind.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.describe("with a mouse", () => {
  test.skip(({ isMobile }) => isMobile, "mouse gestures run on the desktop project");

  test("dragging a note changes its time and pitch", async ({ page, harness }) => {
    await harness.mount();
    const lane = page.getByRole("group", { name: "Vocal" });
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    const laneBox = await lane.boundingBox();
    const noteBox = await note.boundingBox();
    if (!laneBox || !noteBox) throw new Error("the 8-bar Vocal roll did not render");

    const beat = laneBox.width / 32;
    const row = noteBox.height;
    const grab = { x: noteBox.x + 6, y: noteBox.y + row / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 1.5 * beat, grab.y - row, { steps: 6 });
    await page.mouse.move(grab.x + 3 * beat, grab.y - 2 * row, { steps: 6 });
    await page.mouse.up();

    await expect(page.getByRole("button", { name: "D5, bar 4 beat 4, length 3 beats" })).toBeVisible();
    await expect(note).toHaveCount(0);
  });
});

test.describe("with a finger", () => {
  test.skip(({ isMobile }) => !isMobile, "touch gestures run on the phone project");

  test("dragging a note moves it and does not scroll, swiping empty space scrolls and moves nothing", async ({
    page,
    harness,
  }) => {
    await harness.mount();
    const roll = page.getByRole("region", { name: "Piano roll" });
    const lane = page.getByRole("group", { name: "Vocal" });
    const note = page.getByRole("button", { name: "C5, bar 1 beat 3, length 2 beats" });
    const laneBox = await lane.boundingBox();
    const noteBox = await note.boundingBox();
    if (!laneBox || !noteBox) throw new Error("the 8-bar Vocal roll did not render");
    const beat = laneBox.width / 32;
    const row = noteBox.height;

    const grab = { x: noteBox.x + 10, y: noteBox.y + row / 2 };
    await harness.swipe(grab, { x: grab.x + beat, y: grab.y - row });
    await expect(page.getByRole("button", { name: "C#5, bar 1 beat 4, length 2 beats" })).toBeVisible();
    expect(await roll.evaluate((el) => el.scrollLeft)).toBe(0);

    const rollBox = await roll.boundingBox();
    if (!rollBox) throw new Error("the roll has no box");
    const blank = { x: rollBox.x + rollBox.width * 0.75, y: rollBox.y + rollBox.height - 10 };
    await harness.swipe(blank, { x: blank.x - 200, y: blank.y });
    await expect.poll(() => roll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await expect(page.getByRole("button", { name: "C#5, bar 1 beat 4, length 2 beats" })).toHaveCount(1);
  });
});

test("update switches the interface language and back", async ({ page, harness }) => {
  await harness.mount({ language: "en" });
  await expect(page.getByRole("region", { name: "Piano roll" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Grid 1\/16$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" })).toBeVisible();

  await harness.update({ language: "zh" });
  await expect(page.getByRole("region", { name: "钢琴卷帘" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^网格 1\/16$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "C5，第 4 小节第 1 拍，长 3 拍" })).toBeVisible();
  await expect(page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" })).toHaveCount(0);

  await harness.update({ language: "en" });
  await expect(page.getByRole("region", { name: "Piano roll" })).toBeVisible();
});

test("repeated update and destroy leave no listeners and no nodes behind", async ({ page, harness }) => {
  const cdp = await page.context().newCDPSession(page);
  const listenerCount = async (expression: string) => {
    const { result } = await cdp.send("Runtime.evaluate", { expression });
    if (!result.objectId) throw new Error(`no object for ${expression}`);
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
    return listeners.length;
  };
  const globals = [
    "window",
    "document",
    "document.documentElement",
    "document.body",
    "document.head",
    "window.harness.stage",
  ];
  const countGlobals = () => Promise.all(globals.map(listenerCount));
  const before = await countGlobals();
  const htmlBefore = await page.evaluate(() => document.documentElement.outerHTML);

  for (let cycle = 0; cycle < 4; cycle++) {
    await harness.mount();
    await harness.update({ language: "zh" });
    await harness.update({ editable: false });
    await harness.update({ score: "sample" });
    await harness.update({ language: "en", editable: true });
    await harness.destroy();
    await harness.destroy();
    await harness.update({ language: "zh" });
  }
  expect(await countGlobals()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(htmlBefore);

  await harness.mount();
  await page.getByRole("button", { name: /^Grid/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Eighth note (1/8)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Grid/ })).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => window.harness.stage.firstElementChild?.nodeName)).toBe("DIV");
  await page.evaluate(() => {
    const kept = [window.harness.stage.firstElementChild as Element];
    kept.push(...(kept[0] as Element).querySelectorAll("*"));
    Object.assign(window, { kept });
  });
  const keptListeners = async () => {
    const { result } = await cdp.send("Runtime.evaluate", { expression: "window.kept" });
    const { result: length } = await cdp.send("Runtime.evaluate", { expression: "window.kept.length" });
    if (!result.objectId) throw new Error("kept nodes missing");
    let total = 0;
    for (let index = 0; index < Number(length.value); index++) {
      const { result: node } = await cdp.send("Runtime.evaluate", { expression: `window.kept[${index}]` });
      if (!node.objectId) continue;
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: node.objectId });
      total += listeners.length;
    }
    return total;
  };
  expect(await keptListeners()).toBeGreaterThan(0);
  await harness.destroy();
  expect(await keptListeners()).toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll(":popover-open").length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(htmlBefore);
  await expect(page.getByRole("menuitemradio")).toHaveCount(0);
  await cdp.detach();

  await harness.mount();
  await expect(page.evaluate(() => window.harness.mount())).rejects.toThrow(/already holds an editor/);
  await harness.destroy();
});

test.describe("host callbacks", () => {
  test.skip(({ isMobile }) => isMobile, "mouse gestures run on the desktop project");

  async function dragNote(page: Page, name: string, beats: number, rows: number) {
    const lane = page.getByRole("group", { name: "Vocal" });
    const note = page.getByRole("button", { name });
    const laneBox = await lane.boundingBox();
    const noteBox = await note.boundingBox();
    if (!laneBox || !noteBox) throw new Error(`no box for ${name}`);
    const beat = laneBox.width / 32;
    const grab = { x: noteBox.x + 6, y: noteBox.y + noteBox.height / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + (beats * beat) / 2, grab.y - (rows * noteBox.height) / 2, { steps: 5 });
    await page.mouse.move(grab.x + beats * beat, grab.y - rows * noteBox.height, { steps: 5 });
    await page.mouse.up();
  }

  test("a read-only score refuses the drag and tells the host once, in the current language", async ({
    page,
    harness,
  }) => {
    await harness.mount({ editable: false, language: "en" });
    await expect(page.getByText("Read only")).toBeVisible();
    await dragNote(page, "C5, bar 4 beat 1, length 3 beats", 3, 2);
    await expect(page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" })).toBeVisible();
    expect(await harness.notices()).toEqual([
      { code: "read-only", level: "info", message: "This score is read only, so notes can't be moved." },
    ]);

    await harness.update({ language: "zh", editable: true });
    await expect(page.getByText("只读")).toBeHidden();
    await dragNote(page, "C5，第 4 小节第 1 拍，长 3 拍", 3, 2);
    await expect(page.getByRole("button", { name: "D5，第 4 小节第 4 拍，长 3 拍" })).toBeVisible();
    expect(await harness.notices()).toHaveLength(1);
  });

  test("a note pulled past the pitch range stops at its edge and the host is told", async ({ page, harness }) => {
    await harness.mount();
    await dragNote(page, "E5, bar 5 beat 3, length 1 beat", 0, 8);
    await expect(page.getByRole("button", { name: "B5, bar 5 beat 3, length 1 beat" })).toBeVisible();
    expect(await harness.notices()).toEqual([
      { code: "pitch-out-of-range", level: "info", message: "Notes can't go beyond the pitch range shown." },
    ]);
  });

  test("arrow keys nudge the focused note by the grid, a semitone and an octave", async ({ page, harness }) => {
    await harness.mount();
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    await note.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "C5, bar 4 beat 1.25, length 3 beats" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Shift+ArrowUp");
    await expect(page.getByRole("button", { name: "B5, bar 4 beat 1.25, length 3 beats" })).toBeFocused();
  });
});

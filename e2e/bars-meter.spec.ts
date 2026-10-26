// ABOUTME: Seam 5 for choosing bars, inserting and deleting them, changing a section's meter and repairing a cut tail.
// ABOUTME: Every case runs on the desktop project with a mouse and on the phone project with a finger; locators go by role, name and text.
import type { Page } from "@playwright/test";
import { box, expect, type Harness, test } from "./fixtures";

const CUT = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
V: Vocal
C16|D16|
E8`;

const CUT_SHARED = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
C16|D16|
V: Ins
z16|C8`;

const barsList = (page: Page) => page.getByRole("list", { name: "Bars" });
const barNumber = (page: Page, bar: number) => barsList(page).getByText(String(bar), { exact: true });
const barItems = (page: Page) => barsList(page).getByRole("listitem");
const barsButton = (page: Page) => page.getByRole("button", { name: "Bars", exact: true });
const meterButton = (page: Page) => page.getByRole("button", { name: /^Meter / });
const toolbarStatus = (page: Page) => page.locator(".sce-part-toolbar > [role='status']");
const notice = (page: Page) => page.locator(".sce-part-notice");
const noticeStatus = (page: Page) => page.locator(".sce-part-notice > [role='status']");
const selectionBand = (page: Page) => page.locator(".sce-bar-selection");
const insNotes = (page: Page) => page.getByRole("list", { name: "Ins" }).getByRole("listitem");
const note = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });

/** Presses `from` and drags across the ruler to `to`: a mouse drag on the desktop project and a finger drag on the phone. */
async function chooseRange(page: Page, harness: Harness, from: number, to: number, isMobile: boolean) {
  const start = await box(barNumber(page, from));
  const end = await box(barNumber(page, to));
  const at = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
  const at2 = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
  if (isMobile) {
    const finger = await harness.finger();
    await finger.down(at);
    await finger.move(at2, 10);
    await finger.up();
    await finger.close();
  } else {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at2.x, at2.y, { steps: 10 });
    await page.mouse.up();
  }
  await expect(selectionBand(page)).toBeVisible();
}

async function openBarsMenu(page: Page) {
  await barsButton(page).click();
  await expect(page.getByRole("menu", { name: "Bars" })).toBeVisible();
}

async function scoreText(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Score text", exact: true }).click();
  return page.getByRole("textbox", { name: "Score text" }).inputValue();
}

test.describe("bars, meter and the cut tail", () => {
  test("a mouse or a finger chooses bars, and Delete bars removes that run from both voices", async ({
    page,
    harness,
    isMobile,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const before = await insNotes(page).count();
    expect(before).toBeGreaterThan(0);

    await chooseRange(page, harness, 1, 2, isMobile);
    await expect(barNumber(page, 1)).toHaveAttribute("aria-label", "Bar 1, selected");
    await expect(barNumber(page, 2)).toHaveAttribute("aria-label", "Bar 2, selected");

    await openBarsMenu(page);
    const remove = page.getByRole("menuitem", { name: "Delete bars 1 to 2", exact: true });
    await expect(remove).toBeVisible();
    await remove.click();

    await expect(barItems(page)).toHaveCount(26);
    await expect(barNumber(page, 26)).toHaveText("26");
    await expect(note(page, "C5, bar 3 beat 1, length 1 beat")).toBeVisible();
    expect(await insNotes(page).count()).toBe(before - 10);
  });

  test("a mouse or a finger inserts a bar at the insertion point and both voices move one bar later", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const lane = page.locator(".sce-lane").first();
    await press(lane, { x: 8, y: 20 });
    await expect(page.locator(".sce-insertion-point").first()).toBeVisible();

    await openBarsMenu(page);
    await page.getByRole("menuitem", { name: "Insert bar before bar 1", exact: true }).click();

    await expect(barItems(page)).toHaveCount(29);
    await expect(note(page, "F4, bar 2 beat 1, length 0.5 beats")).toBeVisible();
    await expect(note(page, "C5, bar 6 beat 1, length 1 beat")).toBeVisible();
  });

  test("the meter control changes the target section and redraws the bar lines without moving the notes", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const before = await box(note(page, "C5, bar 5 beat 1, length 1 beat"));
    await press(barNumber(page, 1));
    await expect(meterButton(page)).toHaveText("Meter 2/4");

    await meterButton(page).click();
    await expect(page.getByRole("dialog", { name: /^Meter: Section 1, bars 1 to 4$/ })).toBeVisible();
    await page.getByRole("radio", { name: "4/4", exact: true }).click();

    await expect(barItems(page)).toHaveCount(26);
    await expect(page.getByRole("list", { name: "Marks" }).getByText("4/4", { exact: true })).toBeVisible();
    await expect(meterButton(page)).toHaveText("Meter 4/4");
    const after = await box(note(page, "C5, bar 3 beat 1, length 1 beat"));
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  });

  test("Fill with rests completes the cut bar, and Delete the incomplete bar removes it", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: CUT } });
    await expect(notice(page).getByRole("note")).toContainText("bar 3 of Vocal is incomplete");
    await press(notice(page).getByRole("button", { name: "Fill with rests", exact: true }));
    await expect(notice(page).getByRole("note")).toBeHidden();
    await expect(barItems(page)).toHaveCount(3);
    expect(await scoreText(page)).toContain("E8z8|");

    await harness.destroy();
    await harness.mount({ score: { text: CUT } });
    await press(notice(page).getByRole("button", { name: "Delete the incomplete bar", exact: true }));
    await expect(notice(page).getByRole("note")).toBeHidden();
    await expect(barItems(page)).toHaveCount(2);
    const text = await scoreText(page);
    expect(text).toContain("C16|D16|");
    expect(text).not.toContain("E8");
  });

  test("a refusal from either place is said in the part's live region and told to the host", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: CUT_SHARED } });
    await press(notice(page).getByRole("button", { name: "Delete the incomplete bar", exact: true }));
    await expect(notice(page).getByRole("note")).toBeVisible();
    await expect(noticeStatus(page)).toContainText("another voice");
    await expect.poll(async () => (await harness.notices()).at(-1)?.code).toBe("command-refused");

    await harness.mount({ score: { text: CUT } });
    await press(barNumber(page, 3));
    await openBarsMenu(page);
    await page.getByRole("menuitem", { name: "Delete bar 3", exact: true }).click();
    await expect(toolbarStatus(page)).toContainText("cut");
    await expect.poll(async () => (await harness.notices()).at(-1)?.code).toBe("command-refused");
    await expect(barItems(page)).toHaveCount(3);
  });

  test("a keyboard chooses a run from the Bars menu and deletes it", async ({ page, harness, isMobile }) => {
    test.skip(isMobile, "keys are checked on the desktop project");
    await harness.mount({ score: { sample: "compact-three-sections" } });
    await openBarsMenu(page);
    await page.getByRole("menuitem", { name: "Choose bars", exact: true }).click();

    await expect(barNumber(page, 1)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(barNumber(page, 2)).toHaveAttribute("aria-label", "Bar 2, selected");
    await expect(barNumber(page, 3)).toHaveAttribute("aria-label", "Bar 3, selected");
    await expect(selectionBand(page)).toBeVisible();

    await openBarsMenu(page);
    await page.getByRole("menuitem", { name: "Delete bars 2 to 3", exact: true }).click();
    await expect(barItems(page)).toHaveCount(26);
  });

  test("a read-only editor offers none of the controls", async ({ page, harness }) => {
    await harness.mount({ score: { text: CUT }, editable: false });
    await expect(page.locator(".sce-bars-button")).toBeHidden();
    await expect(page.locator(".sce-meter-button")).toBeHidden();
    await expect(notice(page).getByRole("note")).toContainText("bar 3 of Vocal is incomplete");
    await expect(notice(page).getByRole("button")).toHaveCount(0);
    await expect(selectionBand(page)).toBeHidden();
  });
});

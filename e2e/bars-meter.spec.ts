// ABOUTME: Seam 5 for choosing bars, inserting and deleting them, changing a section's meter and repairing a cut tail.
// ABOUTME: Every case runs on the desktop project with a mouse and on the phone project with a finger; locators go by role, name and text.
import type { Page } from "@playwright/test";
import { box, expect, test } from "./fixtures";

const CUT = `X:1
T:
M:4/4
L:1/16
Q:1/4=120
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
% A
V: Vocal
C16|D16|
% B
V: Vocal
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
const selectionBand = (page: Page) => page.locator(".sce-bar-selection").first();
const laneBands = (page: Page) => page.locator(".sce-part-voice-track .sce-bar-selection");
const rulerStatus = (page: Page) => page.locator(".sce-part-time-ruler > [role='status']");
const cutRefusal = (page: Page) => page.locator(".sce-cut-refusal");
const menuRefusal = (page: Page) => page.locator(".sce-menu-refusal");
const meterRefusal = (page: Page) => page.locator(".sce-meter-refusal");
const insNotes = (page: Page) => page.getByRole("list", { name: "Ins" }).getByRole("listitem");
const note = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });

/** Chooses bars `from` to `to`: a mouse drag on the desktop project, two taps on the phone. */
async function chooseRange(page: Page, from: number, to: number, isMobile: boolean) {
  const start = await box(barNumber(page, from));
  const end = await box(barNumber(page, to));
  const at = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
  const at2 = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
  if (isMobile) {
    // A finger taps the first bar and then the last: a swipe on the ruler stays a scroll.
    await barNumber(page, from).tap();
    await barNumber(page, to).tap();
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

    await chooseRange(page, 1, 2, isMobile);
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
    await expect(page.getByRole("dialog", { name: /^Meter: intro, bars 1 to 4$/ })).toBeVisible();
    await page.getByRole("radio", { name: "4/4", exact: true }).click();
    await page.getByRole("button", { name: "Apply", exact: true }).click();

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

    await harness.destroy();
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

  test.describe("the design review", () => {
    const precedes = (a: { x: number; y: number; width: number }, b: { x: number; y: number }) =>
      b.y > a.y + 2 || (Math.abs(b.y - a.y) <= 2 && b.x >= a.x + a.width - 1);

    test("Bars and Meter follow Grid before the view switch, and carry the chevron", async ({ page, harness }) => {
      await harness.mount({ score: { sample: "compact-three-sections" } });
      const grid = page.getByRole("button", { name: /^Grid: / });
      const bars = barsButton(page);
      const meter = meterButton(page);
      const views = page.getByRole("group", { name: "View" });
      expect(precedes(await box(grid), await box(bars))).toBe(true);
      expect(precedes(await box(bars), await box(meter))).toBe(true);
      expect(precedes(await box(meter), await box(views))).toBe(true);
      for (const button of [bars, meter]) {
        expect(await button.evaluate((el) => getComputedStyle(el, "::after").borderRightStyle)).toBe("solid");
      }
    });

    test("the Bars menu tells how to choose and how to enable Insert, and each number has a title", async ({
      page,
      harness,
      isMobile,
    }) => {
      await harness.mount({ score: { sample: "compact-three-sections" } });
      await openBarsMenu(page);
      await expect(page.getByText("Click a bar number, or tap one and then another")).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Insert bar (click a lane first)", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      expect(await barNumber(page, 3).getAttribute("title")).toContain("Bar 3");

      if (isMobile) {
        await barNumber(page, 2).tap();
        await expect(rulerStatus(page)).toContainText("tap another bar to extend");
        await barNumber(page, 4).tap();
        await expect(barNumber(page, 2)).toHaveAttribute("aria-label", "Bar 2, selected");
        await expect(barNumber(page, 4)).toHaveAttribute("aria-label", "Bar 4, selected");
      }
    });

    test("the meter names the section, previews the effect, behaves as a radio group and says the effect on success", async ({
      page,
      harness,
      press,
      isMobile,
    }) => {
      await harness.mount({ score: { sample: "compact-three-sections" } });
      await press(barNumber(page, 1));
      await expect(meterButton(page)).toHaveAttribute("title", "intro, bars 1 to 4");
      await meterButton(page).click();
      const dialog = page.getByRole("dialog", { name: /^Meter: intro, bars 1 to 4$/ });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("intro, bars 1 to 4");
      if (isMobile) {
        // The one coarse-pointer field rule, shared with the tempo field: see DESIGN.md, "Keyword Size Rule".
        for (const field of [dialog.getByLabel("Beats per bar"), dialog.getByLabel("Note value")]) {
          expect(await field.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
        }
      }

      const choices = page.getByRole("radio");
      await expect.poll(async () => choices.evaluateAll((els) => els.filter((el) => el.tabIndex === 0).length)).toBe(1);
      await expect(page.getByRole("radio", { name: "2/4", exact: true })).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("radio", { name: "4/4", exact: true })).toHaveAttribute("aria-checked", "true");
      await expect(page.getByRole("radio", { name: "4/4", exact: true })).toBeFocused();
      await expect(page.locator(".sce-meter-effect")).toContainText("At 4/4");
      await expect(page.locator(".sce-meter-effect")).toContainText("become 2 bars");
      await expect(page.locator(".sce-meter-effect")).toContainText("later bars renumber");
      await expect(page.locator(".sce-meter-effect")).toContainText("Notes stay where they are");

      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(barItems(page)).toHaveCount(26);
      await expect(meterButton(page)).toHaveText("Meter 4/4");
      await expect(toolbarStatus(page)).toContainText("intro");
      await expect(toolbarStatus(page)).toContainText("later bars renumber");
      await expect(toolbarStatus(page)).toContainText("Notes stay where they are");
    });

    test("a refused cut repair, bar action and meter value each show their sentence", async ({
      page,
      harness,
      press,
    }) => {
      await harness.mount({ score: { text: CUT_SHARED } });
      await press(notice(page).getByRole("button", { name: "Delete the incomplete bar", exact: true }));
      await expect(cutRefusal(page)).toBeVisible();
      await expect(cutRefusal(page)).toContainText("another voice");
      await expect(noticeStatus(page)).toContainText("another voice");

      await harness.destroy();
      await harness.mount({ score: { text: CUT } });
      await press(barNumber(page, 3));
      await openBarsMenu(page);
      await page.getByRole("menuitem", { name: "Delete bar 3", exact: true }).click();
      await expect(page.getByRole("menu", { name: "Bars" })).toBeVisible();
      await expect(menuRefusal(page)).toBeVisible();
      await expect(menuRefusal(page)).toContainText("cut");

      await harness.destroy();
      await harness.mount({ score: { sample: "compact-three-sections" } });
      await press(barNumber(page, 1));
      await meterButton(page).click();
      await page.getByLabel("Beats per bar").fill("0");
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(meterRefusal(page)).toBeVisible();
      await expect(meterRefusal(page)).toContainText("meter");
    });

    test("the cut strip insets its actions, drops their vertical padding and uses pretty wrapping", async ({
      page,
      harness,
    }) => {
      await harness.mount({ score: { text: CUT } });
      const actions = page.locator(".sce-notice-actions");
      const strip = await box(page.locator(".sce-cut-strip"));
      const fill = await box(notice(page).getByRole("button", { name: "Fill with rests", exact: true }));
      await expect(actions).toHaveCSS("padding-top", "0px");
      await expect(actions).toHaveCSS("padding-left", "12px");
      expect(fill.x).toBeGreaterThanOrEqual(strip.x + 11);
      await expect(page.locator(".sce-cut-sentence")).toHaveCSS("text-wrap", "pretty");
    });

    test("the meter popover stays inside a short window and scrolls inside", async ({
      page,
      harness,
      isMobile,
      press,
    }) => {
      test.skip(isMobile, "the phone project has a tall window; this is the 412x420 case");
      await page.setViewportSize({ width: 412, height: 420 });
      await harness.mount({ score: { sample: "compact-three-sections" } });
      await press(barNumber(page, 1));
      await meterButton(page).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const area = await box(dialog);
      expect(area.y + area.height).toBeLessThanOrEqual(421);
      expect(await dialog.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
    });

    test("bar numbers are 36 px on touch, named Bar N, and the chosen range runs through the lanes", async ({
      page,
      harness,
      isMobile,
    }) => {
      await harness.mount({ score: { sample: "compact-three-sections" } });
      await expect(barNumber(page, 1)).toHaveAttribute("aria-label", "Bar 1");
      if (isMobile) {
        const size = await box(barNumber(page, 1));
        expect(size.width).toBeGreaterThanOrEqual(36);
      }

      await chooseRange(page, 1, 3, isMobile);
      await expect(barNumber(page, 1)).toHaveAttribute("aria-label", "Bar 1, selected");
      await expect(laneBands(page)).toHaveCount(2);
      for (const band of await laneBands(page).all()) await expect(band).toBeVisible();
    });

    test("the bar number and meter fields take the accent ring from the keyboard and none from a mouse", async ({
      page,
      harness,
      isMobile,
    }) => {
      test.skip(isMobile, "the ring is checked on the desktop project");
      await harness.mount({ score: { sample: "compact-three-sections" } });
      await barNumber(page, 2).click();
      await expect(barNumber(page, 2)).toHaveCSS("outline-style", "none");
      await openBarsMenu(page);
      await page.getByRole("menuitem", { name: "Choose bars", exact: true }).click();
      await expect(barNumber(page, 2)).toHaveCSS("outline-width", "2px");
      await expect(barNumber(page, 2)).toHaveCSS("outline-style", "solid");

      await expect(meterButton(page)).toHaveText(/Meter/);
      await meterButton(page).click();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Beats per bar")).toBeFocused();
      await expect(page.getByLabel("Beats per bar")).toHaveCSS("outline-width", "2px");
    });
  });
});

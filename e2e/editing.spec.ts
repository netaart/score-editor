// ABOUTME: Seam 5 for editing in view parts: select, delete, undo, redo and the insertion point, by mouse, touch and keyboard.
// ABOUTME: Parts are mounted on one session in the page's own layout; tests act as a user does and read what the session holds.
import type { Locator, Page } from "@playwright/test";
import { expect, type Harness, test } from "./fixtures";

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);

/** A Vocal-only song2 score in C major, 4/4, with the given music lines under one section. */
function vocalOnly(...music: string[]): string {
  const header = ["X:1", "T:", "M:4/4", "L:1/16", "Q:1/4=100", 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"'];
  return [...header, "K:C", "% a", ...music.flatMap((line) => ["V: Vocal", line]), ""].join("\n");
}

/** Four quarter notes, then a whole note: at 40 pixels a beat they start 0, 40, 80 and 120 pixels into the lane. */
const QUARTERS = vocalOnly("C4D4E4F4|G16|");
const C4 = "C4, bar 1 beat 1, length 1 beat";
const D4 = "D4, bar 1 beat 2, length 1 beat";
const E4 = "E4, bar 1 beat 3, length 1 beat";
const F4 = "F4, bar 1 beat 4, length 1 beat";
const G4 = "G4, bar 2 beat 1, length 4 beats";

const note = (page: Page, name: string) => slot(page, "vocal").getByRole("listitem", { name, exact: true });
const selected = (page: Page, name: string) => note(page, `${name}, selected`);
const lane = (page: Page) => slot(page, "vocal").getByRole("list", { name: "Vocal" });

async function box(target: Locator) {
  const found = await target.boundingBox();
  if (!found) throw new Error("nothing is drawn for the locator");
  return found;
}

/** Opens the toolbar and the Vocal track on one session, in the page's layout. */
async function openTrack(harness: Harness, score: string = QUARTERS, options: Record<string, unknown> = {}) {
  await harness.layout.open({ score: { text: score }, parts: ["toolbar", "vocal"], ...options });
}

/** Presses where a user would: a click with a mouse, a tap on a touch screen. */
function pressAt(isMobile: boolean, target: Locator, position?: { x: number; y: number }) {
  const options = position ? { position } : {};
  return isMobile ? target.tap(options) : target.click(options);
}

test.describe("selecting a note in a voice track", () => {
  test("a click or a tap selects the note: it is framed, named as selected, and the session holds its id", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness);
    await expect(note(page, D4)).toHaveCSS("border-top-width", "1px");

    await pressAt(isMobile, note(page, D4));

    await expect(selected(page, D4)).toBeVisible();
    await expect(selected(page, D4)).toHaveCSS("border-top-width", "2px");
    await expect(note(page, C4)).toHaveCSS("border-top-width", "1px");
    expect(await harness.layout.selection()).toEqual(["Vocal:256"]);
    expect(await harness.layout.insertionPoint()).toBeNull();
  });

  test("selecting another note moves the selection, and empty space clears it", async ({ page, harness, isMobile }) => {
    await openTrack(harness, vocalOnly("C4z4E4F4|G16|"));

    await pressAt(isMobile, note(page, C4));
    await pressAt(isMobile, note(page, E4));
    await expect(selected(page, E4)).toBeVisible();
    await expect(note(page, C4)).toBeVisible();
    expect(await harness.layout.selection()).toEqual(["Vocal:512"]);

    await pressAt(isMobile, lane(page), { x: 60, y: 4 });
    await expect(slot(page, "vocal").getByRole("listitem", { name: /, selected$/ })).toHaveCount(0);
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("a tie chain is selected as a whole, since deleting any of it takes the whole of it", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("C16-|C16|"));
    const first = "C4, bar 1 beat 1, length 4 beats, tied to the next note";
    const second = "C4, bar 2 beat 1, length 4 beats";

    await pressAt(isMobile, note(page, second));

    await expect(note(page, `${first}, selected`)).toHaveCSS("border-top-width", "2px");
    await expect(note(page, `${second}, selected`)).toHaveCSS("border-top-width", "2px");
    // The joint stays a joint: the chain still reads as one bar.
    await expect(note(page, `${first}, selected`)).toHaveCSS("border-right-width", "0px");
    await expect(note(page, `${second}, selected`)).toHaveCSS("border-left-width", "0px");
    expect(await harness.layout.selection()).toEqual(["Vocal:1024"]);
  });

  test("pressing and dragging past a few pixels is not a click: nothing is selected", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "a finger that moves is a scroll; the swipe test below covers it");
    await openTrack(harness);
    const area = await box(note(page, D4));
    const y = area.y + area.height / 2;

    await page.mouse.move(area.x + 10, y);
    await page.mouse.down();
    await page.mouse.move(area.x + 30, y, { steps: 4 });
    await page.mouse.up();

    expect(await harness.layout.selection()).toEqual([]);
    await expect(slot(page, "vocal").getByRole("listitem", { name: /, selected$/ })).toHaveCount(0);
  });

  test("a swipe over the notes scrolls the track and selects nothing", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "a swipe needs a touch screen");
    await openTrack(harness, vocalOnly(...Array(3).fill("C16|C16|C16|C16|")));
    const area = await box(note(page, "C4, bar 1 beat 1, length 4 beats"));
    const at = { x: area.x + area.width / 2, y: area.y + area.height / 2 };

    await harness.swipe({ x: at.x + 60, y: at.y }, { x: at.x - 60, y: at.y });

    expect((await harness.layout.view()).scrollLeft).toBeGreaterThan(20);
    expect(await harness.layout.selection()).toEqual([]);
  });
});

const toolbar = (page: Page) => slot(page, "toolbar");
const undoButton = (page: Page) => toolbar(page).getByRole("button", { name: "Undo", exact: true });
const redoButton = (page: Page) => toolbar(page).getByRole("button", { name: "Redo", exact: true });

test.describe("the toolbar part", () => {
  test("shows the title, the zoom group, and undo and redo that follow the history", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness);
    await expect(toolbar(page).getByText("Arrangement", { exact: true })).toBeVisible();
    await expect(toolbar(page).getByRole("group", { name: "Zoom" })).toBeVisible();
    const history = toolbar(page).getByRole("group", { name: "History" });
    await expect(history.getByRole("button")).toHaveCount(2);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(toolbar(page).getByText("Read only")).toBeHidden();

    await harness.layout.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await expect(note(page, D4)).toHaveCount(0);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "false");
    await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true");

    await press(undoButton(page));
    await expect(note(page, D4)).toBeVisible();
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(redoButton(page)).toHaveAttribute("aria-disabled", "false");

    await press(redoButton(page));
    await expect(note(page, D4)).toHaveCount(0);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "false");
    await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true");

    // A button with nothing to do stays where it is and does nothing when pressed.
    const score = await harness.layout.scoreText();
    await (isMobile ? redoButton(page).tap({ force: true }) : redoButton(page).click({ force: true }));
    expect(await harness.layout.scoreText()).toBe(score);
  });

  test("offers no undo and redo while read-only, shows the badge instead, and follows the session's flag", async ({
    page,
    harness,
  }) => {
    await openTrack(harness, QUARTERS, { editable: false });
    await expect(toolbar(page).getByText("Read only", { exact: true })).toBeVisible();
    await expect(toolbar(page).getByRole("group", { name: "Zoom" })).toBeVisible();
    await expect(undoButton(page)).toBeHidden();
    await expect(redoButton(page)).toBeHidden();
    await expect(toolbar(page).getByRole("group", { name: "History" })).toBeHidden();

    await harness.layout.setEditable(true);
    await expect(undoButton(page)).toBeVisible();
    await expect(toolbar(page).getByText("Read only", { exact: true })).toBeHidden();

    await harness.layout.setEditable(false);
    await expect(undoButton(page)).toBeHidden();
    await expect(toolbar(page).getByText("Read only", { exact: true })).toBeVisible();
  });

  test("speaks the session's language", async ({ page, harness }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["toolbar", "vocal"], language: "zh" });
    await expect(toolbar(page).getByRole("group", { name: "历史" })).toBeVisible();
    await expect(toolbar(page).getByRole("button", { name: "撤销", exact: true })).toBeVisible();
    await expect(toolbar(page).getByRole("button", { name: "重做", exact: true })).toBeVisible();
    await expect(toolbar(page).getByText("编曲视图", { exact: true })).toBeVisible();

    await harness.layout.setView({ language: "en" });
    await expect(undoButton(page)).toBeVisible();
    await expect(toolbar(page).getByText("Arrangement", { exact: true })).toBeVisible();
  });

  test("scrolls sideways when its box is narrower than its controls, and every control can be reached", async ({
    page,
    harness,
    isMobile,
  }) => {
    await harness.layout.open({
      score: { text: QUARTERS },
      parts: ["toolbar", "vocal"],
      scene: "tight-toolbar",
    });
    await harness.layout.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await harness.layout.undo();
    const row = toolbar(page).locator(".sce-toolbar");
    const sizes = await row.evaluate((el) => ({ shown: el.clientWidth, content: el.scrollWidth, left: el.scrollLeft }));
    expect(sizes.shown).toBe(190);
    expect(sizes.content).toBeGreaterThan(sizes.shown);
    expect(sizes.left).toBe(0);

    if (isMobile) {
      const area = await box(row);
      const at = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
      await harness.swipe({ x: at.x + 60, y: at.y }, { x: at.x - 60, y: at.y });
      await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(10);
    } else {
      await redoButton(page).focus();
      await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(10);
    }
    const rowBox = await box(row);
    const redo = await box(redoButton(page));
    expect(redo.x + redo.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
    await (isMobile ? redoButton(page).tap() : redoButton(page).click());
    await expect(note(page, D4)).toHaveCount(0);
  });

  test("does not scroll when it has room", async ({ page, harness }) => {
    await openTrack(harness);
    const row = toolbar(page).locator(".sce-toolbar");
    const sizes = await row.evaluate((el) => ({ shown: el.clientWidth, content: el.scrollWidth }));
    expect(sizes.content).toBe(sizes.shown);
  });
});

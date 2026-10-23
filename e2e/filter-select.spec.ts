// ABOUTME: Seam 5 for selecting by filter: the Filter button and its panel, each condition and some combinations, invert and re-apply.
// ABOUTME: Each case runs with a mouse on the desktop project and with a finger on the phone project, and reads what the session holds.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, test, vocalOnly } from "./fixtures";

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);

/**
 * Four bars. Pitched notes in order, with start tick, pitch and length (a quarter note is 256 ticks):
 *   C4 @0 60 1/4, D4 @256 62 1/4, E4 @512 64 1/4, F4 @768 65 1/4, G4 @1024 67 1/2, A4 @1536 69 1/4, a quarter rest,
 *   C5 @2048 72 1/2, D5 @2560 74 tied over the bar line into @3072 (one note of 1/1), E5 @3584 76 1/4, a quarter rest.
 * Nine notes, ten ids.
 */
const MELODY = vocalOnly("C4D4E4F4|G8A4z4|c8d8-|d8e4z4|");
const ID = {
  C4: "Vocal:0",
  D4: "Vocal:256",
  E4: "Vocal:512",
  F4: "Vocal:768",
  G4: "Vocal:1024",
  A4: "Vocal:1536",
  rest: "Vocal:1792",
  C5: "Vocal:2048",
  D5: "Vocal:2560",
  D5tail: "Vocal:3072",
  E5: "Vocal:3584",
};
const EVERY_NOTE = [ID.C4, ID.D4, ID.E4, ID.F4, ID.G4, ID.A4, ID.C5, ID.D5, ID.D5tail, ID.E5];

const toolbar = (page: Page) => slot(page, "toolbar");
const filterButton = (page: Page, name = "Filter") => toolbar(page).getByRole("button", { name, exact: true });
// The panel is a native popover in the top layer, so it is found from the page and not from the toolbar's slot.
const panel = (page: Page, name = "Select by filter") => page.getByRole("dialog", { name, exact: true });
const status = (page: Page) => panel(page).getByRole("status");
const check = (page: Page, name: string) => panel(page).getByRole("checkbox", { name });
const pitchLowest = (page: Page) => panel(page).getByRole("combobox", { name: "Lowest pitch", exact: true });
const pitchHighest = (page: Page) => panel(page).getByRole("combobox", { name: "Highest pitch", exact: true });

async function openTrack(harness: Harness, score: string = MELODY, options: Record<string, unknown> = {}) {
  await harness.layout.open({ score: { text: score }, parts: ["toolbar", "vocal"], ...options });
}

/** Opens the panel with the toolbar's button, by a click or a tap. */
async function openPanel(page: Page, press: (target: Locator) => Promise<void>) {
  await press(filterButton(page));
  await expect(panel(page)).toBeVisible();
}

test.describe("the Filter button and its panel", () => {
  test("opens a panel named Select by filter from the toolbar, selects nothing by itself, and closes with Done", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await expect(panel(page)).toBeHidden();

    await openPanel(page, press);
    await expect(filterButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(status(page)).toHaveText("Pick a condition to select notes.");
    expect(await harness.layout.selection()).toEqual([]);

    await press(panel(page).getByRole("button", { name: "Done", exact: true }));
    await expect(panel(page)).toBeHidden();
    await expect(filterButton(page)).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("the pitch condition", () => {
  test("selects the notes from the lowest to the highest pitch, the pitches being those the score has", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await openPanel(page, press);

    // The pitches offered run from the lowest note of the score, C4, to the highest, E5, a semitone at a time.
    await expect(pitchLowest(page).locator("option")).toHaveCount(17);
    await expect(pitchLowest(page).locator("option").first()).toHaveText("C4");
    await expect(pitchLowest(page).locator("option").last()).toHaveText("E5");

    await pitchLowest(page).selectOption({ label: "E4" });
    await pitchHighest(page).selectOption({ label: "A4" });

    expect(await harness.layout.selection()).toEqual([ID.E4, ID.F4, ID.G4, ID.A4]);
    await expect(check(page, "Pitch")).toBeChecked();
    await expect(status(page)).toHaveText("4 of 9 notes selected");
  });
});

const barFirst = (page: Page) => panel(page).getByRole("spinbutton", { name: "First bar", exact: true });
const barLast = (page: Page) => panel(page).getByRole("spinbutton", { name: "Last bar", exact: true });

/** Types a number into a field and commits it, the way a person does: Enter. */
async function type(field: Locator, value: number | string) {
  await field.fill(String(value));
  await field.press("Enter");
}

test.describe("the time condition", () => {
  test("selects the notes that start in the bars, a tie chain by where it starts", async ({ page, harness, press }) => {
    await openTrack(harness);
    await openPanel(page, press);

    // The bars offered are those of the score: it has four, and the range starts as all of them.
    await expect(barFirst(page)).toHaveValue("1");
    await expect(barLast(page)).toHaveValue("4");

    await type(barFirst(page), 2);
    await type(barLast(page), 2);
    expect(await harness.layout.selection()).toEqual([ID.G4, ID.A4]);
    await expect(check(page, "Time")).toBeChecked();
    await expect(status(page)).toHaveText("2 of 9 notes selected");

    // Bar 3 holds C5 and the start of D5, which is tied into bar 4: the chain is selected whole.
    await type(barFirst(page), 3);
    await type(barLast(page), 3);
    expect(await harness.layout.selection()).toEqual([ID.C5, ID.D5, ID.D5tail]);
    await expect(status(page)).toHaveText("2 of 9 notes selected");
  });

  test("takes a first bar alone as a range that runs to the end of the score", async ({ page, harness, press }) => {
    await openTrack(harness);
    await openPanel(page, press);

    await type(barFirst(page), 4);
    // Bar 4 begins with the tail of D5, which is no note of its own, and holds E5.
    expect(await harness.layout.selection()).toEqual([ID.E5]);
  });
});

const lengthShortest = (page: Page) => panel(page).getByRole("combobox", { name: "Shortest length", exact: true });
const lengthLongest = (page: Page) => panel(page).getByRole("combobox", { name: "Longest length", exact: true });

test.describe("the length condition", () => {
  test("selects the notes from the shortest to the longest length, the lengths being those the score has", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await openPanel(page, press);

    // The score has quarter notes, half notes and one whole note (the tied D5), written as parts of a whole note.
    await expect(lengthShortest(page).locator("option")).toHaveText(["1/4", "1/2", "1/1"]);
    await expect(lengthLongest(page).locator("option")).toHaveText(["1/4", "1/2", "1/1"]);
    await expect(lengthLongest(page)).toHaveValue("1024");

    await lengthShortest(page).selectOption({ label: "1/2" });
    expect(await harness.layout.selection()).toEqual([ID.G4, ID.C5, ID.D5, ID.D5tail]);

    await lengthLongest(page).selectOption({ label: "1/2" });
    expect(await harness.layout.selection()).toEqual([ID.G4, ID.C5]);
    await expect(check(page, "Length")).toBeChecked();
    await expect(status(page)).toHaveText("2 of 9 notes selected");
  });

  test("measures a tied note as one, the length of all its parts", async ({ page, harness, press }) => {
    await openTrack(harness);
    await openPanel(page, press);

    // D5 is two half notes tied over a bar line: a whole note, and the only one.
    await lengthShortest(page).selectOption({ label: "1/1" });
    expect(await harness.layout.selection()).toEqual([ID.D5, ID.D5tail]);
    await expect(status(page)).toHaveText("1 of 9 notes selected");
  });
});

// ABOUTME: Seam 5 for editing the chord track: place, change and remove a chord by mouse, touch and keyboard, and the picker above a host's layer.
// ABOUTME: The chord page (e2e/page/chord-harness.js) opens the parts or the editor; tests act as a user does and read the score text.
import type { Locator, Page } from "@playwright/test";
import { test as base, box, expect } from "./fixtures";

interface OpenOptions {
  score: { text: string } | { sample: string };
  language?: "en" | "zh";
  editable?: boolean;
  dialect?: "song2" | "narrow" | "refusing";
  hostLayer?: boolean;
  width?: number;
  parts?: string[];
}

interface ChordPage {
  openParts(options: OpenOptions): Promise<void>;
  mountEditor(options: OpenOptions): Promise<void>;
  close(): void;
  notices(): Array<string | { code: string; message: string }>;
  scoreText(): string;
  canUndo(): boolean;
  canRedo(): boolean;
  insertionPoint(): { tick: number } | null;
  setEditable(editable: boolean): void;
  setLanguage(language: string): void;
}

declare global {
  interface Window {
    chordPage: ChordPage;
  }
}

/** Drives the chord page from the test: every call is a plain evaluate, so the test reads what a host would. */
class Chords {
  constructor(private readonly page: Page) {}

  openParts(options: OpenOptions) {
    return this.page.evaluate((o) => window.chordPage.openParts(o), options);
  }

  mountEditor(options: OpenOptions) {
    return this.page.evaluate((o) => window.chordPage.mountEditor(o), options);
  }

  scoreText() {
    return this.page.evaluate(() => window.chordPage.scoreText());
  }

  notices() {
    return this.page.evaluate(() => window.chordPage.notices());
  }

  insertionPoint() {
    return this.page.evaluate(() => window.chordPage.insertionPoint());
  }

  setEditable(editable: boolean) {
    return this.page.evaluate((value) => window.chordPage.setEditable(value), editable);
  }
}

const test = base.extend<{ chords: Chords }>({
  chords: async ({ page, harness }, use) => {
    void harness;
    await page.addScriptTag({ type: "module", url: "/e2e/page/chord-harness.js" });
    await page.waitForFunction(() => "chordPage" in window);
    await use(new Chords(page));
    await page.evaluate(() => window.chordPage?.close());
  },
});

const HEADER = [
  "X:1",
  "T:",
  "M:4/4",
  "L:1/16",
  "Q:1/4=100",
  'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
  'V: Ins clef=treble name="Ins Melody" snm="Inst."',
];

/** A two-voice song2 score in C major under one section; the music lines are those of Vocal and of Ins. */
function twoVoices(vocal: string, ins: string): string {
  return [...HEADER, "K:C", "% a", "V: Vocal", vocal, "V: Ins", ins, ""].join("\n");
}

/** Four quarter notes then a whole note in Vocal; a whole note in each bar of Ins. */
const QUARTERS = twoVoices("C4D4E4F4|G16|", "C16|C16|");

const chordTrack = (page: Page) => page.getByRole("region", { name: "Chords" });
/** The list a track keeps for its chords; empty of chords it is a sentence instead. */
const timeline = (page: Page) => chordTrack(page).locator(".sce-timeline");
const picker = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const undoButton = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });
const redoButton = (page: Page) => page.getByRole("button", { name: "Redo", exact: true });

/** The x on the page of a tick at 100% zoom: 40 pixels a quarter note (256 ticks) from the left edge of the timeline. */
async function xOfTick(timelineBox: Locator, tick: number): Promise<number> {
  const area = await box(timelineBox);
  return area.x + (tick * 40) / 256;
}

test.describe("placing a chord", () => {
  test("a press on the chord track opens the picker at the nearest start; choosing a root and a type and pressing Place writes one chord, and one Undo takes it back", async ({
    page,
    chords,
    press,
  }) => {
    await chords.openParts({ score: { text: QUARTERS } });
    await expect(page.getByText("No chords in this score")).toBeVisible();

    // D4 starts one quarter note in; a press a little before it is nearest to it.
    const at = await xOfTick(timeline(page), 256 - 20);
    const row = await box(timeline(page));
    await press(timeline(page), { x: at - row.x, y: row.height / 2 });

    const open = picker(page, "Chord at bar 1 beat 2");
    await expect(open).toBeVisible();
    await expect(open.getByText("Bar 1, beat 2")).toBeVisible();
    await open.getByRole("radiogroup", { name: "Root" }).getByRole("radio", { name: "A", exact: true }).click();
    await open.getByRole("radiogroup", { name: "Type" }).getByRole("radio", { name: "Am", exact: true }).click();
    await open.getByRole("button", { name: "Place", exact: true }).click();

    await expect(open).toBeHidden();
    expect(await chords.scoreText()).toBe(twoVoices('C4"Am"D4E4F4|G16|', "C16|C16|"));
    await expect(chordTrack(page).getByRole("listitem")).toHaveText(["Am"]);

    await press(undoButton(page));
    expect(await chords.scoreText()).toBe(QUARTERS);
    await expect(page.getByText("No chords in this score")).toBeVisible();
  });
});

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
  coverHost(): void;
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

  canUndo() {
    return this.page.evaluate(() => window.chordPage.canUndo());
  }

  coverHost() {
    return this.page.evaluate(() => window.chordPage.coverHost());
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
const timeline = (page: Page) => page.locator(".sce-chords .sce-timeline");
const picker = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });
const undoButton = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });
const redoButton = (page: Page) => page.getByRole("button", { name: "Redo", exact: true });

/** The x on the page of a tick at 100% zoom: 40 pixels a quarter note (256 ticks) from the left edge of the timeline. */
async function xOfTick(timelineBox: Locator, tick: number): Promise<number> {
  const area = await box(timelineBox);
  return area.x + (tick * 40) / 256;
}

/** The same score with Am already on the second quarter note. */
const CHORDED = twoVoices('C4"Am"D4E4F4|G16|', "C16|C16|");

/** Presses the chord track at `tick`, as a click on a mouse project and a tap on a touch project. */
async function pressAtTick(
  page: Page,
  press: (target: Locator, position?: { x: number; y: number }) => Promise<void>,
  tick: number,
) {
  const row = await box(timeline(page));
  await press(timeline(page), { x: (tick * 40) / 256, y: row.height / 2 });
}

/** Chooses a chord in the open picker: a letter, a spelling when it has one, and a type by its full name. */
async function choose(open: Locator, root: string, type: string) {
  await open
    .getByRole("radiogroup", { name: "Root" })
    .getByRole("radio", { name: root.slice(0, 1), exact: true })
    .click();
  if (root.length > 1) {
    await open
      .getByRole("radiogroup", { name: "Sharp or flat" })
      .getByRole("radio", { name: root, exact: true })
      .click();
  }
  await open.getByRole("radiogroup", { name: "Type" }).getByRole("radio", { name: type, exact: true }).click();
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

  test("the start nearest the press is the one taken: a press left of the midpoint between two starts takes the earlier, right of it the later", async ({
    page,
    chords,
    press,
  }) => {
    await chords.openParts({ score: { text: QUARTERS } });

    // Beats 1 and 2 start at ticks 0 and 256; their midpoint is tick 128.
    await pressAtTick(page, press, 110);
    await expect(picker(page, "Chord at bar 1 beat 1")).toBeVisible();
    await press(picker(page, "Chord at bar 1 beat 1").getByRole("button", { name: "Cancel", exact: true }));
    await expect(picker(page, /^Chord at/)).toBeHidden();

    await pressAtTick(page, press, 146);
    await expect(picker(page, "Chord at bar 1 beat 2")).toBeVisible();
    expect(await chords.scoreText()).toBe(QUARTERS);
  });

  test("a press past the last start takes the last start, and a rest has a start like a note", async ({
    page,
    chords,
    press,
  }) => {
    await chords.openParts({ score: { text: twoVoices("C4z4E4F4|G16|", "C16|C16|") } });

    await pressAtTick(page, press, 290);
    await expect(picker(page, "Chord at bar 1 beat 2")).toBeVisible();
    await press(picker(page, "Chord at bar 1 beat 2").getByRole("button", { name: "Cancel", exact: true }));

    await pressAtTick(page, press, 2040);
    await expect(picker(page, "Chord at bar 2 beat 1")).toBeVisible();
  });

  test("a start with no chord opens on the chord before it, so repeating a chord is one press", async ({
    page,
    chords,
    press,
  }) => {
    await chords.openParts({ score: { text: CHORDED } });

    await pressAtTick(page, press, 520);
    const open = picker(page, "Chord at bar 1 beat 3");
    await expect(open.getByText("No chord yet")).toBeVisible();
    await expect(
      open.getByRole("radiogroup", { name: "Root" }).getByRole("radio", { name: "A", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      open.getByRole("radiogroup", { name: "Type" }).getByRole("radio", { name: "Am", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await press(open.getByRole("button", { name: "Place", exact: true }));

    expect(await chords.scoreText()).toBe(twoVoices('C4"Am"D4"Am"E4F4|G16|', "C16|C16|"));
  });
});

test.describe("changing and removing a chord", () => {
  test("pressing a chord offers Change and Remove, opens on that chord, and Change writes the new chord as one step", async ({
    page,
    chords,
    press,
  }) => {
    await chords.openParts({ score: { text: CHORDED } });

    await pressAtTick(page, press, 250);
    const open = picker(page, "Chord at bar 1 beat 2");
    await expect(open.getByText("Now Am")).toBeVisible();
    await expect(open.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await expect(
      open.getByRole("radiogroup", { name: "Root" }).getByRole("radio", { name: "A", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await choose(open, "D", "Dm");
    await press(open.getByRole("button", { name: "Change", exact: true }));

    await expect(open).toBeHidden();
    expect(await chords.scoreText()).toBe(twoVoices('C4"Dm"D4E4F4|G16|', "C16|C16|"));
    await expect(chordTrack(page).getByRole("listitem")).toHaveText(["Dm"]);

    await press(undoButton(page));
    expect(await chords.scoreText()).toBe(CHORDED);
    await press(redoButton(page));
    expect(await chords.scoreText()).toBe(twoVoices('C4"Dm"D4E4F4|G16|', "C16|C16|"));
    await press(undoButton(page));
    expect(await chords.scoreText()).toBe(CHORDED);
    // The change was one step: nothing is left to undo before it.
    expect(await chords.canUndo()).toBe(false);
  });

  test("Remove takes the chord away as one step, and Undo and Redo bring it back and take it away again", async ({
    page,
    chords,
    press,
  }) => {
    await chords.openParts({ score: { text: CHORDED } });

    await pressAtTick(page, press, 250);
    const open = picker(page, "Chord at bar 1 beat 2");
    await press(open.getByRole("button", { name: "Remove", exact: true }));

    await expect(open).toBeHidden();
    expect(await chords.scoreText()).toBe(QUARTERS);
    await expect(page.getByText("No chords in this score")).toBeVisible();

    await press(undoButton(page));
    expect(await chords.scoreText()).toBe(CHORDED);
    await expect(chordTrack(page).getByRole("listitem")).toHaveText(["Am"]);
    await press(redoButton(page));
    expect(await chords.scoreText()).toBe(QUARTERS);
    expect(await chords.canUndo()).toBe(true);
  });

  test("pressing the name of a chord takes that chord, even where a note starts nearer to the press", async ({
    page,
    chords,
    press,
  }) => {
    // The name is drawn from the start of the first quarter note; a press on its last letters is nearer to the next start.
    await chords.openParts({ score: { text: twoVoices('"Cmaj7"C4D1E1F1G1A4B4|G16|', "C16|C16|") } });

    const name = chordTrack(page).getByRole("listitem").filter({ hasText: "Cmaj7" });
    const area = await box(name);
    await press(name, { x: area.width - 6, y: 12 });

    const open = picker(page, "Chord at bar 1 beat 1");
    await expect(open.getByText("Now Cmaj7")).toBeVisible();
    await expect(open.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  });
});

const cursor = (page: Page) => page.getByRole("button", { name: /^Chord place, / });
const live = (page: Page) => chordTrack(page).getByRole("status");

test.describe("Ins has no way in", () => {
  test("a press where only Ins has a start takes the nearest Vocal start, and the chord is written on Vocal", async ({
    page,
    chords,
    press,
  }) => {
    // Ins starts on every beat of bar 1; Vocal starts only at the bars.
    const score = twoVoices("C16|G16|", "C4D4E4F4|G16|");
    await chords.openParts({ score: { text: score } });

    await pressAtTick(page, press, 500);
    const open = picker(page, "Chord at bar 1 beat 1");
    await expect(open).toBeVisible();
    await choose(open, "A", "Am");
    await press(open.getByRole("button", { name: "Place", exact: true }));

    expect(await chords.scoreText()).toBe(twoVoices('"Am"C16|G16|', "C4D4E4F4|G16|"));
  });

  test("a press in the Ins lane sets the insertion point and opens no picker", async ({ page, chords, press }) => {
    await chords.openParts({ score: { text: twoVoices("C16|G16|", "C4D4E4F4|G16|") } });

    await press(page.locator('[data-slot="ins"]').getByRole("list", { name: "Ins" }), { x: 70, y: 120 });

    expect(await chords.insertionPoint()).toEqual({ tick: 512 });
    await expect(picker(page, /^Chord at/)).toHaveCount(0);
  });

  test("the keyboard cursor stands only on Vocal starts", async ({ page, chords }) => {
    await chords.openParts({ score: { text: twoVoices("C16|G16|", "C4D4E4F4|G16|") } });

    await cursor(page).focus();
    await expect(cursor(page)).toHaveAccessibleName("Chord place, bar 1 beat 1, no chord");
    await page.keyboard.press("ArrowRight");
    await expect(cursor(page)).toHaveAccessibleName("Chord place, bar 2 beat 1, no chord");
    await page.keyboard.press("ArrowRight");
    await expect(cursor(page)).toHaveAccessibleName("Chord place, bar 2 beat 1, no chord");
  });
});

test.describe("the picker offers what the dialect allows", () => {
  test("song2: seven letters, five spellings of a root, fifteen types and a bass note", async ({
    page,
    chords,
    press,
  }) => {
    await chords.openParts({ score: { text: QUARTERS } });
    await pressAtTick(page, press, 0);
    const open = picker(page, "Chord at bar 1 beat 1");

    await expect(open.getByRole("radiogroup", { name: "Root" }).getByRole("radio")).toHaveCount(7);
    await expect(open.getByRole("radiogroup", { name: "Sharp or flat" }).getByRole("radio")).toHaveText([
      "Cbb",
      "Cb",
      "C",
      "C#",
      "C##",
    ]);
    await expect(open.getByRole("radiogroup", { name: "Type" }).getByRole("radio")).toHaveCount(15);
    await expect(open.getByRole("button", { name: /^Bass note/ })).toBeVisible();
  });

  test("a narrower dialect: only its roots and types, and no bass note", async ({ page, chords, press }) => {
    await chords.openParts({ score: { text: QUARTERS }, dialect: "narrow" });
    await pressAtTick(page, press, 0);
    const open = picker(page, "Chord at bar 1 beat 1");

    await expect(open.getByRole("radiogroup", { name: "Root" }).getByRole("radio")).toHaveCount(7);
    await expect(open.getByRole("radiogroup", { name: "Sharp or flat" }).getByRole("radio")).toHaveText(["C"]);
    await expect(open.getByRole("radiogroup", { name: "Type" }).getByRole("radio")).toHaveText(["C", "Cm", "C7"]);
    await expect(open.getByRole("button", { name: /^Bass note/ })).toHaveCount(0);

    await open.getByRole("radiogroup", { name: "Root" }).getByRole("radio", { name: "F", exact: true }).click();
    await expect(open.getByRole("radiogroup", { name: "Sharp or flat" }).getByRole("radio")).toHaveText(["F", "F#"]);
    await choose(open, "F#", "F#7");
    await press(open.getByRole("button", { name: "Place", exact: true }));

    expect(await chords.scoreText()).toBe(twoVoices('"F#7"C4D4E4F4|G16|', "C16|C16|"));
  });

  test("a bass note is chosen under its own disclosure and written after a slash", async ({ page, chords, press }) => {
    await chords.openParts({ score: { text: QUARTERS } });
    await pressAtTick(page, press, 0);
    const open = picker(page, "Chord at bar 1 beat 1");

    await choose(open, "A", "Am");
    const toggle = open.getByRole("button", { name: /^Bass note/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await press(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const bass = open.getByRole("radiogroup", { name: "Bass note", exact: true });
    await bass.getByRole("radio", { name: "G", exact: true }).click();
    const bassSpelling = open.getByRole("radiogroup", { name: "Bass note: Sharp or flat" });
    await bassSpelling.getByRole("radio", { name: "G#", exact: true }).click();
    await expect(open.locator(".sce-picker-name")).toHaveText("Am/G#");
    await press(open.getByRole("button", { name: "Place", exact: true }));

    expect(await chords.scoreText()).toBe(twoVoices('"Am/G#"C4D4E4F4|G16|', "C16|C16|"));
  });
});

test.describe("the picker above a host's layer", () => {
  test("in the whole editor, inside a full-screen host layer under a covering layer of the host, the picker is on top and works", async ({
    page,
    chords,
    press,
  }) => {
    await chords.mountEditor({ score: { text: QUARTERS }, hostLayer: true });
    await pressAtTick(page, press, 256);
    const open = picker(page, "Chord at bar 1 beat 2");
    await expect(open).toBeVisible();
    await expect(open).toHaveCSS("position", "fixed");

    // The host's own covering layer starts taking the pointer. The track is under it now; the picker is not.
    await chords.coverHost();
    const place = open.getByRole("button", { name: "Place", exact: true });
    const at = await box(place);
    const track = await box(timeline(page));
    const idAt = (x: number, y: number) =>
      page.evaluate(([px, py]) => document.elementFromPoint(px as number, py as number)?.id ?? "", [x, y]);
    expect(await idAt(track.x + 10, track.y + 10)).toBe("chord-cover");
    const topIsPlace = await place.evaluate((el, point) => el.contains(document.elementFromPoint(point.x, point.y)), {
      x: at.x + at.width / 2,
      y: at.y + at.height / 2,
    });
    expect(topIsPlace).toBe(true);

    await press(place);
    await expect(open).toBeHidden();
    await expect(page.locator(".sce-chords .sce-chord")).toHaveText(["C"]);
  });
});

test.describe("read-only", () => {
  test("shows the chords, has no keyboard cursor, and a press opens nothing", async ({ page, chords, press }) => {
    await chords.openParts({ score: { text: CHORDED }, editable: false });

    await expect(chordTrack(page).getByRole("listitem")).toHaveText(["Am"]);
    await expect(cursor(page)).toBeHidden();
    await pressAtTick(page, press, 250);
    await expect(picker(page, /^Chord at/)).toHaveCount(0);
    await expect(timeline(page)).toHaveCSS("cursor", "auto");
    expect(await chords.scoreText()).toBe(CHORDED);
  });

  test("an open picker closes when the host turns editing off, and editing comes back when it turns it on", async ({
    page,
    chords,
    press,
  }) => {
    await chords.openParts({ score: { text: QUARTERS } });
    await pressAtTick(page, press, 250);
    await expect(picker(page, "Chord at bar 1 beat 2")).toBeVisible();

    await chords.setEditable(false);
    await expect(picker(page, /^Chord at/)).toBeHidden();
    await expect(cursor(page)).toBeHidden();
    await pressAtTick(page, press, 250);
    await expect(picker(page, /^Chord at/)).toBeHidden();

    await chords.setEditable(true);
    await expect(cursor(page)).toBeVisible();
    await pressAtTick(page, press, 250);
    await expect(picker(page, "Chord at bar 1 beat 2")).toBeVisible();
  });
});

test.describe("a refusal", () => {
  test("changes nothing, and is said and told to the host as other refusals are", async ({ page, chords, press }) => {
    await chords.mountEditor({ score: { text: QUARTERS }, dialect: "refusing" });

    await pressAtTick(page, press, 256);
    const open = picker(page, "Chord at bar 1 beat 2");
    await choose(open, "A", "Am");
    await press(open.getByRole("button", { name: "Place", exact: true }));

    await expect(open).toBeHidden();
    await expect(page.locator(".sce-chords .sce-chord")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "can't be written into the score" })).toHaveCount(1);
    expect((await chords.notices()).map((notice) => (typeof notice === "string" ? notice : notice.code))).toEqual([
      "command-refused",
    ]);
  });
});

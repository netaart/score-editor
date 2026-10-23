// ABOUTME: Seam 5 for the toolbar's tempo, key and transpose controls and the song project panel, in desktop and phone projects.
// ABOUTME: A user acts through the toolbar and the panel; the tests read the score text and the project fields the session holds.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, test, vocalOnly } from "./fixtures";

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);

/** Four quarter notes in C, then a whole note, at 100 BPM: `vocalOnly` writes the header, `K:C` and a section line. */
const SONG = vocalOnly("C4D4E4F4|G16|");

/** The fields of the project the session holds, as the panel edits them. */
interface ProjectFields {
  style: string;
  lyrics: string;
  score: string;
  scoreMode: string | undefined;
  seed: number | null;
}

const project = (page: Page) =>
  page.evaluate(() => ({ ...window.harness.layout.live().project }) as unknown as ProjectFields);
const scoreText = (page: Page) => page.evaluate(() => window.harness.layout.live().project.score);

/** The toolbar of the default editor's arrangement: the view switch, tempo, key, transpose and Project controls. */
const toolbar = (page: Page) => slot(page, "toolbar-song");
const tempoField = (page: Page) => toolbar(page).getByRole("spinbutton", { name: "Tempo (BPM)" });
const undoButton = (page: Page) => toolbar(page).getByRole("button", { name: "Undo", exact: true });

async function openSong(
  harness: Harness,
  text: string = SONG,
  fields: Record<string, unknown> = {},
  options: Record<string, unknown> = {},
) {
  await harness.layout.open({ score: { text }, project: fields, parts: ["toolbar-song", "vocal"], ...options });
}

test.describe("the tempo in the toolbar", () => {
  test("shows the score's BPM; a new value writes the score and the style's BPM, as one undo step", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { style: "warm pop, 100 BPM" });
    await expect(tempoField(page)).toHaveValue("100");

    await tempoField(page).fill("140");
    await tempoField(page).press("Enter");

    await expect.poll(() => scoreText(page)).toContain("\nQ:1/4=140\n");
    expect((await project(page)).style).toBe("warm pop, 140 BPM");
    await expect(tempoField(page)).toHaveValue("140");

    await press(undoButton(page));
    expect(await scoreText(page)).toContain("\nQ:1/4=100\n");
    expect((await project(page)).style).toBe("warm pop, 100 BPM");
    await expect(tempoField(page)).toHaveValue("100");
    expect(await harness.layout.canUndo()).toBe(false);
  });
});

test.describe("the tempo in the toolbar, refused and told", () => {
  test("a tempo outside the dialect's range is refused with its reason: nothing changes, the field goes back", async ({
    page,
    harness,
  }) => {
    await openSong(harness, SONG, { style: "pop, 100 BPM" });

    await tempoField(page).fill("500");
    await tempoField(page).press("Enter");

    const reason = "The tempo 500 BPM is outside 20-400 BPM.";
    await expect(toolbar(page).getByRole("status").filter({ hasText: reason })).toHaveCount(1);
    expect(await harness.notices()).toEqual([{ code: "command-refused", level: "warning", message: reason }]);
    await expect(tempoField(page)).toHaveValue("100");
    expect(await scoreText(page)).toBe(SONG);
    expect((await project(page)).style).toBe("pop, 100 BPM");
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a style without a BPM is left as it is and the toolbar says so; the sentence goes with the next change", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { style: "warm pop" });
    const sentence = toolbar(page).getByRole("note").filter({ hasText: "The style text has no BPM" });
    await expect(sentence).toHaveCount(0);

    await tempoField(page).fill("120");
    await tempoField(page).press("Enter");

    await expect(sentence).toHaveText("The style text has no BPM, so it was left as it is.");
    expect((await project(page)).style).toBe("warm pop");
    expect(await scoreText(page)).toContain("\nQ:1/4=120\n");

    await press(undoButton(page));
    await expect(sentence).toHaveCount(0);
  });

  test("is there while the editor can edit and not while it is read-only", async ({ page, harness }) => {
    await openSong(harness, SONG, {}, { editable: false });
    await expect(tempoField(page)).toBeHidden();

    await harness.layout.setEditable(true);
    await expect(tempoField(page)).toBeVisible();
    await expect(tempoField(page)).toHaveAttribute("min", "20");
    await expect(tempoField(page)).toHaveAttribute("max", "400");
  });
});

const keyMenu = (page: Page) => toolbar(page).getByRole("combobox", { name: "Key" });

test.describe("the key in the toolbar", () => {
  test("lists the dialect's major and minor keys, with the score's key chosen", async ({ page, harness }) => {
    await openSong(harness, SONG.replace("K:C", "K:D"));

    await expect(keyMenu(page)).toHaveValue("D");
    const major = keyMenu(page).locator('optgroup[label="Major"] > option');
    const minor = keyMenu(page).locator('optgroup[label="Minor"] > option');
    await expect(major).toHaveCount(15);
    await expect(minor).toHaveCount(15);
    await expect(major.filter({ hasText: /^Eb$/ })).toHaveCount(1);
    await expect(minor.filter({ hasText: /^F#m$/ })).toHaveCount(1);
  });

  test("choosing a key moves the notes there by the shortest way and the signature with them, as one undo step", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await expect(keyMenu(page)).toHaveValue("C");

    await keyMenu(page).selectOption("G");

    // C to G is five semitones down, not seven up: C D E F | G become G A B C | D, an octave and a bit lower.
    const moved = SONG.replace("K:C", "K:G").replace("C4D4E4F4|G16|", "G,4A,4B,4C4|D16|");
    await expect.poll(() => scoreText(page)).toBe(moved);
    await expect(keyMenu(page)).toHaveValue("G");

    await press(undoButton(page));
    expect(await scoreText(page)).toBe(SONG);
    await expect(keyMenu(page)).toHaveValue("C");
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("is there while the editor can edit and not while it is read-only", async ({ page, harness }) => {
    await openSong(harness, SONG, {}, { editable: false });
    await expect(keyMenu(page)).toBeHidden();
    await harness.layout.setEditable(true);
    await expect(keyMenu(page)).toBeVisible();
  });
});

const transposeUp = (page: Page) => toolbar(page).getByRole("button", { name: "Transpose up a semitone", exact: true });
const transposeDown = (page: Page) =>
  toolbar(page).getByRole("button", { name: "Transpose down a semitone", exact: true });

test.describe("transposing in the toolbar", () => {
  test("up a semitone moves every note, the signature with them, and one undo takes it back", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);

    await press(transposeUp(page));

    // C D E F | G a semitone up are Db Eb F Gb | Ab, which the key of Db writes as D E F G | A.
    await expect
      .poll(() => scoreText(page))
      .toBe(SONG.replace("K:C", "K:Db").replace("C4D4E4F4|G16|", "D4E4F4G4|A16|"));
    await expect(keyMenu(page)).toHaveValue("Db");

    await press(undoButton(page));
    expect(await scoreText(page)).toBe(SONG);
    await expect(keyMenu(page)).toHaveValue("C");
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("down a semitone does the same the other way, in the key that needs the fewest accidentals", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);

    await press(transposeDown(page));

    // C D E F | G a semitone down are B C# D# E | F#, which the key of B writes as B, C D E | F.
    await expect
      .poll(() => scoreText(page))
      .toBe(SONG.replace("K:C", "K:B").replace("C4D4E4F4|G16|", "B,4C4D4E4|F16|"));

    await press(undoButton(page));
    expect(await scoreText(page)).toBe(SONG);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a note that would leave the range refuses the whole move: nothing changes and the reason is said", async ({
    page,
    harness,
    press,
  }) => {
    const top = vocalOnly("g''''4C4D4E4|G16|");
    await openSong(harness, top);

    await press(transposeUp(page));

    const sayings = toolbar(page).getByRole("status").filter({ hasText: "outside MIDI 0-127" });
    await expect(sayings).toHaveCount(1);
    await expect(sayings).toContainText("pitch 128");
    expect(await harness.notices()).toHaveLength(1);
    expect((await harness.notices())[0]).toMatchObject({ code: "command-refused", level: "warning" });
    expect(await scoreText(page)).toBe(top);
    expect(await harness.layout.canUndo()).toBe(false);

    // The way down is open, so the same control still works on the same score.
    await press(transposeDown(page));
    await expect.poll(() => scoreText(page)).not.toBe(top);
    expect(await harness.layout.canUndo()).toBe(true);
  });

  test("is there while the editor can edit and not while it is read-only", async ({ page, harness }) => {
    await openSong(harness, SONG, {}, { editable: false });
    await expect(transposeUp(page)).toBeHidden();
    await expect(transposeDown(page)).toBeHidden();
    await harness.layout.setEditable(true);
    await expect(transposeUp(page)).toBeVisible();
    await expect(transposeDown(page)).toBeVisible();
  });
});

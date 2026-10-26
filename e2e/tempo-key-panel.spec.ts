// ABOUTME: Seam 5 for the toolbar's tempo, key and transpose controls and the song project panel, in desktop and phone projects.
// ABOUTME: A user acts through the toolbar and the panel; the tests read the score text and the project fields the session holds.
import { LYRICS_MAX_CHARACTERS } from "@neta-art/score-editor";
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

  test("an emptied tempo is refused by the command and the field shows the score's tempo again", async ({
    page,
    harness,
  }) => {
    await openSong(harness, SONG, { style: "pop, 100 BPM" });

    await tempoField(page).fill("");
    await tempoField(page).blur();

    await expect(
      toolbar(page).getByRole("status").filter({ hasText: "The tempo NaN BPM is outside 20-400 BPM." }),
    ).toHaveCount(1);
    expect((await harness.notices())[0]).toMatchObject({ code: "command-refused", level: "warning" });
    await expect(tempoField(page)).toHaveValue("100");
    expect(await scoreText(page)).toBe(SONG);
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
    await expect(toolbar(page).getByRole("group", { name: "Tempo, key and transpose" })).toBeVisible();
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

const projectButton = (page: Page) => page.getByRole("button", { name: /^Project/ });
const panel = (page: Page) => page.getByRole("dialog", { name: "Project" });
const styleBox = (page: Page) => panel(page).getByRole("textbox", { name: "Style description" });
const modeRadio = (page: Page, name: "Full" | "Melody") => panel(page).getByRole("radio", { name });
const seedField = (page: Page) => panel(page).getByRole("spinbutton", { name: "Seed" });
const lyricsRegion = (page: Page) => panel(page).getByRole("region", { name: "Lyrics" });

/** Opens the song project panel from the toolbar, as a person does with a click or a tap. */
async function openPanel(page: Page, press: (target: Locator) => Promise<void>) {
  await press(projectButton(page));
  await expect(panel(page)).toBeVisible();
}

test.describe("the song project panel", () => {
  test("opens from the toolbar's Project button and shows the style, the score mode, the seed and the lyrics", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { style: "warm pop, 100 BPM", scoreMode: "melody", seed: 42, lyrics: "la la la" });
    await expect(panel(page)).toBeHidden();
    await expect(projectButton(page)).toHaveAttribute("aria-expanded", "false");

    await openPanel(page, press);

    await expect(projectButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(styleBox(page)).toHaveValue("warm pop, 100 BPM");
    await expect(modeRadio(page, "Melody")).toBeChecked();
    await expect(modeRadio(page, "Full")).not.toBeChecked();
    await expect(seedField(page)).toHaveValue("42");
    await expect(lyricsRegion(page)).toBeVisible();
  });

  test("closes with Escape and gives the focus back to the button, and leaves the selection alone", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await harness.layout.select(["Vocal:0"]);
    await openPanel(page, press);
    await styleBox(page).focus();

    await page.keyboard.press("Escape");

    await expect(panel(page)).toBeHidden();
    await expect(projectButton(page)).toBeFocused();
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);
  });
});

test.describe("the song project panel's fields", () => {
  test("a style typed and left is taken as one undo step; closing the panel takes what was typed", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { style: "warm pop" });
    await openPanel(page, press);

    await styleBox(page).fill("slow jazz, brushes");
    await styleBox(page).blur();
    expect((await project(page)).style).toBe("slow jazz, brushes");
    expect(await harness.layout.canUndo()).toBe(true);

    await styleBox(page).fill("slow jazz, brushes and bass");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    expect((await project(page)).style).toBe("slow jazz, brushes and bass");

    await harness.layout.undo();
    expect((await project(page)).style).toBe("slow jazz, brushes");
    await harness.layout.undo();
    expect((await project(page)).style).toBe("warm pop");
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a style is cleared as one undo step, and the empty field says it is not set", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { style: "warm pop" });
    await openPanel(page, press);

    await styleBox(page).focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await styleBox(page).blur();

    expect((await project(page)).style).toBe("");
    await expect(panel(page).getByText("Not set. Describe the style you want.")).toBeVisible();

    await harness.layout.undo();
    expect((await project(page)).style).toBe("warm pop");
    await expect(styleBox(page)).toHaveValue("warm pop");
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("the score mode is chosen with one press, as one undo step", async ({ page, harness, press }) => {
    await openSong(harness, SONG, { scoreMode: "melody" });
    await openPanel(page, press);

    await press(modeRadio(page, "Full"));
    await expect(modeRadio(page, "Full")).toBeChecked();
    expect((await project(page)).scoreMode).toBe("full");

    await harness.layout.undo();
    expect((await project(page)).scoreMode).toBe("melody");
    await expect(modeRadio(page, "Melody")).toBeChecked();
    expect(await harness.layout.canUndo()).toBe(false);

    await press(modeRadio(page, "Full"));
    await press(modeRadio(page, "Melody"));
    expect((await project(page)).scoreMode).toBe("melody");
    await harness.layout.undo();
    expect((await project(page)).scoreMode).toBe("full");
  });

  test("the history keys in the style box are the browser's, and leave the project's history alone", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { style: "warm pop, 100 BPM" });
    await tempoField(page).fill("140");
    await tempoField(page).press("Enter");
    await expect.poll(() => scoreText(page)).toContain("\nQ:1/4=140\n");
    await openPanel(page, press);
    await styleBox(page).focus();
    await page.keyboard.type(" mellow");

    await page.keyboard.press("ControlOrMeta+z");

    expect(await scoreText(page)).toContain("\nQ:1/4=140\n");
    expect(await harness.layout.canUndo()).toBe(true);
    expect((await project(page)).style).toBe("warm pop, 140 BPM");
  });

  test("a popover that is closed from outside while the style box has the focus still takes what was typed", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { style: "warm pop" });
    await openPanel(page, press);
    await styleBox(page).fill("slow jazz");

    await panel(page).evaluate((element) => (element as HTMLElement).hidePopover());

    await expect(panel(page)).toBeHidden();
    expect((await project(page)).style).toBe("slow jazz");
  });

  test("a seed is typed, then cleared with the Clear button; each is one undo step", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { seed: 42 });
    await openPanel(page, press);

    await seedField(page).fill("-7");
    await seedField(page).press("Enter");
    expect((await project(page)).seed).toBe(-7);

    await press(panel(page).getByRole("button", { name: "Clear the seed" }));
    expect((await project(page)).seed).toBeNull();
    await expect(seedField(page)).toHaveValue("");

    await harness.layout.undo();
    expect((await project(page)).seed).toBe(-7);
    await expect(seedField(page)).toHaveValue("-7");
    await harness.layout.undo();
    expect((await project(page)).seed).toBe(42);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a seed that is not a whole number is refused with the reason, and the field goes back", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { seed: 42 });
    await openPanel(page, press);

    await seedField(page).fill("1.5");
    await seedField(page).press("Enter");

    const notices = await harness.notices();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ code: "command-refused", message: expect.stringContaining("1.5") });
    await expect(seedField(page)).toHaveValue("42");
    expect((await project(page)).seed).toBe(42);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("fields the host did not give say so, and a person can fill each one", async ({ page, harness, press }) => {
    // A score whose opening section has no name: with no lyric lines either, the joined lyrics are empty.
    await openSong(harness, SONG.replace("% a\n", ""), { style: "", scoreMode: undefined, seed: null, lyrics: "" });
    await openPanel(page, press);

    await expect(styleBox(page)).toHaveValue("");
    await expect(panel(page).getByText("Not set. Describe the style you want.")).toBeVisible();
    await expect(modeRadio(page, "Full")).not.toBeChecked();
    await expect(modeRadio(page, "Melody")).not.toBeChecked();
    await expect(panel(page).getByText("Not set. Choose one.")).toBeVisible();
    await expect(seedField(page)).toHaveValue("");
    await expect(panel(page).getByText("Not set. Each generation picks its own.")).toBeVisible();
    await expect(panel(page).getByText("No lyrics yet.")).toBeVisible();
    await expect(panel(page).getByText(`0 of ${LYRICS_MAX_CHARACTERS} characters`)).toBeVisible();

    await styleBox(page).fill("lofi");
    await styleBox(page).blur();
    await press(modeRadio(page, "Melody"));
    await seedField(page).fill("9");
    await seedField(page).press("Enter");

    const fields = await project(page);
    expect([fields.style, fields.scoreMode, fields.seed]).toEqual(["lofi", "melody", 9]);
    await expect(panel(page).getByText("Not set. Describe the style you want.")).toBeHidden();
    await expect(panel(page).getByText("Not set. Choose one.")).toBeHidden();
    await expect(panel(page).getByText("Not set. Each generation picks its own.")).toBeHidden();
  });
});

test.describe("the song project panel's lyrics and notices", () => {
  const joined = (page: Page) => lyricsRegion(page).evaluate((element) => element.textContent);

  test("shows the lyrics as they are joined, with their count", async ({ page, harness, press }) => {
    await openSong(harness, SONG, { lyrics: "[a]\nla la la\ndo re mi" });
    await openPanel(page, press);

    // "[a]" and two lines of eight characters, with a line break between each: 3 + 1 + 8 + 1 + 8.
    expect(await joined(page)).toBe("[a]\nla la la\ndo re mi");
    await expect(panel(page).getByText(`21 of ${LYRICS_MAX_CHARACTERS} characters`)).toBeVisible();
    await expect(panel(page).getByRole("note")).toHaveCount(0);
    await expect(projectButton(page)).toHaveAccessibleName("Project");
  });

  test("a line the score has no bar for is told as unaligned and is left out of the count", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { lyrics: "[a]\nla la la\ndo re mi\nextra" });
    await openPanel(page, press);

    expect(await joined(page)).toBe("[a]\nla la la\ndo re mi");
    await expect(panel(page).getByText(`21 of ${LYRICS_MAX_CHARACTERS} characters`)).toBeVisible();
    await expect(
      panel(page).getByRole("note").filter({ hasText: "1 lyric line is unaligned and left out of the joined lyrics." }),
    ).toHaveCount(1);
    await expect(projectButton(page)).toHaveAccessibleName("Project, 1 notice");
  });

  test("over the lyrics limit the panel says so and still lets the person edit", async ({ page, harness, press }) => {
    const long = `[a]\n${"a".repeat(2100)}\n${"b".repeat(2100)}`;
    const over = 3 + 1 + 2100 + 1 + 2100;
    await openSong(harness, SONG, { lyrics: long, style: "pop" });
    await openPanel(page, press);

    // "[a]" 3, two lines of 2,100, two line breaks: 3 + 1 + 2100 + 1 + 2100 = 4,205.
    await expect(panel(page).getByText(`${over} of ${LYRICS_MAX_CHARACTERS} characters`)).toBeVisible();
    await expect(
      panel(page)
        .getByRole("note")
        .filter({
          hasText: `The joined lyrics are ${over} characters; song2 generation accepts ${LYRICS_MAX_CHARACTERS}.`,
        }),
    ).toHaveCount(1);
    await expect(projectButton(page)).toHaveAccessibleName("Project, 1 notice");

    await styleBox(page).fill("pop, bright");
    await styleBox(page).blur();
    expect((await project(page)).style).toBe("pop, bright");
  });

  test("a melody project with chords says so; deleting the chords is one undo step", async ({
    page,
    harness,
    press,
  }) => {
    const withChords = vocalOnly('"C"C4D4E4F4|"G"G16|');
    await openSong(harness, withChords, { scoreMode: "melody" });
    await openPanel(page, press);
    const notice = panel(page).getByRole("note").filter({ hasText: "Melody mode cannot carry chords" });
    await expect(notice).toHaveCount(1);

    await press(notice.getByRole("button", { name: "Delete all chords" }));

    expect(await scoreText(page)).not.toContain('"C"');
    expect(await scoreText(page)).not.toContain('"G"');
    expect((await project(page)).scoreMode).toBe("melody");
    await expect(notice).toHaveCount(0);

    await harness.layout.undo();
    expect(await scoreText(page)).toBe(withChords);
    await expect(notice).toHaveCount(1);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("switching to full from the notice keeps the chords; it is one undo step", async ({ page, harness, press }) => {
    const withChords = vocalOnly('"C"C4D4E4F4|"G"G16|');
    await openSong(harness, withChords, { scoreMode: "melody" });
    await openPanel(page, press);
    const notice = panel(page).getByRole("note").filter({ hasText: "Melody mode cannot carry chords" });

    await press(notice.getByRole("button", { name: "Switch to full" }));

    expect((await project(page)).scoreMode).toBe("full");
    expect(await scoreText(page)).toBe(withChords);
    await expect(notice).toHaveCount(0);
    await expect(modeRadio(page, "Full")).toBeChecked();

    await harness.layout.undo();
    expect((await project(page)).scoreMode).toBe("melody");
    await expect(notice).toHaveCount(1);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a notice the project carries is not repeated in the toolbar's strip when a command carries it again", async ({
    page,
    harness,
    press,
  }) => {
    const withChords = vocalOnly('"C"C4D4E4F4|"G"G16|');
    await openSong(harness, withChords, { scoreMode: "melody" });
    await openPanel(page, press);
    const notice = panel(page).getByRole("note").filter({ hasText: "Melody mode cannot carry chords" });
    await expect(notice).toHaveCount(1);
    await page.keyboard.press("Escape");

    await press(transposeUp(page));

    await expect.poll(() => scoreText(page)).not.toBe(withChords);
    await expect(toolbar(page).getByRole("note")).toHaveCount(0);
    await openPanel(page, press);
    await expect(notice).toHaveCount(1);
  });

  test("a fix pressed from the keyboard leaves the focus inside the panel", async ({ page, harness, press }) => {
    const withChords = vocalOnly('"C"C4D4E4F4|"G"G16|');
    await openSong(harness, withChords, { scoreMode: "melody" });
    await openPanel(page, press);
    const fix = panel(page).getByRole("button", { name: "Delete all chords" });
    await fix.focus();

    await page.keyboard.press("Enter");

    expect(await scoreText(page)).not.toContain('"C"');
    expect((await project(page)).scoreMode).toBe("melody");
    expect(await panel(page).evaluate((element) => element.contains(document.activeElement))).toBe(true);
  });
});

test.describe("the song project panel, read-only and in Chinese", () => {
  test("read-only shows the values and edits nothing; the notices stay and the fixes do not", async ({
    page,
    harness,
    press,
  }) => {
    const withChords = vocalOnly('"C"C4D4E4F4|"G"G16|');
    await openSong(
      harness,
      withChords,
      { style: "warm pop", scoreMode: "melody", seed: 5, lyrics: "[a]\nla la la" },
      { editable: false },
    );
    await expect(projectButton(page)).toBeVisible();
    await openPanel(page, press);

    await expect(panel(page).getByText("warm pop", { exact: true })).toBeVisible();
    await expect(panel(page).getByRole("group", { name: "Style description" })).toHaveText("warm pop");
    await expect(panel(page).getByText("Melody", { exact: true }).locator("visible=true")).toBeVisible();
    await expect(panel(page).getByText("5", { exact: true })).toBeVisible();
    await expect(panel(page).getByRole("group", { name: "Seed" })).toHaveText("5");
    await expect(panel(page).getByText(`12 of ${LYRICS_MAX_CHARACTERS} characters`)).toBeVisible();
    expect(await lyricsRegion(page).evaluate((element) => element.textContent)).toBe("[a]\nla la la");
    await expect(panel(page).getByRole("note").filter({ hasText: "Melody mode cannot carry chords" })).toHaveCount(1);
    for (const control of ["textbox", "radio", "spinbutton", "button"] as const) {
      await expect(panel(page).getByRole(control)).toHaveCount(0);
    }
    expect(await harness.layout.canUndo()).toBe(false);

    await harness.layout.setEditable(true);
    await expect(styleBox(page)).toHaveValue("warm pop");
    await expect(panel(page).getByRole("button", { name: "Delete all chords" })).toBeVisible();
  });

  test("read-only says that a field is not set", async ({ page, harness, press }) => {
    await openSong(harness, SONG, { style: "", scoreMode: undefined, seed: null }, { editable: false });
    await openPanel(page, press);
    await expect(panel(page).getByText("Not set", { exact: true })).toHaveCount(3);
  });

  test("speaks Chinese when the session does", async ({ page, harness, press }) => {
    await openSong(harness, SONG, { style: "", scoreMode: "full", seed: null }, { language: "zh" });
    const button = toolbar(page).getByRole("button", { name: /^歌曲项目/ });
    await press(button);
    const zh = page.getByRole("dialog", { name: "歌曲项目" });
    await expect(zh).toBeVisible();
    await expect(zh.getByRole("textbox", { name: "风格描述" })).toBeVisible();
    await expect(zh.getByRole("radio", { name: "完整（full）" })).toBeChecked();
    await expect(zh.getByRole("spinbutton", { name: "种子" })).toBeVisible();
    await expect(zh.getByRole("region", { name: "歌词" })).toBeVisible();
    // The joined lyrics are the label of the score's one named section, "[a]": three characters.
    await expect(zh.getByText(`3 / ${LYRICS_MAX_CHARACTERS} 字`)).toBeVisible();
  });
});

test.describe("the song project panel mounted on its own", () => {
  test("is a named region, and a host that mounted it can take a pending field when it closes", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({
      score: { text: SONG },
      project: { style: "warm pop", seed: 42 },
      parts: ["panel"],
    });
    const standalone = page.getByRole("region", { name: "Project" });
    await expect(standalone).toBeVisible();

    await standalone.getByRole("textbox", { name: "Style description" }).fill("lofi");
    await harness.layout.commitPart("panel");
    expect((await project(page)).style).toBe("lofi");

    await standalone.getByRole("spinbutton", { name: "Seed" }).fill("-3");
    await harness.layout.commitPart("panel");
    expect((await project(page)).seed).toBe(-3);
  });
});

test.describe("the controls in the default editor at the window's width", () => {
  const project = { style: "warm pop, 100 BPM", scoreMode: "melody", seed: 3, lyrics: "[a]\nla la" };
  const withChords = vocalOnly('"C"C4D4E4F4|"G"G16|');

  test("are in the default editor: tempo, key, transpose and the Project button, and the panel opens", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: SONG }, project });
    await expect(page.getByRole("spinbutton", { name: "Tempo (BPM)" })).toHaveValue("100");
    await expect(page.getByRole("combobox", { name: "Key" })).toHaveValue("C");
    await expect(page.getByRole("button", { name: "Transpose up a semitone" })).toBeVisible();

    await press(projectButton(page));
    await expect(page.getByRole("textbox", { name: "Style description" })).toHaveValue("warm pop, 100 BPM");
    // The dialog's name is the panel's name: the region inside it carries no second "Project".
    await expect(page.getByRole("dialog", { name: "Project" }).getByRole("region", { name: "Project" })).toHaveCount(0);
  });

  test("in a 320 pixel box the two transpose buttons stay on one line and nothing is wider than the box", async ({
    page,
    harness,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await harness.mount({ score: { text: SONG }, project });
    const down = await box(page.getByRole("button", { name: "Transpose down a semitone" }));
    const up = await box(page.getByRole("button", { name: "Transpose up a semitone" }));
    expect(Math.abs(down.y - up.y)).toBeLessThan(1);
    expect(down.x + down.width).toBeLessThanOrEqual(up.x + 1);
    for (const control of [
      page.getByRole("spinbutton", { name: "Tempo (BPM)" }),
      page.getByRole("combobox", { name: "Key" }),
      page.getByRole("button", { name: "Transpose up a semitone" }),
      projectButton(page),
    ]) {
      const found = await box(control);
      expect(found.x).toBeGreaterThanOrEqual(0);
      expect(found.x + found.width).toBeLessThanOrEqual(320);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test("on a window narrower than 40em the panel spans the window under the button", async ({
    page,
    harness,
    press,
  }) => {
    await page.setViewportSize({ width: 500, height: 700 });
    await harness.mount({ score: { text: SONG }, project });
    await press(projectButton(page));
    const opened = await box(panel(page));
    const button = await box(projectButton(page));
    expect(opened.x).toBeCloseTo(8, 0);
    expect(opened.x + opened.width).toBeCloseTo(492, 0);
    expect(opened.y).toBeGreaterThanOrEqual(button.y + button.height);
  });

  test("on a wide window the panel stays under its button, inside the window", async ({ page, harness, press }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await harness.mount({ score: { text: SONG }, project });
    await press(projectButton(page));
    const opened = await box(panel(page));
    const button = await box(projectButton(page));
    expect(opened.x).toBeGreaterThanOrEqual(8 - 0.5);
    expect(opened.x + opened.width).toBeLessThanOrEqual(1280 - 8 + 0.5);
    expect(opened.y).toBeGreaterThanOrEqual(button.y + button.height);
    expect(opened.width).toBeLessThan(500);
  });

  test("where the pointer is coarse the fields are 16 pixels and the controls 36 pixels high", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    test.skip(!isMobile, "a coarse pointer is the phone project's");
    await harness.mount({ score: { text: withChords }, project });
    await press(projectButton(page));
    const fontSize = (target: Locator) => target.evaluate((el) => getComputedStyle(el).fontSize);
    for (const field of [
      page.getByRole("spinbutton", { name: "Tempo (BPM)" }),
      page.getByRole("combobox", { name: "Key" }),
      page.getByRole("textbox", { name: "Style description" }),
      page.getByRole("spinbutton", { name: "Seed" }),
    ]) {
      expect(await fontSize(field)).toBe("16px");
    }
    for (const control of [
      page.getByRole("spinbutton", { name: "Tempo (BPM)" }),
      page.getByRole("combobox", { name: "Key" }),
      page.getByRole("button", { name: "Transpose up a semitone" }),
      page.getByRole("button", { name: "Transpose down a semitone" }),
      projectButton(page),
      page.getByRole("spinbutton", { name: "Seed" }),
      page.getByRole("button", { name: "Clear the seed" }),
      page.getByRole("button", { name: "Delete all chords" }),
    ]) {
      expect((await box(control)).height).toBeGreaterThanOrEqual(36);
    }
    const radioRow = await modeRadio(page, "Full").evaluate(
      (element) => element.parentElement?.getBoundingClientRect().height ?? 0,
    );
    expect(radioRow).toBeGreaterThanOrEqual(36);
  });
});

test.describe("the panel hangs from its button", () => {
  const withChords = vocalOnly('"C"C4D4E4F4|"G"G16|');
  const popover = (page: Page) => panel(page);
  const gapUnder = async (page: Page) => {
    const opened = await box(popover(page));
    const toolbar = await box(page.locator(".sce-toolbar"));
    return opened.y - (toolbar.y + toolbar.height);
  };

  test("when a notice comes and goes, and the toolbar wraps again, the panel stays below the toolbar", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: withChords }, project: { scoreMode: "full" } });
    await press(projectButton(page));
    await expect(popover(page)).toBeVisible();
    await expect.poll(() => gapUnder(page)).toBeGreaterThanOrEqual(7);

    await press(page.getByRole("radio", { name: "Melody" }));
    await expect(projectButton(page)).toHaveAccessibleName("Project, 1 notice");
    await expect.poll(() => gapUnder(page)).toBeGreaterThanOrEqual(7);

    await press(page.getByRole("button", { name: "Delete all chords" }));
    await expect(projectButton(page)).toHaveAccessibleName("Project");
    await expect.poll(() => gapUnder(page)).toBeGreaterThanOrEqual(7);
  });

  test("when the window narrows while it is open, it spans the window", async ({ page, harness, press }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await harness.mount({ score: { text: SONG } });
    await press(projectButton(page));
    await expect(popover(page)).toBeVisible();
    expect((await box(popover(page))).width).toBeLessThan(500);

    await page.setViewportSize({ width: 500, height: 700 });

    await expect.poll(async () => (await box(popover(page))).x).toBeCloseTo(8, 0);
    expect(Math.round((await box(popover(page))).width)).toBe(484);
  });
});

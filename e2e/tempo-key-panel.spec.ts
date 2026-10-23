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

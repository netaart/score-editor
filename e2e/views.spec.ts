// ABOUTME: Seam 5 for the staff view, the text view, the view switch and the stale notice: parts on one session, and the default editor.
// ABOUTME: Tests type, click and tap as a user does, and read what the session holds, in desktop and phone projects.
import type { Page } from "@playwright/test";
import { expect, type Harness, test, vocalOnly } from "./fixtures";

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);

/** Four quarter notes, then a whole note: six header lines, the key line, the section line, then a voice line and the music. */
const QUARTERS = vocalOnly("C4D4E4F4|G16|");
/** The same score with the D turned into a rest, worked out by hand from the text above. */
const QUARTERS_WITHOUT_D = QUARTERS.replace("C4D4E4F4|", "C4z4E4F4|");
/** The music line of QUARTERS is line 10: X, T, M, L, Q, V, K, the section line, V: Vocal, then the music. */
const MUSIC_LINE = 10;
/** A duration the format does not allow, on the music line. */
const BROKEN = QUARTERS.replace("C4D4E4F4|", "C5D4E4F4|");

const D4 = "D4, bar 1 beat 2, length 1 beat";
const vocalNote = (page: Page, name: string) => slot(page, "vocal").getByRole("listitem", { name, exact: true });

const textBox = (page: Page) => slot(page, "text").getByRole("textbox", { name: "Score text" });
const problems = (page: Page) => slot(page, "text").getByRole("list", { name: "Problems" });
const status = (page: Page) => slot(page, "text").getByRole("status");

/** The pause after the last keystroke before text that reads is handed to the project, as the part keeps it. */
const PAUSE_MS = 600;

async function openText(harness: Harness, options: Record<string, unknown> = {}) {
  await harness.layout.open({ score: { text: QUARTERS }, parts: ["text", "vocal"], ...options });
}

test.describe("the text view", () => {
  test("shows the score text in a box of its own, a number for each line beside it, and says there is no problem", async ({
    page,
    harness,
  }) => {
    await openText(harness);

    await expect(textBox(page)).toHaveValue(QUARTERS);
    const lines = QUARTERS.split("\n").length;
    await expect(slot(page, "text").locator(".sce-gutter-line")).toHaveCount(lines);
    await expect(slot(page, "text").locator(".sce-gutter-line").first()).toHaveText("1");
    await expect(slot(page, "text").locator(".sce-gutter-line").last()).toHaveText(String(lines));
    await expect(status(page)).toHaveText("No problems");
    await expect(problems(page)).toHaveCount(0);
  });

  test("hands a readable change to the project after a pause, as one step, and the other parts follow", async ({
    page,
    harness,
  }) => {
    await page.clock.install();
    await openText(harness);
    await expect(vocalNote(page, D4)).toBeVisible();

    await textBox(page).fill(QUARTERS_WITHOUT_D);
    await page.clock.runFor(PAUSE_MS - 100);
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);

    await page.clock.runFor(200);
    expect(await harness.layout.scoreText()).toBe(QUARTERS_WITHOUT_D);
    await expect(vocalNote(page, D4)).toHaveCount(0);
    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(textBox(page)).toHaveValue(QUARTERS);
    await expect(vocalNote(page, D4)).toBeVisible();
  });

  test("makes one undo step of a burst of typing in which every key leaves a text that reads", async ({
    page,
    harness,
  }) => {
    await openText(harness);
    // Each apostrophe raises the first note by an octave and leaves a score that reads, so a part that handed text over
    // at every key would make two steps here and not one.
    await textBox(page).evaluate((el: HTMLTextAreaElement) => {
      const after = el.value.indexOf("C4D4E4F4|") + 1;
      el.focus();
      el.setSelectionRange(after, after);
    });

    await page.keyboard.type("''");

    const raised = QUARTERS.replace("C4D4E4F4|", "C''4D4E4F4|");
    await expect.poll(() => harness.layout.scoreText()).toBe(raised);
    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("hands over at once when the box loses the focus, without waiting for the pause", async ({ page, harness }) => {
    await page.clock.install();
    await openText(harness);

    await textBox(page).fill(QUARTERS_WITHOUT_D);
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    await slot(page, "vocal").getByRole("region", { name: "Vocal" }).focus();

    expect(await harness.layout.scoreText()).toBe(QUARTERS_WITHOUT_D);
    expect(await harness.layout.canUndo()).toBe(true);
  });

  test("keeps text that cannot be read in the box, lists what is wrong with it and where, and leaves the project alone", async ({
    page,
    harness,
  }) => {
    await openText(harness);

    await textBox(page).fill(BROKEN);

    await expect(problems(page).getByRole("listitem")).toHaveText([
      `The duration “5” is not allowed. (bar 1, line ${MUSIC_LINE})`,
    ]);
    await expect(textBox(page)).toHaveAttribute("aria-invalid", "true");
    await expect(status(page)).toHaveText("1 problem. The other views still show the last readable score.");
    await expect(slot(page, "text").locator('.sce-gutter-line[data-problem="true"]')).toHaveText(String(MUSIC_LINE));
    expect(await harness.layout.rejectedText()).toEqual({ text: BROKEN, codes: ["duration"] });
    await page.waitForTimeout(PAUSE_MS + 200);
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(vocalNote(page, D4)).toBeVisible();

    await textBox(page).fill(QUARTERS);
    await expect(problems(page)).toHaveCount(0);
    await expect(status(page)).toHaveText("No problems");
    expect(await harness.layout.rejectedText()).toBeNull();
  });

  test("puts the caret on the line of a problem when the problem is chosen", async ({ page, harness, press }) => {
    await openText(harness);
    await textBox(page).fill(BROKEN);

    await press(problems(page).getByRole("button"));

    await expect(textBox(page)).toBeFocused();
    const selected = await textBox(page).evaluate((el: HTMLTextAreaElement) =>
      el.value.slice(el.selectionStart, el.selectionEnd),
    );
    expect(selected).toBe("C5D4E4F4|G16|");
  });

  test("speaks the session's language, and follows it when it changes", async ({ page, harness }) => {
    await openText(harness, { language: "zh" });
    await expect(slot(page, "text").getByRole("textbox", { name: "乐谱文本" })).toBeVisible();
    await expect(status(page)).toHaveText("没有问题");

    await slot(page, "text").getByRole("textbox", { name: "乐谱文本" }).fill(BROKEN);
    await expect(slot(page, "text").getByRole("list", { name: "问题" }).getByRole("listitem")).toHaveText([
      `时值 “5”不在允许的范围内。（第 1 小节，第 ${MUSIC_LINE} 行）`,
    ]);
    await expect(status(page)).toHaveText("1 个问题。其他视图显示的仍是上一份能读的乐谱。");

    await harness.layout.setView({ language: "en" });
    await expect(problems(page).getByRole("listitem")).toHaveText([
      `The duration “5” is not allowed. (bar 1, line ${MUSIC_LINE})`,
    ]);
    await expect(textBox(page)).toHaveValue(BROKEN);
  });

  test("shows a project whose own score cannot be read with its problems, and fixes it from the box", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: BROKEN }, parts: ["text"] });

    await expect(textBox(page)).toHaveValue(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);
    await expect(status(page)).toHaveText("1 problem");

    await textBox(page).fill(QUARTERS);
    await expect.poll(() => harness.layout.scoreText()).toBe(QUARTERS);
    await expect(problems(page)).toHaveCount(0);
    await expect(status(page)).toHaveText("No problems");
  });

  test("is read-only while the session is: the text can be read and selected, and typing changes nothing", async ({
    page,
    harness,
  }) => {
    await openText(harness, { editable: false });

    await expect(textBox(page)).toHaveAttribute("readonly", "");
    await textBox(page).focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("V: Vocal\nC16|\n");
    await page.waitForTimeout(PAUSE_MS + 200);
    await expect(textBox(page)).toHaveValue(QUARTERS);
    expect(await harness.layout.scoreText()).toBe(QUARTERS);

    await harness.layout.setEditable(true);
    await expect(textBox(page)).not.toHaveAttribute("readonly", "");
  });

  test("gives up text it has not handed over when the session turns read-only, since nothing may be handed over now", async ({
    page,
    harness,
  }) => {
    await openText(harness);
    await textBox(page).fill(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);

    await harness.layout.setEditable(false);

    await expect(textBox(page)).toHaveValue(QUARTERS);
    await expect(textBox(page)).toHaveAttribute("readonly", "");
    await expect(problems(page)).toHaveCount(0);
    await expect(status(page)).toHaveText("No problems");
    expect(await harness.layout.rejectedText()).toBeNull();
  });

  test("shows the project's text again when the project changes from elsewhere, dropping text it could not take", async ({
    page,
    harness,
  }) => {
    await openText(harness);
    await textBox(page).fill(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);

    await harness.layout.dispatch({ type: "toRest", noteId: "Vocal:256" });

    await expect(textBox(page)).toHaveValue(QUARTERS_WITHOUT_D);
    await expect(problems(page)).toHaveCount(0);
    await expect(status(page)).toHaveText("No problems");
    expect(await harness.layout.rejectedText()).toBeNull();
  });

  test("is read-only with a sentence of its own when no dialect reads the project's model", async ({
    page,
    harness,
  }) => {
    await openText(harness, { project: { modelId: "other-model" }, parts: ["text"] });

    await expect(textBox(page)).toHaveAttribute("readonly", "");
    await expect(textBox(page)).toHaveValue(QUARTERS);
    await expect(status(page)).toHaveText(
      "The score format of “other-model” isn't supported by this editor, so the score can't be shown.",
    );
  });

  test("leaves nothing behind when it is destroyed, not even the text it was about to hand over", async ({
    page,
    harness,
  }) => {
    await openText(harness);
    await textBox(page).fill(QUARTERS_WITHOUT_D);

    await harness.layout.destroyPart("text", 2);

    await expect(slot(page, "text")).toBeEmpty();
    await page.waitForTimeout(PAUSE_MS + 200);
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);
  });
});

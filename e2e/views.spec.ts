// ABOUTME: Seam 5 for the staff view, the text view, the view switch and the stale notice: parts on one session, and the default editor.
// ABOUTME: Tests type, click and tap as a user does, and read what the session holds, in desktop and phone projects.
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, test, vocalOnly } from "./fixtures";

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);

/** The skill's real two-voice score: 4/4 at 190, with Ins's intro `Z4` against Vocal's four bars. */
const REAL_SCORE = readFileSync("packages/score-editor/skills/score-editor/assets/edit-one-bar/score.abc", "utf8");

/** A Vocal-and-Ins song2 score in C major, 4/4, at `bpm`, with the given music lines under one section. */
function twoVoice(vocal: string[], ins: string[], bpm = 100): string {
  const header = [
    "X:1",
    "T:",
    "M:4/4",
    "L:1/16",
    `Q:1/4=${bpm}`,
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    'V: Ins clef=treble name="Ins Melody" snm="Inst."',
  ];
  return [
    ...header,
    "K:C",
    "% a",
    // song2 writes a group as a Vocal block then an Ins block, so the lines alternate.
    ...vocal.flatMap((line, index) => ["V: Vocal", line, ...(ins[index] === undefined ? [] : ["V: Ins", ins[index]])]),
    "",
  ].join("\n");
}

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
const textNotice = (page: Page) => slot(page, "text").getByRole("note");
/** QUARTERS with the chord C on its first note: a melody project cannot carry it, and the editor says so without refusing it. */
const QUARTERS_WITH_CHORD = QUARTERS.replace("C4D4E4F4|", '"C"C4D4E4F4|');

/** The pause after the last keystroke before text that reads is handed to the project, as the part keeps it. */
const PAUSE_MS = 600;

/**
 * Stops the faked clock. After `clock.install` time still flows, so on a busy machine the pause could pass before a
 * check that nothing was handed over yet.
 */
const stopClock = async (page: Page) => page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));

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

  test("numbers its lines in lining, tabular numerals, as every number that can change is", async ({
    page,
    harness,
  }) => {
    await openText(harness);

    const numerals = await slot(page, "text")
      .locator(".sce-gutter")
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric);

    expect(numerals).toBe("lining-nums tabular-nums");
  });

  test("hands a readable change to the project after a pause, as one step, and the other parts follow", async ({
    page,
    harness,
  }) => {
    await page.clock.install();
    await openText(harness);
    await expect(vocalNote(page, D4)).toBeVisible();
    await stopClock(page);

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
    await textBox(page).click();
    await page.keyboard.press("Control+Home");
    for (let line = 1; line < MUSIC_LINE; line++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");

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
    await stopClock(page);

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
    await page.clock.install();

    await textBox(page).fill(BROKEN);

    await expect(problems(page).getByRole("listitem")).toHaveText([
      `The duration “5” is not allowed. (bar 1, line ${MUSIC_LINE})`,
    ]);
    await expect(textBox(page)).toHaveAttribute("aria-invalid", "true");
    await expect(status(page)).toHaveText("1 problem. The other views still show the last readable score.");
    await expect(slot(page, "text").locator('.sce-gutter-line[data-problem="true"]')).toHaveText(String(MUSIC_LINE));
    expect(await harness.layout.rejectedText()).toEqual({ text: BROKEN, codes: ["duration"] });
    await page.clock.runFor(PAUSE_MS + 200);
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(vocalNote(page, D4)).toBeVisible();

    await textBox(page).fill(QUARTERS);
    await expect(problems(page)).toHaveCount(0);
    await expect(status(page)).toHaveText("No problems");
    expect(await harness.layout.rejectedText()).toBeNull();
  });

  test("takes text that comes back with a notice, keeps it in the box, and says the notice apart from the problems", async ({
    page,
    harness,
  }) => {
    await openText(harness, { project: { scoreMode: "melody" } });
    await expect(textNotice(page)).toHaveCount(0);

    await textBox(page).fill(QUARTERS_WITH_CHORD);
    await textBox(page).blur();

    await expect(textNotice(page)).toHaveText("Melody mode cannot carry chords; delete all chords or switch to full.");
    await expect(textBox(page)).toHaveAttribute("aria-describedby", /sce-text-notice-\d+/);
    await expect(textBox(page)).not.toHaveAttribute("aria-invalid", "true");
    await expect(problems(page)).toHaveCount(0);
    await expect(status(page)).toHaveText("No problems");
    await expect(textBox(page)).toHaveValue(QUARTERS_WITH_CHORD);
    expect(await harness.layout.scoreText()).toBe(QUARTERS_WITH_CHORD);
    expect(await harness.layout.rejectedText()).toBeNull();
    expect(await harness.layout.canUndo()).toBe(true);

    // A text that cannot be read has problems to say, and the notice of the text before it steps aside.
    await textBox(page).fill(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);
    await expect(textNotice(page)).toHaveCount(0);

    // Back to the text the project holds: the notice is true of it again.
    await textBox(page).fill(QUARTERS_WITH_CHORD);
    await textBox(page).blur();
    await expect(problems(page)).toHaveCount(0);
    await expect(textNotice(page)).toHaveCount(1);

    // The project moved from elsewhere: the notice was about the replacement, which is undone.
    expect(await harness.layout.undo()).toBe(true);
    await expect(textBox(page)).toHaveValue(QUARTERS);
    await expect(textNotice(page)).toHaveCount(0);
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
    await page.clock.install();

    await expect(textBox(page)).toHaveAttribute("readonly", "");
    await textBox(page).focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("V: Vocal\nC16|\n");
    await page.clock.runFor(PAUSE_MS + 200);
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

  test("shows the project's text again when the project is replaced with the same score, dropping text it could not take", async ({
    page,
    harness,
  }) => {
    await openText(harness);
    await textBox(page).fill(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);

    await harness.layout.replace({ project: { style: "another style" } });

    await expect(textBox(page)).toHaveValue(QUARTERS);
    await expect(problems(page)).toHaveCount(0);
    await expect(status(page)).toHaveText("No problems");
    expect(await harness.layout.rejectedText()).toBeNull();
  });

  test("drops text it has not handed over when the project is replaced with the same score, instead of handing it to the new document", async ({
    page,
    harness,
  }) => {
    await openText(harness);
    await page.clock.install();
    await textBox(page).fill(QUARTERS_WITHOUT_D);

    await harness.layout.replace({ project: { style: "another style" } });
    await page.clock.runFor(PAUSE_MS + 200);

    await expect(textBox(page)).toHaveValue(QUARTERS);
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("shows the project's text again when the dialects are replaced, dropping text it could not take", async ({
    page,
    harness,
  }) => {
    await openText(harness);
    await textBox(page).fill(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);

    await harness.layout.replaceDialects();

    await expect(textBox(page)).toHaveValue(QUARTERS);
    await expect(problems(page)).toHaveCount(0);
    expect(await harness.layout.rejectedText()).toBeNull();
  });

  test("shows the text the session holds as rejected, with what is wrong with it, when it is mounted again", async ({
    page,
    harness,
  }) => {
    await openText(harness);
    await textBox(page).fill(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);

    await harness.layout.destroyPart("text");
    await harness.layout.mountPart("text");

    await expect(textBox(page)).toHaveValue(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveText([
      `The duration “5” is not allowed. (bar 1, line ${MUSIC_LINE})`,
    ]);
    await expect(status(page)).toHaveText("1 problem. The other views still show the last readable score.");
  });

  test("shows the project's text, with no problem, when it is mounted again after the project changed", async ({
    page,
    harness,
  }) => {
    await openText(harness);
    await textBox(page).fill(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);

    await harness.layout.destroyPart("text");
    await harness.layout.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await harness.layout.mountPart("text");

    await expect(textBox(page)).toHaveValue(QUARTERS_WITHOUT_D);
    await expect(problems(page)).toHaveCount(0);
    await expect(status(page)).toHaveText("No problems");
  });

  test("follows a rejected text that a host sets or clears", async ({ page, harness }) => {
    await openText(harness);

    await harness.layout.setRejectedText(BROKEN);
    await expect(textBox(page)).toHaveValue(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);

    await harness.layout.setRejectedText(null);
    await expect(textBox(page)).toHaveValue(QUARTERS);
    await expect(problems(page)).toHaveCount(0);
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
});

const staleNotice = (page: Page) => slot(page, "stale").getByRole("note");
const STALE =
  "The score text has a problem, so this view still shows the last score that could be read. Fix it in the text view.";

test.describe("the stale notice", () => {
  test("is silent while the project has what the box holds, says so when the text was refused, and goes when it reads again", async ({
    page,
    harness,
  }) => {
    await openText(harness, { parts: ["stale", "text", "vocal"] });
    await expect(staleNotice(page)).toHaveCount(0);

    await textBox(page).fill(BROKEN);
    await expect(staleNotice(page)).toHaveText(STALE);

    await textBox(page).fill(QUARTERS);
    await expect(staleNotice(page)).toHaveCount(0);
  });

  test("marks itself with an edge at its start and draws none of the cut notice's hatch swatch", async ({
    page,
    harness,
  }) => {
    await openText(harness, { parts: ["stale", "text", "vocal"] });
    await textBox(page).fill(BROKEN);

    const drawn = await staleNotice(page).evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        swatch: getComputedStyle(el, "::before").content,
        edge: [style.borderInlineStartWidth, style.borderInlineStartStyle],
      };
    });

    expect(drawn).toEqual({ swatch: "none", edge: ["3px", "solid"] });
  });

  test("says it in the session's language, and follows it when it changes", async ({ page, harness }) => {
    await openText(harness, { parts: ["stale", "text", "vocal"], language: "zh" });
    await slot(page, "text").getByRole("textbox", { name: "乐谱文本" }).fill(BROKEN);
    await expect(staleNotice(page)).toHaveText(
      "乐谱文本里有问题，所以这个视图显示的仍是上一份能读的乐谱。请在文本视图中修正。",
    );

    await harness.layout.setView({ language: "en" });
    await expect(staleNotice(page)).toHaveText(STALE);
  });

  test("goes when the project changes from elsewhere, since the box then shows the project again", async ({
    page,
    harness,
  }) => {
    await openText(harness, { parts: ["stale", "text", "vocal"] });
    await textBox(page).fill(BROKEN);
    await expect(staleNotice(page)).toHaveText(STALE);

    await harness.layout.dispatch({ type: "toRest", noteId: "Vocal:256" });

    await expect(staleNotice(page)).toHaveCount(0);
  });

  test("is not drawn for a project that came with a score that cannot be read: the problem view says that", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: BROKEN }, parts: ["stale", "problem"] });

    await expect(staleNotice(page)).toHaveCount(0);
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("is not drawn while the project has no readable score to be behind: a second unreadable text changes nothing there", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: BROKEN }, parts: ["stale", "text", "problem"] });

    await textBox(page).fill(BROKEN.replace("C5D4E4F4|", "C4D4E4F5|"));
    await expect.poll(() => harness.layout.rejectedText()).not.toBeNull();

    await expect(problems(page).getByRole("listitem")).toHaveCount(1);
    await expect(status(page)).toHaveText("1 problem");
    await expect(staleNotice(page)).toHaveCount(0);
  });
});

const viewSwitch = (page: Page) => slot(page, "switch").getByRole("group", { name: "View" });
const viewButton = (page: Page, name: string) => viewSwitch(page).getByRole("button", { name, exact: true });

test.describe("the view switch", () => {
  test("offers the three views by name, with the shown one pressed", async ({ page, harness }) => {
    await harness.layout.open({ parts: ["switch"] });

    await expect(viewSwitch(page).getByRole("button")).toHaveCount(3);
    await expect(viewButton(page, "Arrangement")).toHaveAttribute("aria-pressed", "true");
    await expect(viewButton(page, "Staff")).toHaveAttribute("aria-pressed", "false");
    await expect(viewButton(page, "Score text")).toHaveAttribute("aria-pressed", "false");
  });

  test("shows another view when one is pressed, and the session says which", async ({ page, harness, press }) => {
    await harness.layout.open({ parts: ["switch"] });

    await press(viewButton(page, "Staff"));
    expect(await harness.layout.activeView()).toBe("staff");
    await expect(viewButton(page, "Staff")).toHaveAttribute("aria-pressed", "true");
    await expect(viewButton(page, "Arrangement")).toHaveAttribute("aria-pressed", "false");

    await press(viewButton(page, "Score text"));
    expect(await harness.layout.activeView()).toBe("text");
    await press(viewButton(page, "Arrangement"));
    expect(await harness.layout.activeView()).toBe("arrangement");
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("follows a view set from outside, as a host's own switcher would set it", async ({ page, harness }) => {
    await harness.layout.open({ parts: ["switch"] });

    await harness.layout.setActiveView("text");

    await expect(viewButton(page, "Score text")).toHaveAttribute("aria-pressed", "true");
    await expect(viewButton(page, "Arrangement")).toHaveAttribute("aria-pressed", "false");
  });

  test("can be reached and pressed with the keyboard", async ({ page, harness, isMobile }) => {
    test.skip(isMobile, "keys are for the desktop project");
    await harness.layout.open({ parts: ["switch"] });

    await viewButton(page, "Staff").focus();
    await page.keyboard.press("Enter");
    expect(await harness.layout.activeView()).toBe("staff");
    await viewButton(page, "Score text").focus();
    await page.keyboard.press("Space");
    expect(await harness.layout.activeView()).toBe("text");
  });

  test("works while the session is read-only", async ({ page, harness, press }) => {
    await harness.layout.open({ parts: ["switch"], editable: false });

    await press(viewButton(page, "Score text"));

    expect(await harness.layout.activeView()).toBe("text");
    await expect(viewButton(page, "Score text")).toHaveAttribute("aria-pressed", "true");
  });

  test("names the views in the session's language, and follows it when it changes", async ({ page, harness }) => {
    await harness.layout.open({ parts: ["switch"], language: "zh" });
    const zh = slot(page, "switch").getByRole("group", { name: "视图" });
    await expect(zh.getByRole("button", { name: "编曲视图", exact: true })).toBeVisible();
    await expect(zh.getByRole("button", { name: "五线谱", exact: true })).toBeVisible();
    await expect(zh.getByRole("button", { name: "乐谱文本", exact: true })).toBeVisible();

    await harness.layout.setView({ language: "en" });
    await expect(viewButton(page, "Staff")).toBeVisible();
  });
});

const toolbarWithViews = (page: Page) => slot(page, "toolbar-views");

test.describe("the toolbar part with the view switch", () => {
  test("puts the switch after the read-only badge, and the preview control after the switch, also while read-only", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ parts: ["toolbar-views", "vocal"], editable: false });

    const badge = await box(toolbarWithViews(page).getByText("Read only", { exact: true }));
    const switchAt = await box(toolbarWithViews(page).getByRole("group", { name: "View" }));
    expect(switchAt.x).toBeGreaterThanOrEqual(badge.x + badge.width);
    const row = await box(toolbarWithViews(page).locator(".sce-toolbar"));
    expect(switchAt.x + switchAt.width).toBeLessThanOrEqual(row.x + row.width + 0.5);
    expect(Math.abs(switchAt.y + switchAt.height / 2 - (badge.y + badge.height / 2))).toBeLessThan(6);

    // The preview control is the last of the row, after the switch: on the same line, or on a later one.
    const preview = await box(toolbarWithViews(page).getByRole("button", { name: "Preview", exact: true }));
    expect(preview.x >= switchAt.x + switchAt.width || preview.y >= switchAt.y + switchAt.height).toBe(true);
  });

  test("is walked in the order it is drawn: undo and redo, Delete, Select, Grid, Bars, Meter, the three views, then the preview", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ parts: ["toolbar-views", "vocal"] });
    const bar = toolbarWithViews(page);
    await bar.getByRole("button", { name: "Undo", exact: true }).focus();

    const walked: string[] = [];
    for (let step = 0; step < 11; step++) {
      walked.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          return el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "";
        }),
      );
      await page.keyboard.press("Tab");
    }

    expect(walked.slice(0, 7)).toEqual(["Undo", "Redo", "Delete", "Select", "Grid: 1/4", "Bars", "Meter 2/4"]);
    expect(walked.slice(7, 11)).toEqual(["Arrangement", "Staff", "Score text", "Preview"]);
  });

  test("names the shown view in its title, and leaves out what only means something on the arrangement", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ parts: ["toolbar-views", "vocal"] });
    const bar = toolbarWithViews(page);
    await expect(bar.getByText("Arrangement", { exact: true })).toBeVisible();
    await expect(bar.getByRole("group", { name: "Zoom" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Delete", exact: true })).toBeVisible();

    await harness.layout.setActiveView("staff");
    await expect(bar.getByText("Staff", { exact: true })).toBeVisible();
    await expect(bar.getByText("Arrangement", { exact: true })).toHaveCount(0);
    await expect(bar.getByRole("group", { name: "Zoom" })).toBeHidden();
    await expect(bar.getByRole("button", { name: "Delete", exact: true })).toBeHidden();
    // Undo and redo mean something in every view, since the text view and a host change the score too.
    await expect(bar.getByRole("group", { name: "History" })).toBeVisible();

    await harness.layout.setActiveView("text");
    await expect(bar.getByText("Score text", { exact: true })).toBeVisible();

    await harness.layout.setActiveView("arrangement");
    await expect(bar.getByText("Arrangement", { exact: true })).toBeVisible();
    await expect(bar.getByRole("group", { name: "Zoom" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  });

  test("names the shown view in the session's language", async ({ page, harness }) => {
    await harness.layout.open({ parts: ["toolbar-views", "vocal"], language: "zh" });

    await harness.layout.setActiveView("staff");

    await expect(toolbarWithViews(page).getByText("五线谱", { exact: true })).toBeVisible();
  });

  test("has no switch and keeps its title without the option, and the zoom control still hides in a view without a time axis", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ parts: ["toolbar", "vocal"] });

    await harness.layout.setActiveView("staff");

    await expect(slot(page, "toolbar").getByRole("group", { name: "View" })).toHaveCount(0);
    await expect(slot(page, "toolbar").getByText("Arrangement", { exact: true })).toBeVisible();
    await expect(slot(page, "toolbar").getByRole("group", { name: "Zoom" })).toBeHidden();
  });
});

const staffSlot = (page: Page) => slot(page, "staff");
/** The root of the staff view part: in the layout's slot, or in the default editor wherever it stands. */
const staffPart = (page: Page) => staffSlot(page).locator(".sce-part-staff");
const staffRegion = (page: Page) => staffSlot(page).getByRole("region", { name: "Staff" });
const drawing = (page: Page) => staffSlot(page).getByRole("img", { name: "The score drawn on a staff" });
/** What abcjs drew, by the classes it puts on its elements: they reach through the open shadow root the drawing sits in. */
const drawnNotes = (page: Page) => staffSlot(page).locator("svg .abcjs-note");
const drawnRests = (page: Page) => staffSlot(page).locator("svg .abcjs-rest");
/** The staff view's cursor, in the drawing's shadow root like the notes it stands over. */
const staffCursor = (page: Page) => staffSlot(page).locator(".sce-staff-cursor");
/** A drawing box, in pixels from the drawing host's corner: the coordinates the cursor is positioned in. */
interface DrawnBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The boxes of the elements matching `selector`, in the drawing host's coordinates. */
function drawnBoxes(page: Page, selector: string): Promise<DrawnBox[]> {
  return staffSlot(page)
    .locator(selector)
    .evaluateAll((nodes) => {
      const root = nodes[0]?.getRootNode();
      const host = root && "host" in root ? ((root as ShadowRoot).host as HTMLElement) : null;
      const base = host?.getBoundingClientRect();
      if (!base) return [];
      return nodes.map((node) => {
        const box = (node as SVGGraphicsElement).getBoundingClientRect();
        return {
          x: box.left - base.left,
          y: box.top - base.top,
          width: box.width,
          height: box.height,
        };
      });
    });
}

/** The bar lines and staff systems abcjs drew, in the drawing host's coordinates. */
const staffBars = (page: Page) => drawnBoxes(page, "svg .abcjs-bar");
const staffSystems = (page: Page) => drawnBoxes(page, "svg .abcjs-staff");
const staffNotes = (page: Page) => drawnBoxes(page, "svg .abcjs-note");

/** One drawn element with the voice, system and measure marks abcjs puts on it. */
interface StaffMark extends DrawnBox {
  kind: "bar" | "note" | "rest" | "staff";
  voice: number;
  line: number;
  /** The score's measure, from `abcjs-mm<n>`; null on a staff group, which has no measure of its own. */
  measure: number | null;
}

/** Every marked element abcjs drew, with the marks it uses for its voice, line and measure. */
function staffMarks(page: Page): Promise<StaffMark[]> {
  return staffSlot(page)
    .locator("svg :is(.abcjs-note, .abcjs-rest, .abcjs-bar, .abcjs-staff)")
    .evaluateAll((nodes) => {
      const root = nodes[0]?.getRootNode();
      const host = root && "host" in root ? ((root as ShadowRoot).host as HTMLElement) : null;
      const base = host?.getBoundingClientRect();
      if (!base) return [];
      return nodes.flatMap((node) => {
        const classes = node.getAttribute("class") ?? "";
        const voice = /abcjs-v(\d+)/.exec(classes)?.[1];
        const line = /abcjs-l(\d+)/.exec(classes)?.[1];
        if (voice === undefined || line === undefined) return [];
        const measure = /abcjs-mm(\d+)/.exec(classes)?.[1];
        const box = (node as SVGGraphicsElement).getBoundingClientRect();
        const kind = classes.includes("abcjs-staff")
          ? "staff"
          : classes.includes("abcjs-bar")
            ? "bar"
            : classes.includes("abcjs-rest")
              ? "rest"
              : "note";
        return [
          {
            kind,
            voice: Number(voice),
            line: Number(line),
            measure: measure === undefined ? null : Number(measure),
            x: box.left - base.left,
            y: box.top - base.top,
            width: box.width,
            height: box.height,
          } as StaffMark,
        ];
      });
    });
}

/** One score bar as the drawing lays it out: its start and end x, and its system's staff span. */
interface BarSpan {
  /** The score's measure, from the closing bar line's `abcjs-mm<n>`. */
  measure: number;
  line: number;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

/**
 * Every drawn measure, in score order, for `voice`. After the `Z` expansion a drawn measure is one score bar. A bar
 * starts where any voice's first onset is drawn, or at the opening line when abcjs drew one, and ends at its closing
 * bar line. Each span carries its score measure, so a case can find bar n whatever line the drawing puts it on.
 */
function barSpans(marks: StaffMark[], voice = 0): BarSpan[] {
  const lines = [...new Set(marks.map((mark) => mark.line))].sort((a, b) => a - b);
  const spans: BarSpan[] = [];
  for (const line of lines) {
    const bars = marks
      .filter((mark) => mark.kind === "bar" && mark.voice === voice && mark.line === line)
      .sort((a, b) => a.x - b.x);
    if (bars.length === 0) continue;
    // A system's first bar starts where any voice's first onset is drawn; later bars start at the line before them.
    const notes = marks
      .filter((mark) => (mark.kind === "note" || mark.kind === "rest") && mark.line === line)
      .sort((a, b) => a.x - b.x);
    const staves = marks.filter((mark) => mark.kind === "staff" && mark.line === line);
    const top = staves.length > 0 ? Math.min(...staves.map((mark) => mark.y)) : (bars[0] as StaffMark).y;
    const bottom =
      staves.length > 0 ? Math.max(...staves.map((mark) => mark.y + mark.height)) : (bars[0] as StaffMark).y;
    const opening = notes[0] !== undefined && (bars[0] as StaffMark).x < notes[0].x - 1;
    const closers = opening ? bars.slice(1) : bars;
    for (let index = 0; index < closers.length; index += 1) {
      const closer = closers[index] as StaffMark;
      if (closer.measure === null) throw new Error(`the bar line on line ${line} has no measure mark`);
      const x1 = closer.x;
      const x0 =
        index === 0 ? (opening ? (bars[0] as StaffMark).x : (notes[0]?.x ?? x1)) : (closers[index - 1] as StaffMark).x;
      spans.push({ measure: closer.measure, line, x0, x1, top, bottom });
    }
  }
  return spans;
}

/** The span of the score's bar `measure` (0-based), or a failure naming the bar when the drawing has none. */
function spanForBar(spans: BarSpan[], measure: number): BarSpan {
  const span = spans.find((candidate) => candidate.measure === measure);
  if (!span) throw new Error(`bar ${measure + 1} is not drawn`);
  return span;
}

/** The cursor's box in the drawing host's coordinates. */
async function staffCursorBox(page: Page) {
  const found = await box(staffCursor(page));
  const drawingAt = await box(drawing(page));
  return {
    x: found.x - drawingAt.x,
    y: found.y - drawingAt.y,
    width: found.width,
    height: found.height,
  };
}

/** Where the cursor stands, in pixels in the drawing: the same coordinates as the SVG boxes beside it. */
async function staffCursorX(page: Page) {
  const found = await staffCursorBox(page);
  return found.x + found.width / 2;
}

/** The staff system the cursor is on: the one whose vertical middle is nearest the cursor's. */
function systemAt(systems: DrawnBox[], y: number): DrawnBox {
  const first = systems[0];
  if (!first) throw new Error("the staff drew no system");
  return systems.reduce((best, system) =>
    Math.abs(system.y + system.height / 2 - y) < Math.abs(best.y + best.height / 2 - y) ? system : best,
  );
}

/** What the drawing shows around the cursor: its system, the bar lines and notes on that system, and all notes. */
async function staffPlace(page: Page) {
  const cursor = await staffCursorBox(page);
  const system = systemAt(await staffSystems(page), cursor.y + cursor.height / 2);
  const allBars = await staffBars(page);
  const allNotes = await staffNotes(page);
  const bars = allBars
    .filter((bar) => bar.y >= system.y - 2 && bar.y <= system.y + system.height + 2)
    .sort((a, b) => a.x - b.x);
  const notes = allNotes
    .filter((note) => note.y + note.height >= system.y - 30 && note.y <= system.y + system.height + 30)
    .sort((a, b) => a.x - b.x);
  return { cursor, system, bars, notes, allNotes };
}

/** Drives the staff part's play position as a host player does. */
const setStaffPosition = (page: Page, seconds: number | null) =>
  page.evaluate((value) => window.harness.layout.setPlayPosition(value), seconds);

/** Gives the staff slot a fixed height, as a host with a band of its own does, and waits for the part to see it. */
async function fixStaffHeight(page: Page, height = 300): Promise<void> {
  await staffSlot(page).evaluate((el, pixels) => {
    (el as HTMLElement).style.height = `${pixels}px`;
  }, height);
  await framesPass(page);
}

const staffScrollTop = (page: Page) => staffRegion(page).evaluate((el) => el.scrollTop);

/** The cursor's box is inside the region's visible box, not only in the DOM. */
async function expectCursorInRegion(page: Page): Promise<void> {
  const cursor = await box(staffCursor(page));
  const region = await box(staffRegion(page));
  expect(cursor.y, "the cursor is below the region's top").toBeGreaterThanOrEqual(region.y - 1);
  expect(cursor.y + cursor.height, "and above its bottom").toBeLessThanOrEqual(region.y + region.height + 1);
  expect(cursor.x, "and inside its left edge").toBeGreaterThanOrEqual(region.x - 1);
  expect(cursor.x + cursor.width, "and its right edge").toBeLessThanOrEqual(region.x + region.width + 1);
}

const ABCJS_URL = "**/e2e/page/vendor/abcjs.js";
/** Two frames: whatever a change started in the page, such as a request for abcjs, has been started by then. */
const framesPass = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
/** Bars that fit a phone's width, so the drawing can follow the width of its box; a bar of sixteenths needs more than that. */
const AIRY = vocalOnly("C4D4E4F4|G4A4B4c4|C8D8|E16|", "C4D4E4F4|G4A4B4c4|");

/** The colour and font abcjs's first note and first text are drawn with, as the browser computed them. */
function drawnStyle(page: Page, part: Locator = staffPart(page)) {
  return part
    .locator("svg")
    .first()
    .evaluate((svg) => {
      const path = svg.querySelector("path");
      const text = svg.querySelector("text");
      const box = svg.getBoundingClientRect();
      return {
        fill: path ? getComputedStyle(path).fill : null,
        stroke: path ? getComputedStyle(path).stroke : null,
        font: text ? getComputedStyle(text).fontFamily : null,
        width: box.width,
        height: box.height,
        owner: (svg.getRootNode() as ShadowRoot).host?.className ?? null,
      };
    });
}

/** The text colour the part computes for its own text: what the drawing has to follow. */
function partColour(page: Page, part: Locator = staffPart(page)) {
  return part.evaluate((el) => getComputedStyle(el).color);
}

test.describe("the staff view", () => {
  test("draws the score on a staff, a note for each note of the score, in a drawing of its own", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });

    await expect(drawnNotes(page)).toHaveCount(5);
    await expect(drawing(page)).toBeVisible();
    const drawn = await drawnStyle(page);
    expect(drawn.owner, "the drawing sits in a shadow root under the part").toBe("sce-staff-drawing");
    expect(drawn.width).toBeGreaterThan(200);
    expect(drawn.height).toBeGreaterThan(40);
    const region = await box(staffRegion(page));
    expect(drawn.width).toBeLessThanOrEqual(region.width);
  });

  test("follows the project: an edit, an undo, and a score replaced from outside", async ({ page, harness }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(5);

    await harness.layout.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await expect(drawnNotes(page)).toHaveCount(4);
    await expect(drawnRests(page)).toHaveCount(1);

    await harness.layout.undo();
    await expect(drawnNotes(page)).toHaveCount(5);
    await expect(drawnRests(page)).toHaveCount(0);

    await harness.layout.replace({ score: { text: vocalOnly("C8D8|") } });
    await expect(drawnNotes(page)).toHaveCount(2);
  });

  test("keeps showing the last score that read while the text view holds text that does not, and draws the fix", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff", "text"] });
    await expect(drawnNotes(page)).toHaveCount(5);
    await page.clock.install();

    await textBox(page).fill(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);
    await page.clock.runFor(PAUSE_MS + 200);
    await expect(drawnNotes(page)).toHaveCount(5);

    await textBox(page).fill(QUARTERS_WITHOUT_D);
    await expect(drawnNotes(page)).toHaveCount(4);
  });

  test("draws nothing for a score that cannot be read, and draws it once the text is fixed", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: BROKEN }, parts: ["staff", "text"] });

    await expect(staffRegion(page)).toBeVisible();
    await expect(staffSlot(page).locator("svg")).toHaveCount(0);

    await textBox(page).fill(QUARTERS);
    await expect(drawnNotes(page)).toHaveCount(5);
  });

  test("is drawn the same while the session is read-only, and a click or tap on the drawing changes nothing", async ({
    page,
    harness,
    press,
  }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page)).toHaveCount(5);

    await press(drawing(page), { x: 60, y: 40 });

    expect(await harness.layout.selection()).toEqual([]);
    expect(await harness.layout.insertionPoint()).toBeNull();
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(drawnNotes(page)).toHaveCount(5);
  });

  test("draws the play cursor as a 7 px band of text colour, and as a Highlight band under forced colours", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page)).toHaveCount(5);
    await setStaffPosition(page, 0);
    const read = () =>
      staffCursor(page).evaluate((el) => {
        const style = getComputedStyle(el);
        const after = getComputedStyle(el, "::after");
        return {
          width: style.width,
          marginLeft: style.marginLeft,
          backgroundImage: style.backgroundImage,
          backgroundColor: style.backgroundColor,
          borderLeftWidth: style.borderLeftWidth,
          borderLeftColor: style.borderLeftColor,
          borderRightWidth: style.borderRightWidth,
          afterContent: after.content,
          afterWidth: after.width,
          afterBackground: after.backgroundColor,
        };
      });

    const normal = await read();
    expect(normal.width, "a 7 px box: 2 px band, 1 px edge, 1 px ink, 1 px edge, 2 px band").toBe("7px");
    expect(normal.marginLeft, "the ink stays where the 3 px box put it").toBe("-3px");
    expect(normal.backgroundImage).toContain("linear-gradient");
    expect(normal.backgroundImage, "the band is a wash of the text colour").toContain("0.08");

    await page.emulateMedia({ forcedColors: "active" });
    const forced = await read();
    expect(forced.width).toBe("7px");
    expect(forced.marginLeft).toBe("-3px");
    expect(forced.borderLeftWidth, "the band is two 2 px borders, because forced colours drop the wash").toBe("2px");
    expect(forced.borderRightWidth).toBe("2px");
    expect(forced.afterContent, "a pseudo-element keeps the 1 px ink between Canvas edges").toBe('""');
    expect(forced.afterWidth).toBe("1px");
    expect(forced.borderLeftColor).not.toBe(forced.backgroundColor);
    expect(forced.afterBackground).not.toBe(forced.backgroundColor);
    expect(forced.afterBackground).not.toBe(forced.borderLeftColor);
  });

  test("reveals the system, so bar 1 from a later system gives scrollTop 0 and shows the tempo mark", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: REAL_SCORE }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page).first()).toBeVisible();
    await fixStaffHeight(page);
    const marks = await staffMarks(page);
    const spans = barSpans(marks, 0);
    const firstLine = Math.min(...spans.map((span) => span.line));
    const later = spans.find((span) => span.line > firstLine);
    expect(later, "the drawing puts some bar on a later system").toBeDefined();
    if (!later) return;

    await setStaffPosition(page, 0);
    expect(await staffScrollTop(page), "bar 1 at the top").toBe(0);
    const pageTop = await page.evaluate(() => window.scrollY);

    const laterSeconds = later.measure * ((4 * 60) / 190) + 0.02;
    await setStaffPosition(page, laterSeconds);
    await expect
      .poll(() => staffScrollTop(page), { message: `bar ${later.measure + 1}'s system is brought into view` })
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY), "the reveal scrolls the region, never the page").toBe(pageTop);
    const cursor = await box(staffCursor(page));
    const region = await box(staffRegion(page));
    // The cursor's top is the system's top staff line minus 2, so add it back to measure the system's top.
    expect(
      Math.abs(cursor.y + 2 - region.y - 16),
      "the system's top staff line sits 16 px below the region's top",
    ).toBeLessThan(1.5);
    await expectCursorInRegion(page);

    await setStaffPosition(page, 0);
    await expect.poll(() => staffScrollTop(page), { message: "back to bar 1, at the top" }).toBe(0);
    const tempo = await box(staffSlot(page).locator("svg .abcjs-tempo"));
    const back = await box(staffRegion(page));
    expect(tempo.y, "the tempo mark is in the region's visible box").toBeGreaterThanOrEqual(back.y - 1);
    expect(tempo.y + tempo.height).toBeLessThanOrEqual(back.y + back.height + 1);
    await expectCursorInRegion(page);

    await setStaffPosition(page, 0.5);
    await framesPass(page);
    expect(await staffScrollTop(page), "a position on the same visible system moves nothing").toBe(0);
    await expectCursorInRegion(page);
  });

  test("leaves the reader's scroll alone while the preview plays, and a backward seek reveals the cursor at once", async ({
    page,
    harness,
    press,
  }) => {
    await harness.layout.open({ score: { text: REAL_SCORE }, parts: ["staff", "synth"], editable: false });
    await expect(drawnNotes(page).first()).toBeVisible();
    await fixStaffHeight(page);
    await press(slot(page, "synth").getByRole("button"));
    await expect.poll(() => page.evaluate(() => window.harness.previewPlayer().tick ?? 0)).toBeGreaterThan(1024);
    const pageTop = await page.evaluate(() => window.scrollY);

    const reader = await staffRegion(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    expect(reader, "the reader has scrolled well away from the cursor").toBeGreaterThan(300);
    await framesPass(page);
    expect(await staffScrollTop(page), "the region stays where the reader put it").toBe(reader);
    await page.waitForTimeout(500);
    expect(await staffScrollTop(page), "the preview does not pull the region back to the cursor").toBe(reader);
    expect(await page.evaluate(() => window.scrollY), "the reveal never scrolls the page").toBe(pageTop);

    await page.evaluate(() => window.harness.previewPlayer().stop());
    await setStaffPosition(page, 0);
    await expect
      .poll(() => staffScrollTop(page), { message: "a backward seek brings the cursor back at once" })
      .toBe(0);
    expect(await page.evaluate(() => window.scrollY), "and still leaves the page alone").toBe(pageTop);
    await expectCursorInRegion(page);
  });

  test("moves the cursor with a transform inside a system and leaves its top and height alone", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page)).toHaveCount(5);
    const read = () =>
      staffCursor(page).evaluate((el) => ({
        left: el.style.left,
        top: el.style.top,
        height: el.style.height,
        transform: el.style.transform,
        computedLeft: getComputedStyle(el).left,
        computedTransform: getComputedStyle(el).transform,
      }));

    await setStaffPosition(page, 0);
    const start = await read();
    await setStaffPosition(page, 0.5);
    await framesPass(page);
    const moved = await read();
    expect(start.top, "the first position sets the system's top").not.toBe("");
    expect(moved.transform, "the x move is a transform").toContain("translate");
    expect(moved.computedTransform, "and reaches the rendered box").not.toBe("none");
    expect(moved.transform).not.toBe(start.transform);
    expect(moved.top, "the top is set only when the system changes").toBe(start.top);
    expect(moved.height, "and so is the height").toBe(start.height);
    expect(moved.left, "the box itself stays at the drawing's left edge").toBe("");
    expect(moved.computedLeft).toBe("0px");
  });

  test("puts the host's play position on the bar at that second, mid-bar and at the end, and takes it away for null", async ({
    page,
    harness,
  }) => {
    // QUARTERS is 4/4 at 100: a bar is 2.4 s, and its two bars have a bar line at the end of each. abcjs may also
    // draw the line the first bar starts at, so the first drawn line can be the opening one or the end of bar 1.
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page)).toHaveCount(5);

    await setStaffPosition(page, 0);
    await expect(staffCursor(page)).toBeVisible();
    const first = await staffPlace(page);
    const start = first.bars.length > 2 ? first.bars[0]?.x : first.notes[0]?.x;
    expect(Math.abs((await staffCursorX(page)) - (start ?? 0))).toBeLessThan(2);

    await setStaffPosition(page, 2.4);
    const second = await staffPlace(page);
    // A later system starts at its first bar, which has no line of its own; otherwise bar 2 starts at the line
    // that closes bar 1 (the first line when there is no opening line).
    const wrapped = second.notes.length < second.allNotes.length;
    const opening = second.bars.length > 2;
    const barTwo = wrapped ? second.notes[0]?.x : second.bars[opening ? 1 : 0]?.x;
    const end = wrapped ? second.bars[0]?.x : second.bars[opening ? 2 : 1]?.x;
    expect(Math.abs((await staffCursorX(page)) - (barTwo ?? 0))).toBeLessThan(2);

    // 3.6 s is half way through the second bar, which is where the cursor is drawn.
    await setStaffPosition(page, 3.6);
    const middle = ((barTwo ?? 0) + (end ?? 0)) / 2;
    expect(Math.abs((await staffCursorX(page)) - middle)).toBeLessThan(2);

    await setStaffPosition(page, 1000);
    expect(Math.abs((await staffCursorX(page)) - (end ?? 0))).toBeLessThan(2);

    await setStaffPosition(page, null);
    await expect(staffCursor(page)).toBeHidden();
  });

  test("follows a tempo change in the middle of the score: 0.5 s into the second bar is half way from its start to its second note", async ({
    page,
    harness,
  }) => {
    // The first bar at the score's 100 lasts 2.4 s; from bar 2 the tempo is 60, so the bar lasts 4 s. 2.9 s is half a beat into bar 2.
    await harness.layout.open({
      score: { text: vocalOnly("C4D4E4F4|G4A4B4c4|C16|") },
      parts: ["staff"],
      tempoChanges: [{ at: 1024, tempo: { unit: "1/4", bpm: 60 } }],
    });
    await expect(drawnNotes(page)).toHaveCount(9);
    await setStaffPosition(page, 2.9);

    const marks = await staffMarks(page);
    const spans = barSpans(marks, 0);
    const barTwo = spanForBar(spans, 1);
    const notes = marks
      .filter((mark) => mark.kind === "note" && mark.voice === 0 && mark.measure === 1)
      .sort((a, b) => a.x - b.x);
    expect(notes.length, "bar 2 has four quarter notes").toBe(4);
    // The bar's start is the anchor at its first tick; the next anchor is A, the first onset after it. Half a beat
    // is half way between the two in x.
    const expected = barTwo.x0 + ((notes[1] as StaffMark).x - barTwo.x0) / 2;
    expect(Math.abs((await staffCursorX(page)) - expected)).toBeLessThan(2);
  });

  test("shows the preview on the same cursor, from the start while it plays, and the host's position again when it stops", async ({
    page,
    harness,
    press,
  }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff", "synth"] });
    await expect(drawnNotes(page)).toHaveCount(5);
    await setStaffPosition(page, 2.4);
    const hostX = await staffCursorX(page);

    await press(slot(page, "synth").getByRole("button"));
    await expect.poll(() => page.evaluate(() => window.harness.previewPlayer().from)).toBe(0);
    const startX = await staffCursorX(page);
    await expect
      .poll(() => staffCursorX(page), { message: "the cursor follows the preview" })
      .toBeGreaterThan(startX + 10);

    await press(slot(page, "synth").getByRole("button"));
    await expect
      .poll(async () => Math.abs((await staffCursorX(page)) - hostX), { message: "the host's position is back" })
      .toBeLessThan(2);
  });

  test("starts the preview from the note a person presses on the staff", async ({ page, harness, press }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff", "synth"] });
    await expect(drawnNotes(page)).toHaveCount(5);

    // The fifth note is the whole note G at the start of bar 2, tick 1024 at 4/4. Press where the note is drawn,
    // not on a child of it: a staff line can be over the note head and is what the pointer lands on.
    const note = await box(drawnNotes(page).nth(4));
    const staff = await box(drawing(page));
    await press(drawing(page), {
      x: note.x + note.width / 2 - staff.x,
      y: note.y + note.height / 2 - staff.y,
    });

    await expect.poll(() => page.evaluate(() => window.harness.previewPlayer().from)).toBe(1024);
    await expect(staffCursor(page)).toBeVisible();
    await page.evaluate(() => window.harness.previewPlayer().stop());
  });

  test("draws every score bar in both voices, with the two voices' bar lines at the same x", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: REAL_SCORE }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page).first()).toBeVisible();
    const barCount = await page.evaluate(() => {
      const reading = window.harness.layout.live().reading;
      return reading.kind === "score" ? (reading.score?.bars.length ?? 0) : 0;
    });
    const marks = await staffMarks(page);
    const lines = [...new Set(marks.map((mark) => mark.line))].sort((a, b) => a - b);
    let vocalTotal = 0;
    let insTotal = 0;
    for (const line of lines) {
      const vocal = marks
        .filter((mark) => mark.kind === "bar" && mark.voice === 0 && mark.line === line)
        .sort((a, b) => a.x - b.x);
      const ins = marks
        .filter((mark) => mark.kind === "bar" && mark.voice === 1 && mark.line === line)
        .sort((a, b) => a.x - b.x);
      expect(vocal.length).toBeGreaterThan(0);
      expect(ins.length).toBe(vocal.length);
      for (let index = 0; index < vocal.length; index += 1)
        expect(Math.abs((vocal[index] as StaffMark).x - (ins[index] as StaffMark).x)).toBeLessThan(1);
      vocalTotal += vocal.length;
      insTotal += ins.length;
    }
    expect(vocalTotal).toBe(barCount);
    expect(insTotal).toBe(barCount);
    expect(await harness.layout.scoreText()).toBe(REAL_SCORE);
  });

  test("puts 33 s in bar 27, between its own Ins whole note and closing line, wherever the line breaks", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: REAL_SCORE }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page).first()).toBeVisible();
    const marks = await staffMarks(page);
    const barLine = marks
      .filter((mark) => mark.kind === "bar" && mark.voice === 0 && mark.measure === 26)
      .sort((a, b) => a.x - b.x)[0] as StaffMark | undefined;
    expect(barLine, "bar 27 closes at a drawn bar line").toBeDefined();
    if (!barLine) return;
    const line = barLine.line;
    const insNotes = marks
      .filter((mark) => mark.kind === "note" && mark.voice === 1 && mark.measure === 26)
      .sort((a, b) => a.x - b.x);
    const vocalRests = marks
      .filter((mark) => mark.kind === "rest" && mark.voice === 0 && mark.measure === 26)
      .sort((a, b) => a.x - b.x);
    expect(insNotes, "bar 27 has one Ins whole note").toHaveLength(1);
    expect(vocalRests, "and one Vocal whole rest").toHaveLength(1);
    expect((vocalRests[0] as StaffMark).x).toBeGreaterThan((insNotes[0] as StaffMark).x + 8);

    // Bar 27 starts after 26 bars; 33 s is an eighth of the way into it. The bar starts at its own onset when it
    // opens a system, and at the previous bar line when the line already holds bar 26.
    const lineBars = marks
      .filter((mark) => mark.kind === "bar" && mark.voice === 0 && mark.line === line)
      .sort((a, b) => a.x - b.x);
    const previous = lineBars.find((mark) => mark.measure === 25);
    const start = lineBars[0]?.measure === 26 ? (insNotes[0] as StaffMark).x : previous?.x;
    expect(start, "bar 27 starts at its onset or at bar 26's closing line").toBeDefined();
    if (start === undefined) return;
    const barSeconds = (4 * 60) / 190;
    const fraction = (33 - 26 * barSeconds) / barSeconds;
    const expected = start + fraction * (barLine.x - start);
    await setStaffPosition(page, 33);
    const cursor = await staffCursorBox(page);
    expect(Math.abs(cursor.x + cursor.width / 2 - expected), "33 s at bar 27's start anchor").toBeLessThan(2);
    expect(cursor.x + cursor.width / 2, "after bar 27's Ins note").toBeGreaterThan((insNotes[0] as StaffMark).x);
    expect(cursor.x + cursor.width / 2, "before its closing line").toBeLessThan(barLine.x);
    const staffTop = Math.min(
      ...marks.filter((mark) => mark.kind === "staff" && mark.line === line).map((mark) => mark.y),
    );
    expect(Math.abs(cursor.y - (staffTop - 2)), "on bar 27's system").toBeLessThan(2);
  });

  test("starts a real-score system at the leftmost onset, whichever bar opens it", async ({ page, harness }) => {
    await harness.layout.open({ score: { text: REAL_SCORE }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page).first()).toBeVisible();
    const marks = await staffMarks(page);
    const score = await page.evaluate(() => {
      const reading = window.harness.layout.live().reading;
      if (reading.kind !== "score" || !reading.score) throw new Error("the staff has no readable score");
      return {
        bars: reading.score.bars.map((bar) => ({ start: bar.start, length: bar.length })),
        notes: reading.score.notes.map((note) => ({
          voice: note.voice,
          bar: note.bar,
          start: note.start,
          duration: note.duration,
          midi: note.midi,
        })),
      };
    });
    const lines = [...new Set(marks.map((mark) => mark.line))].sort((a, b) => a - b);
    let found: { line: number; measure: number; start: number; length: number } | undefined;
    for (const line of lines) {
      const first = marks
        .filter((mark) => mark.kind === "bar" && mark.voice === 0 && mark.line === line)
        .sort((a, b) => a.x - b.x)[0];
      if (!first || first.measure === null) continue;
      const measure = first.measure;
      const bar = score.bars[measure];
      if (!bar) continue;
      const ins = score.notes.filter((note) => note.voice === "Ins" && note.bar === measure);
      const onset = ins.find((note) => note.start === bar.start && (note.midi !== null || note.duration < bar.length));
      if (!onset) continue;
      const vocalWholeRest = score.notes.some(
        (note) =>
          note.voice === "Vocal" &&
          note.bar === measure &&
          note.start === bar.start &&
          note.midi === null &&
          note.duration >= bar.length,
      );
      if (!vocalWholeRest) continue;
      found = { line, measure, start: bar.start, length: bar.length };
      break;
    }
    expect(
      found,
      "the real score draws a system whose first bar has a Vocal whole-bar rest and an Ins onset at its start",
    ).toBeDefined();
    if (!found) return;

    const barLine = marks
      .filter((mark) => mark.kind === "bar" && mark.voice === 0 && mark.measure === found.measure)
      .sort((a, b) => a.x - b.x)[0];
    const staffTop = Math.min(
      ...marks.filter((mark) => mark.kind === "staff" && mark.line === found.line).map((mark) => mark.y),
    );
    expect(barLine, `bar ${found.measure + 1} closes at a line`).toBeDefined();
    if (!barLine) return;

    // The anchors the drawing gives this bar: every drawn onset at its tick, and the closing line at the bar end.
    const xAt = new Map<number, number>();
    for (const [voiceIndex, voice] of ["Vocal", "Ins"].entries()) {
      const model = score.notes
        .filter((note) => note.voice === voice && note.bar === found.measure)
        .sort((a, b) => a.start - b.start);
      const drawn = marks
        .filter(
          (mark) =>
            (mark.kind === "note" || mark.kind === "rest") &&
            mark.voice === voiceIndex &&
            mark.measure === found.measure,
        )
        .sort((a, b) => a.x - b.x);
      expect(drawn.length, `bar ${found.measure + 1} draws every ${voice} event`).toBe(model.length);
      for (const [index, note] of model.entries()) {
        if (note.midi === null && note.duration >= found.length) continue;
        const mark = drawn[index] as StaffMark;
        const known = xAt.get(note.start);
        if (known === undefined || mark.x < known) xAt.set(note.start, mark.x);
      }
    }
    const startX = xAt.get(found.start);
    expect(startX, `bar ${found.measure + 1} has a drawn onset at its start`).toBeDefined();
    if (startX === undefined) return;
    xAt.set(found.start, startX);
    xAt.set(found.start + found.length, barLine.x);
    const anchors = [...xAt].map(([tick, x]) => ({ tick, x })).sort((a, b) => a.tick - b.tick);
    const fraction = 0.25;
    const tick = found.start + fraction * found.length;
    const before = [...anchors].reverse().find((anchor) => anchor.tick <= tick) as { tick: number; x: number };
    const after = anchors.find((anchor) => anchor.tick > tick) as { tick: number; x: number };
    const expected = before.x + ((tick - before.tick) / (after.tick - before.tick)) * (after.x - before.x);

    const barSeconds = (4 * 60) / 190;
    const seconds = (tick * barSeconds) / 1024;
    await setStaffPosition(page, seconds);
    const cursor = await staffCursorBox(page);
    expect(
      Math.abs(cursor.x + cursor.width / 2 - expected),
      `bar ${found.measure + 1}, on line ${found.line}: the system starts at the Ins onset`,
    ).toBeLessThan(2);
    expect(Math.abs(cursor.y - (staffTop - 2)), `bar ${found.measure + 1} is on its own system`).toBeLessThan(2);
  });

  test("starts bar 1 of a two-voice system where Ins's whole note is drawn while Vocal holds a whole-bar rest", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({
      score: { text: twoVoice(["z16|C16|D16|E16|"], ["C16|D16|E16|F16|"]) },
      parts: ["staff"],
      editable: false,
    });
    await expect(drawnNotes(page).first()).toBeVisible();
    const marks = await staffMarks(page);
    const insNotes = marks
      .filter((mark) => mark.kind === "note" && mark.voice === 1 && mark.measure === 0)
      .sort((a, b) => a.x - b.x);
    const vocalRest = marks
      .filter((mark) => mark.kind === "rest" && mark.voice === 0 && mark.measure === 0)
      .sort((a, b) => a.x - b.x)[0] as StaffMark;
    const barLine = marks
      .filter((mark) => mark.kind === "bar" && mark.voice === 1 && mark.measure === 0)
      .sort((a, b) => a.x - b.x)[0] as StaffMark;
    expect(insNotes, "bar 1 has one Ins whole note").toHaveLength(1);
    expect(vocalRest.x).toBeGreaterThan((insNotes[0] as StaffMark).x + 20);

    const barSeconds = 2.4;
    await setStaffPosition(page, 0);
    expect(
      Math.abs((await staffCursorX(page)) - (insNotes[0] as StaffMark).x),
      "bar 1, first system: its start is Ins's drawn note onset",
    ).toBeLessThan(2);

    const quarter = (insNotes[0] as StaffMark).x + ((barLine as StaffMark).x - (insNotes[0] as StaffMark).x) / 4;
    await setStaffPosition(page, barSeconds / 4);
    expect(Math.abs((await staffCursorX(page)) - quarter), "and a quarter of the way through the bar").toBeLessThan(2);
  });

  test("follows bar 1's drawn rest and two eighths in the real score: 0.5 s between them, and the first eighth's x at 0.95 s", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: REAL_SCORE }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page).first()).toBeVisible();
    const marks = await staffMarks(page);
    const rest = marks
      .filter((mark) => mark.kind === "rest" && mark.voice === 0 && mark.measure === 0)
      .sort((a, b) => a.x - b.x)[0] as StaffMark;
    const notes = marks
      .filter((mark) => mark.kind === "note" && mark.voice === 0 && mark.measure === 0)
      .sort((a, b) => a.x - b.x);
    const firstEighth = notes[0] as StaffMark;
    const secondEighth = notes[1] as StaffMark;
    // Bar 1 of the real score, first system: a dotted half rest (three beats) and two eighths.
    const barSeconds = (4 * 60) / 190;
    expect(firstEighth.x).toBeGreaterThan(rest.x + rest.width);
    expect(secondEighth.x).toBeGreaterThan(firstEighth.x);

    await setStaffPosition(page, 0.5);
    const between = await staffCursorBox(page);
    const intoBar = 0.5 / barSeconds;
    const expected = rest.x + (intoBar / 0.75) * (firstEighth.x - rest.x);
    expect(
      Math.abs(between.x + between.width / 2 - expected),
      "0.5 s, between the rest and the first eighth",
    ).toBeLessThan(2);
    expect(between.x + between.width / 2, "past the rest's drawn ink").toBeGreaterThan(rest.x + rest.width - 1);
    expect(between.x + between.width / 2, "before the first eighth's ink").toBeLessThan(firstEighth.x);

    await setStaffPosition(page, 0.75 * barSeconds);
    expect(
      Math.abs((await staffCursorX(page)) - firstEighth.x),
      "the first eighth's onset time puts the cursor on its x",
    ).toBeLessThan(2);
  });

  test("follows the start of the first twelve bars in Vocal, on the right system", async ({ page, harness }) => {
    await harness.layout.open({ score: { text: REAL_SCORE }, parts: ["staff"], editable: false });
    await expect(drawnNotes(page).first()).toBeVisible();
    const spans = barSpans(await staffMarks(page), 0);
    expect(spans.length).toBeGreaterThanOrEqual(12);
    const barSeconds = (4 * 60) / 190;

    for (let bar = 0; bar < 12; bar += 1) {
      await setStaffPosition(page, bar * barSeconds + 0.02);
      const cursor = await staffCursorBox(page);
      const span = spanForBar(spans, bar);
      const after = 0.02 / barSeconds;
      const expected = span.x0 + (span.x1 - span.x0) * after;
      expect(Math.abs(cursor.x + cursor.width / 2 - expected), `bar ${bar + 1} x`).toBeLessThan(2);
      expect(Math.abs(cursor.y - (span.top - 2)), `bar ${bar + 1} top`).toBeLessThan(2);
      expect(Math.abs(cursor.y + cursor.height - (span.bottom + 2)), `bar ${bar + 1} bottom`).toBeLessThan(2);
    }
  });

  for (const target of [0, 1] as const) {
    for (const count of [2, 3, 4] as const) {
      test(`expands a Z${count} run in ${target === 0 ? "Vocal" : "Ins"} into ${count} drawn bars and follows it`, async ({
        page,
        harness,
        press,
      }) => {
        const run =
          count === 2
            ? ["Z2|G16|A16|", "B16|c16|d16|e16|"]
            : count === 3
              ? ["Z3|G16|", "A16|B16|c16|d16|"]
              : ["Z4|", "G16|A16|B16|c16|"];
        const rests = ["z16|z16|z16|z16|", "z16|z16|z16|z16|"];
        const plain = run.map((line) => line.replace(`Z${count}|`, "z16|".repeat(count)));
        await harness.layout.open({
          score: { text: twoVoice(target === 0 ? run : rests, target === 1 ? run : rests) },
          parts: ["staff"],
          editable: false,
        });
        await expect(drawnNotes(page).first()).toBeVisible();
        const marks = await staffMarks(page);
        const runRests = marks
          .filter((mark) => mark.kind === "rest" && mark.voice === target)
          .sort((a, b) => a.x - b.x);
        expect(runRests).toHaveLength(count);
        await expect(
          staffSlot(page).locator("svg text.abcjs-rest"),
          "a full-bar rest has no count written over it",
        ).toHaveCount(0);

        const spans = barSpans(marks, 0);
        const insSpans = barSpans(marks, 1);
        expect(spans).toHaveLength(8);
        expect(insSpans).toHaveLength(8);
        // The bar lines of the two voices line up. A line's first bar starts at its first drawn mark, which
        // differs by voice (a note against a centred rest), so only bar lines are compared.
        for (const span of spans) {
          const ins = spanForBar(insSpans, span.measure);
          expect(Math.abs(span.x1 - ins.x1), `bar ${span.measure + 1} end`).toBeLessThan(1);
          const before = spans.find((candidate) => candidate.measure === span.measure - 1);
          if (before && before.line === span.line) {
            expect(Math.abs(span.x0 - ins.x0), `bar ${span.measure + 1} start`).toBeLessThan(1);
          }
        }

        const barSeconds = 2.4;
        const middle = Math.floor((count - 1) / 2);
        const runBar = spanForBar(spans, middle);
        // A run is drawn as whole-bar rests, which are not onsets: take its start from the cursor at the bar's tick.
        await setStaffPosition(page, middle * barSeconds);
        const runStart = await staffCursorX(page);
        for (const fraction of [0.25, 0.75]) {
          await setStaffPosition(page, (middle + fraction) * barSeconds);
          const cursor = await staffCursorBox(page);
          const expected = runStart + (runBar.x1 - runStart) * fraction;
          expect(Math.abs(cursor.x + cursor.width / 2 - expected), `inside the run at ${fraction}`).toBeLessThan(2);
        }

        const after = spanForBar(spans, count);
        await setStaffPosition(page, count * barSeconds);
        const afterStart = await staffCursorX(page);
        await setStaffPosition(page, count * barSeconds + 0.02);
        const cursor = await staffCursorBox(page);
        const afterFraction = 0.02 / barSeconds;
        const afterX = afterStart + (after.x1 - afterStart) * afterFraction;
        expect(Math.abs(cursor.x + cursor.width / 2 - afterX), "first bar after the run").toBeLessThan(2);

        // The drawn rest of the run starts the preview at that run bar, though a staff line may be over it.
        const rest = staffSlot(page).locator(`svg .abcjs-rest.abcjs-v${target}`).nth(middle);
        await rest.scrollIntoViewIfNeeded();
        const restBox = await box(rest);
        const staff = await box(drawing(page));
        await press(drawing(page), {
          x: restBox.x + restBox.width / 2 - staff.x,
          y: restBox.y + restBox.height / 2 - staff.y,
        });
        await expect.poll(() => page.evaluate(() => window.harness.previewPlayer().from)).toBe(middle * 1024);
        await page.evaluate(() => window.harness.previewPlayer().stop());

        // The same line written with ordinary whole-bar rests draws the same rests and bar positions.
        await harness.layout.close();
        await harness.layout.open({
          score: { text: twoVoice(target === 0 ? plain : rests, target === 1 ? plain : rests) },
          parts: ["staff"],
          editable: false,
        });
        await expect(drawnNotes(page).first()).toBeVisible();
        const plainMarks = await staffMarks(page);
        const plainRests = plainMarks
          .filter((mark) => mark.kind === "rest" && mark.voice === target)
          .sort((a, b) => a.x - b.x);
        expect(plainRests).toHaveLength(count);
        for (let index = 0; index < runRests.length; index += 1) {
          expect(Math.abs((runRests[index] as StaffMark).x - (plainRests[index] as StaffMark).x)).toBeLessThan(2);
          expect(Math.abs((runRests[index] as StaffMark).width - (plainRests[index] as StaffMark).width)).toBeLessThan(
            1,
          );
        }
        const plainSpans = barSpans(plainMarks, 0);
        expect(plainSpans).toHaveLength(8);
        for (const span of spans) {
          const plainSpan = spanForBar(plainSpans, span.measure);
          expect(Math.abs(span.x0 - plainSpan.x0), `bar ${span.measure + 1} start`).toBeLessThan(2);
          expect(Math.abs(span.x1 - plainSpan.x1), `bar ${span.measure + 1} end`).toBeLessThan(2);
        }
      });
    }
  }

  test("scrolls with the keyboard when the drawing is wider than its box: the region takes the focus and the arrow moves it", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "a keyboard, checked on the desktop project");
    await page.setViewportSize({ width: 260, height: 800 });
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(5);
    const [needed, shown] = await staffRegion(page).evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(needed, "the drawing is wider than its box").toBeGreaterThan(shown);

    await staffRegion(page).focus();
    await expect(staffRegion(page)).toBeFocused();
    await page.keyboard.press("ArrowRight");

    await expect.poll(() => staffRegion(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });

  test("draws again at the width it has when its box changes", async ({ page, harness, isMobile }) => {
    test.skip(isMobile, "the width is set once, on the desktop project");
    await harness.layout.open({ score: { text: AIRY }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(19);
    const wide = (await drawnStyle(page)).width;

    await page.setViewportSize({ width: 360, height: 800 });

    await expect.poll(async () => (await drawnStyle(page)).width).toBeLessThan(wide);
    const region = await box(staffRegion(page));
    expect((await drawnStyle(page)).width).toBeLessThanOrEqual(region.width);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(async () => (await drawnStyle(page)).width).toBeGreaterThan(400);
  });

  test("a box narrower than the narrowest staff scrolls inside the view and not the page", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "the width is set once, on the desktop project");
    await page.setViewportSize({ width: 240, height: 800 });
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(5);

    const [needed, shown] = await staffRegion(page).evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(needed, "the drawing is wider than its box").toBeGreaterThan(shown);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("fits a phone's width", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "the phone project");
    await harness.layout.open({ score: { text: AIRY }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(19);
    const region = await box(staffRegion(page));
    expect((await drawnStyle(page)).width).toBeLessThanOrEqual(region.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("says in the session's language what it is, and follows it when it changes", async ({ page, harness }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"], language: "zh" });

    await expect(staffSlot(page).getByRole("region", { name: "五线谱" })).toBeVisible();
    await expect(staffSlot(page).getByRole("img", { name: "用五线谱画出的乐谱" })).toBeVisible();

    await harness.layout.setView({ language: "en" });
    await expect(drawing(page)).toBeVisible();
    await expect(staffRegion(page)).toBeVisible();
  });

  test("says it is loading until abcjs arrives, then draws", async ({ page, harness }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(ABCJS_URL, async (route) => {
      await gate;
      await route.continue();
    });

    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await expect(staffSlot(page).getByRole("status")).toHaveText("Loading the staff…");
    await expect(staffSlot(page).locator("svg")).toHaveCount(0);

    release();
    await expect(drawnNotes(page)).toHaveCount(5);
    await expect(staffSlot(page).getByRole("status")).toHaveCount(0);
  });

  test("says so when abcjs cannot be loaded, and the other views work on", async ({ page, harness }) => {
    await page.route(ABCJS_URL, (route) => route.abort());

    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff", "text", "vocal"] });

    await expect(staffSlot(page).getByRole("alert")).toHaveText(
      "The staff couldn't be drawn. The other views still work.",
    );
    await expect(vocalNote(page, D4)).toBeVisible();
    await textBox(page).fill(QUARTERS_WITHOUT_D);
    await expect(vocalNote(page, D4)).toHaveCount(0);
  });

  test("does not draw into itself after it was destroyed while abcjs was still on its way", async ({
    page,
    harness,
  }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(ABCJS_URL, async (route) => {
      await gate;
      await route.continue();
    });
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await harness.layout.retain("staff");

    await harness.layout.destroyPart("staff");
    release();
    // The same module again: it settles when abcjs has been evaluated, which is after the destroyed part's own wait on it.
    await page.evaluate(() => import("abcjs" as string));

    const drawnAfter = await page.evaluate(() => {
      const holder = window.harness.layout.retained?.nodes.find((node) => (node as Element).shadowRoot) as
        | Element
        | undefined;
      return holder?.shadowRoot?.querySelectorAll("svg").length ?? -1;
    });
    expect(drawnAfter).toBe(0);
  });

  test("asks for abcjs only when a staff view is mounted, and once for all of them", async ({ page, harness }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/vendor/abcjs.js")) requests.push(request.url());
    });

    await harness.layout.open({ score: { text: QUARTERS }, parts: ["text", "vocal"] });
    await harness.layout.setActiveView("staff");
    await framesPass(page);
    expect(requests, "nothing asked for abcjs while no staff view was mounted").toHaveLength(0);

    await harness.layout.mountPart("staff");
    await expect(drawnNotes(page)).toHaveCount(5);
    expect(requests).toHaveLength(1);

    await harness.layout.close();
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(5);
    expect(requests, "the second staff view reuses the module").toHaveLength(1);
  });
});

test.describe("style isolation of the staff view", () => {
  test.skip(({ isMobile }) => isMobile, "styling is checked once, on the desktop project");
  const HOSTILE_SVG = "hostile-svg";

  test("takes the part's text colour in the light and the dark scheme", async ({ page, harness }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(5);
    const light = await partColour(page);
    expect((await drawnStyle(page)).fill).toBe(light);

    await harness.setColorScheme("dark");
    await expect.poll(() => partColour(page)).not.toBe(light);
    expect((await drawnStyle(page)).fill).toBe(await partColour(page));
  });

  test("takes the colour a host maps for the part's text", async ({ page, harness }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await harness.layout.setTheme({ "--sce-color-text": "rgb(10, 120, 200)" });

    await expect(drawnNotes(page)).toHaveCount(5);
    expect((await drawnStyle(page)).fill).toBe("rgb(10, 120, 200)");
  });

  test("is out of reach of a page's rules for svg, even !important ones, with and without a shadow root of the host", async ({
    page,
    harness,
  }) => {
    await harness.addHostRules(HOSTILE_SVG);
    for (const shadow of [false, true]) {
      await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"], shadow });
      if (shadow) await harness.addHostRules(HOSTILE_SVG, true);
      await expect(drawnNotes(page)).toHaveCount(5);

      const drawn = await drawnStyle(page);
      expect(drawn.fill, `fill, shadow ${shadow}`).toBe(await partColour(page));
      expect(drawn.font, `font, shadow ${shadow}`).not.toContain("cursive");
      expect(drawn.width, `width, shadow ${shadow}`).toBeGreaterThan(200);
      await harness.layout.close();
    }
  });

  test("is out of reach of those rules in the default editor too, with the page's rules and with the rules of a host's shadow root", async ({
    page,
    harness,
  }) => {
    await harness.addHostRules(HOSTILE_SVG);
    // The control: the same rules do reach an svg that stands in the page with nothing between it and them.
    const bare = await page.evaluate(() => {
      document.body.insertAdjacentHTML("beforeend", '<svg id="bare"><path d="M0 0L9 9"/></svg>');
      const fill = getComputedStyle(document.querySelector("#bare path") as Element).fill;
      document.getElementById("bare")?.remove();
      return fill;
    });
    expect(bare, "the hostile rules have teeth").toBe("rgb(255, 0, 0)");

    for (const shadow of [false, true]) {
      await harness.mount({ score: { text: QUARTERS }, shadow });
      if (shadow) await harness.addHostRules(HOSTILE_SVG, true);
      await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Staff", exact: true }).click();
      const part = page.locator(".sce-part-staff");
      await expect(part.locator("svg .abcjs-note")).toHaveCount(5);

      const drawn = await drawnStyle(page, part);
      expect(drawn.fill, `fill, shadow ${shadow}`).toBe(await partColour(page, part));
      expect(drawn.font, `font, shadow ${shadow}`).not.toContain("cursive");
      expect(drawn.width, `width, shadow ${shadow}`).toBeGreaterThan(200);
      await harness.destroy();
    }
  });

  test("is drawn under a strict style policy, which refused the style abcjs wrote and left the drawing as it is", async ({
    page,
    harness,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { refused: string[] }).refused = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        (window as unknown as { refused: string[] }).refused.push(event.effectiveDirective),
      );
    });
    await page.route("**/", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), "content-security-policy": "style-src 'self'" },
      });
    });
    await page.goto("/");

    const refusedSoFar = () => page.evaluate(() => (window as unknown as { refused: string[] }).refused);

    await harness.layout.open({ score: { text: QUARTERS }, parts: ["vocal"] });
    await expect(vocalNote(page, D4)).toBeVisible();
    expect(await refusedSoFar(), "the parts other than the staff write nothing the policy refuses").toEqual([]);

    await harness.layout.mountPart("staff");

    await expect(drawnNotes(page)).toHaveCount(5);
    const drawn = await drawnStyle(page);
    expect(drawn.fill).toBe(await partColour(page));
    expect(drawn.width).toBeGreaterThan(200);
    const refused = await refusedSoFar();
    expect(refused.length, "the policy refused a style element abcjs added").toBeGreaterThan(0);
    expect(new Set(refused)).toEqual(new Set(["style-src-elem"]));
  });

  test("waits in a box that is not shown, draws without a fault once it is, and keeps its drawing while it is hidden again", async ({
    page,
    harness,
  }) => {
    const faults: string[] = [];
    page.on("pageerror", (error) => faults.push(error.message));
    const arrived = page.waitForResponse(ABCJS_URL);
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["vocal"] });
    await harness.layout.mountHiddenPart("staff");
    await arrived;
    await expect(drawnNotes(page)).toHaveCount(0);

    await harness.layout.setSlotHidden("staff", false);
    await expect(drawnNotes(page)).toHaveCount(5);

    await harness.layout.setSlotHidden("staff", true);
    await harness.layout.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await expect(vocalNote(page, D4)).toHaveCount(0);
    await expect(drawnNotes(page)).toHaveCount(5);

    await harness.layout.setSlotHidden("staff", false);
    await expect(drawnNotes(page)).toHaveCount(4);
    expect(faults).toEqual([]);
  });

  test("puts no svg and no style element into the page itself, and leaves the page as it was once the layout is closed", async ({
    page,
    harness,
  }) => {
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(5);

    expect(await page.evaluate(() => document.body.querySelectorAll("svg").length), "svg in the page").toBe(0);
    expect(await page.evaluate(() => document.head.querySelectorAll("style").length), "style in the head").toBe(0);

    await harness.layout.close();
    expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(html);
  });
});

test.describe("the three views of the default editor", () => {
  const views = (page: Page) => page.getByRole("group", { name: "View" });
  const viewTab = (page: Page, name: string) => views(page).getByRole("button", { name, exact: true });
  const arrangement = (page: Page) => page.getByRole("region", { name: "Arrangement" });
  const staffView = (page: Page) => page.getByRole("region", { name: "Staff" });
  const editorText = (page: Page) => page.getByRole("textbox", { name: "Score text" });
  const editorProblems = (page: Page) => page.getByRole("list", { name: "Problems" });
  const editorStatus = (page: Page) => page.locator(".sce-text-status");
  const staleNote = (page: Page) => page.getByRole("note").filter({ hasText: "The score text has a problem" });
  const title = (page: Page) => page.locator(".sce-title");
  const staffNotes = (page: Page) => page.locator("svg .abcjs-note");
  const staffRests = (page: Page) => page.locator("svg .abcjs-rest");
  const note = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });
  const undoButton = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });

  test("starts on the arrangement and switches to the staff, the text and back, one view shown at a time", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await expect(arrangement(page)).toBeVisible();
    await expect(title(page)).toHaveText("Arrangement");
    await expect(viewTab(page, "Arrangement")).toHaveAttribute("aria-pressed", "true");
    await expect(staffView(page)).toHaveCount(0);
    await expect(editorText(page)).toHaveCount(0);

    await press(viewTab(page, "Staff"));
    await expect(staffView(page)).toBeVisible();
    await expect(staffNotes(page)).toHaveCount(5);
    await expect(title(page)).toHaveText("Staff");
    await expect(arrangement(page)).toHaveCount(0);
    await expect(editorText(page)).toHaveCount(0);
    await expect(viewTab(page, "Staff")).toHaveAttribute("aria-pressed", "true");
    await expect(viewTab(page, "Arrangement")).toHaveAttribute("aria-pressed", "false");

    await press(viewTab(page, "Score text"));
    await expect(editorText(page)).toHaveValue(QUARTERS);
    await expect(title(page)).toHaveText("Score text");
    await expect(staffView(page)).toHaveCount(0);
    await expect(arrangement(page)).toHaveCount(0);

    await press(viewTab(page, "Arrangement"));
    await expect(arrangement(page)).toBeVisible();
    await expect(note(page, D4)).toBeVisible();
    await expect(title(page)).toHaveText("Arrangement");
    await expect(editorText(page)).toHaveCount(0);
    await expect(staffView(page)).toHaveCount(0);
  });

  test("shows the zoom control, the delete button and the Select menu only on the arrangement, and keeps undo and redo everywhere", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    const zoom = page.getByRole("group", { name: "Zoom" });
    const remove = page.getByRole("button", { name: "Delete", exact: true });
    const select = page.getByRole("button", { name: "Select", exact: true });
    await expect(zoom).toBeVisible();
    await expect(remove).toBeVisible();
    await expect(select).toBeVisible();

    for (const name of ["Staff", "Score text"]) {
      await press(viewTab(page, name));
      await expect(zoom, name).toBeHidden();
      await expect(remove, name).toBeHidden();
      await expect(select, name).toBeHidden();
      await expect(undoButton(page), name).toBeVisible();
    }
    await press(viewTab(page, "Arrangement"));
    await expect(zoom).toBeVisible();
    await expect(remove).toBeVisible();
    await expect(select).toBeVisible();
  });

  test("asks for abcjs when the staff is first shown, and not before", async ({ page, harness, press }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/vendor/abcjs.js")) requests.push(request.url());
    });

    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));
    await press(viewTab(page, "Arrangement"));
    await framesPass(page);
    expect(requests, "no staff view was asked for").toHaveLength(0);

    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(5);
    await press(viewTab(page, "Arrangement"));
    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(5);
    expect(requests).toHaveLength(1);
  });

  test("mounts the text view when it is first shown, and keeps it, with what it holds, once it is mounted", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await expect(page.locator(".sce-part-text"), "no text view before it is shown").toHaveCount(0);
    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(5);
    await expect(page.locator(".sce-part-text"), "the staff does not bring it").toHaveCount(0);

    await press(viewTab(page, "Score text"));
    await expect(page.locator(".sce-part-text")).toHaveCount(1);
    await expect(editorText(page)).toHaveValue(QUARTERS);
    await editorText(page).fill(BROKEN);
    await expect(editorProblems(page).getByRole("listitem")).toHaveCount(1);

    await press(viewTab(page, "Arrangement"));
    await press(viewTab(page, "Score text"));
    await expect(page.locator(".sce-part-text"), "mounted once").toHaveCount(1);
    await expect(editorText(page)).toHaveValue(BROKEN);
    await expect(editorProblems(page).getByRole("listitem")).toHaveCount(1);
  });

  test("leaves selecting and deleting to the arrangement: Delete pressed while the staff or the text is shown deletes nothing", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(isMobile, "a keyboard, checked on the desktop project");
    await harness.mount({ score: { text: QUARTERS } });
    await press(note(page, D4));
    await expect(note(page, `${D4}, selected`)).toBeVisible();

    for (const name of ["Staff", "Score text"]) {
      await press(viewTab(page, name));
      await page.keyboard.press("Delete");
      await press(viewTab(page, "Arrangement"));

      await expect(note(page, `${D4}, selected`), name).toBeVisible();
      await expect(undoButton(page), name).toHaveAttribute("aria-disabled", "true");
    }

    await page.keyboard.press("Delete");
    await expect(note(page, `${D4}, selected`), "the arrangement does delete").toHaveCount(0);
  });

  test("follows an edit made in the text: the arrangement and the staff show the new score, as one step to undo", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));

    await editorText(page).fill(QUARTERS_WITHOUT_D);
    await press(viewTab(page, "Arrangement"));

    await expect(note(page, D4)).toHaveCount(0);
    await expect(note(page, "C4, bar 1 beat 1, length 1 beat")).toBeVisible();
    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(4);
    await expect(staffRests(page)).toHaveCount(1);

    await press(undoButton(page));
    await expect(staffNotes(page)).toHaveCount(5);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");
    await press(viewTab(page, "Score text"));
    await expect(editorText(page)).toHaveValue(QUARTERS);
  });

  test("tells a text that does not read: the problem in the text view, the stale notice above the others, which keep the last score", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));

    await editorText(page).fill(BROKEN);

    await expect(editorProblems(page).getByRole("listitem")).toHaveText([
      `The duration “5” is not allowed. (bar 1, line ${MUSIC_LINE})`,
    ]);
    await expect(editorStatus(page)).toHaveText("1 problem. The other views still show the last readable score.");
    await expect(staleNote(page), "the text view says it itself").toHaveCount(0);

    await press(viewTab(page, "Arrangement"));
    await expect(staleNote(page)).toHaveText(STALE);
    await expect(note(page, D4)).toBeVisible();
    await press(viewTab(page, "Staff"));
    await expect(staleNote(page)).toHaveText(STALE);
    await expect(staffNotes(page)).toHaveCount(5);

    await press(viewTab(page, "Score text"));
    await expect(editorText(page)).toHaveValue(BROKEN);
    await expect(staleNote(page)).toHaveCount(0);

    await editorText(page).fill(QUARTERS_WITHOUT_D);
    await press(viewTab(page, "Staff"));
    await expect(staleNote(page)).toHaveCount(0);
    await expect(staffRests(page)).toHaveCount(1);
  });

  test("undoes a text edit from the toolbar right after typing it, and redoes it", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));

    await editorText(page).fill(QUARTERS_WITHOUT_D);
    await press(undoButton(page));

    await expect(editorText(page)).toHaveValue(QUARTERS);
    await press(page.getByRole("button", { name: "Redo", exact: true }));
    await expect(editorText(page)).toHaveValue(QUARTERS_WITHOUT_D);
  });

  test("leaves Ctrl plus Z in the box to the browser: it undoes the typing in the box and not the project", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(isMobile, "a keyboard, checked on the desktop project");
    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));
    await editorText(page).fill(QUARTERS_WITHOUT_D);
    await press(viewTab(page, "Arrangement"));
    await expect(note(page, D4)).toHaveCount(0);
    await press(viewTab(page, "Score text"));
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "false");

    await editorText(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("x");
    await expect(editorText(page)).toHaveValue(`${QUARTERS_WITHOUT_D}x`);
    await page.keyboard.press("Control+z");

    await expect(editorText(page)).toHaveValue(QUARTERS_WITHOUT_D);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "false");
    await press(viewTab(page, "Arrangement"));
    await expect(note(page, D4)).toHaveCount(0);
  });

  test("drops the text it could not take when an undo changes the score under it", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));
    await editorText(page).fill(QUARTERS_WITHOUT_D);
    await press(viewTab(page, "Staff"));
    await press(viewTab(page, "Score text"));
    await editorText(page).fill(BROKEN);
    await expect(editorProblems(page).getByRole("listitem")).toHaveCount(1);

    await press(undoButton(page));

    await expect(editorText(page)).toHaveValue(QUARTERS);
    await expect(editorProblems(page)).toHaveCount(0);
    await expect(editorStatus(page)).toHaveText("No problems");
  });

  test("lets a plus or a minus typed into the text be text, and not a zoom of the arrangement", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));

    await editorText(page).focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("-+=_");

    await expect(editorText(page)).toHaveValue(`${QUARTERS}-+=_`);
    await press(viewTab(page, "Arrangement"));
    await expect(page.getByRole("button", { name: /^Zoom \d+%$/ })).toHaveAccessibleName("Zoom 100%");
  });

  test("is read-only for the text and not for the switching: the text can be read, the staff drawn, the views changed", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS }, editable: false });
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();

    await press(viewTab(page, "Score text"));
    await expect(editorText(page)).toHaveAttribute("readonly", "");
    await expect(editorText(page)).toHaveValue(QUARTERS);
    await page.clock.install();
    await editorText(page).focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("V: Vocal");
    await page.clock.runFor(PAUSE_MS + 200);
    await expect(editorText(page)).toHaveValue(QUARTERS);

    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(5);
    await press(viewTab(page, "Arrangement"));
    await expect(note(page, D4)).toBeVisible();
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  });

  test("turns the text read-only and writable again as the host changes the permission", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));
    await expect(editorText(page)).not.toHaveAttribute("readonly", "");

    await harness.update({ editable: false });
    await expect(editorText(page)).toHaveAttribute("readonly", "");
    await expect(viewTab(page, "Staff")).toBeVisible();

    await harness.update({ editable: true });
    await expect(editorText(page)).not.toHaveAttribute("readonly", "");
  });

  test("shows the new text when the host replaces the project while the text is shown, and drops what it could not take", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));
    await editorText(page).fill(BROKEN);
    await expect(staleNote(page)).toHaveCount(0);

    await harness.update({ score: { text: QUARTERS_WITHOUT_D } });

    await expect(editorText(page)).toHaveValue(QUARTERS_WITHOUT_D);
    await expect(editorProblems(page)).toHaveCount(0);
    await press(viewTab(page, "Arrangement"));
    await expect(staleNote(page)).toHaveCount(0);
  });

  test("for a project that came with a score that cannot be read: the problem view on the arrangement and the staff, the text view's own problems on the text", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: BROKEN } });
    await expect(page.getByRole("alert")).toBeVisible();

    await press(viewTab(page, "Score text"));
    await expect(editorText(page)).toHaveValue(BROKEN);
    await expect(editorProblems(page).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("alert"), "one place says it").toHaveCount(0);

    await press(viewTab(page, "Staff"));
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("svg .abcjs-note")).toHaveCount(0);

    await press(viewTab(page, "Score text"));
    await editorText(page).fill(QUARTERS);
    // The tap comes before the project has taken the text: the box loses the focus, the project takes the text, and the
    // toolbar gains its history and preview controls while the finger is on the switch. The switch has not moved.
    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(5);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("keeps the switch where it is when the project takes the text and the toolbar gains its history and preview controls", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: BROKEN } });
    await press(viewTab(page, "Score text"));
    await expect(undoButton(page)).toBeHidden();
    const before = await box(viewTab(page, "Staff"));

    await editorText(page).fill(QUARTERS);
    await editorText(page).blur();
    await expect(undoButton(page)).toBeVisible();

    expect(await box(viewTab(page, "Staff"))).toEqual(before);
  });

  /** Scrolls the arrangement in time with the wheel, as a person with a mouse does. */
  async function wheelInTime(page: Page) {
    const frame = await box(arrangement(page));
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.wheel(600, 0);
    await expect.poll(() => arrangement(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
  }

  test("keeps where the arrangement was scrolled to while another view is shown", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(isMobile, "the wheel is a mouse gesture, checked on the desktop project");
    await harness.mount({ score: { synthetic: { bars: 128, notes: 1500 } } });
    const scroller = arrangement(page);
    await wheelInTime(page);
    const before = await scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));

    await press(viewTab(page, "Score text"));
    await press(viewTab(page, "Arrangement"));

    const after = await arrangement(page).evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    expect(after).toEqual(before);
  });

  test("opens a project that the host replaces while another view is shown at its start when the arrangement is shown again", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(isMobile, "the wheel is a mouse gesture, checked on the desktop project");
    await harness.mount({ score: { synthetic: { bars: 128, notes: 1500 } } });
    await wheelInTime(page);
    await press(viewTab(page, "Staff"));

    await harness.update({ score: { synthetic: { bars: 96, notes: 900 } } });
    await press(viewTab(page, "Arrangement"));

    await expect.poll(() => arrangement(page).evaluate((el) => el.scrollLeft)).toBe(0);
  });

  test("names the views in the language the host sets, and changes it with the host", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS }, language: "zh" });
    const zh = page.getByRole("group", { name: "视图" });
    await expect(zh.getByRole("button", { name: "编曲视图", exact: true })).toHaveAttribute("aria-pressed", "true");

    await press(zh.getByRole("button", { name: "乐谱文本", exact: true }));
    await expect(page.getByRole("textbox", { name: "乐谱文本" })).toBeVisible();
    await expect(page.locator(".sce-title")).toHaveText("乐谱文本");

    await harness.update({ language: "en" });
    await expect(viewTab(page, "Score text")).toHaveAttribute("aria-pressed", "true");
    await expect(title(page)).toHaveText("Score text");
  });
});

test.describe("the view switch in a narrow host", () => {
  test.skip(({ isMobile }) => isMobile, "the width is set once, on the desktop project");

  for (const language of ["en", "zh"] as const) {
    test(`keeps the switch where it is, with 320 pixels, when the project takes a text typed into the box (${language})`, async ({
      page,
      harness,
      press,
    }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await harness.mount({ score: { text: BROKEN }, language });
      const tabs = page.getByRole("group", { name: VIEW_NAMES_BY_LANGUAGE[language].group });
      const [, staff, text] = VIEW_NAMES_BY_LANGUAGE[language].names;
      await press(tabs.getByRole("button", { name: text, exact: true }));
      const scoreBox = page.getByRole("textbox");
      const staffButton = tabs.getByRole("button", { name: staff, exact: true });
      const before = await box(staffButton);

      await scoreBox.fill(QUARTERS);
      await scoreBox.blur();
      await expect(page.locator(".sce-history")).toBeVisible();

      expect(await box(staffButton)).toEqual(before);
    });
  }

  for (const editable of [true, false]) {
    test(`keeps the switch inside the box, in reach, and the page from scrolling sideways when the editor has 320 pixels and ${editable ? "can edit" : "is read-only"}`, async ({
      page,
      harness,
      press,
    }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await harness.mount({ score: { text: QUARTERS }, editable });

      const tabs = page.getByRole("group", { name: "View" });
      const at = await box(tabs);
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.x + at.width).toBeLessThanOrEqual(320);
      if (!editable) {
        const badge = await box(page.getByText("Read only", { exact: true }));
        expect(badge.x + badge.width).toBeLessThanOrEqual(320);
      }
      await press(tabs.getByRole("button", { name: "Staff", exact: true }));
      await expect(page.getByRole("region", { name: "Staff" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

/** The names of the three views, in each language, as the view switch and the toolbar's title say them. */
const VIEW_NAMES_BY_LANGUAGE = {
  en: { group: "View", names: ["Arrangement", "Staff", "Score text"] },
  zh: { group: "视图", names: ["编曲视图", "五线谱", "乐谱文本"] },
} as const;

/** Whether the title is cut short (its text wider than its box), its text, its tooltip and the row it stands on. */
function titleState(page: Page) {
  return page.locator(".sce-title").evaluate((el) => {
    const text = document.createRange();
    text.selectNodeContents(el);
    return {
      cut: el.scrollWidth > el.clientWidth,
      textWidth: text.getBoundingClientRect().width,
      boxWidth: el.getBoundingClientRect().width,
      text: el.textContent,
      tooltip: el.getAttribute("title"),
      bottom: el.getBoundingClientRect().bottom,
    };
  });
}

test.describe("the title of a wrapped toolbar", () => {
  for (const language of ["en", "zh"] as const) {
    test(`is never narrower than its own text at a phone's width, in ${language}: a control moves to a later row first`, async ({
      page,
      harness,
      press,
      isMobile,
    }) => {
      // The phone project is a Pixel 7; the desktop project is made as narrow as the narrowest hosts.
      for (const width of isMobile ? [null] : [320, 412]) {
        if (width !== null) await page.setViewportSize({ width, height: 700 });
        await harness.mount({ score: { text: QUARTERS }, language });
        const { group, names } = VIEW_NAMES_BY_LANGUAGE[language];
        const tabs = page.getByRole("group", { name: group });
        for (const name of names) {
          await press(tabs.getByRole("button", { name, exact: true }));
          const state = await titleState(page);
          const where = `${language} ${width ?? "Pixel 7"}px, ${name}`;
          expect(state.text, where).toBe(name);
          expect(state.cut, `${where}: the title is not cut`).toBe(false);
          expect(state.boxWidth, `${where}: the title is as wide as its text`).toBeGreaterThanOrEqual(
            state.textWidth - 0.5,
          );
          expect(state.tooltip, `${where}: the tooltip holds the whole name`).toBe(name);
        }
        await harness.destroy();
      }
    });
  }

  test("is cut with an ellipsis only when it does not fit on a row of its own, and keeps its whole text and a tooltip", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "the width is set once, on the desktop project");
    for (const [language, width] of [
      ["en", 100],
      ["zh", 64],
    ] as const) {
      await page.setViewportSize({ width, height: 700 });
      await harness.mount({ score: { text: QUARTERS }, language });
      const name = VIEW_NAMES_BY_LANGUAGE[language].names[0];

      const state = await titleState(page);
      const zoom = await box(page.getByRole("group", { name: language === "en" ? "Zoom" : "缩放" }));

      expect(state.text, language).toBe(name);
      expect(state.cut, `${language}: the title is cut`).toBe(true);
      expect(state.tooltip, `${language}: the tooltip holds the whole name`).toBe(name);
      expect(await page.locator(".sce-title").evaluate((el) => getComputedStyle(el).textOverflow)).toBe("ellipsis");
      expect(zoom.y, `${language}: the controls are on a later row than the title`).toBeGreaterThanOrEqual(
        state.bottom - 0.5,
      );
      await harness.destroy();
    }
  });
});

// ABOUTME: Seam 5 for the staff view, the text view, the view switch and the stale notice: parts on one session, and the default editor.
// ABOUTME: Tests type, click and tap as a user does, and read what the session holds, in desktop and phone projects.
import type { CDPSession, Page } from "@playwright/test";
import { box, expect, type Harness, test, vocalOnly } from "./fixtures";

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

  test("leaves nothing behind when it is destroyed, twice over", async ({ page, harness }) => {
    await openText(harness, { parts: ["stale", "text", "vocal"] });

    await harness.layout.destroyPart("stale", 2);
    await textBox(page).fill(BROKEN);

    await expect(slot(page, "stale")).toBeEmpty();
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

  test("leaves nothing behind when it is destroyed, twice over", async ({ page, harness }) => {
    await harness.layout.open({ parts: ["switch"] });

    await harness.layout.destroyPart("switch", 2);
    await harness.layout.setActiveView("staff");

    await expect(slot(page, "switch")).toBeEmpty();
  });
});

/** Event listeners as the browser's debugger sees them: the way to find one that a destroy left behind. */
function listenerCounter(cdp: CDPSession) {
  const onObject = async (expression: string) => {
    const { result } = await cdp.send("Runtime.evaluate", { expression });
    if (!result.objectId) throw new Error(`no object for ${expression}`);
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
    return listeners.length;
  };
  return {
    onGlobals: () =>
      Promise.all(["window", "document", "document.documentElement", "document.body", "document.head"].map(onObject)),
    /** The listeners on every node the layout retained. */
    onRetained: async () => {
      const nodes = "window.harness.layout.retained.nodes";
      const { result: length } = await cdp.send("Runtime.evaluate", { expression: `${nodes}.length` });
      let total = 0;
      for (let index = 0; index < Number(length.value); index++) total += await onObject(`${nodes}[${index}]`);
      return total;
    },
  };
}

test.describe("destroying the view parts", () => {
  test("each one, destroyed on its own, leaves no node, no listener and no style sheet, and does not answer the session any more", async ({
    page,
    harness,
    partNames,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const listeners = listenerCounter(cdp);
    const globals = await listeners.onGlobals();
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const sheets = (await harness.layout.sheets()).document;

    for (const name of partNames.views) {
      await harness.layout.open({ score: { text: QUARTERS }, parts: [name] });
      expect((await harness.layout.sheets()).document, `${name} adds the one style sheet`).toBe(sheets + 1);
      await harness.layout.retain(name);
      // The notice only draws; the others have something to press, type in or scroll with.
      if (name !== "stale") expect(await listeners.onRetained(), `${name} has listeners`).toBeGreaterThan(0);

      await harness.layout.destroyPart(name, 2);
      expect(await listeners.onRetained(), `${name} leaves listeners`).toBe(0);
      await expect(slot(page, name).locator("*")).toHaveCount(0);
      const retained = await harness.layout.retainedHtml();

      // Everything that would redraw the part, and the part must not hear of it.
      await harness.layout.setView({ language: "zh", editable: false });
      await harness.layout.setActiveView("staff");
      await harness.layout.setRejectedText(BROKEN);
      await harness.layout.replace({ score: { vector: "reject-duration-five" } });
      expect(await harness.layout.retainedHtml(), name).toBe(retained);

      await harness.layout.close();
      expect((await harness.layout.sheets()).document, `${name} gives its style sheet back`).toBe(sheets);
    }
    expect(await listeners.onGlobals(), "listeners on the page").toEqual(globals);
    expect(await page.evaluate(() => document.documentElement.outerHTML), "nodes in the page").toBe(html);
    await cdp.detach();
  });
});

const toolbarWithViews = (page: Page) => slot(page, "toolbar-views");

test.describe("the toolbar part with the view switch", () => {
  test("ends the row with the switch, after the read-only badge, and keeps the switch while read-only", async ({
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

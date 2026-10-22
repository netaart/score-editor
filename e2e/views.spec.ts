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
    // abcjs puts two resize listeners on the window when its module is loaded, and has no way to take them off. They are
    // its, not the staff view's: the module is loaded once before the baseline is taken, so that what is measured is what
    // the parts leave behind.
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(5);
    await harness.layout.close();
    const cdp = await page.context().newCDPSession(page);
    const listeners = listenerCounter(cdp);
    const globals = await listeners.onGlobals();
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const sheets = (await harness.layout.sheets()).document;

    for (const name of partNames.views) {
      await harness.layout.open({ score: { text: QUARTERS }, parts: [name] });
      expect((await harness.layout.sheets()).document, `${name} adds the one style sheet`).toBe(sheets + 1);
      await harness.layout.retain(name);
      // The notice and the staff only draw (the staff watches its size with an observer, which is no event listener).
      if (!["stale", "staff"].includes(name))
        expect(await listeners.onRetained(), `${name} has listeners`).toBeGreaterThan(0);

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

const staffSlot = (page: Page) => slot(page, "staff");
const staffRegion = (page: Page) => staffSlot(page).getByRole("region", { name: "Staff" });
const drawing = (page: Page) => staffSlot(page).getByRole("img", { name: "The score drawn on a staff" });
/** What abcjs drew, by the classes it puts on its elements: they reach through the open shadow root the drawing sits in. */
const drawnNotes = (page: Page) => staffSlot(page).locator("svg .abcjs-note");
const drawnRests = (page: Page) => staffSlot(page).locator("svg .abcjs-rest");
const ABCJS_URL = "**/e2e/page/vendor/abcjs.js";
/** Bars that fit a phone's width, so the drawing can follow the width of its box; a bar of sixteenths needs more than that. */
const AIRY = vocalOnly("C4D4E4F4|G4A4B4c4|C8D8|E16|", "C4D4E4F4|G4A4B4c4|");

/** The colour and font abcjs's first note and first text are drawn with, as the browser computed them. */
function drawnStyle(page: Page) {
  return staffSlot(page)
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
function partColour(page: Page) {
  return staffSlot(page)
    .locator(".sce-part-staff")
    .evaluate((el) => getComputedStyle(el).color);
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

    await textBox(page).fill(BROKEN);
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);
    await page.waitForTimeout(PAUSE_MS + 200);
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

  test("scrolls with the keyboard when the drawing is wider than its box: the region can take the focus", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(5);

    await staffRegion(page).focus();

    await expect(staffRegion(page)).toBeFocused();
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

  test("fits a phone's width, and a bar too dense for it scrolls inside the view and not the page", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "the phone project");
    await harness.layout.open({ score: { text: AIRY }, parts: ["staff"] });
    await expect(drawnNotes(page)).toHaveCount(19);
    const region = await box(staffRegion(page));
    expect((await drawnStyle(page)).width).toBeLessThanOrEqual(region.width);
    await harness.layout.close();

    await harness.layout.open({ score: { sample: "compact-three-sections" }, parts: ["staff"] });
    await expect(drawnNotes(page).first()).toBeAttached();
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
    await page.waitForTimeout(500);

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
    await page.waitForTimeout(300);
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
      await expect(drawnNotes(page)).toHaveCount(5);

      const drawn = await drawnStyle(page);
      expect(drawn.fill, `fill, shadow ${shadow}`).toBe(await partColour(page));
      expect(drawn.font, `font, shadow ${shadow}`).not.toContain("cursive");
      expect(drawn.width, `width, shadow ${shadow}`).toBeGreaterThan(200);
      await harness.layout.close();
    }
  });

  test("is drawn under a strict style policy, where a style element that abcjs adds is blocked", async ({
    page,
    harness,
  }) => {
    await page.route("**/", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), "content-security-policy": "style-src 'self'" },
      });
    });
    await page.goto("/");

    await harness.layout.open({ score: { text: QUARTERS }, parts: ["staff"] });

    await expect(drawnNotes(page)).toHaveCount(5);
    const drawn = await drawnStyle(page);
    expect(drawn.fill).toBe(await partColour(page));
    expect(drawn.width).toBeGreaterThan(200);
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

  test("shows the zoom control and the delete button only on the arrangement, and keeps undo and redo everywhere", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    const zoom = page.getByRole("group", { name: "Zoom" });
    const remove = page.getByRole("button", { name: "Delete", exact: true });
    await expect(zoom).toBeVisible();
    await expect(remove).toBeVisible();

    for (const name of ["Staff", "Score text"]) {
      await press(viewTab(page, name));
      await expect(zoom, name).toBeHidden();
      await expect(remove, name).toBeHidden();
      await expect(undoButton(page), name).toBeVisible();
    }
    await press(viewTab(page, "Arrangement"));
    await expect(zoom).toBeVisible();
    await expect(remove).toBeVisible();
  });

  test("asks for abcjs when the staff is first shown, and not before", async ({ page, harness, press }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/vendor/abcjs.js")) requests.push(request.url());
    });

    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Score text"));
    await press(viewTab(page, "Arrangement"));
    await page.waitForTimeout(300);
    expect(requests, "no staff view was asked for").toHaveLength(0);

    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(5);
    await press(viewTab(page, "Arrangement"));
    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(5);
    expect(requests).toHaveLength(1);
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
    await editorText(page).focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("V: Vocal");
    await page.waitForTimeout(PAUSE_MS + 200);
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
    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(5);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("keeps where the arrangement was scrolled to while another view is shown", async ({ page, harness, press }) => {
    await harness.mount({ score: { synthetic: { bars: 128, notes: 1500 } } });
    const scroller = arrangement(page);
    await scroller.evaluate((el) => el.scrollTo(400, 60));
    const before = await scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    expect(before.left).toBeGreaterThan(300);

    await press(viewTab(page, "Score text"));
    await press(viewTab(page, "Arrangement"));

    const after = await arrangement(page).evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    expect(after).toEqual(before);
  });

  test("opens a project that the host replaces while another view is shown at its start when the arrangement is shown again", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { synthetic: { bars: 128, notes: 1500 } } });
    await arrangement(page).evaluate((el) => el.scrollTo(400, 60));
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

  test("leaves the page as it found it when it is destroyed after all three views were shown", async ({
    page,
    harness,
    press,
  }) => {
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const sheets = await page.evaluate(() => document.adoptedStyleSheets.length);
    await harness.mount({ score: { text: QUARTERS } });
    await press(viewTab(page, "Staff"));
    await expect(staffNotes(page)).toHaveCount(5);
    await press(viewTab(page, "Score text"));
    await editorText(page).fill(BROKEN);
    await press(viewTab(page, "Arrangement"));

    await harness.destroy();

    expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(html);
    expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(sheets);
  });
});

test.describe("the view switch in a narrow host", () => {
  test.skip(({ isMobile }) => isMobile, "the width is set once, on the desktop project");

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

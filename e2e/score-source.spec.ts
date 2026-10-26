// ABOUTME: Seam 5 for score sources: the save and save-as callbacks, the unsaved state, the conflict and the handoff gate.
// ABOUTME: Host callbacks are faked on the test page; every case runs on the desktop project and the phone project.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { box, expect, type Harness, test, vocalOnly } from "./fixtures";

const REAL_SCORE = readFileSync(
  fileURLToPath(new URL("../packages/score-editor/skills/score-editor/assets/edit-one-bar/score.abc", import.meta.url)),
  "utf8",
);

/** Four quarter notes, then a whole note. */
const QUARTERS = vocalOnly("C4D4E4F4|G16|");
/** The same score after the D of bar 1 becomes a rest, written by hand. */
const WITHOUT_D = QUARTERS.replace("C4D4E4F4|", "C4z4E4F4|");
/** Another writer's version: the F becomes a G and the whole note an A. */
const THEIR_SCORE = QUARTERS.replace("C4D4E4F4|G16|", "C4D4E4G4|A16|");

const D4 = "D4, bar 1 beat 2, length 1 beat";
const E4 = "E4, bar 1 beat 3, length 1 beat";

const noteNamed = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });
const saveButton = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
const saveAsButton = (page: Page) => page.getByRole("button", { name: "Save as score file", exact: true });
const unsavedPill = (page: Page) => page.getByText("Unsaved", { exact: true });
const conflictStrip = (page: Page) => page.getByRole("group", { name: "Score file conflict", exact: true });
const overwriteButton = (page: Page) => page.getByRole("button", { name: "Overwrite with my version", exact: true });
const loadTheirsButton = (page: Page) => page.getByRole("button", { name: "Load the other version", exact: true });
const restore = (page: Page) => page.getByRole("button", { name: "Restore original", exact: true });
const restoreQuestion = (page: Page) =>
  page.getByRole("dialog", { name: "Go back to the last saved version?", exact: true });

async function openFile(harness: Harness, options: Record<string, unknown> = {}): Promise<void> {
  await harness.mount({
    score: { text: QUARTERS },
    scoreFile: { name: "tune.abc" },
    ...options,
  });
}

async function deleteD(page: Page, press: (target: ReturnType<Page["locator"]>) => Promise<void>): Promise<void> {
  await press(noteNamed(page, D4));
  await page.keyboard.press("Delete");
  await expect(noteNamed(page, D4)).toHaveCount(0);
}

test.describe("saving a score file", () => {
  test("writes nothing before the save; then the score with the opened version, and asks no draft store", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openFile(harness, { drafts: true });
    await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true");
    expect(await harness.scoreCalls()).toEqual([]);
    expect(await harness.draftCalls()).toEqual([]);
    expect(await harness.hasUnsavedChanges()).toBe(false);

    await deleteD(page, press);
    if (isMobile) await expect(page.locator(".sce-save-dot")).toBeVisible();
    else await expect(unsavedPill(page)).toBeVisible();
    expect(await harness.hasUnsavedChanges()).toBe(true);
    expect(await harness.unsavedChanges()).toEqual([true]);
    expect(await harness.scoreCalls()).toEqual([]);
    expect(await harness.draftCalls()).toEqual([]);

    await press(saveButton(page));
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);
    expect((await harness.scoreCalls())[0]).toMatchObject({
      method: "save",
      text: WITHOUT_D,
      expected: "file-1",
      result: "save-1",
    });
    await expect(unsavedPill(page)).toBeHidden();
    expect(await harness.hasUnsavedChanges()).toBe(false);
    expect(await harness.unsavedChanges()).toEqual([true, false]);
    expect(await harness.draftCalls()).toEqual([]);
  });

  test("Ctrl/Cmd+S saves only inside the editor and keeps the browser's own save out", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(isMobile, "keys are checked on the desktop project");
    await openFile(harness);
    await deleteD(page, press);
    const sawKey = await harness.watchKey("s");

    await page.keyboard.press("Control+s");

    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);
    // The editor keeps the press from reaching the document's own handlers, so the host sees none of it.
    expect(await sawKey()).toEqual([]);
    await expect(unsavedPill(page)).toBeHidden();
  });

  test("shows Saving while the host is slow, then the saved state", async ({ page, harness, press }) => {
    await openFile(harness);
    await deleteD(page, press);
    await harness.holdScoreSave();

    await press(saveButton(page));
    await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeVisible();

    await harness.releaseScoreSave();
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);
    await expect(unsavedPill(page)).toBeHidden();
  });

  test("a failed save stays unsaved, tells the host, and Save tries again", async ({ page, harness, press }) => {
    await openFile(harness);
    await deleteD(page, press);
    await harness.failScoreNext("save");

    await press(saveButton(page));
    const failed = page.locator(".sce-save-button");
    await expect(failed).toHaveAttribute("aria-label", "Save failed");
    await expect(failed).toHaveText("Save failed");
    expect(await harness.hasUnsavedChanges()).toBe(true);
    expect(await harness.notices()).toEqual([
      {
        code: "score-save-failed",
        level: "error",
        message: "The score file was not saved. Your changes are still here; try Save again.",
      },
    ]);

    await press(failed);
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(2);
    await expect(unsavedPill(page)).toBeHidden();
    expect((await harness.scoreCalls()).map((call) => call.expected)).toEqual(["file-1", "file-1"]);
  });
});

test.describe("a score file another writer changed", () => {
  async function conflict(page: Page, harness: Harness, press: (target: ReturnType<Page["locator"]>) => Promise<void>) {
    await openFile(harness);
    await deleteD(page, press);
    await harness.externalScore(THEIR_SCORE);
    await press(saveButton(page));
    await expect(conflictStrip(page)).toBeVisible();
    await expect(
      page.getByText(
        "This score file was changed somewhere else after you opened it. Your changes are not saved until you choose.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(overwriteButton(page)).toBeVisible();
    await expect(loadTheirsButton(page)).toBeVisible();
  }

  test("offers both choices, and Overwrite reads their version and writes ours over it", async ({
    page,
    harness,
    press,
  }) => {
    await conflict(page, harness, press);

    await press(overwriteButton(page));
    await expect(conflictStrip(page)).toBeHidden();
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(3);
    expect((await harness.scoreCalls()).slice(1)).toEqual([
      { method: "read", result: "other-1" },
      { method: "save", text: WITHOUT_D, expected: "other-1", result: "save-2" },
    ]);
    await expect(unsavedPill(page)).toBeHidden();
    expect((await harness.scoreFile())?.file).toEqual({ text: WITHOUT_D, version: "save-2" });
  });

  test("Load the other version opens their text, makes it the saved version and writes nothing", async ({
    page,
    harness,
    press,
  }) => {
    await conflict(page, harness, press);
    const before = await harness.scoreCalls();

    await press(loadTheirsButton(page));

    await expect(page.getByRole("listitem", { name: /^A4,/ })).toBeVisible();
    await expect(conflictStrip(page)).toBeHidden();
    await expect(unsavedPill(page)).toBeHidden();
    expect(await harness.scoreCalls()).toEqual([...before, { method: "read", result: "other-1" }]);
    expect((await harness.scoreFile())?.file).toEqual({ text: THEIR_SCORE, version: "other-1" });
  });
});

test.describe("Restore original for a score file", () => {
  test("goes back to the last saved version, not the opened one, with no host write", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openFile(harness);
    await deleteD(page, press);
    await press(saveButton(page));
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);

    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await expect(noteNamed(page, E4)).toHaveCount(0);
    if (isMobile) await expect(page.locator(".sce-save-dot")).toBeVisible();
    else await expect(unsavedPill(page)).toBeVisible();

    await press(restore(page));
    await expect(restoreQuestion(page)).toBeVisible();
    await expect(restoreQuestion(page)).toContainText(
      "Every change since the last save is discarded. You can't undo this.",
    );
    await press(restoreQuestion(page).getByRole("button", { name: "Restore original", exact: true }));

    await expect(restoreQuestion(page)).toBeHidden();
    await expect(noteNamed(page, E4)).toBeVisible();
    await expect(noteNamed(page, D4)).toHaveCount(0);
    await expect(unsavedPill(page)).toBeHidden();
    expect(await harness.scoreCalls()).toHaveLength(1);
  });
});

test.describe("a generated score", () => {
  test("Save as hands the current text to the host, and leaves the drafts working", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS }, saveAs: true, drafts: true });
    await expect(saveButton(page)).toHaveCount(0);
    await expect(unsavedPill(page)).toBeHidden();

    await press(saveAsButton(page));
    expect(await harness.savedAs()).toEqual([QUARTERS]);

    await deleteD(page, press);
    await press(saveAsButton(page));
    expect(await harness.savedAs()).toEqual([QUARTERS, WITHOUT_D]);
    await expect(unsavedPill(page)).toBeHidden();
  });

  test("an existing mount without a source behaves as before: no Save and no Save as", async ({ page, harness }) => {
    await harness.mount({ score: { text: QUARTERS }, drafts: true });
    await expect(saveButton(page)).toHaveCount(0);
    await expect(saveAsButton(page)).toHaveCount(0);
    await expect(unsavedPill(page)).toBeHidden();
  });
});

test.describe("a real score as a score file", () => {
  test("saves only the changed bar, keeps the Ins Z4, and opens again clean", async ({ page, harness, press }) => {
    /** The first Vocal note of bar 1 turns into a rest; every other byte of the score is unchanged. */
    const saved = REAL_SCORE.replace("z12e2e2|", "z12z2e2|");
    await openFile(harness, { score: { text: REAL_SCORE }, scoreFile: { name: "score.abc" } });
    await press(
      page
        .getByRole("list", { name: "Vocal" })
        .getByRole("listitem", { name: "E5, bar 1 beat 4, length 0.5 beats", exact: true }),
    );
    await page.keyboard.press("Delete");
    await press(saveButton(page));
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);

    const [call] = await harness.scoreCalls();
    expect(call?.text).toBe(saved);
    expect(call?.text).toContain("V: Ins\nZ4|");

    await harness.destroy();
    await openFile(harness, { score: { text: saved }, scoreFile: { name: "score.abc" } });
    await expect(unsavedPill(page)).toBeHidden();
    expect(await harness.hasUnsavedChanges()).toBe(false);
    await press(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Score text", exact: true }));
    await expect(page.getByRole("textbox", { name: "Score text", exact: true })).toHaveValue(saved);
  });
});

test.describe("the handoff with a score file", () => {
  const handoffButton = (page: Page) => page.getByRole("button", { name: "Regenerate…", exact: true });
  const missingButton = (page: Page) => page.getByRole("button", { name: "Complete required inputs…", exact: true });
  const review = (page: Page) => page.getByRole("dialog", { name: "Check before regenerating", exact: true });

  test("a missing required input opens the Project panel on it; the title is the file name", async ({
    page,
    harness,
    press,
  }) => {
    await openFile(harness, {
      handoff: true,
      requiredInputs: ["style"],
      project: { style: "" },
    });

    await expect(missingButton(page)).toBeVisible();
    await press(missingButton(page));

    const panel = page.getByRole("dialog", { name: "Project", exact: true });
    await expect(panel).toBeVisible();
    const style = page.getByRole("textbox", { name: "Style description", exact: true });
    await expect(style).toBeFocused();
    await style.fill("pop");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    await expect(handoffButton(page)).toBeVisible();
    await press(handoffButton(page));
    await expect(review(page)).toBeVisible();
    await press(review(page).getByRole("button", { name: "Regenerate with this version", exact: true }));

    await expect.poll(async () => (await harness.handoffs()).length).toBe(1);
    const [handoff] = await harness.handoffs();
    expect(handoff?.payload.instruction).toContain("Title: tune.abc");
    expect(handoff?.payload.instruction).toContain("Style description:\npop");
    expect(handoff?.payload.project.score).toBe(QUARTERS);
    expect(await harness.scoreCalls()).toEqual([]);
  });

  test("a missing lyrics input shows the arrangement and opens the new-line editor", async ({
    page,
    harness,
    press,
  }) => {
    await openFile(harness, { handoff: true, requiredInputs: ["lyrics"] });
    await press(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Staff", exact: true }));
    await expect(page.getByRole("region", { name: "Staff" })).toBeVisible();

    await expect(missingButton(page)).toBeVisible();
    await press(missingButton(page));

    await expect(page.getByRole("region", { name: "Arrangement" })).toBeVisible();
    const entry = page.getByRole("textbox", { name: "New lyric line text", exact: true });
    await expect(entry).toBeVisible();
    await expect(entry).toBeFocused();
  });

  test("a conflicted save keeps the handoff closed until the conflict is answered", async ({
    page,
    harness,
    press,
  }) => {
    await openFile(harness, { handoff: true });
    await deleteD(page, press);
    await harness.externalScore(THEIR_SCORE);
    await press(handoffButton(page));
    await press(review(page).getByRole("button", { name: "Regenerate with this version", exact: true }));

    await expect(conflictStrip(page)).toBeVisible();
    expect(await harness.handoffs()).toEqual([]);

    await press(loadTheirsButton(page));
    await expect(conflictStrip(page)).toBeHidden();
    expect(await harness.handoffs()).toEqual([]);
  });

  test("a dirty handoff saves the file before the host is called", async ({ page, harness, press }) => {
    await openFile(harness, { handoff: true });
    await deleteD(page, press);
    await press(handoffButton(page));
    await press(review(page).getByRole("button", { name: "Regenerate with this version", exact: true }));

    await expect.poll(async () => (await harness.handoffs()).length).toBe(1);
    expect((await harness.scoreCalls()).map((call) => call.method)).toEqual(["save"]);
    expect((await harness.scoreCalls())[0]).toMatchObject({ text: WITHOUT_D, expected: "file-1" });
    expect((await harness.handoffs())[0]?.payload.project.score).toBe(WITHOUT_D);
  });

  test("the change log is read from the last saved version, not the opened one", async ({ page, harness, press }) => {
    await openFile(harness, { handoff: true });
    await deleteD(page, press);
    await press(saveButton(page));
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);
    await press(page.getByRole("button", { name: "Undo", exact: true }));
    await expect(page.getByRole("listitem", { name: /^D4,/ })).toBeVisible();

    await press(handoffButton(page));
    const list = review(page).getByRole("list", { name: "Changes", exact: true });
    await expect(list.getByRole("listitem")).toHaveText(["The notes of bar 1 changed."]);
  });
});

test.describe("the save control adds no toolbar row on a phone", () => {
  test("at 412 and 320 the toolbar keeps the height it had without the control", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "phone chrome is checked on the phone project");
    for (const width of [412, 320]) {
      await page.setViewportSize({ width, height: 900 });
      // The draft Restore control is the same one a score file has, so only Save is being compared.
      await harness.mount({ score: { text: QUARTERS }, drafts: true });
      await expect(page.getByRole("button", { name: "Restore original", exact: true })).toBeVisible();
      const before = await box(page.locator(".sce-toolbar"));
      await harness.destroy();

      await openFile(harness);
      await page.getByRole("listitem", { name: D4, exact: true }).tap();
      await page.keyboard.press("Delete");
      await expect(page.locator(".sce-save-dot")).toBeVisible();
      if (width >= 480) await expect(unsavedPill(page)).toBeVisible();
      const after = await box(page.locator(".sce-toolbar"));
      expect(after.height).toBe(before.height);
      await harness.destroy();
    }
  });
});

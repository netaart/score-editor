// ABOUTME: Seam 5 for score sources: the save and save-as callbacks, the unsaved state, the conflict and the handoff gate.
// ABOUTME: Host callbacks are faked on the test page; every case runs on the desktop project and the phone project.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
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
const F4 = "F4, bar 1 beat 4, length 1 beat";

const noteNamed = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });
const noteLabel = (language: "en" | "zh", pitch: string, bar: number, beat: number, length: number) =>
  language === "zh"
    ? `${pitch}，第 ${bar} 小节第 ${beat} 拍，长 ${length} 拍`
    : `${pitch}, bar ${bar} beat ${beat}, length ${length} ${length === 1 ? "beat" : "beats"}`;
const saveButton = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
const saveAsButton = (page: Page) => page.getByRole("button", { name: "Save as score file", exact: true });
const unsavedPill = (page: Page) => page.getByText("Unsaved", { exact: true });
const conflictStrip = (page: Page, language: "en" | "zh" = "en") =>
  page.getByRole("group", { name: language === "zh" ? "乐谱文件冲突" : "Score file conflict", exact: true });
const chooseButton = (page: Page) => page.getByRole("button", { name: "Choose", exact: true });
const overwriteButton = (page: Page) => page.getByRole("button", { name: "Overwrite with my version", exact: true });
const loadTheirsButton = (page: Page) => page.getByRole("button", { name: "Load the other version", exact: true });
const restore = (page: Page) => page.getByRole("button", { name: "Restore original", exact: true });
/** The same control in the language a test mounts; its name is the only word the baseline shares. */
const restoreIn = (page: Page, language: "en" | "zh") =>
  page.getByRole("button", { name: language === "zh" ? "恢复原谱" : "Restore original", exact: true });
const restoreQuestion = (page: Page) =>
  page.getByRole("dialog", { name: "Go back to the last saved version?", exact: true });

async function openFile(harness: Harness, options: Record<string, unknown> = {}): Promise<void> {
  await harness.mount({
    score: { text: QUARTERS },
    scoreFile: { name: "tune.abc" },
    ...options,
  });
}

async function deleteD(
  page: Page,
  press: (target: ReturnType<Page["locator"]>) => Promise<void>,
  language: "en" | "zh" = "en",
): Promise<void> {
  const name = noteLabel(language, "D4", 1, 2, 1);
  await press(noteNamed(page, name));
  await page.keyboard.press("Delete");
  await expect(noteNamed(page, name)).toHaveCount(0);
}

test.describe("saving a score file", () => {
  test("writes nothing before the save; then the score with the opened version, and asks no draft store", async ({
    page,
    harness,
    press,
  }) => {
    await openFile(harness, { drafts: true });
    await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true");
    expect(await harness.scoreCalls()).toEqual([]);
    expect(await harness.draftCalls()).toEqual([]);
    expect(await harness.hasUnsavedChanges()).toBe(false);

    await deleteD(page, press);
    // The form is chosen for the width once, so a phone can show the pill's word or the mark; either says unsaved.
    await expect(page.locator(".sce-part-save")).toContainText(/Unsaved|•/);
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
    await expect(failed).toHaveAttribute("aria-label", "Save again");
    await expect(failed).toContainText("Save again");
    await expect(page.locator(".sce-save-state")).toHaveText("Save failed");
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

/** The words the save control says in each language. */
const words = {
  en: { unsaved: "Unsaved", saving: "Saving…", failed: "Save failed", again: "Save again", save: "Save" },
  zh: { unsaved: "未保存", saving: "保存中…", failed: "保存失败", again: "重新保存", save: "保存" },
} as const;

/** The recovery sentence a failed save carries in the button's description. */
const recovery = {
  en: "The score file was not saved. Your changes are still here; try Save again.",
  zh: "乐谱文件没有保存成功，你的修改还在，再按保存试一次。",
} as const;

/** What one save state shows where a person can see it: the form, the visible words and mark, and what is spoken. */
interface SaveLooks {
  /** The toolbar's height in the state; the form must not change it. */
  height: number;
  /** The form chosen for the width: "false" for words, "true" for the icon and its mark. */
  form: string | undefined;
  /** The button's accessible name. */
  name: string | null;
  /** The action word, "" while the icon form hides it. */
  action: string;
  /** The pill's word, "" when it is hidden or out of sight. */
  pill: string;
  /** The mark's glyph, "" when it is hidden or out of sight. */
  mark: string;
  description: string;
  disabled: string | null;
  buttonInSight: boolean;
}

/** Reads the save control where it is drawn: a word or a mark outside the toolbar's visible box is not in sight. */
async function saveLooks(page: Page): Promise<SaveLooks> {
  return page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>(".sce-toolbar");
    const part = document.querySelector<HTMLElement>(".sce-part-save");
    const button = part?.querySelector<HTMLElement>(".sce-save-button");
    if (!toolbar || !part || !button) throw new Error("the save control is not drawn");
    // A conflict strip shows by scrolling the chrome; read the control with the chrome at its top, as a swipe would.
    toolbar.closest<HTMLElement>(".sce-chrome")?.scrollTo({ top: 0, left: 0 });
    const frame = toolbar.getBoundingClientRect();
    const sight = {
      left: Math.max(0, frame.left),
      right: Math.min(innerWidth, frame.left + toolbar.clientWidth),
      top: Math.max(0, frame.top),
      bottom: Math.min(innerHeight, frame.top + toolbar.clientHeight),
    };
    const inSight = (el: Element | null): boolean => {
      if (!(el instanceof HTMLElement) || el.hidden) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const area = el.getBoundingClientRect();
      return (
        area.width > 0 &&
        area.height > 0 &&
        area.left >= sight.left - 0.5 &&
        area.right <= sight.right + 0.5 &&
        area.top >= sight.top - 0.5 &&
        area.bottom <= sight.bottom + 0.5
      );
    };
    const word = (selector: string): string => {
      const el = part.querySelector(selector);
      return inSight(el) ? (el?.textContent ?? "").trim() : "";
    };
    return {
      height: frame.height,
      form: part.dataset.compact,
      name: button.getAttribute("aria-label"),
      action: word(".sce-save-label"),
      pill: word(".sce-save-state"),
      mark: word(".sce-save-mark"),
      description: button.getAttribute("aria-description") ?? "",
      disabled: button.getAttribute("aria-disabled"),
      buttonInSight: inSight(button),
    };
  });
}

type SaveState = "clean" | "dirty" | "saving" | "failed" | "conflict";
const SAVE_STATES: ReadonlyArray<SaveState> = ["clean", "dirty", "saving", "failed", "conflict"];

/**
 * The height the widest state's words take, measured with those words in the control. The five states' longest pair
 * is the failed state's pill and action, so the test uses them as the room the one form must have.
 */
async function widestWordsHeight(page: Page, language: "en" | "zh"): Promise<number> {
  const t = words[language];
  return page.evaluate(
    ({ failed, again }) => {
      const toolbar = document.querySelector<HTMLElement>(".sce-toolbar");
      const part = document.querySelector<HTMLElement>(".sce-part-save");
      if (!toolbar || !part) throw new Error("the save control is not drawn");
      const state = part.querySelector<HTMLElement>(".sce-save-state");
      const mark = part.querySelector<HTMLElement>(".sce-save-mark");
      const label = part.querySelector<HTMLElement>(".sce-save-label");
      if (!state || !mark || !label) throw new Error("the save control is not drawn");
      const compact = part.dataset.compact;
      const word = part.dataset.word;
      const stateHidden = state.hidden;
      const stateText = state.textContent;
      const markHidden = mark.hidden;
      const labelText = label.textContent;
      part.dataset.compact = "false";
      part.dataset.word = "true";
      state.hidden = false;
      state.textContent = failed;
      mark.hidden = true;
      label.textContent = again;
      const height = toolbar.getBoundingClientRect().height;
      part.dataset.compact = compact;
      part.dataset.word = word;
      state.hidden = stateHidden;
      state.textContent = stateText;
      mark.hidden = markHidden;
      label.textContent = labelText;
      return height;
    },
    { failed: t.failed, again: t.again },
  );
}

/** Drives one score file through its five states in the current language and reads the control in each. */
async function saveStates(
  page: Page,
  harness: Harness,
  press: (target: Locator) => Promise<void>,
  language: "en" | "zh",
): Promise<Record<SaveState, SaveLooks>> {
  const t = words[language];
  const states = {} as Record<SaveState, SaveLooks>;
  states.clean = await saveLooks(page);

  await deleteD(page, press, language);
  states.dirty = await saveLooks(page);

  await harness.holdScoreSave();
  await press(page.getByRole("button", { name: t.save, exact: true }));
  await expect(page.getByRole("button", { name: t.saving, exact: true })).toBeVisible();
  states.saving = await saveLooks(page);
  await harness.releaseScoreSave();
  await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);
  await expect(page.getByRole("button", { name: t.save, exact: true })).toBeVisible();

  await press(noteNamed(page, noteLabel(language, "E4", 1, 3, 1)));
  await page.keyboard.press("Delete");
  await harness.failScoreNext("save");
  await press(page.getByRole("button", { name: t.save, exact: true }));
  states.failed = await saveLooks(page);
  await press(page.getByRole("button", { name: t.again, exact: true }));
  await expect.poll(async () => (await harness.scoreCalls()).length).toBe(3);
  await expect(page.getByRole("button", { name: t.save, exact: true })).toBeVisible();

  await harness.externalScore(THEIR_SCORE);
  await press(noteNamed(page, noteLabel(language, "F4", 1, 4, 1)));
  await page.keyboard.press("Delete");
  await expect(noteNamed(page, noteLabel(language, "F4", 1, 4, 1))).toHaveCount(0);
  await press(page.getByRole("button", { name: t.save, exact: true }));
  await expect(conflictStrip(page, language)).toBeVisible();
  states.conflict = await saveLooks(page);

  return states;
}

/** The invariants that hold for any fonts: one form, one height, every state readable, and the states told apart. */
function checkSaveStates(
  states: Record<SaveState, SaveLooks>,
  base: number,
  width: number,
  language: "en" | "zh",
  noRow = true,
): void {
  const t = words[language];
  const where = `${width} ${language}`;
  for (const state of SAVE_STATES) {
    const look = states[state];
    expect(look.height, `${where} ${state}: the height does not follow the state`).toBe(states.clean.height);
    // On a phone Save lives in the always-visible bar and adds no row to it: the toolbar is as tall as it is without the
    // control, whatever form the state's words need. A narrow fine-pointer host may still spend a row; only the phone
    // has the two-row promise.
    if (noRow) expect(look.height, `${where} ${state}: Save adds no row`).toBe(base);
    expect(look.form, `${where} ${state}: one form for the width`).toBe(states.clean.form);
    expect(look.buttonInSight, `${where} ${state}: the button is in sight`).toBe(true);
  }
  expect(states.clean.name, `${where} clean: the button is named`).toBe(t.save);

  expect(states.dirty.pill || states.dirty.mark, `${where} dirty: a word or a mark`).not.toBe("");
  expect(states.dirty.description, `${where} dirty: description`).toBe(t.unsaved);
  expect(states.saving.action || states.saving.mark, `${where} saving: a word or a mark`).not.toBe("");
  expect(states.saving.description, `${where} saving: description`).toBe(t.saving);
  expect(states.failed.pill || states.failed.mark, `${where} failed: a word or a mark`).not.toBe("");
  expect(states.failed.description, `${where} failed: description`).toBe(recovery[language]);
  expect(states.conflict.pill || states.conflict.mark, `${where} conflict: a word or a mark`).not.toBe("");
  expect(states.conflict.description, `${where} conflict: description`).toBe(t.unsaved);
  expect(states.conflict.disabled, `${where} conflict: Save is disabled`).toBe("true");

  const signature = (look: SaveLooks) =>
    `${look.action}|${look.pill}|${look.mark}|${look.description}|${look.disabled}`;
  expect(signature(states.failed), `${where} failed differs from dirty`).not.toBe(signature(states.dirty));
  expect(signature(states.conflict), `${where} conflict differs from dirty`).not.toBe(signature(states.dirty));
}

test.describe("the save state at every width", () => {
  test("keeps one form and one height, and every state reads, at every width", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.setTimeout(240_000);
    const widths = isMobile ? [412, 360, 320] : [1280];
    for (const width of widths) {
      for (const language of ["en", "zh"] as const) {
        await page.setViewportSize({ width, height: isMobile ? 839 : 720 });
        // The same editor without the save control: the draft Restore control is the one a score file also has.
        await harness.mount({ score: { text: QUARTERS }, drafts: true, language });
        await expect(restoreIn(page, language)).toBeVisible();
        const base = (await box(page.locator(".sce-toolbar"))).height;
        await harness.destroy();

        await openFile(harness, { language });
        const states = await saveStates(page, harness, press, language);
        checkSaveStates(states, base, width, language);
        await harness.destroy();
      }
    }
  });

  test("chooses one form for the box, wide and narrow", async ({ page, harness, press, isMobile }) => {
    test.skip(isMobile, "the toolbar's box is narrowed on the desktop project");
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const width of [1280, 320]) {
      await page.evaluate((w) => (window.harness.stage.style.width = `${w}px`), width);
      await harness.mount({ score: { text: QUARTERS }, drafts: true });
      await expect(page.getByRole("button", { name: "Restore original", exact: true })).toBeVisible();
      const base = (await box(page.locator(".sce-toolbar"))).height;
      await harness.destroy();

      await openFile(harness);
      const states = await saveStates(page, harness, press, "en");
      const widest = await widestWordsHeight(page, "en");
      // The form is the box's, read from the room the widest state needs: words only while they fit its height.
      const form = widest > base ? "true" : "false";
      for (const state of SAVE_STATES) {
        expect(states[state].form, `${width} ${state}: the box chooses one form`).toBe(form);
      }
      checkSaveStates(states, base, width, "en", width !== 320);
      await harness.destroy();
    }
  });
});

test("reveals the whole strip in the chrome without a swipe", async ({ page, harness, press, isMobile }) => {
  const widths = isMobile ? [412, 320] : [1280];
  for (const width of widths) {
    await page.setViewportSize({ width, height: isMobile ? 839 : 720 });
    await harness.stageHeight(420);
    await openFile(harness);
    await deleteD(page, press);
    await harness.externalScore(THEIR_SCORE);
    await press(saveButton(page));
    await expect(conflictStrip(page)).toBeVisible();
    await harness.frames(1);

    const found = await page.evaluate(() => {
      const chrome = document.querySelector<HTMLElement>(".sce-chrome");
      const strip = document.querySelector<HTMLElement>(".sce-part-save-conflict .sce-draft-conflict");
      if (!chrome || !strip) return null;
      const outer = chrome.getBoundingClientRect();
      const sentence = strip.querySelector<HTMLElement>(".sce-draft-conflict-text")?.getBoundingClientRect();
      const choose = strip.querySelector<HTMLElement>(".sce-draft-choose");
      const area = choose?.getBoundingClientRect();
      const top =
        area === undefined ? null : document.elementFromPoint(area.left + area.width / 2, area.top + area.height / 2);
      return {
        sentenceInside:
          sentence !== undefined &&
          sentence.top >= outer.top - 0.5 &&
          sentence.bottom <= outer.top + chrome.clientHeight + 0.5,
        chooseInside:
          area !== undefined && area.top >= outer.top - 0.5 && area.bottom <= outer.top + chrome.clientHeight + 0.5,
        chooseHit: area !== undefined && (top === choose || choose?.contains(top) === true),
      };
    });
    expect(found?.sentenceInside, `${width}: the sentence is in the chrome`).toBe(true);
    expect(found?.chooseInside, `${width}: Choose is in the chrome`).toBe(true);
    expect(found?.chooseHit, `${width}: Choose is on top`).toBe(true);
    await harness.destroy();
  }
});

test.describe("what the save state says", () => {
  test("announces Saved and the recovery sentence, and speaks the state once", async ({ page, harness, press }) => {
    await openFile(harness);
    const state = page.locator(".sce-save-state");
    const button = page.locator(".sce-save-button");
    const live = page.locator(".sce-part-toolbar [role=status].sce-sr-only");

    await deleteD(page, press);
    await expect(state).toHaveAttribute("aria-hidden", "true");
    await expect(button).toHaveAttribute("aria-description", "Unsaved");
    await press(saveButton(page));
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);
    await expect(live).toHaveText("Saved");

    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await harness.failScoreNext("save");
    await press(saveButton(page));
    await expect(button).toHaveAttribute("aria-label", "Save again");
    await expect(button).toHaveAttribute(
      "aria-description",
      "The score file was not saved. Your changes are still here; try Save again.",
    );
    await expect(button).toHaveAttribute(
      "title",
      "Save again (Ctrl/Cmd+S). The score file was not saved. Your changes are still here; try Save again.",
    );
    await expect(state).toHaveText("Save failed");
    await expect(state).toHaveAttribute("aria-hidden", "true");
    await expect(live).toHaveText("The score file was not saved. Your changes are still here; try Save again.");

    await press(button);
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(3);
    await harness.externalScore(THEIR_SCORE);
    await press(noteNamed(page, F4));
    await page.keyboard.press("Delete");
    await press(saveButton(page));
    await expect(conflictStrip(page)).toBeVisible();
    await expect(state).toHaveAttribute("data-state", "dirty");
    await expect(state).toHaveCSS("font-weight", "600");
    await expect(button).toHaveAttribute("aria-description", "Unsaved");
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
    await expect(chooseButton(page)).toBeVisible();
    await expect(overwriteButton(page)).toBeHidden();
    await expect(loadTheirsButton(page)).toBeHidden();
  }

  test("offers both choices, and Overwrite reads their version and writes ours over it", async ({
    page,
    harness,
    press,
  }) => {
    await conflict(page, harness, press);

    await press(chooseButton(page));
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

    await press(chooseButton(page));
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
  }) => {
    await openFile(harness);
    await expect(restore(page)).toHaveAttribute("aria-disabled", "true");
    await restore(page).evaluate((el) => (el as HTMLButtonElement).click());
    await expect(restoreQuestion(page)).toBeHidden();

    await deleteD(page, press);
    await expect(restore(page)).toHaveAttribute("aria-disabled", "false");
    await press(saveButton(page));
    await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);

    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await expect(noteNamed(page, E4)).toHaveCount(0);
    // The state is a word or a mark, whichever form the width chose; both say unsaved.
    await expect(page.locator(".sce-part-save")).toContainText(/Unsaved|•/);

    await press(restore(page));
    await expect(restoreQuestion(page)).toBeVisible();
    await expect(restoreQuestion(page)).toContainText(
      "Every change since the last save is discarded. You can't undo this.",
    );
    await press(restoreQuestion(page).getByRole("button", { name: "Go back to last save", exact: true }));

    await expect(restoreQuestion(page)).toBeHidden();
    await expect(noteNamed(page, E4)).toBeVisible();
    await expect(noteNamed(page, D4)).toHaveCount(0);
    await expect(unsavedPill(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveAttribute("aria-disabled", "true");
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

    const required = page.getByRole("button", { name: "Add style first…", exact: true });
    await expect(required).toBeVisible();
    await press(required);

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

  test("names the required field, counts several, and marks the empty field", async ({ page, harness, press }) => {
    await openFile(harness, { handoff: true, requiredInputs: ["style"], project: { style: "" } });
    await expect(page.getByRole("button", { name: "Add style first…", exact: true })).toBeVisible();
    await press(page.getByRole("button", { name: "Add style first…", exact: true }));
    const panel = page.getByRole("dialog", { name: "Project", exact: true });
    await expect(panel).toBeVisible();
    await expect(
      page.getByText("Required to regenerate. Not set. Describe the style you want.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Not set. Each generation picks its own.", { exact: true })).toBeVisible();

    await harness.destroy();
    await openFile(harness, {
      handoff: true,
      requiredInputs: ["style", "seed"],
      project: { style: "", seed: null },
    });
    await expect(page.getByRole("button", { name: "Add 2 required inputs…", exact: true })).toBeVisible();

    await harness.destroy();
    await openFile(harness, { language: "zh", handoff: true, requiredInputs: ["style"], project: { style: "" } });
    await expect(page.getByRole("button", { name: "先补风格描述…", exact: true })).toBeVisible();
  });

  test("a missing lyrics input shows the arrangement and opens the new-line editor", async ({
    page,
    harness,
    press,
  }) => {
    await harness.stageHeight(420);
    await openFile(harness, { handoff: true, requiredInputs: ["lyrics"] });
    await press(page.getByRole("group", { name: "View" }).getByRole("button", { name: "Staff", exact: true }));
    await expect(page.getByRole("region", { name: "Staff" })).toBeVisible();

    const required = page.getByRole("button", { name: "Add lyrics first…", exact: true });
    await expect(required).toBeVisible();
    await press(required);

    await expect(page.getByRole("region", { name: "Arrangement" })).toBeVisible();
    const entry = page.getByRole("textbox", { name: "New lyric line text", exact: true });
    await expect(entry).toBeVisible();
    await expect(entry).toBeFocused();
    const head = await box(page.locator(".sce-part-lyric-track .sce-lyric-head"));
    const firstRow = await box(page.getByText("No lyrics in this song", { exact: true }));
    expect(firstRow.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
  });

  test("the lyrics gate's field and its Add button lie inside the scroller", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.setTimeout(180_000);
    const cases: ReadonlyArray<readonly [number, "en" | "zh"]> = isMobile
      ? [
          [412, "en"],
          [412, "zh"],
          [320, "en"],
          [320, "zh"],
        ]
      : [
          [1280, "en"],
          [1280, "zh"],
        ];
    for (const [width, language] of cases) {
      await page.setViewportSize({ width, height: isMobile ? 839 : 720 });
      await harness.stageHeight(420);
      await openFile(harness, { handoff: true, requiredInputs: ["lyrics"], language });
      const where = `${width} ${language}`;
      await press(
        page
          .getByRole("group", { name: language === "zh" ? "视图" : "View" })
          .getByRole("button", { name: language === "zh" ? "五线谱" : "Staff", exact: true }),
      );
      const required = page.getByRole("button", {
        name: language === "zh" ? "先补歌词…" : "Add lyrics first…",
        exact: true,
      });
      await expect(required).toBeVisible();
      await press(required);

      await expect(page.getByRole("region", { name: language === "zh" ? "编曲视图" : "Arrangement" })).toBeVisible();
      const entry = page.getByRole("textbox", {
        name: language === "zh" ? "新歌词行的文字" : "New lyric line text",
        exact: true,
      });
      await expect(entry).toBeFocused();
      await harness.frames(1);

      const add = page
        .locator(".sce-lyric-editor")
        .getByRole("button", { name: language === "zh" ? "添加" : "Add", exact: true });
      const scroller = await page.locator(".sce-scroller").evaluate((el) => {
        const frame = el.getBoundingClientRect();
        return {
          left: frame.left,
          right: frame.left + el.clientWidth,
          top: frame.top,
          bottom: frame.top + el.clientHeight,
        };
      });
      const head = await box(page.locator(".sce-part-lyric-track .sce-lyric-head"));
      const inputBox = await box(entry);
      const addBox = await box(add);
      const inside = (area: { x: number; y: number; width: number; height: number }): boolean =>
        area.x >= scroller.left - 0.5 &&
        area.x + area.width <= scroller.right + 0.5 &&
        area.y >= scroller.top - 0.5 &&
        area.y + area.height <= scroller.bottom + 0.5;
      expect(inside(inputBox), `${where}: the input is inside the scroller`).toBe(true);
      expect(inside(addBox), `${where}: the Add button is inside the scroller`).toBe(true);
      expect(inputBox.y, `${where}: the input is below the pinned head`).toBeGreaterThanOrEqual(
        head.y + head.height - 0.5,
      );
      expect(addBox.y, `${where}: the Add button is below the pinned head`).toBeGreaterThanOrEqual(
        head.y + head.height - 0.5,
      );
      const hit = await page.evaluate(
        ({ x, y }) => {
          const found = document.elementFromPoint(x, y);
          const field = document.querySelector(".sce-lyric-editor input.sce-lyric-input:not(.sce-lyric-bar)");
          return found !== null && field !== null && (found === field || field.contains(found));
        },
        { x: inputBox.x + inputBox.width / 2, y: inputBox.y + inputBox.height / 2 },
      );
      expect(hit, `${where}: the input is on top at its centre`).toBe(true);
      expect(await page.evaluate(() => window.scrollY), `${where}: the page did not scroll`).toBe(0);
      await harness.destroy();
    }
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
    expect(await harness.notices()).toContainEqual({
      code: "handoff-not-sent",
      level: "warning",
      message: "Not sent: this score file was changed somewhere else. Choose a version, then regenerate.",
    });
    await expect(page.locator(".sce-part-toolbar [role=status].sce-sr-only")).toHaveText(
      "Not sent: this score file was changed somewhere else. Choose a version, then regenerate.",
    );

    await press(chooseButton(page));
    await press(loadTheirsButton(page));
    await expect(conflictStrip(page)).toBeHidden();
    expect(await harness.handoffs()).toEqual([]);
  });

  test("the review says a dirty file is saved first, and only then", async ({ page, harness, press }) => {
    const line = page.locator(".sce-handoff-file");
    await openFile(harness, { handoff: true });
    await press(page.getByRole("button", { name: "Regenerate…", exact: true }));
    await expect(review(page)).toBeVisible();
    await expect(line).toBeHidden();
    await page.keyboard.press("Escape");

    await deleteD(page, press);
    await press(page.getByRole("button", { name: "Regenerate…", exact: true }));
    await expect(line).toBeVisible();
    await expect(line).toHaveText("Saves tune.abc first, then sends the song.");
    await page.keyboard.press("Escape");

    await harness.destroy();
    await harness.mount({ score: { text: QUARTERS }, handoff: true });
    await press(page.getByRole("button", { name: "Regenerate…", exact: true }));
    await expect(line).toBeHidden();
  });

  test("a failed save in a handoff says it was not sent", async ({ page, harness, press }) => {
    await openFile(harness, { handoff: true });
    await deleteD(page, press);
    await harness.failScoreNext("save");
    await press(handoffButton(page));
    await press(review(page).getByRole("button", { name: "Regenerate with this version", exact: true }));

    expect(await harness.handoffs()).toEqual([]);
    expect(await harness.notices()).toContainEqual({
      code: "handoff-not-sent",
      level: "warning",
      message: "Not sent: the score file was not saved. Try again, then regenerate.",
    });
    await expect(page.locator(".sce-part-toolbar [role=status].sce-sr-only")).toHaveText(
      "Not sent: the score file was not saved. Try again, then regenerate.",
    );
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

test.describe("the save control re-chooses with the box, the language and the fonts, not with the state", () => {
  test("a language change re-chooses the form and keeps the phone's toolbar height", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(!isMobile, "phone chrome is checked on the phone project");
    test.setTimeout(120_000);
    // 390 is the width where this container's fonts make the icon form take the box's next row; the host's 360 is
    // covered by the same invariant.
    for (const width of [412, 360, 320, 390]) {
      await page.setViewportSize({ width, height: 839 });
      // The draft Restore control is the same one a score file has, so only Save is being compared.
      const base = {} as Record<"en" | "zh", number>;
      for (const language of ["en", "zh"] as const) {
        await harness.mount({ score: { text: QUARTERS }, drafts: true, language });
        await expect(restoreIn(page, language)).toBeVisible();
        base[language] = (await box(page.locator(".sce-toolbar"))).height;
        await harness.destroy();
      }

      await openFile(harness);
      await deleteD(page, press);
      const english = await saveLooks(page);
      expect(english.height, `${width} en: Save adds no row`).toBe(base.en);

      await harness.update({ language: "zh" });
      const chinese = await saveLooks(page);
      expect(chinese.height, `${width} zh: Save adds no row`).toBe(base.zh);
      expect(chinese.pill || chinese.mark, `${width} zh: a word or a mark`).not.toBe("");

      await harness.holdScoreSave();
      await press(page.getByRole("button", { name: words.zh.save, exact: true }));
      await expect(page.getByRole("button", { name: words.zh.saving, exact: true })).toBeVisible();
      const saving = await saveLooks(page);
      expect(saving.form, `${width} zh: one form across the language and the state`).toBe(chinese.form);
      expect(saving.height, `${width} zh saving: Save adds no row`).toBe(base.zh);
      await harness.releaseScoreSave();
      await expect.poll(async () => (await harness.scoreCalls()).length).toBe(1);
      await harness.destroy();
    }
  });

  test("a resize re-chooses the form while the file is dirty", async ({ page, harness, press, isMobile }) => {
    test.skip(isMobile, "the box is resized on the desktop project");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => {
      window.harness.stage.style.width = "1280px";
    });
    await openFile(harness);
    await deleteD(page, press);

    await page.evaluate(() => {
      window.harness.stage.style.width = "320px";
    });
    await harness.frames(2);
    const narrow = await saveLooks(page);
    const widest = await widestWordsHeight(page, "en");

    await harness.destroy();
    await harness.mount({ score: { text: QUARTERS }, drafts: true });
    await expect(page.getByRole("button", { name: "Restore original", exact: true })).toBeVisible();
    const base = (await box(page.locator(".sce-toolbar"))).height;
    expect(narrow.form, "the new box chooses its own form").toBe(widest > base ? "true" : "false");
    expect(narrow.buttonInSight, "the control stays in sight at the narrow width").toBe(true);
  });

  test("a settled font re-chooses the form, and the state does not", async ({ page, harness, press, isMobile }) => {
    test.skip(isMobile, "the font is changed on the desktop project");
    await page.setViewportSize({ width: 1280, height: 900 });
    // A box the first text size fits the widest words in and a larger one does not.
    await page.evaluate(() => {
      window.harness.stage.style.width = "340px";
    });
    await openFile(harness);

    await page.evaluate(() => {
      const style = document.createElement("style");
      style.dataset.fontChange = "";
      style.textContent = ".sce-root.sce-root { font-size: 22px !important; }";
      document.head.append(style);
      // The event the browser sends when the face that was loading has settled.
      document.fonts.dispatchEvent(new Event("loadingdone"));
    });
    const clean = await saveLooks(page);
    await deleteD(page, press);
    const dirty = await saveLooks(page);
    expect(dirty.height, "the height does not wait for the state to change").toBe(clean.height);
    expect(dirty.form, "the state keeps the settled form").toBe(clean.form);
    const widest = await widestWordsHeight(page, "en");

    await harness.destroy();
    await harness.mount({ score: { text: QUARTERS }, drafts: true });
    await expect(page.getByRole("button", { name: "Restore original", exact: true })).toBeVisible();
    const base = (await box(page.locator(".sce-toolbar"))).height;
    expect(clean.form, "the settled font's own form").toBe(widest > base ? "true" : "false");
    expect(clean.height, "Save does not grow a narrow fine-pointer toolbar").toBeLessThanOrEqual(base);
  });
});

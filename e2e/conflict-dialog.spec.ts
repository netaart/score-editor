// ABOUTME: Seam 5 for the conflict banner's choice dialog: both choices and their consequences fit the dialog and the root.
// ABOUTME: At every phone width and at both the tall and the short root, in English and Chinese, for a draft and a score file.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, test, vocalOnly } from "./fixtures";

const QUARTERS = vocalOnly("C4D4E4F4|G16|");
const THEIR_SCORE = QUARTERS.replace("C4D4E4F4|G16|", "C4D4E4G4|A16|");
const D4 = /^D4[,，]/;
const F4 = /^F4[,，]/;

interface StoreCall {
  method: "read" | "write" | "remove" | "list";
}

interface PageWithStore {
  harness: {
    drafts: {
      calls(): StoreCall[];
      file(key: string): { text: string; version: string } | null;
      external(key: string, text: string): string;
    };
  };
}

const writes = (page: Page) =>
  page.evaluate(
    () => (window as unknown as PageWithStore).harness.drafts.calls().filter((call) => call.method === "write").length,
  );

const noteNamed = (page: Page, pitch: RegExp) => page.getByRole("listitem", { name: pitch });

const chooseButton = (page: Page) => page.locator(".sce-draft-conflict .sce-draft-choose");

async function deleteNote(page: Page, press: (target: Locator) => Promise<void>, pitch: RegExp): Promise<void> {
  await press(noteNamed(page, pitch));
  await page.keyboard.press("Delete");
}

/** Makes a draft conflict: our first edit is stored, another window writes, our next edit comes back as a conflict. */
async function makeDraftConflict(page: Page, press: (target: Locator) => Promise<void>, source: string): Promise<void> {
  await press(noteNamed(page, D4));
  await page.keyboard.press("Delete");
  await expect.poll(() => writes(page)).toBe(1);
  const file = await page.evaluate(() => (window as unknown as PageWithStore).harness.drafts.file("test-page"));
  if (file === null) throw new Error("the first edit wrote no draft");
  const draft = JSON.parse(file.text) as { project: { score: string } };
  draft.project.score = source.replace("C4D4E4F4|", "C4D4z4F4|");
  await page.evaluate(
    (text) => (window as unknown as PageWithStore).harness.drafts.external("test-page", text),
    JSON.stringify(draft),
  );
  await press(noteNamed(page, F4));
  await page.keyboard.press("Delete");
  await expect.poll(() => writes(page)).toBe(2);
}

/** Makes a score-file conflict: another writer's version lands after our edit, and our save is refused. */
async function makeScoreFileConflict(
  page: Page,
  harness: Harness,
  press: (target: Locator) => Promise<void>,
): Promise<void> {
  await deleteNote(page, press, D4);
  await harness.externalScore(THEIR_SCORE);
  await press(page.locator(".sce-save-button"));
  await expect(page.locator(".sce-save-button")).toHaveAttribute("aria-disabled", "true");
}

/** Every box the dialog and its choices draw, and whether anything in it scrolls. */
async function dialogGeometry(page: Page) {
  const dialog = page.getByRole("dialog");
  const dialogBox = await box(dialog);
  const rootBox = await box(page.locator(".sce-editor"));
  const scroll = await dialog.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTop: el.scrollTop,
  }));
  const choices = await dialog.locator(".sce-draft-choice").evaluateAll((buttons) =>
    buttons.map((button) => {
      const frame = button.getBoundingClientRect();
      const note = button.querySelector(".sce-draft-note");
      const noteBox = note?.getBoundingClientRect() ?? null;
      return {
        top: frame.top,
        bottom: frame.bottom,
        left: frame.left,
        right: frame.right,
        scrollHeight: button.scrollHeight,
        clientHeight: button.clientHeight,
        noteTop: noteBox?.top ?? Number.NaN,
        noteBottom: noteBox?.bottom ?? Number.NaN,
        noteText: note?.textContent ?? "",
      };
    }),
  );
  return { dialogBox, rootBox, scroll, choices };
}

async function assertDialogFits(page: Page, where: string): Promise<void> {
  await expect(page.getByRole("dialog")).toBeVisible();
  const { dialogBox, rootBox, scroll, choices } = await dialogGeometry(page);
  expect(dialogBox.x, `${where}: the dialog starts inside the root`).toBeGreaterThanOrEqual(rootBox.x - 0.5);
  expect(dialogBox.y, `${where}: the dialog's top is inside the root`).toBeGreaterThanOrEqual(rootBox.y - 0.5);
  expect(dialogBox.x + dialogBox.width, `${where}: the dialog ends inside the root`).toBeLessThanOrEqual(
    rootBox.x + rootBox.width + 0.5,
  );
  expect(dialogBox.y + dialogBox.height, `${where}: the dialog's bottom is inside the root`).toBeLessThanOrEqual(
    rootBox.y + rootBox.height + 0.5,
  );
  expect(scroll.scrollHeight, `${where}: the dialog does not scroll`).toBeLessThanOrEqual(scroll.clientHeight + 1);
  expect(scroll.scrollTop, `${where}: the dialog opens at its top`).toBe(0);
  expect(choices.length, `${where}: both choices are there`).toBe(2);
  for (const [index, choice] of choices.entries()) {
    expect(choice.top, `${where}: choice ${index + 1} starts inside the dialog`).toBeGreaterThanOrEqual(
      dialogBox.y - 0.5,
    );
    expect(choice.bottom, `${where}: choice ${index + 1} ends inside the dialog`).toBeLessThanOrEqual(
      dialogBox.y + dialogBox.height + 0.5,
    );
    expect(choice.left, `${where}: choice ${index + 1} starts inside the dialog`).toBeGreaterThanOrEqual(
      dialogBox.x - 0.5,
    );
    expect(choice.right, `${where}: choice ${index + 1} ends inside the dialog`).toBeLessThanOrEqual(
      dialogBox.x + dialogBox.width + 0.5,
    );
    expect(choice.scrollHeight, `${where}: choice ${index + 1} shows its whole content`).toBeLessThanOrEqual(
      choice.clientHeight + 1,
    );
    expect(choice.noteText.length, `${where}: choice ${index + 1} describes what it does`).toBeGreaterThan(0);
    expect(choice.noteTop, `${where}: choice ${index + 1} note starts inside it`).toBeGreaterThanOrEqual(
      choice.top - 0.5,
    );
    expect(choice.noteBottom, `${where}: choice ${index + 1} note ends inside it`).toBeLessThanOrEqual(
      choice.bottom + 0.5,
    );
  }
}

for (const kind of ["draft", "score file"] as const) {
  for (const language of ["en", "zh"] as const) {
    test(`${kind} conflict, ${language}: both choices fit the dialog and the root at every phone width`, async ({
      page,
      harness,
      press,
      isMobile,
    }) => {
      test.skip(!isMobile, "the phone widths are the ones the dialog is measured at");
      test.setTimeout(180_000);
      for (const width of [412, 360, 320]) {
        await page.goto("/");
        await page.setViewportSize({ width, height: 839 });
        await harness.stageHeight(420);
        await harness.destroy();
        if (kind === "draft") {
          await harness.mount({ score: { text: QUARTERS }, drafts: true, language });
          await makeDraftConflict(page, press, QUARTERS);
        } else {
          await harness.mount({ score: { text: QUARTERS }, scoreFile: { name: "tune.abc" }, language });
          await makeScoreFileConflict(page, harness, press);
        }
        await expect(page.getByRole("alert")).toBeVisible();

        for (const height of [420, 288]) {
          await harness.stageHeight(height);
          await harness.frames(2);
          const where = `${kind} ${language} ${width}x${height}`;
          await press(chooseButton(page));
          await assertDialogFits(page, where);
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toBeHidden();
          await expect(chooseButton(page)).toBeFocused();
        }
      }
    });
  }
}

test("the banner sentence keeps a readable measure and the choices wrap prettily", async ({ page, harness, press }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await harness.stageHeight(420);
  await harness.mount({ score: { text: QUARTERS }, drafts: true });
  await makeDraftConflict(page, press, QUARTERS);
  await expect(page.getByRole("alert")).toBeVisible();

  const measure = await page.locator(".sce-draft-conflict-text").evaluate((sentence) => {
    const style = getComputedStyle(sentence);
    return { maxWidth: Number.parseFloat(style.maxWidth), fontSize: Number.parseFloat(style.fontSize) };
  });
  expect(Number.isFinite(measure.maxWidth), "the sentence's width is bounded").toBe(true);
  expect(measure.maxWidth, "the sentence stays at about 70ch").toBeLessThanOrEqual(70 * measure.fontSize);

  await press(chooseButton(page));
  await expect(page.getByRole("dialog")).toBeVisible();
  const wraps = await page
    .getByRole("dialog")
    .evaluate((dialog) =>
      [...dialog.querySelectorAll(".sce-draft-label, .sce-draft-note")].map((el) => getComputedStyle(el).textWrap),
    );
  expect(wraps, "both lines of each choice wrap prettily").toEqual(["pretty", "pretty", "pretty", "pretty"]);
});

const cancelButton = (page: Page, language: "en" | "zh") =>
  page.getByRole("button", { name: language === "zh" ? "取消" : "Cancel", exact: true });

const choiceButton = (page: Page, language: "en" | "zh", choice: "overwrite" | "load") =>
  page.getByRole("button", {
    name:
      choice === "overwrite"
        ? language === "zh"
          ? "用我的版本覆盖"
          : "Overwrite with my version"
        : language === "zh"
          ? "载入对方的版本"
          : "Load the other version",
    exact: true,
  });

const statusWith = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });

test("the keyboard opens the choices on Cancel, and Enter there writes nothing", async ({ page, harness, press }) => {
  await harness.mount({ score: { text: QUARTERS }, drafts: true });
  await makeDraftConflict(page, press, QUARTERS);
  const before = await writes(page);

  await chooseButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(cancelButton(page, "en")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(chooseButton(page)).toBeFocused();
  expect(await writes(page), "Enter on Cancel wrote nothing").toBe(before);

  await chooseButton(page).focus();
  await page.keyboard.press("Enter");
  await press(cancelButton(page, "en"));
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(chooseButton(page)).toBeFocused();
});

test("the Choose button reads 选择版本 in Chinese", async ({ page, harness, press }) => {
  await harness.mount({ score: { text: QUARTERS }, drafts: true, language: "zh" });
  await makeDraftConflict(page, press, QUARTERS);
  await expect(page.getByRole("button", { name: "选择版本", exact: true })).toBeVisible();
  await press(page.getByRole("button", { name: "选择版本", exact: true }));
  await expect(cancelButton(page, "zh")).toBeVisible();
});

test("after loading a draft theirs, the live region says what was replaced", async ({ page, harness, press }) => {
  await harness.mount({ score: { text: QUARTERS }, drafts: true });
  await makeDraftConflict(page, press, QUARTERS);
  await press(chooseButton(page));
  await press(choiceButton(page, "en", "load"));
  await expect(statusWith(page, "Loaded the other version. Your changes in this window were replaced.")).toHaveCount(1);
});

test("after overwriting a draft theirs, the live region says so in Chinese", async ({ page, harness, press }) => {
  await harness.mount({ score: { text: QUARTERS }, drafts: true, language: "zh" });
  await makeDraftConflict(page, press, QUARTERS);
  await press(chooseButton(page));
  await press(choiceButton(page, "zh", "overwrite"));
  await expect(statusWith(page, "已用你的版本覆盖。")).toHaveCount(1);
});

test("after overwriting a score file's other version, the live region says so", async ({ page, harness, press }) => {
  await harness.mount({ score: { text: QUARTERS }, scoreFile: { name: "tune.abc" } });
  await makeScoreFileConflict(page, harness, press);
  await press(chooseButton(page));
  await press(choiceButton(page, "en", "overwrite"));
  await expect(statusWith(page, "Saved your version over the other one.")).toHaveCount(1);
});

test("after loading a score file's other version, the live region says so in Chinese", async ({
  page,
  harness,
  press,
}) => {
  await harness.mount({ score: { text: QUARTERS }, scoreFile: { name: "tune.abc" }, language: "zh" });
  await makeScoreFileConflict(page, harness, press);
  await press(chooseButton(page));
  await press(choiceButton(page, "zh", "load"));
  await expect(statusWith(page, "已载入对方的版本，这个窗口里的修改已被替换。")).toHaveCount(1);
});

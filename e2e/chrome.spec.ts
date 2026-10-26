// ABOUTME: Seam 5 for the chrome floor and the pin rule: the music keeps at least three rows, and the header pins only while it can keep six.
// ABOUTME: It drives the mounted editor at a phone's and a desktop's width, in every chrome state the design measured, and taps through the DOM.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, tapFirstVisibleNote, test, vocalOnly } from "./fixtures";

/** Four quarter notes in C, then a whole note: the score most cases use. */
const QUARTERS = vocalOnly("C4D4E4F4|G16|");
/** The same score with a duration the format refuses, so the text view starts with a problem to fix. */
const BROKEN = QUARTERS.replace("C4D4E4F4|", "C5D4E4F4|");

const VIEWS = {
  en: { group: "View", staff: "Staff", text: "Score text" },
  zh: { group: "视图", staff: "五线谱", text: "乐谱文本" },
} as const;

/** Vocal plus a second voice cut after bar 1; the cut sentence and the project notice then stand with the conflict. */
const CUT = [
  "X:1",
  "T:",
  "M:4/4",
  "L:1/16",
  "Q:1/4=100",
  'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
  'V: Ins clef=treble name="Ins Melody" snm="Inst."',
  "K:C",
  "% a",
  "V: Vocal",
  "C4D4E4F4|G16|",
  "V: Ins",
  "C16|",
  "",
].join("\n");

const D4 = "D4, bar 1 beat 2, length 1 beat";
const F4 = "F4, bar 1 beat 4, length 1 beat";
const noteNamed = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });
const arrangement = (page: Page) => page.getByRole("region", { name: "Arrangement" });
const conflictSentence = (page: Page) => page.getByRole("alert");

type State = "editable" | "read-only" | "conflict" | "conflict-cut-notice";

interface StoreCall {
  method: "read" | "write" | "remove" | "list";
  result?: string | null;
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

const fileOf = (page: Page, key: string) =>
  page.evaluate((name) => (window as unknown as PageWithStore).harness.drafts.file(name), key);

const external = (page: Page, key: string, text: string) =>
  page.evaluate(
    ([name, body]) => (window as unknown as PageWithStore).harness.drafts.external(name as string, body as string),
    [key, text] as const,
  );

/** Our first edit is written; another window writes the draft; our next edit comes back as a conflict. */
async function makeConflict(page: Page, press: (target: Locator) => Promise<void>, source: string) {
  await press(noteNamed(page, D4));
  await page.keyboard.press("Delete");
  await expect.poll(() => writes(page)).toBe(1);

  const file = await fileOf(page, "test-page");
  if (file === null) throw new Error("the first edit wrote no draft");
  const draft = JSON.parse(file.text) as { project: { score: string } };
  draft.project.score = source.replace("C4D4E4F4|", "C4D4z4F4|");
  await external(page, "test-page", JSON.stringify(draft));

  await press(noteNamed(page, F4));
  await page.keyboard.press("Delete");
  await expect.poll(() => writes(page)).toBe(2);
  await expect(conflictSentence(page)).toBeVisible();
}

/** Mounts one of the four states the design measured, always at 420 first so a conflict can be made. */
async function mountState(
  page: Page,
  harness: Harness,
  press: (target: Locator) => Promise<void>,
  state: State,
  width: number,
) {
  await page.setViewportSize({ width, height: 800 });
  await harness.stageHeight(420);
  if (state === "editable") {
    await harness.mount({ score: { text: QUARTERS } });
    return;
  }
  if (state === "read-only") {
    await harness.mount({ score: { text: QUARTERS }, editable: false });
    return;
  }
  const source = state === "conflict-cut-notice" ? CUT : QUARTERS;
  await harness.mount({ score: { text: source }, drafts: true });
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await makeConflict(page, press, source);
  if (state === "conflict-cut-notice") {
    const tempo = page.getByRole("spinbutton", { name: "Tempo (BPM)" });
    await tempo.fill("120");
    await tempo.press("Enter");
    await expect(page.getByRole("note").filter({ hasText: "The style text has no BPM" })).toHaveCount(1);
  }
}

/** The lane window read from the DOM: the scroller less what is pinned over it, and one row's height. */
function laneWindow(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(".sce-editor");
    const scroller = document.querySelector<HTMLElement>(".sce-scroller");
    const top = document.querySelector<HTMLElement>(".sce-top");
    const head = document.querySelector<HTMLElement>(".sce-track-head");
    const lane = document.querySelector<HTMLElement>(".sce-lane");
    if (!root || !scroller || !top || !head || !lane) return null;
    const rows = Number(lane.style.getPropertyValue("--sce-rows"));
    if (!(rows > 0)) return null;
    const row = lane.getBoundingClientRect().height / rows;
    const pinned = root.dataset.pin === "none" ? head.offsetHeight : top.offsetHeight + head.offsetHeight;
    return { value: scroller.clientHeight - pinned, row };
  });
}

/** Whether `target` lies inside the editor root's box. */
async function insideRoot(page: Page, target: Locator) {
  const outer = await box(page.locator(".sce-editor"));
  const inner = await box(target);
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}

/** Scrolls the chrome so the conflict sentence is in view inside the root, as its own scroller lets a person do. */
async function showConflictSentence(page: Page, harness: Harness) {
  await page.locator(".sce-chrome").evaluate((element) => {
    const sentence = element.querySelector<HTMLElement>('[role="alert"]');
    if (!sentence) return;
    const frame = element.getBoundingClientRect();
    const at = sentence.getBoundingClientRect();
    element.scrollTop += at.top - frame.top - (element.clientHeight - at.height) / 2;
  });
  await harness.frames(1);
}

test.describe("C1: the music stays reachable", () => {
  for (const height of [420, 288] as const) {
    for (const state of ["editable", "read-only", "conflict", "conflict-cut-notice"] as const) {
      test(`${state} at ${height} keeps three rows and a note in reach`, async ({ page, harness, press, isMobile }) => {
        await mountState(page, harness, press, state, isMobile ? 412 : 1280);
        await harness.stageHeight(height);

        const window = await laneWindow(page);
        expect(window).not.toBeNull();
        if (!window) return;
        expect(window.value).toBeGreaterThanOrEqual(3 * window.row - 0.5);

        if (state === "conflict" || state === "conflict-cut-notice") {
          await showConflictSentence(page, harness);
          expect(await insideRoot(page, conflictSentence(page))).toBe(true);
        }

        const name = await tapFirstVisibleNote(page);
        if (state === "read-only") {
          await expect(page.getByRole("listitem", { name: /, selected$/ })).toHaveCount(0);
        } else {
          await expect(page.getByRole("listitem", { name: `${name}, selected` })).toBeVisible();
        }
      });
    }
  }
});

test.describe("C6: the pin rule", () => {
  test("pins the header only while the lane keeps six rows, in both directions", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "the phone project's width is the one the rule was measured at");
    await page.setViewportSize({ width: 412, height: 800 });
    // With the two-row toolbar 420 leaves enough lane for the pinned header; 288 does not.
    await harness.stageHeight(420);
    await harness.mount({ score: { text: QUARTERS } });
    await harness.frames(2);

    const scroller = arrangement(page);
    const ruler = page.locator(".sce-ruler").first();
    let frame = await box(scroller);
    let at = await box(ruler);
    expect(at.y).toBeCloseTo(frame.y, 0);

    await scroller.evaluate((element) => {
      element.scrollTop += 100;
    });
    await harness.frames(1);
    frame = await box(scroller);
    at = await box(ruler);
    expect(at.y).toBeCloseTo(frame.y, 0);

    await harness.stageHeight(288);
    await expect.poll(async () => (await box(ruler)).y < (await box(scroller)).y - 1).toBe(true);
    frame = await box(scroller);
    expect((await box(page.locator(".sce-track-head").first())).y).toBeCloseTo(frame.y, 0);

    await harness.stageHeight(420);
    await expect.poll(async () => Math.abs((await box(ruler)).y - (await box(scroller)).y)).toBeLessThan(1);

    await harness.stageHeight(288);
    await expect.poll(async () => (await box(ruler)).y < (await box(scroller)).y - 1).toBe(true);
  });
});

test.describe("C7: the opening scroll", () => {
  test("finds a first-track note at 288, with the header unpinned", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "the phone project's width is the one the rule was measured at");
    await page.setViewportSize({ width: 412, height: 800 });
    await harness.stageHeight(288);
    await harness.mount({ score: { text: QUARTERS } });
    await harness.frames(1);

    const name = await tapFirstVisibleNote(page);
    await expect(page.getByRole("listitem", { name: `${name}, selected` })).toBeVisible();
  });
});

test.describe("C8: keyboard focus under an unpinned header", () => {
  test("keeps the focused note inside the scroller and below the track head", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "the phone project's width is the one the rule was measured at");
    await page.setViewportSize({ width: 412, height: 800 });
    await harness.stageHeight(288);
    await harness.mount({ score: { text: QUARTERS } });
    await harness.frames(1);

    await tapFirstVisibleNote(page);
    for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowRight");
    await harness.frames(1);

    const geometry = await page.evaluate(() => {
      const focused = document.activeElement;
      const scroller = document.querySelector<HTMLElement>(".sce-scroller");
      const head = document.querySelector<HTMLElement>(".sce-track-head");
      if (!(focused instanceof HTMLElement) || !scroller || !head) return null;
      const note = focused.getBoundingClientRect();
      const frame = scroller.getBoundingClientRect();
      const pinned = head.getBoundingClientRect();
      return {
        role: focused.getAttribute("role"),
        scrollTop: scroller.scrollTop,
        noteTop: note.top,
        noteBottom: note.bottom,
        scrollerBottom: frame.bottom,
        headBottom: pinned.bottom,
      };
    });
    expect(geometry).not.toBeNull();
    if (!geometry) return;
    expect(geometry.role).toBe("listitem");
    expect(geometry.scrollTop).toBeGreaterThan(0);
    expect(geometry.noteTop).toBeGreaterThanOrEqual(geometry.headBottom - 0.5);
    expect(geometry.noteBottom).toBeLessThanOrEqual(geometry.scrollerBottom + 0.5);
  });
});

test.describe("C11: the existing guards", () => {
  test("a Chinese conflict at 288 still keeps the music reachable", async ({ page, harness, press, isMobile }) => {
    test.skip(!isMobile, "the phone project's width is the one the rule was measured at");
    await mountState(page, harness, press, "conflict-cut-notice", 412);
    await harness.update({ language: "zh" });
    await harness.stageHeight(288);

    const window = await laneWindow(page);
    expect(window).not.toBeNull();
    if (!window) return;
    expect(window.value).toBeGreaterThanOrEqual(3 * window.row - 0.5);
    await showConflictSentence(page, harness);
    expect(await insideRoot(page, conflictSentence(page))).toBe(true);

    await tapFirstVisibleNote(page);
    await expect(page.getByRole("listitem", { name: /，已选中$/ })).toHaveCount(1);
  });

  for (const width of [320, 412, 500, 1280] as const) {
    for (const language of ["en", "zh"] as const) {
      test(`keeps the view switch where it is at ${width} (${language})`, async ({
        page,
        harness,
        press,
        isMobile,
      }) => {
        test.skip(isMobile, "the width is set once, on the desktop project");
        await page.setViewportSize({ width, height: 700 });
        await harness.mount({ score: { text: BROKEN }, language });
        const names = VIEWS[language];
        const tabs = page.getByRole("group", { name: names.group });
        const staff = tabs.getByRole("button", { name: names.staff, exact: true });
        await press(tabs.getByRole("button", { name: names.text, exact: true }));
        const before = await box(staff);

        await page.getByRole("textbox").fill(QUARTERS);
        await page.getByRole("textbox").blur();
        await expect(page.locator(".sce-history")).toBeVisible();

        expect(await box(staff)).toEqual(before);
      });
    }
  }
});

/** The distinct top edges of the toolbar's visible controls: one per row of controls, whatever the font. */
function controlRows(page: Page, selector = ".sce-toolbar") {
  return page.evaluate((forSelector) => {
    const root = document.querySelector<HTMLElement>(forSelector);
    if (!root) return 0;
    const tops = new Set<number>();
    for (const control of root.querySelectorAll<HTMLElement>("button, input, select")) {
      const rect = control.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      tops.add(Math.round(rect.top));
    }
    return tops.size;
  }, selector);
}

/** Whether `target` lies inside the editor's box left and right. */
async function insideRootAcross(page: Page, target: Locator) {
  const outer = await box(page.locator(".sce-editor"));
  const inner = await box(target);
  return inner.x >= outer.x - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5;
}

const choose = (page: Page) => page.getByRole("button", { name: "Choose", exact: true });
const saveFile = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
const THEIR_SCORE = QUARTERS.replace("C4D4E4F4|G16|", "C4D4E4G4|A16|");

/** Opens a score file, deletes its D and saves into another writer's version, so its conflict banner stands. */
async function scoreFileConflict(page: Page, harness: Harness, press: (target: Locator) => Promise<void>) {
  await harness.mount({ score: { text: QUARTERS }, scoreFile: { name: "tune.abc" } });
  await expect(saveFile(page)).toBeVisible();
  await press(noteNamed(page, D4));
  await page.keyboard.press("Delete");
  await harness.externalScore(THEIR_SCORE);
  await press(saveFile(page));
  await expect(page.getByRole("group", { name: "Score file conflict", exact: true })).toBeVisible();
}

test.describe("C2: the conflict banner and its choices", () => {
  for (const width of [412, 1280] as const) {
    test(`opens one dialog under the banner, with both consequences, at ${width}`, async ({
      page,
      harness,
      press,
      isMobile,
    }) => {
      test.skip(width === 1280 && isMobile, "the desktop width is set on the desktop project");
      await mountState(page, harness, press, "conflict", width);
      await harness.stageHeight(288);

      const banner = page.getByRole("group", { name: "Draft conflict", exact: true });
      await expect(banner.getByRole("alert")).toBeVisible();
      await expect(choose(page)).toHaveAttribute("aria-expanded", "false");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".sce-part-draft-conflict")))).toBe(
        false,
      );

      await press(choose(page));

      const dialog = page.getByRole("dialog", { name: "Draft conflict", exact: true });
      await expect(dialog).toBeVisible();
      await expect(choose(page)).toHaveAttribute("aria-expanded", "true");
      const overwrite = dialog.getByRole("button", { name: "Overwrite with my version", exact: true });
      const load = dialog.getByRole("button", { name: "Load the other version", exact: true });
      await expect(overwrite).toBeVisible();
      await expect(load).toBeVisible();
      await expect(overwrite).toHaveAccessibleDescription("The other version is replaced and can't be brought back.");
      await expect(load).toHaveAccessibleDescription("It opens here, and your changes in this window are dropped.");
      expect(await insideRootAcross(page, dialog)).toBe(true);
      const root = await box(page.locator(".sce-editor"));
      if (width !== 1280)
        expect((await box(dialog)).y + (await box(dialog)).height).toBeLessThanOrEqual(root.y + root.height + 0.5);

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(choose(page)).toBeFocused();
    });
  }

  test("reveals the banner and Choose at 288 without a swipe", async ({ page, harness, press, isMobile }) => {
    test.skip(!isMobile, "the phone project's width is the one measured");
    await page.setViewportSize({ width: 412, height: 800 });
    await harness.stageHeight(288);
    await harness.mount({ score: { text: QUARTERS }, drafts: true });
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await makeConflict(page, press, QUARTERS);
    await harness.frames(2);
    const found = await page.evaluate(() => {
      const chrome = document.querySelector<HTMLElement>(".sce-chrome");
      const sentence = document.querySelector<HTMLElement>(".sce-draft-conflict-text");
      const choose = document.querySelector<HTMLElement>(".sce-draft-choose");
      if (!chrome || !sentence || !choose) return null;
      const outer = chrome.getBoundingClientRect();
      const visible = outer.top >= 0 && outer.bottom <= innerHeight + 0.5;
      const inside = (el: Element) => {
        const at = el.getBoundingClientRect();
        return at.top >= outer.top - 0.5 && at.bottom <= outer.top + chrome.clientHeight + 0.5;
      };
      return { visible, sentence: inside(sentence), choose: inside(choose) };
    });
    expect(found?.visible, "the chrome is inside the window").toBe(true);
    expect(found?.sentence, "the sentence is in the chrome's visible box").toBe(true);
    expect(found?.choose, "Choose is in the chrome's visible box").toBe(true);
  });

  test("the Chinese banner opens the same dialog and closes back to Choose", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(!isMobile, "the phone project's width is the one measured");
    await mountState(page, harness, press, "conflict", 412);
    await harness.update({ language: "zh" });
    await harness.stageHeight(288);
    const chineseBanner = page.getByRole("group", { name: "草稿冲突", exact: true });
    await press(chineseBanner.getByRole("button", { name: "选择", exact: true }));
    const dialog = page.getByRole("dialog", { name: "草稿冲突", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "用我的版本覆盖", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "载入对方的版本", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(chineseBanner.getByRole("button", { name: "选择", exact: true })).toBeFocused();
  });

  test("the score file's banner uses the same Choose and dialog", async ({ page, harness, press, isMobile }) => {
    test.skip(!isMobile, "the phone project's width is the one measured");
    await page.setViewportSize({ width: 412, height: 800 });
    await harness.stageHeight(420);
    await scoreFileConflict(page, harness, press);
    await harness.stageHeight(288);
    await expect(choose(page)).toHaveAttribute("aria-expanded", "false");
    await press(choose(page));
    const dialog = page.getByRole("dialog", { name: "Score file conflict", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Overwrite with my version", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Load the other version", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(choose(page)).toBeFocused();
  });
});

test.describe("C3: the toolbar budget", () => {
  for (const width of [412, 390, 375, 360, 320] as const) {
    test(`keeps two rows of controls at ${width}, with and without a save control`, async ({
      page,
      harness,
      isMobile,
    }) => {
      test.skip(!isMobile, "the phone project is the coarse-pointer width");
      await page.setViewportSize({ width, height: 800 });
      for (const language of ["en", "zh"] as const) {
        await harness.mount({ score: { text: QUARTERS }, drafts: true, language });
        const plain = await box(page.locator(".sce-toolbar"));
        expect(await controlRows(page), `${width} ${language}: two rows of controls`).toBeLessThanOrEqual(2);
        await harness.destroy();

        await harness.mount({ score: { text: QUARTERS }, scoreFile: { name: "tune.abc" }, language });
        const withSave = await box(page.locator(".sce-toolbar"));
        expect(await controlRows(page), `${width} ${language}: Save adds no row`).toBeLessThanOrEqual(2);
        expect(withSave.height, `${width} ${language}: the toolbar is as tall with a file as without`).toBeCloseTo(
          plain.height,
          0,
        );
        await harness.destroy();
      }
    });
  }

  test("is one row on the desktop, and two at 1024 and 800", async ({ page, harness, isMobile }) => {
    test.skip(isMobile, "the widths are set on the desktop project");
    for (const width of [1280, 1024, 800]) {
      await page.setViewportSize({ width, height: 700 });
      for (const language of ["en", "zh"] as const) {
        await harness.mount({ score: { text: QUARTERS }, drafts: true, language });
        await expect(page.locator(".sce-undo")).toBeVisible();
        expect(await controlRows(page), `${width} ${language}: rows of controls`).toBeLessThanOrEqual(
          width === 1280 ? 1 : 2,
        );
        const strip = await box(page.locator(".sce-tools"));
        const bar = await box(page.locator(".sce-bar"));
        if (width === 1280) expect(strip.y).toBeCloseTo(bar.y, 0);
        await harness.destroy();
      }
    }
  });
});

test.describe("C4: the bar is in view at rest", () => {
  for (const editable of [true, false]) {
    test(`holds the switch, the preview and the whole caption, ${editable ? "editable" : "read-only"}`, async ({
      page,
      harness,
      isMobile,
    }) => {
      test.skip(isMobile, "the widths are set on the desktop project");
      for (const width of [412, 360, 320, 260, 190]) {
        await page.setViewportSize({ width, height: 700 });
        await harness.mount({ score: { text: QUARTERS }, editable });
        const bar = page.locator(".sce-bar");
        const views = bar.getByRole("group", { name: "View" });
        await expect(views).toBeVisible();
        expect(await insideRootAcross(page, views), `${width}: the view switch is inside the root`).toBe(true);
        for (const name of ["Arrangement", "Staff", "Score text"]) {
          expect(
            await insideRootAcross(page, views.getByRole("button", { name, exact: true })),
            `${width}: ${name}`,
          ).toBe(true);
        }
        const preview = bar.getByRole("button", { name: /Preview|Stop/ });
        const words = bar.locator(".sce-synth-caption");
        expect(await insideRootAcross(page, preview), `${width}: the preview button`).toBe(true);
        expect(await insideRootAcross(page, words), `${width}: the caption`).toBe(true);
        expect((await box(words)).width, `${width}: the caption is not a sliver`).toBeGreaterThanOrEqual(60);
        await harness.destroy();
      }
    });
  }

  test("keeps Save inside the bar at 412 and 320", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "the phone project is the coarse-pointer width");
    for (const width of [412, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await harness.mount({ score: { text: QUARTERS }, scoreFile: { name: "tune.abc" } });
      await expect(saveFile(page)).toBeVisible();
      expect(await insideRootAcross(page, saveFile(page)), `${width}: Save is inside the root`).toBe(true);
      const bar = page.locator(".sce-bar");
      expect(await bar.getByRole("button", { name: "Save", exact: true }).count()).toBe(1);
      await harness.destroy();
    }
  });
});

test.describe("C5: the strip scrolls and the rest stays reachable", () => {
  test("a swipe moves the strip, Tab reaches the tempo field, and the Project panel opens inside the window", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "a finger is the phone project's");
    await page.setViewportSize({ width: 412, height: 800 });
    await harness.mount({ score: { text: QUARTERS }, drafts: true });
    const strip = page.locator(".sce-tools");
    const at = await box(strip);
    await harness.swipe(
      { x: at.x + at.width - 20, y: at.y + at.height / 2 },
      { x: at.x + 20, y: at.y + at.height / 2 },
    );
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Select", exact: true }).focus();
    for (let step = 0; step < 20; step++) {
      const label = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
      if (label === "Tempo (BPM)") break;
      await page.keyboard.press("Tab");
    }
    const tempo = page.getByRole("spinbutton", { name: "Tempo (BPM)" });
    expect(await insideRootAcross(page, tempo)).toBe(true);

    for (const button of await strip.locator("button:visible").all()) {
      await button.focus();
      expect(await insideRootAcross(page, button)).toBe(true);
    }

    await page.getByRole("button", { name: /^Project/, exact: false }).click();
    const panel = page.getByRole("dialog", { name: "Project", exact: true });
    await expect(panel).toBeVisible();
    const opened = await box(panel);
    expect(opened.x).toBeGreaterThanOrEqual(0);
    expect(opened.x + opened.width).toBeLessThanOrEqual(412);
    expect(opened.y + opened.height).toBeLessThanOrEqual(800);
  });
});

test.describe("C9: the Tab order", () => {
  test("walks the strip's editing and song controls, then the bar's switch and preview", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "keys are checked on the desktop project");
    await page.setViewportSize({ width: 1280, height: 800 });
    await harness.mount({ score: { text: QUARTERS }, drafts: true });
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).focus();
    const walked: string[] = [];
    for (let step = 0; step < 20; step++) {
      walked.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return "";
          const named = el.getAttribute("aria-label");
          if (named) return named;
          if (el instanceof HTMLSelectElement)
            return el.closest("label")?.querySelector(".sce-key-label")?.textContent ?? "";
          const word = el.querySelector(".sce-project-word");
          if (word) return word.textContent ?? "";
          return el.textContent?.trim() ?? "";
        }),
      );
      await page.keyboard.press("Tab");
    }
    expect(walked.slice(0, 20)).toEqual([
      "Undo",
      "Redo",
      "Delete",
      "Draw notes",
      "Select",
      "Grid: 1/4",
      "Bars",
      "Meter 4/4",
      "Restore original",
      "Tempo (BPM)",
      "Key",
      "Transpose down a semitone",
      "Transpose up a semitone",
      "Project",
      "Tools",
      "Filter",
      "Arrangement",
      "Staff",
      "Score text",
      "Preview",
    ]);
  });
});

test.describe("C10: the desktop banner", () => {
  test("keeps the sentence and Choose on one line, and the toolbar one row", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(isMobile, "the desktop width is the one measured");
    await page.setViewportSize({ width: 1280, height: 700 });
    await harness.stageHeight(420);
    await harness.mount({ score: { text: QUARTERS }, drafts: true });
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await makeConflict(page, press, QUARTERS);
    const banner = page.getByRole("group", { name: "Draft conflict", exact: true });
    const sentence = await box(banner.getByRole("alert"));
    const chooseAt = await box(choose(page));
    expect(Math.abs(sentence.y + sentence.height / 2 - (chooseAt.y + chooseAt.height / 2))).toBeLessThan(6);
    expect(sentence.x + sentence.width).toBeLessThanOrEqual(chooseAt.x + 1);
    expect(await controlRows(page)).toBe(1);
    expect((await box(banner)).height).toBeLessThanOrEqual((await box(choose(page))).height * 2);
  });
});

test.describe("the edge cues", () => {
  test("the chrome fades at the edge that has more, and stops when it has none", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(!isMobile, "the phone project's width is the one measured");
    await mountState(page, harness, press, "conflict-cut-notice", 412);
    await page.setViewportSize({ width: 320, height: 800 });
    await harness.stageHeight(288);
    const chrome = page.locator(".sce-chrome");
    const cue = () => chrome.getAttribute("data-cue");
    expect(await chrome.evaluate((el) => el.scrollHeight > el.clientHeight), "the chrome clips content").toBe(true);
    expect(await cue()).toBe("down");

    await chrome.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await harness.frames(1);
    expect(await cue()).toBe("up");

    await chrome.evaluate((el) => {
      el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2);
    });
    await harness.frames(1);
    expect(await cue()).toBe("both");

    await harness.stageHeight(900);
    await expect.poll(cue).toBeNull();
  });

  test("the strip fades at the side that has more, and stops at its end", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "the phone project's width is the one measured");
    await page.setViewportSize({ width: 412, height: 800 });
    await harness.mount({ score: { text: QUARTERS }, drafts: true });
    const strip = page.locator(".sce-tools");
    const cue = () => strip.getAttribute("data-cue");
    expect(await cue()).toBe("right");

    await strip.evaluate((el) => {
      el.scrollLeft = Math.round((el.scrollWidth - el.clientWidth) / 2);
    });
    await harness.frames(1);
    expect(await cue()).toBe("both");

    await strip.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await harness.frames(1);
    expect(await cue()).toBe("left");
  });
});

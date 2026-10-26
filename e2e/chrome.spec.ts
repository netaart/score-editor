// ABOUTME: Seam 5 for the chrome floor and the pin rule: the music keeps at least three rows, and the header pins only while it can keep six.
// ABOUTME: It drives the mounted editor at a phone's and a desktop's width, in every chrome state the design measured, and taps through the DOM.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, tapFirstVisibleNote, test, vocalOnly } from "./fixtures";

/** Four quarter notes in C, then a whole note: the score most cases use. */
const QUARTERS = vocalOnly("C4D4E4F4|G16|");

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
    () =>
      (window as unknown as PageWithStore).harness.drafts.calls().filter((call) => call.method === "write").length,
  );

const fileOf = (page: Page, key: string) =>
  page.evaluate((name) => (window as unknown as PageWithStore).harness.drafts.file(name), key);

const external = (page: Page, key: string, text: string) =>
  page.evaluate(
    ([name, body]) =>
      (window as unknown as PageWithStore).harness.drafts.external(name as string, body as string),
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

test.describe("C1: the music stays reachable", () => {
  for (const height of [420, 288] as const) {
    for (const state of ["editable", "read-only", "conflict", "conflict-cut-notice"] as const) {
      test(`${state} at ${height} keeps three rows and a note in reach`, async ({
        page,
        harness,
        press,
        isMobile,
      }) => {
        await mountState(page, harness, press, state, isMobile ? 412 : 1280);
        await harness.stageHeight(height);

        const window = await laneWindow(page);
        expect(window).not.toBeNull();
        if (!window) return;
        expect(window.value).toBeGreaterThanOrEqual(3 * window.row - 0.5);

        if (state === "conflict" || state === "conflict-cut-notice") {
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
  test("pins the header at 420 and lets it scroll away at 288, in both directions", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "the phone project's width is the one the rule was measured at");
    await page.setViewportSize({ width: 412, height: 800 });
    await harness.mount({ score: { text: QUARTERS } });
    await harness.stageHeight(420);
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
    await expect
      .poll(async () => (await box(ruler)).y < (await box(scroller)).y - 1)
      .toBe(true);
    frame = await box(scroller);
    expect((await box(page.locator(".sce-track-head").first())).y).toBeCloseTo(frame.y, 0);

    await harness.stageHeight(420);
    await expect
      .poll(async () => Math.abs((await box(ruler)).y - (await box(scroller)).y))
      .toBeLessThan(1);

    await harness.stageHeight(288);
    await expect
      .poll(async () => (await box(ruler)).y < (await box(scroller)).y - 1)
      .toBe(true);
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
    expect(await insideRoot(page, conflictSentence(page))).toBe(true);

    await tapFirstVisibleNote(page);
    await expect(page.getByRole("listitem", { name: /，已选中$/ })).toHaveCount(1);
  });
});

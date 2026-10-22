// ABOUTME: Seam 5 for the view parts: several parts mounted on one editing session, each on its own element of a layout the page builds.
// ABOUTME: Covers drawing, dispatch, replacement, zoom and scroll shared through the session, style isolation, and what destroy leaves.
import type { CDPSession, Locator, Page } from "@playwright/test";
import { box, expect, type Harness, test, vocalOnly } from "./fixtures";

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);
/** The one element a part drew into its slot. */
const partRoot = (page: Page, name: string) => slot(page, name).locator(":scope > *");

/** Whatever a part draws for the score: its root without the empty live region every axis part keeps for what it says. */
const drawnContent = (page: Page, name: string) => partRoot(page, name).locator('*:not([role="status"])');

/** The roots as drawn, with what the parts say in their live regions taken out. */
const unsaid = (roots: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(roots).map(([name, html]) => [
      name,
      html.replace(/(role="status" aria-live="polite">)[^<]*/g, "$1"),
    ]),
  );

/** What a part on the time axis calls itself when it is a scroll surface of its own. */
const REGION_NAMES: Record<string, string> = { ruler: "Time ruler", chords: "Chords", vocal: "Vocal", ins: "Ins" };
function scrollSurface(page: Page, name: string): Locator {
  const label = REGION_NAMES[name];
  if (!label) throw new Error(`${name} is not a part on the time axis`);
  return slot(page, name).getByRole("region", { name: label, exact: true });
}

const readout = (page: Page, value: string) =>
  slot(page, "zoom").getByRole("button", { name: `Zoom ${value}`, exact: true });
const zoomButton = (page: Page, name: "Zoom in" | "Zoom out") =>
  slot(page, "zoom").getByRole("button", { name, exact: true });
const bars = (page: Page) => slot(page, "ruler").getByRole("list", { name: "Bars" });
const chordItems = (page: Page) => slot(page, "chords").getByRole("list", { name: "Chords" }).getByRole("listitem");

// Notes of compact-three-sections, read off its score text: 2/4 bars at 40 pixels a beat are 80 pixels wide at 100%.
const INS_BAR_1 = "F4, bar 1 beat 1, length 0.5 beats";
const INS_BAR_2 = "F4, bar 2 beat 1, length 0.5 beats";
const VOCAL_BAR_5 = "C5, bar 5 beat 1, length 1 beat";
const VOCAL_BAR_6 = "G5, bar 6 beat 1, length 1 beat";

/** How many pixels one bar takes on each part that draws bars: the same on every part at one zoom. */
async function pixelsPerBar(page: Page): Promise<Record<string, number>> {
  const distance = async (first: Locator, second: Locator) => (await box(second)).x - (await box(first)).x;
  const note = (name: string, part: string) => slot(page, part).getByRole("listitem", { name, exact: true });
  return {
    ruler: await distance(bars(page).getByText("1", { exact: true }), bars(page).getByText("2", { exact: true })),
    chords: await distance(chordItems(page).nth(0), chordItems(page).nth(1)),
    vocal: await distance(note(VOCAL_BAR_5, "vocal"), note(VOCAL_BAR_6, "vocal")),
    ins: await distance(note(INS_BAR_1, "ins"), note(INS_BAR_2, "ins")),
  };
}
const evenly = (pixels: number) => ({ ruler: pixels, chords: pixels, vocal: pixels, ins: pixels });

const scrollLeftOf = (page: Page, name: string) => scrollSurface(page, name).evaluate((el) => el.scrollLeft);
const maxScrollOf = (page: Page, name: string) =>
  scrollSurface(page, name).evaluate((el) => el.scrollWidth - el.clientWidth);

/**
 * Every part draws what a part mounted fresh on the same state would draw. Returns what they drew. A fresh session has
 * no history, so while the live one has some its toolbar enables undo and the fresh one does not: `withHistory` leaves
 * the toolbar out of the comparison, and only then.
 */
async function expectDrawnLikeFresh(harness: Harness, { withHistory = false } = {}) {
  const drawn = await harness.layout.roots();
  const fresh = await harness.layout.freshRoots();
  if (withHistory) {
    delete drawn.toolbar;
    delete fresh.toolbar;
  }
  expect(drawn).toEqual(fresh);
  return drawn;
}

/** Scrolls a part sideways as a user does: a turn of the horizontal wheel with a mouse, a swipe on a touch screen. */
async function scrollSideways(harness: Harness, target: Locator, pixels: number, touch: boolean) {
  await target.scrollIntoViewIfNeeded();
  const area = await box(target);
  const at = { x: area.x + area.width / 2, y: area.y + Math.min(area.height / 2, 30) };
  if (touch) {
    await harness.swipe({ x: at.x + pixels / 2, y: at.y }, { x: at.x - pixels / 2, y: at.y });
  } else {
    await harness.page.mouse.move(at.x, at.y);
    await harness.page.mouse.wheel(pixels, 0);
  }
}

/** Waits until every named part has the offset the session holds, and returns it. */
async function expectInStep(page: Page, harness: Harness, names: string[]) {
  await expect
    .poll(async () => {
      const { scrollLeft } = await harness.layout.view();
      const offsets = await Promise.all(names.map((name) => scrollLeftOf(page, name)));
      return Math.max(...offsets.map((offset) => Math.abs(offset - scrollLeft)));
    })
    .toBeLessThan(1.5);
  return (await harness.layout.view()).scrollLeft;
}

/** Presses Tab until `target` has the focus, as a keyboard user gets to a part. */
async function tabTo(page: Page, target: Locator, limit = 12) {
  for (let presses = 0; presses < limit; presses++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === el.ownerDocument.activeElement)) return;
  }
  throw new Error(`Tab did not reach the part in ${limit} presses`);
}

test.describe("a layout of view parts on one session", () => {
  test("each part draws what the session holds, on its own element of a layout the page built", async ({
    page,
    harness,
    partNames,
  }) => {
    await harness.layout.open();
    await expect(bars(page).getByRole("listitem")).toHaveCount(28);
    await expect(bars(page).getByRole("listitem").first()).toHaveText("1");
    await expect(bars(page).getByRole("listitem").last()).toHaveText("28");
    await expect(slot(page, "ruler").getByRole("list", { name: "Sections" }).getByRole("listitem")).toHaveText([
      "intro",
      "verse",
      "chorus",
    ]);
    await expect(chordItems(page)).toHaveCount(28);
    await expect(slot(page, "vocal").getByRole("list", { name: "Vocal" })).toBeVisible();
    await expect(slot(page, "vocal").getByRole("listitem", { name: VOCAL_BAR_5, exact: true })).toBeVisible();
    await expect(slot(page, "vocal").getByRole("listitem", { name: INS_BAR_1, exact: true })).toHaveCount(0);
    await expect(slot(page, "ins").getByRole("listitem", { name: INS_BAR_1, exact: true })).toBeVisible();
    await expect(slot(page, "ins").getByRole("listitem", { name: VOCAL_BAR_5, exact: true })).toHaveCount(0);
    await expect(readout(page, "100%")).toBeVisible();
    await expect(slot(page, "notice").getByRole("note")).toBeHidden();
    await expect(slot(page, "problem").getByRole("alert")).toHaveCount(0);

    // The layout is the page's: each part is as wide as the card the page put it in, and the song runs on past it.
    for (const name of partNames.axis) {
      const frame = await scrollSurface(page, name).evaluate((el) => ({
        shown: el.clientWidth,
        content: el.scrollWidth,
        card: (el.parentElement?.parentElement as HTMLElement).clientWidth,
      }));
      expect(frame.shown, `${name} fills its card`).toBe(frame.card);
      expect(frame.content, `${name} is wider than its card`).toBeGreaterThan(frame.card);
    }
    expect(await pixelsPerBar(page)).toEqual(evenly(80));
  });

  test("a part mounts on any element: each part's root is one block and a stacking context of its own", async ({
    page,
    harness,
    partNames,
  }) => {
    await harness.layout.open();
    for (const name of partNames.all) {
      const root = partRoot(page, name);
      await expect(root, `${name} has one root`).toHaveCount(1);
      await expect(root, `${name} is a block`).toHaveCSS("display", "block");
      await expect(root, `${name} is isolated`).toHaveCSS("isolation", "isolate");
    }
  });

  test("a command dispatched through the session changes the track it is for, and every part still draws what a fresh one would", async ({
    page,
    harness,
  }) => {
    await harness.layout.open();
    const vocalNotes = slot(page, "vocal").getByRole("listitem");
    const insNotes = slot(page, "ins").getByRole("listitem");
    const before = { vocal: await vocalNotes.count(), ins: await insNotes.count() };
    const drawnBefore = await expectDrawnLikeFresh(harness);

    // toRest is the one command the headless layer has, and it changes one voice.
    const done = await harness.layout.dispatch({ type: "toRest", noteId: await harness.layout.firstVocalNoteId() });
    expect(done.ok).toBe(true);
    await expect(vocalNotes).toHaveCount(before.vocal - 1);
    await expect(slot(page, "vocal").getByRole("listitem", { name: VOCAL_BAR_5, exact: true })).toHaveCount(0);
    expect(await insNotes.count()).toBe(before.ins);
    const drawnAfter = await expectDrawnLikeFresh(harness, { withHistory: true });
    expect(drawnAfter.vocal, "Vocal changed").not.toBe(drawnBefore.vocal);
    for (const name of ["zoom", "notice", "ruler", "chords", "ins", "problem"]) {
      expect(drawnAfter[name], `${name} is not touched by a change to Vocal`).toBe(drawnBefore[name]);
    }

    expect(await harness.layout.undo()).toBe(true);
    await expect(vocalNotes).toHaveCount(before.vocal);
    await expect(slot(page, "vocal").getByRole("listitem", { name: VOCAL_BAR_5, exact: true })).toBeVisible();
    const undone = await harness.layout.roots();
    // The undo is said in the live region ("Restored ..."); what a part says is not what it draws.
    expect(unsaid({ ...undone, toolbar: "" })).toEqual(unsaid({ ...drawnBefore, toolbar: "" }));
    expect(undone.toolbar, "redo is there to press now").not.toBe(drawnBefore.toolbar);
    expect(await harness.layout.redo()).toBe(true);
    await expect(vocalNotes).toHaveCount(before.vocal - 1);
  });

  test("a refused command changes no part and returns its diagnostic", async ({ harness }) => {
    await harness.layout.open();
    const drawn = await harness.layout.roots();
    const done = await harness.layout.dispatch({ type: "toRest", noteId: "no-such-note" });
    expect(done.ok).toBe(false);
    expect(done.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["note-not-found"]);
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.roots()).toEqual(drawn);
  });

  test("replacing the project from outside redraws every part, and the zoom the user chose stays", async ({
    page,
    harness,
    partNames,
    press,
  }) => {
    await harness.layout.open();
    await press(zoomButton(page, "Zoom in"));
    await expect(readout(page, "150%")).toBeVisible();

    await harness.layout.replace({ score: { vector: "truncate-partial-measure" } });
    await expect(slot(page, "notice").getByRole("note")).toHaveText(
      "This score is cut off: bar 1 of Vocal is incomplete.",
    );
    await expect(slot(page, "vocal").getByRole("list", { name: "Vocal" })).toBeVisible();
    await expect(slot(page, "ins").getByRole("list")).toHaveCount(0);
    await expect(slot(page, "chords").getByRole("list", { name: "Chords" })).toHaveCount(0);
    await expectDrawnLikeFresh(harness);
    expect((await harness.layout.view()).zoom).toBe(1.5);

    await harness.layout.replace({ score: { vector: "reject-duration-five" } });
    await expect(slot(page, "problem").getByRole("alert")).toContainText(
      "This score can't be shown because it can't be read.",
    );
    await expect(slot(page, "zoom").getByRole("group", { name: "Zoom" })).toBeHidden();
    await expect(slot(page, "notice").getByRole("note")).toBeHidden();
    for (const name of partNames.axis) await expect(drawnContent(page, name)).toHaveCount(0);

    await harness.layout.replace({ score: { sample: "compact-three-sections" } });
    await expect(slot(page, "problem").getByRole("alert")).toHaveCount(0);
    await expect(readout(page, "150%")).toBeVisible();
    await expectDrawnLikeFresh(harness);
    expect(await pixelsPerBar(page)).toEqual(evenly(120));
  });

  test("a model with no dialect gets the one sentence from the problem part and nothing else draws", async ({
    page,
    harness,
    partNames,
  }) => {
    await harness.layout.open({ project: { modelId: "other-model" } });
    await expect(slot(page, "problem").getByRole("alert")).toHaveText(
      "The score format of “other-model” isn't supported by this editor, so the score can't be shown.",
    );
    for (const name of partNames.axis) await expect(drawnContent(page, name)).toHaveCount(0);
    expect(await harness.layout.dispatch({ type: "toRest", noteId: "x" })).toMatchObject({
      ok: false,
      diagnostics: [{ code: "no-dialect" }],
    });
  });

  test("a score with no Ins voice leaves the Ins track empty, and a part mounted for it later draws it", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score: { sample: "vocal-only-melody" }, parts: ["ruler", "vocal"] });
    await expect(slot(page, "vocal").getByRole("list", { name: "Vocal" })).toBeVisible();
    await harness.layout.mountPart("ins");
    await expect(slot(page, "ins").getByRole("list")).toHaveCount(0);
    await harness.layout.replace({ score: { sample: "compact-three-sections" } });
    await expect(slot(page, "ins").getByRole("list", { name: "Ins" })).toBeVisible();
  });
});

test.describe("the time axis parts as scroll surfaces", () => {
  test("a part drawn alone is a named region that a keyboard reaches, and it is not one when it draws nothing", async ({
    page,
    harness,
    partNames,
  }) => {
    await harness.layout.open();
    for (const name of partNames.axis) await expect(scrollSurface(page, name), name).toHaveAttribute("tabindex", "0");
    await harness.layout.replace({ score: { vector: "reject-duration-five" } });
    for (const name of partNames.axis) {
      await expect(slot(page, name).getByRole("region")).toHaveCount(0);
      await expect(partRoot(page, name)).not.toHaveAttribute("tabindex", /.*/);
    }
  });

  test("the ruler and the chord track hide their own scrollbar and a track keeps it", async ({ page, harness }) => {
    await harness.layout.open();
    await expect(scrollSurface(page, "ruler")).toHaveCSS("scrollbar-width", "none");
    await expect(scrollSurface(page, "chords")).toHaveCSS("scrollbar-width", "none");
    await expect(scrollSurface(page, "vocal")).toHaveCSS("scrollbar-width", "auto");
    await expect(scrollSurface(page, "ins")).toHaveCSS("scrollbar-width", "auto");
  });
});

test.describe("zoom shared through the session", () => {
  test("the zoom part moves every track, the ruler and the chords: by button, by menu, and by fitting the song", async ({
    page,
    harness,
    partNames,
    press,
  }) => {
    await harness.layout.open();
    await expect(readout(page, "100%")).toBeVisible();

    await press(zoomButton(page, "Zoom in"));
    await expect(readout(page, "150%")).toBeVisible();
    expect(await pixelsPerBar(page)).toEqual(evenly(120));

    await press(zoomButton(page, "Zoom out"));
    await press(zoomButton(page, "Zoom out"));
    await expect(readout(page, "50%")).toBeVisible();
    expect(await pixelsPerBar(page)).toEqual(evenly(40));

    await press(readout(page, "50%"));
    await press(page.getByRole("menuitemradio", { name: "200%" }));
    await expect(readout(page, "200%")).toBeVisible();
    expect(await pixelsPerBar(page)).toEqual(evenly(160));

    await press(readout(page, "200%"));
    await press(page.getByRole("menuitem", { name: "Fit whole song" }));
    const fitted = await harness.layout.view();
    expect(fitted.zoom).toBeLessThan(1);
    expect(fitted.scrollLeft).toBe(0);
    for (const name of partNames.axis.filter((part) => part !== "vocal")) {
      const widths = await scrollSurface(page, name).evaluate((el) => ({
        shown: el.clientWidth,
        content: el.scrollWidth,
      }));
      expect(widths.content, `${name} shows the whole song`).toBeLessThanOrEqual(widths.shown);
    }
  });

  test("the zoom readout follows a zoom made from the session, and the part draws for it when mounted late", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ parts: ["zoom", "ruler"] });
    await harness.layout.setView({ zoom: 2 });
    await expect(readout(page, "200%")).toBeVisible();
    await harness.layout.mountPart("chords", "ins");
    await expectDrawnLikeFresh(harness);
    const first = await box(bars(page).getByText("1", { exact: true }));
    expect((await box(bars(page).getByText("2", { exact: true }))).x - first.x).toBe(160);
    expect((await box(chordItems(page).nth(1))).x - (await box(chordItems(page).nth(0))).x).toBe(160);
  });

  for (const scene of [undefined, "indented-track"] as const) {
    test(`control and the wheel on a track zoom every part around the pointer${scene ? `, in a layout with ${scene}` : ""}`, async ({
      page,
      harness,
      isMobile,
    }) => {
      test.skip(isMobile, "the wheel is a mouse gesture, checked on the desktop project");
      await harness.layout.open({ scene });
      const bar3 = bars(page).getByText("3", { exact: true });
      const insNote = slot(page, "ins").getByRole("listitem", {
        name: "F4, bar 3 beat 1, length 0.5 beats",
        exact: true,
      });
      await scrollSurface(page, "ins").scrollIntoViewIfNeeded();
      const [barBefore, noteBefore] = [await box(bar3), await box(insNote)];
      await page.mouse.move(noteBefore.x + 2, noteBefore.y + noteBefore.height / 2);
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -100);
      await page.keyboard.up("Control");
      await expect(slot(page, "zoom").getByRole("button", { name: /^Zoom (?!100%)\d+%$/ })).toBeVisible();
      const pitches = await pixelsPerBar(page);
      expect(pitches.ruler).toBeGreaterThan(90);
      expect(new Set(Object.values(pitches).map((pitch) => Math.round(pitch))).size).toBe(1);
      // The instant under the pointer stays where it was on the track that took the wheel, and on the ruler with it,
      // wherever the track sits in the page.
      expect(Math.abs((await box(insNote)).x - noteBefore.x)).toBeLessThan(2);
      expect(Math.abs((await box(bar3)).x - barBefore.x)).toBeLessThan(2);
    });
  }

  test("the plus and minus keys zoom once from a track that Tab reached, even though the page also takes keys", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "the keyboard is checked on the desktop project");
    await harness.layout.open();
    const vocal = scrollSurface(page, "vocal");
    await tabTo(page, vocal);
    await expect(vocal).toBeFocused();
    await page.keyboard.press("+");
    await expect(readout(page, "150%")).toBeVisible();
    await page.keyboard.press("-");
    await page.keyboard.press("-");
    await expect(readout(page, "50%")).toBeVisible();
    expect(await pixelsPerBar(page)).toEqual(evenly(40));
  });

  test("the plus key zooms around the middle of the track that has the focus, not of the first part", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "the keyboard is checked on the desktop project");
    // The x on the page that a step left where it was: the point of the ruler where a bar was and still is.
    const pivotAfterPlus = async (name: string) => {
      await harness.layout.open();
      await tabTo(page, scrollSurface(page, name));
      const label = (bar: string) => box(bars(page).getByText(bar, { exact: true }));
      const [first, second] = [await label("1"), await label("2")];
      await page.keyboard.press("+");
      await expect(readout(page, "150%")).toBeVisible();
      const [movedFirst, movedSecond] = [await label("1"), await label("2")];
      const bar = (movedFirst.x - first.x) / (second.x - first.x - (movedSecond.x - movedFirst.x));
      await harness.layout.close();
      return first.x + bar * (second.x - first.x);
    };
    const onRuler = await pivotAfterPlus("ruler");
    const onVocal = await pivotAfterPlus("vocal");
    // The ruler's card is 140 pixels wider than the Vocal track's, so the middle of the one is 70 pixels right of the other.
    expect(Math.abs(onRuler - onVocal - 70)).toBeLessThan(3);
  });

  test("a part destroyed on its own leaves the others on the same time axis, and the zoom still anchors on what remains", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await harness.layout.open();
    await harness.layout.destroyPart("ruler");
    await expect(slot(page, "ruler").locator("*")).toHaveCount(0);
    await press(zoomButton(page, "Zoom in"));
    await expect(readout(page, "150%")).toBeVisible();
    expect((await box(chordItems(page).nth(1))).x - (await box(chordItems(page).nth(0))).x).toBe(120);
    expect(await maxScrollOf(page, "ins")).toBeGreaterThan(0);

    await scrollSideways(harness, scrollSurface(page, "chords"), 200, isMobile);
    await expect.poll(() => scrollLeftOf(page, "chords")).toBeGreaterThan(80);
    await expectInStep(page, harness, ["chords", "vocal", "ins"]);
    await press(readout(page, "150%"));
    await press(page.getByRole("menuitem", { name: "Fit whole song" }));
    await expect.poll(() => scrollLeftOf(page, "ins")).toBe(0);
  });
});

test.describe("scroll shared through the session", () => {
  test("a user's scroll on any one part scrolls every other part with it", async ({
    page,
    harness,
    partNames,
    isMobile,
  }) => {
    await harness.layout.open();
    let offset = 0;
    for (const name of ["ruler", "ins"]) {
      await scrollSideways(harness, scrollSurface(page, name), 200, isMobile);
      await expect
        .poll(() => scrollLeftOf(page, name), { message: `${name} was scrolled` })
        .toBeGreaterThan(offset + 80);
      const reached = await expectInStep(page, harness, partNames.axis);
      expect(reached).toBeGreaterThan(offset + 80);
      offset = reached;
    }
  });

  test("the session's scroll offset moves every part, and parts of different widths each stop at their own end", async ({
    page,
    harness,
    partNames,
  }) => {
    await harness.layout.open();
    await harness.layout.setView({ scrollLeft: 150 });
    for (const name of partNames.axis) await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBe(150);

    await harness.layout.setView({ scrollLeft: 100000 });
    for (const name of partNames.axis) {
      const end = await maxScrollOf(page, name);
      expect(end, `${name} can scroll`).toBeGreaterThan(150);
      await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBeCloseTo(end, 0);
    }
    await harness.frames();
    expect((await harness.layout.view()).scrollLeft).toBe(100000);

    await harness.layout.setView({ scrollLeft: 0 });
    for (const name of partNames.axis) await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBe(0);
  });

  test("a part mounted after the user scrolled and zoomed starts where the others are", async ({ page, harness }) => {
    await harness.layout.open({ parts: ["ruler"] });
    await harness.layout.setView({ zoom: 1.5, scrollLeft: 300 });
    await expect.poll(() => scrollLeftOf(page, "ruler")).toBe(300);
    await harness.layout.mountPart("ins", "chords");
    for (const name of ["ins", "chords"])
      await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBe(300);
    expect((await box(chordItems(page).nth(1))).x - (await box(chordItems(page).nth(0))).x).toBe(120);
  });
});

test.describe("interface language", () => {
  test("switching the session's language changes every part, and back", async ({ page, harness, partNames }) => {
    await harness.layout.open({ score: { vector: "truncate-partial-measure" } });
    await expect(readout(page, "100%")).toBeVisible();
    await harness.layout.setView({ language: "zh" });
    await expect(slot(page, "zoom").getByRole("button", { name: "缩放 100%", exact: true })).toBeVisible();
    await expect(slot(page, "zoom").getByRole("button", { name: "放大", exact: true })).toBeVisible();
    await expect(slot(page, "notice").getByRole("note")).toHaveText("这份乐谱在末尾被截断：Vocal 的第 1 小节不完整。");
    await expect(slot(page, "ruler").getByRole("list", { name: "小节" })).toBeVisible();
    await expect(slot(page, "ruler").getByRole("list", { name: "标记" })).toBeVisible();
    await expect(slot(page, "ruler").getByRole("region", { name: "时间尺" })).toBeVisible();
    await expect(slot(page, "vocal").getByRole("listitem").first()).toHaveAccessibleName(/第 1 小节第 1 拍/);
    for (const name of partNames.all) await expect(partRoot(page, name), name).toHaveAttribute("lang", "zh");
    await expectDrawnLikeFresh(harness);

    await harness.layout.setView({ language: "en" });
    await expect(readout(page, "100%")).toBeVisible();
    await expect(slot(page, "notice").getByRole("note")).toHaveText(
      "This score is cut off: bar 1 of Vocal is incomplete.",
    );
    await expect(bars(page)).toBeVisible();
    for (const name of partNames.all) await expect(partRoot(page, name), name).toHaveAttribute("lang", "en");
  });

  test("the problem part speaks the session's language", async ({ page, harness }) => {
    await harness.layout.open({ score: { vector: "reject-duration-five" }, language: "zh" });
    await expect(slot(page, "problem").getByRole("alert")).toContainText("这份乐谱读不通，所以无法显示。");
    await harness.layout.setView({ language: "en" });
    await expect(slot(page, "problem").getByRole("alert")).toContainText(
      "This score can't be shown because it can't be read.",
    );
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

/** What the page holds before any part is mounted on it, and a check that the same is left after they are gone. */
async function leakBaseline(page: Page, harness: Harness) {
  const cdp = await page.context().newCDPSession(page);
  const listeners = listenerCounter(cdp);
  const globals = await listeners.onGlobals();
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const sheets = (await harness.layout.sheets()).document;
  return {
    listeners,
    sheets,
    async expectRestored() {
      expect(await listeners.onGlobals(), "listeners on the page").toEqual(globals);
      expect(await page.evaluate(() => document.documentElement.outerHTML), "nodes in the page").toBe(html);
      expect((await harness.layout.sheets()).document, "style sheets in the page").toBe(sheets);
    },
    detach: () => cdp.detach(),
  };
}

test.describe("destroying parts", () => {
  test("each part, destroyed on its own, leaves no node and no listener and does not answer the session any more", async ({
    page,
    harness,
    partNames,
  }) => {
    const baseline = await leakBaseline(page, harness);

    for (const name of partNames.all) {
      await harness.layout.open();
      expect((await harness.layout.sheets()).document, "the parts share one style sheet").toBe(baseline.sheets + 1);
      await harness.layout.retain(name);
      // Parts with something to press, scroll or zoom with have listeners; the two that only draw have none to leave.
      if (!["notice", "problem"].includes(name))
        expect(await baseline.listeners.onRetained(), `${name} has listeners`).toBeGreaterThan(0);

      await harness.layout.destroyPart(name, 2);
      expect(await baseline.listeners.onRetained(), `${name} leaves listeners`).toBe(0);
      await expect(slot(page, name).locator("*")).toHaveCount(0);
      const retained = await harness.layout.retainedHtml();

      // Everything that would redraw the part, and the part must not hear of it.
      await harness.layout.setView({ zoom: 2, scrollLeft: 50, language: "zh" });
      await harness.layout.replace({ score: { vector: "reject-duration-five" } });
      expect(await harness.layout.retainedHtml(), name).toBe(retained);
      const drawn = await expectDrawnLikeFresh(harness);
      expect(Object.keys(drawn).sort(), "the others stayed mounted").toEqual(
        partNames.all.filter((other) => other !== name).sort(),
      );
      expect((await harness.layout.sheets()).document, "the style sheet stays while another part needs it").toBe(
        baseline.sheets + 1,
      );
      await harness.layout.close();
      expect((await harness.layout.sheets()).document).toBe(baseline.sheets);
    }
    await baseline.expectRestored();
    await baseline.detach();
  });

  test("repeated open, use and close of a whole layout leave no listeners, no nodes and no style sheets behind", async ({
    page,
    harness,
  }) => {
    const baseline = await leakBaseline(page, harness);

    for (let cycle = 0; cycle < 4; cycle++) {
      await harness.layout.open();
      await harness.layout.setView({ zoom: 1.5, scrollLeft: 100, language: "zh" });
      await harness.layout.replace({ score: { vector: "reject-duration-five" } });
      await harness.layout.replace({ score: { sample: "compact-three-sections" } });
      await harness.layout.dispatch({ type: "toRest", noteId: await harness.layout.firstVocalNoteId() });
      await harness.layout.undo();
      await harness.layout.close();
    }
    await baseline.expectRestored();

    await harness.layout.open();
    expect((await harness.layout.sheets()).document).toBe(baseline.sheets + 1);
    await harness.layout.close();
    await baseline.detach();
  });

  test("the zoom menu of a destroyed zoom part is gone with it, even when it was open", async ({
    page,
    harness,
    press,
  }) => {
    await harness.layout.open();
    await press(slot(page, "zoom").getByRole("button", { name: /^Zoom \d+%$/ }));
    await expect(page.getByRole("menuitemradio", { name: "200%" })).toBeVisible();
    await harness.layout.destroyPart("zoom");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("menuitemradio")).toHaveCount(0);
  });
});

test.describe("style isolation of parts", () => {
  test.skip(({ isMobile }) => isMobile, "styling is checked once, on the desktop project");
  const score = { text: vocalOnly("C4z4D8|C16|C16|") };
  const c4 = "C4, bar 1 beat 1, length 1 beat";

  test("the parts are styled under a strict style policy, where an injected style element is blocked", async ({
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
    // The policy is in force: a style element that rules a plain button has no effect.
    await harness.addHostProbe();
    await harness.addHostRules("hostile");
    await expect(page.locator("#probe-button")).not.toHaveCSS("background-color", "rgb(255, 255, 0)");

    // The page's own layout is styled by its style sheet, which the policy allows, so it is not what is being tested...
    await harness.layout.open({ score });
    expect((await box(scrollSurface(page, "ruler"))).width).toBe(560);
    expect((await box(scrollSurface(page, "vocal"))).width).toBe(420);
    // ... and the parts are styled by theirs.
    expect((await box(slot(page, "vocal").getByRole("listitem", { name: c4 }))).height).toBe(14);
    await expect(partRoot(page, "zoom")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await zoomButton(page, "Zoom in").click();
    await expect(readout(page, "150%")).toBeVisible();
    expect((await box(slot(page, "vocal").getByRole("listitem", { name: c4 }))).width).toBeCloseTo(59, 0);
    await harness.layout.close();
  });

  test("inside a host's shadow root the parts are styled there, work, and are out of reach of rules even !important ones", async ({
    page,
    harness,
  }) => {
    await harness.addHostRules("important");
    await harness.layout.open({ shadow: true, score });
    expect(await harness.layout.sheets()).toEqual({ document: 0, shadowRoot: 1 });

    const name = slot(page, "vocal").getByText("Vocal", { exact: true });
    await expect(name).toHaveCSS("padding-top", "0px");
    await expect(name).toHaveCSS("color", "rgb(24, 24, 27)");
    const note = slot(page, "vocal").getByRole("listitem", { name: c4 });
    expect((await box(note)).height).toBe(14);

    await zoomButton(page, "Zoom in").click();
    await expect(readout(page, "150%")).toBeVisible();
    expect((await box(note)).width).toBeCloseTo(59, 0);
    await readout(page, "150%").click();
    await expect(page.getByRole("menuitemradio", { name: "200%" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitemradio", { name: "200%" })).toBeHidden();

    await harness.layout.close();
    expect(await harness.layout.sheets()).toEqual({ document: 0, shadowRoot: 0 });
    expect(await harness.layout.leftInShadowRoot()).toBe(0);
  });

  test("a part's pinned heads do not paint over an element of the host that sits in front of the part", async ({
    page,
    harness,
  }) => {
    await harness.layout.open({ score, scene: "overlapping-banner" });
    const banner = page.getByText("Host banner", { exact: true });
    // A click that lands on the banner, wherever along it, shows that nothing of the part is painted over it.
    for (const position of [
      { x: 10, y: 10 },
      { x: 150, y: 10 },
    ]) {
      await banner.click({ trial: true, timeout: 3000, position });
    }
  });

  test("the host's theme variables and colour scheme restyle every part", async ({ page, harness, partNames }) => {
    await harness.layout.open({ score });
    const style = (name: string, property: "background-color" | "font-family") =>
      partRoot(page, name).evaluate((el, key) => getComputedStyle(el).getPropertyValue(key), property);
    const lightness = async (name: string) => {
      const [r = 0, g = 0, b = 0] = (await style(name, "background-color")).match(/\d+/g)?.map(Number) ?? [];
      return (r + g + b) / 3;
    };
    for (const name of partNames.all) expect(await lightness(name), `${name} is light`).toBeGreaterThan(200);
    await harness.setColorScheme("dark");
    for (const name of partNames.all) expect(await lightness(name), `${name} is dark`).toBeLessThan(60);
    await harness.setColorScheme("light");

    await harness.layout.setTheme({
      "--sce-color-note": "rgb(255, 0, 128)",
      "--sce-color-bg": "rgb(10, 20, 30)",
      "--sce-font-family": "'Courier New', monospace",
    });
    await expect(slot(page, "vocal").getByRole("listitem", { name: c4 })).toHaveCSS(
      "background-color",
      "rgb(255, 0, 128)",
    );
    for (const name of partNames.all) {
      expect(await style(name, "background-color"), name).toBe("rgb(10, 20, 30)");
      expect(await style(name, "font-family"), name).toContain("Courier New");
    }
  });

  test("the host's global styles do not change the parts, and the parts do not change the host", async ({
    page,
    harness,
  }) => {
    await harness.addHostProbe();
    const probe = () =>
      page.evaluate(() =>
        ["#probe", "#probe-button", "#probe span", "body", "h1"].map((selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const style = getComputedStyle(el);
          return [
            "color",
            "font-family",
            "font-size",
            "font-weight",
            "line-height",
            "margin-top",
            "padding-top",
            "border-top-width",
            "border-radius",
            "background-color",
            "display",
            "box-sizing",
            "text-transform",
            "letter-spacing",
          ].map((property) => style.getPropertyValue(property));
        }),
      );
    const names = [
      "color",
      "font-family",
      "font-size",
      "font-style",
      "font-weight",
      "line-height",
      "letter-spacing",
      "text-transform",
      "text-decoration-line",
      "margin-top",
      "padding-top",
      "padding-left",
      "border-top-width",
      "border-radius",
      "background-color",
      "box-shadow",
      "opacity",
      "position",
    ];
    const targets = (): Record<string, Locator> => ({
      "part root": partRoot(page, "vocal"),
      note: slot(page, "vocal").getByRole("listitem", { name: c4 }),
      "zoom button": readout(page, "100%"),
      "zoom in": zoomButton(page, "Zoom in"),
      "bar number": bars(page).getByRole("listitem").first(),
      "section band": slot(page, "ruler").getByRole("list", { name: "Sections" }).getByRole("listitem").first(),
      "mark flag": slot(page, "ruler").getByRole("list", { name: "Marks" }).getByRole("listitem").first(),
      "track name": slot(page, "vocal").getByText("Vocal", { exact: true }),
      // The head is a layout box with no role, so it is found by its class.
      "track head": slot(page, "vocal").locator(".sce-track-head"),
      "octave label": slot(page, "vocal").getByText(/^C\d$/).first(),
      "no-chords message": slot(page, "chords").getByText("No chords in this score"),
    });
    const styleOf = (target: Locator, list: string[]) =>
      target.evaluate(
        (el, properties) =>
          Object.fromEntries(properties.map((property) => [property, getComputedStyle(el).getPropertyValue(property)])),
        list,
      );
    // A note carries no text, so only what it draws is compared; its text properties are never used.
    const drawn = names.filter((property) => !/^(font|line|letter|text|color)/.test(property));
    const styles = async () => {
      const found: Record<string, unknown> = {};
      for (const [what, target] of Object.entries(targets())) {
        found[what] = await styleOf(target, what === "note" ? drawn : names);
      }
      return found;
    };

    await harness.layout.open({ score });
    const clean = await styles();
    expect(Object.keys(clean)).toHaveLength(11);
    await harness.layout.close();

    await harness.addHostRules("hostile");
    // The rules are in force: they colour a plain button of the host's.
    await expect(page.locator("#probe-button")).toHaveCSS("background-color", "rgb(255, 255, 0)");
    const hostBefore = await probe();
    await harness.layout.open({ score });
    expect(await styles()).toEqual(clean);
    // The font family is the one thing a part takes from where it sits, so a host can set the font of a whole page once.
    expect(
      await partRoot(page, "vocal").evaluate(
        (el) => getComputedStyle(el).fontFamily === getComputedStyle(el.parentElement as Element).fontFamily,
      ),
    ).toBe(true);
    expect(await styleOf(targets().note as Locator, drawn)).toMatchObject({
      "border-top-width": "1px",
      "margin-top": "0px",
      "padding-top": "0px",
      "box-shadow": "none",
      opacity: "1",
    });
    expect(await styleOf(targets()["zoom button"] as Locator, names)).toMatchObject({
      "font-size": "13px",
      "border-top-width": "1px",
      "padding-top": "0px",
    });
    expect(await probe()).toEqual(hostBefore);
    await harness.layout.close();
    expect(await probe()).toEqual(hostBefore);
  });
});

test.describe("the zoom menu as a part", () => {
  test("it opens above a host's layers and past the clip of the container the page put the zoom part in", async ({
    page,
    harness,
    press,
  }) => {
    await harness.layout.open({ scene: "covered-zoom" });
    await press(readout(page, "100%"));
    const half = page.getByRole("menuitemradio", { name: "50%", exact: true });
    await expect(half).toBeVisible();
    const cardBottom = await slot(page, "zoom").evaluate((el) => el.getBoundingClientRect().bottom);
    const menuBox = await page.getByRole("menu", { name: "Zoom" }).boundingBox();
    expect(menuBox ? menuBox.y + menuBox.height : 0).toBeGreaterThan(cardBottom);
    await press(half);
    await expect(readout(page, "50%")).toBeVisible();
    await expect(page.getByRole("menu", { name: "Zoom" })).toBeHidden();
    expect(await pixelsPerBar(page)).toEqual(evenly(40));
  });
});

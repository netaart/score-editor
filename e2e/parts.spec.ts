// ABOUTME: Seam 5 for the view parts: several parts mounted on one editing session, each on its own element of a layout the page builds.
// ABOUTME: Covers drawing, dispatch, replacement, zoom and scroll shared through the session, style isolation, and what destroy leaves.
import type { CDPSession, Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const ALL_PARTS = ["zoom", "notice", "ruler", "chords", "vocal", "ins", "problem"];
const AXIS_PARTS = ["ruler", "chords", "vocal", "ins"];

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);
/** The element of a part that holds its drawing, and that scrolls it in time when the part is an axis part. */
const surface = (page: Page, name: string) => slot(page, name).locator(".sce-part");

async function box(target: Locator) {
  const found = await target.boundingBox();
  if (!found) throw new Error("nothing is drawn for the locator");
  return found;
}

/** A Vocal-only song2 score in C major, 4/4, with the given music lines under one section. */
function vocalOnly(...music: string[]): string {
  const header = ["X:1", "T:", "M:4/4", "L:1/16", "Q:1/4=100", 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"'];
  return [...header, "K:C", "% a", ...music.flatMap((line) => ["V: Vocal", line]), ""].join("\n");
}

// Notes of compact-three-sections, read off its score text: 2/4 bars at 40 pixels a beat are 80 pixels wide at 100%.
const INS_BAR_1 = "F4, bar 1 beat 1, length 0.5 beats";
const INS_BAR_2 = "F4, bar 2 beat 1, length 0.5 beats";
const VOCAL_BAR_5 = "C5, bar 5 beat 1, length 1 beat";
const VOCAL_BAR_6 = "G5, bar 6 beat 1, length 1 beat";

/** How far apart two bars are on each part that draws bars, in pixels: the same on every part at one zoom. */
async function barPitches(page: Page): Promise<Record<string, number>> {
  const distance = async (first: Locator, second: Locator) => (await box(second)).x - (await box(first)).x;
  const bar = (number: string) =>
    slot(page, "ruler").getByRole("list", { name: "Bars" }).getByText(number, { exact: true });
  const chords = slot(page, "chords").getByRole("list", { name: "Chords" }).getByRole("listitem");
  const note = (name: string, part: string) => slot(page, part).getByRole("listitem", { name, exact: true });
  return {
    ruler: await distance(bar("1"), bar("2")),
    chords: await distance(chords.nth(0), chords.nth(1)),
    vocal: await distance(note(VOCAL_BAR_5, "vocal"), note(VOCAL_BAR_6, "vocal")),
    ins: await distance(note(INS_BAR_1, "ins"), note(INS_BAR_2, "ins")),
  };
}

const scrollLeftOf = (page: Page, name: string) => surface(page, name).evaluate((el) => el.scrollLeft);
const maxScrollOf = (page: Page, name: string) => surface(page, name).evaluate((el) => el.scrollWidth - el.clientWidth);
const sessionView = (page: Page) => page.evaluate(() => ({ ...window.harness.layout.session.view }));

/** The first Vocal note that is a pitch and not part of a tie, as the session reads it. */
const loneVocalNote = (page: Page) =>
  page.evaluate(() => {
    const { reading } = window.harness.layout.session;
    if (reading.kind !== "score" || !reading.score) throw new Error("no score");
    const note = reading.score.notes.find((found) => found.voice === "Vocal" && found.midi !== null);
    if (!note) throw new Error("no note");
    return note.id;
  });

test.describe("a layout of view parts on one session", () => {
  test("each part draws what the session holds, on its own element of a layout the page built", async ({
    page,
    harness,
  }) => {
    await harness.openLayout();
    const bars = slot(page, "ruler").getByRole("list", { name: "Bars" }).getByRole("listitem");
    await expect(bars).toHaveCount(28);
    await expect(bars.first()).toHaveText("1");
    await expect(bars.last()).toHaveText("28");
    await expect(slot(page, "ruler").getByRole("list", { name: "Sections" }).getByRole("listitem")).toHaveText([
      "intro",
      "verse",
      "chorus",
    ]);
    await expect(slot(page, "chords").getByRole("list", { name: "Chords" }).getByRole("listitem")).toHaveCount(28);
    await expect(slot(page, "vocal").getByRole("list", { name: "Vocal" })).toBeVisible();
    await expect(slot(page, "vocal").getByRole("listitem", { name: VOCAL_BAR_5, exact: true })).toBeVisible();
    await expect(slot(page, "vocal").getByRole("listitem", { name: INS_BAR_1, exact: true })).toHaveCount(0);
    await expect(slot(page, "ins").getByRole("listitem", { name: INS_BAR_1, exact: true })).toBeVisible();
    await expect(slot(page, "ins").getByRole("listitem", { name: VOCAL_BAR_5, exact: true })).toHaveCount(0);
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 100%", exact: true })).toBeVisible();
    await expect(slot(page, "notice").getByRole("note")).toBeHidden();
    await expect(slot(page, "problem").getByRole("alert")).toHaveCount(0);

    // The layout is the page's: each part is as wide as the card the page put it in, and the song runs on past it.
    for (const name of AXIS_PARTS) {
      const frame = await surface(page, name).evaluate((el) => ({
        shown: el.clientWidth,
        content: el.scrollWidth,
        card: (el.parentElement?.parentElement as HTMLElement).clientWidth,
      }));
      expect(frame.shown, `${name} fills its card`).toBe(frame.card);
      expect(frame.content, `${name} is wider than its card`).toBeGreaterThan(frame.card);
    }
    expect(await barPitches(page)).toEqual({ ruler: 80, chords: 80, vocal: 80, ins: 80 });
  });

  test("a part mounts on any element: each part's root is one block that holds its own content", async ({
    page,
    harness,
  }) => {
    await harness.openLayout();
    for (const name of ALL_PARTS) {
      const root = surface(page, name);
      await expect(root, `${name} has one root`).toHaveCount(1);
      expect(await root.evaluate((el) => [el.classList.contains("sce-root"), getComputedStyle(el).display])).toEqual([
        true,
        "block",
      ]);
    }
  });

  test("a command dispatched through the session updates the right track, and every part still draws what a fresh one would", async ({
    page,
    harness,
  }) => {
    await harness.openLayout();
    const vocalNotes = slot(page, "vocal").getByRole("listitem");
    const insNotes = slot(page, "ins").getByRole("listitem");
    const before = { vocal: await vocalNotes.count(), ins: await insNotes.count() };
    const roots = await page.evaluate(() => window.harness.layout.roots());
    expect(roots).toEqual(await page.evaluate(() => window.harness.layout.freshRoots()));

    const noteId = await loneVocalNote(page);
    const done = await page.evaluate(
      (id) => window.harness.layout.session.dispatch({ type: "toRest", noteId: id }),
      noteId,
    );
    expect(done.ok).toBe(true);
    await expect(vocalNotes).toHaveCount(before.vocal - 1);
    await expect(slot(page, "vocal").getByRole("listitem", { name: VOCAL_BAR_5, exact: true })).toHaveCount(0);
    expect(await insNotes.count()).toBe(before.ins);
    const changed = await page.evaluate(() => window.harness.layout.roots());
    for (const name of ["zoom", "notice", "ruler", "chords", "ins", "problem"]) {
      expect(changed[name], `${name} is not touched by a change to Vocal`).toBe(roots[name]);
    }
    expect(changed.vocal).not.toBe(roots.vocal);
    expect(changed).toEqual(await page.evaluate(() => window.harness.layout.freshRoots()));

    expect(await page.evaluate(() => window.harness.layout.session.undo())).toBe(true);
    await expect(vocalNotes).toHaveCount(before.vocal);
    await expect(slot(page, "vocal").getByRole("listitem", { name: VOCAL_BAR_5, exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.harness.layout.roots())).toEqual(roots);
    expect(await page.evaluate(() => window.harness.layout.session.redo())).toBe(true);
    await expect(vocalNotes).toHaveCount(before.vocal - 1);
  });

  test("a refused command changes no part and returns its diagnostic", async ({ page, harness }) => {
    await harness.openLayout();
    const roots = await page.evaluate(() => window.harness.layout.roots());
    const done = await page.evaluate(() =>
      window.harness.layout.session.dispatch({ type: "toRest", noteId: "no-such-note" }),
    );
    expect(done.ok).toBe(false);
    expect(done.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["note-not-found"]);
    expect(await page.evaluate(() => window.harness.layout.session.canUndo)).toBe(false);
    expect(await page.evaluate(() => window.harness.layout.roots())).toEqual(roots);
  });

  test("replacing the project from outside redraws every part, and the zoom the user chose stays", async ({
    page,
    harness,
    isMobile,
  }) => {
    await harness.openLayout();
    const press = (target: Locator) => (isMobile ? target.tap() : target.click());
    await press(slot(page, "zoom").getByRole("button", { name: "Zoom in", exact: true }));
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();

    await page.evaluate(() => window.harness.layout.replace({ score: { vector: "truncate-partial-measure" } }));
    await expect(slot(page, "notice").getByRole("note")).toHaveText(
      "This score is cut off: bar 1 of Vocal is incomplete.",
    );
    await expect(slot(page, "vocal").getByRole("list", { name: "Vocal" })).toBeVisible();
    await expect(slot(page, "ins").getByRole("list")).toHaveCount(0);
    await expect(slot(page, "chords").getByRole("list", { name: "Chords" })).toHaveCount(0);
    expect(await page.evaluate(() => window.harness.layout.roots())).toEqual(
      await page.evaluate(() => window.harness.layout.freshRoots()),
    );
    expect((await sessionView(page)).zoom).toBe(1.5);

    await page.evaluate(() => window.harness.layout.replace({ score: { vector: "reject-duration-five" } }));
    await expect(slot(page, "problem").getByRole("alert")).toContainText(
      "This score can't be shown because it can't be read.",
    );
    await expect(slot(page, "zoom").getByRole("group", { name: "Zoom" })).toBeHidden();
    await expect(slot(page, "notice").getByRole("note")).toBeHidden();
    for (const name of AXIS_PARTS) await expect(surface(page, name).locator("*")).toHaveCount(0);

    await page.evaluate(() => window.harness.layout.replace({ score: { sample: "compact-three-sections" } }));
    await expect(slot(page, "problem").getByRole("alert")).toHaveCount(0);
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.harness.layout.roots())).toEqual(
      await page.evaluate(() => window.harness.layout.freshRoots()),
    );
    const pitches = await barPitches(page);
    expect(Object.values(pitches)).toEqual([120, 120, 120, 120]);
  });

  test("a model with no dialect gets the one sentence from the problem part and nothing else draws", async ({
    page,
    harness,
  }) => {
    await harness.openLayout({ project: { modelId: "song-x" } });
    await expect(slot(page, "problem").getByRole("alert")).toHaveText(
      "The score format of “song-x” isn't supported by this editor, so the score can't be shown.",
    );
    for (const name of AXIS_PARTS) await expect(surface(page, name).locator("*")).toHaveCount(0);
    expect(
      await page.evaluate(() => window.harness.layout.session.dispatch({ type: "toRest", noteId: "x" })),
    ).toMatchObject({
      ok: false,
      diagnostics: [{ code: "no-dialect" }],
    });
  });

  test("a score with no Ins voice leaves the Ins track empty, and a part mounted for it later draws it", async ({
    page,
    harness,
  }) => {
    await harness.openLayout({ score: { sample: "vocal-only-melody" }, parts: ["ruler", "vocal"] });
    await expect(slot(page, "vocal").getByRole("list", { name: "Vocal" })).toBeVisible();
    await page.evaluate(() => window.harness.layout.mountPart("ins"));
    await expect(slot(page, "ins").getByRole("list")).toHaveCount(0);
    await page.evaluate(() => window.harness.layout.replace({ score: { sample: "compact-three-sections" } }));
    await expect(slot(page, "ins").getByRole("list", { name: "Ins" })).toBeVisible();
  });
});

test.describe("zoom shared through the session", () => {
  test("the zoom part moves every track, the ruler and the chords: by button, by menu, and by fitting the song", async ({
    page,
    harness,
    isMobile,
  }) => {
    await harness.openLayout();
    const press = (target: Locator) => (isMobile ? target.tap() : target.click());
    const zoom = slot(page, "zoom");
    const readout = (value: string) => zoom.getByRole("button", { name: `Zoom ${value}`, exact: true });
    await expect(readout("100%")).toBeVisible();

    await press(zoom.getByRole("button", { name: "Zoom in", exact: true }));
    await expect(readout("150%")).toBeVisible();
    expect(await barPitches(page)).toEqual({ ruler: 120, chords: 120, vocal: 120, ins: 120 });

    await press(zoom.getByRole("button", { name: "Zoom out", exact: true }));
    await press(zoom.getByRole("button", { name: "Zoom out", exact: true }));
    await expect(readout("50%")).toBeVisible();
    expect(await barPitches(page)).toEqual({ ruler: 40, chords: 40, vocal: 40, ins: 40 });

    await press(readout("50%"));
    await press(page.getByRole("menuitemradio", { name: "200%" }));
    await expect(readout("200%")).toBeVisible();
    expect(await barPitches(page)).toEqual({ ruler: 160, chords: 160, vocal: 160, ins: 160 });

    await press(readout("200%"));
    await press(page.getByRole("menuitem", { name: "Fit whole song" }));
    const fitted = await sessionView(page);
    expect(fitted.zoom).toBeLessThan(1);
    expect(fitted.scrollLeft).toBe(0);
    // The song is fitted to the first part on the axis, the ruler: it and the parts as wide as it show the whole song.
    for (const name of ["ruler", "chords", "ins"]) {
      const widths = await surface(page, name).evaluate((el) => ({ shown: el.clientWidth, content: el.scrollWidth }));
      expect(widths.content, `${name} shows the whole song`).toBeLessThanOrEqual(widths.shown);
    }
  });

  test("the zoom readout follows a zoom made from the session, and the part draws for it when mounted late", async ({
    page,
    harness,
  }) => {
    await harness.openLayout({ parts: ["zoom", "ruler"] });
    await page.evaluate(() => window.harness.layout.session.setView({ zoom: 2 }));
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 200%", exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.harness.layout.mountPart("chords");
      window.harness.layout.mountPart("ins");
    });
    expect(await page.evaluate(() => window.harness.layout.roots())).toEqual(
      await page.evaluate(() => window.harness.layout.freshRoots()),
    );
    const bar = (number: string) =>
      slot(page, "ruler").getByRole("list", { name: "Bars" }).getByText(number, { exact: true });
    expect((await box(bar("2"))).x - (await box(bar("1"))).x).toBe(160);
    const chords = slot(page, "chords").getByRole("list", { name: "Chords" }).getByRole("listitem");
    expect((await box(chords.nth(1))).x - (await box(chords.nth(0))).x).toBe(160);
  });

  test("control and the wheel on a track zoom every part around the pointer", async ({ page, harness, isMobile }) => {
    test.skip(isMobile, "the wheel is a mouse gesture, checked on the desktop project");
    await harness.openLayout();
    const bar3 = slot(page, "ruler").getByRole("list", { name: "Bars" }).getByText("3", { exact: true });
    const insNote = slot(page, "ins").getByRole("listitem", {
      name: "F4, bar 3 beat 1, length 0.5 beats",
      exact: true,
    });
    await surface(page, "ins").scrollIntoViewIfNeeded();
    const [barBefore, noteBefore] = [await box(bar3), await box(insNote)];
    await page.mouse.move(noteBefore.x + 2, noteBefore.y + noteBefore.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect(slot(page, "zoom").getByRole("button", { name: /^Zoom (?!100%)\d+%$/ })).toBeVisible();
    const pitches = await barPitches(page);
    expect(pitches.ruler).toBeGreaterThan(90);
    expect(new Set(Object.values(pitches).map((pitch) => Math.round(pitch))).size).toBe(1);
    // The instant under the pointer stays where it was, in the ruler and in the track that took the wheel.
    expect((await box(bar3)).x).toBeCloseTo(barBefore.x, -1);
    expect((await box(insNote)).x).toBeCloseTo(noteBefore.x, -1);
  });

  test("the plus and minus keys zoom once from a focused track, even though the part sits in a page that also takes keys", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "the keyboard is checked on the desktop project");
    await harness.openLayout();
    await surface(page, "vocal").focus();
    await page.keyboard.press("+");
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();
    await page.keyboard.press("-");
    await page.keyboard.press("-");
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 50%", exact: true })).toBeVisible();
    expect(await barPitches(page)).toEqual({ ruler: 40, chords: 40, vocal: 40, ins: 40 });
  });

  test("a part destroyed on its own leaves the others on the same time axis, and the zoom still anchors on what remains", async ({
    page,
    harness,
    isMobile,
  }) => {
    await harness.openLayout();
    const press = (target: Locator) => (isMobile ? target.tap() : target.click());
    await page.evaluate(() => window.harness.layout.destroyPart("ruler"));
    await expect(slot(page, "ruler").locator("*")).toHaveCount(0);
    await press(slot(page, "zoom").getByRole("button", { name: "Zoom in", exact: true }));
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();
    const chords = slot(page, "chords").getByRole("list", { name: "Chords" }).getByRole("listitem");
    expect((await box(chords.nth(1))).x - (await box(chords.nth(0))).x).toBe(120);
    expect(await maxScrollOf(page, "ins")).toBeGreaterThan(0);
    await surface(page, "chords").evaluate((el) => {
      el.scrollLeft = 200;
    });
    await expect.poll(() => scrollLeftOf(page, "ins")).toBe(200);
    await press(slot(page, "zoom").getByRole("button", { name: "Zoom 150%", exact: true }));
    await press(page.getByRole("menuitem", { name: "Fit whole song" }));
    await expect.poll(() => scrollLeftOf(page, "ins")).toBe(0);
  });
});

test.describe("scroll shared through the session", () => {
  test("scrolling one part scrolls every other part, whichever it is", async ({ page, harness }) => {
    await harness.openLayout();
    await surface(page, "ruler").evaluate((el) => {
      el.scrollLeft = 300;
    });
    for (const name of AXIS_PARTS) await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBe(300);
    expect((await sessionView(page)).scrollLeft).toBe(300);

    await surface(page, "ins").evaluate((el) => {
      el.scrollLeft = 120;
    });
    for (const name of AXIS_PARTS) await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBe(120);
    expect((await sessionView(page)).scrollLeft).toBe(120);
  });

  test("a user's own gesture on a track scrolls the other parts with it", async ({ page, harness, isMobile }) => {
    await harness.openLayout();
    await surface(page, "vocal").scrollIntoViewIfNeeded();
    const track = await box(surface(page, "vocal"));
    const middle = { x: track.x + track.width / 2, y: track.y + track.height / 2 };
    if (isMobile) {
      await harness.swipe({ x: middle.x + 100, y: middle.y }, { x: middle.x - 100, y: middle.y });
    } else {
      await page.mouse.move(middle.x, middle.y);
      await page.mouse.wheel(300, 0);
    }
    await expect.poll(() => scrollLeftOf(page, "vocal")).toBeGreaterThan(80);
    const target = await scrollLeftOf(page, "vocal");
    for (const name of AXIS_PARTS)
      await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBeCloseTo(target, 0);
    expect((await sessionView(page)).scrollLeft).toBeCloseTo(target, 0);
  });

  test("the session's scroll offset moves every part, and parts of different widths each stop at their own end", async ({
    page,
    harness,
  }) => {
    await harness.openLayout();
    await page.evaluate(() => window.harness.layout.session.setView({ scrollLeft: 150 }));
    for (const name of AXIS_PARTS) await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBe(150);

    await page.evaluate(() => window.harness.layout.session.setView({ scrollLeft: 100000 }));
    for (const name of AXIS_PARTS) {
      const end = await maxScrollOf(page, name);
      expect(end, `${name} can scroll`).toBeGreaterThan(150);
      await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBeCloseTo(end, 0);
    }
    // A part that stopped short did not pull the offset the others were sent to back with it.
    await page.waitForTimeout(100);
    expect((await sessionView(page)).scrollLeft).toBe(100000);

    await page.evaluate(() => window.harness.layout.session.setView({ scrollLeft: 0 }));
    for (const name of AXIS_PARTS) await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBe(0);
  });

  test("a part mounted after the user scrolled and zoomed starts where the others are", async ({ page, harness }) => {
    await harness.openLayout({ parts: ["ruler"] });
    await page.evaluate(() => window.harness.layout.session.setView({ zoom: 1.5, scrollLeft: 300 }));
    await expect.poll(() => scrollLeftOf(page, "ruler")).toBe(300);
    await page.evaluate(() => {
      window.harness.layout.mountPart("ins");
      window.harness.layout.mountPart("chords");
    });
    for (const name of ["ins", "chords"])
      await expect.poll(() => scrollLeftOf(page, name), { message: name }).toBe(300);
    const chords = slot(page, "chords").getByRole("list", { name: "Chords" }).getByRole("listitem");
    expect((await box(chords.nth(1))).x - (await box(chords.nth(0))).x).toBe(120);
  });
});

test.describe("interface language", () => {
  test("switching the session's language changes every part, and back", async ({ page, harness }) => {
    await harness.openLayout({ score: { vector: "truncate-partial-measure" } });
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 100%", exact: true })).toBeVisible();
    await page.evaluate(() => window.harness.layout.session.setView({ language: "zh" }));
    await expect(slot(page, "zoom").getByRole("button", { name: "缩放 100%", exact: true })).toBeVisible();
    await expect(slot(page, "zoom").getByRole("button", { name: "放大", exact: true })).toBeVisible();
    await expect(slot(page, "notice").getByRole("note")).toHaveText("这份乐谱在末尾被截断：Vocal 的第 1 小节不完整。");
    await expect(slot(page, "ruler").getByRole("list", { name: "小节" })).toBeVisible();
    await expect(slot(page, "ruler").getByRole("list", { name: "标记" })).toBeVisible();
    await expect(slot(page, "vocal").getByRole("listitem").first()).toHaveAccessibleName(/第 1 小节第 1 拍/);
    for (const name of ALL_PARTS) expect(await surface(page, name).getAttribute("lang")).toBe("zh");
    expect(await page.evaluate(() => window.harness.layout.roots())).toEqual(
      await page.evaluate(() => window.harness.layout.freshRoots()),
    );

    await page.evaluate(() => window.harness.layout.session.setView({ language: "en" }));
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 100%", exact: true })).toBeVisible();
    await expect(slot(page, "notice").getByRole("note")).toHaveText(
      "This score is cut off: bar 1 of Vocal is incomplete.",
    );
    await expect(slot(page, "ruler").getByRole("list", { name: "Bars" })).toBeVisible();
    for (const name of ALL_PARTS) expect(await surface(page, name).getAttribute("lang")).toBe("en");
  });

  test("the problem part speaks the session's language", async ({ page, harness }) => {
    await harness.openLayout({ score: { vector: "reject-duration-five" }, language: "zh" });
    await expect(slot(page, "problem").getByRole("alert")).toContainText("这份乐谱读不通，所以无法显示。");
    await page.evaluate(() => window.harness.layout.session.setView({ language: "en" }));
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
    /** The listeners on every node `window.kept` holds. */
    onKept: async () => {
      const { result: length } = await cdp.send("Runtime.evaluate", { expression: "window.kept.length" });
      let total = 0;
      for (let index = 0; index < Number(length.value); index++) total += await onObject(`window.kept[${index}]`);
      return total;
    },
  };
}

test.describe("destroying parts", () => {
  test("each part, destroyed on its own, leaves no node and no listener and does not answer the session any more", async ({
    page,
    harness,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const listeners = listenerCounter(cdp);
    const globalsBefore = await listeners.onGlobals();
    const htmlBefore = await page.evaluate(() => document.documentElement.outerHTML);
    const sheets = () => page.evaluate(() => document.adoptedStyleSheets.length);
    const sheetsBefore = await sheets();

    for (const name of ALL_PARTS) {
      await harness.openLayout();
      expect(await sheets(), "the parts share one style sheet").toBe(sheetsBefore + 1);
      await page.evaluate((target) => {
        const root = window.harness.layout.slots[target]?.firstElementChild;
        if (!root) throw new Error(`${target} drew no root`);
        Object.assign(window, { kept: [root, ...root.querySelectorAll("*")], keptRoot: root });
      }, name);
      // Parts with something to press, scroll or zoom with have listeners; the two that only draw have none to leave.
      if (!["notice", "problem"].includes(name))
        expect(await listeners.onKept(), `${name} has listeners`).toBeGreaterThan(0);

      await page.evaluate((target) => window.harness.layout.destroyPart(target, 2), name);
      expect(await listeners.onKept(), `${name} leaves listeners`).toBe(0);
      await expect(slot(page, name).locator("*")).toHaveCount(0);
      const retained = await page.evaluate(() => (window as unknown as { keptRoot: Element }).keptRoot.outerHTML);

      // Everything that would redraw the part, and the part must not hear of it.
      await page.evaluate(() => {
        const { session } = window.harness.layout;
        session.setView({ zoom: 2, scrollLeft: 50, language: "zh" });
      });
      await page.evaluate(() => window.harness.layout.replace({ score: { vector: "reject-duration-five" } }));
      expect(await page.evaluate(() => (window as unknown as { keptRoot: Element }).keptRoot.outerHTML), name).toBe(
        retained,
      );
      const drawn = await page.evaluate(() => window.harness.layout.roots());
      expect(Object.keys(drawn).sort(), "the others stayed mounted").toEqual(
        ALL_PARTS.filter((other) => other !== name).sort(),
      );
      expect(drawn, "the others went on drawing").toEqual(
        await page.evaluate(() => window.harness.layout.freshRoots()),
      );
      expect(await sheets(), "the style sheet stays while another part needs it").toBe(sheetsBefore + 1);
      await harness.closeLayout();
      expect(await sheets()).toBe(sheetsBefore);
    }
    expect(await listeners.onGlobals()).toEqual(globalsBefore);
    expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(htmlBefore);
    await cdp.detach();
  });

  test("repeated open, use and close of a whole layout leave no listeners, no nodes and no style sheets behind", async ({
    page,
    harness,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const listeners = listenerCounter(cdp);
    const globalsBefore = await listeners.onGlobals();
    const htmlBefore = await page.evaluate(() => document.documentElement.outerHTML);
    const sheets = () => page.evaluate(() => document.adoptedStyleSheets.length);
    const sheetsBefore = await sheets();

    for (let cycle = 0; cycle < 4; cycle++) {
      await harness.openLayout();
      await page.evaluate(() => {
        const { session } = window.harness.layout;
        session.setView({ zoom: 1.5, scrollLeft: 100, language: "zh" });
      });
      await page.evaluate(() => window.harness.layout.replace({ score: { vector: "reject-duration-five" } }));
      await page.evaluate(() => window.harness.layout.replace({ score: { sample: "short-two-sections" } }));
      await page.evaluate(() => {
        const { session } = window.harness.layout;
        const note =
          session.reading.kind === "score" ? session.reading.score?.notes.find((n) => n.midi !== null) : null;
        if (note) session.dispatch({ type: "toRest", noteId: note.id });
        session.undo();
      });
      await harness.closeLayout();
    }
    expect(await listeners.onGlobals()).toEqual(globalsBefore);
    expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(htmlBefore);
    expect(await sheets()).toBe(sheetsBefore);

    await harness.openLayout();
    expect(await sheets()).toBe(sheetsBefore + 1);
    await harness.closeLayout();
    await cdp.detach();
  });

  test("the zoom menu of a destroyed zoom part is gone with it, even when it was open", async ({
    page,
    harness,
    isMobile,
  }) => {
    await harness.openLayout();
    const button = slot(page, "zoom").getByRole("button", { name: /^Zoom \d+%$/ });
    if (isMobile) await button.tap();
    else await button.click();
    await expect(page.getByRole("menuitemradio", { name: "200%" })).toBeVisible();
    await page.evaluate(() => window.harness.layout.destroyPart("zoom"));
    await expect(page.getByRole("menuitemradio")).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll(":popover-open").length)).toBe(0);
  });
});

test.describe("style isolation of parts", () => {
  test.skip(({ isMobile }) => isMobile, "styling is checked once, on the desktop project");
  const score = { text: vocalOnly("C4z4D8|C16|C16|") };
  const c4 = "C4, bar 1 beat 1, length 1 beat";

  test("the parts are styled under a strict style policy, where an injected style element would be blocked", async ({
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
    await harness.openLayout({ score });
    expect((await box(slot(page, "vocal").getByRole("listitem", { name: c4 }))).height).toBe(14);
    expect(await surface(page, "zoom").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      "rgb(255, 255, 255)",
    );
    await slot(page, "zoom").getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();
    const note = slot(page, "vocal").getByRole("listitem", { name: c4 });
    expect((await box(note)).width).toBeCloseTo(59, 0);
    await harness.closeLayout();
  });

  test("inside a host's shadow root the parts are styled there, work, and are out of reach of rules even !important ones", async ({
    page,
    harness,
  }) => {
    await page.addStyleTag({
      content: "#layout-host span, #layout-host div { padding: 9px !important; color: red !important; }",
    });
    await harness.openLayout({ shadow: true, score });
    expect(
      await page.evaluate(() => ({
        sheets: window.harness.layout.shadowRoot?.adoptedStyleSheets.length,
        documentSheets: document.adoptedStyleSheets.length,
      })),
    ).toEqual({ sheets: 1, documentSheets: 0 });

    const name = slot(page, "vocal").getByText("Vocal", { exact: true });
    expect(await name.evaluate((el) => [getComputedStyle(el).paddingTop, getComputedStyle(el).color])).toEqual([
      "0px",
      "rgb(24, 24, 27)",
    ]);
    const note = slot(page, "vocal").getByRole("listitem", { name: c4 });
    expect((await box(note)).height).toBe(14);

    await slot(page, "zoom").getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();
    expect((await box(note)).width).toBeCloseTo(59, 0);
    await slot(page, "zoom").getByRole("button", { name: "Zoom 150%", exact: true }).click();
    await expect(page.getByRole("menuitemradio", { name: "200%" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitemradio", { name: "200%" })).toBeHidden();

    await harness.closeLayout();
    expect(
      await page.evaluate(() => ({
        sheets: window.harness.layout.shadowRoot?.adoptedStyleSheets.length,
        parts: window.harness.layout.shadowRoot?.querySelectorAll(".sce-root, .sce-popover").length,
      })),
    ).toEqual({ sheets: 0, parts: 0 });
  });

  test("the host's theme variables and colour scheme restyle every part", async ({ page, harness }) => {
    await harness.openLayout({ score });
    const style = (name: string, property: "backgroundColor" | "fontFamily" | "color") =>
      surface(page, name).evaluate((el, key) => getComputedStyle(el)[key], property);
    const lightness = async (name: string) => {
      const [r = 0, g = 0, b = 0] = (await style(name, "backgroundColor")).match(/\d+/g)?.map(Number) ?? [];
      return (r + g + b) / 3;
    };
    for (const name of ALL_PARTS) expect(await lightness(name), `${name} is light`).toBeGreaterThan(200);
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = "dark";
    });
    for (const name of ALL_PARTS) expect(await lightness(name), `${name} is dark`).toBeLessThan(60);
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = "";
    });

    await page.evaluate(() => {
      const style = window.harness.layout.host?.style;
      style?.setProperty("--sce-color-note", "rgb(255, 0, 128)");
      style?.setProperty("--sce-color-bg", "rgb(10, 20, 30)");
      style?.setProperty("--sce-font-family", "'Courier New', monospace");
    });
    expect(
      await slot(page, "vocal")
        .getByRole("listitem", { name: c4 })
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(255, 0, 128)");
    for (const name of ALL_PARTS) expect(await style(name, "backgroundColor"), name).toBe("rgb(10, 20, 30)");
    for (const name of ALL_PARTS) expect(await style(name, "fontFamily"), name).toContain("Courier New");
  });

  test("the host's global styles do not change the parts, and the parts do not change the host", async ({
    page,
    harness,
  }) => {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="probe"><button id="probe-button">Host button</button><span>Host text</span></div>',
      );
    });
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
      "part root": surface(page, "vocal"),
      note: slot(page, "vocal").getByRole("listitem", { name: c4 }),
      "zoom button": slot(page, "zoom").getByRole("button", { name: "Zoom 100%", exact: true }),
      "zoom in": slot(page, "zoom").getByRole("button", { name: "Zoom in", exact: true }),
      "bar number": slot(page, "ruler").getByRole("list", { name: "Bars" }).getByRole("listitem").first(),
      "section band": slot(page, "ruler").getByRole("list", { name: "Sections" }).getByRole("listitem").first(),
      "mark flag": slot(page, "ruler").getByRole("list", { name: "Marks" }).getByRole("listitem").first(),
      "track name": slot(page, "vocal").getByText("Vocal", { exact: true }),
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

    await harness.openLayout({ score });
    const clean = await styles();
    expect(Object.keys(clean)).toHaveLength(11);
    await harness.closeLayout();

    await page.addStyleTag({
      content: `
        #layout-host > div, #layout-host > div > div, #layout-host [data-slot] { font: 13px Georgia, serif; }
        body div, body span, body button { margin: 7px; padding: 9px; border: 3px solid red; border-radius: 0;
          background: yellow; color: red; font: italic 28px/3 cursive; letter-spacing: 4px; text-transform: uppercase;
          box-shadow: 0 0 0 5px green; position: static; opacity: 0.9; text-decoration: underline; }
      `,
    });
    const hostBefore = await probe();
    await harness.openLayout({ score });
    expect(await styles()).toEqual(clean);
    // The font family is the one thing a part takes from where it sits, so a host can set the font of a whole page once.
    expect(
      await surface(page, "vocal").evaluate(
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
    expect(await styleOf(targets()["track head"] as Locator, names)).toMatchObject({ position: "sticky" });
    expect(await styleOf(targets()["zoom button"] as Locator, names)).toMatchObject({
      "font-size": "13px",
      "border-top-width": "1px",
      "padding-top": "0px",
    });
    expect(await probe()).toEqual(hostBefore);
    await harness.closeLayout();
    expect(await probe()).toEqual(hostBefore);
  });
});

test.describe("the zoom menu as a part", () => {
  test("it opens above a host's layers and past the clip of the container the page put the zoom part in", async ({
    page,
    harness,
    isMobile,
  }) => {
    const press = (target: Locator) => (isMobile ? target.tap() : target.click());
    await harness.openLayout();
    await page.evaluate(() => {
      const card = window.harness.layout.slots.zoom;
      if (!card) throw new Error("no zoom slot");
      card.style.cssText =
        "position:fixed;left:0;top:0;width:100vw;height:50px;z-index:1000;overflow:hidden;transform:translateZ(0);background:#ddd";
      const toast = document.createElement("div");
      toast.style.cssText =
        "position:fixed;left:0;top:30px;width:100vw;height:300px;z-index:2147483647;background:rgba(255,0,0,.4)";
      document.body.append(toast);
    });
    await press(slot(page, "zoom").getByRole("button", { name: "Zoom 100%", exact: true }));
    const half = page.getByRole("menuitemradio", { name: "50%", exact: true });
    await expect(half).toBeVisible();
    const cardBottom = await slot(page, "zoom").evaluate((el) => el.getBoundingClientRect().bottom);
    const menuBox = await page.getByRole("menu", { name: "Zoom" }).boundingBox();
    expect(menuBox ? menuBox.y + menuBox.height : 0).toBeGreaterThan(cardBottom);
    await press(half);
    await expect(slot(page, "zoom").getByRole("button", { name: "Zoom 50%", exact: true })).toBeVisible();
    await expect(page.getByRole("menu", { name: "Zoom" })).toBeHidden();
    expect(await barPitches(page)).toEqual({ ruler: 40, chords: 40, vocal: 40, ins: 40 });
  });
});

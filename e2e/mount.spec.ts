// ABOUTME: Seam 5: the mounted editor driven in real Chromium through a bare test page.
// ABOUTME: Covers the read-only arrangement of real song2 scores, zoom and scroll, and what update and destroy leave behind.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

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

// Expected counts below are hand-counted from the score files (bar lines of the Vocal music lines), not read back from the reader.

test.describe("the arrangement of a song2 score", () => {
  test("a two-voice sample gets a ruler that counts its bars and one track for each voice", async ({
    page,
    harness,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const bars = page.getByRole("list", { name: "Bars" }).getByRole("listitem");
    await expect(bars).toHaveCount(28);
    await expect(bars.first()).toHaveText("1");
    await expect(bars.last()).toHaveText("28");
    await expect(page.getByRole("list", { name: "Vocal" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Ins" })).toBeVisible();
  });

  test("a Vocal-only score gets one track", async ({ page, harness }) => {
    await harness.mount({ score: { sample: "vocal-only-melody" } });
    await expect(page.getByRole("list", { name: "Bars" }).getByRole("listitem").last()).toHaveText("235");
    await expect(page.getByRole("list", { name: "Vocal" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Ins" })).toHaveCount(0);
  });

  test("section bands carry the names of the section markers and run from their first bar to the next band", async ({
    page,
    harness,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const bands = page.getByRole("list", { name: "Sections" }).getByRole("listitem");
    await expect(bands).toHaveText(["intro", "verse", "chorus"]);
    const bar = (number: string) => page.getByRole("list", { name: "Bars" }).getByText(number, { exact: true });
    const [intro, verse, chorus] = [await box(bands.nth(0)), await box(bands.nth(1)), await box(bands.nth(2))];
    expect(intro.x).toBeCloseTo((await box(bar("1"))).x, 0);
    expect(verse.x).toBeCloseTo((await box(bar("5"))).x, 0);
    expect(chorus.x).toBeCloseTo((await box(bar("13"))).x, 0);
    expect(verse.width).toBeCloseTo(chorus.x - verse.x, 0);
  });

  test("music before the first marker gets a neutral name, and a marker with no bars draws no band", async ({
    page,
    harness,
  }) => {
    const header = [
      "X:1",
      "T:",
      "M:4/4",
      "L:1/16",
      "Q:1/4=100",
      'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
      "K:C",
    ];
    const opening = [...header, "V: Vocal", "C16|", "% verse", "% chorus", "V: Vocal", "D16|", ""].join("\n");
    await harness.mount({ score: { text: opening } });
    const bands = page.getByRole("list", { name: "Sections" }).getByRole("listitem");
    await expect(bands).toHaveText(["Unnamed", "chorus"]);

    await harness.update({ language: "zh" });
    await expect(page.getByRole("list", { name: "小节" }).getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("list", { name: "段落" }).getByRole("listitem")).toHaveText(["未命名", "chorus"]);
  });

  test("the chord track, above Vocal, names every chord of the score in order", async ({ page, harness }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const chords = page.getByRole("list", { name: "Chords" });
    // intro, verse (two lines), chorus (four lines), one chord per bar, read off the score text.
    await expect(chords.getByRole("listitem")).toHaveText([
      ...["F", "F", "F", "F"],
      ...["F", "F", "Dm", "Dm", "Bb", "Bb", "C", "C"],
      ...["F", "C/E", "Dm", "Dm", "F", "C/E", "Dm", "Dm", "Bb", "C", "Bb", "C", "F", "F", "F", "F"],
    ]);
    await page.getByRole("region", { name: "Arrangement" }).evaluate((el) => el.scrollTo(0, 0));
    const above = await box(chords);
    const vocal = await box(page.getByRole("list", { name: "Vocal" }));
    expect(above.y + above.height).toBeLessThanOrEqual(vocal.y);
  });

  test("a chord sits at the beat where the score writes it", async ({ page, harness }) => {
    await harness.mount({ score: { sample: "short-two-sections" } });
    // Bar 1 reads z12"A"e2e2: three beats of rest, then the chord A, so A starts three quarters into bar 1.
    const bar = (number: string) => page.getByRole("list", { name: "Bars" }).getByText(number, { exact: true });
    const [first, second] = [await box(bar("1")), await box(bar("2"))];
    const chord = page.getByRole("list", { name: "Chords" }).getByRole("listitem").first();
    await expect(chord).toHaveText("A");
    expect((await box(chord)).x).toBeCloseTo(first.x + 0.75 * (second.x - first.x), 0);
  });

  test("a score without chords says so in the chord track", async ({ page, harness }) => {
    await harness.mount({ score: { vector: "accept-vocal-only" } });
    await expect(page.getByText("No chords in this score")).toBeVisible();
    await expect(page.getByRole("list", { name: "Chords" })).toHaveCount(0);
  });

  test("notes are drawn on their pitch row and a rest is a gap, not a block", async ({ page, harness }) => {
    // Bar 1: a quarter C4, a quarter rest, a half D4. Bar 2: a whole C4.
    await harness.mount({ score: { text: vocalOnly("C4z4D8|C16|") } });
    const notes = page.getByRole("list", { name: "Vocal" }).getByRole("listitem");
    await expect(notes).toHaveCount(3);
    const c4 = page.getByRole("listitem", { name: "C4, bar 1 beat 1, length 1 beat" });
    const d4 = page.getByRole("listitem", { name: "D4, bar 1 beat 3, length 2 beats" });
    await expect(c4).toBeVisible();
    const [first, second] = [await box(c4), await box(d4)];
    const barLeft = async (number: string) =>
      (await box(page.getByRole("list", { name: "Bars" }).getByText(number, { exact: true }))).x;
    const beat = ((await barLeft("2")) - (await barLeft("1"))) / 4;
    // The rest between them is exactly one beat wide; the notes keep a one pixel gap so neighbours read apart.
    expect(second.x - (first.x + first.width)).toBeCloseTo(beat + 1, 0);
    // D4 is two semitones above C4, and a pitch row is one note high.
    expect(first.y - second.y).toBeCloseTo(2 * first.height, 0);
  });

  test("tied notes read as one connected bar, untied neighbours keep a gap", async ({ page, harness }) => {
    await harness.mount({ score: { text: vocalOnly("^F16-|F16|C16|") } });
    const tied = page.getByRole("listitem", { name: "F#4, bar 1 beat 1, length 4 beats, tied to the next note" });
    await expect(tied).toBeVisible();
    const continued = page.getByRole("listitem", { name: "F#4, bar 2 beat 1, length 4 beats" });
    const [head, tail] = [await box(tied), await box(continued)];
    expect(tail.x - (head.x + head.width)).toBeCloseTo(0, 0);
    const apart = [await box(continued), await box(page.getByRole("listitem", { name: /^C4, bar 3/ }))];
    expect(
      (apart[1] as { x: number }).x -
        ((apart[0] as { x: number; width: number }).x + (apart[0] as { width: number }).width),
    ).toBeCloseTo(1, 0);
  });

  test("each track labels its octaves in a pitch column that lines up with the notes", async ({ page, harness }) => {
    await harness.mount({ score: { text: vocalOnly("C4D4E4F4|c16|") } });
    const c4 = await box(page.getByRole("listitem", { name: /^C4, bar 1 beat 1/ }));
    const label = await box(page.getByText("C4", { exact: true }));
    const c5 = await box(page.getByRole("listitem", { name: /^C5, bar 2/ }));
    expect(label.y + label.height).toBeCloseTo(c4.y + c4.height, -1);
    expect(c4.y - c5.y).toBeCloseTo(12 * c4.height, 0);
    await expect(page.getByText("C5", { exact: true })).toBeVisible();
  });

  test("key and meter marks stand where they take effect: at a bar line, and inside a bar for a key change", async ({
    page,
    harness,
  }) => {
    // D major in 4/4; bar 2 changes to B-flat major after two beats; bar 3 is 3/4 in E-flat major.
    await harness.mount({ score: { vector: "accept-two-voices-meter-and-key-changes" } });
    const marks = page.getByRole("list", { name: "Marks" }).getByRole("listitem");
    await expect(marks).toHaveCount(3);
    await expect(marks.nth(0)).toContainText("4/4");
    await expect(marks.nth(0)).toContainText("Key D");
    await expect(marks.nth(1)).toHaveText("Key Bb");
    await expect(marks.nth(2)).toContainText("3/4");
    await expect(marks.nth(2)).toContainText("Key Eb");

    const bar = async (number: string) =>
      (await box(page.getByRole("list", { name: "Bars" }).getByText(number, { exact: true }))).x;
    const [one, two, three] = [await bar("1"), await bar("2"), await bar("3")];
    expect((await box(marks.nth(0))).x).toBeCloseTo(one, 0);
    expect((await box(marks.nth(1))).x).toBeCloseTo(two + (three - two) / 2, 0);
    expect((await box(marks.nth(2))).x).toBeCloseTo(three, 0);
  });

  test("a score that never changes key or meter has one mark, at the start", async ({ page, harness }) => {
    await harness.mount({ score: { vector: "accept-vocal-only" } });
    const marks = page.getByRole("list", { name: "Marks" }).getByRole("listitem");
    await expect(marks).toHaveCount(1);
    await expect(marks).toContainText("4/4");
    await expect(marks).toContainText("Key C");
  });

  test("a score cut inside its last bar marks that bar as incomplete and says what that means", async ({
    page,
    harness,
  }) => {
    // The text stops after C8, half of a 4/4 bar.
    await harness.mount({ score: { vector: "truncate-partial-measure" } });
    await expect(page.getByRole("note")).toHaveText("This score is cut off: bar 1 of Vocal is incomplete.");
    await expect(page.getByRole("list", { name: "Marks" }).getByText("Incomplete bar")).toBeVisible();
  });

  test("a cut in the Ins voice of a long score is marked at the bar where Ins stops", async ({ page, harness }) => {
    // Vocal has 235 bars; its last line starts at bar 232, and the Ins line there stops after e6f6g (bar 232 of Ins).
    await harness.mount({ score: { sample: "melody-cut-tail" } });
    await expect(page.getByRole("note")).toHaveText("This score is cut off: bar 232 of Ins is incomplete.");
    const flag = page.getByRole("list", { name: "Marks" }).getByRole("listitem").filter({ hasText: "Incomplete bar" });
    const bar = page.getByRole("list", { name: "Bars" }).getByText("232", { exact: true });
    expect((await box(flag)).x).toBeCloseTo((await box(bar)).x, 0);
  });

  test("a cut at a bar line is marked at the end of the score", async ({ page, harness }) => {
    // One complete bar, then a section marker and nothing else.
    await harness.mount({ score: { vector: "truncate-after-comment" } });
    await expect(page.getByRole("note")).toHaveText("This score is cut off after bar 1 of Vocal.");
    const flag = page.getByRole("list", { name: "Marks" }).getByRole("listitem").filter({ hasText: "Cut off" });
    await expect(flag).toBeVisible();
    const lane = await box(page.getByRole("list", { name: "Vocal" }));
    const end = (await box(flag)).x + (await box(flag)).width;
    expect(end).toBeCloseTo(lane.x + lane.width, 0);
  });

  test("a complete score shows no cut message", async ({ page, harness }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    await expect(page.getByRole("list", { name: "Vocal" })).toBeVisible();
    await expect(page.getByRole("note")).toHaveCount(0);
    await expect(page.getByText("Incomplete bar")).toHaveCount(0);
  });
});

test.describe("zoom on the time axis", () => {
  const barWidth = async (page: Page) => {
    const bar = (number: string) => page.getByRole("list", { name: "Bars" }).getByText(number, { exact: true });
    return (await box(bar("2"))).x - (await box(bar("1"))).x;
  };

  test("zooming in and out changes how wide a bar is, by button, by menu and with the keyboard", async ({
    page,
    harness,
    isMobile,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const press = (target: Locator) => (isMobile ? target.tap() : target.click());
    const readout = (value: string) => page.getByRole("button", { name: `Zoom ${value}`, exact: true });
    await expect(readout("100%")).toBeVisible();
    const normal = await barWidth(page);
    // A 2/4 bar at 40 pixels a beat.
    expect(normal).toBeCloseTo(80, 0);

    await press(page.getByRole("button", { name: "Zoom in", exact: true }));
    await expect(readout("150%")).toBeVisible();
    expect(await barWidth(page)).toBeCloseTo(normal * 1.5, 0);

    await press(page.getByRole("button", { name: "Zoom out", exact: true }));
    await press(page.getByRole("button", { name: "Zoom out", exact: true }));
    await expect(readout("50%")).toBeVisible();
    expect(await barWidth(page)).toBeCloseTo(normal / 2, 0);

    await press(readout("50%"));
    await press(page.getByRole("menuitemradio", { name: "200%" }));
    await expect(readout("200%")).toBeVisible();
    expect(await barWidth(page)).toBeCloseTo(normal * 2, 0);

    if (!isMobile) {
      await page.getByRole("region", { name: "Arrangement" }).focus();
      await page.keyboard.press("-");
      await expect(readout("150%")).toBeVisible();
      await page.keyboard.press("-");
      await page.keyboard.press("-");
      await expect(readout("50%")).toBeVisible();
      await page.keyboard.press("+");
      await expect(readout("100%")).toBeVisible();
      expect(await barWidth(page)).toBeCloseTo(normal, 0);
    }
  });

  test("the zoom controls are tall enough for a finger on a coarse pointer", async ({ page, harness, isMobile }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const height = (await box(page.getByRole("button", { name: "Zoom in", exact: true }))).height;
    if (isMobile) expect(height).toBeGreaterThanOrEqual(36);
    else expect(height).toBeLessThan(36);
  });

  test("fitting the song shows all of it at once", async ({ page, harness, isMobile }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const press = (target: Locator) => (isMobile ? target.tap() : target.click());
    const roll = page.getByRole("region", { name: "Arrangement" });
    const widths = () => roll.evaluate((el) => ({ content: el.scrollWidth, shown: el.clientWidth }));
    expect((await widths()).content).toBeGreaterThan((await widths()).shown);

    await press(page.getByRole("button", { name: /^Zoom \d+%$/ }));
    await press(page.getByRole("menuitem", { name: "Fit whole song" }));
    const fitted = await widths();
    expect(fitted.content).toBeLessThanOrEqual(fitted.shown);
    expect(await roll.evaluate((el) => el.scrollLeft)).toBe(0);
  });

  test("bar numbers thin out when bars get too narrow to carry them", async ({ page, harness, isMobile }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const press = (target: Locator) => (isMobile ? target.tap() : target.click());
    const bars = page.getByRole("list", { name: "Bars" }).getByRole("listitem");
    await expect(bars).toHaveCount(28);

    await press(page.getByRole("button", { name: "Zoom 100%", exact: true }));
    await press(page.getByRole("menuitemradio", { name: "10%" }));
    await expect(bars.first()).toHaveText("1");
    const shown = await bars.count();
    expect(shown).toBeLessThan(28);
    expect(shown).toBeGreaterThan(3);
    const [first, second] = [await box(bars.nth(0)), await box(bars.nth(1))];
    expect(second.x - first.x).toBeGreaterThanOrEqual(32);
  });
});

test.describe("zoom with the wheel", () => {
  test.skip(({ isMobile }) => isMobile, "the wheel is a mouse gesture, checked on the desktop project");

  test("control and the wheel zoom around the pointer", async ({ page, harness }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const bar = (number: string) => page.getByRole("list", { name: "Bars" }).getByText(number, { exact: true });
    const before = await box(bar("3"));
    await page.mouse.move(before.x, before.y + 30);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect(page.getByRole("button", { name: /^Zoom (?!100%)\d+%$/ })).toBeVisible();
    const after = await box(bar("3"));
    expect(after.x).toBeCloseTo(before.x, -1);
    const spacing = (await box(bar("4"))).x - after.x;
    // The 2/4 bars were 80 pixels wide; one notch of the wheel zooms in by about a quarter.
    expect(spacing).toBeGreaterThan(90);
  });
});

test.describe("scrolling in time and in pitch", () => {
  // Vocal sings E4 in the middle of a score that also reaches C2 at the bottom and C7 at the top.
  const wideRange = vocalOnly("C,,4E4c''4z4|E16|E16|E16|", "E16|E16|E16|E16|", "E16|E16|E16|E16|", "E16|E16|E16|E16|");

  /** Whether a note is inside the roll and clear of the pinned header and the track head above it. */
  const visibleNote = async (page: Page, name: string) => {
    const roll = await box(page.getByRole("region", { name: "Arrangement" }));
    const head = await box(page.getByText("Vocal", { exact: true }));
    const note = await box(page.getByRole("listitem", { name }));
    return note.y >= head.y + head.height && note.y + note.height <= roll.y + roll.height;
  };

  test("the roll opens on the middle of Vocal's notes, and the wheel scrolls it in pitch and in time", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "the wheel is a mouse gesture, checked on the desktop project");
    await harness.mount({ score: { text: wideRange } });
    const roll = page.getByRole("region", { name: "Arrangement" });
    expect(await visibleNote(page, "E4, bar 1 beat 2, length 1 beat")).toBe(true);
    expect(await visibleNote(page, "C2, bar 1 beat 1, length 1 beat")).toBe(false);

    const frame = await box(roll);
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.wheel(0, 3000);
    await expect.poll(() => visibleNote(page, "C2, bar 1 beat 1, length 1 beat")).toBe(true);

    await page.mouse.wheel(600, 0);
    await expect.poll(() => roll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
  });

  test("the arrow keys scroll the focused roll in time and in pitch", async ({ page, harness, isMobile }) => {
    test.skip(isMobile, "keys are checked on the desktop project");
    await harness.mount({ score: { text: wideRange } });
    const roll = page.getByRole("region", { name: "Arrangement" });
    await roll.focus();
    const offset = () => roll.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    const start = await offset();
    for (let press = 0; press < 5; press++) await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await offset()).left).toBeGreaterThan(start.left);
    await page.keyboard.press("PageDown");
    await expect.poll(async () => (await offset()).top).toBeGreaterThan(start.top);
  });

  test("a finger on the roll scrolls it in time and in pitch", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "touch gestures run on the phone project");
    await harness.mount({ score: { text: wideRange } });
    const roll = page.getByRole("region", { name: "Arrangement" });
    const frame = await box(roll);
    const offset = () => roll.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    const start = await offset();

    const from = { x: frame.x + frame.width * 0.75, y: frame.y + frame.height - 20 };
    await harness.swipe(from, { x: from.x - 200, y: from.y });
    await expect.poll(async () => (await offset()).left).toBeGreaterThan(start.left + 100);

    const middle = { x: frame.x + frame.width * 0.75, y: frame.y + frame.height - 20 };
    await harness.swipe(middle, { x: middle.x, y: middle.y - 150 });
    await expect.poll(async () => (await offset()).top).toBeGreaterThan(start.top + 50);
  });
});

test.describe("a score that cannot be shown", () => {
  test("a score that does not read shows its diagnostics in the interface language, and a good project replaces them with the view", async ({
    page,
    harness,
  }) => {
    // The duration 5 is not one the format writes.
    await harness.mount({ score: { vector: "reject-duration-five" } });
    const problem = page.getByRole("alert");
    await expect(problem).toContainText("This score can't be shown because it can't be read.");
    await expect(problem.getByRole("listitem")).toHaveText(["The duration “5” is not allowed. (bar 1, line 10)"]);
    await expect(page.getByRole("region", { name: "Arrangement" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Zoom/ })).toHaveCount(0);

    await harness.update({ language: "zh" });
    await expect(problem.getByRole("listitem")).toHaveText(["时值 “5”不在允许的范围内。（第 1 小节，第 10 行）"]);

    await harness.update({ score: { sample: "compact-three-sections" } });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "编曲视图" })).toBeVisible();
    await expect(page.getByRole("list", { name: "小节" }).getByRole("listitem")).toHaveCount(28);

    await harness.update({ score: { vector: "reject-duration-five" } });
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("region", { name: "编曲视图" })).toHaveCount(0);
  });

  test("a cut message does not outlive the score it described", async ({ page, harness }) => {
    await harness.mount({ score: { vector: "truncate-partial-measure" } });
    await expect(page.getByRole("note")).toBeVisible();
    await harness.update({ score: { vector: "reject-duration-five" } });
    await expect(page.getByRole("note")).toHaveCount(0);
  });

  test("a model with no dialect gets one plain sentence and no view", async ({ page, harness }) => {
    await harness.mount({ project: { modelId: "other-model" } });
    await expect(page.getByRole("alert")).toHaveText(
      "The score format of “other-model” isn't supported by this editor, so the score can't be shown.",
    );
    await expect(page.getByRole("region", { name: "Arrangement" })).toHaveCount(0);

    await harness.update({ language: "zh" });
    await expect(page.getByRole("alert")).toHaveText("这个编辑器不支持“other-model”的乐谱格式，所以无法显示这份乐谱。");

    await harness.update({ project: { modelId: "song2" } });
    await expect(page.getByRole("region", { name: "编曲视图" })).toBeVisible();
  });

  test("changing only other fields of the project keeps the view as the user left it", async ({ page, harness }) => {
    await harness.mount({ score: { text: vocalOnly("C16|C16|C16|C16|", "C16|C16|C16|C16|", "C16|C16|C16|C16|") } });
    const roll = page.getByRole("region", { name: "Arrangement" });
    await roll.evaluate((el) => el.scrollTo(300, 0));
    await harness.update({ project: { style: "a different style", seed: 7 } });
    expect(await roll.evaluate((el) => el.scrollLeft)).toBe(300);
    await harness.update({ language: "zh" });
    expect(await page.getByRole("region", { name: "编曲视图" }).evaluate((el) => el.scrollLeft)).toBe(300);
  });
});

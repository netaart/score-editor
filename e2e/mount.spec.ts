// ABOUTME: Seam 5: the mounted editor driven in real Chromium through a bare test page.
// ABOUTME: Covers the read-only arrangement of real song2 scores, zoom and scroll, and what update and destroy leave behind.
import type { Locator, Page } from "@playwright/test";
import { box, expect, test, vocalOnly } from "./fixtures";

/** Per item: its text drawn whole inside its cell, left out (pushed out of sight), or cut off, which is a misreading. */
function textFit(items: Locator) {
  return items.evaluateAll((elements) =>
    elements.map((element) => {
      const cell = (element.closest('[role="listitem"]') ?? element).getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      if (text.top >= cell.bottom - 1) return "left out";
      const inside =
        text.left >= cell.left - 0.5 &&
        text.right <= cell.right + 0.5 &&
        text.top >= cell.top - 0.5 &&
        text.bottom <= cell.bottom + 0.5;
      return inside ? "whole" : "cut off";
    }),
  );
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

  test("the key and meter in force stay readable while the view is scrolled past where they were set", async ({
    page,
    harness,
  }) => {
    await harness.mount({ score: { text: vocalOnly("C16|C16|C16|C16|", "C16|C16|C16|C16|") } });
    const roll = page.getByRole("region", { name: "Arrangement" });
    await page.getByRole("button", { name: "Zoom 100%", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "400%", exact: true }).click();
    await roll.evaluate((el) => el.scrollTo(1000, 0));
    // The flag starts at bar 1, 1000 pixels to the left of what is shown; its text stays at the pitch column's edge.
    const keys = (await box(roll)).x + 44;
    const text = await box(page.getByRole("list", { name: "Marks" }).getByText("Key C"));
    expect(text.x).toBeGreaterThanOrEqual(keys);
    expect(text.x).toBeLessThan(keys + 60);
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

  test("the cut notice leads with a swatch of the hatch", async ({ page, harness }) => {
    await harness.mount({ score: { vector: "truncate-partial-measure" } });
    const swatch = await page.getByRole("note").evaluate((el) => ({
      content: getComputedStyle(el, "::before").content,
      display: getComputedStyle(el, "::before").display,
    }));
    expect(swatch).toEqual({ content: '""', display: "inline-block" });
  });

  test("a cut in the Ins voice of a long score is marked at the bar where Ins stops", async ({ page, harness }) => {
    // Vocal has 235 bars; its last line starts at bar 232, and the Ins line there stops after e6f6g (bar 232 of Ins).
    await harness.mount({ score: { sample: "melody-cut-tail" } });
    await expect(page.getByRole("note")).toHaveText("This score is cut off: bar 232 of Ins is incomplete.");
    const flag = page.getByRole("list", { name: "Marks" }).getByRole("listitem").filter({ hasText: "Incomplete bar" });
    const bar = page.getByRole("list", { name: "Bars" }).getByText("232", { exact: true });
    expect((await box(flag)).x).toBeCloseTo((await box(bar)).x, 0);
  });

  test("a cut bar with nothing finished in it is still drawn and marked where it is", async ({ page, harness }) => {
    // Bar 1 is a whole C tied into a B that the cut left unfinished, so bar 2 holds no finished note.
    await harness.mount({ score: { vector: "truncate-tie-mismatch-final" } });
    await expect(page.getByRole("note")).toHaveText("This score is cut off: bar 2 of Vocal is incomplete.");
    const flag = page.getByRole("list", { name: "Marks" }).getByRole("listitem").filter({ hasText: "Incomplete bar" });
    const bar = page.getByRole("list", { name: "Bars" }).getByText("2", { exact: true });
    await expect(flag).toBeVisible();
    await expect(bar).toBeVisible();
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

  test("a chord name that does not fit its bar is left out, never shown cut off", async ({ page, harness }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    await page.getByRole("button", { name: "Zoom 100%", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "25%", exact: true }).click();
    // A 2/4 bar is 20 pixels wide now: the one-letter chords fit, the longer names do not.
    const fits = await textFit(page.getByRole("list", { name: "Chords" }).getByRole("listitem"));
    expect(fits).not.toContain("cut off");
    expect(fits.filter((fit) => fit === "whole").length).toBeGreaterThan(5);
    expect(fits.filter((fit) => fit === "left out").length).toBeGreaterThan(5);
  });

  test("a mark that does not fit its stretch is left out whole, never shown cut off", async ({ page, harness }) => {
    await harness.mount({ score: { vector: "accept-two-voices-meter-and-key-changes" } });
    await page.getByRole("button", { name: "Zoom 100%", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "25%", exact: true }).click();
    // Two beats of Bb major are 20 pixels wide now, and the 3/4 bar 30.
    const fits = await textFit(page.getByRole("list", { name: "Marks" }).locator("span"));
    expect(fits).not.toContain("cut off");
    expect(fits).toContain("whole");
    expect(fits).toContain("left out");
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
    // Wheel the way a person does, until the note shows: one long wheel runs to the bottom of the octave under the
    // lowest note, which puts that note behind the pinned header whenever the roll is short.
    await expect
      .poll(async () => {
        if (await visibleNote(page, "C2, bar 1 beat 1, length 1 beat")) return true;
        await page.mouse.wheel(0, 100);
        return false;
      })
      .toBe(true);

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

  test("the zoom, and the bar numbers it thins out, survive an update that draws the view again", async ({
    page,
    harness,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    await page.getByRole("button", { name: "Zoom 100%", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "10%", exact: true }).click();
    const numbers = (name: string) => page.getByRole("list", { name }).getByRole("listitem").filter({ visible: true });
    const before = await numbers("Bars").count();
    expect(before).toBeLessThan(28);

    await harness.update({ language: "zh" });
    await expect(page.getByRole("button", { name: "缩放 10%", exact: true })).toBeVisible();
    expect(await numbers("小节").count()).toBe(before);
  });
});

test("update switches the interface language and back", async ({ page, harness }) => {
  // Bar 1 is a quarter C4, a quarter rest and a half D4; bar 2 stops after a half note.
  await harness.mount({ language: "en", editable: false, score: { text: vocalOnly("C4z4D8|C8") } });
  await expect(page.getByRole("region", { name: "Arrangement" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom 100%", exact: true })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "C4, bar 1 beat 1, length 1 beat" })).toBeVisible();
  await expect(page.getByText("No chords in this score")).toBeVisible();
  await expect(page.getByText("Key C")).toBeVisible();
  await expect(page.getByText("Read only")).toBeVisible();
  await expect(page.getByRole("note")).toHaveText("This score is cut off: bar 2 of Vocal is incomplete.");

  await harness.update({ language: "zh" });
  await expect(page.getByRole("region", { name: "编曲视图" })).toBeVisible();
  await expect(page.getByRole("button", { name: "缩放 100%", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "放大", exact: true })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "C4，第 1 小节第 1 拍，长 1 拍" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "C4, bar 1 beat 1, length 1 beat" })).toHaveCount(0);
  await expect(page.getByText("调号 C")).toBeVisible();
  await expect(page.getByText("这份乐谱里没有和弦")).toBeVisible();
  await expect(page.getByText("只读")).toBeVisible();
  await expect(page.getByRole("note")).toHaveText("这份乐谱在末尾被截断：Vocal 的第 2 小节不完整。");

  await harness.update({ language: "en", editable: true });
  await expect(page.getByRole("region", { name: "Arrangement" })).toBeVisible();
  await expect(page.getByText("Read only")).toBeHidden();
});

test("repeated update and destroy leave no listeners and no nodes behind", async ({ page, harness }) => {
  const cdp = await page.context().newCDPSession(page);
  const listenerCount = async (expression: string) => {
    const { result } = await cdp.send("Runtime.evaluate", { expression });
    if (!result.objectId) throw new Error(`no object for ${expression}`);
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
    return listeners.length;
  };
  const globals = [
    "window",
    "document",
    "document.documentElement",
    "document.body",
    "document.head",
    "window.harness.stage",
  ];
  const countGlobals = () => Promise.all(globals.map(listenerCount));
  const before = await countGlobals();
  const htmlBefore = await page.evaluate(() => document.documentElement.outerHTML);
  const adoptedSheets = () => page.evaluate(() => document.adoptedStyleSheets.length);
  const sheetsBefore = await adoptedSheets();

  for (let cycle = 0; cycle < 4; cycle++) {
    await harness.mount();
    await harness.update({ language: "zh" });
    await harness.update({ editable: false });
    await harness.update({ score: { vector: "reject-duration-five" } });
    await harness.update({ score: { sample: "short-two-sections" } });
    await harness.update({ language: "en", editable: true });
    await harness.destroy();
    await harness.destroy();
    await harness.update({ language: "zh" });
  }
  expect(await countGlobals()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(htmlBefore);
  expect(await adoptedSheets()).toBe(sheetsBefore);

  await harness.mount();
  expect(await adoptedSheets()).toBe(sheetsBefore + 1);
  await page.getByRole("button", { name: /^Zoom \d+%$/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "200%" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Zoom \d+%$/ })).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => window.harness.stage.firstElementChild?.nodeName)).toBe("DIV");
  await page.evaluate(() => {
    const kept = [window.harness.stage.firstElementChild as Element];
    kept.push(...(kept[0] as Element).querySelectorAll("*"));
    Object.assign(window, { kept });
  });
  const keptListeners = async () => {
    const { result } = await cdp.send("Runtime.evaluate", { expression: "window.kept" });
    const { result: length } = await cdp.send("Runtime.evaluate", { expression: "window.kept.length" });
    if (!result.objectId) throw new Error("kept nodes missing");
    let total = 0;
    for (let index = 0; index < Number(length.value); index++) {
      const { result: node } = await cdp.send("Runtime.evaluate", { expression: `window.kept[${index}]` });
      if (!node.objectId) continue;
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: node.objectId });
      total += listeners.length;
    }
    return total;
  };
  expect(await keptListeners()).toBeGreaterThan(0);
  await harness.destroy();
  expect(await keptListeners()).toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll(":popover-open").length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(htmlBefore);
  expect(await adoptedSheets()).toBe(sheetsBefore);
  await expect(page.getByRole("menuitemradio")).toHaveCount(0);
  await cdp.detach();

  await harness.mount();
  await expect(page.evaluate(() => window.harness.mount())).rejects.toThrow(/already holds an editor/);
  await harness.destroy();
});

test.describe("host styling", () => {
  test.skip(({ isMobile }) => isMobile, "styling is checked once, on the desktop project");
  // Bar 1 is a quarter C4, a quarter rest and a half D4, then two whole bars.
  const score = { text: vocalOnly("C4z4D8|C16|C16|") };
  const c4 = "C4, bar 1 beat 1, length 1 beat";

  test("host theme variables restyle the editor, with neutral defaults and the host's colour scheme when unmapped", async ({
    page,
    harness,
  }) => {
    await harness.mount({ score });
    const note = page.getByRole("listitem", { name: c4 });
    const roll = page.getByRole("region", { name: "Arrangement" });
    const colour = (target: Locator, property: "backgroundColor" | "fontFamily") =>
      target.evaluate((el, name) => getComputedStyle(el)[name], property);
    const lightness = async () => {
      const [r = 0, g = 0, b = 0] = (await colour(roll, "backgroundColor")).match(/\d+/g)?.map(Number) ?? [];
      return (r + g + b) / 3;
    };

    expect(await lightness()).toBeGreaterThan(200);
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = "dark";
    });
    expect(await lightness()).toBeLessThan(60);
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = "";
    });

    await page.evaluate(() => {
      const { style } = window.harness.stage;
      style.setProperty("--sce-color-note", "rgb(255, 0, 128)");
      style.setProperty("--sce-color-bg", "rgb(10, 20, 30)");
      style.setProperty("--sce-font-family", "'Courier New', monospace");
    });
    expect(await colour(note, "backgroundColor")).toBe("rgb(255, 0, 128)");
    expect(await colour(roll, "backgroundColor")).toBe("rgb(10, 20, 30)");
    expect(await colour(page.getByText("Arrangement", { exact: true }), "fontFamily")).toContain("Courier New");
  });

  test("a host that maps only the background and text colours still gets readable text everywhere", async ({
    page,
    harness,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    await page.evaluate(() => {
      const { style } = window.harness.stage;
      style.setProperty("--sce-color-bg", "rgb(18, 19, 22)");
      style.setProperty("--sce-color-text", "rgb(232, 233, 237)");
    });
    const contrastOf = (target: Locator) =>
      target.evaluate((el) => {
        const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
        if (!canvas) throw new Error("no canvas");
        const paint = (css: string) => {
          canvas.fillStyle = css;
          canvas.fillRect(0, 0, 1, 1);
        };
        const pixel = () => Array.from(canvas.getImageData(0, 0, 1, 1).data.slice(0, 3));
        const luminance = ([r = 0, g = 0, b = 0]: number[]) => {
          const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
        };
        // The backdrop is every ancestor's background laid over white, outermost first: tints are translucent.
        const layers: string[] = [];
        for (let node: Element | null = el; node; node = node.parentElement) {
          layers.unshift(getComputedStyle(node).backgroundColor);
        }
        paint("white");
        for (const layer of layers) paint(layer);
        const backdrop = luminance(pixel());
        paint(getComputedStyle(el).color);
        const text = luminance(pixel());
        return (Math.max(text, backdrop) + 0.05) / (Math.min(text, backdrop) + 0.05);
      });
    const texts: Record<string, Locator> = {
      title: page.getByText("Arrangement", { exact: true }),
      "zoom label": page.getByText("Zoom", { exact: true }),
      "zoom value": page.getByText("100%", { exact: true }).first(),
      "bar number": page.getByRole("list", { name: "Bars" }).getByText("2", { exact: true }),
      "section name": page.getByRole("list", { name: "Sections" }).getByText("verse", { exact: true }),
      chord: page.getByRole("list", { name: "Chords" }).getByText("Dm", { exact: true }).first(),
      "meter mark": page.getByRole("list", { name: "Marks" }).getByText("2/4", { exact: true }),
      "key mark": page.getByRole("list", { name: "Marks" }).getByText(/^Key /),
      "track name": page.getByText("Vocal", { exact: true }),
      "octave label": page.getByText(/^C\d$/).first(),
    };
    for (const [what, target] of Object.entries(texts)) {
      expect(await contrastOf(target), `contrast of the ${what}`).toBeGreaterThan(4.5);
    }
  });

  test("the host's global styles do not change the editor, and the editor does not change the host", async ({
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
          ].map((name) => style.getPropertyValue(name));
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
      "width",
      "height",
    ];
    const parts = (): Record<string, Locator> => ({
      note: page.getByRole("listitem", { name: c4 }),
      title: page.getByText("Arrangement", { exact: true }),
      "zoom button": page.getByRole("button", { name: "Zoom 100%", exact: true }),
      "zoom in": page.getByRole("button", { name: "Zoom in", exact: true }),
      "bar number": page.getByRole("list", { name: "Bars" }).getByRole("listitem").first(),
      "section band": page.getByRole("list", { name: "Sections" }).getByRole("listitem").first(),
      "mark flag": page.getByRole("list", { name: "Marks" }).getByRole("listitem").first(),
      "track name": page.getByText("Vocal", { exact: true }),
      "octave label": page.getByText(/^C\d$/).first(),
      "no-chords message": page.getByText("No chords in this score"),
    });
    const styleOf = (target: Locator, list = names) =>
      target.evaluate(
        (el, properties) =>
          Object.fromEntries(properties.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
        list,
      );
    // A note carries no text, so only what it draws is compared; its text properties are never used.
    const drawn = names.filter((name) => !/^(font|line|letter|text|color)/.test(name));
    const styles = async () => {
      const found: Record<string, unknown> = {};
      for (const [what, target] of Object.entries(parts()))
        found[what] = await styleOf(target, what === "note" ? drawn : names);
    };

    await harness.mount({ score });
    const clean = await styles();
    await harness.destroy();

    await page.addStyleTag({
      content: `
        div, span, button { margin: 7px; padding: 9px; border: 3px solid red; border-radius: 0; background: yellow;
          color: red; font: italic 28px/3 cursive; letter-spacing: 4px; text-transform: uppercase;
          box-shadow: 0 0 0 5px green; position: static; width: auto; height: auto; }
        main div, main span, main button { opacity: 0.9; text-decoration: underline; }
      `,
    });
    const hostBefore = await probe();
    await harness.mount({ score });
    expect(await styles()).toEqual(clean);
    expect(await styleOf(parts().note as Locator)).toMatchObject({
      height: "14px",
      "border-top-width": "1px",
      "margin-top": "0px",
      "padding-top": "0px",
      "box-shadow": "none",
      opacity: "1",
    });
    expect(await styleOf(parts().title as Locator)).toMatchObject({
      "font-size": "13px",
      "font-style": "normal",
      "letter-spacing": "normal",
      "padding-top": "0px",
      "text-decoration-line": "none",
    });
    expect(await styleOf(parts()["zoom button"] as Locator)).toMatchObject({
      "font-size": "13px",
      "border-top-width": "1px",
      "padding-top": "0px",
    });

    expect(await probe()).toEqual(hostBefore);
    await harness.destroy();
    expect(await probe()).toEqual(hostBefore);
  });
});

test.describe("style delivery", () => {
  test.skip(({ isMobile }) => isMobile, "style delivery is checked once, on the desktop project");
  const score = { text: vocalOnly("C4z4D8|C16|C16|") };
  const c4 = "C4, bar 1 beat 1, length 1 beat";

  test("the editor is styled under a strict style policy, where an injected style element would be blocked", async ({
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
    await harness.mount({ score });
    const note = page.getByRole("listitem", { name: c4 });
    expect((await note.boundingBox())?.height).toBe(14);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();
    await harness.destroy();
  });

  test("inside a host's shadow root it is styled there, works, and is out of reach of rules even !important ones", async ({
    page,
    harness,
  }) => {
    await page.addStyleTag({
      content: "#shadow-host span, #shadow-host div { padding: 9px !important; color: red !important; }",
    });
    await harness.mount({ shadow: true, score });
    const result = await page.evaluate(() => ({
      sheets: window.harness.shadowRoot?.adoptedStyleSheets.length,
      documentSheets: document.adoptedStyleSheets.length,
    }));
    expect(result).toEqual({ sheets: 1, documentSheets: 0 });

    const title = page.getByText("Arrangement", { exact: true });
    expect(await title.evaluate((el) => [getComputedStyle(el).paddingTop, getComputedStyle(el).color])).toEqual([
      "0px",
      "rgb(24, 24, 27)",
    ]);
    const note = page.getByRole("listitem", { name: c4 });
    const noteBox = await note.boundingBox();
    if (!noteBox) throw new Error("the editor did not render inside the shadow root");
    expect(noteBox.height).toBe(14);

    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();
    // A note is its length less a one pixel gap, so a beat that grows from 40 to 60 pixels takes it from 39 to 59.
    expect((await box(note)).width).toBeCloseTo((noteBox.width + 1) * 1.5 - 1, 0);
    await page.getByRole("button", { name: "Zoom 150%", exact: true }).click();
    await expect(page.getByRole("menuitemradio", { name: "200%" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitemradio", { name: "200%" })).toBeHidden();

    await harness.destroy();
    const after = await page.evaluate(() => ({
      sheets: window.harness.shadowRoot?.adoptedStyleSheets.length,
      children: window.harness.shadowRoot?.firstElementChild?.childElementCount,
    }));
    expect(after).toEqual({ sheets: 0, children: 0 });
  });
});

test.describe("popovers", () => {
  test("the zoom menu works above a host's layers and past the clip of its container", async ({
    page,
    harness,
    isMobile,
  }) => {
    const press = (target: Locator) => (isMobile ? target.tap() : target.click());
    await page.evaluate(() => {
      const { stage } = window.harness;
      const layer = document.createElement("div");
      layer.style.cssText =
        "position:fixed;left:0;top:0;width:100vw;height:110px;z-index:1000;overflow:hidden;transform:translateZ(0);background:#ddd";
      document.body.append(layer);
      layer.append(stage);
      stage.style.height = "110px";
      const toast = document.createElement("div");
      toast.style.cssText =
        "position:fixed;left:0;top:70px;width:100vw;height:300px;z-index:2147483647;background:rgba(255,0,0,.4)";
      document.body.append(toast);
    });
    await harness.mount();

    await press(page.getByRole("button", { name: "Zoom 100%", exact: true }));
    const half = page.getByRole("menuitemradio", { name: "50%", exact: true });
    await expect(half).toBeVisible();
    const layerBottom = await page.evaluate(() => window.harness.stage.getBoundingClientRect().bottom);
    const menuBox = await page.getByRole("menu", { name: "Zoom" }).boundingBox();
    expect(menuBox ? menuBox.y + menuBox.height : 0).toBeGreaterThan(layerBottom);

    await press(half);
    await expect(page.getByRole("button", { name: "Zoom 50%", exact: true })).toBeVisible();
    await expect(page.getByRole("menu", { name: "Zoom" })).toBeHidden();
  });

  test.describe("on a desktop", () => {
    test.skip(({ isMobile }) => isMobile, "keyboard and modal dialogs are checked on the desktop project");

    test("it opens inside a host's modal dialog and closes with Escape, returning focus to its button", async ({
      page,
      harness,
    }) => {
      await page.evaluate(() => {
        const { stage } = window.harness;
        const dialog = document.createElement("dialog");
        dialog.style.cssText = "width:640px;height:120px;padding:0;overflow:hidden";
        document.body.append(dialog);
        dialog.append(stage);
        stage.style.height = "120px";
        dialog.showModal();
      });
      await harness.mount();
      const zoomButton = page.getByRole("button", { name: /^Zoom \d+%$/ });
      await zoomButton.click();
      const quarter = page.getByRole("menuitemradio", { name: "25%" });
      await expect(quarter).toBeVisible();
      await expect(page.getByRole("menuitemradio", { name: "100%" })).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("Escape");
      await expect(quarter).toBeHidden();
      await expect(zoomButton).toBeFocused();
      await zoomButton.click();
      await quarter.click();
      await expect(page.getByRole("button", { name: "Zoom 25%", exact: true })).toBeVisible();
    });

    test("the open menu is walked with the arrow keys and a choice is made with Enter", async ({ page, harness }) => {
      await harness.mount();
      await page.getByRole("button", { name: /^Zoom \d+%$/ }).click();
      const item = (name: string) => page.getByRole("menuitemradio", { name, exact: true });
      await expect(item("100%")).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(item("50%")).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(item("150%")).toBeFocused();
      await page.keyboard.press("End");
      await expect(page.getByRole("menuitem", { name: "Fit whole song" })).toBeFocused();
      await page.keyboard.press("Home");
      await expect(item("10%")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "Zoom 10%", exact: true })).toBeVisible();
      await expect(page.getByRole("menu", { name: "Zoom" })).toBeHidden();
    });
  });
});

/** The brightness, 0 to 255, of each pixel in a one pixel high strip of the page: what the user sees there. */
async function brightness(page: Page, x: number, y: number, width: number): Promise<number[]> {
  const png = await page.screenshot({ clip: { x, y, width, height: 1 } });
  return page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, 1);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, 1);
    return Array.from(
      { length: bitmap.width },
      (_, i) => 0.299 * (data[4 * i] ?? 0) + 0.587 * (data[4 * i + 1] ?? 0) + 0.114 * (data[4 * i + 2] ?? 0),
    );
  }, png.toString("base64"));
}

test.describe("the grid in the lanes", () => {
  test.skip(({ isMobile }) => isMobile, "pixels are read once, on the desktop project at a device scale of 1");

  /** How much darker than the empty lane the pixel `offset` pixels into the lane is, looking one pixel either side. */
  async function laneDarkness(page: Page, width: number) {
    const roll = page.getByRole("region", { name: "Arrangement" });
    await roll.evaluate((el) => el.scrollTo(0, 0));
    // The lane's top row is a white key above every note, so only the grid can be drawn there.
    const lane = await box(page.getByRole("list", { name: "Vocal" }));
    const start = Math.floor(lane.x);
    const pixels = await brightness(page, start, lane.y + 3, width);
    const at = (offset: number) => pixels[offset + Math.round(lane.x) - start] ?? 255;
    const blank = at(3);
    return (offset: number) => blank - Math.min(at(offset - 1), at(offset), at(offset + 1));
  }

  test("a strong line starts every bar and a light one every beat, and the beat lines follow the zoom", async ({
    page,
    harness,
  }) => {
    // Two 4/4 bars of four 40 pixel beats, then a 3/4 bar of three.
    await harness.mount({ score: { vector: "accept-two-voices-meter-and-key-changes" } });
    let darker = await laneDarkness(page, 450);
    for (const bar of [0, 160, 320]) expect(await darker(bar), `bar line at ${bar}`).toBeGreaterThan(40);
    for (const beat of [40, 80, 120, 200, 240, 280, 360, 400]) {
      const strength = await darker(beat);
      expect(strength, `beat line at ${beat}`).toBeGreaterThan(12);
      expect(strength, `beat line at ${beat} is lighter than a bar line`).toBeLessThan(await darker(0));
    }
    for (const between of [20, 100, 180, 260, 340])
      expect(await darker(between), `nothing at ${between}`).toBeLessThan(4);

    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Zoom 200%", exact: true })).toBeVisible();
    // A beat is 80 pixels now and a 4/4 bar 320.
    darker = await laneDarkness(page, 450);
    expect(await darker(320), "bar line at 320").toBeGreaterThan(40);
    expect(await darker(80), "beat line at 80").toBeGreaterThan(12);
    expect(await darker(40), "nothing where a beat used to end").toBeLessThan(4);

    await page.getByRole("button", { name: "Zoom 200%", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "25%", exact: true }).click();
    // Bars are 40 pixels now and beats 10: too close to read as lines, so only the bars are drawn.
    darker = await laneDarkness(page, 130);
    expect(await darker(40), "bar line at 40").toBeGreaterThan(40);
    expect(await darker(80), "bar line at 80").toBeGreaterThan(40);
    expect(await darker(10), "no beat line").toBeLessThan(4);
  });

  test("when bars are too narrow to carry lines, the lanes draw none, so the notes read clean", async ({
    page,
    harness,
  }) => {
    // 235 bars fitted to the width are about 5 pixels each.
    await harness.mount({ score: { sample: "vocal-only-melody" } });
    await page.getByRole("button", { name: /^Zoom \d+%$/ }).click();
    await page.getByRole("menuitem", { name: "Fit whole song" }).click();
    const darker = await laneDarkness(page, 400);
    let strongest = 0;
    for (let offset = 2; offset < 395; offset++) strongest = Math.max(strongest, await darker(offset));
    expect(strongest).toBeLessThan(4);
  });

  test("a legend of the cut's hatch stands before the sentence that explains the cut", async ({ page, harness }) => {
    await harness.mount({ score: { vector: "truncate-partial-measure" } });
    const notice = page.getByRole("note");
    const strip = await box(notice);
    // The padding is 12 pixels; the legend takes the next 14, so the sentence starts after them.
    const sentence = await notice.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().left;
    });
    expect(sentence).toBeGreaterThanOrEqual(strip.x + 12 + 14);
    const pixels = await brightness(page, strip.x + 12, strip.y + strip.height / 2, 14);
    expect(Math.max(...pixels) - Math.min(...pixels)).toBeGreaterThan(20);
  });

  test("a beat is the unit of the bar's meter: an eighth note in 6/8", async ({ page, harness }) => {
    const header = [
      "X:1",
      "T:",
      "M:6/8",
      "L:1/16",
      "Q:1/4=100",
      'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    ];
    await harness.mount({ score: { text: [...header, "K:C", "% a", "V: Vocal", "C12|C12|", ""].join("\n") } });
    // A 6/8 bar is six eighths of 20 pixels.
    const darker = await laneDarkness(page, 250);
    expect(await darker(0), "bar line").toBeGreaterThan(40);
    for (const beat of [20, 40, 60, 80, 100]) expect(await darker(beat), `beat line at ${beat}`).toBeGreaterThan(12);
    expect(await darker(120), "the next bar line").toBeGreaterThan(40);
    expect(await darker(10), "nothing between beats").toBeLessThan(4);
  });
});

test.describe("a larger default text size", () => {
  test.skip(({ isMobile }) => isMobile, "the text size is set once, on the desktop project");

  test("the header rows still hold their text and the track heads stay pinned right under them", async ({
    page,
    harness,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 24, fixed: 20 } });
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const title = page.getByText("Arrangement", { exact: true });
    expect(await title.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(18);

    const rows = ["Bars", "Sections", "Marks", "Chords"];
    for (const name of rows) {
      const fits = await textFit(page.getByRole("list", { name }).getByRole("listitem"));
      expect(fits, `the ${name} row`).not.toContain("cut off");
    }

    const roll = page.getByRole("region", { name: "Arrangement" });
    await roll.evaluate((el) => el.scrollTo(0, 200));
    const headerBottom =
      (await box(page.getByRole("list", { name: "Chords" }))).y +
      (await box(page.getByRole("list", { name: "Chords" }))).height;
    const head = await box(page.getByText("Vocal", { exact: true }));
    expect(head.y).toBeGreaterThanOrEqual(headerBottom - 0.5);
    expect(head.y).toBeLessThan(headerBottom + 8);
    await cdp.detach();
  });
});

test.describe("a narrow host", () => {
  test.skip(({ isMobile }) => isMobile, "the width is set once, on the desktop project");

  test("the read-only badge is not clipped when the toolbar has only 320 pixels", async ({ page, harness }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await harness.mount({ editable: false });
    const badge = await box(page.getByText("Read only", { exact: true }));
    const view = await box(page.getByRole("region", { name: "Arrangement" }));
    expect(badge.x).toBeGreaterThanOrEqual(view.x);
    expect(badge.x + badge.width).toBeLessThanOrEqual(view.x + view.width + 0.5);
  });
});

test.describe("editing in the default editor", () => {
  const QUARTERS = vocalOnly("C4D4E4F4|G16|");
  const noteNamed = (page: Page, name: RegExp | string) => page.getByRole("listitem", { name });
  const D4 = "D4, bar 1 beat 2, length 1 beat";
  const anyD4 = /^D4,/;
  const undoButton = (page: Page) => page.getByRole("button", { name: "Undo", exact: true });
  /**
   * A place in the Vocal lane, 70 pixels in, that no note covers and that is on screen: the row of the G, which starts in
   * bar 2. The editor pins its header over the top of the lane, so a place at the top edge is not one a finger can reach.
   */
  async function emptySpot(page: Page) {
    const lane = await box(page.getByRole("list", { name: "Vocal" }));
    const row = await box(noteNamed(page, /^G4,/));
    return { x: 70, y: row.y + row.height / 2 - lane.y };
  }
  const redoButton = (page: Page) => page.getByRole("button", { name: "Redo", exact: true });
  const deleteButton = (page: Page) => page.getByRole("button", { name: "Delete", exact: true });

  // The cases of editing itself (every key, every refusal, the history) are in editing.spec.ts; these are the ones that
  // need the assembled editor: its toolbar, its tracks and its frame wired to one session.
  test("the assembled editor takes a note from select to Delete to undo, by keys and by pointer alone", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");

    await press(noteNamed(page, D4));
    await expect(noteNamed(page, `${D4}, selected`)).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(noteNamed(page, anyD4)).toHaveCount(0);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "false");
    await page.keyboard.press("Control+z");
    await expect(noteNamed(page, anyD4)).toHaveCount(1);

    // The same round with a pointer alone: select, the Delete button, the Undo button.
    await press(noteNamed(page, anyD4));
    await press(deleteButton(page));
    await expect(noteNamed(page, anyD4)).toHaveCount(0);
    await press(undoButton(page));
    await expect(noteNamed(page, anyD4)).toHaveCount(1);
    await press(redoButton(page));
    await expect(noteNamed(page, anyD4)).toHaveCount(0);
    expect(await harness.notices()).toEqual([]);
  });

  test("with the focus on the scroller, the frame carries the keys to the insertion point a click dropped", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await press(page.getByRole("list", { name: "Vocal" }), await emptySpot(page));
    const point = page.getByRole("separator", { name: /^Insertion point/ });
    await expect(point).toHaveAccessibleName("Insertion point, bar 1 beat 3");

    await page.keyboard.press("ArrowRight");
    await expect(point).toHaveAccessibleName("Insertion point, bar 1 beat 4");
    await page.keyboard.press("End");
    await expect(point).toHaveAccessibleName("Insertion point, end of the score");
  });

  test("a read-only editor offers no editing control, and its hint names no editing key", async ({ page, harness }) => {
    await harness.mount({ score: { text: QUARTERS }, editable: false });
    await expect(undoButton(page)).toBeHidden();
    await expect(redoButton(page)).toBeHidden();
    await expect(deleteButton(page)).toBeHidden();
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Arrangement" })).not.toHaveAccessibleDescription(/Delete/);
  });

  test("update switches editing on and off without remounting, and the selection comes back with it", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await press(noteNamed(page, D4));
    await expect(noteNamed(page, `${D4}, selected`)).toBeVisible();
    await expect(page.getByRole("region", { name: "Arrangement" })).toHaveAccessibleDescription(/Delete/);
    await expect(page.getByRole("region", { name: "Arrangement" })).toHaveAccessibleDescription(
      /press Tab to reach the notes/,
    );

    await harness.update({ editable: false });
    await expect(undoButton(page)).toBeHidden();
    await expect(noteNamed(page, `${D4}, selected`)).toHaveCount(0);
    await page.keyboard.press("Delete");
    await expect(noteNamed(page, D4)).toBeVisible();

    await harness.update({ editable: true });
    await expect(undoButton(page)).toBeVisible();
    await expect(noteNamed(page, `${D4}, selected`)).toBeVisible();
    await expect(page.getByText("Read only", { exact: true })).toBeHidden();
  });

  test("the insertion point's flag stays in view under the pinned track head when the lane is scrolled past its top", async ({
    page,
    harness,
    press,
  }) => {
    // Three octaves of range make a lane taller than the editor, so the lane can be scrolled past its own top.
    await harness.mount({ score: { text: vocalOnly("C,4C4c4c'4|") } });
    const lane = page.getByRole("list", { name: "Vocal" });
    // Scrolling down to the lowest note, as a user does, takes the top of the lane out of sight.
    await noteNamed(page, /^C3,/).scrollIntoViewIfNeeded();
    const row = await box(noteNamed(page, /^C4,/));
    await press(lane, { x: 100, y: row.y + row.height / 2 - (await box(lane)).y });
    const point = page.getByRole("separator", { name: /^Insertion point/ });
    await expect(point).toHaveCount(1);
    // The pinned head has no role or name of its own; the pixels under it are what this test looks at.
    const head = await box(page.locator(".sce-track-head"));
    const line = await box(point);
    expect(line.y, "the lane's own top is scrolled out of sight").toBeLessThan(head.y);

    const dark = (rgb: number[]) => Math.max(...rgb.slice(0, 3)) < 80;
    const readPixel = async (x: number, y: number) => {
      const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } });
      return page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d");
        context?.drawImage(image, 0, 0);
        return Array.from(context?.getImageData(0, 0, 1, 1).data ?? []);
      }, png.toString("base64"));
    };
    // The flag is a wedge about 10px wide at its top: the pixel on each side of the line, just under the head, is its.
    const under = head.y + head.height + 1;
    expect(dark(await readPixel(line.x - 1, under))).toBe(true);
    expect(dark(await readPixel(line.x + line.width, under))).toBe(true);
  });

  test("a refusal with the focus on the scroller is said once by the frame and told to the host once", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: vocalOnly("C16-|B") } });
    await press(noteNamed(page, /^C4,/));
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("region", { name: "Arrangement" })).toBeFocused();

    await page.keyboard.press("Delete");

    await expect(page.getByRole("status").filter({ hasText: "can't be written into the score" })).toHaveCount(1);
    expect((await harness.notices()).map((notice) => notice.code)).toEqual(["command-refused"]);
  });

  test("tells the host once, in the current language, when the score would not take a delete", async ({
    page,
    harness,
    press,
  }) => {
    // The note is tied into a cut tail: writing it as a rest would turn the cut into a finished score.
    await harness.mount({ score: { text: vocalOnly("C16-|B") } });
    const tied = page.getByRole("list", { name: "Vocal" }).getByRole("listitem");
    await press(tied);
    await expect(noteNamed(page, /, selected$/)).toHaveCount(1);
    await page.keyboard.press("Delete");

    await expect.poll(async () => (await harness.notices()).length).toBe(1);
    await expect(tied).toHaveCount(1);
    expect(await harness.notices()).toEqual([
      {
        code: "command-refused",
        level: "warning",
        message: "This change can't be written into the score safely, so the score was left as it was. (bar 1, beat 1)",
      },
    ]);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");

    await harness.update({ language: "zh" });
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await harness.notices()).length).toBe(2);
    expect((await harness.notices())[1]?.message).toBe(
      "这个改动没法安全地写进乐谱，乐谱保持原样。（第 1 小节，第 1 拍）",
    );
  });
});

test.describe("an editable toolbar in a narrow host", () => {
  test.skip(({ isMobile }) => isMobile, "the width is set once, on the desktop project");

  test("keeps every control reachable when the toolbar has only 320 pixels", async ({ page, harness }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await harness.mount({ score: { text: vocalOnly("C4D4E4F4|G16|") } });
    const last = page.getByRole("button", { name: "Delete", exact: true });
    await last.focus();
    const at = await box(last);
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.x + at.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("keyboard focus in a short editor", () => {
  test("a note the keys step onto is scrolled clear of the pinned header, not left half under it", async ({
    page,
    harness,
  }) => {
    await page.setViewportSize({ width: 600, height: 360 });
    await harness.mount({ score: { text: vocalOnly("c'4b4C,4z4|") } });
    await page.getByRole("region", { name: "Arrangement" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("listitem", { name: /^C6, bar 1 beat 1/ })).toBeFocused();

    // The user scrolls the arrangement until the next note, B5, sits half under the pinned header.
    const head = await box(page.locator(".sce-track-head"));
    const next = page.getByRole("listitem", { name: /^B5, bar 1 beat 2/ });
    const half = head.y + head.height - 6;
    await page.mouse.move(300, 250);
    await page.mouse.wheel(0, (await box(next)).y - half);
    await expect.poll(async () => Math.round((await box(next)).y)).toBe(Math.round(half));

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("listitem", { name: /^B5, bar 1 beat 2.*selected$/ })).toBeFocused();
    await expect.poll(async () => (await box(next)).y).toBeGreaterThanOrEqual(head.y + head.height);
  });
});

test("destroying the editor after all three views were shown leaves the page as it found it", async ({
  page,
  harness,
}) => {
  const views = page.getByRole("group", { name: "View" });
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const sheets = await page.evaluate(() => document.adoptedStyleSheets.length);
  await harness.mount({ score: { text: vocalOnly("C4D4E4F4|G16|") } });

  await views.getByRole("button", { name: "Staff", exact: true }).click();
  await expect(page.locator("svg .abcjs-note")).toHaveCount(5);
  await views.getByRole("button", { name: "Score text", exact: true }).click();
  await page.getByRole("textbox", { name: "Score text" }).fill("not a score");
  await views.getByRole("button", { name: "Arrangement", exact: true }).click();

  await harness.destroy();

  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(html);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(sheets);
});

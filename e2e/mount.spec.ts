// ABOUTME: Seam 5: the mounted editor driven in real Chromium through a bare test page.
// ABOUTME: Covers the read-only arrangement of real song2 scores, zoom and scroll, and what update and destroy leave behind.
import type { Locator } from "@playwright/test";
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
});

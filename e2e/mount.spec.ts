// ABOUTME: Seam 5: the mounted editor driven in real Chromium through a bare test page.
// ABOUTME: Covers the read-only arrangement of real song2 scores, zoom and scroll, and what update and destroy leave behind.
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

async function box(target: Locator) {
  const found = await target.boundingBox();
  if (!found) throw new Error("nothing is drawn for the locator");
  return found;
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
});

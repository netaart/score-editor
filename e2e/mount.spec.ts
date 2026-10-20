// ABOUTME: Seam 5, the first test: the mounted editor driven in real Chromium through a bare test page.
// ABOUTME: Covers dragging with mouse and touch, scrolling, language switching and what destroy leaves behind.
import { expect, test } from "./fixtures";

test.describe("with a mouse", () => {
  test.skip(({ isMobile }) => isMobile, "mouse gestures run on the desktop project");

  test("dragging a note changes its time and pitch", async ({ page, harness }) => {
    await harness.mount();
    const lane = page.getByRole("group", { name: "Vocal" });
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    const laneBox = await lane.boundingBox();
    const noteBox = await note.boundingBox();
    if (!laneBox || !noteBox) throw new Error("the 8-bar Vocal roll did not render");

    const beat = laneBox.width / 32;
    const row = noteBox.height;
    const grab = { x: noteBox.x + 6, y: noteBox.y + row / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 1.5 * beat, grab.y - row, { steps: 6 });
    await page.mouse.move(grab.x + 3 * beat, grab.y - 2 * row, { steps: 6 });
    await page.mouse.up();

    await expect(page.getByRole("button", { name: "D5, bar 4 beat 4, length 3 beats" })).toBeVisible();
    await expect(note).toHaveCount(0);
  });
});

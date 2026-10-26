// ABOUTME: The abcjs Z2-Z4 probe: draws one line with Z3 and the same line with three whole-bar rests, and prints their measured geometry.
// ABOUTME: Skipped unless Z_PROBE=1; the leader runs it on a host with Chromium, and the numbers decide whether the staff expands Z rests.
import type { Page } from "@playwright/test";
import { expect, test, vocalOnly } from "./fixtures";

/** The width and bar positions of the staff abcjs drew for one score text. */
async function measured(page: Page) {
  return page.evaluate(() => {
    const holder = document.querySelector('[data-slot="staff"] .sce-staff-drawing');
    const shadow = holder?.shadowRoot;
    const svg = shadow?.querySelector("svg");
    const wrappers = [...(shadow?.querySelectorAll(".abcjs-staff-wrapper") ?? [])].map((wrapper) => {
      const box = (wrapper as SVGGraphicsElement).getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    const bars = [...(shadow?.querySelectorAll(".abcjs-bar") ?? [])].map((bar) => {
      const box = (bar as SVGGraphicsElement).getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    const box = svg?.getBoundingClientRect();
    return {
      svg: box ? { width: box.width, height: box.height } : null,
      wrappers,
      bars,
    };
  });
}

test("measures a line with Z3 against the same line with three whole-bar rests", async ({ page, harness }) => {
  test.skip(process.env.Z_PROBE !== "1", "set Z_PROBE=1 to run the abcjs Z2-Z4 probe on a host with Chromium");

  const withZ = vocalOnly("C4D4E4F4|Z3|G16|");
  await harness.layout.open({ score: { text: withZ }, parts: ["staff"] });
  await expect(page.locator('[data-slot="staff"] svg .abcjs-note').first()).toBeVisible();
  const z = await measured(page);
  await harness.layout.close();

  const withWholeRests = vocalOnly("C4D4E4F4|z16z16z16|G16|");
  await harness.layout.open({ score: { text: withWholeRests }, parts: ["staff"] });
  await expect(page.locator('[data-slot="staff"] svg .abcjs-note').first()).toBeVisible();
  const rests = await measured(page);

  console.log(JSON.stringify({ z, wholeRests: rests }, null, 2));
  expect(z.svg?.width ?? 0).toBeGreaterThan(0);
  expect(rests.svg?.width ?? 0).toBeGreaterThan(0);
});

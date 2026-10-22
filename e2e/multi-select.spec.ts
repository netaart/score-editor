// ABOUTME: Seam 5 for selecting several notes: Shift-click and Shift-tap, the box, a touch and hold, select all, invert and Escape.
// ABOUTME: Each case runs with a mouse on the desktop project and with a finger on the phone project, and reads what the session holds.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, type Point, test, vocalOnly } from "./fixtures";

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);

/** Four quarter notes, then a whole note: at 40 pixels a beat they start 0, 40, 80 and 120 pixels into the lane. */
const QUARTERS = vocalOnly("C4D4E4F4|G16|");
const C4 = "C4, bar 1 beat 1, length 1 beat";
const D4 = "D4, bar 1 beat 2, length 1 beat";
const E4 = "E4, bar 1 beat 3, length 1 beat";
const F4 = "F4, bar 1 beat 4, length 1 beat";
const G4 = "G4, bar 2 beat 1, length 4 beats";
const IDS = { C4: "Vocal:0", D4: "Vocal:256", E4: "Vocal:512", F4: "Vocal:768", G4: "Vocal:1024" };

const note = (page: Page, name: string) => slot(page, "vocal").getByRole("listitem", { name, exact: true });
const lane = (page: Page) => slot(page, "vocal").getByRole("list", { name: "Vocal" });
const said = (page: Page) => slot(page, "vocal").getByRole("status");
const theBox = (page: Page) => slot(page, "vocal").locator(".sce-box");
const framed = (page: Page, name: string) => expect(note(page, name)).toHaveCSS("border-top-width", "2px");
const unframed = (page: Page, name: string) => expect(note(page, name)).toHaveCSS("border-top-width", "1px");
const toolbar = (page: Page) => slot(page, "toolbar");
const trackRegion = (page: Page) => slot(page, "vocal").getByRole("region", { name: "Vocal" });
const undoButton = (page: Page) => toolbar(page).getByRole("button", { name: "Undo", exact: true });
const deleteButton = (page: Page) => toolbar(page).getByRole("button", { name: "Delete", exact: true });

async function openTrack(harness: Harness, score: string = QUARTERS, options: Record<string, unknown> = {}) {
  await harness.layout.open({ score: { text: score }, parts: ["toolbar", "vocal"], ...options });
}

/** The middle of a note's block, which is on the note. */
async function centreOf(target: Locator): Promise<Point> {
  const area = await box(target);
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}

/** A spot in the lane that no note covers, `x` pixels in from its left edge and `y` from its top. */
async function spot(page: Page, x: number, y: number): Promise<Point> {
  const area = await box(lane(page));
  return { x: area.x + x, y: area.y + y };
}

/** A way to press, move and lift one pointer: a mouse on the desktop project, a held finger on the phone project. */
interface Pointer {
  down(point: Point): Promise<void>;
  move(point: Point): Promise<void>;
  up(): Promise<void>;
  close(): Promise<void>;
}

/** The pointer the project has. A finger waits 550 ms after it goes down, as a person does to start a box. */
async function pointerOf(
  page: Page,
  harness: Harness,
  isMobile: boolean,
  options: { shift?: boolean } = {},
): Promise<Pointer> {
  if (!isMobile) {
    return {
      async down(point) {
        if (options.shift) await page.keyboard.down("Shift");
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
      },
      move: (point) => page.mouse.move(point.x, point.y, { steps: 8 }),
      async up() {
        await page.mouse.up();
        if (options.shift) await page.keyboard.up("Shift");
      },
      close: async () => {},
    };
  }
  const finger = await harness.finger(options.shift ? { shift: true } : {});
  return {
    down: (point) => finger.down(point, 550),
    move: (point) => finger.move(point),
    up: () => finger.up(),
    close: () => finger.close(),
  };
}

/** A box from `from` to `to`, drawn with the project's pointer and released. */
async function drawBox(
  page: Page,
  harness: Harness,
  isMobile: boolean,
  from: Point,
  to: Point,
  options: { shift?: boolean } = {},
) {
  const pointer = await pointerOf(page, harness, isMobile, options);
  try {
    await pointer.down(from);
    await pointer.move(to);
    await pointer.up();
  } finally {
    await pointer.close();
  }
}

/** A click, or a tap, with Shift held, at `position` in the target when given. */
function shiftPress(isMobile: boolean, target: Locator, position?: Point) {
  const options = { modifiers: ["Shift" as const], ...(position ? { position } : {}) };
  return isMobile ? target.tap(options) : target.click(options);
}

/** The box that covers C4 and D4 and no other note: from the empty top left of the lane to below the C4 block. */
async function aroundCAndD(page: Page): Promise<{ from: Point; to: Point }> {
  const c = await box(note(page, C4));
  const d = await box(note(page, D4));
  return { from: await spot(page, 2, 2), to: { x: d.x + d.width - 6, y: c.y + c.height - 2 } };
}

test.describe("Shift held on a click or a tap", () => {
  test("adds a note to the selection and takes a selected note out of it", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness);
    await press(note(page, C4));

    await shiftPress(isMobile, note(page, E4));
    expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.E4]);
    await framed(page, `${C4}, selected`);
    await framed(page, `${E4}, selected`);
    await unframed(page, D4);

    await shiftPress(isMobile, note(page, C4.concat(", selected")));
    expect(await harness.layout.selection()).toEqual([IDS.E4]);
    await unframed(page, C4);
    await framed(page, `${E4}, selected`);
  });

  test("takes a whole tie chain in or out, as a click on one of its segments selects it", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("C16-|C16|D16|"));
    const first = "C4, bar 1 beat 1, length 4 beats, tied to the next note";
    const second = "C4, bar 2 beat 1, length 4 beats";
    const third = "D4, bar 3 beat 1, length 4 beats";
    await press(note(page, third));

    await shiftPress(isMobile, note(page, second));
    await framed(page, `${first}, selected`);
    await framed(page, `${second}, selected`);

    await shiftPress(isMobile, note(page, `${second}, selected`));
    await unframed(page, first);
    await unframed(page, second);
    await framed(page, `${third}, selected`);
  });

  test("on empty space does nothing: the selection and the insertion point stay", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness);
    await press(note(page, D4));

    await shiftPress(isMobile, lane(page), { x: 70, y: 4 });

    expect(await harness.layout.selection()).toEqual([IDS.D4]);
    expect(await harness.layout.insertionPoint()).toBeNull();
    await framed(page, `${D4}, selected`);
  });

  test("says how many notes are selected", async ({ page, harness, press, isMobile }) => {
    await openTrack(harness);
    await press(note(page, C4));
    await shiftPress(isMobile, note(page, F4));
    await expect(said(page)).toHaveText("Selected 2 notes");
  });
});

test.describe("the box", () => {
  test("selects the notes it covers when it is let go, and frames them while it is open", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness);
    const { from, to } = await aroundCAndD(page);
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(from);
      await pointer.move(to);

      // Open: the box is drawn, the notes it covers wear the frame, and the session has not been asked yet.
      await expect(theBox(page)).toBeVisible();
      await framed(page, C4);
      await framed(page, D4);
      await unframed(page, E4);
      expect(await harness.layout.selection()).toEqual([]);

      await pointer.up();
    } finally {
      await pointer.close();
    }

    await expect(theBox(page)).toHaveCount(0);
    expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.D4]);
    await framed(page, `${C4}, selected`);
    await framed(page, `${D4}, selected`);
    await unframed(page, E4);
    await expect(said(page)).toHaveText("Selected 2 notes");
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("replaces the selection, and with Shift held at the start adds to it", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness);
    const { from, to } = await aroundCAndD(page);
    await press(note(page, F4));

    await drawBox(page, harness, isMobile, from, to, { shift: true });
    expect([...(await harness.layout.selection())].sort()).toEqual([IDS.C4, IDS.D4, IDS.F4].sort());

    await drawBox(page, harness, isMobile, from, to);
    expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.D4]);
    await unframed(page, F4);
  });

  test("over no note clears the selection, and with Shift held leaves it", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, E4));
    const top = await spot(page, 2, 2);
    const nearby = { x: top.x + 14, y: top.y + 8 };

    await drawBox(page, harness, isMobile, top, nearby, { shift: true });
    expect(await harness.layout.selection()).toEqual([IDS.E4]);

    await drawBox(page, harness, isMobile, top, nearby);
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("takes a tie chain whole when it covers one segment of it", async ({ page, harness, isMobile }) => {
    await openTrack(harness, vocalOnly("C16-|C16|D16|"));
    const first = "C4, bar 1 beat 1, length 4 beats, tied to the next note";
    const second = "C4, bar 2 beat 1, length 4 beats";
    const a = await box(note(page, first));

    await drawBox(page, harness, isMobile, await spot(page, 2, 2), { x: a.x + 20, y: a.y + a.height - 2 });

    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);
    await framed(page, `${first}, selected`);
    await framed(page, `${second}, selected`);
  });

  test("is let go of with Escape pressed while it is open: nothing changes", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, F4));
    const { from, to } = await aroundCAndD(page);
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(from);
      await pointer.move(to);
      await expect(theBox(page)).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(theBox(page)).toHaveCount(0);
      await unframed(page, C4);
      await pointer.up();
    } finally {
      await pointer.close();
    }

    expect(await harness.layout.selection()).toEqual([IDS.F4]);
    await expect(theBox(page)).toHaveCount(0);
  });

  test("takes only the notes at the pitches it covers: a low box takes C4 and leaves D4, which follows it a step higher", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness);
    const c = await box(note(page, C4));
    const d = await box(note(page, D4));
    // From just under C4, which is empty lane, to the middle of C4's row and the end of D4's time.
    const from = { x: c.x + 2, y: c.y + c.height + 3 };
    const to = { x: d.x + d.width - 6, y: c.y + c.height / 2 };

    await drawBox(page, harness, isMobile, from, to);

    expect(await harness.layout.selection()).toEqual([IDS.C4]);
    await unframed(page, D4);
  });

  test("is given up when the browser cancels the pointer: nothing is selected and no box stays", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, F4));
    await page.evaluate(() => {
      addEventListener("pointerdown", (event) => ((window as unknown as { pid: number }).pid = event.pointerId), true);
    });
    const { from, to } = await aroundCAndD(page);
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(from);
      await pointer.move(to);
      await expect(theBox(page)).toBeVisible();

      await lane(page).evaluate((el) => {
        const pointerId = (window as unknown as { pid: number }).pid;
        el.dispatchEvent(new PointerEvent("pointercancel", { pointerId, bubbles: true }));
      });
      await expect(theBox(page)).toHaveCount(0);
      await unframed(page, C4);
      await pointer.up();
    } finally {
      await pointer.close();
    }

    expect(await harness.layout.selection()).toEqual([IDS.F4]);
  });

  test("is given up when the page loses the focus while it is open: the release that may never come is not waited for", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, F4));
    const { from, to } = await aroundCAndD(page);
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(from);
      await pointer.move(to);
      await expect(theBox(page)).toBeVisible();

      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await expect(theBox(page)).toHaveCount(0);
      await expect(page.locator(".sce-lane[data-boxing]")).toHaveCount(0);
      await pointer.up();
    } finally {
      await pointer.close();
    }

    expect(await harness.layout.selection()).toEqual([IDS.F4]);
  });

  test("is given up when the editor stops being editable while it is open", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, F4));
    const { from, to } = await aroundCAndD(page);
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(from);
      await pointer.move(to);
      await expect(theBox(page)).toBeVisible();

      await harness.layout.setEditable(false);
      await expect(theBox(page)).toHaveCount(0);
      await pointer.up();
    } finally {
      await pointer.close();
    }

    expect(await harness.layout.selection()).toEqual([IDS.F4]);
    await harness.layout.setEditable(true);
    await expect(note(page, `${F4}, selected`)).toBeVisible();
  });

  test("keeps a heavier dashed outline and no wash where the system forces its colours", async ({
    page,
    harness,
    isMobile,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openTrack(harness);
    const { from, to } = await aroundCAndD(page);
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(from);
      await pointer.move(to);
      await expect(theBox(page)).toBeVisible();
      await expect(theBox(page)).toHaveCSS("border-top-style", "dashed");
      await expect(theBox(page)).toHaveCSS("border-top-width", "2px");
      await expect(theBox(page)).toHaveCSS("background-color", /^rgba\(\d+, \d+, \d+, 0\)$/);
      await pointer.up();
    } finally {
      await pointer.close();
    }
  });

  test("stops at the edge of the lane when the pointer goes past it, on every side", async ({
    page,
    harness,
    isMobile,
  }) => {
    // The whole lane must be on the screen for a pointer to go past its bottom edge.
    await page.setViewportSize({ width: page.viewportSize()?.width ?? 412, height: 1400 });
    await openTrack(harness);
    const area = await box(lane(page));
    const lowest = await box(note(page, C4));
    const shown = await box(trackRegion(page));
    const past = 10;

    /** Drags from `from` to `to`, and says where the box was drawn while the pointer was still there. */
    async function dragPast(from: Point, to: Point) {
      const pointer = await pointerOf(page, harness, isMobile);
      try {
        await pointer.down(from);
        await pointer.move(to);
        const drawn = await box(theBox(page));
        await pointer.up();
        return drawn;
      } finally {
        await pointer.close();
      }
    }
    const inside = (drawn: { x: number; y: number; width: number; height: number }) => {
      expect(drawn.x).toBeGreaterThanOrEqual(area.x - 0.5);
      expect(drawn.y).toBeGreaterThanOrEqual(area.y - 0.5);
      expect(drawn.x + drawn.width).toBeLessThanOrEqual(area.x + area.width + 0.5);
      expect(drawn.y + drawn.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    };

    // Past the right edge and the bottom.
    inside(await dragPast(await spot(page, 2, 2), { x: area.x + area.width + past, y: area.y + area.height + past }));
    expect(await harness.layout.selection()).toEqual(Object.values(IDS));

    // Past the left edge.
    await harness.layout.select([]);
    inside(await dragPast(await spot(page, area.width - 2, 2), { x: area.x - past, y: lowest.y + lowest.height + 2 }));
    expect(await harness.layout.selection()).toEqual(Object.values(IDS));

    // From the bottom right corner of what the track shows, which is empty, past the top and the left.
    await harness.layout.select([]);
    inside(
      await dragPast(
        { x: area.x + area.width - 2, y: shown.y + shown.height - 4 },
        { x: area.x - past, y: area.y - past },
      ),
    );
    expect(await harness.layout.selection()).toEqual(Object.values(IDS));
  });

  test("starts on empty space only: a drag that starts on a note draws no box and selects nothing", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "a finger that starts on a note and moves is a scroll; the touch cases below cover it");
    await openTrack(harness);
    const start = await centreOf(note(page, D4));

    await drawBox(page, harness, isMobile, start, { x: start.x + 50, y: start.y - 30 });

    await expect(theBox(page)).toHaveCount(0);
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("a press on empty space that moves a hair is still a click: it drops the insertion point", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    test.skip(isMobile, "a finger that moves is not a tap");
    await openTrack(harness);
    await press(note(page, D4));
    const at = await spot(page, 70, 4);

    await drawBox(page, harness, isMobile, at, { x: at.x + 2, y: at.y + 1 });

    await expect(theBox(page)).toHaveCount(0);
    expect(await harness.layout.selection()).toEqual([]);
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 512 });
  });

  test("keeps its corner on the same bars and pitches when the track scrolls under a mouse that stays still", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "a finger cannot scroll with a wheel while it is down");
    await page.setViewportSize({ width: page.viewportSize()?.width ?? 1280, height: 1400 });
    await openTrack(harness, vocalOnly(...Array(12).fill("C4D4E4F4|")));
    const start = await spot(page, 2, 2);
    const area = await box(lane(page));
    const there = { x: start.x + 80, y: area.y + area.height - 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(there.x, there.y, { steps: 6 });
    const before = await box(theBox(page));

    await page.mouse.wheel(400, 0);

    await expect.poll(async () => (await box(theBox(page))).width).toBeGreaterThan(before.width + 300);
    await page.mouse.up();
    expect((await harness.layout.selection()).length).toBeGreaterThan(8);
  });
});

test.describe("a finger", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "these are touch gestures");
  });

  test("scrolls the track when it swipes over empty space at once: no box, no selection", async ({ page, harness }) => {
    await openTrack(harness, vocalOnly(...Array(3).fill("C16|C16|C16|C16|")));
    const start = await spot(page, 200, 3);

    await harness.swipe(start, { x: start.x - 120, y: start.y });

    expect((await harness.layout.view()).scrollLeft).toBeGreaterThan(20);
    await expect(theBox(page)).toHaveCount(0);
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("scrolls when it moves before the hold is over, and no box starts after it", async ({ page, harness }) => {
    await openTrack(harness, vocalOnly(...Array(3).fill("C16|C16|C16|C16|")));
    const start = await spot(page, 200, 3);
    const finger = await harness.finger();
    try {
      await finger.down(start);
      await finger.move({ x: start.x - 70, y: start.y });
      await page.waitForTimeout(600);
      await finger.up();
    } finally {
      await finger.close();
    }

    expect((await harness.layout.view()).scrollLeft).toBeGreaterThan(20);
    await expect(theBox(page)).toHaveCount(0);
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("holds on empty space without moving and lets go: the selection stays and no box is left", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, E4));
    const finger = await harness.finger();
    try {
      await finger.down(await spot(page, 2, 2), 600);
      await finger.up();
    } finally {
      await finger.close();
    }

    await expect(theBox(page)).toHaveCount(0);
    expect(await harness.layout.selection()).toEqual([IDS.E4]);
    expect(await harness.layout.insertionPoint()).toBeNull();
  });

  test("holds on a note to add it to the selection or take it out, as Shift does for a click", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, C4));
    const finger = await harness.finger();
    try {
      await finger.down(await centreOf(note(page, E4)), 550);
      await finger.up();
      expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.E4]);
      await framed(page, `${E4}, selected`);

      await finger.down(await centreOf(note(page, C4.concat(", selected"))), 550);
      await finger.up();
      expect(await harness.layout.selection()).toEqual([IDS.E4]);
    } finally {
      await finger.close();
    }

    // A tap after that selects only the note tapped.
    await press(note(page, F4));
    expect(await harness.layout.selection()).toEqual([IDS.F4]);
  });

  test("keeps the browser's own menu from opening on a hold, on a note and on empty space", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    const menuOpens = (target: Locator) =>
      target.evaluate((el) => el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    const finger = await harness.finger();
    try {
      await finger.down(await spot(page, 2, 2), 550);
      expect(await menuOpens(lane(page))).toBe(false);
      await finger.up();

      await finger.down(await centreOf(note(page, D4)), 550);
      expect(await menuOpens(note(page, `${D4}, selected`))).toBe(false);
      await finger.up();
    } finally {
      await finger.close();
    }
  });

  test("rests on empty space while the editor turns read-only: no box is armed", async ({ page, harness }) => {
    await openTrack(harness);
    const finger = await harness.finger();
    try {
      await finger.down(await spot(page, 2, 2));
      await harness.layout.setEditable(false);
      await page.waitForTimeout(600);
      await expect(page.locator(".sce-lane[data-boxing]")).toHaveCount(0);
      await finger.up();
    } finally {
      await finger.close();
    }
    await harness.layout.setEditable(true);
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("shows where the box will start as soon as the hold is recognised: a marker bigger than a fingertip, which the slide turns into the box", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    const at = await spot(page, 60, 6);
    const finger = await harness.finger();
    try {
      await finger.down(at, 250);
      await expect(theBox(page)).toHaveCount(0);

      await page.waitForTimeout(300);
      const marker = await box(theBox(page));
      expect(marker.width).toBeGreaterThanOrEqual(55);
      expect(marker.height).toBeGreaterThanOrEqual(55);
      expect(Math.abs(marker.x + marker.width / 2 - at.x)).toBeLessThan(2);
      expect(Math.abs(marker.y + marker.height / 2 - at.y)).toBeLessThan(2);

      await finger.move({ x: at.x + 90, y: at.y + 70 });
      await expect(page.locator(".sce-box[data-anchor]")).toHaveCount(0);
      const drawn = await box(theBox(page));
      expect(Math.abs(drawn.width - 90)).toBeLessThan(3);
      await finger.up();
    } finally {
      await finger.close();
    }
    await expect(theBox(page)).toHaveCount(0);
  });

  test("buzzes once when the hold is recognised, where the device can", async ({ page, harness, press }) => {
    await openTrack(harness);
    await page.evaluate(() => {
      const buzzes: unknown[] = [];
      Object.assign(window, { buzzes });
      Object.assign(navigator, {
        vibrate: (pattern: unknown) => {
          buzzes.push(pattern);
          return true;
        },
      });
    });
    const buzzes = () => page.evaluate(() => (window as unknown as { buzzes: unknown[] }).buzzes);
    // Browsers allow a buzz only after the page has been touched once.
    await press(note(page, C4));
    expect(await buzzes()).toEqual([]);

    const finger = await harness.finger();
    try {
      await finger.down(await spot(page, 60, 6), 250);
      expect(await buzzes()).toEqual([]);
      await page.waitForTimeout(300);
      expect(await buzzes()).toEqual([10]);
      await finger.up();
    } finally {
      await finger.close();
    }
  });

  test("lets a thumb drift a little while it rests: the hold is still a hold", async ({ page, harness }) => {
    await openTrack(harness);
    const at = await spot(page, 60, 6);
    const finger = await harness.finger();
    try {
      await finger.down(at);
      await finger.move({ x: at.x + 8, y: at.y }, 2);
      await page.waitForTimeout(500);
      await expect(page.locator(".sce-box[data-anchor]")).toBeVisible();
      await finger.up();
    } finally {
      await finger.close();
    }
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("holds on a note, moves away, and leaves the selection as it was", async ({ page, harness, press }) => {
    await openTrack(harness, vocalOnly(...Array(3).fill("C4D4E4F4|")));
    await press(note(page, C4));
    const finger = await harness.finger();
    try {
      const at = await centreOf(note(page, D4));
      await finger.down(at, 200);
      await finger.move({ x: at.x - 60, y: at.y });
      await page.waitForTimeout(500);
      await finger.up();
    } finally {
      await finger.close();
    }

    expect(await harness.layout.selection()).toEqual([IDS.C4]);
  });
});

/** The two keys that stand for "the command key": Control, and Cmd on a Mac. */
const COMMAND_KEYS = [
  ["Control", "Control"],
  ["Meta", "Meta"],
] as const;

test.describe("Ctrl+A, Ctrl+Shift+A and Escape", () => {
  for (const [label, modifier] of COMMAND_KEYS) {
    test(`${label}+A selects every note, ${label}+Shift+A swaps the selected and the unselected, Escape clears`, async ({
      page,
      harness,
      press,
    }) => {
      await openTrack(harness);
      await press(note(page, D4));

      await page.keyboard.press(`${modifier}+a`);
      expect(await harness.layout.selection()).toEqual(Object.values(IDS));
      await expect(slot(page, "vocal").getByRole("listitem", { name: /, selected$/ })).toHaveCount(5);
      await expect(said(page)).toHaveText("Selected 5 notes");

      await page.keyboard.press(`${modifier}+Shift+a`);
      expect(await harness.layout.selection()).toEqual([]);

      await press(note(page, E4));
      await page.keyboard.press(`${modifier}+Shift+a`);
      expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.D4, IDS.F4, IDS.G4]);
      await framed(page, `${C4}, selected`);
      await unframed(page, E4);

      await page.keyboard.press("Escape");
      expect(await harness.layout.selection()).toEqual([]);
      await expect(slot(page, "vocal").getByRole("listitem", { name: /, selected$/ })).toHaveCount(0);
    });
  }

  test("are taken from the browser while the focus is in the editor: the page's own select all does not run", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await harness.addHostProbe();
    const selectedText = () => page.evaluate(() => window.getSelection()?.toString() ?? "");

    // Outside the editor Ctrl+A is the browser's: the probe text is selected, which keeps the check below honest.
    await page.getByRole("button", { name: /host/i }).focus();
    await page.keyboard.press("Control+a");
    expect((await selectedText()).length).toBeGreaterThan(0);
    expect(await harness.layout.selection()).toEqual([]);
    await page.evaluate(() => window.getSelection()?.removeAllRanges());

    // In the editor it is the editor's, on a note and on the track.
    await press(note(page, D4));
    await page.keyboard.press("Control+a");
    expect(await harness.layout.selection()).toEqual(Object.values(IDS));
    expect(await selectedText()).toBe("");

    await trackRegion(page).focus();
    await page.keyboard.press("Control+Shift+a");
    expect(await harness.layout.selection()).toEqual([]);
    expect(await selectedText()).toBe("");
  });

  test("leave Escape to the host when no note is selected, and keep it when one is", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await page.evaluate(() => {
      const seen: boolean[] = [];
      (window as unknown as { escapes: boolean[] }).escapes = seen;
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") seen.push(event.defaultPrevented);
      });
    });
    const escapes = () => page.evaluate(() => (window as unknown as { escapes: boolean[] }).escapes);

    await trackRegion(page).focus();
    await page.keyboard.press("Escape");
    expect(await escapes()).toEqual([false]);

    await press(note(page, D4));
    await page.keyboard.press("Escape");
    expect(await escapes()).toEqual([false, true]);
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("shares no key with undo, redo, Delete or the insertion point keys", async ({ page, harness, press }) => {
    await openTrack(harness);
    await press(note(page, D4));
    await page.keyboard.press("Delete");
    await page.keyboard.press("Control+a");
    // The deleted note is a rest now, and a rest is not selected by select all.
    expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.E4, IDS.F4, IDS.G4]);
    // Select all did not undo or redo anything: the delete is still there, and still one step.
    expect(await harness.layout.scoreText()).toContain("C4z4E4F4|G16|");
    expect(await harness.layout.canUndo()).toBe(true);
    await page.keyboard.press("Control+z");
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);
  });
});

/** A note by its pitch, whether or not it is selected, which its name says. */
const pitch = (page: Page, name: string) =>
  slot(page, "vocal").getByRole("listitem", { name: new RegExp(`^${name},`) });

test.describe("a subset from the keyboard", () => {
  for (const [label, modifier] of COMMAND_KEYS) {
    test(`${label}+Left, Right, Home and End move the focus and leave the selection; Shift+Space and Shift+Enter add the note in focus or take it out`, async ({
      page,
      harness,
      press,
    }) => {
      await openTrack(harness);
      await press(note(page, C4));
      expect(await harness.layout.selection()).toEqual([IDS.C4]);

      await page.keyboard.press(`${modifier}+ArrowRight`);
      await page.keyboard.press(`${modifier}+ArrowRight`);
      await expect(pitch(page, "E4")).toBeFocused();
      expect(await harness.layout.selection()).toEqual([IDS.C4]);

      await page.keyboard.press("Shift+Space");
      expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.E4]);
      await expect(said(page)).toHaveText("Selected 2 notes");
      await framed(page, `${E4}, selected`);
      await expect(pitch(page, "E4")).toBeFocused();

      await page.keyboard.press(`${modifier}+End`);
      await expect(pitch(page, "G4")).toBeFocused();
      await page.keyboard.press("Shift+Enter");
      expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.E4, IDS.G4]);
      await expect(said(page)).toHaveText("Selected 3 notes");

      await page.keyboard.press(`${modifier}+Home`);
      await expect(pitch(page, "C4")).toBeFocused();
      await page.keyboard.press("Shift+Space");
      expect(await harness.layout.selection()).toEqual([IDS.E4, IDS.G4]);
      await unframed(page, C4);

      // The first note has no neighbour on its left; the focus stays and nothing is selected by the key.
      await page.keyboard.press(`${modifier}+ArrowLeft`);
      await expect(pitch(page, "C4")).toBeFocused();
      expect(await harness.layout.selection()).toEqual([IDS.E4, IDS.G4]);

      // Enter and Space still select only the note in focus, as before.
      await page.keyboard.press("Enter");
      expect(await harness.layout.selection()).toEqual([IDS.C4]);
    });
  }

  test("takes a tie chain in or out as a whole, from whichever segment has the focus", async ({
    page,
    harness,
    press,
  }) => {
    // A, then F sharp as a dotted half note that ties into the F of bar 2: ids Vocal:0, Vocal:256 and Vocal:1024.
    await openTrack(harness, vocalOnly("A4^F12-|F16|"));
    const notes = slot(page, "vocal").getByRole("listitem");
    await press(notes.nth(0));
    await page.keyboard.press("Control+ArrowRight");
    await expect(notes.nth(1)).toBeFocused();

    await page.keyboard.press("Shift+Space");
    expect(await harness.layout.selection()).toEqual(["Vocal:0", "Vocal:256"]);
    await expect(notes.nth(2)).toHaveAccessibleName(/, selected$/);

    await page.keyboard.press("Control+ArrowRight");
    await expect(notes.nth(2)).toBeFocused();
    await page.keyboard.press("Shift+Space");
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);
    await expect(notes.nth(2)).not.toHaveAccessibleName(/, selected$/);
  });

  test("are left to the others with Alt or other modifiers, and while the focus is not on a note", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, D4));

    await page.keyboard.press("Alt+Shift+Space");
    await page.keyboard.press("Alt+Control+ArrowRight");
    // Shift with the arrows is kept for what the spec plans for it, and Control with Shift for the selection keys.
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Control+Shift+ArrowRight");
    await page.keyboard.press("Control+Shift+Space");
    await expect(pitch(page, "D4")).toBeFocused();
    expect(await harness.layout.selection()).toEqual([IDS.D4]);

    // Control or Cmd with Space is the system's (input source, Spotlight), so it does not select the note it lands on.
    await page.keyboard.press("Control+ArrowRight");
    await page.keyboard.press("Control+Space");
    await expect(pitch(page, "E4")).toBeFocused();
    expect(await harness.layout.selection()).toEqual([IDS.D4]);

    await trackRegion(page).focus();
    await page.keyboard.press("Shift+Space");
    await page.keyboard.press("Shift+Enter");
    expect(await harness.layout.selection()).toEqual([IDS.D4]);
  });
});

test.describe("deleting what several notes selected", () => {
  test("turns every selected note into a rest, and undo brings them back with the selection on the same notes", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness);
    await press(note(page, C4));
    await shiftPress(isMobile, note(page, E4));
    await shiftPress(isMobile, note(page, G4));
    const chosen = [IDS.C4, IDS.E4, IDS.G4];
    expect(await harness.layout.selection()).toEqual(chosen);

    await page.keyboard.press("Delete");

    await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(2);
    expect(await harness.layout.scoreText()).toContain("z4D4z4F4|z16|");
    expect(await harness.layout.selection()).toEqual(chosen);

    await press(undoButton(page));

    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.selection()).toEqual(chosen);
    await framed(page, `${C4}, selected`);
    await framed(page, `${E4}, selected`);
    await framed(page, `${G4}, selected`);
    await unframed(page, D4);
    await unframed(page, F4);

    await page.keyboard.press("Control+Shift+z");
    await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(2);
    expect(await harness.layout.selection()).toEqual(chosen);
  });

  test("takes the notes a box selected, in one step, with the toolbar and no keyboard", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness);
    const { from, to } = await aroundCAndD(page);
    await drawBox(page, harness, isMobile, from, to);

    await press(deleteButton(page));

    expect(await harness.layout.scoreText()).toContain("z4z4E4F4|G16|");
    await expect(said(page)).toHaveText("Deleted 2 notes");
    await press(undoButton(page));
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.D4]);
  });

  test("leaves the ids of the rests selected, and Escape clears them", async ({ page, harness, press }) => {
    await openTrack(harness);
    await press(note(page, D4));
    await page.keyboard.press("Delete");
    expect(await harness.layout.selection()).toEqual([IDS.D4]);

    await page.keyboard.press("Escape");

    expect(await harness.layout.selection()).toEqual([]);
    await press(undoButton(page));
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    await unframed(page, D4);
  });
});

test.describe("read-only", () => {
  test("a click, a box, a hold and the selection keys select nothing, while the session can still select", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness, QUARTERS, { editable: false });

    // The way a filter panel selects while the editor is read-only: through the session, which stays open.
    await harness.layout.select([IDS.D4, IDS.F4]);
    expect(await harness.layout.selection()).toEqual([IDS.D4, IDS.F4]);
    await unframed(page, D4);

    await shiftPress(isMobile, note(page, C4));
    const { from, to } = await aroundCAndD(page);
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(from);
      await pointer.move(to);
      await expect(theBox(page)).toHaveCount(0);
      await pointer.up();
    } finally {
      await pointer.close();
    }
    await trackRegion(page).focus();
    for (const keys of ["Control+a", "Control+Shift+a", "Escape"]) await page.keyboard.press(keys);

    expect(await harness.layout.selection()).toEqual([IDS.D4, IDS.F4]);
    await unframed(page, D4);

    // The same gesture selects once the editor may edit, so the quiet above was the read-only state and not a broken gesture.
    await harness.layout.setEditable(true);
    await framed(page, `${D4}, selected`);
    await framed(page, `${F4}, selected`);
    await drawBox(page, harness, isMobile, from, to);
    expect(await harness.layout.selection()).toEqual([IDS.C4, IDS.D4]);
  });
});

test.describe("the assembled editor", () => {
  const voices = (page: Page, name: RegExp) =>
    page.getByRole("list", { name: /^(Vocal|Ins)$/ }).getByRole("listitem", { name });
  const SELECTED = /, selected$/;

  test("takes Shift-click, select all, invert and Escape with the focus on its scroller", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const vocal = page.getByRole("list", { name: "Vocal" });
    await expect(vocal).toBeVisible();
    const everything = await voices(page, /./).count();
    expect(everything).toBeGreaterThan(10);

    await page.getByRole("region", { name: "Arrangement" }).focus();
    await page.keyboard.press("Control+a");
    await expect(voices(page, SELECTED)).toHaveCount(everything);

    await page.keyboard.press("Escape");
    await expect(voices(page, SELECTED)).toHaveCount(0);

    await press(vocal.getByRole("listitem").nth(4));
    await expect(voices(page, SELECTED)).toHaveCount(1);
    await shiftPress(isMobile, vocal.getByRole("listitem").nth(6));
    await expect(voices(page, SELECTED)).toHaveCount(2);

    // Invert leaves the notes of both voices that were not selected, and none of those that were.
    await page.keyboard.press("Control+Shift+a");
    await expect(voices(page, SELECTED)).toHaveCount(everything - 2);
    await expect(
      page.getByRole("list", { name: "Ins" }).getByRole("listitem", { name: SELECTED }).first(),
    ).toBeVisible();
    expect(await harness.notices()).toEqual([]);
  });
  test("a finger that rests on empty space and slides draws a box and does not scroll the editor", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "a finger needs a touch screen");
    await harness.mount({ score: { sample: "compact-three-sections" } });
    const scroller = page.getByRole("region", { name: "Arrangement" });
    const vocal = page.getByRole("list", { name: "Vocal" });
    await expect(vocal).toBeVisible();
    const position = () => scroller.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
    const before = await position();
    const frame = await box(scroller);
    const laneArea = await box(vocal);
    // The four bars of the intro are rests: the lane is empty where the finger goes down, and the box reaches the verse.
    // The editor pins a header over the lane, so the first free spot is found by looking at what is on the screen.
    const x = Math.max(laneArea.x, frame.x + 60) + 10;
    const free = await page.evaluate(
      ({ at, from, until }) => {
        for (let y = from; y < until; y += 4) {
          if (document.elementFromPoint(at, y)?.closest(".sce-lane")) return y;
        }
        return null;
      },
      { at: x, from: Math.max(laneArea.y, frame.y), until: frame.y + frame.height },
    );
    expect(free).not.toBeNull();
    const from = { x, y: (free ?? 0) + 8 };
    const to = { x: frame.x + frame.width - 6, y: Math.min(laneArea.y + laneArea.height, frame.y + frame.height) - 6 };

    const finger = await harness.finger();
    try {
      await finger.down(from, 550);
      await finger.move(to);
      await expect(page.locator(".sce-box")).toBeVisible();
      await finger.up();
    } finally {
      await finger.close();
    }

    expect(await position()).toEqual(before);
    expect(await harness.notices()).toEqual([]);
    await expect(page.locator(".sce-box")).toHaveCount(0);
    await expect(voices(page, SELECTED).first()).toBeVisible();
  });
  test("tells a screen reader how to select several notes, in both languages", async ({ page, harness }) => {
    await harness.mount({ score: { sample: "compact-three-sections" } });
    await expect(page.getByRole("region", { name: "Arrangement" })).toHaveAccessibleDescription(
      /Shift-click or Shift-tap.*Drag across empty space.*touch and hold.*Ctrl and A.*Escape.*Ctrl and Left.*Shift and Space/s,
    );

    await harness.update({ language: "zh" });
    await expect(page.getByRole("region", { name: "编曲视图" })).toHaveAccessibleDescription(
      /Shift.*在空白处拖动.*长按.*Ctrl 加 A.*Esc.*Ctrl 加左.*Shift 加空格/s,
    );
  });
});

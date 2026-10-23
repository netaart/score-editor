// ABOUTME: Seam 5 for moving and resizing notes: a drag of the selection, a drag of an edge, the arrow and Shift keys, and the touch gestures.
// ABOUTME: Each pointer case runs with a mouse on the desktop project and with a finger on the phone project, and reads the notes the session holds.
import type { Locator, Page } from "@playwright/test";
import {
  BEAT,
  block,
  box,
  centreOf,
  drag,
  expect,
  ghosts,
  gridButton,
  gridItem,
  type Harness,
  laneOf,
  LEAD,
  metrics,
  MIDDLE_C,
  noteList,
  openTrack,
  pointerOf,
  said,
  slot,
  test,
  trackRegion,
  vocal,
  vocalOnly,
  withPointer,
} from "./fixtures";

const C4 = "C4, bar 1 beat 1";

test.describe("dragging the selected notes", () => {
  test("moves a selected note in time and pitch with one drag, shows where it lands, and undo puts it back", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, LEAD);
    await press(block(page, C4));
    const note = block(page, `${C4}, length 1 beat, selected`);
    const from = await centreOf(note);
    const noteBox = await box(note);
    const { lane, beat, row } = await metrics(page, 8);

    await drag(page, harness, isMobile, from, { x: from.x + 2 * beat, y: from.y - 2 * row }, async () => {
      // While it is carried the note waits where it was, and an outline shows where the release would put it.
      await expect(laneOf(page)).toHaveAttribute("data-dragging", "move");
      await expect(ghosts(page)).toHaveCount(1);
      const ghost = await box(ghosts(page));
      expect(ghost.x).toBeCloseTo(lane.x + 2 * beat, 0);
      expect(ghost.width).toBeCloseTo(beat, 0);
      expect(ghost.y).toBeCloseTo(noteBox.y - 2 * row, 0);
      expect((await box(note)).x).toBeCloseTo(noteBox.x, 0);
      expect(await noteList(harness)).toEqual([vocal(0, BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
      expect(await harness.layout.canUndo()).toBe(false);
    });

    await expect(ghosts(page)).toHaveCount(0);
    await expect(laneOf(page)).not.toHaveAttribute("data-dragging");
    expect(await noteList(harness)).toEqual([vocal(2 * BEAT, BEAT, MIDDLE_C + 2), vocal(4 * BEAT, 4 * BEAT, 67)]);
    // The selection goes with the note: it is the note at its new place that is selected.
    expect(await harness.layout.selection()).toEqual([`Vocal:${2 * BEAT}`]);
    await expect(block(page, "D4, bar 1 beat 3, length 1 beat, selected")).toBeVisible();

    // One drag is one step in the history.
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([vocal(0, BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("shows the note on the grid and not where the pointer is", async ({ page, harness, press, isMobile }) => {
    await openTrack(harness, LEAD);
    await press(block(page, C4));
    const from = await centreOf(block(page, `${C4}, length 1 beat, selected`));
    const { lane, beat } = await metrics(page, 8);

    await drag(page, harness, isMobile, from, { x: from.x + 1.3 * beat, y: from.y }, async () => {
      // 1.3 beats of pointer is 333 ticks: the nearest line of a quarter grid is 1 beat.
      await expect(ghosts(page)).toHaveCount(1);
      expect((await box(ghosts(page))).x).toBeCloseTo(lane.x + beat, 0);
    });

    expect((await noteList(harness))[0]).toEqual(vocal(BEAT, BEAT, MIDDLE_C));
  });

  test("carries every selected note by the same time and pitch, in one step", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("D4z4A4z4|G16|"));
    await press(block(page, "D4, bar 1 beat 1"));
    await (isMobile
      ? block(page, "A4, bar 1 beat 3").tap({ modifiers: ["Shift"] })
      : block(page, "A4, bar 1 beat 3").click({ modifiers: ["Shift"] }));
    expect(await harness.layout.selection()).toEqual(["Vocal:0", "Vocal:512"]);
    const from = await centreOf(block(page, "D4, bar 1 beat 1, length 1 beat, selected"));
    const { beat, row } = await metrics(page, 8);

    await drag(page, harness, isMobile, from, { x: from.x + beat, y: from.y - 2 * row }, async () => {
      await expect(ghosts(page)).toHaveCount(2);
    });

    expect(await noteList(harness)).toEqual([
      vocal(BEAT, BEAT, 64),
      vocal(3 * BEAT, BEAT, 71),
      vocal(4 * BEAT, 4 * BEAT, 67),
    ]);
    expect(await harness.layout.selection()).toEqual([`Vocal:${BEAT}`, `Vocal:${3 * BEAT}`]);
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([
      vocal(0, BEAT, 62),
      vocal(2 * BEAT, BEAT, 69),
      vocal(4 * BEAT, 4 * BEAT, 67),
    ]);
    expect(await harness.layout.canUndo()).toBe(false);
  });
});

/** The edge zone at each end of a selected note, in pixels: what the project's pointer gets (DESIGN.md, "Moving and resizing"). */
const zoneOf = (isMobile: boolean) => (isMobile ? 12 : 6);

test.describe("dragging an edge", () => {
  /** A half note at the second beat, selected, with its box. */
  async function half(page: Page, harness: Harness, press: (target: Locator) => Promise<void>) {
    await openTrack(harness, vocalOnly("z4C8z4|G16|"));
    await press(block(page, "C4, bar 1 beat 2"));
    return box(block(page, "C4, bar 1 beat 2, length 2 beats, selected"));
  }

  test("the right edge sets where the note ends, on the grid", async ({ page, harness, press, isMobile }) => {
    const area = await half(page, harness, press);
    const { beat } = await metrics(page, 8);
    const from = { x: area.x + area.width - 3, y: area.y + area.height / 2 };

    await drag(page, harness, isMobile, from, { x: from.x + beat, y: from.y }, async () => {
      await expect(laneOf(page)).toHaveAttribute("data-dragging", "resize");
      await expect(ghosts(page)).toHaveCount(1);
      expect((await box(ghosts(page))).width).toBeCloseTo(3 * beat, 0);
    });

    expect(await noteList(harness)).toEqual([vocal(BEAT, 3 * BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    expect(await harness.layout.selection()).toEqual([`Vocal:${BEAT}`]);
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([vocal(BEAT, 2 * BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
  });

  test("the left edge sets where the note starts, and the selection follows it", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    const area = await half(page, harness, press);
    const { beat } = await metrics(page, 8);
    const from = { x: area.x + 3, y: area.y + area.height / 2 };

    await drag(page, harness, isMobile, from, { x: from.x - beat, y: from.y });

    expect(await noteList(harness)).toEqual([vocal(0, 3 * BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    // The note starts where it did not before, so it has a new id; the selection is on it.
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);
    await expect(block(page, "C4, bar 1 beat 1, length 3 beats, selected")).toBeVisible();
  });

  test("an edge taken a little past the start of the score lands on the start", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    const area = await half(page, harness, press);
    const { beat } = await metrics(page, 8);
    const from = { x: area.x + 3, y: area.y + area.height / 2 };

    // 1.2 beats left of an edge that is 1 beat from the start: the grid takes the start to the line it is nearest, 0.
    await drag(page, harness, isMobile, from, { x: from.x - 1.2 * beat, y: from.y });

    expect(await noteList(harness)).toEqual([vocal(0, 3 * BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    expect(await harness.layout.scoreText()).toContain("C12z4|");
  });

  test("a press just inside the edge zone resizes, and one just outside it moves", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    const area = await half(page, harness, press);
    const { beat } = await metrics(page, 8);
    const zone = zoneOf(isMobile);
    const y = area.y + area.height / 2;
    const inside = area.x + area.width - zone + 3;

    await drag(page, harness, isMobile, { x: inside, y }, { x: inside + beat, y });
    expect(await noteList(harness)).toEqual([vocal(BEAT, 3 * BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    await harness.layout.undo();

    const again = await box(block(page, "C4, bar 1 beat 2, length 2 beats, selected"));
    const outside = again.x + again.width - zone - 3;
    await drag(page, harness, isMobile, { x: outside, y }, { x: outside + beat, y });
    expect(await noteList(harness)).toEqual([vocal(2 * BEAT, 2 * BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
  });

  test("a note too narrow for two zones and a body is all body: a press at its edge moves it", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("C1z3z12|G16|"));
    await press(block(page, C4));
    const area = await box(block(page, "C4, bar 1 beat 1, length 0.25 beats, selected"));
    const { beat } = await metrics(page, 8);
    const from = { x: area.x + 2, y: area.y + area.height / 2 };

    await drag(page, harness, isMobile, from, { x: from.x + beat, y: from.y });

    // Moved by a beat with its length kept; a resize of the start edge would have shortened it.
    expect(await noteList(harness)).toEqual([vocal(BEAT, 64, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
  });

  test("what is drawn as a grip is what a press hits: a quarter note's edge resizes it, a finger's too", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    // A quarter note at the default zoom keeps a body between its two zones, with a finger as with a mouse.
    await openTrack(harness, vocalOnly("C4z12|G16|"));
    await press(block(page, C4));
    const selected = block(page, "C4, bar 1 beat 1, length 1 beat, selected");
    const gripped = await selected.evaluate((el) => getComputedStyle(el, "::after").content !== "none");
    expect(gripped).toBe(true);
    const area = await box(selected);
    const { beat } = await metrics(page, 8);
    const from = { x: area.x + area.width - 4, y: area.y + area.height / 2 };

    await drag(page, harness, isMobile, from, { x: from.x + beat, y: from.y });

    expect(await noteList(harness)).toEqual([vocal(0, 2 * BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
  });

  test("marks the zones with the resize cursor and the body with the move cursor", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    const area = await half(page, harness, press);
    const cursor = (pseudo: "::before" | "::after" | null) =>
      block(page, "C4, bar 1 beat 2").evaluate((el, which) => getComputedStyle(el, which).cursor, pseudo);
    expect(await cursor(null)).toBe("move");
    expect(await cursor("::before")).toBe("ew-resize");
    expect(await cursor("::after")).toBe("ew-resize");
    // The grip is as wide as the zone a press finds.
    const grip = await block(page, "C4, bar 1 beat 2").evaluate((el) =>
      parseFloat(getComputedStyle(el, "::after").width),
    );
    expect(grip).toBe(zoneOf(isMobile));
    expect(area.width).toBeGreaterThan(zoneOf(isMobile) * 3);
  });
});

test.describe("where a dropped note lands", () => {
  test("covers the start of another note: that note is gone, the dropped note stays whole", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("C4E8z4|G16|"));
    await press(block(page, "C4, bar 1 beat 1"));
    const from = await centreOf(block(page, "C4, bar 1 beat 1, length 1 beat, selected"));
    const { beat } = await metrics(page, 8);

    await drag(page, harness, isMobile, from, { x: from.x + beat, y: from.y });

    // E began where the dropped note now begins, so it is covered whole, though it lasted longer than the dropped note.
    expect(await noteList(harness)).toEqual([vocal(BEAT, BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(2);
    await expect(block(page, "E4")).toHaveCount(0);
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([
      vocal(0, BEAT, MIDDLE_C),
      vocal(BEAT, 2 * BEAT, 64),
      vocal(4 * BEAT, 4 * BEAT, 67),
    ]);
  });

  test("presses on the end of another note: that note is made shorter and ends where the dropped one begins", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("E8C4z4|G16|"));
    await press(block(page, "C4, bar 1 beat 3"));
    const from = await centreOf(block(page, "C4, bar 1 beat 3, length 1 beat, selected"));
    const { beat } = await metrics(page, 8);

    await drag(page, harness, isMobile, from, { x: from.x - beat, y: from.y });

    expect(await noteList(harness)).toEqual([vocal(0, BEAT, 64), vocal(BEAT, BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    await expect(block(page, "E4, bar 1 beat 1, length 1 beat")).toBeVisible();
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([
      vocal(0, 2 * BEAT, 64),
      vocal(2 * BEAT, BEAT, MIDDLE_C),
      vocal(4 * BEAT, 4 * BEAT, 67),
    ]);
  });

  test("a move to a place past the end of the score is refused: nothing changes, and the reason is said", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("C8z8|G16|"));
    await press(block(page, "C4, bar 1 beat 1"));
    const from = await centreOf(block(page, "C4, bar 1 beat 1, length 2 beats, selected"));
    const { lane } = await metrics(page, 8);

    // The pointer goes to the last pixel of the lane; the note, held by its middle, would end past it.
    await drag(page, harness, isMobile, from, { x: lane.x + lane.width - 2, y: from.y }, async () => {
      await expect(ghosts(page)).toHaveCount(1);
    });

    await expect(said(page)).toHaveText("The note would end past the end of the score. (bar 1, beat 1)");
    expect(await noteList(harness)).toEqual([vocal(0, 2 * BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);
    await expect(ghosts(page)).toHaveCount(0);
  });

  test("the default editor tells the host of that refusal once, as it does for the keys", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await harness.mount({ score: { text: vocalOnly("C8z8|G16|") } });
    const notes = page.getByRole("list", { name: "Vocal" }).getByRole("listitem");
    await press(notes.first());
    const from = await centreOf(notes.first());
    const lane = await box(page.locator(".sce-lane").first());

    await drag(page, harness, isMobile, from, { x: lane.x + lane.width - 2, y: from.y });

    await expect.poll(async () => (await harness.notices()).length).toBe(1);
    expect(await harness.notices()).toEqual([
      {
        code: "command-refused",
        level: "warning",
        message: "The note would end past the end of the score. (bar 1, beat 1)",
      },
    ]);
  });

  test("a drag that ends where it began changes nothing and leaves no step in the history", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, LEAD);
    await press(block(page, C4));
    const from = await centreOf(block(page, "C4, bar 1 beat 1, length 1 beat, selected"));
    const { beat } = await metrics(page, 8);
    const pointer = await pointerOf(page, harness, isMobile, { holdMs: 0 });
    await withPointer(pointer, async () => {
      await pointer.down(from);
      await pointer.move({ x: from.x + 2 * beat, y: from.y });
      await pointer.move(from);
      await pointer.up();
    });

    expect(await noteList(harness)).toEqual([vocal(0, BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    expect(await harness.layout.canUndo()).toBe(false);
  });
});

test.describe("a note across a bar line", () => {
  /** A half note starting on the last beat of the first bar, written as two tied notes. */
  const ACROSS = vocalOnly("z12C4-|C4z12|");

  test("is drawn as one joined note: no bar line shows through it, and it is selected and carried whole", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, ACROSS);
    const { lane, beat } = await metrics(page, 8);
    const first = block(page, "C4, bar 1 beat 4");
    const second = block(page, "C4, bar 2 beat 1");
    // Tapping either half takes the whole note: the session holds the half that was tapped, and both are drawn selected.
    await press(second);
    expect(await harness.layout.selection()).toEqual([`Vocal:${4 * BEAT}`]);
    await expect(first).toHaveAccessibleName(/selected$/);
    await expect(second).toHaveAccessibleName(/selected$/);

    // The two halves meet on the bar line, and the line is not drawn over them.
    const left = await box(first);
    const right = await box(second);
    expect(left.x + left.width).toBeCloseTo(right.x, 0);
    const join = { x: lane.x + 4 * beat, y: left.y + left.height / 2 };
    expect(
      await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest(".sce-note")), join),
    ).toBe(true);

    const from = await centreOf(first);
    await drag(page, harness, isMobile, from, { x: from.x + beat, y: from.y }, async () => {
      // One outline for the whole note, over the bar line: the line shows through it.
      await expect(ghosts(page)).toHaveCount(1);
      const ghost = await box(ghosts(page));
      expect(ghost.x).toBeCloseTo(lane.x + 4 * beat, 0);
      expect(ghost.width).toBeCloseTo(2 * beat, 0);
    });
    // Moved whole: it now sits inside the second bar, a note again, with nothing left of the tie.
    expect(await noteList(harness)).toEqual([vocal(4 * BEAT, 2 * BEAT, MIDDLE_C)]);
    expect(await harness.layout.scoreText()).toContain("|C8z8|");
  });

  test("is said to have moved when it is moved by its second half", async ({ page, harness, press }) => {
    await openTrack(harness, ACROSS);
    await press(block(page, "C4, bar 2 beat 1"));
    expect(await harness.layout.selection()).toEqual([`Vocal:${4 * BEAT}`]);

    await page.keyboard.press("ArrowRight");

    // The chain is one note from its first half to its last, so moving it by the second half did not resize it.
    await expect(said(page)).toHaveText("Moved to C4, bar 2 beat 1");
  });

  test("is written split at the bar line and tied when a move makes a note cross it", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("C8z8|z16|"));
    await press(block(page, "C4, bar 1 beat 1"));
    const from = await centreOf(block(page, "C4, bar 1 beat 1, length 2 beats, selected"));
    const { beat } = await metrics(page, 8);

    await drag(page, harness, isMobile, from, { x: from.x + 3 * beat, y: from.y });

    expect(await noteList(harness)).toEqual([vocal(3 * BEAT, BEAT, MIDDLE_C), vocal(4 * BEAT, BEAT, MIDDLE_C)]);
    expect(await harness.layout.scoreText()).toContain("C4-|C4");
    // On the screen it is one note, selected as a whole, though the score holds two.
    expect(await harness.layout.selection()).toEqual([`Vocal:${3 * BEAT}`]);
    await expect(block(page, "C4, bar 1 beat 4, length 1 beat, tied to the next note, selected")).toBeVisible();
    await expect(block(page, "C4, bar 2 beat 1, length 1 beat, selected")).toBeVisible();
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([vocal(0, 2 * BEAT, MIDDLE_C)]);
  });

  test("has an edge only at its two ends: the join in the middle is body", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, ACROSS);
    await press(block(page, "C4, bar 1 beat 4"));
    const first = await box(block(page, "C4, bar 1 beat 4, length 1 beat, tied to the next note, selected"));
    const second = await box(block(page, "C4, bar 2 beat 1, length 1 beat, selected"));
    const { beat } = await metrics(page, 8);
    const y = first.y + first.height / 2;

    // A press at the join, on the right edge of the first half, carries the note: it does not resize it.
    await drag(
      page,
      harness,
      isMobile,
      { x: first.x + first.width - 2, y },
      { x: first.x + first.width - 2 - beat, y },
    );
    expect(await noteList(harness)).toEqual([vocal(2 * BEAT, 2 * BEAT, MIDDLE_C)]);
    await harness.layout.undo();

    // The far end of the second half resizes the whole note.
    const far = { x: second.x + second.width - 3, y: second.y + second.height / 2 };
    await drag(page, harness, isMobile, far, { x: far.x + beat, y: far.y });
    expect(await noteList(harness)).toEqual([vocal(3 * BEAT, BEAT, MIDDLE_C), vocal(4 * BEAT, 2 * BEAT, MIDDLE_C)]);
  });
});

test.describe("giving a drag up", () => {
  test("Escape drops the ghosts and leaves the notes, the selection and the history as they were", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, LEAD);
    await press(block(page, C4));
    const from = await centreOf(block(page, "C4, bar 1 beat 1, length 1 beat, selected"));
    const { beat } = await metrics(page, 8);

    await drag(page, harness, isMobile, from, { x: from.x + 2 * beat, y: from.y }, async () => {
      await expect(ghosts(page)).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(ghosts(page)).toHaveCount(0);
      await expect(laneOf(page)).not.toHaveAttribute("data-dragging");
    });

    expect(await noteList(harness)).toEqual([vocal(0, BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a drag on a note that is not selected moves nothing", async ({ page, harness, press, isMobile }) => {
    await openTrack(harness, vocalOnly("C4D4z8|G16|"));
    await press(block(page, "C4, bar 1 beat 1"));
    const from = await centreOf(block(page, "D4, bar 1 beat 2"));
    const { beat } = await metrics(page, 8);

    await drag(page, harness, isMobile, from, { x: from.x + 2 * beat, y: from.y });

    expect(await noteList(harness)).toEqual([vocal(0, BEAT, MIDDLE_C), vocal(BEAT, BEAT, 62), vocal(4 * BEAT, 4 * BEAT, 67)]);
    expect(await harness.layout.canUndo()).toBe(false);
  });
});

test.describe("forced colors", () => {
  // The system draws every fill in its own palette, so the marks that are a colour of their own must say it: a grip
  // painted in the colour of the ground would be the colour of the note, and a dotted grid would lose its dot.
  test("keep the grips on a selected note and the dot of a dotted grid in view", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    test.skip(isMobile, "the grips of a finger need a note wider than this one");
    await page.emulateMedia({ forcedColors: "active" });
    await openTrack(harness, vocalOnly("z4C8z4|G16|"));
    await press(gridButton(page));
    await press(gridItem(page, "Dotted 1/8"));
    await press(block(page, "C4, bar 1 beat 2"));

    const dot = gridButton(page).locator(".sce-grid-dot");
    const [dotFill, buttonFill] = await Promise.all([
      dot.evaluate((el) => getComputedStyle(el).backgroundColor),
      gridButton(page).evaluate((el) => getComputedStyle(el).backgroundColor),
    ]);
    expect(dotFill).not.toBe(buttonFill);

    const note = block(page, "C4, bar 1 beat 2, length 2 beats, selected");
    const noteFill = await note.evaluate((el) => getComputedStyle(el).backgroundColor);
    for (const side of ["::before", "::after"]) {
      const grip = await note.evaluate((el, pseudo) => getComputedStyle(el, pseudo).backgroundImage, side);
      expect(grip).toContain("gradient");
      expect(grip).not.toContain(noteFill);
    }
  });
});

test.describe("the browser's pan", () => {
  // The touchmove guard cancels a pan once a drag has begun. This style is what keeps the browser from starting one on
  // its own, and it holds when the page is too busy to answer in time. Real touch input cannot tell the two apart.
  test("is off on a selected note and left on for the rest of the track", async ({ page, harness, press }) => {
    await openTrack(harness, LEAD);
    await press(block(page, C4));

    await expect(block(page, "C4, bar 1 beat 1, length 1 beat, selected")).toHaveCSS("touch-action", "none");
    await expect(block(page, "G4, bar 2 beat 1")).not.toHaveCSS("touch-action", "none");
    // Chromium writes the track's `pan-x pan-y pinch-zoom` as its keyword.
    await expect(slot(page, "vocal").locator(".sce-axis")).toHaveCSS("touch-action", "manipulation");
  });
});

test.describe("a finger on a selected note", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "these are touch gestures");
  });

  test("moves the note and does not scroll the track", async ({ page, harness, press }) => {
    await openTrack(harness, vocalOnly("z12C4|G16|", ...Array(3).fill("C16|C16|C16|C16|")));
    await press(block(page, "C4, bar 1 beat 4"));
    const from = await centreOf(block(page, "C4, bar 1 beat 4, length 1 beat, selected"));
    const finger = await harness.finger();
    await withPointer(finger, async () => {
      await finger.down(from);
      await finger.move({ x: from.x - 80, y: from.y });
      await finger.up();
    });

    // A finger sliding left over the lane would scroll it right; over the selected note it carries the note left.
    expect((await harness.layout.view()).scrollLeft).toBe(0);
    expect((await noteList(harness))[0]?.start).toBeLessThan(3 * BEAT);
  });

  test("rests on it without sliding and takes it out of the selection, as a hold does anywhere", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, LEAD);
    await press(block(page, C4));
    const from = await centreOf(block(page, "C4, bar 1 beat 1, length 1 beat, selected"));
    const finger = await harness.finger();
    await withPointer(finger, async () => {
      await finger.down(from, 600);
      await finger.up();
    });

    expect(await harness.layout.selection()).toEqual([]);
    expect(await noteList(harness)).toEqual([vocal(0, BEAT, MIDDLE_C), vocal(4 * BEAT, 4 * BEAT, 67)]);
  });

  test("resizes a quarter note at the default zoom from both ends, and a slide on its body still moves it", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("z4C4z8|G16|"));
    await press(block(page, "C4, bar 1 beat 2"));
    const { beat } = await metrics(page, 8);
    const selected = () => block(page, "C4, bar 1 beat 2, length 1 beat, selected");
    const rest = vocal(4 * BEAT, 4 * BEAT, 67);
    const middle = async () => {
      const area = await box(selected());
      return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
    };

    // A press 4 px inside the right edge is in its zone, though the note is a quarter at the phone's default zoom.
    const right = await box(selected());
    await drag(
      page,
      harness,
      isMobile,
      { x: right.x + right.width - 4, y: right.y + right.height / 2 },
      { x: right.x + right.width - 4 + beat, y: right.y + right.height / 2 },
    );
    expect(await noteList(harness)).toEqual([vocal(BEAT, 2 * BEAT, MIDDLE_C), rest]);
    await harness.layout.undo();

    const left = await box(selected());
    await drag(
      page,
      harness,
      isMobile,
      { x: left.x + 4, y: left.y + left.height / 2 },
      { x: left.x + 4 - beat, y: left.y + left.height / 2 },
    );
    expect(await noteList(harness)).toEqual([vocal(0, 2 * BEAT, MIDDLE_C), rest]);
    await harness.layout.undo();

    // The body between the two zones still moves the note.
    const from = await middle();
    await drag(page, harness, isMobile, from, { x: from.x + beat, y: from.y });
    expect(await noteList(harness)).toEqual([vocal(2 * BEAT, BEAT, MIDDLE_C), rest]);
  });
});

test.describe("the arrow keys on the selected notes", () => {
  /** A half note at the second beat, selected, with the focus on the track. */
  async function selectedHalf(page: Page, harness: Harness, press: (target: Locator) => Promise<void>) {
    await openTrack(harness, vocalOnly("z4C8z4|G16|"));
    await press(block(page, "C4, bar 1 beat 2"));
    await expect(block(page, "C4, bar 1 beat 2, length 2 beats, selected")).toBeFocused();
  }
  const start = vocal(BEAT, 2 * BEAT, MIDDLE_C);
  const rest = vocal(4 * BEAT, 4 * BEAT, 67);

  const keys: ReadonlyArray<[string, ReturnType<typeof vocal>]> = [
    ["ArrowRight", vocal(2 * BEAT, 2 * BEAT, MIDDLE_C)],
    ["ArrowLeft", vocal(0, 2 * BEAT, MIDDLE_C)],
    ["ArrowUp", vocal(BEAT, 2 * BEAT, MIDDLE_C + 1)],
    ["ArrowDown", vocal(BEAT, 2 * BEAT, MIDDLE_C - 1)],
    ["Shift+ArrowUp", vocal(BEAT, 2 * BEAT, MIDDLE_C + 12)],
    ["Shift+ArrowDown", vocal(BEAT, 2 * BEAT, MIDDLE_C - 12)],
    ["Shift+ArrowRight", vocal(BEAT, 3 * BEAT, MIDDLE_C)],
    ["Shift+ArrowLeft", vocal(BEAT, BEAT, MIDDLE_C)],
  ];

  for (const [key, expected] of keys) {
    test(`${key} edits the selected note by a grid step, a semitone or an octave, in one step of the history`, async ({
      page,
      harness,
      press,
    }) => {
      await selectedHalf(page, harness, press);
      await page.keyboard.press(key);
      expect(await noteList(harness)).toEqual([expected, rest]);
      expect(await harness.layout.undo()).toBe(true);
      expect(await noteList(harness)).toEqual([start, rest]);
      expect(await harness.layout.canUndo()).toBe(false);
    });
  }

  test("do nothing to the score while the editor is read-only, and nothing is said", async ({
    page,
    harness,
    press,
  }) => {
    await selectedHalf(page, harness, press);
    await harness.layout.setEditable(false);
    const before = await said(page).textContent();
    for (const [key] of keys) await page.keyboard.press(key);
    expect(await noteList(harness)).toEqual([start, rest]);
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await said(page).textContent()).toBe(before);
  });

  test("with nothing selected the insertion point keeps its keys: the point moves, and no note does", async ({
    page,
    harness,
  }) => {
    await openTrack(harness, vocalOnly("z4C8z4|G16|"));
    await trackRegion(page).focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    expect(await harness.layout.insertionPoint()).toEqual({ tick: BEAT });
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("ArrowUp");
    expect(await noteList(harness)).toEqual([start, rest]);
  });

  test("move the focus with the note, and Control with an arrow still walks the focus without editing", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C4D4E4F4|G16|"));
    await press(block(page, "D4, bar 1 beat 2"));
    await page.keyboard.press("Control+ArrowRight");
    await expect(block(page, "E4, bar 1 beat 3, length 1 beat")).toBeFocused();
    expect(await harness.layout.selection()).toEqual([`Vocal:${BEAT}`]);
    expect((await noteList(harness)).map((found) => found.start)).toEqual([0, BEAT, 2 * BEAT, 3 * BEAT, 4 * BEAT]);

    // The note that is edited keeps the focus: the keys go on from where it is now.
    await page.keyboard.press("Control+ArrowLeft");
    await expect(block(page, "D4, bar 1 beat 2, length 1 beat, selected")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(block(page, "D#4, bar 1 beat 2, length 1 beat, selected")).toBeFocused();
  });

  test("say what they did, in the language of the editor", async ({ page, harness, press }) => {
    await selectedHalf(page, harness, press);
    await page.keyboard.press("ArrowRight");
    await expect(said(page)).toHaveText("Moved to C4, bar 1 beat 3");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(said(page)).toHaveText("Resized C4, bar 1 beat 3, length 3 beats");
    await page.keyboard.press("Control+z");
    await expect(said(page)).toHaveText("Resized C4, bar 1 beat 3, length 2 beats");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(said(page)).toHaveText("The note would start before the beginning of the score. (bar 1, beat 1)");
  });

  test("say it in Chinese when the editor is", async ({ page, harness, press }) => {
    await openTrack(harness, vocalOnly("z4C8z4|G16|"), { language: "zh" });
    await press(block(page, "C4，第 1 小节第 2 拍"));
    await page.keyboard.press("ArrowRight");
    await expect(said(page)).toHaveText("已移到 C4，第 1 小节第 3 拍");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(said(page)).toHaveText("已调整 C4，第 1 小节第 3 拍，长 3 拍");
  });
});

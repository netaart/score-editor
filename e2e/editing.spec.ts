// ABOUTME: Seam 5 for editing in view parts: select, delete, undo, the Grid menu, the insertion point, the toolbar and what is said.
// ABOUTME: Parts are mounted on one session in the page's own layout; tests act as a user does and read what the session holds.
import type { Locator, Page } from "@playwright/test";
import {
  BEAT,
  block,
  box,
  centreOf,
  drag,
  expect,
  gridButton,
  gridItem,
  laneOf,
  LEAD,
  metrics,
  MIDDLE_C,
  noteList,
  openTrack,
  type Point,
  QUARTERS,
  slot,
  test,
  toolbar,
  trackRegion,
  vocal,
  vocalOnly,
} from "./fixtures";

const C4 = "C4, bar 1 beat 1, length 1 beat";
const D4 = "D4, bar 1 beat 2, length 1 beat";
const E4 = "E4, bar 1 beat 3, length 1 beat";
const F4 = "F4, bar 1 beat 4, length 1 beat";
const G4 = "G4, bar 2 beat 1, length 4 beats";

const note = (page: Page, name: string) => slot(page, "vocal").getByRole("listitem", { name, exact: true });
const selected = (page: Page, name: string) => note(page, `${name}, selected`);
const lane = (page: Page) => slot(page, "vocal").getByRole("list", { name: "Vocal" });

test.describe("selecting a note in a voice track", () => {
  test("a click or a tap selects the note: it is named as selected, framed with a 2px border (visual), and the session holds its id", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await expect(note(page, D4)).toHaveCSS("border-top-width", "1px");

    await press(note(page, D4));

    await expect(selected(page, D4)).toBeVisible();
    await expect(selected(page, D4)).toHaveCSS("border-top-width", "2px");
    await expect(note(page, C4)).toHaveCSS("border-top-width", "1px");
    expect(await harness.layout.selection()).toEqual(["Vocal:256"]);
    expect(await harness.layout.insertionPoint()).toBeNull();
  });

  test("the pointer cursor and the quiet tap flash belong to editing (visual): a note has them while editable, not read-only", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    await expect(note(page, D4)).toHaveCSS("cursor", "pointer");
    await expect(note(page, D4)).toHaveCSS("-webkit-tap-highlight-color", "rgba(0, 0, 0, 0)");

    await harness.layout.setEditable(false);
    await expect(note(page, D4)).toHaveCSS("cursor", "auto");
    await expect(note(page, D4)).not.toHaveCSS("-webkit-tap-highlight-color", "rgba(0, 0, 0, 0)");
  });

  test("selecting another note moves the selection, and empty space clears it", async ({ page, harness, press }) => {
    await openTrack(harness, vocalOnly("C4z4E4F4|G16|"));

    await press(note(page, C4));
    await press(note(page, E4));
    await expect(selected(page, E4)).toBeVisible();
    await expect(note(page, C4)).toBeVisible();
    expect(await harness.layout.selection()).toEqual(["Vocal:512"]);

    await press(lane(page), { x: 60, y: 4 });
    await expect(slot(page, "vocal").getByRole("listitem", { name: /, selected$/ })).toHaveCount(0);
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("a tie chain is selected as a whole, since deleting any of it takes the whole of it", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C16-|C16|"));
    const first = "C4, bar 1 beat 1, length 4 beats, tied to the next note";
    const second = "C4, bar 2 beat 1, length 4 beats";

    await press(note(page, second));

    await expect(note(page, `${first}, selected`)).toHaveCSS("border-top-width", "2px");
    await expect(note(page, `${second}, selected`)).toHaveCSS("border-top-width", "2px");
    // The joint stays a joint: the chain still reads as one bar.
    await expect(note(page, `${first}, selected`)).toHaveCSS("border-right-width", "0px");
    await expect(note(page, `${second}, selected`)).toHaveCSS("border-left-width", "0px");
    expect(await harness.layout.selection()).toEqual(["Vocal:1024"]);
  });

  test("pressing and dragging past a few pixels is not a click: nothing is selected", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "a finger that moves is a scroll; the swipe test below covers it");
    await openTrack(harness);
    const area = await box(note(page, D4));
    const y = area.y + area.height / 2;

    await page.mouse.move(area.x + 10, y);
    await page.mouse.down();
    await page.mouse.move(area.x + 30, y, { steps: 4 });
    await page.mouse.up();

    expect(await harness.layout.selection()).toEqual([]);
    await expect(slot(page, "vocal").getByRole("listitem", { name: /, selected$/ })).toHaveCount(0);
  });

  test("a swipe over the notes scrolls the track and selects nothing", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "a swipe needs a touch screen");
    await openTrack(harness, vocalOnly(...Array(3).fill("C16|C16|C16|C16|")));
    const area = await box(note(page, "C4, bar 1 beat 1, length 4 beats"));
    const at = { x: area.x + area.width / 2, y: area.y + area.height / 2 };

    await harness.swipe({ x: at.x + 60, y: at.y }, { x: at.x - 60, y: at.y });

    expect((await harness.layout.view()).scrollLeft).toBeGreaterThan(20);
    expect(await harness.layout.selection()).toEqual([]);
  });
});

const undoButton = (page: Page) => toolbar(page).getByRole("button", { name: "Undo", exact: true });
const redoButton = (page: Page) => toolbar(page).getByRole("button", { name: "Redo", exact: true });
const deleteButton = (page: Page) => toolbar(page).getByRole("button", { name: "Delete", exact: true });

test.describe("the toolbar part", () => {
  test("shows the title, the zoom group, and undo and redo that follow the history", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness);
    // The row wraps when it holds the preview control, so the title keeps its place on a phone's width too.
    const title = toolbar(page).getByText("Arrangement", { exact: true });
    await expect(title).toBeVisible();
    await expect(toolbar(page).getByRole("group", { name: "Zoom" })).toBeVisible();
    const history = toolbar(page).getByRole("group", { name: "History" });
    await expect(history.getByRole("button")).toHaveCount(2);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(toolbar(page).getByText("Read only")).toBeHidden();
    await expect(undoButton(page)).toHaveAttribute("title", "Undo (Ctrl/Cmd+Z)");
    await expect(redoButton(page)).toHaveAttribute("title", "Redo (Ctrl/Cmd+Shift+Z)");

    await harness.layout.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await expect(note(page, D4)).toHaveCount(0);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "false");
    await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true");

    await press(undoButton(page));
    await expect(note(page, D4)).toBeVisible();
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(redoButton(page)).toHaveAttribute("aria-disabled", "false");

    await press(redoButton(page));
    await expect(note(page, D4)).toHaveCount(0);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "false");
    await expect(redoButton(page)).toHaveAttribute("aria-disabled", "true");

    // A button with nothing to do stays where it is and does nothing when pressed.
    const score = await harness.layout.scoreText();
    await (isMobile ? redoButton(page).tap({ force: true }) : redoButton(page).click({ force: true }));
    expect(await harness.layout.scoreText()).toBe(score);
  });

  test("offers Delete beside undo and redo, muted until a pitched note is selected, and a forced press does nothing", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await expect(deleteButton(page)).toBeVisible();
    await expect(deleteButton(page)).toHaveAttribute("title", "Delete (Del/Backspace)");
    await expect(deleteButton(page)).toHaveAttribute("aria-disabled", "true");

    const score = await harness.layout.scoreText();
    await deleteButton(page).click({ force: true });
    expect(await harness.layout.scoreText()).toBe(score);
    expect(await harness.layout.canUndo()).toBe(false);

    await press(note(page, D4));
    await expect(deleteButton(page)).toHaveAttribute("aria-disabled", "false");
    await harness.layout.select([]);
    await expect(deleteButton(page)).toHaveAttribute("aria-disabled", "true");
  });

  test("offers no undo and redo while read-only, shows the badge instead, and follows the session's flag", async ({
    page,
    harness,
  }) => {
    await openTrack(harness, QUARTERS, { editable: false });
    await expect(toolbar(page).getByText("Read only", { exact: true })).toBeVisible();
    await expect(toolbar(page).getByRole("group", { name: "Zoom" })).toBeVisible();
    await expect(undoButton(page)).toBeHidden();
    await expect(redoButton(page)).toBeHidden();
    await expect(deleteButton(page)).toBeHidden();
    await expect(toolbar(page).getByRole("group", { name: "History" })).toBeHidden();

    await harness.layout.setEditable(true);
    await expect(undoButton(page)).toBeVisible();
    await expect(deleteButton(page)).toBeVisible();
    await expect(toolbar(page).getByText("Read only", { exact: true })).toBeHidden();

    await harness.layout.setEditable(false);
    await expect(undoButton(page)).toBeHidden();
    await expect(deleteButton(page)).toBeHidden();
    await expect(toolbar(page).getByText("Read only", { exact: true })).toBeVisible();
  });

  test("speaks the session's language", async ({ page, harness }) => {
    const shown = (title: Locator) => expect(title).toBeVisible();
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["toolbar", "vocal"], language: "zh" });
    await expect(toolbar(page).getByRole("group", { name: "历史" })).toBeVisible();
    await expect(toolbar(page).getByRole("button", { name: "撤销", exact: true })).toBeVisible();
    await expect(toolbar(page).getByRole("button", { name: "重做", exact: true })).toBeVisible();
    await expect(toolbar(page).getByRole("button", { name: "删除", exact: true })).toBeVisible();
    await shown(toolbar(page).getByText("编曲视图", { exact: true }));

    await harness.layout.setView({ language: "en" });
    await expect(undoButton(page)).toBeVisible();
    await expect(deleteButton(page)).toBeVisible();
    await shown(toolbar(page).getByText("Arrangement", { exact: true }));
  });

  test("scrolls sideways when its box is narrower than its controls, and every control can be reached", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await harness.layout.open({
      score: { text: QUARTERS },
      parts: ["toolbar", "vocal"],
      scene: "tight-toolbar",
    });
    await harness.layout.dispatch({ type: "toRest", noteId: "Vocal:256" });
    await harness.layout.undo();
    const shown = await box(toolbar(page));
    expect(shown.width).toBe(190);
    // A host narrower than the row makes it scroll; it never squeezes Delete, the touch way to delete, below its neighbours.
    expect((await box(deleteButton(page))).width).toBe((await box(undoButton(page))).width);
    const rightEdge = async (control: Locator) => {
      const area = await box(control);
      return area.x + area.width;
    };
    // The last control is out of sight to begin with, and the first is not.
    expect(await rightEdge(deleteButton(page))).toBeGreaterThan(shown.x + shown.width);
    expect(await rightEdge(toolbar(page).getByText("Arrangement", { exact: true }))).toBeLessThan(
      shown.x + shown.width,
    );

    if (isMobile) {
      const at = { x: shown.x + shown.width / 2, y: shown.y + shown.height / 2 };
      await harness.swipe({ x: at.x + 80, y: at.y }, { x: at.x - 80, y: at.y });
      await expect.poll(async () => (await box(deleteButton(page))).x).toBeLessThan(shown.x + shown.width);
    } else {
      await deleteButton(page).focus();
    }
    await expect.poll(() => rightEdge(deleteButton(page))).toBeLessThanOrEqual(shown.x + shown.width + 1);
    const redo = await box(redoButton(page));
    expect(redo.x).toBeGreaterThanOrEqual(shown.x - 1);
    await press(redoButton(page));
    await expect(note(page, D4)).toHaveCount(0);
  });

  test("shows every control inside its box when it has room", async ({ page, harness }) => {
    await openTrack(harness);
    const shown = await box(toolbar(page));
    for (const control of [undoButton(page), redoButton(page), deleteButton(page)]) {
      const area = await box(control);
      expect(area.x).toBeGreaterThanOrEqual(shown.x);
      expect(area.x + area.width).toBeLessThanOrEqual(shown.x + shown.width);
    }
  });
});

/** Every note of the track as it stands, by name: where it is and how wide, for telling that nothing else moved. */
async function layoutOf(page: Page, names: string[]) {
  const found: Record<string, { x: number; width: number }> = {};
  for (const name of names) {
    const { x, width } = await box(note(page, name));
    found[name] = { x, width };
  }
  return found;
}

test.describe("deleting the selected note", () => {
  for (const deleteKey of ["Delete", "Backspace"]) {
    test(`${deleteKey} turns the note into a rest and leaves every other note where it was`, async ({
      page,
      harness,
      press,
    }) => {
      await openTrack(harness);
      const others = [C4, E4, F4, G4];
      const before = await layoutOf(page, others);

      await press(note(page, D4));
      await page.keyboard.press(deleteKey);

      await expect(note(page, D4)).toHaveCount(0);
      await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(4);
      expect(await layoutOf(page, others)).toEqual(before);
      expect(await harness.layout.scoreText()).toContain("C4z4E4F4|G16|");
    });
  }

  test("the Delete button does it with a tap or a click alone, and the Undo button brings the note back: no keyboard", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    const others = [C4, E4, F4, G4];
    const before = await layoutOf(page, others);

    await press(note(page, D4));
    await press(deleteButton(page));

    await expect(note(page, D4)).toHaveCount(0);
    expect(await layoutOf(page, others)).toEqual(before);
    expect(await harness.layout.scoreText()).toContain("C4z4E4F4|G16|");
    await expect(deleteButton(page)).toHaveAttribute("aria-disabled", "true");

    await press(undoButton(page));
    await expect(selected(page, D4)).toBeVisible();
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("the Delete button takes every selected note as one step", async ({ page, harness, press }) => {
    await openTrack(harness);
    await harness.layout.select(["Vocal:256", "Vocal:768"]);

    await press(deleteButton(page));

    await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(3);
    await press(undoButton(page));
    await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(5);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("does nothing when no note is selected", async ({ page, harness }) => {
    await openTrack(harness);
    const score = await harness.layout.scoreText();
    await trackRegion(page).focus();
    await page.keyboard.press("Delete");
    await page.keyboard.press("Backspace");
    expect(await harness.layout.scoreText()).toBe(score);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(5);
  });

  test("takes a whole tie chain with the note that was selected, and undo brings the chain back", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C16-|C16|"));
    await press(note(page, "C4, bar 1 beat 1, length 4 beats, tied to the next note"));
    await page.keyboard.press("Delete");
    await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(0);

    await page.keyboard.press("Control+z");
    await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(2);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("leaves the score, the history and the selection alone when the score would not take the edit", async ({
    page,
    harness,
    press,
  }) => {
    // The first note is tied into a cut tail: writing it as a rest would turn the cut into a complete score.
    const cut = vocalOnly("C16-|B");
    await openTrack(harness, cut);
    await press(slot(page, "vocal").getByRole("listitem").first());
    await page.keyboard.press("Delete");

    await expect(slot(page, "vocal").getByRole("listitem")).toHaveCount(1);
    expect(await harness.layout.scoreText()).toBe(cut);
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);
  });
});

test.describe("undo and redo by keyboard and by the toolbar", () => {
  test("Ctrl+Z, Cmd+Z, Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y move through the history of the deleted note", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    const anyD = slot(page, "vocal").getByRole("listitem", { name: /^D4,/ });
    await press(note(page, D4));
    await page.keyboard.press("Delete");
    await expect(anyD).toHaveCount(0);

    await page.keyboard.press("Control+z");
    await expect(anyD).toHaveCount(1);
    // The selection stayed on the note, so it comes back selected.
    await expect(selected(page, D4)).toBeVisible();
    await page.keyboard.press("Control+Shift+z");
    await expect(anyD).toHaveCount(0);
    await page.keyboard.press("Meta+z");
    await expect(anyD).toHaveCount(1);
    await page.keyboard.press("Meta+Shift+z");
    await expect(anyD).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(anyD).toHaveCount(1);
    await page.keyboard.press("Control+y");
    await expect(anyD).toHaveCount(0);
    // Nothing is left to redo, and the keys say nothing.
    await page.keyboard.press("Control+y");
    await expect(anyD).toHaveCount(0);
  });

  test("the toolbar's buttons undo and redo the same steps, and its keys keep working after a press", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    const anyD = slot(page, "vocal").getByRole("listitem", { name: /^D4,/ });
    await press(note(page, D4));
    await page.keyboard.press("Delete");
    await expect(anyD).toHaveCount(0);

    await press(undoButton(page));
    await expect(anyD).toHaveCount(1);
    // The pressed button has the focus now; the editing keys still reach the session from there.
    await page.keyboard.press("Control+y");
    await expect(anyD).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(anyD).toHaveCount(1);
    await press(redoButton(page));
    await expect(anyD).toHaveCount(0);
  });
});

test.describe("read-only", () => {
  test("a click selects nothing, Delete and the history keys do nothing, and no insertion point appears", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, QUARTERS, { editable: false });
    const score = await harness.layout.scoreText();

    await press(note(page, D4));
    await press(lane(page), { x: 100, y: 4 });
    await trackRegion(page).focus();
    for (const keys of ["Delete", "Backspace", "Control+z", "Control+y", "ArrowRight", "End", "Home"]) {
      await page.keyboard.press(keys);
    }

    expect(await harness.layout.selection()).toEqual([]);
    expect(await harness.layout.insertionPoint()).toBeNull();
    expect(await harness.layout.scoreText()).toBe(score);
    await expect(slot(page, "vocal").getByRole("listitem", { name: /, selected$/ })).toHaveCount(0);
    await expect(slot(page, "vocal").getByRole("separator")).toHaveCount(0);
  });

  test("hides the frame and the insertion point when the session stops being editable, and shows them again", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C4z4E4F4|G16|"));
    await press(note(page, C4));
    await press(lane(page), { x: 100, y: 4 });
    await press(note(page, E4));
    const point = slot(page, "vocal").getByRole("separator");
    await expect(selected(page, E4)).toBeVisible();
    await expect(point).toHaveCount(1);

    await harness.layout.setEditable(false);
    await expect(selected(page, E4)).toHaveCount(0);
    await expect(point).toHaveCount(0);
    await trackRegion(page).focus();
    await page.keyboard.press("Delete");
    await expect(note(page, E4)).toBeVisible();

    await harness.layout.setEditable(true);
    await expect(selected(page, E4)).toBeVisible();
    await expect(point).toHaveCount(1);
  });
});

test.describe("the insertion point", () => {
  /** Where the insertion point stands, in pixels from the left edge of the lane. */
  async function insertionPointAt(page: Page) {
    const point = await box(slot(page, "vocal").getByRole("separator"));
    return point.x + point.width / 2 - (await box(lane(page))).x;
  }

  test("a click or tap on empty space drops it on the nearest beat line and clears the selection; a note keeps it", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C4z4E4F4|G16|"));
    const point = slot(page, "vocal").getByRole("separator");
    await expect(point).toHaveCount(0);

    await press(note(page, C4));
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);
    // Beats are 40 pixels wide at this zoom: 70 pixels in is nearer the line at 80 than the one at 40.
    await press(lane(page), { x: 70, y: 4 });
    await expect(point).toHaveAccessibleName("Insertion point, bar 1 beat 3");
    expect(Math.abs((await insertionPointAt(page)) - 80)).toBeLessThan(1.5);
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 512 });
    expect(await harness.layout.selection()).toEqual([]);
    await expect(point).toHaveCSS("width", "2px");

    await press(note(page, E4));
    expect(await harness.layout.selection()).toEqual(["Vocal:512"]);
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 512 });

    await press(lane(page), { x: 12, y: 4 });
    await expect(point).toHaveAccessibleName("Insertion point, bar 1 beat 1");
    expect(Math.abs(await insertionPointAt(page))).toBeLessThan(1.5);
  });

  test("Left and Right move it a beat, Home and End send it to the ends, and it is no step of the history", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C4z4E4F4|G16|"));
    const point = slot(page, "vocal").getByRole("separator");
    await press(lane(page), { x: 70, y: 4 });

    await page.keyboard.press("ArrowRight");
    await expect(point).toHaveAccessibleName("Insertion point, bar 1 beat 4");
    expect(Math.abs((await insertionPointAt(page)) - 120)).toBeLessThan(1.5);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(point).toHaveAccessibleName("Insertion point, bar 1 beat 2");
    expect(Math.abs((await insertionPointAt(page)) - 40)).toBeLessThan(1.5);

    await page.keyboard.press("End");
    await expect(point).toHaveAccessibleName("Insertion point, end of the score");
    expect(Math.abs((await insertionPointAt(page)) - 320)).toBeLessThan(1.5);
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 2048 });
    await page.keyboard.press("ArrowRight");
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 2048 });
    await page.keyboard.press("Home");
    await expect(point).toHaveAccessibleName("Insertion point, bar 1 beat 1");
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 0 });
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("the line stays whole inside the lane at Home and at End, where the pitch column would cover half of it", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C4z4E4F4|G16|"));
    await press(lane(page), { x: 70, y: 4 });
    const point = slot(page, "vocal").getByRole("separator");
    for (const key of ["Home", "End"]) {
      await page.keyboard.press(key);
      await expect(point).toBeVisible();
      const area = await box(lane(page));
      const line = await box(point);
      expect(line.x, `${key}: left edge`).toBeGreaterThanOrEqual(area.x - 0.01);
      expect(line.x + line.width, `${key}: right edge`).toBeLessThanOrEqual(area.x + area.width + 0.01);
    }
  });

  test("the part scrolls to keep it in view as the keys carry it away", async ({ page, harness, press }) => {
    await openTrack(harness, vocalOnly(...Array(3).fill("C16|C16|C16|C16|")));
    const region = trackRegion(page);
    const point = slot(page, "vocal").getByRole("separator");
    await press(lane(page), { x: 30, y: 4 });
    await expect(point).toBeVisible();

    await page.keyboard.press("End");
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    const inView = async () => {
      const shown = await box(region);
      const at = await box(point);
      return at.x >= shown.x + 44 - 1 && at.x + at.width <= shown.x + shown.width + 1;
    };
    expect(await inView()).toBe(true);

    await page.keyboard.press("Home");
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBe(0);
    expect(await inView()).toBe(true);
    // The point stays in view, so the key moves the point and the browser's own scrolling for the key stays off.
    await page.keyboard.press("ArrowRight");
    await expect(point).toHaveAccessibleName("Insertion point, bar 1 beat 2");
    await page.waitForTimeout(200);
    expect(await region.evaluate((el) => el.scrollLeft)).toBe(0);
    for (let step = 0; step < 14; step++) await page.keyboard.press("ArrowRight");
    expect(await inView()).toBe(true);
  });

  test("keys typed in the open zoom menu stay with the menu and do not move the point or touch the score", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    // One step of history to undo, so that an undo key reaching the session would show, and a point to move.
    await press(note(page, D4));
    await page.keyboard.press("Delete");
    await press(lane(page), { x: 70, y: 4 });
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 512 });
    await press(toolbar(page).getByRole("button", { name: /^Zoom \d+%$/ }));
    // The menu takes the focus once it has opened; keys before that would be typed into the zoom button.
    await expect(toolbar(page).getByRole("menuitemradio", { checked: true })).toBeFocused();
    const first = toolbar(page).getByRole("menuitemradio").first();

    for (const keys of ["ArrowRight", "ArrowRight", "End", "Home", "Control+z"]) await page.keyboard.press(keys);

    expect(await harness.layout.insertionPoint()).toEqual({ tick: 512 });
    expect(await harness.layout.canUndo()).toBe(true);
    await expect(note(page, D4)).toHaveCount(0);
    await expect(first).toBeFocused();
  });

  test("Left and Right keep scrolling the part while there is no insertion point", async ({ page, harness }) => {
    await openTrack(harness, vocalOnly(...Array(3).fill("C16|C16|C16|C16|")));
    const region = trackRegion(page);
    await region.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(10);
    expect(await harness.layout.insertionPoint()).toBeNull();
  });
});

test.describe("announcements for screen readers", () => {
  /** The polite live region a part keeps for what it did, read the way an assistive technology reads it. */
  const said = (page: Page, part: string) => slot(page, part).getByRole("status");
  const REFUSED =
    "This change can't be written into the score safely, so the score was left as it was. (bar 1, beat 1)";

  test("a voice track says what was selected, where the insertion point moved and that a delete happened", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await expect(said(page, "vocal")).toHaveText("");

    await press(note(page, D4));
    await expect(said(page, "vocal")).toHaveText("Selected D4, bar 1 beat 2");

    await press(lane(page), { x: 70, y: 4 });
    await expect(said(page, "vocal")).toHaveText("Insertion point, bar 1 beat 3");
    await page.keyboard.press("ArrowRight");
    await expect(said(page, "vocal")).toHaveText("Insertion point, bar 1 beat 4");
    await page.keyboard.press("End");
    await expect(said(page, "vocal")).toHaveText("Insertion point, end of the score");

    await press(note(page, D4));
    await page.keyboard.press("Delete");
    await expect(note(page, D4)).toHaveCount(0);
    await expect(said(page, "vocal")).toHaveText("Deleted D4, bar 1 beat 2");
  });

  test("keeps one region through the redraw a delete causes, and the words it was given stay", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    const region = said(page, "vocal");
    const handle = await region.elementHandle();

    await press(note(page, D4));
    await page.keyboard.press("Delete");
    await expect(note(page, D4)).toHaveCount(0);
    await expect(region).toHaveText("Deleted D4, bar 1 beat 2");
    expect(await handle?.evaluate((el) => el.isConnected)).toBe(true);
  });

  test("says how many notes a delete took, and how many were selected", async ({ page, harness, press }) => {
    await openTrack(harness);
    await harness.layout.select(["Vocal:256", "Vocal:768"]);
    await expect(said(page, "vocal")).toHaveText("Selected 2 notes");

    await press(deleteButton(page));
    await expect(said(page, "vocal")).toHaveText("Deleted 2 notes");
  });

  test("says what an undo brought back and what a redo took away, though the selection does not change", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, D4));
    await page.keyboard.press("Delete");
    await expect(said(page, "vocal")).toHaveText("Deleted D4, bar 1 beat 2");

    await page.keyboard.press("Control+z");
    await expect(said(page, "vocal")).toHaveText("Restored D4, bar 1 beat 2");
    await press(redoButton(page));
    await expect(said(page, "vocal")).toHaveText("Deleted D4, bar 1 beat 2");

    await harness.layout.setView({ language: "zh" });
    await press(toolbar(page).getByRole("button", { name: "撤销", exact: true }));
    await expect(said(page, "vocal")).toHaveText("已恢复 D4，第 1 小节第 2 拍");
  });

  test("says how many notes an undo brought back", async ({ page, harness, press }) => {
    await openTrack(harness);
    await harness.layout.select(["Vocal:256", "Vocal:768"]);
    await press(deleteButton(page));
    await expect(said(page, "vocal")).toHaveText("Deleted 2 notes");

    await press(undoButton(page));
    await expect(said(page, "vocal")).toHaveText("Restored 2 notes");
  });

  test("speaks the session's language", async ({ page, harness, press }) => {
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["toolbar", "vocal"], language: "zh" });
    await press(note(page, "D4，第 1 小节第 2 拍，长 1 拍"));
    await expect(said(page, "vocal")).toHaveText("已选中 D4，第 1 小节第 2 拍");
    await page.keyboard.press("Delete");
    await expect(said(page, "vocal")).toHaveText("已删除 D4，第 1 小节第 2 拍");
    await press(lane(page), { x: 70, y: 4 });
    await expect(said(page, "vocal")).toHaveText("插入点，第 1 小节第 3 拍");
  });

  test("says why a delete was refused and where: the track for the key, the toolbar for its button", async ({
    page,
    harness,
    press,
  }) => {
    // The first note is tied into a cut tail: writing it as a rest would turn the cut into a complete score.
    await openTrack(harness, vocalOnly("C16-|B"));
    await press(slot(page, "vocal").getByRole("listitem").first());
    await page.keyboard.press("Delete");
    await expect(said(page, "vocal")).toHaveText(REFUSED);
    await expect(said(page, "toolbar")).toHaveText("");

    await harness.layout.setView({ language: "zh" });
    await press(toolbar(page).getByRole("button", { name: "删除", exact: true }));
    await expect(said(page, "toolbar")).toHaveText("这个改动没法安全地写进乐谱，乐谱保持原样。（第 1 小节，第 1 拍）");
  });

  test("a track speaks for its own notes, and the first voice speaks for the insertion point", async ({
    page,
    harness,
    press,
  }) => {
    await harness.layout.open({ score: { sample: "compact-three-sections" }, parts: ["vocal", "ins"] });

    await press(slot(page, "ins").getByRole("listitem", { name: "F4, bar 1 beat 1, length 0.5 beats", exact: true }));
    await expect(said(page, "ins")).toHaveText("Selected F4, bar 1 beat 1");
    await expect(said(page, "vocal")).toHaveText("");

    await press(slot(page, "ins").getByRole("list", { name: "Ins" }), { x: 90, y: 4 });
    await expect(said(page, "vocal")).toHaveText("Insertion point, bar 2 beat 1");
    await expect(said(page, "ins")).toHaveText("Selected F4, bar 1 beat 1");
  });

  test("says nothing while the session is read-only", async ({ page, harness }) => {
    await openTrack(harness, QUARTERS, { editable: false });
    await harness.layout.select(["Vocal:256"]);
    await harness.layout.setEditable(true);
    await harness.layout.setEditable(false);
    await harness.layout.select(["Vocal:512"]);
    await expect(said(page, "vocal")).toHaveText("");
  });
});

test.describe("selecting a note by keyboard", () => {
  const said = (page: Page) => slot(page, "vocal").getByRole("status");

  /** Moves the focus onto the notes of the Vocal track the way a keyboard user does: to the track, then Tab. */
  async function tabToNotes(page: Page) {
    await trackRegion(page).focus();
    await page.keyboard.press("Tab");
  }

  test("Tab reaches the notes, Enter selects the one in focus, Delete turns it into a rest, undo brings it back", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    await tabToNotes(page);
    await expect(note(page, C4)).toBeFocused();
    expect(await harness.layout.selection()).toEqual([]);

    await page.keyboard.press("ArrowRight");
    await expect(selected(page, D4)).toBeFocused();
    expect(await harness.layout.selection()).toEqual(["Vocal:256"]);

    await page.keyboard.press("Delete");
    await expect(note(page, D4)).toHaveCount(0);
    expect(await harness.layout.scoreText()).toContain("C4z4E4F4|G16|");
    // The focus stays in the track, on the note that followed the deleted one.
    await expect(note(page, E4)).toBeFocused();

    await page.keyboard.press("Control+z");
    await expect(selected(page, D4)).toBeVisible();
    expect(await harness.layout.scoreText()).toBe(QUARTERS);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a click or a tap puts the focus on the note it selects, so the keys go on from there, without the keyboard ring", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, D4));
    await expect(selected(page, D4)).toBeFocused();
    // The ring says where the keys act when the keys brought the focus there; a pointer already knows.
    expect(await selected(page, D4).evaluate((el) => el.matches(":focus-visible"))).toBe(false);

    // Control walks the focus; the plain arrows edit the selected note (move-resize.spec.ts).
    await page.keyboard.press("Control+ArrowRight");
    await expect(note(page, E4)).toBeFocused();
    expect(await note(page, E4).evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  });

  test("Enter and Space select the note in focus without moving", async ({ page, harness }) => {
    await openTrack(harness);
    await tabToNotes(page);

    await page.keyboard.press("Enter");
    await expect(selected(page, C4)).toBeFocused();
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);

    await page.keyboard.press("Control+ArrowRight");
    await harness.layout.select([]);
    await page.keyboard.press("Space");
    await expect(selected(page, D4)).toBeFocused();
    expect(await harness.layout.selection()).toEqual(["Vocal:256"]);
  });

  test("Left and Right step from note to note and stop at the ends; Home and End jump to the first and last", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    await tabToNotes(page);

    // With no note selected the plain arrows step and select. Once one is selected they edit it, so the walk goes on with
    // Control, which moves the focus alone.
    await page.keyboard.press("ArrowLeft");
    await expect(selected(page, C4)).toBeFocused();
    await page.keyboard.press("End");
    await expect(selected(page, G4)).toBeFocused();
    await page.keyboard.press("Control+ArrowRight");
    await expect(selected(page, G4)).toBeFocused();
    await page.keyboard.press("Control+ArrowLeft");
    await expect(note(page, F4)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(selected(page, C4)).toBeFocused();
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);
    // Walking the notes is not walking the insertion point.
    expect(await harness.layout.insertionPoint()).toBeNull();
  });

  test("Tab leaves the notes in one step, and comes back to the selected one", async ({ page, harness }) => {
    await openTrack(harness);
    await tabToNotes(page);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Control+ArrowRight");
    await page.keyboard.press("Enter");
    await expect(selected(page, E4)).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(selected(page, E4)).not.toBeFocused();
    await expect(note(page, F4)).not.toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(selected(page, E4)).toBeFocused();
  });

  test("keeps the keys of the insertion point for everything that is not a note in focus", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    await trackRegion(page).focus();

    // With no note selected; with one selected the arrows edit it, whatever holds the focus (move-resize.spec.ts).
    await page.keyboard.press("Home");
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 0 });
    await page.keyboard.press("ArrowRight");
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 256 });
    expect(await harness.layout.selection()).toEqual([]);
  });

  test("leaves a key with Alt, or with Control and Shift, to the others, so they keep their room", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    await tabToNotes(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+Shift+ArrowRight");
    await page.keyboard.press("Alt+ArrowRight");
    await expect(selected(page, C4)).toBeFocused();
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);

    await page.keyboard.press("Delete");
    await page.keyboard.press("Control+z");
    await expect(selected(page, C4)).toBeVisible();
  });

  test("stepping speaks through the focus alone, and Enter says what it selected", async ({ page, harness }) => {
    await openTrack(harness);
    await tabToNotes(page);
    await page.keyboard.press("ArrowRight");
    await expect(selected(page, D4)).toBeFocused();
    await expect(said(page)).toHaveText("");

    await page.keyboard.press("Control+ArrowRight");
    await harness.layout.select([]);
    await page.keyboard.press("Enter");
    await expect(said(page)).toHaveText("Selected E4, bar 1 beat 3");
  });

  test("a click or a tap puts the focus on the note, so the keys go on from there", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(note(page, D4));
    await expect(selected(page, D4)).toBeFocused();

    await page.keyboard.press("Control+ArrowRight");
    await expect(note(page, E4)).toBeFocused();
  });

  test("read-only offers no note to reach by Tab", async ({ page, harness }) => {
    await openTrack(harness, QUARTERS, { editable: false });
    await tabToNotes(page);
    await expect(note(page, C4)).not.toBeFocused();
    await expect(slot(page, "vocal").getByRole("listitem").and(page.locator("[tabindex]"))).toHaveCount(0);
  });

  test("a tie chain is one thing to select: stepping onto a segment frames the whole chain", async ({
    page,
    harness,
  }) => {
    await openTrack(harness, vocalOnly("C16-|C16|"));
    await tabToNotes(page);
    await page.keyboard.press("ArrowRight");
    await expect(note(page, "C4, bar 2 beat 1, length 4 beats, selected")).toBeFocused();
    await expect(note(page, "C4, bar 1 beat 1, length 4 beats, tied to the next note, selected")).toBeVisible();
  });
});

test.describe("the Grid menu", () => {
  test("shows the grid in force, and a choice sets it for the keys and the drag", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openTrack(harness, vocalOnly("z4C8z4|G16|"));
    await expect(gridButton(page)).toHaveAccessibleName("Grid: 1/4");
    await expect(gridButton(page)).toHaveText("1/4");
    expect(await harness.layout.grid()).toEqual({ value: 4 });

    await press(gridButton(page));
    await expect(gridItem(page, "1/4")).toBeFocused();
    await expect(gridItem(page, "1/4")).toHaveAttribute("aria-checked", "true");
    await press(gridItem(page, "1/8"));
    expect(await harness.layout.grid()).toEqual({ value: 8 });
    await expect(gridButton(page)).toHaveAccessibleName("Grid: 1/8");
    // The grid is a matter of the view, not of the song: nothing was written and nothing can be undone.
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.scoreText()).toBe(vocalOnly("z4C8z4|G16|"));

    // The keys take an eighth now.
    await press(block(page, "C4, bar 1 beat 2"));
    await page.keyboard.press("ArrowRight");
    expect((await noteList(harness))[0]).toEqual(vocal(BEAT + BEAT / 2, 2 * BEAT, MIDDLE_C));
    await harness.layout.undo();

    // So does a drag: half a beat of pointer is one step.
    const from = await centreOf(block(page, "C4, bar 1 beat 2, length 2 beats, selected"));
    const { beat } = await metrics(page, 8);
    await drag(page, harness, isMobile, from, { x: from.x + beat / 2, y: from.y });
    expect((await noteList(harness))[0]).toEqual(vocal(BEAT + BEAT / 2, 2 * BEAT, MIDDLE_C));
  });

  test("offers the dotted values after the plain ones, and a dotted choice sets a dotted step", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("z4C8z4|G16|"));
    await press(gridButton(page));
    const names = await toolbar(page).getByRole("menuitemradio").allTextContents();
    expect(names).toEqual(["1/4", "1/8", "1/16", "Dotted 1/4", "Dotted 1/8", "Dotted 1/16"]);
    // Dotted 1/16 is a sixteenth and a half: this score counts in sixteenths and cannot write it.
    await expect(gridItem(page, "Dotted 1/16")).toHaveAttribute("aria-disabled", "true");
    await expect(gridItem(page, "Dotted 1/4")).toHaveAttribute("aria-disabled", "false");

    await press(gridItem(page, "Dotted 1/4"));
    expect(await harness.layout.grid()).toEqual({ value: 4, dotted: true });
    await expect(gridButton(page)).toHaveAccessibleName("Grid: Dotted 1/4");
    await expect(gridButton(page).locator(".sce-grid-dot")).toBeVisible();

    await press(block(page, "C4, bar 1 beat 2"));
    await page.keyboard.press("ArrowRight");
    // A dotted quarter is a beat and a half, so the lines are at 0, 1.5, 3 beats. One step on from 1 beat (256 ticks)
    // is 640, which is nearer the line at 3 beats (768) than the one at 1.5 (384). The half note then reaches over the
    // bar line, and over the start of the whole note in the second bar, which it covers.
    expect(await noteList(harness)).toEqual([vocal(3 * BEAT, BEAT, MIDDLE_C), vocal(4 * BEAT, BEAT, MIDDLE_C)]);
  });

  test("mutes a step the score cannot write: choosing it changes nothing", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    const forced = (target: Locator) => (isMobile ? target.tap({ force: true }) : target.click({ force: true }));
    await openTrack(harness, vocalOnly("z4C8z4|G16|"));
    await press(gridButton(page));
    await expect(gridItem(page, "Dotted 1/16")).toHaveAttribute("title", "This score cannot write this step");
    await forced(gridItem(page, "Dotted 1/16"));
    expect(await harness.layout.grid()).toEqual({ value: 4 });
    await expect(gridButton(page)).toHaveAccessibleName("Grid: 1/4");
  });

  test("offers 1/32 only where the unit of the score can write it", async ({ page, harness, press }) => {
    await openTrack(harness, vocalOnly("C4z12|G16|"));
    await press(gridButton(page));
    await expect(gridItem(page, "1/32")).toBeHidden();
    await expect(gridItem(page, "Dotted 1/32")).toBeHidden();
    await page.keyboard.press("Escape");
    await harness.layout.close();

    await openTrack(harness, vocalOnly("C8z24|G32|").replace("L:1/16", "L:1/32"));
    await press(gridButton(page));
    await expect(gridItem(page, "1/32")).toBeVisible();
    await expect(gridItem(page, "1/32")).toHaveAttribute("aria-disabled", "false");
    // The step after it, a dotted 1/32, is a 32nd and a half.
    await expect(gridItem(page, "Dotted 1/32")).toHaveAttribute("aria-disabled", "true");
    await press(gridItem(page, "1/32"));
    expect(await harness.layout.grid()).toEqual({ value: 32 });
    await expect(gridButton(page)).toHaveText("1/32");
  });

  test("goes back to 1/4 when the project is replaced by a score that cannot write the grid, says so, and offers no 1/32", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C8z24|G32|").replace("L:1/16", "L:1/32"));
    await press(gridButton(page));
    await press(gridItem(page, "1/32"));
    await expect(gridButton(page)).toHaveAccessibleName("Grid: 1/32");

    await harness.layout.replace({ score: LEAD });

    expect(await harness.layout.grid()).toEqual({ value: 4 });
    await expect(gridButton(page)).toHaveAccessibleName("Grid: 1/4");
    await expect(toolbar(page).getByRole("status")).toHaveText(
      "The grid went back to 1/4: this score cannot write 1/32",
    );
    await press(gridButton(page));
    await expect(gridItem(page, "1/32")).toBeHidden();
    await expect(gridItem(page, "Dotted 1/32")).toBeHidden();
    await expect(gridItem(page, "1/4")).toHaveAttribute("aria-checked", "true");
  });

  test("says the same in Chinese, and says nothing when the grid stays", async ({ page, harness, press }) => {
    await openTrack(harness, vocalOnly("C8z24|G32|").replace("L:1/16", "L:1/32"), { language: "zh" });
    await press(gridButton(page));
    await press(gridItem(page, "附点 1/16"));
    await harness.layout.replace({ score: vocalOnly("C8D8z16|G32|").replace("L:1/16", "L:1/32") });
    await expect(gridButton(page)).toHaveAccessibleName("网格: 附点 1/16");
    await expect(toolbar(page).getByRole("status")).toHaveText("");

    await harness.layout.replace({ score: LEAD });
    await expect(toolbar(page).getByRole("status")).toHaveText(
      "网格已回到 1/4：这份乐谱写不出 附点 1/16",
    );
  });

  test("walks its choices with the arrow keys and skips the ones that are left out", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C4z12|G16|"));
    await press(gridButton(page));
    await expect(gridItem(page, "1/4")).toBeFocused();
    await page.keyboard.press("End");
    await expect(gridItem(page, "Dotted 1/16")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(gridItem(page, "1/4")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(gridItem(page, "Dotted 1/16")).toBeFocused();
  });

  test("is there while the editor can edit, and gone while it is read-only", async ({ page, harness }) => {
    await openTrack(harness, LEAD);
    await expect(gridButton(page)).toBeVisible();
    await harness.layout.setEditable(false);
    await expect(gridButton(page)).toBeHidden();
    await harness.layout.setEditable(true);
    await expect(gridButton(page)).toBeVisible();
  });

  test("is named in the language of the editor", async ({ page, harness, press }) => {
    await openTrack(harness, LEAD, { language: "zh" });
    await expect(gridButton(page)).toHaveAccessibleName("网格: 1/4");
    await press(gridButton(page));
    await expect(gridItem(page, "附点 1/4")).toBeVisible();
  });
});

test.describe("the insertion point on the grid", () => {
  /** A point of the empty lane, `beats` beats from its left edge, near the top where no note is drawn; relative to the lane. */
  async function emptySpot(page: Page, beats: number): Promise<Point> {
    const { beat } = await metrics(page, 8);
    return { x: beats * beat, y: 3 };
  }

  test("a click on empty space lands on the nearest line of the grid", async ({ page, harness, press }) => {
    await openTrack(harness, LEAD);
    const spot = await emptySpot(page, 2.4);
    await press(laneOf(page), spot);
    // Nearest quarter to 2.4 beats is 2 beats.
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 2 * BEAT });

    await press(gridButton(page));
    await press(gridItem(page, "1/8"));
    await press(laneOf(page), spot);
    // And to 2.4 beats the nearest eighth is 2.5.
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 2.5 * BEAT });
  });

  test("the keys move it from line to line of the grid in force", async ({ page, harness, press }) => {
    await openTrack(harness, LEAD);
    await press(gridButton(page));
    await press(gridItem(page, "Dotted 1/4"));
    await trackRegion(page).focus();
    await page.keyboard.press("Home");
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 0 });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 3 * BEAT });
    await page.keyboard.press("ArrowLeft");
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 1.5 * BEAT });
  });
});

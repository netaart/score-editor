// ABOUTME: Seam 5 for placing new notes: the pencil and its key, click and double-click with mouse and finger, copy, paste, duplicate and Alt-drag.
// ABOUTME: Adding and carrying a note is checked through the page's audio constructor, the way the synth preview spec records sound.
import type { Page } from "@playwright/test";
import {
  centreOf,
  drag,
  expect,
  LEAD,
  metrics,
  noteList,
  openTrack,
  type Point,
  slot,
  test,
  toolbar,
  vocal,
  vocalOnly,
} from "./fixtures";

/** What the audio spy recorded: one tone per oscillator the page started. */
interface AudioLog {
  tones: Array<{ hz: number; type: string }>;
}

type AudioPage = Window & { placeAudioLog?: AudioLog };

/** Runs in the page after load: wraps the audio constructor, so every pitch the note preview sounds is kept. */
function spyOnAudio() {
  const Real = window.AudioContext;
  const log: AudioLog = { tones: [] };
  (window as AudioPage).placeAudioLog = log;
  window.AudioContext = class extends Real {
    createOscillator() {
      const oscillator = super.createOscillator();
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (when?: number) => {
        log.tones.push({ hz: oscillator.frequency.value, type: oscillator.type });
        start(when);
      };
      return oscillator;
    }
  };
}

const audio = (page: Page) => page.evaluate(() => [...((window as AudioPage).placeAudioLog?.tones ?? [])]);
const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const pencilButton = (page: Page) => toolbar(page).getByRole("button", { name: "Draw notes", exact: true });
const note = (page: Page, name: string) => slot(page, "vocal").getByRole("listitem", { name, exact: true });

/** A point in the lane at a tick and a MIDI pitch, worked from the lane's own boxes. */
async function place(page: Page, tick: number, midi: number, beats = 8): Promise<Point> {
  const { lane: area, beat, row } = await metrics(page, beats);
  // The range is padded to whole octaves above the highest pitch: the first row is the range's top minus one.
  const top = 71;
  return { x: area.x + (tick / 256) * beat, y: area.y + (top - midi + 0.5) * row };
}

async function tapAt(page: Page, isMobile: boolean, at: Point): Promise<void> {
  if (isMobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}

async function doubleTapAt(page: Page, isMobile: boolean, at: Point): Promise<void> {
  if (isMobile) {
    await page.touchscreen.tap(at.x, at.y);
    await page.touchscreen.tap(at.x, at.y);
  } else {
    await page.mouse.dblclick(at.x, at.y);
  }
}

test.describe("the pencil", () => {
  test("on adds with one tap on empty space and deletes with one tap on a note, and B turns it off", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness, LEAD);
    await expect(pencilButton(page)).toHaveAttribute("aria-pressed", "false");

    await press(pencilButton(page));
    await expect(pencilButton(page)).toHaveAttribute("aria-pressed", "true");

    // D4 at bar 1 beat 3 is empty in LEAD (C4, then rests until G4 in bar 2).
    const at = await place(page, 2 * 256, 62);
    await tapAt(page, isMobile, at);
    await expect(note(page, "D4, bar 1 beat 3, length 1 beat, selected")).toBeVisible();
    expect(await noteList(harness)).toContainEqual(vocal(2 * 256, 256, 62));

    // The same tap on the note the pencil just made takes it away.
    await tapAt(page, isMobile, at);
    await expect(note(page, "D4, bar 1 beat 3, length 1 beat, selected")).toHaveCount(0);
    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(4 * 256, 4 * 256, 67)]);

    // B turns it off again, from wherever the focus is.
    await page.keyboard.press("b");
    await expect(pencilButton(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("off clears on a single click and adds or deletes on a double click, with mouse and with finger", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness, LEAD);
    await press(note(page, "C4, bar 1 beat 1, length 1 beat"));
    expect(await harness.layout.selection()).toEqual(["Vocal:0"]);

    const at = await place(page, 3 * 256, 62);
    await tapAt(page, isMobile, at);
    expect(await harness.layout.selection()).toEqual([]);
    await expect(note(page, "D4, bar 1 beat 4, length 1 beat, selected")).toHaveCount(0);

    await doubleTapAt(page, isMobile, at);
    await expect(note(page, "D4, bar 1 beat 4, length 1 beat, selected")).toBeVisible();
    expect(await noteList(harness)).toContainEqual(vocal(3 * 256, 256, 62));

    await doubleTapAt(page, isMobile, at);
    await expect(note(page, "D4, bar 1 beat 4, length 1 beat, selected")).toHaveCount(0);
  });
});

test.describe("copy, paste and duplicate", () => {
  test("Ctrl or Cmd with C and V puts the selection at the insertion point and selects the copies", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openTrack(harness, vocalOnly("C4D4z8|z16|"));
    await press(note(page, "C4, bar 1 beat 1, length 1 beat"));
    await (isMobile
      ? note(page, "D4, bar 1 beat 2, length 1 beat").tap({ modifiers: ["Shift"] })
      : note(page, "D4, bar 1 beat 2, length 1 beat").click({ modifiers: ["Shift"] }));
    expect(await harness.layout.selection()).toEqual(["Vocal:0", "Vocal:256"]);

    await page.keyboard.press("Control+c");
    await page.evaluate(() => window.harness.layout.live().setInsertionPoint({ tick: 1024 }));
    await page.keyboard.press("Control+v");

    expect(await noteList(harness)).toEqual([
      vocal(0, 256, 60),
      vocal(256, 256, 62),
      vocal(1024, 256, 60),
      vocal(1280, 256, 62),
    ]);
    expect(await harness.layout.selection()).toEqual(["Vocal:1024", "Vocal:1280"]);

    // One paste is one step.
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(256, 256, 62)]);
  });

  test("Ctrl or Cmd with D repeats the selection right after itself, in one step", async ({ page, harness, press }) => {
    await openTrack(harness, vocalOnly("C4z4z8|z16|"));
    await press(note(page, "C4, bar 1 beat 1, length 1 beat"));

    await page.keyboard.press("Control+d");

    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(256, 256, 60)]);
    expect(await harness.layout.selection()).toEqual(["Vocal:256"]);
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([vocal(0, 256, 60)]);
  });

  test("Alt and a drag copies the selected notes where the pointer lands and leaves the originals", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, LEAD);
    await press(note(page, "C4, bar 1 beat 1, length 1 beat"));
    const from = await centreOf(note(page, "C4, bar 1 beat 1, length 1 beat, selected"));
    const { beat, row } = await metrics(page, 8);

    await page.keyboard.down("Alt");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 2 * beat, from.y - 2 * row, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Alt");

    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(512, 256, 62), vocal(1024, 1024, 67)]);
    expect(await harness.layout.selection()).toEqual(["Vocal:512"]);
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(1024, 1024, 67)]);
  });
});

test.describe("hearing the note", () => {
  test("a drawn note sounds its pitch once", async ({ page, harness, isMobile, press }) => {
    await openTrack(harness, LEAD);
    await page.evaluate(spyOnAudio);
    await press(pencilButton(page));
    await tapAt(page, isMobile, await place(page, 2 * 256, 62));
    await expect.poll(async () => (await audio(page)).some((tone) => Math.abs(tone.hz - midiHz(62)) < 1)).toBe(true);
  });

  test("a carried note sounds the pitch where it lands", async ({ page, harness, isMobile, press }) => {
    await openTrack(harness, LEAD);
    await page.evaluate(spyOnAudio);
    await press(note(page, "C4, bar 1 beat 1, length 1 beat"));
    const from = await centreOf(note(page, "C4, bar 1 beat 1, length 1 beat, selected"));
    const { beat, row } = await metrics(page, 8);

    await drag(page, harness, isMobile, from, { x: from.x + beat, y: from.y - 2 * row });

    await expect.poll(async () => (await audio(page)).some((tone) => Math.abs(tone.hz - midiHz(62)) < 1)).toBe(true);
    expect(await noteList(harness)).toEqual([vocal(256, 256, 62), vocal(1024, 1024, 67)]);
  });
});

test.describe("the pencil and the keys where they must not act", () => {
  test("read-only has no pencil and places nothing", async ({ page, harness }) => {
    await openTrack(harness, LEAD, { editable: false });
    await expect(pencilButton(page)).toHaveCount(0);
    const before = await harness.layout.scoreText();
    await page.keyboard.press("b");
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await page.keyboard.press("Control+d");
    expect(await harness.layout.scoreText()).toBe(before);
    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(1024, 1024, 67)]);
  });

  test("a swipe on empty space with the pencil on still scrolls and draws nothing", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "a swipe needs a touch screen");
    await openTrack(harness, vocalOnly(...Array(3).fill("C16|C16|C16|C16|")));
    await pencilButton(page).click();
    await expect(pencilButton(page)).toHaveAttribute("aria-pressed", "true");
    const before = await noteList(harness);
    const { lane: area } = await metrics(page, 48);
    const start = { x: area.x + 200, y: area.y + area.height / 2 };

    await harness.swipe(start, { x: start.x - 120, y: start.y });

    expect((await harness.layout.view()).scrollLeft).toBeGreaterThan(20);
    expect(await noteList(harness)).toEqual(before);
  });
});

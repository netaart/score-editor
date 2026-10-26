// ABOUTME: Seam 5 for placing new notes: the pencil and its key, click and double-click with mouse and finger, copy, paste, duplicate and Alt-drag.
// ABOUTME: Adding and carrying a note is checked through the page's audio constructor, the way the synth preview spec records sound.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import {
  box,
  centreOf,
  drag,
  expect,
  type Harness,
  LEAD,
  metrics,
  noteList,
  type Point,
  pointerOf,
  slot,
  test,
  vocal,
  vocalOnly,
  withPointer,
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
const skillScore = readFileSync(
  new URL("../packages/score-editor/skills/score-editor/assets/edit-one-bar/score.abc", import.meta.url),
  "utf8",
);

/** The zero-based lines whose text changed. The skill score puts four bars on a line. */
function changedLines(before: string, after: string): number[] {
  const a = before.split("\n");
  const b = after.split("\n");
  expect(b.length, "the number of score lines stays the same").toBe(a.length);
  return a.map((line, index) => (line === b[index] ? -1 : index)).filter((index) => index >= 0);
}

/** The Ins lane's geometry on the real score: a beat, a row, and the MIDI of its top row. */
async function insMetrics(page: Page, harness: Harness) {
  const lane = slot(page, "ins").locator(".sce-lane");
  const list = slot(page, "ins").getByRole("list", { name: "Ins" });
  const area = await box(lane);
  const row = (await box(list.getByRole("listitem").first())).height;
  const notes = (await harness.layout.pitchedNotes()).filter((note) => note.voice === "Ins" && note.midi !== null);
  const lo = Math.floor((Math.min(...notes.map((note) => note.midi as number)) - 3) / 12) * 12;
  const hi = Math.ceil((Math.max(...notes.map((note) => note.midi as number)) + 4) / 12) * 12;
  return { lane: area, beat: area.width / 108, row, top: hi - 1, lo };
}

const pencilButton = (page: Page) =>
  slot(page, "toolbar-pencil").getByRole("button", { name: "Draw notes", exact: true });

/** Opens the pencil's toolbar (the default editor's shape) and the Vocal track on one session. */
async function openPencilTrack(harness: Harness, score: string = LEAD, options: Record<string, unknown> = {}) {
  await harness.layout.open({ score: { text: score }, parts: ["toolbar-pencil", "vocal"], ...options });
}
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
    await openPencilTrack(harness, LEAD);
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
    await openPencilTrack(harness, LEAD);
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
    await openPencilTrack(harness, vocalOnly("C4D4z8|z16|"));
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
    await openPencilTrack(harness, vocalOnly("C4z4z8|z16|"));
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
    isMobile,
    press,
  }) => {
    await openPencilTrack(harness, LEAD);
    await press(note(page, "C4, bar 1 beat 1, length 1 beat"));
    const from = await centreOf(note(page, "C4, bar 1 beat 1, length 1 beat, selected"));
    const { beat, row } = await metrics(page, 8);
    const pointer = await pointerOf(page, harness, isMobile, { alt: true, holdMs: 0 });

    await withPointer(pointer, async () => {
      await pointer.down(from);
      await pointer.move({ x: from.x + 2 * beat, y: from.y - 2 * row });
      await pointer.up();
    });

    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(512, 256, 62), vocal(1024, 1024, 67)]);
    expect(await harness.layout.selection()).toEqual(["Vocal:512"]);
    expect(await harness.layout.undo()).toBe(true);
    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(1024, 1024, 67)]);
  });
});

test.describe("hearing the note", () => {
  test("a drawn note sounds its pitch once", async ({ page, harness, isMobile, press }) => {
    await openPencilTrack(harness, LEAD);
    await page.evaluate(spyOnAudio);
    await press(pencilButton(page));
    await tapAt(page, isMobile, await place(page, 2 * 256, 62));
    await expect.poll(async () => (await audio(page)).some((tone) => Math.abs(tone.hz - midiHz(62)) < 1)).toBe(true);
  });

  test("a carried note sounds the pitch where it lands", async ({ page, harness, isMobile, press }) => {
    await openPencilTrack(harness, LEAD);
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
    await openPencilTrack(harness, LEAD, { editable: false });
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
    await openPencilTrack(harness, vocalOnly(...Array(3).fill("C16|C16|C16|C16|")));
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

test.describe("the review fixes", () => {
  test("the lane says Draw at the pinned head while the pencil is on, and the fine cursor is a cell", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    await openPencilTrack(harness, LEAD);
    const head = slot(page, "vocal").locator(".sce-track-head");
    const word = head.getByText("Draw", { exact: true });
    const lane = slot(page, "vocal").locator(".sce-lane");
    await expect(word).toBeHidden();
    if (!isMobile) await expect(lane).not.toHaveCSS("cursor", "cell");

    await press(pencilButton(page));
    await expect(word).toBeVisible();
    if (!isMobile) await expect(lane).toHaveCSS("cursor", "cell");

    await press(pencilButton(page));
    await expect(head.getByText("Draw", { exact: true })).toBeHidden();
    if (!isMobile) await expect(lane).not.toHaveCSS("cursor", "cell");
  });

  test("the Select menu has Copy, Paste and Duplicate as one group, each muted until it can act", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    test.skip(!isMobile, "this is the finger path the review asked for");
    await openPencilTrack(harness, vocalOnly("C4D4z8|z16|"));
    const menuButton = slot(page, "toolbar-pencil").getByRole("button", { name: "Select", exact: true });
    const item = (name: string) => page.getByRole("menuitem", { name, exact: true });

    await press(menuButton);
    await expect(item("Copy")).toHaveAttribute("aria-disabled", "true");
    await expect(item("Paste")).toHaveAttribute("aria-disabled", "true");
    await expect(item("Duplicate")).toHaveAttribute("aria-disabled", "true");
    await expect(item("Copy")).toHaveAttribute("title", "Copy (Ctrl/Cmd+C)");
    await expect(item("Paste")).toHaveAttribute("title", "Paste (Ctrl/Cmd+V)");
    await expect(item("Duplicate")).toHaveAttribute("title", "Duplicate (Ctrl/Cmd+D)");
    await page.keyboard.press("Escape");

    await press(note(page, "C4, bar 1 beat 1, length 1 beat"));
    await press(menuButton);
    await expect(item("Copy")).toHaveAttribute("aria-disabled", "false");
    await expect(item("Duplicate")).toHaveAttribute("aria-disabled", "false");
    await expect(item("Paste")).toHaveAttribute("aria-disabled", "true");
    await press(item("Copy"));

    await page.evaluate(() => window.harness.layout.live().setInsertionPoint({ tick: 1024 }));
    await press(menuButton);
    await expect(item("Paste")).toHaveAttribute("aria-disabled", "false");
    await press(item("Paste"));
    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(256, 256, 62), vocal(1024, 256, 60)]);
    expect(await harness.layout.selection()).toEqual(["Vocal:1024"]);

    expect(await harness.layout.undo()).toBe(true);
    await page.evaluate(() => window.harness.layout.live().select(["Vocal:0"]));
    await press(menuButton);
    await press(item("Duplicate"));
    expect(await noteList(harness)).toEqual([vocal(0, 256, 60), vocal(256, 256, 60)]);
    expect(await harness.layout.selection()).toEqual(["Vocal:256"]);
  });

  test("says the pencil's change in the toolbar's live region, from the button and from B", async ({
    page,
    harness,
    press,
  }) => {
    await openPencilTrack(harness, LEAD);
    const said = slot(page, "toolbar-pencil").getByRole("status");
    await press(pencilButton(page));
    await expect(said).toHaveText("Draw notes on");
    await page.keyboard.press("b");
    await expect(said).toHaveText("Draw notes off");

    await harness.layout.setView({ language: "zh" });
    const chinese = slot(page, "toolbar-pencil").locator(".sce-pencil-button");
    await press(chinese);
    await expect(said).toHaveText("画笔已打开");
    await page.keyboard.press("b");
    await expect(said).toHaveText("画笔已关闭");
  });

  test("gives the pencil a language's tooltip, its key in aria-keyshortcuts, and the shared focus ring", async ({
    page,
    harness,
  }) => {
    await openPencilTrack(harness, LEAD);
    await expect(pencilButton(page)).toHaveAttribute("title", "Draw notes (B)");
    await expect(pencilButton(page)).toHaveAttribute("aria-keyshortcuts", "b");
    await pencilButton(page).focus();
    await expect(pencilButton(page)).toHaveCSS("outline-width", "2px");
    await expect(pencilButton(page)).toHaveCSS("outline-offset", "2px");

    await harness.layout.setView({ language: "zh" });
    const chinese = slot(page, "toolbar-pencil").locator(".sce-pencil-button");
    await expect(chinese).toHaveAttribute("title", "画笔（B）");
    await expect(chinese).toHaveAttribute("aria-label", "画笔");
    await expect(chinese).toBeVisible();
  });

  test("keeps the pencil's on state through a view change and read-only", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: LEAD } });
    const pencil = page.getByRole("button", { name: "Draw notes", exact: true });
    await press(pencil);
    await expect(pencil).toHaveAttribute("aria-pressed", "true");
    await press(page.getByRole("button", { name: "Staff", exact: true }));
    await press(page.getByRole("button", { name: "Arrangement", exact: true }));
    await expect(page.getByRole("button", { name: "Draw notes", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Draw", { exact: true })).toBeVisible();
    await harness.update({ editable: false });
    await expect(page.getByRole("button", { name: "Draw notes", exact: true })).toHaveCount(0);
    await harness.update({ editable: true });
    await expect(page.getByRole("button", { name: "Draw notes", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("keeps a finger's gap from Delete without adding a row", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "the gap is the coarse pointer's");
    for (const width of [412, 320]) {
      await page.setViewportSize({ width, height: 839 });
      await harness.mount({ score: { text: LEAD }, language: "zh" });
      const pencil = page.getByRole("button", { name: "画笔", exact: true });
      const remove = page.getByRole("button", { name: "删除", exact: true });
      const [pen, del] = await Promise.all([box(pencil), box(remove)]);
      if (Math.abs(pen.y - del.y) < 2) {
        expect(pen.x - (del.x + del.width), `${width}: the gap to Delete`).toBeGreaterThanOrEqual(8);
      }
      await expect(pencil).toHaveCSS("margin-inline-start", "4px");
      await harness.destroy();
    }
  });

  test("keeps the pressed pencil and view switch legible under forced colours", async ({ page, harness, press }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await harness.mount({ score: { text: LEAD } });
    const pencil = page.getByRole("button", { name: "Draw notes", exact: true });
    await press(pencil);
    await expect(pencil).toHaveCSS("outline-width", "2px");
    await expect(pencil).toHaveCSS("outline-offset", "-2px");
    await expect(pencil).toHaveCSS("outline-style", "solid");
    const arranged = page.getByRole("button", { name: "Arrangement", exact: true });
    await expect(arranged).toHaveAttribute("aria-pressed", "true");
    await expect(arranged).toHaveCSS("outline-width", "2px");
    await expect(arranged).toHaveCSS("outline-offset", "-2px");
  });
});

test.describe("the review's hint and real score", () => {
  test("the editing hint names the pencil and the copy keys in both languages", async ({ page, harness }) => {
    await harness.mount({ score: { text: LEAD } });
    const hint = page.locator('.sce-editor [id^="sce-hint-"]');
    await expect(hint).toContainText("B");
    await expect(hint).toContainText("Ctrl or Cmd with C");
    await expect(hint).toContainText("V");
    await expect(hint).toContainText("D");
    await expect(hint).toContainText("Alt with a drag");
    await harness.update({ language: "zh" });
    await expect(hint).toContainText("按 B");
    await expect(hint).toContainText("Ctrl 或 Cmd 加 C");
    await expect(hint).toContainText("Alt");
  });

  test("draws a note in the Ins bars that are one whole rest on the real score, and only that line changes", async ({
    page,
    harness,
    isMobile,
    press,
  }) => {
    test.skip(isMobile, "the real-score cases are checked on the desktop project");
    const before = skillScore;
    await harness.layout.open({ score: { text: before }, parts: ["toolbar-pencil", "vocal", "ins"] });
    await press(pencilButton(page));
    const { lane, beat, row, top } = await insMetrics(page, harness);
    const midi = 72;
    const at = { x: lane.x + 2 * beat, y: lane.y + (top - midi + 0.5) * row };
    await tapAt(page, false, at);

    const after = await harness.layout.scoreText();
    expect(changedLines(before, after), "only the Ins Z4 line changed").toEqual([12]);
    expect(after).toContain("Ins");
    expect(await harness.layout.pitchedNotes()).toContainEqual({ voice: "Ins", start: 512, duration: 256, midi });
    expect(await page.evaluate((text) => window.harness.layout.live().checkScoreText(text), after)).toEqual([]);
    expect(await page.evaluate(() => window.harness.layout.live().reading.kind)).toBe("score");
  });

  test("pastes into the second system of the real score, and only the line holding that bar changes", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "the real-score cases are checked on the desktop project");
    const before = skillScore;
    await harness.layout.open({ score: { text: before }, parts: ["toolbar-pencil", "vocal", "ins"] });
    await slot(page, "ins").getByRole("region", { name: "Ins" }).focus();
    await harness.layout.select(["Ins:5120"]);
    await page.keyboard.press("Control+c");
    await page.evaluate(() => window.harness.layout.live().setInsertionPoint({ tick: 6144 }));
    await page.keyboard.press("Control+v");

    const after = await harness.layout.scoreText();
    expect(changedLines(before, after), "only the Ins line carrying bar 6 changed").toEqual([16]);
    expect(await page.evaluate((text) => window.harness.layout.live().checkScoreText(text), after)).toEqual([]);
    expect(await page.evaluate(() => window.harness.layout.live().reading.kind)).toBe("score");
  });

  test("duplicates a note across a bar line on the real score, and only its two lines change", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "the real-score cases are checked on the desktop project");
    const before = skillScore;
    await harness.layout.open({ score: { text: before }, parts: ["toolbar-pencil", "vocal", "ins"] });
    await slot(page, "ins").getByRole("region", { name: "Ins" }).focus();
    await harness.layout.select(["Ins:7808"]);
    await page.keyboard.press("Control+d");

    const after = await harness.layout.scoreText();
    expect(
      changedLines(before, after).every((line) => line === 16 || line === 20),
      "only the two Ins lines",
    ).toBe(true);
    expect(changedLines(before, after).length).toBeGreaterThan(0);
    expect(after).toContain("-|");
    expect(await page.evaluate((text) => window.harness.layout.live().checkScoreText(text), after)).toEqual([]);
    expect(await page.evaluate(() => window.harness.layout.live().reading.kind)).toBe("score");
  });
});

test.describe("the lane word stays where the head is pinned", () => {
  test("keeps Draw in the scroller's view at the start, middle and end, on the voice's line", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { sample: "compact-three-sections" }, drafts: true, handoff: true });
    await press(page.getByRole("button", { name: "Draw notes", exact: true }));
    const scroller = page.locator(".sce-scroller");
    const heads = page.locator(".sce-track-head");
    const count = await heads.count();
    expect(count).toBeGreaterThan(0);

    const check = async (where: string) => {
      const frame = await box(scroller);
      for (let index = 0; index < count; index += 1) {
        const head = heads.nth(index);
        const word = head.locator(".sce-draw-mode");
        const name = head.locator(".sce-track-name");
        const keys = page.locator(".sce-track").nth(index).locator(".sce-keys");
        await expect(word, `${where}: the word is shown`).toBeVisible();
        const [at, named, column] = await Promise.all([box(word), box(name), box(keys)]);
        const left = Math.max(frame.x, column.x + column.width);
        expect(at.x, `${where}: the word is not under the pitch column`).toBeGreaterThanOrEqual(left - 0.5);
        expect(at.x + at.width, `${where}: the word is inside the scroller`).toBeLessThanOrEqual(
          frame.x + frame.width + 0.5,
        );
        expect(Math.abs(at.y + at.height / 2 - (named.y + named.height / 2)), `${where}: same line as the name`) //
          .toBeLessThan(2);
      }
    };

    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBe(0);
    await check("start");
    await scroller.evaluate((el) => {
      el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2);
    });
    await check("middle");
    await scroller.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await check("end");
  });
});

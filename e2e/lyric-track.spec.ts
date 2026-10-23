// ABOUTME: Seam 5 for the lyric track: its phrases, the green and yellow counts, syllables on notes, the unaligned area and its editing.
// ABOUTME: Each case runs with a mouse on the desktop project and with a finger on the phone project, and reads what the session holds.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, type Point, test } from "./fixtures";

const HEADER = [
  "X:1",
  "T:",
  "M:4/4",
  "L:1/16",
  "Q:1/4=120",
  'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
  'V: Ins clef=treble name="Ins Melody" snm="Inst."',
  "K:C",
];

/** Eight bars of four quarter notes each: Intro is bars 1 and 2, Verse bars 3 to 6, Chorus bars 7 and 8. Four ticks make a quarter. */
const SCORE = [
  ...HEADER,
  "% Intro",
  "V: Vocal",
  "C4D4E4F4|G4A4B4c4|",
  "V: Ins",
  "Z2|",
  "% Verse",
  "V: Vocal",
  "C4D4E4F4|G4A4B4c4|C4D4E4F4|G4A4B4c4|",
  "V: Ins",
  "Z4|",
  "% Chorus",
  "V: Vocal",
  "C4D4E4F4|G4A4B4c4|",
  "V: Ins",
  "Z2|",
].join("\n");

const BAR = 1024;
const TICKS = 8 * BAR;

interface Line {
  text: string;
  phrase: { firstBar: number; barCount: number } | null;
}

/** Four lines on the bars, eight note starts each: the first, third and fourth have eight syllables, the second has seven. */
const LINES: Line[] = [
  { text: "一二三四五六七八", phrase: { firstBar: 0, barCount: 2 } },
  { text: "甲乙丙丁戊己庚", phrase: { firstBar: 2, barCount: 2 } },
  { text: "子丑寅卯辰巳午未", phrase: { firstBar: 4, barCount: 2 } },
  { text: "天地玄黄宇宙洪荒", phrase: { firstBar: 6, barCount: 2 } },
  { text: "尚未对齐的一行", phrase: null },
];

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);
const lyrics = (page: Page) => slot(page, "lyrics");
const phrases = (page: Page) => lyrics(page).getByRole("list", { name: "Lyrics", exact: true });
const phrase = (page: Page, line: number) =>
  phrases(page).getByRole("listitem", { name: new RegExp(`^Line ${line},`) });
const unaligned = (page: Page) => lyrics(page).getByRole("list", { name: "Not aligned", exact: true });

async function openTrack(harness: Harness, lines: Line[] = LINES, options: Record<string, unknown> = {}) {
  await harness.layout.open({
    score: { text: SCORE },
    project: { lyricLines: lines },
    parts: ["lyrics"],
    ...options,
  });
}

/** Where the lane's time axis is on the page: its left edge and how many pixels one tick takes. */
async function axisOf(page: Page): Promise<{ left: number; perTick: number }> {
  const area = await box(phrases(page));
  return { left: area.x, perTick: area.width / TICKS };
}

test.describe("the phrases", () => {
  test("a phrase stands over its bars and says its counts in words and in a mark that is not colour", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    await expect(phrases(page).getByRole("listitem")).toHaveCount(4);
    const { left, perTick } = await axisOf(page);
    for (const [index, line] of LINES.slice(0, 4).entries()) {
      const area = await box(phrase(page, index + 1));
      const first = line.phrase?.firstBar ?? 0;
      const count = line.phrase?.barCount ?? 0;
      // The block fills its bars but for a 2 pixel gap that keeps two neighbours from reading as one.
      expect(area.x).toBeGreaterThanOrEqual(left + first * BAR * perTick - 0.5);
      expect(area.x + area.width).toBeLessThanOrEqual(left + (first + count) * BAR * perTick + 0.5);
      expect(count * BAR * perTick - area.width).toBeLessThanOrEqual(2.5);
    }

    await expect(phrase(page, 1)).toHaveAccessibleName(
      "Line 1, bars 1 to 2, 8 syllables and 8 note starts, equal: 一二三四五六七八",
    );
    await expect(phrase(page, 2)).toHaveAccessibleName(
      "Line 2, bars 3 to 4, 7 syllables and 8 note starts, they differ: 甲乙丙丁戊己庚",
    );
    await expect(phrase(page, 1)).toContainText("8 / 8");
    await expect(phrase(page, 2)).toContainText("7 / 8");

    // The two states differ in colour and, beside it, in the line round the block, so colour is never the only mark.
    const state = (target: Locator) =>
      target.evaluate((el) => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, border: style.borderTopStyle };
      });
    const equal = await state(phrase(page, 1));
    const differ = await state(phrase(page, 2));
    expect(equal.background).not.toBe(differ.background);
    expect(equal.border).toBe("solid");
    expect(differ.border).toBe("dashed");
    expect(await state(phrase(page, 3))).toEqual(equal);
  });

  test("a project without lyrics says so in one line instead of drawing an empty track", async ({ page, harness }) => {
    await openTrack(harness, []);
    await expect(lyrics(page)).toContainText("No lyrics in this song");
    await expect(phrases(page)).toHaveCount(0);
  });
});

test.describe("the syllables", () => {
  test("a phrase whose counts are equal shows each syllable at the start of its note", async ({ page, harness }) => {
    await harness.layout.open({
      score: { text: SCORE },
      project: { lyricLines: LINES },
      parts: ["vocal", "lyrics"],
    });
    const vocal = slot(page, "vocal");
    const noteAt = (label: string) => vocal.getByRole("listitem", { name: label, exact: true });
    const syllable = (text: string) => lyrics(page).getByText(text, { exact: true });

    const notes = [
      "C4, bar 1 beat 1, length 1 beat",
      "D4, bar 1 beat 2, length 1 beat",
      "E4, bar 1 beat 3, length 1 beat",
      "F4, bar 1 beat 4, length 1 beat",
    ];
    for (const [index, label] of notes.entries()) {
      const note = await box(noteAt(label).first());
      const sung = await box(syllable("一二三四五六七八"[index] as string));
      expect(sung.x).toBeCloseTo(note.x, 0);
    }
    // A phrase with 7 syllables over 8 notes does not say which syllable is on which note, so it shows none.
    await expect(syllable("甲")).toHaveCount(0);
  });
});

test.describe("the unaligned area", () => {
  test("lists the lines that have no phrase, and a phrase that no longer fits the score, which the lane does not draw", async ({
    page,
    harness,
  }) => {
    await openTrack(harness, [...LINES, { text: "已经不在乐谱里", phrase: { firstBar: 20, barCount: 2 } }]);
    await expect(unaligned(page).getByRole("listitem")).toHaveText(["尚未对齐的一行", "已经不在乐谱里"]);
    await expect(phrases(page).getByRole("listitem")).toHaveCount(4);
    await expect(lyrics(page)).toContainText("Not aligned");
  });

  test("shows no area when every line sits on bars and there is nothing to edit", async ({ page, harness }) => {
    await openTrack(harness, LINES.slice(0, 4), { editable: false });
    await expect(unaligned(page)).toHaveCount(0);
    await expect(lyrics(page).getByText("Not aligned")).toBeHidden();
    await expect(phrases(page).getByRole("listitem")).toHaveCount(4);
  });
});

/** The lyric lines the session holds, as the project stores them. */
function storedLines(page: Page) {
  return page.evaluate(() => window.harness.layout.live().project.lyricLines ?? null);
}

/** The text editor of the chosen line. */
const textbox = (page: Page) => lyrics(page).getByRole("textbox", { name: "Lyric line text", exact: true });

test.describe("choosing a line and editing its text", () => {
  test("a press on a phrase chooses its line and shows its text; Enter sends it as one step that one undo takes back", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await expect(textbox(page)).toBeHidden();
    await press(phrase(page, 1));
    await expect(phrase(page, 1)).toHaveAccessibleName(/, selected: 一二三四五六七八$/);
    await expect(textbox(page)).toHaveValue("一二三四五六七八");

    await textbox(page).fill("一二三四五六七");
    await textbox(page).press("Enter");

    expect((await storedLines(page))?.[0]?.text).toBe("一二三四五六七");
    await expect(phrase(page, 1)).toContainText("7 / 8");
    await expect(phrase(page, 1)).toHaveAccessibleName(
      /^Line 1, bars 1 to 2, 7 syllables and 8 note starts, they differ/,
    );
    await expect(lyrics(page).getByRole("status")).toHaveText("Line 1 text changed");

    expect(await harness.layout.undo()).toBe(true);
    expect((await storedLines(page))?.[0]?.text).toBe("一二三四五六七八");
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("Escape gives the typed text up and sends nothing", async ({ page, harness, press }) => {
    await openTrack(harness);
    await press(phrase(page, 1));
    await textbox(page).fill("别的词");
    await textbox(page).press("Escape");
    expect((await storedLines(page))?.[0]?.text).toBe("一二三四五六七八");
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(textbox(page)).toBeHidden();
  });

  test("leaving the box with changed text sends it, and the press that left it still chooses the next line", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(phrase(page, 1));
    await textbox(page).fill("一二三四五六七");
    await press(phrase(page, 3));
    expect((await storedLines(page))?.[0]?.text).toBe("一二三四五六七");
    await expect(textbox(page)).toHaveValue("子丑寅卯辰巳午未");
    await expect(phrase(page, 3)).toHaveAccessibleName(/, selected: /);
  });

  test("a text the project refuses changes nothing, and is said", async ({ page, harness, press }) => {
    await openTrack(harness);
    await press(phrase(page, 1));
    await textbox(page).fill("[Verse]");
    await textbox(page).press("Enter");
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(lyrics(page).getByRole("status")).toContainText("A lyric line cannot be only a [section] label");
  });

  test("a line not on bars is chosen and edited the same way", async ({ page, harness, press }) => {
    await openTrack(harness);
    await press(unaligned(page).getByRole("button", { name: /^Line 5, not aligned/ }));
    await expect(textbox(page)).toHaveValue("尚未对齐的一行");
    await textbox(page).fill("改过的一行");
    await textbox(page).press("Enter");
    expect((await storedLines(page))?.[4]).toEqual({ text: "改过的一行", phrase: null });
  });

  test("a read-only track chooses nothing and offers no editor", async ({ page, harness, press }) => {
    await openTrack(harness, LINES, { editable: false });
    await press(phrase(page, 1));
    await expect(textbox(page)).toBeHidden();
    await expect(phrase(page, 1)).not.toHaveAccessibleName(/selected/);
    await expect(unaligned(page).getByRole("button")).toHaveCount(0);
  });
});

const button = (page: Page, name: string) => lyrics(page).getByRole("button", { name, exact: true });

/** Chooses a line and puts the caret after `offset` characters of its text. */
async function chooseWithCaret(page: Page, press: (target: Locator) => Promise<void>, target: Locator, offset: number) {
  await press(target);
  await textbox(page).evaluate((input, at) => {
    (input as HTMLInputElement).focus();
    (input as HTMLInputElement).setSelectionRange(at, at);
  }, offset);
}

test.describe("splitting, merging, deleting and adding a line", () => {
  test("splitting an aligned line cuts the text at the caret and the bars at the bar line nearest the note it falls on, in one step", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await chooseWithCaret(page, press, phrase(page, 1), 4);
    await press(button(page, "Split at caret"));

    expect(await storedLines(page)).toEqual([
      { text: "一二三四", phrase: { firstBar: 0, barCount: 1 } },
      { text: "五六七八", phrase: { firstBar: 1, barCount: 1 } },
      ...LINES.slice(1),
    ]);
    await expect(phrases(page).getByRole("listitem")).toHaveCount(5);
    await expect(lyrics(page).getByRole("status")).toHaveText("Line 1 split into lines 1 and 2");

    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("splitting a line that is not on bars splits the text and leaves both halves there", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await chooseWithCaret(page, press, unaligned(page).getByRole("button", { name: /^Line 5/ }), 2);
    await press(button(page, "Split at caret"));
    expect((await storedLines(page))?.slice(4)).toEqual([
      { text: "尚未", phrase: null },
      { text: "对齐的一行", phrase: null },
    ]);
  });

  test("a caret at the end of the text splits nothing and says why", async ({ page, harness, press }) => {
    await openTrack(harness);
    await chooseWithCaret(page, press, phrase(page, 1), 8);
    await press(button(page, "Split at caret"));
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(lyrics(page).getByRole("status")).toContainText("Split a lyric line at a character inside it");
  });

  test("merging a line with the next joins the texts and the bars in one step", async ({ page, harness, press }) => {
    await openTrack(harness);
    await press(phrase(page, 2));
    await press(button(page, "Merge with next"));
    expect(await storedLines(page)).toEqual([
      LINES[0],
      { text: "甲乙丙丁戊己庚子丑寅卯辰巳午未", phrase: { firstBar: 2, barCount: 4 } },
      LINES[3],
      LINES[4],
    ]);
    await expect(lyrics(page).getByRole("status")).toHaveText("Lines 2 and 3 merged");
    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("lines in two sections do not merge: the refusal is said and nothing changes", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(phrase(page, 1));
    await press(button(page, "Merge with next"));
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(lyrics(page).getByRole("status")).toContainText("different sections");
  });

  test("deleting a line takes it out, and one undo brings it back", async ({ page, harness, press }) => {
    await openTrack(harness);
    await press(unaligned(page).getByRole("button", { name: /^Line 5/ }));
    await press(button(page, "Delete line"));
    expect(await storedLines(page)).toEqual(LINES.slice(0, 4));
    await expect(textbox(page)).toBeHidden();
    await expect(lyrics(page).getByRole("status")).toHaveText("Line 5 deleted");
    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(LINES);
  });

  test("a new line starts in the unaligned area; an empty one is refused", async ({ page, harness, press }) => {
    await openTrack(harness);
    const newText = lyrics(page).getByRole("textbox", { name: "New lyric line text", exact: true });
    await press(button(page, "New line"));
    await expect(newText).toBeVisible();

    await press(button(page, "Add"));
    expect(await storedLines(page)).toEqual(LINES);
    await expect(lyrics(page).getByRole("status")).toContainText("A lyric line cannot be empty");

    await newText.fill("新的一行");
    await press(button(page, "Add"));
    expect(await storedLines(page)).toEqual([...LINES, { text: "新的一行", phrase: null }]);
    await expect(unaligned(page).getByRole("listitem")).toHaveText(["尚未对齐的一行", "新的一行"]);
    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a read-only track has no buttons to change a line", async ({ page, harness }) => {
    await openTrack(harness, LINES, { editable: false });
    await expect(lyrics(page).getByRole("button")).toHaveCount(0);
  });
});

/** A zoom at which all eight bars fit the narrowest card the layout page makes: a bar is 40 pixels wide. */
const FIT_ZOOM = 0.25;

/** A way to press, move and lift one pointer: a mouse on the desktop project, a finger on the phone project. */
interface Pointer {
  down(point: Point): Promise<void>;
  move(point: Point): Promise<void>;
  up(): Promise<void>;
  close(): Promise<void>;
}

async function pointerOf(page: Page, harness: Harness, isMobile: boolean): Promise<Pointer> {
  if (!isMobile) {
    return {
      async down(point) {
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
      },
      move: (point) => page.mouse.move(point.x, point.y, { steps: 8 }),
      up: () => page.mouse.up(),
      close: async () => {},
    };
  }
  const finger = await harness.finger();
  return {
    down: (point) => finger.down(point),
    move: (point) => finger.move(point),
    up: () => finger.up(),
    close: () => finger.close(),
  };
}

/** Where a bar line is on the page, in the middle of the phrase row. */
async function barLine(page: Page, bar: number): Promise<Point> {
  const area = await box(phrases(page));
  return { x: area.x + (bar * BAR * area.width) / TICKS, y: area.y + area.height / 2 };
}

/** The handle on an edge of a line's phrase. */
const handle = (page: Page, edge: "Start" | "End", line: number) =>
  lyrics(page).getByRole("slider", { name: new RegExp(`^${edge} of line ${line},`) });

/** Presses on the bar line a phrase edge is on, slides to another bar line, and lets go. */
async function dragEdge(page: Page, harness: Harness, isMobile: boolean, from: number, to: number) {
  const pointer = await pointerOf(page, harness, isMobile);
  try {
    await pointer.down(await barLine(page, from));
    await pointer.move(await barLine(page, to));
    await pointer.up();
  } finally {
    await pointer.close();
  }
}

/** Two lines in a Verse of four bars with two free bars between them. */
const GAPPED: Line[] = [
  { text: "一二三四", phrase: { firstBar: 2, barCount: 1 } },
  { text: "五六七八", phrase: { firstBar: 5, barCount: 1 } },
];

test.describe("dragging the edge of a phrase", () => {
  test("an edge with free room moves only its line, in one step that one undo takes back", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness, GAPPED);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    await dragEdge(page, harness, isMobile, 3, 5);
    expect(await storedLines(page)).toEqual([{ text: "一二三四", phrase: { firstBar: 2, barCount: 3 } }, GAPPED[1]]);
    await expect(handle(page, "End", 1)).toHaveAttribute("aria-valuenow", "5");
    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(GAPPED);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("the left edge moves the same way", async ({ page, harness, isMobile }) => {
    await openTrack(harness, GAPPED);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    await dragEdge(page, harness, isMobile, 5, 3);
    expect(await storedLines(page)).toEqual([GAPPED[0], { text: "五六七八", phrase: { firstBar: 3, barCount: 3 } }]);
  });

  test("a boundary two lines share moves both, in one step", async ({ page, harness, isMobile }) => {
    await openTrack(harness);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    await dragEdge(page, harness, isMobile, 4, 5);
    expect(await storedLines(page)).toEqual([
      LINES[0],
      { text: "甲乙丙丁戊己庚", phrase: { firstBar: 2, barCount: 3 } },
      { text: "子丑寅卯辰巳午未", phrase: { firstBar: 5, barCount: 1 } },
      LINES[3],
      LINES[4],
    ]);
    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);

    await dragEdge(page, harness, isMobile, 4, 3);
    expect((await storedLines(page))?.slice(1, 3)).toEqual([
      { text: "甲乙丙丁戊己庚", phrase: { firstBar: 2, barCount: 1 } },
      { text: "子丑寅卯辰巳午未", phrase: { firstBar: 3, barCount: 3 } },
    ]);
  });

  test("a drag past what the bars allow is held: a line keeps a bar, a section keeps its lines", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    await dragEdge(page, harness, isMobile, 4, 8);
    expect((await storedLines(page))?.slice(1, 3)).toEqual([
      { text: "甲乙丙丁戊己庚", phrase: { firstBar: 2, barCount: 3 } },
      { text: "子丑寅卯辰巳午未", phrase: { firstBar: 5, barCount: 1 } },
    ]);
  });

  test("the block follows the pointer while it is down, and a drag back to the start sends nothing", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness, GAPPED);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      const block = phrase(page, 1);
      const before = await box(block);
      await pointer.down(await barLine(page, 3));
      await pointer.move(await barLine(page, 4));
      await expect.poll(async () => (await box(block)).width).toBeGreaterThan(before.width + 30);
      await expect(lyrics(page).locator(".sce-lyric-guide")).toHaveCount(1);
      await pointer.move(await barLine(page, 3));
      await pointer.up();
    } finally {
      await pointer.close();
    }
    await expect(lyrics(page).locator(".sce-lyric-guide")).toHaveCount(0);
    expect(await storedLines(page)).toEqual(GAPPED);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a drag the browser takes back sends nothing", async ({ page, harness, isMobile }) => {
    await openTrack(harness, GAPPED);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    const watcher = await harness.watchPointer();
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(await barLine(page, 3));
      await pointer.move(await barLine(page, 4));
      await watcher.cancel(handle(page, "End", 1));
      await pointer.up();
    } finally {
      await pointer.close();
    }
    expect(await storedLines(page)).toEqual(GAPPED);
    await expect(lyrics(page).locator(".sce-lyric-guide")).toHaveCount(0);
  });

  test("a read-only track has no handles", async ({ page, harness }) => {
    await openTrack(harness, LINES, { editable: false });
    await expect(lyrics(page).getByRole("slider")).toHaveCount(0);
  });
});

/** Two lines with free bars between them, and a line that is not on bars. */
const WITH_LOOSE: Line[] = [...GAPPED, { text: "尚未对齐的一行", phrase: null }];

/** The grip of the first line in the unaligned area. */
const grip = (page: Page) => unaligned(page).locator(".sce-lyric-grip").first();

/** The middle of a bar in the phrase row. */
async function barMiddle(page: Page, bar: number): Promise<Point> {
  const start = await barLine(page, bar);
  const next = await barLine(page, bar + 1);
  return { x: (start.x + next.x) / 2, y: start.y };
}

async function centreOf(target: Locator): Promise<Point> {
  const area = await box(target);
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}

test.describe("dragging a line from the unaligned area onto bars", () => {
  test("the bar it is let go over gives the line a one-bar phrase, in one step that one undo takes back", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness, WITH_LOOSE);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(await centreOf(grip(page)));
      await pointer.move(await barMiddle(page, 3));
      await expect(lyrics(page).locator(".sce-lyric-drop")).toHaveCount(1);
      await expect(lyrics(page).locator(".sce-lyric-drop")).toHaveAttribute("data-free", "true");
      await pointer.up();
    } finally {
      await pointer.close();
    }
    // The project keeps the lines on bars in the order of their bars, so the dropped line stands between the two.
    expect(await storedLines(page)).toEqual([
      GAPPED[0],
      { text: "尚未对齐的一行", phrase: { firstBar: 3, barCount: 1 } },
      GAPPED[1],
    ]);
    await expect(lyrics(page).locator(".sce-lyric-drop")).toHaveCount(0);
    await expect(unaligned(page)).toBeHidden();
    await expect(lyrics(page).getByRole("status")).toHaveText("Line 2 placed on bar 4");
    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(WITH_LOOSE);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a bar that already has a line is no place to drop: the refusal is said and nothing changes", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openTrack(harness, WITH_LOOSE);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      await pointer.down(await centreOf(grip(page)));
      await pointer.move(await barMiddle(page, 2));
      await expect(lyrics(page).locator(".sce-lyric-drop")).toHaveAttribute("data-free", "false");
      await pointer.up();
    } finally {
      await pointer.close();
    }
    expect(await storedLines(page)).toEqual(WITH_LOOSE);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(lyrics(page).getByRole("status")).toContainText("overlaps line 1");
  });

  test("letting go away from the lane sends nothing", async ({ page, harness, isMobile }) => {
    await openTrack(harness, WITH_LOOSE);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    const pointer = await pointerOf(page, harness, isMobile);
    try {
      const start = await centreOf(grip(page));
      await pointer.down(start);
      await pointer.move(await barMiddle(page, 3));
      await pointer.move({ x: start.x + 60, y: start.y });
      await expect(lyrics(page).locator(".sce-lyric-drop")).toHaveCount(0);
      await pointer.up();
    } finally {
      await pointer.close();
    }
    expect(await storedLines(page)).toEqual(WITH_LOOSE);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a read-only track has no grips", async ({ page, harness }) => {
    await openTrack(harness, WITH_LOOSE, { editable: false });
    await expect(lyrics(page).locator(".sce-lyric-grip")).toHaveCount(0);
  });
});

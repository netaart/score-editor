// ABOUTME: Seam 5 for the lyric track: its phrases, the green and yellow counts, syllables on notes, the unaligned area and its editing.
// ABOUTME: Each case runs with a mouse on the desktop project and with a finger on the phone project, and reads what the session holds.
import type { Locator, Page } from "@playwright/test";
import {
  box,
  editorScroller,
  expect,
  groundOf,
  type Harness,
  lyricDropMark,
  lyricGrips,
  lyricGuide,
  lyricHead,
  lyricKeys,
  lyricPanel,
  lyricSyllableCells,
  type Point,
  test,
} from "./fixtures";

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

    // The line round the block is solid or broken as well as green or yellow (the hues are checked under "the colours"), so colour is never the only mark.
    const state = (target: Locator) =>
      target.evaluate((el) => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, border: style.borderTopStyle };
      });
    const equal = await state(phrase(page, 1));
    const differ = await state(phrase(page, 2));
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
function storedLines(page: Page): Promise<Line[] | null> {
  return page.evaluate(() => (window.harness.layout.live().project as { lyricLines?: Line[] }).lyricLines ?? null);
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

  test("a press inside the box of a line not on bars keeps the text typed in it and puts the caret where the press was", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(unaligned(page).getByRole("button", { name: /^Line 5, not aligned/ }));
    await press(textbox(page));
    await page.keyboard.press("End");
    await page.keyboard.type("续");
    await expect(textbox(page)).toHaveValue("尚未对齐的一行续");

    await press(textbox(page), { x: 2, y: 10 });
    await expect(textbox(page)).toHaveValue("尚未对齐的一行续");
    expect(await textbox(page).evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(0);
    await expect(textbox(page)).toBeFocused();
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a press inside the box, or on the line that is already chosen, keeps the mark on a refused text", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    const row = unaligned(page).getByRole("button", { name: /^Line 5, not aligned/ });
    const reason = unaligned(page)
      .getByRole("group", { name: "Line 5", exact: true })
      .getByText("A lyric line cannot be only a [section] label");
    await press(row);
    await press(textbox(page));
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("[Verse]");
    await page.keyboard.press("Enter");
    await expect(textbox(page)).toHaveAttribute("aria-invalid", "true");
    await expect(reason).toBeVisible();

    await press(textbox(page), { x: 2, y: 10 });
    await expect(textbox(page)).toHaveValue("[Verse]");
    await expect(textbox(page)).toHaveAttribute("aria-invalid", "true");
    await expect(reason).toBeVisible();

    await press(row);
    await expect(textbox(page)).toHaveValue("[Verse]");
    await expect(textbox(page)).toHaveAttribute("aria-invalid", "true");
    await expect(reason).toBeVisible();
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
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
    await press(button(page, "Split at cursor"));

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
    await press(button(page, "Split at cursor"));
    expect((await storedLines(page))?.slice(4)).toEqual([
      { text: "尚未", phrase: null },
      { text: "对齐的一行", phrase: null },
    ]);
  });

  test("a caret at the end of the text splits nothing and says why", async ({ page, harness, press }) => {
    await openTrack(harness);
    await chooseWithCaret(page, press, phrase(page, 1), 8);
    await press(button(page, "Split at cursor"));
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
      await expect(lyricGuide(lyrics(page))).toHaveCount(1);
      await pointer.move(await barLine(page, 3));
      await pointer.up();
    } finally {
      await pointer.close();
    }
    await expect(lyricGuide(lyrics(page))).toHaveCount(0);
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
    await expect(lyricGuide(lyrics(page))).toHaveCount(0);
  });

  test("a read-only track has no handles", async ({ page, harness }) => {
    await openTrack(harness, LINES, { editable: false });
    await expect(lyrics(page).getByRole("slider")).toHaveCount(0);
  });
});

/** Two lines with free bars between them, and a line that is not on bars. */
const WITH_LOOSE: Line[] = [...GAPPED, { text: "尚未对齐的一行", phrase: null }];

/** The grip of the first line in the unaligned area. */
const grip = (page: Page) => lyricGrips(unaligned(page)).first();

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
      await expect(lyricDropMark(lyrics(page))).toHaveCount(1);
      await expect(lyricDropMark(lyrics(page))).toHaveAttribute("data-free", "true");
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
    await expect(lyricDropMark(lyrics(page))).toHaveCount(0);
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
      await expect(lyricDropMark(lyrics(page))).toHaveAttribute("data-free", "false");
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
      await expect(lyricDropMark(lyrics(page))).toHaveCount(0);
      await pointer.up();
    } finally {
      await pointer.close();
    }
    expect(await storedLines(page)).toEqual(WITH_LOOSE);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a read-only track has no grips", async ({ page, harness }) => {
    await openTrack(harness, WITH_LOOSE, { editable: false });
    await expect(lyricGrips(lyrics(page))).toHaveCount(0);
  });
});

test.describe("the keyboard", () => {
  test("Tab reaches the phrases as one stop, the arrows step from line to line and choose each, Enter edits the text, Escape comes back", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    await lyrics(page).getByRole("region", { name: "Lyrics", exact: true }).focus();
    // The button that adds a line comes first, in the track head; then the phrases are one stop.
    await page.keyboard.press("Tab");
    await expect(button(page, "New line")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(phrase(page, 1)).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(phrase(page, 2)).toBeFocused();
    await expect(phrase(page, 2)).toHaveAccessibleName(/, selected: /);
    await expect(textbox(page)).toHaveValue("甲乙丙丁戊己庚");

    await page.keyboard.press("End");
    await expect(phrase(page, 4)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(phrase(page, 1)).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(textbox(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(phrase(page, 1)).toBeFocused();
    await expect(textbox(page)).toBeHidden();
  });

  test("Enter in the text sends it and comes back to the line", async ({ page, harness }) => {
    await openTrack(harness);
    await phrase(page, 1).focus();
    await page.keyboard.press("Enter");
    await textbox(page).fill("一二三四五六七");
    await page.keyboard.press("Enter");
    expect((await storedLines(page))?.[0]?.text).toBe("一二三四五六七");
    await expect(phrase(page, 1)).toBeFocused();
    await expect(textbox(page)).toBeHidden();
  });

  test("Delete on a line takes it out as one step, and the focus stays on the track", async ({ page, harness }) => {
    await openTrack(harness);
    await phrase(page, 4).focus();
    await page.keyboard.press("Delete");
    expect(await storedLines(page)).toEqual([...LINES.slice(0, 3), LINES[4]]);
    await expect(phrase(page, 3)).toBeFocused();
    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(LINES);
  });

  test("the handles of the chosen line are reached with Tab and step one bar with the arrows, a shared boundary moving both lines", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    await phrase(page, 3).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(phrase(page, 2)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(handle(page, "Start", 2)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(handle(page, "End", 2)).toBeFocused();
    await expect(handle(page, "End", 2)).toHaveAttribute("aria-valuenow", "4");

    await page.keyboard.press("ArrowRight");
    expect((await storedLines(page))?.slice(1, 3)).toEqual([
      { text: "甲乙丙丁戊己庚", phrase: { firstBar: 2, barCount: 3 } },
      { text: "子丑寅卯辰巳午未", phrase: { firstBar: 5, barCount: 1 } },
    ]);
    await expect(handle(page, "End", 2)).toBeFocused();
    await expect(handle(page, "End", 2)).toHaveAttribute("aria-valuenow", "5");
    await expect(handle(page, "End", 2)).toHaveAttribute("aria-valuetext", "bar 5");

    // The next bar line would leave the other line with no bar, so the key does nothing.
    await page.keyboard.press("ArrowRight");
    expect((await storedLines(page))?.[1]?.phrase).toEqual({ firstBar: 2, barCount: 3 });

    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
  });
});

test.describe("a step past an end of the score", () => {
  test("goes nowhere from the first phrase's start and the last phrase's end, and the range of the handle says the same", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    const first = handle(page, "Start", 1);
    await first.focus();
    await expect(first).toHaveAttribute("aria-valuemin", "1");
    await expect(first).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("ArrowLeft");
    expect(await storedLines(page)).toEqual(LINES);

    const last = handle(page, "End", 4);
    await last.focus();
    await expect(last).toHaveAttribute("aria-valuemax", "8");
    await expect(last).toHaveAttribute("aria-valuenow", "8");
    await page.keyboard.press("ArrowRight");
    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
  });
});

test.describe("placing a line on a bar by its number", () => {
  const barField = (page: Page) => lyrics(page).getByRole("spinbutton", { name: "Bar number", exact: true });

  test("gives the line a one-bar phrase on that bar, in one step that one undo takes back", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, WITH_LOOSE);
    await press(unaligned(page).getByRole("button", { name: /^Line 3, not aligned/ }));
    await barField(page).fill("4");
    await press(button(page, "Place on bar"));
    expect(await storedLines(page)).toEqual([
      GAPPED[0],
      { text: "尚未对齐的一行", phrase: { firstBar: 3, barCount: 1 } },
      GAPPED[1],
    ]);
    await expect(lyrics(page).getByRole("status")).toHaveText("Line 2 placed on bar 4");
    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(WITH_LOOSE);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("a bar that has a line, and a bar the score does not have, are refused and change nothing", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, WITH_LOOSE);
    await press(unaligned(page).getByRole("button", { name: /^Line 3, not aligned/ }));
    await barField(page).fill("3");
    await press(button(page, "Place on bar"));
    await expect(lyrics(page).getByRole("status")).toContainText("overlaps line 1");
    await barField(page).fill("99");
    await press(button(page, "Place on bar"));
    await expect(lyrics(page).getByRole("status")).toContainText("outside this score");
    expect(await storedLines(page)).toEqual(WITH_LOOSE);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("is offered for a line that is not on bars and for no other", async ({ page, harness, press }) => {
    await openTrack(harness, WITH_LOOSE);
    await press(phrase(page, 1));
    await expect(barField(page)).toBeHidden();
    await press(unaligned(page).getByRole("button", { name: /^Line 3, not aligned/ }));
    await expect(barField(page)).toBeVisible();
  });
});

const region = (page: Page) => lyrics(page).getByRole("region", { name: "Lyrics", exact: true });

test.describe("on a touch screen", () => {
  test("a slide on empty track space, and one that starts on a phrase, scroll the track and change nothing", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "a slide is a touch gesture");
    await openTrack(harness);
    const area = await box(phrases(page));
    const surface = await box(region(page));

    // Below the phrases, in the row the syllables stand in, there is no element that takes a press.
    await harness.swipe(
      { x: surface.x + 250, y: area.y + area.height + 6 },
      { x: surface.x + 60, y: area.y + area.height + 6 },
    );
    await expect.poll(async () => (await harness.scrollOf(region(page))).left).toBeGreaterThan(100);

    await harness.layout.setView({ scrollLeft: 0 });
    await expect.poll(async () => (await harness.scrollOf(region(page))).left).toBe(0);
    const body = await box(phrase(page, 1));
    await harness.swipe({ x: surface.x + 200, y: body.y + 10 }, { x: surface.x + 60, y: body.y + 10 });
    await expect.poll(async () => (await harness.scrollOf(region(page))).left).toBeGreaterThan(100);

    expect(await storedLines(page)).toEqual(LINES);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(textbox(page)).toBeHidden();
  });

  test("a slide that starts on a handle moves the edge and leaves the scroll where it was", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(!isMobile, "a slide is a touch gesture");
    await openTrack(harness, GAPPED);
    await harness.layout.setView({ scrollLeft: 300 });
    await expect.poll(async () => (await harness.scrollOf(region(page))).left).toBe(300);
    const start = await centreOf(handle(page, "End", 1));
    const finger = await harness.finger();
    try {
      await finger.down(start);
      await finger.move({ x: start.x + 160, y: start.y });
      await finger.up();
    } finally {
      await finger.close();
    }
    expect((await storedLines(page))?.[0]?.phrase).toEqual({ firstBar: 2, barCount: 2 });
    expect((await harness.scrollOf(region(page))).left).toBe(300);
  });

  test("the handle and the grip are the size of a fingertip", async ({ page, harness, isMobile }) => {
    test.skip(!isMobile, "the sizes are for a coarse pointer");
    await openTrack(harness, WITH_LOOSE);
    const edge = await box(handle(page, "End", 1));
    expect(edge.width).toBeGreaterThanOrEqual(44);
    expect(edge.height).toBeGreaterThanOrEqual(36);
    const handleArea = await box(grip(page));
    expect(handleArea.width).toBeGreaterThanOrEqual(44);
    expect(handleArea.height).toBeGreaterThanOrEqual(36);
    // A field below 16 pixels makes a phone's browser zoom the page when the field takes the focus.
    const picked = unaligned(page).getByRole("button", { name: /^Line 3, not aligned/ });
    await picked.tap();
    expect(await textbox(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  });
});

test.describe("the track on the axis the other tracks share", () => {
  test("follows their zoom and their scroll", async ({ page, harness }) => {
    await harness.layout.open({
      score: { text: SCORE },
      project: { lyricLines: LINES },
      parts: ["vocal", "lyrics"],
    });
    const vocalList = slot(page, "vocal").getByRole("list", { name: "Vocal", exact: true });
    for (const zoom of [1, 0.5, 2]) {
      await harness.layout.setView({ zoom });
      await expect
        .poll(async () => Math.round((await box(phrases(page))).width))
        .toBe(Math.round((await box(vocalList)).width));
    }
    await harness.layout.setView({ zoom: 1, scrollLeft: 220 });
    const vocalRegion = slot(page, "vocal").getByRole("region", { name: "Vocal", exact: true });
    await expect.poll(async () => (await harness.scrollOf(region(page))).left).toBe(220);
    await expect.poll(async () => (await harness.scrollOf(vocalRegion)).left).toBe(220);
  });
});

test.describe("when the song changes under the track", () => {
  test("a section command moves the lines with their section and the track follows", async ({ page, harness }) => {
    await openTrack(harness);
    expect((await harness.layout.dispatch({ type: "deleteSection", section: 1 })).ok).toBe(true);
    await expect(phrases(page).getByRole("listitem")).toHaveCount(2);
    await expect(phrase(page, 2)).toHaveAccessibleName(
      "Line 2, bars 3 to 4, 8 syllables and 8 note starts, equal: 天地玄黄宇宙洪荒",
    );
    expect(await harness.layout.undo()).toBe(true);
    await expect(phrases(page).getByRole("listitem")).toHaveCount(4);

    expect((await harness.layout.dispatch({ type: "duplicateSection", section: 2 })).ok).toBe(true);
    await expect(phrases(page).getByRole("listitem")).toHaveCount(5);
  });

  test("a line the new score has no bars for falls into the unaligned area", async ({ page, harness }) => {
    await openTrack(harness, [...LINES.slice(0, 3), { text: "最后一句", phrase: { firstBar: 6, barCount: 2 } }]);
    await expect(phrases(page).getByRole("listitem")).toHaveCount(4);
    // A shorter song, as the score text of an edit made elsewhere: the Chorus is gone, and the line that stood on its bars is read as not on bars.
    const lines = SCORE.split("\n");
    const shorter = lines.slice(0, lines.indexOf("% Chorus")).join("\n");
    expect((await harness.layout.dispatch({ type: "replaceScoreText", text: shorter })).ok).toBe(true);
    await expect(phrases(page).getByRole("listitem")).toHaveCount(3);
    await expect(unaligned(page).getByRole("listitem")).toHaveText(["最后一句"]);
  });

  test("a song that has lyrics only as text is laid out one line to a bar, and an edit names the right line", async ({
    page,
    harness,
    press,
  }) => {
    await harness.layout.open({
      score: { text: SCORE },
      project: { lyrics: "[Intro]\n甲乙丙丁\n戊己庚辛\n[Verse]\n壬癸子丑" },
      parts: ["lyrics"],
    });
    await expect(phrases(page).getByRole("listitem")).toHaveCount(3);
    await expect(phrase(page, 2)).toHaveAccessibleName(
      /^Line 2, bar 2, 4 syllables and 4 note starts, equal: 戊己庚辛$/,
    );
    await press(phrase(page, 2));
    await textbox(page).fill("戊己庚辛壬");
    await textbox(page).press("Enter");
    expect((await storedLines(page))?.map((line) => line.text)).toEqual(["甲乙丙丁", "戊己庚辛壬", "壬癸子丑"]);
    expect(await page.evaluate(() => (window.harness.layout.live().project as { lyrics?: string }).lyrics)).toBe(
      "[Intro]\n甲乙丙丁\n戊己庚辛壬\n[Verse]\n壬癸子丑\n[Chorus]",
    );
  });
});

test.describe("in Chinese", () => {
  test("names, sentences and refusals are in the editor's language", async ({ page, harness, press }) => {
    await openTrack(harness, LINES, { language: "zh" });
    await expect(lyrics(page).getByRole("region", { name: "歌词", exact: true })).toBeVisible();
    const first = lyrics(page).getByRole("listitem", { name: /^第 1 行/ });
    await expect(first).toHaveAccessibleName("第 1 行，第 1 至 2 小节，8 个音节、8 个音符起点，相等：一二三四五六七八");
    await expect(lyrics(page).getByRole("list", { name: "未对齐", exact: true })).toBeVisible();
    await press(first);
    const input = lyrics(page).getByRole("textbox", { name: "歌词行文字", exact: true });
    await input.fill("[Verse]");
    await input.press("Enter");
    await expect(lyrics(page).getByRole("status")).toContainText("歌词行不能只有 [段落] 标签");
  });
});

test.describe("the colours", () => {
  /** The red, green and blue, each from 0 to 1, of a colour the page reports as `rgb(...)` or `color(srgb ...)`. */
  function channelsOf(css: string): [number, number, number] {
    const numbers = css.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    const scale = css.startsWith("color(") ? 1 : 255;
    const [r = 0, g = 0, b = 0] = numbers.slice(0, 3).map((value) => value / scale);
    return [r, g, b];
  }
  /** The relative luminance of a colour, as WCAG defines it. */
  function luminance(css: string): number {
    const [r = 0, g = 0, b = 0] = channelsOf(css).map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  /** The hue of a colour in degrees, 0 to 360, as HSL defines it. */
  function hueOf(css: string): number {
    const [r, g, b] = channelsOf(css);
    const high = Math.max(r, g, b);
    const span = high - Math.min(r, g, b);
    if (span === 0) return Number.NaN;
    const sector = high === r ? ((g - b) / span) % 6 : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
    return (sector * 60 + 360) % 360;
  }
  /** The wash and the line of a phrase, as the page paints them, with the text colour and the ground they derive from. */
  const paint = async (target: Locator) => {
    const ground = await groundOf(target);
    const look = await target.evaluate((el) => {
      const style = getComputedStyle(el);
      return { wash: style.backgroundColor, line: style.borderTopColor, text: style.color };
    });
    return { ...look, ground };
  };
  /** `share` of one colour and the rest of another, mixed in sRGB as DESIGN.md states the derivations. */
  const mixed = (share: number, colour: [number, number, number], other: [number, number, number]) =>
    colour.map((channel, at) => share * channel + (1 - share) * (other[at] ?? 0));
  const expectNear = (css: string, wanted: number[], message: string) => {
    const got = channelsOf(css);
    for (const [at, channel] of wanted.entries()) expect(got[at], `${message}, channel ${at}`).toBeCloseTo(channel, 2);
  };
  /** The hues a person calls green and yellow, in degrees of the colour wheel. */
  const GREEN = [100, 170] as const;
  const YELLOW = [35, 65] as const;
  const within = (hue: number, [low, high]: readonly [number, number]) => hue >= low && hue <= high;
  const contrast = (a: string, b: string) => {
    const [high = 0, low = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };

  for (const scheme of ["light", "dark"] as const) {
    test(`an equal phrase is green and a phrase whose counts differ is yellow, in its wash and in its line, on a ${scheme} page`, async ({
      page,
      harness,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await harness.setColorScheme(scheme);
      await openTrack(harness);
      for (const line of [1, 3, 4]) {
        const green = await paint(phrase(page, line));
        expect(within(hueOf(green.wash), GREEN), `${scheme} wash of equal line ${line}`).toBe(true);
        expect(within(hueOf(green.line), GREEN), `${scheme} line of equal line ${line}`).toBe(true);
      }
      const yellow = await paint(phrase(page, 2));
      expect(within(hueOf(yellow.wash), YELLOW), `${scheme} wash of the unequal line`).toBe(true);
      expect(within(hueOf(yellow.line), YELLOW), `${scheme} line of the unequal line`).toBe(true);
    });

    test(`the text on each wash and the line round each block are readable on a ${scheme} page`, async ({
      page,
      harness,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await harness.setColorScheme(scheme);
      await openTrack(harness);
      for (const line of [1, 2]) {
        const look = await phrase(page, line).evaluate((el) => {
          const style = getComputedStyle(el);
          return { wash: style.backgroundColor, text: style.color, edge: style.borderTopColor };
        });
        const pageGround = await groundOf(phrase(page, line));
        expect(contrast(look.text, look.wash), `${scheme} text on the wash of line ${line}`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrast(look.edge, pageGround), `${scheme} line round line ${line}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  test("each state takes its hue from its own variable: mapping one moves that state's wash and line and leaves the other", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    const equal = phrase(page, 1);
    const differ = phrase(page, 2);
    const unmapped = { equal: await paint(equal), differ: await paint(differ) };

    // DESIGN.md, The two state hues: the wash is 20% of the hue over the ground, the line the hue pulled 70% toward the text.
    const blue: [number, number, number] = [0, 0, 1];
    await harness.layout.setTheme({ "--sce-color-equal": "rgb(0, 0, 255)" });
    const mappedEqual = await paint(equal);
    expectNear(mappedEqual.wash, mixed(0.2, blue, channelsOf(mappedEqual.ground)), "the wash of the equal phrase");
    expectNear(mappedEqual.line, mixed(0.3, blue, channelsOf(mappedEqual.text)), "the line of the equal phrase");
    expect(await paint(differ)).toEqual(unmapped.differ);

    const red: [number, number, number] = [1, 0, 0];
    await harness.layout.setTheme({ "--sce-color-unequal": "rgb(255, 0, 0)" });
    const mappedDiffer = await paint(differ);
    expectNear(mappedDiffer.wash, mixed(0.2, red, channelsOf(mappedDiffer.ground)), "the wash of the unequal phrase");
    expectNear(mappedDiffer.line, mixed(0.3, red, channelsOf(mappedDiffer.text)), "the line of the unequal phrase");
    expect(await paint(equal)).toEqual(mappedEqual);
  });
});

test.describe("in the default editor", () => {
  test("is the bottom track of the arrangement, and a refused edit reaches the host's notice", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: SCORE }, project: { lyricLines: LINES } });
    const scroller = editorScroller(page);
    const lyricList = scroller.getByRole("list", { name: "Lyrics", exact: true });
    const insList = scroller.getByRole("list", { name: "Ins", exact: true });
    await expect(lyricList.getByRole("listitem")).toHaveCount(4);
    const lyricBox = await box(lyricList);
    const insBox = await box(insList);
    expect(lyricBox.y).toBeGreaterThan(insBox.y + insBox.height);

    await press(scroller.getByRole("listitem", { name: /^Line 1,/ }));
    const input = scroller.getByRole("textbox", { name: "Lyric line text", exact: true });
    await input.fill("[Verse]");
    await input.press("Enter");
    await expect.poll(async () => (await harness.notices()).map((notice) => notice.code)).toContain("command-refused");
    expect((await harness.notices()).at(-1)?.message).toContain("A lyric line cannot be only a [section] label");
  });

  test("shows the counts and offers no editing while read-only", async ({ page, harness }) => {
    await harness.mount({ score: { text: SCORE }, project: { lyricLines: LINES }, editable: false });
    const scroller = editorScroller(page);
    await expect(scroller.getByRole("listitem", { name: /^Line 2, .*they differ/ })).toContainText("7 / 8");
    await expect(scroller.getByRole("slider")).toHaveCount(0);
    await expect(scroller.getByRole("textbox")).toHaveCount(0);
    await expect(scroller.getByRole("button", { name: "New line" })).toBeHidden();
  });
});

test.describe("the life of the part", () => {
  test("destroying it twice is harmless, it leaves nothing behind, and a later change does not reach what it drew", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    await harness.layout.retain("lyrics");
    const drawn = await harness.layout.retainedHtml();
    await harness.layout.destroyPart("lyrics", 2);
    await expect(lyrics(page).locator("*")).toHaveCount(0);
    expect((await harness.layout.sheets()).document).toBe(0);

    await harness.layout.dispatch({ type: "setLyricLineText", line: 0, text: "别的词" });
    await harness.layout.setView({ zoom: 2, language: "zh", editable: false });
    expect(await harness.layout.retainedHtml()).toBe(drawn);
  });
});

test.describe("the listeners of the part", () => {
  /** Every element the page has gained since this ran, kept so one that left the page can still be asked what it listens to. */
  async function watchElements(page: Page) {
    await page.evaluate(() => {
      const seen = new Set<Element>();
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes)
            if (node instanceof Element) for (const element of [node, ...node.querySelectorAll("*")]) seen.add(element);
      }).observe(document, { childList: true, subtree: true });
      Object.assign(window, { seen });
    });
    const cdp = await page.context().newCDPSession(page);
    return {
      /** The listeners on all of those elements, as the browser's debugger counts them. */
      async listeners() {
        const { result: list } = await cdp.send("Runtime.evaluate", { expression: "Array.from(window.seen)" });
        if (!list.objectId) throw new Error("no list of elements");
        const { result: items } = await cdp.send("Runtime.getProperties", {
          objectId: list.objectId,
          ownProperties: true,
        });
        let total = 0;
        for (const item of items) {
          const objectId = /^\d+$/.test(item.name) ? item.value?.objectId : undefined;
          if (!objectId) continue;
          total += (await cdp.send("DOMDebugger.getEventListeners", { objectId })).listeners.length;
        }
        return total;
      },
      detach: () => cdp.detach(),
    };
  }

  test("score edits do not add any: what an earlier drawing of the track held is let go with it", async ({
    page,
    harness,
  }) => {
    const watch = await watchElements(page);
    await openTrack(harness);
    const drawn = await watch.listeners();
    expect(drawn).toBeGreaterThan(0);

    const noteId = await harness.layout.firstVocalNoteId();
    for (let edit = 0; edit < 6; edit++) {
      expect((await harness.layout.dispatch({ type: "toRest", noteId })).ok).toBe(true);
      expect(await harness.layout.undo()).toBe(true);
    }
    expect(await watch.listeners()).toBe(drawn);
    await watch.detach();
  });

  test("a score the track cannot draw leaves none of the drawing it replaced, and the next one starts again", async ({
    page,
    harness,
  }) => {
    const watch = await watchElements(page);
    await openTrack(harness);
    const drawn = await watch.listeners();

    await harness.layout.replace({ score: { vector: "reject-duration-five" } });
    expect(await watch.listeners()).toBeLessThan(drawn);
    await harness.layout.replace({ score: { text: SCORE } });
    expect(await watch.listeners()).toBe(drawn);
    await watch.detach();
  });
});

test.describe("the room the track has", () => {
  test("a syllable that does not fit its cell is left out whole, never cut in the middle of a glyph", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    const cells = lyricSyllableCells(lyrics(page));
    // Where each cell's text is drawn, against the cell: inside it, or on a line the cell clips away.
    const shown = () =>
      cells.evaluateAll((els) =>
        els.map((cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          const text = range.getBoundingClientRect();
          const frame = cell.getBoundingClientRect();
          const inside = text.right <= frame.right + 0.5 && text.bottom <= frame.bottom + 0.5;
          const clippedAway = text.top >= frame.bottom - 1 || text.left >= frame.right - 1;
          return inside ? "shown" : clippedAway ? "left out" : "cut";
        }),
      );
    expect(new Set(await shown())).toEqual(new Set(["shown"]));

    await harness.layout.setView({ zoom: FIT_ZOOM });
    const states = await shown();
    expect(states).not.toContain("cut");
    expect(states).toContain("left out");
  });

  test("the panel is no wider than the box the editor is in, whatever the page's width", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await lyrics(page).evaluate((el) => {
      (el.parentElement as HTMLElement).style.width = "320px";
    });
    await press(phrase(page, 2));
    const panel = await box(lyricPanel(lyrics(page)));
    const surface = await box(region(page));
    expect(panel.x + panel.width).toBeLessThanOrEqual(surface.x + surface.width + 0.5);
    expect(panel.width).toBeGreaterThan(200);
  });

  test("the fields say what they are for in words before anything is typed", async ({ page, harness, press }) => {
    await openTrack(harness, WITH_LOOSE);
    await press(unaligned(page).getByRole("button", { name: /^Line 3, not aligned/ }));
    await expect(lyrics(page).getByRole("spinbutton", { name: "Bar number", exact: true })).toHaveAttribute(
      "placeholder",
      "Bar number",
    );
    await button(page, "New line").click();
    await expect(lyrics(page).getByRole("textbox", { name: "New lyric line text", exact: true })).toHaveAttribute(
      "placeholder",
      "New lyric line text",
    );
  });
});

test.describe("the track as a person reads it", () => {
  test("a chosen phrase is framed by a solid line inside its own line, so a chosen yellow block still has its broken line", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(phrase(page, 2));
    const looks = async (line: number) =>
      phrase(page, line).evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          border: style.borderTopStyle,
          width: style.borderTopWidth,
          shadow: style.boxShadow,
          text: style.color,
        };
      });
    const differ = await looks(2);
    expect(differ.border).toBe("dashed");
    expect(differ.width).toBe("1px");
    expect(differ.shadow).toContain("inset");
    expect(differ.shadow).toContain("2px");
    expect(differ.shadow.startsWith(differ.text)).toBe(true);
    // A block that is not chosen has no frame.
    expect((await looks(1)).shadow).toBe("none");
  });

  test("the count stays at the pitch column's edge while the block is scrolled past it", async ({ page, harness }) => {
    await openTrack(harness);
    await harness.layout.setView({ scrollLeft: 400 });
    await expect.poll(async () => (await harness.scrollOf(region(page))).left).toBe(400);
    const keys = await box(lyricKeys(lyrics(page)));
    const count = await box(phrase(page, 2).getByText("7 / 8", { exact: true }));
    const block = await box(phrase(page, 2));
    expect(count.x).toBeGreaterThanOrEqual(keys.x + keys.width - 0.5);
    expect(count.x + count.width).toBeLessThanOrEqual(block.x + block.width + 0.5);
  });

  test("a line whose counts differ shows where its note starts are, as ticks with no syllable", async ({
    page,
    harness,
  }) => {
    await openTrack(harness);
    const cells = lyricSyllableCells(lyrics(page));
    // Lines 1, 3 and 4 have a syllable on each of their eight notes; line 2 has seven syllables and eight note starts.
    await expect(cells).toHaveCount(32);
    await expect(cells.filter({ hasText: /\S/ })).toHaveCount(24);
  });

  test("the editor of a loose line opens under its own row, which does not move; the editor of a placed line is not under the heading of the loose lines", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness, WITH_LOOSE);
    const pick = unaligned(page).getByRole("button", { name: /^Line 3, not aligned/ });
    const before = await box(pick);
    await press(pick);
    const editor = unaligned(page).getByRole("group", { name: "Line 3", exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByText("Line 3", { exact: true })).toHaveText("Line 3");
    const after = await box(pick);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
    expect((await box(editor)).y).toBeGreaterThan(after.y + after.height - 1);

    await press(phrase(page, 1));
    const placed = lyrics(page).getByRole("group", { name: "Line 1", exact: true });
    await expect(placed.getByText("Line 1", { exact: true })).toHaveText("Line 1");
    const heading = lyrics(page).getByText("Not aligned", { exact: false });
    expect((await box(placed)).y + (await box(placed)).height).toBeLessThanOrEqual((await box(heading)).y + 0.5);
  });

  test("a refused text is marked on the box and said under it, and both go when the text is changed", async ({
    page,
    harness,
    press,
  }) => {
    await openTrack(harness);
    await press(phrase(page, 1));
    await textbox(page).fill("[Verse]");
    await textbox(page).press("Enter");
    await expect(textbox(page)).toHaveAttribute("aria-invalid", "true");
    const problem = lyrics(page)
      .getByRole("group", { name: "Line 1", exact: true })
      .getByText("A lyric line cannot be only a [section] label", { exact: true });
    await expect(problem).toContainText("A lyric line cannot be only a [section] label");
    await expect(textbox(page)).toHaveAccessibleDescription(/^A lyric line cannot be only a \[section\] label/);
    await textbox(page).fill("一二三四五六七八九");
    await expect(textbox(page)).not.toHaveAttribute("aria-invalid", "true");
    await expect(problem).toBeHidden();
  });

  test("the keys are described to a screen reader while the track can edit, and the way to place a loose line is said in the panel", async ({
    page,
    harness,
  }) => {
    await openTrack(harness, WITH_LOOSE);
    const describedBy = await phrases(page).getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    await expect(lyrics(page).locator(`[id="${describedBy}"]`)).toHaveText(/^Select a line to edit its text/);
    await expect(
      lyrics(page).getByText("Drag a line onto bars, or choose it and type a bar number.", { exact: true }),
    ).toHaveText("Drag a line onto bars, or choose it and type a bar number.");
    await expect(grip(page)).toHaveAttribute("title", "Drag line 3 onto bars");

    await harness.layout.setView({ editable: false });
    await expect(phrases(page)).not.toHaveAttribute("aria-describedby", /.+/);
    await expect(
      lyrics(page).getByText("Drag a line onto bars, or choose it and type a bar number.", { exact: true }),
    ).toBeHidden();
  });

  test("Home and End on a handle move its edge as far as the other lines and the section allow, each in one step", async ({
    page,
    harness,
  }) => {
    await openTrack(harness, GAPPED);
    await handle(page, "End", 1).focus();
    await page.keyboard.press("End");
    expect((await storedLines(page))?.[0]?.phrase).toEqual({ firstBar: 2, barCount: 3 });
    await handle(page, "Start", 2).focus();
    await page.keyboard.press("Home");
    expect((await storedLines(page))?.[1]?.phrase).toEqual({ firstBar: 3, barCount: 3 });
    expect(await harness.layout.undo()).toBe(true);
    expect((await storedLines(page))?.[1]?.phrase).toEqual({ firstBar: 5, barCount: 1 });
    expect(await harness.layout.undo()).toBe(true);
    expect(await storedLines(page)).toEqual(GAPPED);
  });

  test("the New line button is not flush with the edges of the head", async ({ page, harness }) => {
    await openTrack(harness);
    const head = await box(lyricHead(lyrics(page)));
    const newLine = await box(button(page, "New line"));
    expect(newLine.y - head.y).toBeGreaterThanOrEqual(1.5);
    expect(head.y + head.height - (newLine.y + newLine.height)).toBeGreaterThanOrEqual(1.5);
  });
});

test.describe("the head of the track", () => {
  for (const [language, legend] of [
    ["en", "syllables / note starts"],
    ["zh", "音节 / 音符起点"],
  ] as const) {
    test(`says what the two numbers of a block are, in ${language}`, async ({ page, harness }) => {
      await openTrack(harness, LINES, { language });
      await expect(lyricHead(lyrics(page)).getByText(legend, { exact: true })).toBeVisible();
    });
  }
});

test.describe("after a line is placed on a bar by its number", () => {
  test("the editor closes, and the focus is on the line where it now stands", async ({ page, harness, press }) => {
    await openTrack(harness, WITH_LOOSE);
    await press(unaligned(page).getByRole("button", { name: /^Line 3, not aligned/ }));
    await lyrics(page).getByRole("spinbutton", { name: "Bar number", exact: true }).fill("4");
    await press(button(page, "Place on bar"));
    // The line is now the second of the lines on bars, so the list moved under the choice: nothing stays chosen.
    await expect(textbox(page)).toBeHidden();
    await expect(phrase(page, 2)).toHaveAccessibleName(/^Line 2, bar 4,.*: 尚未对齐的一行$/);
    await expect(phrase(page, 2)).toBeFocused();
  });
});

test.describe("the end of a drag", () => {
  test("is not a click: letting go on a handle does not choose its line", async ({ page, harness, isMobile }) => {
    await openTrack(harness, GAPPED);
    await harness.layout.setView({ zoom: FIT_ZOOM });
    await dragEdge(page, harness, isMobile, 3, 5);
    expect((await storedLines(page))?.[0]?.phrase).toEqual({ firstBar: 2, barCount: 3 });
    await expect(textbox(page)).toBeHidden();
    await expect(phrase(page, 1)).not.toHaveAccessibleName(/selected/);
  });
});

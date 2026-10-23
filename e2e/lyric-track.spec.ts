// ABOUTME: Seam 5 for the lyric track: its phrases, the green and yellow counts, syllables on notes, the unaligned area and its editing.
// ABOUTME: Each case runs with a mouse on the desktop project and with a finger on the phone project, and reads what the session holds.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, test } from "./fixtures";

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

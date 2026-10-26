// ABOUTME: Seam 5 for the voice tools: octave moves and the instrumental version in the Tools panel, with undo.
// ABOUTME: Desktop and phone, in English and Chinese, plus the skill's real two-voice score.
import type { Locator, Page } from "@playwright/test";
import { expect, test, vocalOnly } from "./fixtures";

const TOOLBAR = (page: Page) => page.locator(".sce-toolbar");
const toolsButton = (page: Page, name = "Tools") => TOOLBAR(page).getByRole("button", { name, exact: true });
const undoButton = (page: Page) => TOOLBAR(page).getByRole("button", { name: "Undo", exact: true });
const panel = (page: Page, name = "Tools") => page.getByRole("dialog", { name, exact: true });
const status = (page: Page, name = "Tools") => panel(page, name).getByRole("status");
const tool = (page: Page, name: string, panelName = "Tools") =>
  panel(page, panelName).getByRole("button", { name, exact: true });
const applyButton = (page: Page) => panel(page).getByRole("button", { name: "Apply", exact: true });
const closeButton = (page: Page) => panel(page).getByRole("button", { name: "Close", exact: true });
const viewButton = (page: Page, name: string) => TOOLBAR(page).getByRole("button", { name, exact: true });
const textBox = (page: Page) => page.getByRole("textbox", { name: "Score text", exact: true });

type Press = (target: Locator, position?: { x: number; y: number }) => Promise<void>;

const TWO_VOICES = (vocal: string, ins: string) =>
  `X:1
T:
M:4/4
L:1/16
Q:1/4=100
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
V: Vocal
${vocal}
V: Ins
${ins}`;

async function openPanel(page: Page, press: Press, name = "Tools") {
  await press(toolsButton(page, name));
  await expect(panel(page, name)).toBeVisible();
}

async function scoreText(page: Page, press: Press): Promise<string> {
  await press(viewButton(page, "Score text"));
  const text = await textBox(page).inputValue();
  await press(viewButton(page, "Arrangement"));
  return text;
}

async function runOctave(
  page: Page,
  harness: { mount(options?: Record<string, unknown>): Promise<void> },
  press: Press,
  isMobile: boolean,
) {
  await harness.mount({ score: { text: vocalOnly("C4D4E4F4|G16|") } });
  await openPanel(page, press);
  await expect(panel(page).getByRole("heading", { name: "Transform", exact: true })).toBeVisible();
  await press(tool(page, "Voice octave"));
  await panel(page).getByRole("combobox", { name: "Octaves", exact: true }).selectOption("-1");
  await expect(status(page)).toContainText("Preview: Vocal moves 1 octave down; median pitch E3 (52)");
  await press(applyButton(page));
  await expect(status(page)).toContainText("Applied. Vocal moved 1 octave down; median pitch E3 (52)");
  await press(closeButton(page));
  const after = await scoreText(page, press);
  expect(after).toContain("C,4D,4E,4F,4|G,16|");
  await press(undoButton(page));
  expect(await scoreText(page, press)).toContain("C4D4E4F4|G16|");
  if (isMobile) await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");
}

test.describe("the voice tools", () => {
  test("Voice octave moves Vocal down one octave, reports the median and undoes", async ({ page, harness, press }) => {
    await runOctave(page, harness, press, test.info().project.name === "phone");
  });

  test("Instrumental version moves Vocal into Ins, reports cuts and drops, and undoes", async ({
    page,
    harness,
    press,
  }) => {
    const score = TWO_VOICES("z4C4z8|D4z12|z4E4z8|", "F16|G4z12|A8z8|");
    await harness.mount({ score: { text: score } });
    await openPanel(page, press);
    await press(tool(page, "Instrumental version"));
    await expect(status(page)).toContainText(
      "Preview: 3 Vocal notes move to Ins; 2 Ins notes are cut short, 1 is dropped.",
    );
    await press(applyButton(page));
    await expect(status(page)).toContainText("Applied. 3 Vocal notes moved to Ins; 2 Ins notes were cut short");
    await press(closeButton(page));
    expect(await scoreText(page, press)).toBe(TWO_VOICES("z16|z16|z16|", "F4C4F8|D4z12|A4E4z8|"));
    await press(undoButton(page));
    expect(await scoreText(page, press)).toBe(score);
  });

  test("Instrumental version adds Ins to a Vocal-only score and undoes to the exact text", async ({
    page,
    harness,
    press,
  }) => {
    const source = vocalOnly('z8C8-|C8z8|"G"z16|');
    await harness.mount({ score: { text: source } });
    await openPanel(page, press);
    await press(tool(page, "Instrumental version"));
    await expect(status(page)).toContainText("Preview: 1 Vocal note move to Ins");
    await press(applyButton(page));
    await expect(status(page)).toContainText("Applied. 1 Vocal note moved to Ins");
    await press(closeButton(page));
    expect(await scoreText(page, press)).toBe(`X:1
T:
M:4/4
L:1/16
Q:1/4=100
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% a
V: Vocal
z16|z16|"G"z16|
V: Ins
z8C8-|C8z8|z16|
`);
    await press(undoButton(page));
    expect(await scoreText(page, press)).toBe(source);
  });

  test("the real two-voice score moves to Ins and comes back exactly", async ({ page, harness, press }) => {
    const real = await page.evaluate(() =>
      fetch("/packages/score-editor/skills/score-editor/assets/edit-one-bar/score.abc").then((response) =>
        response.text(),
      ),
    );
    await harness.mount({ score: { text: real } });
    await openPanel(page, press);
    await press(tool(page, "Instrumental version"));
    await expect(status(page)).toContainText("Vocal notes move to Ins");
    await press(applyButton(page));
    await press(closeButton(page));
    const applied = await scoreText(page, press);
    expect(applied).not.toBe(real);
    expect(applied).toContain("V: Ins");
    await press(undoButton(page));
    expect(await scoreText(page, press)).toBe(real);
  });

  test("the panel names both tools and their results in Chinese", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: TWO_VOICES("C4D4E4F4|G16|", "Z|Z|") }, language: "zh" });
    await openPanel(page, press, "工具");
    await expect(panel(page, "工具").getByRole("heading", { name: "变换", exact: true })).toBeVisible();
    await press(tool(page, "人声移八度", "工具"));
    await expect(status(page, "工具")).toContainText("中位音高 E5");
    await press(tool(page, "转器乐版", "工具"));
    await expect(status(page, "工具")).toContainText("人声部音符");
  });
});

// ABOUTME: Seam 5 for the Tools panel: every note tool opens, previews, applies and undoes, a custom tool does the same, and a breaking one is refused.
// ABOUTME: Desktop and phone projects; the phone opens the panel as a bottom sheet and drives it with a finger.
import type { Locator, Page } from "@playwright/test";
import { expect, test, vocalOnly } from "./fixtures";

const TOOLBAR = (page: Page) => page.locator(".sce-toolbar");
const toolsButton = (page: Page, name = "Tools") => TOOLBAR(page).getByRole("button", { name, exact: true });
const undoButton = (page: Page) => TOOLBAR(page).getByRole("button", { name: "Undo", exact: true });
const selectButton = (page: Page) => TOOLBAR(page).getByRole("button", { name: "Select", exact: true });
const selectAllItem = (page: Page) => TOOLBAR(page).getByRole("menuitem", { name: "Select all", exact: true });
const gridButton = (page: Page) => TOOLBAR(page).getByRole("button", { name: /^Grid: / });
const panel = (page: Page, name = "Tools") => page.getByRole("dialog", { name, exact: true });
const status = (page: Page, name = "Tools") => panel(page, name).getByRole("status");
const tool = (page: Page, name: string, panelName = "Tools") =>
  panel(page, panelName).getByRole("button", { name, exact: true });
const applyButton = (page: Page, name = "Apply") => panel(page, "Tools").getByRole("button", { name, exact: true });
const closeButton = (page: Page, name = "Close") => panel(page).getByRole("button", { name, exact: true });
const lane = (page: Page) => page.locator(".sce-lane").first();
const ghosts = (page: Page) => page.locator(".sce-ghost");
const textBox = (page: Page) => page.getByRole("textbox", { name: "Score text", exact: true });
const viewButton = (page: Page, name: string) => TOOLBAR(page).getByRole("button", { name, exact: true });

const QUARTERS = vocalOnly("C4D4E4F4|G16|");

type Press = (target: Locator, position?: { x: number; y: number }) => Promise<void>;

/** Selects every note the way this project does: Ctrl+A with a keyboard, the Select menu with a finger. */
async function selectAll(page: Page, press: Press, isMobile: boolean) {
  await press(lane(page));
  if (isMobile) {
    await press(selectButton(page));
    await press(selectAllItem(page));
  } else {
    await page.keyboard.press("Control+a");
  }
  await expect(page.locator('[aria-label="Vocal"] [role="listitem"][data-selected]').first()).toBeVisible();
}

/** The project's score text, read the way a person reads it: the text view, then back to the arrangement. */
async function scoreText(page: Page, press: Press): Promise<string> {
  await press(viewButton(page, "Score text"));
  const text = await textBox(page).inputValue();
  await press(viewButton(page, "Arrangement"));
  return text;
}

/** Selects only the first note of Vocal, for a tool whose result all notes would cancel out. */
async function selectFirst(page: Page, press: Press) {
  await press(page.locator('[aria-label="Vocal"] [role="listitem"]').first());
  await expect(page.locator('[aria-label="Vocal"] [role="listitem"][data-selected]').first()).toBeVisible();
}

/** Opens the Tools panel and waits for it. */
async function openPanel(page: Page, press: Press) {
  await press(toolsButton(page));
  await expect(panel(page)).toBeVisible();
}

/** Chooses a grid from the toolbar's Grid menu. */
async function setGrid(page: Page, press: Press, name: string) {
  await press(gridButton(page));
  await press(TOOLBAR(page).getByRole("menuitemradio", { name, exact: true }));
}

interface Case {
  readonly name: string;
  readonly score?: string;
  /** Whether the case selects only the first note instead of every note. */
  readonly first?: boolean;
  /** What the case does before it opens the panel, such as setting the grid or the insertion point. */
  readonly before?: (page: Page, press: Press, isMobile: boolean) => Promise<void>;
  /** What the case does after the panel opens, such as changing a declared parameter. */
  readonly setup?: (page: Page, press: Press) => Promise<void>;
}

const CASES: ReadonlyArray<Case> = [
  { name: "Reverse" },
  { name: "Chop on the grid", before: (page, press) => setGrid(page, press, "1/8") },
  { name: "Join same pitch", score: vocalOnly("C4C4D4E4|G16|") },
  { name: "Legato", score: vocalOnly("C4z4D4E4|G16|") },
  { name: "Flip up and down" },
  { name: "Snap to key", score: vocalOnly("^F4E4D4C4|G16|") },
  { name: "Length ×2", first: true },
  { name: "Length ÷2" },
  {
    name: "Set length",
    setup: async (page, press) => {
      await press(tool(page, "Set length"));
      await panel(page).getByRole("combobox", { name: "Length", exact: true }).selectOption("1/8");
      await panel(page).getByRole("button", { name: "Set length", exact: true }).click();
    },
  },
  {
    name: "Fit into bars",
    setup: async (page, press) => {
      await press(tool(page, "Fit into bars"));
      await panel(page).getByRole("spinbutton", { name: "First bar", exact: true }).fill("1");
      await panel(page).getByRole("spinbutton", { name: "Last bar", exact: true }).fill("1");
      await panel(page).getByRole("button", { name: "Fit into bars", exact: true }).click();
    },
  },
  {
    name: "Split at the insertion point",
    before: async (page, press, isMobile) => {
      await setGrid(page, press, "1/8");
      // The insertion point goes to 1.5 beats, the middle of D, on the 1/8 grid: Home, then three steps right.
      await page.keyboard.press("Escape");
      await page.keyboard.press("Home");
      for (let step = 0; step < 3; step += 1) await page.keyboard.press("ArrowRight");
      // Select again without touching the lane: a click there would move the insertion point off 1.5 beats.
      if (isMobile) {
        await press(selectButton(page));
        await press(selectAllItem(page));
      } else {
        await page.keyboard.press("Control+a");
      }
    },
  },
];

test.describe("the Tools panel", () => {
  test("opens from the toolbar and lists every note tool in the spec's group", async ({ page, harness, press }) => {
    await harness.mount();
    await openPanel(page, press);

    await expect(panel(page).getByRole("heading", { name: "Note tools", exact: true })).toBeVisible();
    for (const { name } of CASES) await expect(tool(page, name)).toBeVisible();
    await expect(status(page)).toHaveText("Choose a tool.");
  });

  test("draws each control a tool declares, with the declaration's default", async ({ page, harness, press }) => {
    await harness.mount();
    await openPanel(page, press);

    await press(tool(page, "Set length"));
    const length = panel(page).getByRole("combobox", { name: "Length", exact: true });
    await expect(length).toHaveValue("1/4");
    await expect(length.locator("option")).toHaveText(["1/1", "1/2", "1/4", "1/8", "1/16", "1/32"]);

    await press(tool(page, "Fit into bars"));
    await expect(panel(page).getByRole("spinbutton", { name: "First bar", exact: true })).toHaveValue("1");
    await expect(panel(page).getByRole("spinbutton", { name: "Last bar", exact: true })).toHaveValue("1");

    await press(tool(page, "Reverse"));
    const reverse = panel(page).locator(".sce-tool-entry").filter({ hasText: "Reverse" });
    await expect(reverse.locator("input, select")).toHaveCount(0);
  });

  test("previews in the arrangement as outlines, and takes them down when it closes", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);
    await press(tool(page, "Reverse"));

    await expect(status(page)).toContainText("5 notes would change");
    await expect(ghosts(page)).toHaveCount(5);
    await press(closeButton(page));
    await expect(panel(page)).toBeHidden();
    await expect(ghosts(page)).toHaveCount(0);
  });

  test("is an editing control: no button while read-only", async ({ page, harness }) => {
    await harness.mount({ editable: false });
    await expect(page.locator(".sce-toolbar")).toBeVisible();
    await expect(toolsButton(page)).toHaveCount(0);
  });

  test("follows the session's language", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await selectAll(page, press, false);
    await harness.update({ language: "zh" });

    await press(toolsButton(page, "工具"));
    await expect(panel(page, "工具")).toBeVisible();
    await expect(panel(page, "工具").getByRole("heading", { name: "音符工具", exact: true })).toBeVisible();
    await expect(panel(page, "工具").getByRole("button", { name: "应用", exact: true })).toBeVisible();
    await press(tool(page, "倒序", "工具"));
    await expect(status(page, "工具")).toContainText("预览");
  });
});

test.describe("every note tool", () => {
  test.setTimeout(60_000);

  for (const example of CASES) {
    test(`${example.name} previews, applies as one undo step, and undoes`, async ({ page, harness, press }) => {
      const isMobile = test.info().project.name === "phone";
      const score = example.score ?? QUARTERS;
      await harness.mount({ score: { text: score } });
      if (example.first === true) await selectFirst(page, press);
      else await selectAll(page, press, isMobile);
      if (example.before !== undefined) await example.before(page, press, isMobile);
      await openPanel(page, press);
      if (example.setup !== undefined) await example.setup(page, press);
      await press(tool(page, example.name));

      await expect(status(page)).toContainText("Preview:");
      await expect(ghosts(page).first()).toBeVisible();
      await press(applyButton(page));
      await expect(status(page)).toContainText("Applied.");
      await press(closeButton(page));

      const applied = await scoreText(page, press);
      expect(applied).not.toBe(score);
      await press(undoButton(page));
      expect(await scoreText(page, press)).toBe(score);
    });
  }
});

test.describe("update({ tools })", () => {
  test("rebuilds the panel's list and closes it when the tool it showed is gone", async ({ page, harness, press }) => {
    await harness.mount({ tools: "safe" });
    await openPanel(page, press);
    await press(tool(page, "Rest the last note"));
    await expect(panel(page).getByRole("spinbutton", { name: "How many", exact: true })).toBeVisible();

    await harness.update({ tools: "breaking" });

    await expect(panel(page)).toBeHidden();
    await press(toolsButton(page));
    await expect(tool(page, "Off the grid")).toBeVisible();
    await expect(tool(page, "Rest the last note")).toHaveCount(0);
    await expect(panel(page).getByRole("heading", { name: "More tools", exact: true })).toBeVisible();
    await press(tool(page, "Off the grid"));

    await harness.update({ tools: "none" });
    await expect(panel(page)).toBeHidden();
    await press(toolsButton(page));
    await expect(panel(page).getByRole("heading", { name: "More tools", exact: true })).toHaveCount(0);
    await expect(panel(page).getByRole("heading", { name: "Note tools", exact: true })).toBeVisible();
  });
});

test.describe("a real score", () => {
  test("previews and applies a tool on a two-voice score with Z runs, then undoes it", async ({
    page,
    harness,
    press,
  }) => {
    const real = await page.evaluate(() =>
      fetch("/packages/score-editor/skills/score-editor/assets/edit-one-bar/score.abc").then((response) =>
        response.text(),
      ),
    );
    expect(real).toContain("V: Ins");
    expect(real).toMatch(/Z[234]/);
    await harness.mount({ score: { text: real } });
    await selectAll(page, press, test.info().project.name === "phone");
    // The score is written in 1/16; the tools land on the grid in force, so the test sets it as a person would.
    await setGrid(page, press, "1/16");
    await openPanel(page, press);
    await press(tool(page, "Reverse"));

    await expect(status(page)).toContainText("Preview:");
    await expect(ghosts(page).first()).toBeVisible();
    await press(applyButton(page));
    await expect(status(page)).toContainText("Applied.");
    await press(closeButton(page));

    const applied = await scoreText(page, press);
    expect(applied).not.toBe(real);
    expect(applied).toContain("V: Ins");
    await press(undoButton(page));
    expect(await scoreText(page, press)).toBe(real);
  });
});

test.describe("a custom tool", () => {
  test("appears in the panel, takes its declared parameters, previews, applies and undoes", async ({
    page,
    harness,
    press,
  }) => {
    const score = QUARTERS;
    await harness.mount({ score: { text: score }, tools: "safe" });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);

    await expect(panel(page).getByRole("heading", { name: "More tools", exact: true })).toBeVisible();
    await press(tool(page, "Rest the last note"));
    const count = panel(page).getByRole("spinbutton", { name: "How many", exact: true });
    await count.fill("2");
    await expect(status(page)).toContainText("2 notes would change");
    await press(applyButton(page));
    await expect(status(page)).toContainText("Applied.");
    await press(closeButton(page));

    expect(await scoreText(page, press)).toBe(vocalOnly("C4D4E4z4|z16|"));
    await press(undoButton(page));
    expect(await scoreText(page, press)).toBe(score);
  });

  test("one whose result breaks the rules is stopped, the score unchanged", async ({ page, harness, press }) => {
    const score = QUARTERS;
    await harness.mount({ score: { text: score }, tools: "breaking" });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);
    await press(tool(page, "Off the grid"));

    await expect(status(page)).toContainText("off the grid");
    await expect(ghosts(page)).toHaveCount(0);
    await press(applyButton(page));
    await expect(status(page)).toContainText("off the grid");
    await press(closeButton(page));
    expect(await scoreText(page, press)).toBe(score);
    await expect(undoButton(page)).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("the panel on a phone", () => {
  test("opens as a bottom sheet that leaves the roll in view above it", async ({ page, harness, press }) => {
    test.skip(test.info().project.name !== "phone", "the bottom sheet is the phone project's");
    await harness.mount();
    await openPanel(page, press);
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error("the page has no viewport");
    const box = await panel(page).boundingBox();
    if (box === null) throw new Error("the panel is not drawn");

    expect(box.x).toBeCloseTo(0, 0);
    expect(box.width).toBeCloseTo(viewport.width, 0);
    expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
    expect(box.height).toBeLessThanOrEqual(viewport.height * 0.75 + 1);
    expect(box.y).toBeGreaterThan(0);
    await expect(page.locator(".sce-scroller")).toBeVisible();
  });
});

test.describe("the panel as a view part", () => {
  test("mounts on a host's own layout and leaves nothing behind, previews included", async ({
    page,
    harness,
    press,
  }) => {
    await harness.layout.open({ parts: ["toolbar", "vocal", "tools"] });
    const slot = page.locator('[data-slot="tools"]');
    await press(slot.getByRole("button", { name: "Tools", exact: true }));
    await expect(panel(page).getByRole("heading", { name: "More tools", exact: true })).toBeVisible();
    await press(panel(page).getByRole("button", { name: "Close", exact: true }));

    await page.locator(".sce-lane").click();
    await page.keyboard.press("Control+a");
    await press(slot.getByRole("button", { name: "Tools", exact: true }));
    await press(tool(page, "Reverse"));
    await expect(ghosts(page).first()).toBeVisible();

    await harness.layout.destroyPart("tools", 2);
    await expect(slot.locator("*")).toHaveCount(0);
    await expect(ghosts(page)).toHaveCount(0);
  });
});

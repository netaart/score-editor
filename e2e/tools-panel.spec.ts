// ABOUTME: Seam 5 for the Tools panel: every note tool opens, previews, applies and undoes, a custom tool does the same, and a breaking one is refused.
// ABOUTME: Desktop and phone projects; the phone opens the panel as a bottom sheet and drives it with a finger.
import type { Locator, Page } from "@playwright/test";
import { box, expect, test, vocalOnly } from "./fixtures";

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

/** Mounts the skill's real two-voice score, selects all of it and sets the grid the score is written in. */
async function mountRealScore(
  page: Page,
  harness: { mount(options?: Record<string, unknown>): Promise<void> },
  press: Press,
  isMobile: boolean,
) {
  const real = await page.evaluate(() =>
    fetch("/packages/score-editor/skills/score-editor/assets/edit-one-bar/score.abc").then((response) =>
      response.text(),
    ),
  );
  await harness.mount({ score: { text: real } });
  await selectAll(page, press, isMobile);
  await setGrid(page, press, "1/16");
  return real;
}

/** The DESIGN floor as pixels, read by a probe so its calc() resolves the way the layout uses it. */
async function floorOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const editor = document.querySelector(".sce-editor");
    if (editor === null) throw new Error("no editor");
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:var(--sce-_floor,190px);width:0";
    editor.appendChild(probe);
    const floor = probe.getBoundingClientRect().height;
    probe.remove();
    return floor;
  });
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
      await panel(page).getByRole("spinbutton", { name: "From bar", exact: true }).fill("1");
      await panel(page).getByRole("spinbutton", { name: "To bar", exact: true }).fill("1");
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
    await expect(status(page)).toHaveText("Select notes, then choose a tool.");
    await expect(panel(page)).not.toContainText("key in force");
    await expect(panel(page)).not.toContainText("next note of its voice");
    await expect(panel(page)).not.toContainText("a run of bars");

    await press(tool(page, "Reverse"));
    await expect(status(page)).toHaveText("Select notes first.");
  });

  test("draws each control a tool declares, with the declaration's default", async ({ page, harness, press }) => {
    await harness.mount();
    await openPanel(page, press);

    await press(tool(page, "Set length"));
    const length = panel(page).getByRole("combobox", { name: "Length", exact: true });
    await expect(length).toHaveValue("1/4");
    await expect(length.locator("option")).toHaveText(["1/1", "1/2", "1/4", "1/8", "1/16", "1/32"]);

    await press(tool(page, "Fit into bars"));
    await expect(panel(page).getByRole("spinbutton", { name: "From bar", exact: true })).toHaveValue("1");
    await expect(panel(page).getByRole("spinbutton", { name: "To bar", exact: true })).toHaveValue("1");

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

test.describe("the phone sheet leaves the music in view", () => {
  for (const [width, height] of [
    [412, 839],
    [320, 700],
  ] as const) {
    test(`keeps the floor of music at ${width} and brings a preview outline into it`, async ({
      page,
      harness,
      press,
    }) => {
      test.skip(test.info().project.name !== "phone", "the bottom sheet is the phone project's");
      await page.setViewportSize({ width, height });
      await mountRealScore(page, harness, press, true);
      await openPanel(page, press);
      await press(tool(page, "Reverse"));
      const floor = await floorOf(page);
      const seen = await page.evaluate(() => {
        const pick = (selector: string) => {
          const found = document.querySelector(selector);
          if (!(found instanceof HTMLElement)) throw new Error(`no ${selector}`);
          return found.getBoundingClientRect();
        };
        const toolbar = pick(".sce-toolbar");
        const chrome = pick(".sce-chrome");
        const panel = pick(".sce-tool-panel");
        const scroller = pick(".sce-scroller");
        const band = {
          left: scroller.left,
          top: Math.max(scroller.top, chrome.bottom),
          right: scroller.right,
          bottom: Math.min(scroller.bottom, panel.top),
        };
        const ghosts = [...document.querySelectorAll(".sce-ghost")].map((ghost) => ghost.getBoundingClientRect());
        return {
          toolbarBottom: toolbar.bottom,
          panelTop: panel.top,
          panelBottom: panel.bottom,
          band,
          footerDirection: getComputedStyle(document.querySelector(".sce-tool-footer") as HTMLElement).flexDirection,
          inBand: ghosts.filter(
            (ghost) =>
              ghost.left >= band.left &&
              ghost.right <= band.right &&
              ghost.top >= band.top &&
              ghost.bottom <= band.bottom,
          ).length,
        };
      });

      expect(seen.band.bottom - seen.band.top).toBeGreaterThanOrEqual(floor - 1);
      expect(seen.panelTop).toBeGreaterThan(seen.toolbarBottom);
      expect(seen.panelBottom).toBeCloseTo(height, 0);
      expect(seen.inBand).toBeGreaterThan(0);
      expect(seen.footerDirection).toBe("row");
    });
  }
});

test.describe("the desktop panel stays below the toolbar", () => {
  test("leaves the toolbar uncovered and a 96-note preview in the arrangement left of it", async ({
    page,
    harness,
    press,
  }) => {
    test.skip(test.info().project.name !== "desktop", "the desktop panel is the desktop project's");
    const real = await mountRealScore(page, harness, press, false);
    expect(real).toContain("V: Ins");
    await openPanel(page, press);
    await press(tool(page, "Reverse"));

    const seen = await page.evaluate(() => {
      const pick = (selector: string) => {
        const found = document.querySelector(selector);
        if (!(found instanceof HTMLElement)) throw new Error(`no ${selector}`);
        return found.getBoundingClientRect();
      };
      const toolbar = pick(".sce-toolbar");
      const panel = pick(".sce-tool-panel");
      const scroller = pick(".sce-scroller");
      const band = { left: scroller.left, top: scroller.top, right: panel.left - 16, bottom: scroller.bottom };
      const ghosts = [...document.querySelectorAll(".sce-ghost")].map((ghost) => ghost.getBoundingClientRect());
      return {
        toolbarBottom: toolbar.bottom,
        panelTop: panel.top,
        panelTopAtEdge: panel.top === 8,
        inBand: ghosts.filter(
          (ghost) =>
            ghost.left >= band.left &&
            ghost.right <= band.right &&
            ghost.top >= band.top &&
            ghost.bottom <= band.bottom,
        ).length,
        inSight: ghosts.filter(
          (ghost) => ghost.left >= 0 && ghost.right <= innerWidth && ghost.top >= 0 && ghost.bottom <= innerHeight,
        ).length,
      };
    });

    expect(seen.panelTop).toBeGreaterThanOrEqual(seen.toolbarBottom + 7);
    expect(seen.panelTopAtEdge).toBe(false);
    expect(seen.inBand).toBeGreaterThan(0);
    expect(seen.inSight).toBeGreaterThan(0);
  });
});

test.describe("a review pass on the panel", () => {
  test("every tool description fits one line at the panel's width in both languages", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS }, tools: "both" });
    await openPanel(page, press);
    for (const language of ["en", "zh"] as const) {
      await harness.update({ language });
      if (!(await panel(page, language === "zh" ? "工具" : "Tools").isVisible())) {
        await press(page.getByRole("button", { name: language === "zh" ? "工具" : "Tools", exact: true }));
      }
      const heights = await panel(page, language === "zh" ? "工具" : "Tools")
        .locator(".sce-tool-description")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const style = getComputedStyle(element);
            return { height: element.getBoundingClientRect().height, line: Number.parseFloat(style.lineHeight) };
          }),
        );
      expect(heights.length).toBeGreaterThan(10);
      for (const line of heights) expect(line.height).toBeLessThanOrEqual(line.line * 1.4);
      await expect(panel(page, language === "zh" ? "工具" : "Tools")).toContainText(
        language === "zh" ? "高音变低音" : "the highest becomes the lowest",
      );
    }
  });

  test("the Filter panel also starts below the toolbar", async ({ page, harness, press }) => {
    await harness.mount();
    await press(page.getByRole("button", { name: "Filter", exact: true }));
    const seen = await page.evaluate(() => {
      const toolbar = document.querySelector(".sce-toolbar") as HTMLElement;
      const filter = document.querySelector(".sce-filter-panel") as HTMLElement;
      return { toolbarBottom: toolbar.getBoundingClientRect().bottom, filterTop: filter.getBoundingClientRect().top };
    });
    expect(seen.filterTop).toBeGreaterThanOrEqual(seen.toolbarBottom + 7);
    await page.keyboard.press("Escape");
  });

  test("a pointer opens a tool without taking the focus, and a keyboard opens it into the first control", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);
    const row = tool(page, "Set length");
    await press(row);
    const length = panel(page).getByRole("combobox", { name: "Length", exact: true });
    await expect(length).not.toBeFocused();

    await row.focus();
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(length).toBeFocused();
  });

  test("a number gets step buttons on a coarse pointer, and typing outside the declaration is still refused", async ({
    page,
    harness,
    press,
  }) => {
    const isMobile = test.info().project.name === "phone";
    await harness.mount({ score: { text: QUARTERS }, tools: "safe" });
    await selectAll(page, press, isMobile);
    await openPanel(page, press);
    await press(tool(page, "Rest the last note"));
    const count = panel(page).getByRole("spinbutton", { name: "How many", exact: true });
    const minus = panel(page).getByRole("button", { name: "Decrease How many", exact: true });
    const plus = panel(page).getByRole("button", { name: "Increase How many", exact: true });

    if (!isMobile) {
      await expect(minus).toBeHidden();
      await expect(plus).toBeHidden();
      return;
    }
    await expect(plus).toBeVisible();
    expect((await box(plus)).height).toBeGreaterThanOrEqual(40);
    await press(plus);
    await expect(count).toHaveValue("2");
    await press(plus);
    await expect(count).toHaveValue("3");
    await press(plus);
    await expect(count).toHaveValue("3");
    await press(minus);
    await expect(count).toHaveValue("2");

    await count.fill("99");
    await expect(status(page)).toContainText("between 1 and 3");
  });

  test("a dashed outline carries a one-pixel ground halo, kept in forced colours", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);
    await press(tool(page, "Reverse"));
    const ghost = ghosts(page).first();
    await expect(ghost).toBeVisible();
    const shadow = await ghost.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(shadow).not.toBe("none");
    expect(shadow).toContain("0px 0px 0px 1px");

    await page.emulateMedia({ forcedColors: "active" });
    const forced = await ghost.evaluate((element) => {
      const style = getComputedStyle(element);
      return { border: style.borderTopColor, shadow: style.boxShadow };
    });
    expect(forced.border).not.toBe("");
    expect(forced.shadow).not.toBe("");
    await page.emulateMedia({ forcedColors: "none" });
  });

  test("the refusal names the tool as the list does and says how to recover", async ({ page, harness, press }) => {
    const score = QUARTERS;
    await harness.mount({ score: { text: score }, tools: "breaking" });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);
    await press(tool(page, "Off the grid"));

    await expect(status(page)).toContainText("Off the grid");
    await expect(status(page)).toContainText("Nothing changed. Try another value or grid.");
    await expect(status(page)).not.toContainText("off-grid");
  });

  test("Apply with no tool chosen answers in the status line", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);
    await press(applyButton(page));
    await expect(status(page)).toHaveText("Choose a tool first.");
  });

  test("the opened tool's last control is inside the body and clear of the footer", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS }, tools: "both" });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);
    await press(tool(page, "Many values"));
    const last = panel(page).getByRole("spinbutton", { name: "Value 6", exact: true });
    const seen = await page.evaluate(() => {
      const body = document.querySelector(".sce-tool-body") as HTMLElement;
      const footer = document.querySelector(".sce-tool-footer") as HTMLElement;
      return {
        body: body.getBoundingClientRect().toJSON(),
        footer: footer.getBoundingClientRect().toJSON(),
        bodyScrollTop: body.scrollTop,
      };
    });
    const lastBox = await box(last);
    expect(lastBox.y).toBeGreaterThanOrEqual(seen.body.y - 1);
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(seen.body.y + seen.body.height + 1);
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(seen.footer.y + 1);
    expect(seen.bodyScrollTop).toBeGreaterThanOrEqual(0);
  });

  test("group headings stay at the top of the body while it scrolls, More tools included", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS }, tools: "both" });
    await openPanel(page, press);
    await panel(page)
      .locator(".sce-tool-body")
      .evaluate(() => {
        const heading = [...document.querySelectorAll(".sce-tool-group-name")].find(
          (found) => found.textContent === "More tools",
        ) as HTMLElement;
        heading.scrollIntoView({ block: "start" });
      });
    const more = panel(page).getByRole("heading", { name: "More tools", exact: true });
    await expect(more).toBeVisible();
    const seen = await page.evaluate(() => {
      const body = document.querySelector(".sce-tool-body") as HTMLElement;
      const heading = [...document.querySelectorAll(".sce-tool-group-name")].find(
        (found) => found.textContent === "More tools",
      ) as HTMLElement;
      return {
        bodyTop: body.getBoundingClientRect().top,
        bodyBottom: body.getBoundingClientRect().bottom,
        headingTop: heading.getBoundingClientRect().top,
        position: getComputedStyle(heading).position,
      };
    });
    expect(seen.position).toBe("sticky");
    expect(seen.headingTop).toBeGreaterThanOrEqual(seen.bodyTop - 10);
    expect(seen.headingTop).toBeLessThan(seen.bodyBottom);
    await expect(tool(page, "Off the grid")).toBeVisible();
  });

  test("the description is part of what a screen reader hears, without replacing the name", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await openPanel(page, press);
    const row = tool(page, "Reverse");
    await expect(row).toHaveAccessibleName("Reverse");
    await expect(row).toHaveAccessibleDescription("Turn the selected notes back to front in time.");
    await expect(row).toHaveAttribute("aria-describedby", /.+/);
  });

  test("the open row shows a down chevron, a closed one a right chevron", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await openPanel(page, press);
    const row = tool(page, "Reverse");
    const closed = await row.evaluate((element) => getComputedStyle(element, "::after").transform);
    await press(row);
    const open = await row.evaluate((element) => getComputedStyle(element, "::after").transform);
    expect(closed).not.toBe(open);
    expect(closed).not.toBe("none");
    expect(open).not.toBe("none");
  });

  test("Apply wears the shared primary look", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await openPanel(page, press);
    const seen = await applyButton(page).evaluate((element) => {
      const style = getComputedStyle(element);
      return { weight: style.fontWeight, border: style.borderTopColor, background: style.backgroundColor };
    });
    await expect(applyButton(page)).toHaveClass(/sce-picker-primary/);
    expect(seen.weight).toBe("600");
    expect(seen.border).not.toBe(seen.background);
  });

  test("the live region speaks on a committed value, Apply and a refusal, not on every keystroke", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);
    await press(tool(page, "Fit into bars"));
    const live = panel(page).locator(".sce-tool-live");
    const from = panel(page).getByRole("spinbutton", { name: "From bar", exact: true });
    await live.evaluate((element) => {
      element.textContent = "";
    });
    await from.fill("2");
    await expect(live).toHaveText("");
    await from.blur();
    await expect(live).not.toHaveText("");
    await press(applyButton(page));
    await expect(live).toContainText("Applied. Undo takes it back.");
  });

  test("every field reach a 3:1 border against its ground, in light and dark", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await openPanel(page, press);
    await press(tool(page, "Fit into bars"));
    const contrastOf = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          const probe = document.createElement("div");
          const resolve = (color: string) => {
            probe.style.color = color;
            document.body.appendChild(probe);
            const resolved = getComputedStyle(probe).color;
            probe.remove();
            return resolved;
          };
          const channels = (color: string): [number, number, number] => {
            const srgb = color.match(/color\(srgb ([^)]+)\)/);
            if (srgb !== null) {
              const parts = (srgb[1] as string).split(/[\s/]+/).map((part) => Number.parseFloat(part) * 255);
              return [parts[0] as number, parts[1] as number, parts[2] as number];
            }
            const match = resolve(color).match(/rgba?\(([^)]+)\)/);
            if (match === null) throw new Error(`unreadable colour ${color}`);
            const parts = (match[1] as string).split(",").map((part) => Number.parseFloat(part));
            return [parts[0] as number, parts[1] as number, parts[2] as number];
          };
          const luminance = (color: string): number => {
            const [r, g, b] = channels(color).map((value) => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            }) as [number, number, number];
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const a = luminance(style.borderTopColor);
          const b = luminance(style.backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const selector of [".sce-tool-number", ".sce-key-select", ".sce-tempo-input"]) {
        expect(await contrastOf(selector)).toBeGreaterThanOrEqual(3);
      }
      await press(TOOLBAR(page).getByRole("button", { name: "Project", exact: true }));
      expect(await contrastOf(".sce-panel-style")).toBeGreaterThanOrEqual(3);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Project" })).toBeHidden();
      await press(page.getByRole("button", { name: "Filter", exact: true }));
      expect(await contrastOf(".sce-filter-number")).toBeGreaterThanOrEqual(3);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Filter" })).toBeHidden();
    }
  });
});

test.describe("Fit into bars starts at the selection", () => {
  test("its two bars are the first and last bar of the selected notes", async ({ page, harness, press }) => {
    await harness.mount({ score: { text: QUARTERS } });
    await selectAll(page, press, test.info().project.name === "phone");
    await openPanel(page, press);
    await press(tool(page, "Fit into bars"));
    await expect(panel(page).getByRole("spinbutton", { name: "From bar", exact: true })).toHaveValue("1");
    await expect(panel(page).getByRole("spinbutton", { name: "To bar", exact: true })).toHaveValue("2");
  });
});

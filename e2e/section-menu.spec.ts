// ABOUTME: Seam 5 for the section menu: a band of the time ruler opens a menu, each choice is one command and one undo step, and a choice that cannot be done says why.
// ABOUTME: Each case runs with a mouse on the desktop project and with a finger on the phone project; the keyboard cases run on both.
import type { Locator, Page } from "@playwright/test";
import { box, expect, type Harness, test } from "./fixtures";

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);

const HEAD = [
  "X:1",
  "T:",
  "M:4/4",
  "L:1/16",
  "Q:1/4=100",
  'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
  "K:C",
];
const music = (...lines: string[]) => lines.flatMap((line) => ["V: Vocal", line]);

/** Two unnamed bars (C C), a verse of three (D E F) and a chorus of two (G A), one whole note to a bar. */
const SONG = [
  ...HEAD,
  ...music("C16|C16|"),
  "% verse",
  ...music("D16|E16|F16|"),
  "% chorus",
  ...music("G16|A16|"),
  "",
].join("\n");

/** The same song with no music before its first marker: a verse (D E) and a chorus (G A). */
const NAMED = [...HEAD, "% verse", ...music("D16|E16|"), "% chorus", ...music("G16|A16|"), ""].join("\n");

/** A verse and a chorus whose second bar stops in the middle. */
const CUT = [...HEAD, "% verse", ...music("D16|E16|"), "% chorus", ...music("G16|A8"), ""].join("\n");

/** One section of one bar. */
const ONLY = [...HEAD, "% a", ...music("C16|"), ""].join("\n");

const bandNames = (page: Page) => slot(page, "ruler").getByRole("list", { name: "Sections" }).getByRole("listitem");
const bandButton = (page: Page, name: string) => slot(page, "ruler").getByRole("button", { name, exact: true });
const menu = (page: Page, name: string) => page.getByRole("menu", { name, exact: true });
const choice = (page: Page, menuName: string, label: string) =>
  menu(page, menuName).getByRole("menuitem", { name: label, exact: true });
const voiceNotes = (page: Page) => slot(page, "vocal").getByRole("list", { name: "Vocal" }).getByRole("listitem");
const said = (page: Page) => slot(page, "ruler").getByRole("status");
const rulerRegion = (page: Page) => slot(page, "ruler").getByRole("region", { name: "Time ruler" });
const barNumber = (page: Page, number: string) =>
  slot(page, "ruler").getByRole("list", { name: "Bars" }).getByText(number, { exact: true });

/** The name form: a dialog named for what it does, with its fields, its refusal line and its two buttons. */
const form = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });
const nameField = (page: Page, formName: string) => form(page, formName).getByRole("textbox", { name: "Name" });
const barField = (page: Page, formName: string) => form(page, formName).getByRole("textbox", { name: "Bar" });
const refusalLine = (page: Page, formName: string) => form(page, formName).getByRole("alert");
const formButton = (page: Page, formName: string, label: string) =>
  form(page, formName).getByRole("button", { name: label, exact: true });

/** Opens the ruler and the Vocal track on one session, zoomed out so that a phone shows several bands. */
async function openSong(harness: Harness, score: string = SONG, options: Record<string, unknown> = {}) {
  await harness.layout.open({ score: { text: score }, parts: ["ruler", "vocal"], ...options });
  await harness.layout.setView({ zoom: 0.4 });
}

/** Presses a choice that is muted: a finger or a mouse may press it, though Playwright would refuse to. */
function pressMuted(target: Locator, isMobile: boolean) {
  return isMobile ? target.tap({ force: true }) : target.click({ force: true });
}

const MENU_ITEMS = [
  "Rename…",
  "Start a section at a bar…",
  "Move earlier",
  "Move later",
  "Duplicate",
  "Delete section",
];

test.describe("opening the menu of a section", () => {
  test("a band opens its menu with a click or a tap, and the first choice has the focus", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await expect(bandNames(page)).toHaveText(["Unnamed", "verse", "chorus"]);
    await expect(menu(page, "Section verse")).toBeHidden();

    await press(bandButton(page, "Section verse"));

    await expect(menu(page, "Section verse")).toBeVisible();
    const items = menu(page, "Section verse").getByRole("menuitem");
    await expect(items).toHaveCount(MENU_ITEMS.length);
    for (const [at, words] of MENU_ITEMS.entries()) await expect(items.nth(at)).toHaveAccessibleName(words);
    await expect(choice(page, "Section verse", "Rename…")).toBeFocused();
  });

  test("a closed menu holds no choices, so the bands of a long song cost the page almost nothing until one is pressed", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    const everyChoice = page.getByRole("menuitem", { includeHidden: true });
    await expect(everyChoice).toHaveCount(0);
    await press(bandButton(page, "Section verse"));
    await expect(everyChoice).toHaveCount(MENU_ITEMS.length);
    await page.keyboard.press("Escape");
    await press(bandButton(page, "Section chorus"));
    await expect(everyChoice).toHaveCount(2 * MENU_ITEMS.length);
  });

  test("a press anywhere on the band opens it, also where the name is not", async ({ page, harness, press }) => {
    await openSong(harness);
    const band = await box(bandNames(page).nth(2));
    await press(bandButton(page, "Section chorus"), { x: band.width - 6, y: band.height / 2 });
    await expect(menu(page, "Section chorus")).toBeVisible();
  });

  test("a finger can press 12px above a band, which makes a target of at least 37px, and a mouse cannot", async ({
    page,
    harness,
    isMobile,
  }) => {
    await openSong(harness);
    const band = await box(bandButton(page, "Section verse"));
    // WCAG 2.5.8 (AA) asks for 24 by 24 CSS pixels; DESIGN.md asks 36px of a control on a coarse pointer. The row is
    // 25px and the ::before adds 12px above it, so the target is at least 37px.
    if (isMobile) expect(band.height).toBeGreaterThanOrEqual(24);
    const above = (offset: number) =>
      page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest(".sce-section-open")?.getAttribute("aria-label") ?? null,
        { x: band.x + band.width / 2, y: band.y - offset },
      );
    expect(await above(-4)).toBe("Section verse");
    expect(await above(10)).toBe(isMobile ? "Section verse" : null);
    expect(await above(14)).toBeNull();
  });

  test("the menu hangs under the pinned name of a band whose start is scrolled away", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await harness.layout.setView({ zoom: 1 });
    const verse = await box(bandNames(page).nth(1));
    const ruler = await box(slot(page, "ruler"));
    await harness.layout.setView({ scrollLeft: verse.x - ruler.x + 40 });
    await harness.frames(3);
    const name = await box(bandNames(page).nth(1).locator(".sce-section-name"));
    expect(name.x).toBeGreaterThanOrEqual(ruler.x - 1);
    expect(name.x).toBeLessThan(verse.x);

    await press(bandButton(page, "Section verse"), { x: 100, y: 8 });
    const open = await box(menu(page, "Section verse"));
    expect(Math.abs(open.x - name.x)).toBeLessThan(2);
  });

  test("a menu keeps its text width wherever it is placed", async ({ page, harness, press }) => {
    await openSong(harness);
    await press(bandButton(page, "Section chorus"));
    const near = await box(menu(page, "Section chorus"));
    await menu(page, "Section chorus").evaluate((el) => {
      el.style.left = "8px";
    });
    const roomy = await box(menu(page, "Section chorus"));
    expect(Math.abs(near.width - roomy.width)).toBeLessThan(1);
  });

  test("a menu with no room below the band stays in the window, and its last choice can be pressed", async ({
    page,
    harness,
    press,
  }) => {
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("the page has no viewport");
    const height = 520;
    await page.setViewportSize({ width: viewport.width, height });
    await openSong(harness);
    await press(bandButton(page, "Section verse"));

    const band = await box(bandButton(page, "Section verse"));
    const open = await box(menu(page, "Section verse"));
    expect(open.y).toBeGreaterThanOrEqual(8);
    expect(open.y + open.height).toBeLessThanOrEqual(height - 8 + 1);
    // The menu did not fit below the band, so it was put above it.
    expect(open.y + open.height).toBeLessThanOrEqual(band.y + 1);

    await press(choice(page, "Section verse", "Delete section"));
    await expect(bandNames(page)).toHaveText(["Unnamed", "chorus"]);
  });

  test("a band is not a Tab stop, so the Tab key still goes from the region to the notes", async ({
    page,
    harness,
  }) => {
    await openSong(harness);
    await expect(bandButton(page, "Section verse")).toHaveAttribute("tabindex", "-1");
    await rulerRegion(page).focus();
    await page.keyboard.press("Tab");
    await expect(slot(page, "vocal").getByRole("region", { name: "Vocal" })).toBeFocused();
  });

  test("the menu is named in the interface language", async ({ page, harness, press }) => {
    await openSong(harness, SONG, { language: "zh" });
    await press(bandButton(page, "段落 verse"));
    const items = menu(page, "段落 verse").getByRole("menuitem");
    for (const [at, words] of ["重命名…", "从某个小节另起一段…", "往前移", "往后移", "复制", "删除这一段"].entries()) {
      await expect(items.nth(at)).toHaveAccessibleName(words);
    }
    await page.keyboard.press("Escape");
    await expect(bandButton(page, "未命名段落")).toBeVisible();
  });
});

test.describe("what the menu does to the score", () => {
  test("Delete takes the section out as one step, and undo puts the score back as it was", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Delete section"));

    await expect(bandNames(page)).toHaveText(["Unnamed", "chorus"]);
    await expect(menu(page, "Section verse")).toBeHidden();
    // The two chorus bars now follow the two unnamed ones.
    await expect(voiceNotes(page)).toHaveCount(4);
    await expect(voiceNotes(page).nth(2)).toHaveAttribute("aria-label", /^G4, bar 3 beat 1/);
    await expect(said(page)).toHaveText("Deleted section “verse”");

    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(SONG);
    expect(await harness.layout.canUndo()).toBe(false);
    await expect(bandNames(page)).toHaveText(["Unnamed", "verse", "chorus"]);
  });

  test("Duplicate puts a copy of the section after it, and undo takes the copy away", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Duplicate"));

    await expect(bandNames(page)).toHaveText(["Unnamed", "verse", "verse", "chorus"]);
    await expect(voiceNotes(page)).toHaveCount(10);
    // The copy is bars 6 to 8 and the chorus follows it from bar 9.
    await expect(voiceNotes(page).nth(5)).toHaveAttribute("aria-label", /^D4, bar 6 beat 1/);
    await expect(voiceNotes(page).nth(8)).toHaveAttribute("aria-label", /^G4, bar 9 beat 1/);
    await expect(said(page)).toHaveText("Duplicated section “verse”");

    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(SONG);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("Move earlier and Move later swap the section with its neighbour, each as one step", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section chorus"));
    await press(choice(page, "Section chorus", "Move earlier"));

    await expect(bandNames(page)).toHaveText(["Unnamed", "chorus", "verse"]);
    await expect(voiceNotes(page).nth(2)).toHaveAttribute("aria-label", /^G4, bar 3 beat 1/);
    await expect(voiceNotes(page).nth(4)).toHaveAttribute("aria-label", /^D4, bar 5 beat 1/);
    await expect(said(page)).toHaveText("Moved section “chorus” earlier");
    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(SONG);

    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Move later"));
    await expect(bandNames(page)).toHaveText(["Unnamed", "chorus", "verse"]);
    await expect(said(page)).toHaveText("Moved section “verse” later");
    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(SONG);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("each choice is one step of the history: three choices, three undos", async ({ page, harness, press }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Duplicate"));
    await press(bandButton(page, "Section chorus"));
    await press(choice(page, "Section chorus", "Move earlier"));
    await press(bandButton(page, "Section chorus"));
    await press(choice(page, "Section chorus", "Delete section"));
    await expect(bandNames(page)).toHaveText(["Unnamed", "verse", "verse"]);

    await harness.layout.undo();
    await harness.layout.undo();
    await harness.layout.undo();
    expect(await harness.layout.scoreText()).toBe(SONG);
    expect(await harness.layout.canUndo()).toBe(false);
  });
});

test.describe("naming a section", () => {
  test("Rename asks for a name, starting from the old one, and gives the section the new one", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Rename…"));

    await expect(form(page, "Rename")).toBeVisible();
    await expect(nameField(page, "Rename")).toBeFocused();
    await expect(nameField(page, "Rename")).toHaveValue("verse");
    await expect(barField(page, "Rename")).toBeHidden();
    await expect(form(page, "Rename").getByText("This section covers bars 3 to 5.")).toBeVisible();
    await nameField(page, "Rename").fill("bridge");
    await page.keyboard.press("Enter");

    await expect(form(page, "Rename")).toBeHidden();
    await expect(bandNames(page)).toHaveText(["Unnamed", "bridge", "chorus"]);
    await expect(said(page)).toHaveText("Renamed section “verse” to “bridge”");
    await expect(bandButton(page, "Section bridge")).toBeFocused();

    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(SONG);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("the unnamed music is named with Name this section, which puts a marker at its first bar", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Unnamed section"));
    await press(choice(page, "Unnamed section", "Name this section…"));

    await expect(form(page, "Name this section")).toBeVisible();
    await expect(form(page, "Name this section").getByText("This section covers bars 1 to 2.")).toBeVisible();
    await expect(nameField(page, "Name this section")).toHaveValue("");
    await nameField(page, "Name this section").fill("intro");
    await press(formButton(page, "Name this section", "Name"));

    await expect(bandNames(page)).toHaveText(["intro", "verse", "chorus"]);
    await expect(said(page)).toHaveText("Named the unnamed section “intro”");
    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(SONG);
  });

  test("a name the commands refuse stays in the form with the refusal under it, and nothing changes", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Rename…"));

    await nameField(page, "Rename").fill("");
    await page.keyboard.press("Enter");
    await expect(refusalLine(page, "Rename")).toHaveText("A section needs a name; the name cannot be empty. (bar 3)");
    await expect(nameField(page, "Rename")).toHaveAttribute("aria-invalid", "true");
    await expect(nameField(page, "Rename")).toBeFocused();

    await nameField(page, "Rename").fill("   ");
    await expect(refusalLine(page, "Rename")).toBeHidden();
    await page.keyboard.press("Enter");
    await expect(refusalLine(page, "Rename")).toHaveText("A section name cannot be only spaces or tabs. (bar 3)");

    await nameField(page, "Rename").fill("bridge ");
    await page.keyboard.press("Enter");
    await expect(refusalLine(page, "Rename")).toHaveText(
      "A section name cannot end with a space or tab, because the score format drops it. (bar 3)",
    );
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.scoreText()).toBe(SONG);
    await expect(form(page, "Rename")).toBeVisible();

    await nameField(page, "Rename").fill("bridge");
    await page.keyboard.press("Enter");
    await expect(bandNames(page)).toHaveText(["Unnamed", "bridge", "chorus"]);
  });

  test("Escape, Cancel and a press outside close the form and change nothing", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Rename…"));
    await nameField(page, "Rename").fill("bridge");
    await page.keyboard.press("Escape");
    await expect(form(page, "Rename")).toBeHidden();
    await expect(bandButton(page, "Section verse")).toBeFocused();

    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Rename…"));
    await press(formButton(page, "Rename", "Cancel"));
    await expect(form(page, "Rename")).toBeHidden();
    await expect(bandButton(page, "Section verse")).toBeFocused();

    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Rename…"));
    await (isMobile ? page.touchscreen.tap(2, 2) : page.mouse.click(2, 2));
    await expect(form(page, "Rename")).toBeHidden();

    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.scoreText()).toBe(SONG);
  });
});

test.describe("starting a section at a bar", () => {
  const title = "Start a section at a bar";

  test("splits the section at the bar that was typed, so the new section starts at that bar number", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", `${title}…`));

    await expect(form(page, title)).toBeVisible();
    await expect(form(page, title)).toContainText("This section covers bars 3 to 5.");
    // Nothing was picked, so the bar after the section's first is offered: it is inside the section, and starts nothing.
    await expect(barField(page, title)).toHaveValue("4");
    await expect(barField(page, title)).toBeFocused();
    await expect(barField(page, title)).toHaveAccessibleDescription("This section covers bars 3 to 5.");
    await nameField(page, title).fill("bridge");
    await press(formButton(page, title, "Start section"));

    await expect(bandNames(page)).toHaveText(["Unnamed", "verse", "bridge", "chorus"]);
    const bridge = await box(bandNames(page).nth(2));
    const four = await box(barNumber(page, "4"));
    expect(Math.abs(bridge.x - four.x)).toBeLessThan(8);
    await expect(said(page)).toHaveText("Started section “bridge” at bar 4");
    await expect(bandButton(page, "Section bridge")).toBeFocused();

    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(SONG);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  test("takes a bar of the unnamed music too, and a section of one bar may start another", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Unnamed section"));
    await press(choice(page, "Unnamed section", `${title}…`));
    await barField(page, title).fill("2");
    await nameField(page, title).fill("intro");
    await page.keyboard.press("Enter");
    await expect(bandNames(page)).toHaveText(["Unnamed", "intro", "verse", "chorus"]);

    // The intro is one bar long, and the menu still offers to start a section in it; with no bar to offer, the field is empty.
    await press(bandButton(page, "Section intro"));
    await expect(choice(page, "Section intro", `${title}…`)).toHaveAttribute("aria-disabled", "false");
    await press(choice(page, "Section intro", `${title}…`));
    await expect(barField(page, title)).toHaveValue("");
  });

  test("sends the bar as typed: a bar outside the score and an empty field are refused, and a bar that starts a section names it", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", `${title}…`));

    await barField(page, title).fill("99");
    await nameField(page, title).fill("bridge");
    await page.keyboard.press("Enter");
    await expect(refusalLine(page, title)).toContainText("is outside this score.");
    await expect(barField(page, title)).toHaveAttribute("aria-invalid", "true");
    expect(await harness.layout.canUndo()).toBe(false);

    await barField(page, title).fill("");
    await page.keyboard.press("Enter");
    await expect(refusalLine(page, title)).toHaveText("The bar is outside this score.");
    await expect(barField(page, title)).toHaveAttribute("aria-invalid", "true");
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.scoreText()).toBe(SONG);

    await barField(page, title).fill("abc");
    await page.keyboard.press("Enter");
    await expect(refusalLine(page, title)).toHaveText("The bar is outside this score.");
    await expect(barField(page, title)).toHaveAttribute("aria-invalid", "true");
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.scoreText()).toBe(SONG);

    await barField(page, title).fill("3");
    await page.keyboard.press("Enter");
    await expect(bandNames(page)).toHaveText(["Unnamed", "bridge", "chorus"]);
    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(SONG);
  });

  test("offers the bar the insertion point is in when it is inside the section, and else the section's second bar", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    // Four bars of 1024 ticks are before bar 5, which is in the verse (bars 3 to 5) and does not start it.
    await page.evaluate(() => window.harness.layout.live().setInsertionPoint({ tick: 4 * 1024 }));
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", `${title}…`));
    await expect(barField(page, title)).toHaveValue("5");
    await page.keyboard.press("Escape");

    // Bar 6 starts the chorus, and the point at the start of the verse would only rename the verse: neither is offered.
    for (const bars of [5, 2]) {
      await page.evaluate((tick) => window.harness.layout.live().setInsertionPoint({ tick }), bars * 1024);
      await press(bandButton(page, "Section verse"));
      await press(choice(page, "Section verse", `${title}…`));
      await expect(barField(page, title)).toHaveValue("4");
      await page.keyboard.press("Escape");
    }
  });

  test("says that a bar which starts a section renames it, before the form is sent", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", `${title}…`));
    const renames = form(page, title).getByText(/so this (re)?names it/);
    await expect(renames).toBeHidden();

    await barField(page, title).fill("6");
    await expect(renames).toHaveText("Bar 6 starts “chorus”, so this renames it.");
    await expect(barField(page, title)).toHaveAccessibleDescription(
      "This section covers bars 3 to 5. Bar 6 starts “chorus”, so this renames it.",
    );
    await barField(page, title).fill("1");
    await expect(renames).toHaveText("Bar 1 starts the unnamed section, so this names it.");
    await barField(page, title).fill("5");
    await expect(renames).toBeHidden();
    await barField(page, title).fill("abc");
    await expect(renames).toBeHidden();

    // What the line says is what the command does.
    await barField(page, title).fill("6");
    await expect(formButton(page, title, "Rename")).toBeVisible();
    await nameField(page, title).fill("bridge");
    await page.keyboard.press("Enter");
    await expect(bandNames(page)).toHaveText(["Unnamed", "verse", "bridge"]);
    await expect(said(page)).toHaveText("Renamed section “chorus” to “bridge”");
  });

  test("names the section the typed bar is in, and says that the command splits it", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", `${title}…`));
    await barField(page, title).fill("7");
    const context = "Bar 7 is in “chorus”, which covers bars 6 to 7, so this splits it.";
    await expect(form(page, title).getByText(context)).toBeVisible();
    await expect(barField(page, title)).toHaveAccessibleDescription(context);
    await nameField(page, title).fill("bridge");
    await page.keyboard.press("Enter");
    await expect(bandNames(page)).toHaveText(["Unnamed", "verse", "chorus", "bridge"]);
    await expect(said(page)).toHaveText("Started section “bridge” at bar 7");
  });

  test("a bar that starts the unnamed section names it, and the form confirms Name", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", `${title}…`));
    await barField(page, title).fill("1");
    await expect(formButton(page, title, "Name")).toBeVisible();
    await nameField(page, title).fill("intro");
    await page.keyboard.press("Enter");
    await expect(bandNames(page)).toHaveText(["intro", "verse", "chorus"]);
    await expect(said(page)).toHaveText("Named the unnamed section “intro”");
  });

  test("shows a refusal under the field it is about", async ({ page, harness, press }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", `${title}…`));
    await barField(page, title).fill("99");
    await nameField(page, title).fill("bridge");
    await page.keyboard.press("Enter");
    const bar = await box(barField(page, title));
    const name = await box(nameField(page, title));
    const barRefusal = await box(refusalLine(page, title));
    expect(barRefusal.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(barRefusal.y + barRefusal.height).toBeLessThanOrEqual(name.y + 1);

    await barField(page, title).fill("4");
    await nameField(page, title).fill("bridge ");
    await page.keyboard.press("Enter");
    const nameAfter = await box(nameField(page, title));
    const nameRefusal = await box(refusalLine(page, title));
    expect(nameRefusal.y).toBeGreaterThanOrEqual(nameAfter.y + nameAfter.height);
  });
});

test.describe("a choice that cannot be done", () => {
  test("the unnamed music can be named or deleted, and duplicate and the moves say why", async ({
    page,
    harness,
    press,
    isMobile,
  }) => {
    await openSong(harness);
    await press(bandButton(page, "Unnamed section"));
    const why = "The unnamed section has no marker, so it can be deleted but not copied or moved.";
    for (const label of ["Duplicate", "Move earlier", "Move later"]) {
      const muted = choice(page, "Unnamed section", label);
      await expect(muted).toHaveAttribute("aria-disabled", "true");
      await expect(muted).toHaveAccessibleDescription(`${why} (bar 1)`);
    }
    // The three choices are refused in the same words, so the words stand once, under the last of them.
    const note = menu(page, "Unnamed section").getByText(why);
    await expect(note).toHaveCount(1);
    await expect(note).toBeVisible();
    const lastMuted = await box(choice(page, "Unnamed section", "Duplicate"));
    const noted = await box(note);
    const deleting = await box(choice(page, "Unnamed section", "Delete section"));
    expect(noted.y).toBeGreaterThanOrEqual(lastMuted.y + lastMuted.height - 1);
    expect(noted.y + noted.height).toBeLessThanOrEqual(deleting.y + 1);
    for (const label of ["Name this section…", "Start a section at a bar…", "Delete section"]) {
      await expect(choice(page, "Unnamed section", label)).toHaveAttribute("aria-disabled", "false");
    }

    // Pressing a muted choice does nothing, and the menu stays open so that the reason can be read.
    await pressMuted(choice(page, "Unnamed section", "Duplicate"), isMobile);
    await expect(menu(page, "Unnamed section")).toBeVisible();
    await expect(said(page)).toHaveText(`${why} (bar 1)`);
    expect(await harness.layout.canUndo()).toBe(false);
    expect(await harness.layout.scoreText()).toBe(SONG);

    await press(choice(page, "Unnamed section", "Delete section"));
    await expect(bandNames(page)).toHaveText(["verse", "chorus"]);
    await expect(said(page)).toHaveText("Deleted the unnamed section");
    expect(await harness.layout.undo()).toBe(true);
    expect(await harness.layout.scoreText()).toBe(SONG);
  });

  test("the first and the last section cannot move past the ends, and say so", async ({ page, harness, press }) => {
    await openSong(harness, NAMED);
    await press(bandButton(page, "Section verse"));
    const first = choice(page, "Section verse", "Move earlier");
    await expect(first).toHaveAttribute("aria-disabled", "true");
    await expect(menu(page, "Section verse").getByText("is already first and cannot move earlier.")).toBeVisible();
    await expect(choice(page, "Section verse", "Move later")).toHaveAttribute("aria-disabled", "false");
    await page.keyboard.press("Escape");

    await press(bandButton(page, "Section chorus"));
    const last = choice(page, "Section chorus", "Move later");
    await expect(last).toHaveAttribute("aria-disabled", "true");
    await expect(menu(page, "Section chorus").getByText("is already last and cannot move later.")).toBeVisible();
    await expect(choice(page, "Section chorus", "Move earlier")).toHaveAttribute("aria-disabled", "false");
  });

  test("the first named section cannot move in front of the unnamed music", async ({ page, harness, press }) => {
    await openSong(harness);
    await press(bandButton(page, "Section verse"));
    const earlier = choice(page, "Section verse", "Move earlier");
    await expect(earlier).toHaveAttribute("aria-disabled", "true");
    await expect(
      menu(page, "Section verse").getByText("A named section cannot move before the unnamed section"),
    ).toBeVisible();
  });

  test("a section that holds the cut tail cannot be copied or moved, and can be deleted", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, CUT);
    await press(bandButton(page, "Section chorus"));
    await expect(choice(page, "Section chorus", "Duplicate")).toHaveAttribute("aria-disabled", "true");
    await expect(choice(page, "Section chorus", "Move earlier")).toHaveAttribute("aria-disabled", "true");
    // Move earlier and Duplicate are refused in the same words, but Move later is refused in others between them, so the
    // words stand twice: a note speaks only for muted choices that are side by side.
    const cut = menu(page, "Section chorus").getByText(
      "That would touch the score's cut; use the truncation commands for it.",
    );
    await expect(cut).toHaveCount(2);
    await expect(cut.first()).toBeVisible();
    await expect(cut.last()).toBeVisible();
    await expect(choice(page, "Section chorus", "Delete section")).toHaveAttribute("aria-disabled", "false");
    await press(choice(page, "Section chorus", "Delete section"));
    await expect(bandNames(page)).toHaveText(["verse"]);
  });

  test("the only section cannot be deleted, because no bar would remain", async ({ page, harness, press }) => {
    await openSong(harness, ONLY);
    await press(bandButton(page, "Section a"));
    await expect(choice(page, "Section a", "Delete section")).toHaveAttribute("aria-disabled", "true");
    await expect(menu(page, "Section a").getByText("The score would have no bars left.")).toBeVisible();
  });
});

test.describe("the section menu from the keyboard", () => {
  test("Shift and F10 on the ruler open the menu of the first section, and Escape gives the focus to its band", async ({
    page,
    harness,
  }) => {
    await openSong(harness);
    await rulerRegion(page).focus();
    await page.keyboard.press("Shift+F10");

    await expect(menu(page, "Unnamed section")).toBeVisible();
    await expect(choice(page, "Unnamed section", "Name this section…")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu(page, "Unnamed section")).toBeHidden();
    await expect(bandButton(page, "Unnamed section")).toBeFocused();
  });

  test("the Menu key opens the menu of the section the insertion point is in", async ({ page, harness }) => {
    await openSong(harness);
    // Two bars of 1024 ticks are before bar 3, the first bar of the verse.
    await page.evaluate(() => window.harness.layout.live().setInsertionPoint({ tick: 2 * 1024 }));
    await rulerRegion(page).focus();
    await page.keyboard.press("ContextMenu");

    await expect(menu(page, "Section verse")).toBeVisible();
  });

  test("Left, Right, Home and End walk the bands, and Enter opens the menu of the one in focus", async ({
    page,
    harness,
  }) => {
    await openSong(harness);
    await bandButton(page, "Section verse").focus();
    await page.keyboard.press("ArrowRight");
    await expect(bandButton(page, "Section chorus")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(bandButton(page, "Section chorus")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(bandButton(page, "Unnamed section")).toBeFocused();
    await page.keyboard.press("End");
    await expect(bandButton(page, "Section chorus")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(bandButton(page, "Section verse")).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(menu(page, "Section verse")).toBeVisible();
    await expect(choice(page, "Section verse", "Rename…")).toBeFocused();
  });

  test("a whole edit by keys: open, walk to Delete, press Enter, and the focus lands on the band that took its place", async ({
    page,
    harness,
  }) => {
    await openSong(harness);
    await bandButton(page, "Unnamed section").focus();
    await page.keyboard.press("Enter");
    // The menu gives its first choice the focus a moment after it opens; keys pressed before that would go to the band.
    await expect(choice(page, "Unnamed section", "Name this section…")).toBeFocused();
    await page.keyboard.press("End");
    await expect(choice(page, "Unnamed section", "Delete section")).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(bandNames(page)).toHaveText(["verse", "chorus"]);
    await expect(bandButton(page, "Section verse")).toBeFocused();
    // An undo from outside redraws the ruler, and the focus stays on a band instead of falling to the page.
    expect(await harness.layout.undo()).toBe(true);
    await expect(bandNames(page)).toHaveText(["Unnamed", "verse", "chorus"]);
    await expect(slot(page, "ruler").locator(".sce-section-open:focus")).toHaveCount(1);
  });

  test("deleting the last section leaves the focus on the one before it", async ({ page, harness }) => {
    await openSong(harness);
    await bandButton(page, "Section chorus").focus();
    await page.keyboard.press("Enter");
    await expect(choice(page, "Section chorus", "Rename…")).toBeFocused();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    await expect(bandNames(page)).toHaveText(["Unnamed", "verse"]);
    await expect(bandButton(page, "Section verse")).toBeFocused();
  });

  test("after a move, the focus is on the band of the section that moved", async ({ page, harness }) => {
    await openSong(harness);
    await bandButton(page, "Section chorus").focus();
    await page.keyboard.press("Enter");
    await expect(choice(page, "Section chorus", "Rename…")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(choice(page, "Section chorus", "Move earlier")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(bandNames(page)).toHaveText(["Unnamed", "chorus", "verse"]);
    await expect(bandButton(page, "Section chorus")).toBeFocused();
  });
});

test.describe("the mouse's second button", () => {
  test.skip(({ isMobile }) => isMobile, "a second button belongs to a mouse");

  test("a right click on a band opens its menu", async ({ page, harness }) => {
    await openSong(harness);
    await bandButton(page, "Section verse").click({ button: "right" });
    await expect(menu(page, "Section verse")).toBeVisible();
  });
});

test.describe("a read-only session", () => {
  test("shows the bands and opens no menu", async ({ page, harness }) => {
    await openSong(harness, SONG, { editable: false });
    await expect(bandNames(page)).toHaveText(["Unnamed", "verse", "chorus"]);
    await expect(slot(page, "ruler").getByRole("button")).toHaveCount(0);

    await bandNames(page)
      .nth(1)
      .click({ position: { x: 20, y: 8 } });
    await rulerRegion(page).focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(await harness.layout.canUndo()).toBe(false);
  });

  /** Whether the name of a band carries the mark that says the band opens something. */
  const marked = (page: Page, index: number) =>
    bandNames(page)
      .nth(index)
      .locator(".sce-section-name")
      .evaluate((name) => getComputedStyle(name, "::after").content !== "none");

  test("a band carries a mark that it opens something only while the session is editable", async ({
    page,
    harness,
  }) => {
    await openSong(harness, SONG, { editable: false });
    expect(await marked(page, 1)).toBe(false);
    await harness.layout.setEditable(true);
    expect(await marked(page, 1)).toBe(true);
    await harness.layout.setEditable(false);
    expect(await marked(page, 1)).toBe(false);
  });

  test("gets the controls when the session becomes editable, and loses them, and an open menu, when it does not", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { editable: false });
    await harness.layout.setEditable(true);
    await press(bandButton(page, "Section verse"));
    await expect(menu(page, "Section verse")).toBeVisible();

    await harness.layout.setEditable(false);
    await expect(menu(page, "Section verse")).toBeHidden();
    await expect(slot(page, "ruler").getByRole("button")).toHaveCount(0);
  });
});

test.describe("in the assembled editor", () => {
  const sections = (page: Page) => page.getByRole("list", { name: "Sections" }).getByRole("listitem");

  test("the menu works in mount() with the toolbar's Undo, and a refused name is told to the host", async ({
    page,
    harness,
    press,
  }) => {
    await harness.mount({ score: { text: SONG } });
    await press(page.getByRole("button", { name: "Section chorus", exact: true }));
    await press(page.getByRole("menuitem", { name: "Delete section", exact: true }));
    await expect(sections(page)).toHaveText(["Unnamed", "verse"]);

    await press(page.getByRole("button", { name: "Undo", exact: true }));
    await expect(sections(page)).toHaveText(["Unnamed", "verse", "chorus"]);
    expect(await harness.notices()).toEqual([]);

    await press(page.getByRole("button", { name: "Section verse", exact: true }));
    await press(page.getByRole("menuitem", { name: "Rename…", exact: true }));
    await page.getByRole("textbox", { name: "Name" }).fill("bridge ");
    await page.keyboard.press("Enter");
    const words = "A section name cannot end with a space or tab, because the score format drops it. (bar 3)";
    await expect(page.getByRole("alert")).toHaveText(words);
    expect(await harness.notices()).toEqual([{ code: "command-refused", level: "warning", message: words }]);
  });

  test("the Arrangement region still leads to the first note with one Tab", async ({ page, harness }) => {
    await harness.mount({ score: { text: SONG } });
    await page.getByRole("region", { name: "Arrangement" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("listitem", { name: /^C4, bar 1 beat 1/ })).toBeFocused();
  });

  test("tells a screen reader how to open the section menu, in both languages, and not when the editor is read-only", async ({
    page,
    harness,
  }) => {
    await harness.mount({ score: { text: SONG } });
    await expect(page.getByRole("region", { name: "Arrangement" })).toHaveAccessibleDescription(
      /name of a section.*opens? its menu.*Shift and F10.*Menu key.*Left and Right move from section to section.*Enter opens its menu/s,
    );

    await harness.update({ language: "zh" });
    await expect(page.getByRole("region", { name: "编曲视图" })).toHaveAccessibleDescription(
      /段落名.*Shift 加 F10.*菜单键.*左、右键在段落之间移动.*Enter 打开它的菜单/s,
    );

    await harness.update({ language: "en", editable: false });
    await expect(page.getByRole("region", { name: "Arrangement" })).not.toHaveAccessibleDescription(/section/);
  });

  test("Shift and F10 on the Arrangement region opens the menu of the first section", async ({ page, harness }) => {
    await harness.mount({ score: { text: SONG } });
    await page.getByRole("region", { name: "Arrangement" }).focus();
    await page.keyboard.press("Shift+F10");
    await expect(menu(page, "Unnamed section")).toBeVisible();
  });
});

test.describe("inside a shadow root", () => {
  test("the menu and the form open and work in a layout that stands in a shadow root", async ({
    page,
    harness,
    press,
  }) => {
    await openSong(harness, SONG, { shadow: true });
    await press(bandButton(page, "Section verse"));
    await press(choice(page, "Section verse", "Rename…"));
    await nameField(page, "Rename").fill("bridge");
    await page.keyboard.press("Enter");
    await expect(bandNames(page)).toHaveText(["Unnamed", "bridge", "chorus"]);
  });
});

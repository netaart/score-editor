// ABOUTME: Seam 5, the first test: the mounted editor driven in real Chromium through a bare test page.
// ABOUTME: Covers dragging with mouse and touch, scrolling, language switching and what destroy leaves behind.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.describe("with a mouse", () => {
  test.skip(({ isMobile }) => isMobile, "mouse gestures run on the desktop project");

  test("dragging a note changes its time and pitch", async ({ page, harness }) => {
    await harness.mount();
    const lane = page.getByRole("group", { name: "Vocal" });
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    const laneBox = await lane.boundingBox();
    const noteBox = await note.boundingBox();
    if (!laneBox || !noteBox) throw new Error("the 8-bar Vocal roll did not render");

    const beat = laneBox.width / 32;
    const row = noteBox.height;
    const grab = { x: noteBox.x + 6, y: noteBox.y + row / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 1.5 * beat, grab.y - row, { steps: 6 });
    await page.mouse.move(grab.x + 3 * beat, grab.y - 2 * row, { steps: 6 });
    await page.mouse.up();

    await expect(page.getByRole("button", { name: "D5, bar 4 beat 4, length 3 beats" })).toBeVisible();
    await expect(note).toHaveCount(0);
  });

  test("Escape cancels a drag in progress and the readout stays inside the editor", async ({ page, harness }) => {
    await harness.mount();
    const roll = page.getByRole("region", { name: "Piano roll" });
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    const rollBox = await roll.boundingBox();
    const noteBox = await note.boundingBox();
    if (!rollBox || !noteBox) throw new Error("the roll did not render");

    await page.mouse.move(noteBox.x + 6, noteBox.y + noteBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rollBox.x + rollBox.width - 60, noteBox.y - 28, { steps: 8 });
    const readout = page.getByText(/ · bar \d/);
    await expect(readout).toBeVisible();
    const readoutBox = await readout.boundingBox();
    expect(readoutBox ? readoutBox.x + readoutBox.width : Infinity).toBeLessThanOrEqual(rollBox.x + rollBox.width);

    await page.keyboard.press("Escape");
    await expect(readout).toBeHidden();
    await page.mouse.up();
    await expect(note).toBeVisible();
    expect(await harness.notices()).toEqual([]);
  });

  test("holding a dragged note near the edge scrolls the roll, so a note can travel further than the screen shows", async ({
    page,
    harness,
  }) => {
    await harness.mount({ score: { bars: 32, notes: 64 } });
    const roll = page.getByRole("region", { name: "Piano roll" });
    const first = page.getByRole("group", { name: "Vocal" }).getByRole("button").first();
    const before = (await first.getAttribute("aria-label")) ?? "";
    const rollBox = await roll.boundingBox();
    const noteBox = await first.boundingBox();
    if (!rollBox || !noteBox) throw new Error("the roll did not render");

    await page.mouse.move(noteBox.x + 4, noteBox.y + noteBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rollBox.x + rollBox.width - 10, noteBox.y + noteBox.height / 2, { steps: 12 });
    await page.waitForTimeout(1000);
    expect(await roll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
    await page.mouse.up();

    const moved = (await page.getByRole("button", { pressed: true }).getAttribute("aria-label")) ?? "";
    const bar = (label: string) => Number(/bar (\d+)/.exec(label)?.[1]);
    expect(bar(moved) - bar(before)).toBeGreaterThan(6);
  });
});

test.describe("with a finger", () => {
  test.skip(({ isMobile }) => !isMobile, "touch gestures run on the phone project");

  test("a coarse pointer gets tall rows, dragging a note moves it and does not scroll, swiping empty space scrolls and moves nothing", async ({
    page,
    harness,
  }) => {
    await harness.mount();
    const roll = page.getByRole("region", { name: "Piano roll" });
    const lane = page.getByRole("group", { name: "Vocal" });
    const note = page.getByRole("button", { name: "C5, bar 1 beat 3, length 2 beats" });
    const laneBox = await lane.boundingBox();
    const noteBox = await note.boundingBox();
    if (!laneBox || !noteBox) throw new Error("the 8-bar Vocal roll did not render");
    const beat = laneBox.width / 32;
    const row = noteBox.height;
    expect(row).toBeGreaterThanOrEqual(24);

    const grab = { x: noteBox.x + 10, y: noteBox.y + row / 2 };
    await harness.swipe(grab, { x: grab.x + beat, y: grab.y - row });
    await expect(page.getByRole("button", { name: "C#5, bar 1 beat 4, length 2 beats" })).toBeVisible();
    expect(await roll.evaluate((el) => el.scrollLeft)).toBe(0);

    const rollBox = await roll.boundingBox();
    if (!rollBox) throw new Error("the roll has no box");
    const blank = { x: rollBox.x + rollBox.width * 0.75, y: rollBox.y + rollBox.height - 10 };
    await harness.swipe(blank, { x: blank.x - 200, y: blank.y });
    await expect.poll(() => roll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await expect(page.getByRole("button", { name: "C#5, bar 1 beat 4, length 2 beats" })).toHaveCount(1);
  });
});

test("update switches the interface language and back", async ({ page, harness }) => {
  await harness.mount({ language: "en" });
  await expect(page.getByRole("region", { name: "Piano roll" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Grid 1\/16$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" })).toBeVisible();

  await harness.update({ language: "zh" });
  await expect(page.getByRole("region", { name: "钢琴卷帘" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^网格 1\/16$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "C5，第 4 小节第 1 拍，长 3 拍" })).toBeVisible();
  await expect(page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" })).toHaveCount(0);

  await harness.update({ language: "en" });
  await expect(page.getByRole("region", { name: "Piano roll" })).toBeVisible();
});

test("repeated update and destroy leave no listeners and no nodes behind", async ({ page, harness }) => {
  const cdp = await page.context().newCDPSession(page);
  const listenerCount = async (expression: string) => {
    const { result } = await cdp.send("Runtime.evaluate", { expression });
    if (!result.objectId) throw new Error(`no object for ${expression}`);
    const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
    return listeners.length;
  };
  const globals = [
    "window",
    "document",
    "document.documentElement",
    "document.body",
    "document.head",
    "window.harness.stage",
  ];
  const countGlobals = () => Promise.all(globals.map(listenerCount));
  const before = await countGlobals();
  const htmlBefore = await page.evaluate(() => document.documentElement.outerHTML);
  const adoptedSheets = () => page.evaluate(() => document.adoptedStyleSheets.length);
  const sheetsBefore = await adoptedSheets();

  for (let cycle = 0; cycle < 4; cycle++) {
    await harness.mount();
    await harness.update({ language: "zh" });
    await harness.update({ editable: false });
    await harness.update({ score: "sample" });
    await harness.update({ language: "en", editable: true });
    await harness.destroy();
    await harness.destroy();
    await harness.update({ language: "zh" });
  }
  expect(await countGlobals()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(htmlBefore);
  expect(await adoptedSheets()).toBe(sheetsBefore);

  await harness.mount();
  expect(await adoptedSheets()).toBe(sheetsBefore + 1);
  await page.getByRole("button", { name: /^Grid/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Eighth note (1/8)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Grid/ })).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => window.harness.stage.firstElementChild?.nodeName)).toBe("DIV");
  await page.evaluate(() => {
    const kept = [window.harness.stage.firstElementChild as Element];
    kept.push(...(kept[0] as Element).querySelectorAll("*"));
    Object.assign(window, { kept });
  });
  const keptListeners = async () => {
    const { result } = await cdp.send("Runtime.evaluate", { expression: "window.kept" });
    const { result: length } = await cdp.send("Runtime.evaluate", { expression: "window.kept.length" });
    if (!result.objectId) throw new Error("kept nodes missing");
    let total = 0;
    for (let index = 0; index < Number(length.value); index++) {
      const { result: node } = await cdp.send("Runtime.evaluate", { expression: `window.kept[${index}]` });
      if (!node.objectId) continue;
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: node.objectId });
      total += listeners.length;
    }
    return total;
  };
  expect(await keptListeners()).toBeGreaterThan(0);
  await harness.destroy();
  expect(await keptListeners()).toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll(":popover-open").length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toBe(htmlBefore);
  expect(await adoptedSheets()).toBe(sheetsBefore);
  await expect(page.getByRole("menuitemradio")).toHaveCount(0);
  await cdp.detach();

  await harness.mount();
  await expect(page.evaluate(() => window.harness.mount())).rejects.toThrow(/already holds an editor/);
  await harness.destroy();
});

test.describe("host callbacks", () => {
  test.skip(({ isMobile }) => isMobile, "mouse gestures run on the desktop project");

  async function dragNote(page: Page, name: string, beats: number, rows: number) {
    const lane = page.getByRole("group", { name: "Vocal" });
    const note = page.getByRole("button", { name });
    const laneBox = await lane.boundingBox();
    const noteBox = await note.boundingBox();
    if (!laneBox || !noteBox) throw new Error(`no box for ${name}`);
    const beat = laneBox.width / 32;
    const grab = { x: noteBox.x + 6, y: noteBox.y + noteBox.height / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + (beats * beat) / 2, grab.y - (rows * noteBox.height) / 2, { steps: 5 });
    await page.mouse.move(grab.x + beats * beat, grab.y - rows * noteBox.height, { steps: 5 });
    await page.mouse.up();
  }

  test("a read-only score refuses the drag and tells the host once, in the current language", async ({
    page,
    harness,
  }) => {
    await harness.mount({ editable: false, language: "en" });
    await expect(page.getByText("Read only")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Grid/ })).toBeHidden();
    await dragNote(page, "C5, bar 4 beat 1, length 3 beats", 3, 2);
    await expect(page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" })).toBeVisible();
    expect(await harness.notices()).toEqual([
      { code: "read-only", level: "info", message: "This score is read only, so notes can't be moved." },
    ]);

    await harness.update({ language: "zh", editable: true });
    await expect(page.getByText("只读")).toBeHidden();
    await expect(page.getByRole("button", { name: /^网格/ })).toBeVisible();
    await dragNote(page, "C5，第 4 小节第 1 拍，长 3 拍", 3, 2);
    await expect(page.getByRole("button", { name: "D5，第 4 小节第 4 拍，长 3 拍" })).toBeVisible();
    expect(await harness.notices()).toHaveLength(1);
  });

  test("a note pulled past the pitch range stops at its edge and the host is told", async ({ page, harness }) => {
    await harness.mount();
    await dragNote(page, "E5, bar 5 beat 3, length 1 beat", 0, 8);
    await expect(page.getByRole("button", { name: "B5, bar 5 beat 3, length 1 beat" })).toBeVisible();
    expect(await harness.notices()).toEqual([
      { code: "pitch-out-of-range", level: "info", message: "Notes can't go beyond the pitch range shown." },
    ]);
  });

  test("arrow keys nudge the focused note by the grid, a semitone and an octave", async ({ page, harness }) => {
    await harness.mount();
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    await note.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "C5, bar 4 beat 1.25, length 3 beats" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Shift+ArrowUp");
    await expect(page.getByRole("button", { name: "B5, bar 4 beat 1.25, length 3 beats" })).toBeFocused();
  });

  test("a drop onto another note's start is refused, the note stays and the host is told", async ({
    page,
    harness,
  }) => {
    await harness.mount();
    await dragNote(page, "G4, bar 1 beat 2, length 1 beat", 1, 0);
    await expect(page.getByRole("button", { name: "G4, bar 1 beat 2, length 1 beat" })).toBeVisible();
    expect(await harness.notices()).toEqual([
      {
        code: "move-blocked",
        level: "info",
        message: "Another note already starts there, so this note stayed where it was.",
      },
    ]);
    await expect(page.getByRole("status")).toHaveText(
      "Another note already starts there, so this note stayed where it was.",
    );
  });

  test("key moves are announced and kept in view, a refused one says so, Space toggles the selection", async ({
    page,
    harness,
  }) => {
    await harness.mount();
    const status = page.getByRole("status");
    const note = page.getByRole("button", { name: "G4, bar 1 beat 2, length 1 beat" });
    await note.focus();
    await page.keyboard.press("ArrowRight");
    await expect(status).toHaveText("G4, bar 1 beat 2.25, length 1 beat");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Space");
    await expect(note).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(note).toHaveAttribute("aria-pressed", "false");

    for (let press = 0; press < 4; press++) await page.keyboard.press("ArrowRight");
    await expect(status).toHaveText("Another note already starts there, so this note stayed where it was.");
    expect((await harness.notices()).map((notice) => notice.code)).toEqual(["move-blocked"]);
  });

  test("key moves past the visible edge scroll the roll to keep the note in view", async ({ page, harness }) => {
    await harness.mount({ score: { bars: 32, notes: 64 } });
    const roll = page.getByRole("region", { name: "Piano roll" });
    const note = page.getByRole("group", { name: "Vocal" }).getByRole("button").nth(7);
    await note.focus();
    for (let press = 0; press < 12; press++) await page.keyboard.press("ArrowRight");
    const rollBox = await roll.boundingBox();
    const box = await note.boundingBox();
    if (!rollBox || !box) throw new Error("the roll did not render");
    expect(box.x + box.width).toBeLessThanOrEqual(rollBox.x + rollBox.width);
  });
});

test.describe("host styling", () => {
  test.skip(({ isMobile }) => isMobile, "styling is checked once, on the desktop project");

  test("host theme variables restyle the editor, with neutral defaults and the host's colour scheme when unmapped", async ({
    page,
    harness,
  }) => {
    await harness.mount();
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    const roll = page.getByRole("region", { name: "Piano roll" });
    const colour = (target: Locator, property: "backgroundColor" | "fontFamily") =>
      target.evaluate((el, name) => getComputedStyle(el)[name], property);
    const lightness = async () => {
      const [r = 0, g = 0, b = 0] = (await colour(roll, "backgroundColor")).match(/\d+/g)?.map(Number) ?? [];
      return (r + g + b) / 3;
    };

    expect(await lightness()).toBeGreaterThan(200);
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = "dark";
    });
    expect(await lightness()).toBeLessThan(60);
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = "";
    });

    await page.evaluate(() => {
      const { style } = window.harness.stage;
      style.setProperty("--sce-color-note", "rgb(255, 0, 128)");
      style.setProperty("--sce-color-bg", "rgb(10, 20, 30)");
      style.setProperty("--sce-font-family", "'Courier New', monospace");
    });
    expect(await colour(note, "backgroundColor")).toBe("rgb(255, 0, 128)");
    expect(await colour(roll, "backgroundColor")).toBe("rgb(10, 20, 30)");
    expect(await colour(page.getByText("Piano roll", { exact: true }), "fontFamily")).toContain("Courier New");
  });

  test("a host that maps only the background and text colours still gets readable text", async ({ page, harness }) => {
    await harness.mount();
    await page.evaluate(() => {
      const { style } = window.harness.stage;
      style.setProperty("--sce-color-bg", "rgb(18, 19, 22)");
      style.setProperty("--sce-color-text", "rgb(232, 233, 237)");
    });
    const contrastOf = (target: Locator) =>
      target.evaluate((el) => {
        const canvas = document.createElement("canvas").getContext("2d");
        if (!canvas) throw new Error("no canvas");
        const rgb = (css: string) => {
          canvas.clearRect(0, 0, 1, 1);
          canvas.fillStyle = css;
          canvas.fillRect(0, 0, 1, 1);
          return Array.from(canvas.getImageData(0, 0, 1, 1).data.slice(0, 4));
        };
        const luminance = ([r = 0, g = 0, b = 0]: number[]) => {
          const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
        };
        let backdrop: Element | null = el;
        while (backdrop && rgb(getComputedStyle(backdrop).backgroundColor)[3] === 0) backdrop = backdrop.parentElement;
        const a = luminance(rgb(getComputedStyle(el).color));
        const b = luminance(rgb(backdrop ? getComputedStyle(backdrop).backgroundColor : "white"));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    for (const text of ["Piano roll", "Grid", "2", "C4"]) {
      expect(await contrastOf(page.getByText(text, { exact: true })), `contrast of ${text}`).toBeGreaterThan(4.5);
    }
  });

  test("the host's global styles do not change the editor, and the editor does not change the host", async ({
    page,
    harness,
  }) => {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="probe"><button id="probe-button">Host button</button><span>Host text</span></div>',
      );
    });
    const probe = () =>
      page.evaluate(() =>
        ["#probe", "#probe-button", "#probe span", "body", "h1"].map((selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const style = getComputedStyle(el);
          return [
            "color",
            "font-family",
            "font-size",
            "font-weight",
            "line-height",
            "margin-top",
            "padding-top",
            "border-top-width",
            "border-radius",
            "background-color",
            "display",
            "box-sizing",
            "text-transform",
            "letter-spacing",
          ].map((name) => style.getPropertyValue(name));
        }),
      );

    await page.addStyleTag({
      content: `
        div, span, button { margin: 7px; padding: 9px; border: 3px solid red; border-radius: 0; background: yellow;
          color: red; font: italic 28px/3 cursive; letter-spacing: 4px; text-transform: uppercase;
          box-shadow: 0 0 0 5px green; position: static; width: auto; height: auto; }
        main div, main span, main button { opacity: 0.9; text-decoration: underline; }
      `,
    });
    const hostBefore = await probe();
    await harness.mount();
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    const title = page.getByText("Piano roll", { exact: true });
    const styleOf = (target: Locator, names: string[]) =>
      target.evaluate(
        (el, list) => Object.fromEntries(list.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
        names,
      );

    expect(
      await styleOf(note, ["height", "border-top-width", "margin-top", "padding-top", "box-shadow", "opacity"]),
    ).toEqual({
      height: "14px",
      "border-top-width": "1px",
      "margin-top": "0px",
      "padding-top": "0px",
      "box-shadow": "none",
      opacity: "1",
    });
    expect(
      await styleOf(title, [
        "font-size",
        "font-style",
        "letter-spacing",
        "color",
        "padding-top",
        "text-decoration-line",
      ]),
    ).toMatchObject({
      "font-size": "13px",
      "font-style": "normal",
      "letter-spacing": "normal",
      "padding-top": "0px",
      "text-decoration-line": "none",
    });
    const gridButton = page.getByRole("button", { name: /^Grid/ });
    expect(
      await styleOf(gridButton, ["font-size", "border-top-width", "background-color", "padding-top"]),
    ).toMatchObject({
      "font-size": "13px",
      "border-top-width": "1px",
      "padding-top": "0px",
    });

    expect(await probe()).toEqual(hostBefore);
    await harness.destroy();
    expect(await probe()).toEqual(hostBefore);
  });
});

test.describe("style delivery", () => {
  test.skip(({ isMobile }) => isMobile, "style delivery is checked once, on the desktop project");

  test("the editor is styled under a strict style policy, where an injected style element would be blocked", async ({
    page,
    harness,
  }) => {
    await page.route("**/", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), "content-security-policy": "style-src 'self'" },
      });
    });
    await page.goto("/");
    await harness.mount();
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    expect((await note.boundingBox())?.height).toBe(14);
    await harness.destroy();
  });

  test("inside a host's shadow root it is styled there, works, and is out of reach of rules even !important ones", async ({
    page,
    harness,
  }) => {
    await page.addStyleTag({
      content: "#shadow-host span, #shadow-host div { padding: 9px !important; color: red !important; }",
    });
    await harness.mount({ shadow: true });
    const result = await page.evaluate(() => ({
      sheets: window.harness.shadowRoot?.adoptedStyleSheets.length,
      documentSheets: document.adoptedStyleSheets.length,
    }));
    expect(result).toEqual({ sheets: 1, documentSheets: 0 });

    const title = page.getByText("Piano roll", { exact: true });
    expect(await title.evaluate((el) => [getComputedStyle(el).paddingTop, getComputedStyle(el).color])).toEqual([
      "0px",
      "rgb(24, 24, 27)",
    ]);
    const note = page.getByRole("button", { name: "C5, bar 4 beat 1, length 3 beats" });
    const noteBox = await note.boundingBox();
    if (!noteBox) throw new Error("the editor did not render inside the shadow root");
    expect(noteBox.height).toBe(14);
    await page.mouse.move(noteBox.x + 6, noteBox.y + 7);
    await page.mouse.down();
    await page.mouse.move(noteBox.x + 6 + 60, noteBox.y + 7 - 14, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "C#5, bar 4 beat 2.5, length 3 beats" })).toBeVisible();
    await page.getByRole("button", { name: /^Grid/ }).click();
    await expect(page.getByRole("menuitemradio", { name: "Eighth note (1/8)" })).toBeVisible();
    await page.keyboard.press("Escape");

    await harness.destroy();
    const after = await page.evaluate(() => ({
      sheets: window.harness.shadowRoot?.adoptedStyleSheets.length,
      children: window.harness.shadowRoot?.firstElementChild?.childElementCount,
    }));
    expect(after).toEqual({ sheets: 0, children: 0 });
  });
});

test.describe("popovers", () => {
  test("the grid popover works above a host's layers and past the clip of its container", async ({
    page,
    harness,
    isMobile,
  }) => {
    const press = (target: Locator) => (isMobile ? target.tap() : target.click());
    await page.evaluate(() => {
      const { stage } = window.harness;
      const layer = document.createElement("div");
      layer.style.cssText =
        "position:fixed;left:0;top:0;width:100vw;height:110px;z-index:1000;overflow:hidden;transform:translateZ(0);background:#ddd";
      document.body.append(layer);
      layer.append(stage);
      stage.style.height = "110px";
      const toast = document.createElement("div");
      toast.style.cssText =
        "position:fixed;left:0;top:70px;width:100vw;height:300px;z-index:2147483647;background:rgba(255,0,0,.4)";
      document.body.append(toast);
    });
    await harness.mount();

    const gridButton = page.getByRole("button", { name: /^Grid 1\/16$/ });
    await press(gridButton);
    const eighth = page.getByRole("menuitemradio", { name: "Eighth note (1/8)" });
    await expect(eighth).toBeVisible();
    const layerBottom = await page.evaluate(() => window.harness.stage.getBoundingClientRect().bottom);
    const menuBox = await page.getByRole("menu", { name: "Grid" }).boundingBox();
    expect(menuBox ? menuBox.y + menuBox.height : 0).toBeGreaterThan(layerBottom);

    await press(eighth);
    await expect(page.getByRole("button", { name: /^Grid 1\/8$/ })).toBeVisible();
    await expect(page.getByRole("menu", { name: "Grid" })).toBeHidden();

    await page.getByRole("button", { name: "C5, bar 1 beat 3, length 2 beats" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "C5, bar 1 beat 3.5, length 2 beats" })).toBeVisible();
  });

  test.describe("on a desktop", () => {
    test.skip(({ isMobile }) => isMobile, "keyboard and modal dialogs are checked on the desktop project");

    test("it opens inside a host's modal dialog and closes with Escape, returning focus to its button", async ({
      page,
      harness,
    }) => {
      await page.evaluate(() => {
        const { stage } = window.harness;
        const dialog = document.createElement("dialog");
        dialog.style.cssText = "width:640px;height:120px;padding:0;overflow:hidden";
        document.body.append(dialog);
        dialog.append(stage);
        stage.style.height = "120px";
        dialog.showModal();
      });
      await harness.mount();
      const gridButton = page.getByRole("button", { name: /^Grid/ });
      await gridButton.click();
      const quarter = page.getByRole("menuitemradio", { name: "Quarter note (1/4)" });
      await expect(quarter).toBeVisible();
      await expect(page.getByRole("menuitemradio", { name: "Sixteenth note (1/16)" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await page.keyboard.press("Escape");
      await expect(quarter).toBeHidden();
      await expect(gridButton).toBeFocused();
      await gridButton.click();
      await quarter.click();
      await expect(page.getByRole("button", { name: /^Grid 1\/4$/ })).toBeVisible();
    });

    test("the open menu is walked with the arrow keys and a choice is made with Enter", async ({ page, harness }) => {
      await harness.mount();
      await page.getByRole("button", { name: /^Grid/ }).click();
      const item = (name: string) => page.getByRole("menuitemradio", { name });
      await expect(item("Sixteenth note (1/16)")).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(item("Eighth note (1/8)")).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(item("Quarter note (1/4)")).toBeFocused();
      await page.keyboard.press("End");
      await expect(item("Sixteenth note (1/16)")).toBeFocused();
      await page.keyboard.press("Home");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: /^Grid 1\/4$/ })).toBeVisible();
      await expect(page.getByRole("menu", { name: "Grid" })).toBeHidden();
    });
  });
});

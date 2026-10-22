// ABOUTME: The browser seam of the editor skill: the shipped example pages, with their imports routed to the local build.
// ABOUTME: The static page keeps its versioned esm.sh specifiers and the bundler page keeps its ./dist/main.js; routing only substitutes the built code.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const version = JSON.parse(readFileSync(new URL("../packages/score-editor/package.json", import.meta.url), "utf8"))
  .version as string;
const origin = `http://127.0.0.1:${process.env.E2E_PORT ?? 4310}`;
const staticPage = "/packages/score-editor/skills/score-editor/assets/static-esm/index.html";
const bundlerPage = "/packages/score-editor/skills/score-editor/assets/pnpm-bundler/index.html";
const coreSpecifier = `https://esm.sh/@neta-art/score-editor@${version}?bundle&target=es2022`;
const dialectSpecifier = `https://esm.sh/@neta-art/score-dialect-song2@${version}?bundle&target=es2022`;
const coreLocal = "/packages/score-editor/dist/index.js";
const dialectLocal = "/packages/score-dialect-song2/dist/index.js";
const bundleRequest = "/packages/score-editor/skills/score-editor/assets/pnpm-bundler/dist/main.js";
const bundleFile = fileURLToPath(new URL("./page/skill/pnpm-bundler.js", import.meta.url));

async function expectExampleWorks(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Zoom 100%", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Bars" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Chords" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Vocal" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Ins" })).toBeVisible();

  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();

  const status = page.getByRole("status");
  await expect(status).toHaveText("Ready: 1 custom tool registered.");

  const vocalNotes = page.getByRole("list", { name: "Vocal" }).getByRole("listitem");
  const before = await vocalNotes.count();
  expect(before).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Select notes", exact: true }).click();
  await expect(status).toHaveText(/^Selected \d+ Vocal notes\.$/);
  await page.getByRole("button", { name: "Run tool", exact: true }).click();
  await expect(status).toHaveText(/^The tool produced \d+ commands as one undo step\.$/);
  const produced = Number((await status.textContent())?.match(/\d+/)?.[0] ?? "0");
  expect(produced).toBeGreaterThan(0);
  await expect(vocalNotes).toHaveCount(before - produced);

  await page.getByRole("button", { name: "Read score", exact: true }).click();
  await expect(status).toHaveText(/^Read 2 voices, 4 bars and \d+ notes with the song2 dialect\.$/);
  await page.getByRole("button", { name: "Write back", exact: true }).click();
  await expect(status).toHaveText(/^Wrote the score back: .+ is now a rest\. The text is in the box below\.$/);
  await expect(page.getByRole("log", { name: "Written score" })).toContainText("X:1");
  await expect(page.getByRole("log", { name: "Written score" })).toContainText("T:");
}

test.describe("the editor skill: the static page", () => {
  test("mounts parts on its own layout, runs a custom tool, and reads and writes the score", async ({ page }) => {
    const requests: string[] = [];
    const fulfilled: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.route(
      (url) => url.href === coreSpecifier || url.href === dialectSpecifier,
      async (route) => {
        const url = route.request().url();
        fulfilled.push(url);
        const body =
          url === coreSpecifier
            ? `export * from "${origin}${coreLocal}";`
            : `export * from "${origin}${dialectLocal}";`;
        await route.fulfill({ contentType: "text/javascript", body });
      },
    );

    await page.goto(staticPage);
    await expectExampleWorks(page);

    expect(fulfilled.sort(), "both module specifiers were answered from the local build").toEqual(
      [coreSpecifier, dialectSpecifier].sort(),
    );
    expect(
      requests.filter((url) => url.startsWith("https://esm.sh/") && !fulfilled.includes(url)),
      "no request escapes to esm.sh",
    ).toEqual([]);
    expect(
      requests.some((url) => url.includes(coreLocal)),
      "the page loads the local core module",
    ).toBe(true);
    expect(
      requests.some((url) => url.includes(dialectLocal)),
      "the page loads the local dialect module",
    ).toBe(true);
  });
});

test.describe("the editor skill: the pnpm project bundled by esbuild", () => {
  test("mounts parts on its own layout, runs a custom tool, and reads and writes the score", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.route(
      (url) => url.pathname === bundleRequest,
      (route) => route.fulfill({ path: bundleFile, contentType: "text/javascript" }),
    );

    await page.goto(bundlerPage);
    await expectExampleWorks(page);

    expect(
      requests.some((url) => url.includes("esm.sh")),
      "no request goes to esm.sh",
    ).toBe(false);
    expect(
      requests.some((url) => new URL(url).pathname === bundleRequest),
      "the page asks for the script build:skill writes",
    ).toBe(true);
  });
});

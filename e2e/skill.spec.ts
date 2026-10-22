// ABOUTME: The browser seam of the editor skill: both runnable examples, driven as a reader drives them.
// ABOUTME: The static example keeps its esm.sh URLs and an import map points those specifiers at the local build; the bundler example is built with that alias.
import { expect, test } from "@playwright/test";

const examples = [
  { name: "the static page that imports from esm.sh", path: "/e2e/page/skill-static.html", static: true },
  { name: "the pnpm project bundled by esbuild", path: "/e2e/page/skill-bundler.html", static: false },
];

for (const example of examples) {
  test.describe(`the editor skill: ${example.name}`, () => {
    test("mounts parts on its own layout, runs a custom tool, and reads and writes the score", async ({ page }) => {
      const requests: string[] = [];
      page.on("request", (request) => requests.push(request.url()));

      await page.goto(example.path);

      // Several view parts, each on a slot this page made, sharing one editing session.
      await expect(page.getByRole("button", { name: "Zoom 100%", exact: true })).toBeVisible();
      await expect(page.getByRole("list", { name: "Bars" })).toBeVisible();
      await expect(page.getByRole("list", { name: "Chords" })).toBeVisible();
      await expect(page.getByRole("list", { name: "Vocal" })).toBeVisible();
      await expect(page.getByRole("list", { name: "Ins" })).toBeVisible();

      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await expect(page.getByRole("button", { name: "Zoom 150%", exact: true })).toBeVisible();

      const status = page.getByRole("status");
      await expect(status).toHaveText("Ready: 1 custom tool registered.");

      // The tool the page registered, run through the session as one undoable step.
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

      // The headless layer reads the score, and writes a command back to the page's project.
      await page.getByRole("button", { name: "Read score", exact: true }).click();
      await expect(status).toHaveText(/^Read 2 voices, 4 bars and \d+ notes with the song2 dialect\.$/);
      await page.getByRole("button", { name: "Write back", exact: true }).click();
      await expect(status).toHaveText(/^Wrote the score back: .+ is now a rest\. The text is in the box below\.$/);
      await expect(page.getByRole("log", { name: "Written score" })).toContainText("X:1");
      await expect(page.getByRole("log", { name: "Written score" })).toContainText("T:");

      // Nothing came from the network beyond this server: the example imports the local build, not the published one.
      expect(
        requests.some((url) => url.includes("esm.sh")),
        "no request reaches esm.sh",
      ).toBe(false);
      if (example.static) {
        expect(
          requests.some((url) => url.includes("/packages/score-editor/dist/index.js")),
          "the static example loads the local core build",
        ).toBe(true);
        expect(
          requests.some((url) => url.includes("/packages/score-dialect-song2/dist/index.js")),
          "the static example loads the local dialect build",
        ).toBe(true);
      } else {
        expect(
          requests.some((url) => url.includes("/e2e/page/skill/pnpm-bundler.js")),
          "the bundler example loads the bundle built for the test",
        ).toBe(true);
      }
    });
  });
}

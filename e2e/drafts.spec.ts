// ABOUTME: Seam 5 for drafts in the mounted editor: a fake host store records every call, and the tests read what the editor sent it.
// ABOUTME: The debounce runs on the page's faked clock; the conflict, the failure and the inheritance are caused by what the store holds.
import { createHash } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { box, expect, expectCount, type Harness, test, vocalOnly } from "./fixtures";

/** Four quarter notes, then a whole note. */
const QUARTERS = vocalOnly("C4D4E4F4|G16|");
/** The same score with the D, then the D and the E, then the D, the E and the F turned into rests, written out by hand. */
const WITHOUT_D = QUARTERS.replace("C4D4E4F4|", "C4z4E4F4|");
const WITHOUT_D_E_F = QUARTERS.replace("C4D4E4F4|", "C4z4z4z4|");

const D4 = "D4, bar 1 beat 2, length 1 beat";
const E4 = "E4, bar 1 beat 3, length 1 beat";
const F4 = "F4, bar 1 beat 4, length 1 beat";

/** The debounce of a draft write, in milliseconds. */
const DEBOUNCE_MS = 1000;

/** What the page's fake store was called with, as `window.harness.drafts.calls()` records it. */
interface StoreCall {
  method: "read" | "write" | "remove" | "list";
  key?: string;
  text?: string;
  expected?: string | null;
  result?: string | null;
}

/** The fake store of the test page, as the page exposes it. */
interface PageStore {
  calls(): StoreCall[];
  seed(key: string, text: string): string;
  external(key: string, text: string): string;
  file(key: string): { text: string; version: string } | null;
  failNext(method: "read" | "write" | "remove" | "list", count?: number): void;
  hold(): void;
  release(): void;
}

type PageWithStore = { harness: { drafts: PageStore } };

/** The fake store of the test page, driven from the test. */
class Store {
  constructor(private readonly page: Page) {}

  calls(): Promise<StoreCall[]> {
    return this.page.evaluate(() => (window as unknown as PageWithStore).harness.drafts.calls());
  }

  /** The calls of one kind, in order. */
  async callsOf(method: StoreCall["method"]): Promise<StoreCall[]> {
    return (await this.calls()).filter((call) => call.method === method);
  }

  /** Puts a file in the store before the editor opens; gives back its version. */
  seed(key: string, text: string): Promise<string> {
    return this.page.evaluate(
      ([name, body]) => (window as unknown as PageWithStore).harness.drafts.seed(name as string, body as string),
      [key, text] as const,
    );
  }

  /** Another window writes the file: a version the editor has not seen. */
  external(key: string, text: string): Promise<string> {
    return this.page.evaluate(
      ([name, body]) => (window as unknown as PageWithStore).harness.drafts.external(name as string, body as string),
      [key, text] as const,
    );
  }

  /** What the store holds for the key, or null. */
  fileOf(key: string): Promise<{ text: string; version: string } | null> {
    return this.page.evaluate((name) => (window as unknown as PageWithStore).harness.drafts.file(name), key);
  }

  /** Makes reads wait until `release`, as a slow network does. */
  hold(): Promise<void> {
    return this.page.evaluate(() => (window as unknown as PageWithStore).harness.drafts.hold());
  }

  release(): Promise<void> {
    return this.page.evaluate(() => (window as unknown as PageWithStore).harness.drafts.release());
  }

  /** The next calls of one kind fail. */
  failNext(method: StoreCall["method"], count = 1): Promise<void> {
    return this.page.evaluate(
      ([kind, times]) =>
        (window as unknown as PageWithStore).harness.drafts.failNext(kind as StoreCall["method"], times as number),
      [method, count] as const,
    );
  }
}

/** A draft the way a host would have stored it, with the hashes worked out here and not by the package. */
function storedDraft(options: {
  sourceKey?: string;
  source: { lyrics: string; score: string };
  score: string;
  lyrics?: string;
  lyricLines?: unknown[];
  style?: string;
  seed?: number | null;
  scoreMode?: "full" | "melody";
  handoffHash?: string | null;
  updatedAt?: number;
}): string {
  return JSON.stringify({
    version: 1,
    sourceKey: options.sourceKey ?? "test-page",
    sourceHash: hashOf(options.source.lyrics, options.source.score),
    project: {
      style: options.style ?? "",
      lyrics: options.lyrics ?? options.source.lyrics,
      lyricLines: options.lyricLines ?? [],
      score: options.score,
      scoreMode: options.scoreMode ?? "full",
      seed: options.seed ?? null,
    },
    handoffHash: options.handoffHash ?? null,
    updatedAt: options.updatedAt ?? 1_000,
  });
}

/** The draft a write carried, read back from its JSON text. */
function draftOf(call: { text?: string | undefined } | undefined) {
  if (call?.text === undefined) throw new Error("the call carries no text");
  return JSON.parse(call.text) as {
    version: number;
    sourceKey: string;
    sourceHash: string;
    project: {
      score: string;
      lyrics: string;
      style: string;
      lyricLines: unknown[];
      scoreMode: "full" | "melody";
      seed: number | null;
    };
    handoffHash: string | null;
    updatedAt: number;
  };
}

/** The hash of lyrics and score, worked out here with the platform's own SHA-256 and not with the package's. */
const hashOf = (lyrics: string, score: string) =>
  createHash("sha256")
    .update(JSON.stringify([lyrics, score]), "utf8")
    .digest("hex");

const noteNamed = (page: Page, name: string) => page.getByRole("listitem", { name, exact: true });

/**
 * Stops the faked clock. After `clock.install` time still flows, so on a busy machine the debounce could pass before a
 * check that nothing was written yet.
 */
const stopClock = async (page: Page) => page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));

/**
 * Mounts an editable editor on the fake store with the clock faked and stopped before it is mounted, so that no timer the
 * editor sets while it opens (the debounce of an inherited draft is one) runs before the test says time passes.
 */
async function openEditor(page: Page, harness: Harness, options: Record<string, unknown> = {}) {
  await page.clock.install();
  await stopClock(page);
  await harness.mount({ score: { text: QUARTERS }, drafts: true, ...options });
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
}

test.describe("a draft is written after the edits", () => {
  test("one second after an edit, the edited score is written under the original's key, as a new draft", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);

    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS - 100);
    expect(await store.callsOf("write")).toEqual([]);

    await page.clock.runFor(200);
    await expectCount(() => store.callsOf("write"), 1);
    const [write] = await store.callsOf("write");
    expect(write?.key).toBe("test-page");
    expect(write?.expected).toBeNull();
    const draft = draftOf(write);
    expect(draft.version).toBe(1);
    expect(draft.sourceKey).toBe("test-page");
    expect(draft.sourceHash).toBe(hashOf("", QUARTERS));
    expect(draft.project.score).toBe(WITHOUT_D);
    expect(draft.handoffHash).toBeNull();
  });

  test("several edits in quick succession are one write, of the last score, a second after the last edit", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);

    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(400);
    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(400);
    await press(noteNamed(page, F4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS - 100);
    expect(await store.callsOf("write")).toEqual([]);

    await page.clock.runFor(200);
    await expectCount(() => store.callsOf("write"), 1);
    expect(draftOf((await store.callsOf("write"))[0]).project.score).toBe(WITHOUT_D_E_F);
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toHaveLength(1);
  });
});

test.describe("a draft equal to the original is not kept", () => {
  test("edits that come back to the original remove the draft with the version the editor wrote", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);
    const [write] = await store.callsOf("write");
    expect(write?.result).toMatch(/^v\d+$/);

    await page.keyboard.press("Control+z");
    await expect(page.getByRole("listitem", { name: /^D4,/ })).toBeVisible();
    await page.clock.runFor(DEBOUNCE_MS - 100);
    expect(await store.callsOf("remove")).toEqual([]);
    await page.clock.runFor(200);

    await expectCount(() => store.callsOf("remove"), 1);
    const [removal] = await store.callsOf("remove");
    expect(removal?.key).toBe("test-page");
    expect(removal?.expected).toBe(write?.result);
    expect(await store.fileOf("test-page")).toBeNull();
    expect(await store.callsOf("write")).toHaveLength(1);
  });

  test("an editor opened on an untouched original writes nothing and removes nothing", async ({ page, harness }) => {
    const store = new Store(page);
    await openEditor(page, harness);

    await page.clock.runFor(10 * DEBOUNCE_MS);

    expect(await store.callsOf("write")).toEqual([]);
    expect(await store.callsOf("remove")).toEqual([]);
  });
});

test.describe("opening", () => {
  test("a draft of this original is restored, and restoring it is not an edit to save", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    const version = await store.seed(
      "test-page",
      storedDraft({ source: { lyrics: "", score: QUARTERS }, score: WITHOUT_D }),
    );
    await openEditor(page, harness);

    await expect(noteNamed(page, D4)).toHaveCount(0);
    await expect(noteNamed(page, E4)).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveAttribute("aria-disabled", "true");
    expect(await store.callsOf("read")).toEqual([{ method: "read", key: "test-page", result: version }]);
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toEqual([]);

    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);
    const [write] = await store.callsOf("write");
    expect(write?.expected).toBe(version);
    expect(draftOf(write).project.score).toBe(QUARTERS.replace("C4D4E4F4|", "C4z4z4F4|"));
  });

  test("a draft of an original that has changed since is discarded, and the host is told once", async ({
    page,
    harness,
  }) => {
    const store = new Store(page);
    const older = QUARTERS.replace("G16|", "A16|");
    const version = await store.seed("test-page", storedDraft({ source: { lyrics: "", score: older }, score: older }));
    await openEditor(page, harness);

    await expect(noteNamed(page, D4)).toBeVisible();
    await expectCount(() => store.callsOf("remove"), 1);
    expect(await store.callsOf("remove")).toEqual([
      { method: "remove", key: "test-page", expected: version, result: "removed" },
    ]);
    expect(await store.fileOf("test-page")).toBeNull();
    expect(await harness.notices()).toEqual([
      {
        code: "draft-source-changed",
        level: "warning",
        message: "The original has changed since this draft was saved, so the draft was discarded.",
      },
    ]);
    expect(await store.callsOf("list")).toEqual([]);
  });
});

test.describe("while the draft is being read", () => {
  test("the original is shown, nothing can be edited, and the badge says what is going on", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await store.seed("test-page", storedDraft({ source: { lyrics: "", score: QUARTERS }, score: WITHOUT_D }));
    await store.hold();
    await page.clock.install();
    await stopClock(page);
    await harness.mount({ score: { text: QUARTERS }, drafts: true });

    await expect(page.getByText("Opening draft…", { exact: true })).toBeVisible();
    await expect(page.getByText("Read only", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeHidden();
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await expect(noteNamed(page, D4)).toBeVisible();

    await store.release();

    await expect(page.getByText("Opening draft…")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await expect(noteNamed(page, D4)).toHaveCount(0);
    await expect(noteNamed(page, E4)).toBeVisible();
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toEqual([]);
  });
});

test.describe("a draft that another window changed first", () => {
  /** The score of the other window's draft: its E turned into a rest, and the D left as it is. */
  const THEIRS = QUARTERS.replace("C4D4E4F4|", "C4D4z4F4|");
  /** The score here after the D and the F are turned into rests. */
  const OURS = QUARTERS.replace("C4D4E4F4|", "C4z4E4z4|");
  const overwrite = (page: Page) => page.getByRole("button", { name: "Overwrite with my version" });
  const loadTheirs = (page: Page) => page.getByRole("button", { name: "Load the other version" });

  test("reveals the strip in the chrome without a swipe", async ({ page, harness, press, isMobile }) => {
    const widths = isMobile ? [412, 320] : [1280];
    await page.clock.install();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    for (const width of widths) {
      await page.setViewportSize({ width, height: isMobile ? 839 : 720 });
      await page.evaluate(() => {
        const stage = document.getElementById("stage");
        if (stage) stage.style.height = "420px";
      });
      await harness.mount({ score: { text: QUARTERS }, drafts: true });
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
      const store = new Store(page);
      await press(noteNamed(page, D4));
      await page.keyboard.press("Delete");
      await page.clock.runFor(DEBOUNCE_MS + 100);
      await store.external("test-page", storedDraft({ source: { lyrics: "", score: QUARTERS }, score: THEIRS }));
      await press(noteNamed(page, F4));
      await page.keyboard.press("Delete");
      await page.clock.runFor(DEBOUNCE_MS + 100);
      await expect(page.getByRole("alert")).toBeVisible();
      await page.clock.runFor(50);

      const found = await page.evaluate(() => {
        const chrome = document.querySelector<HTMLElement>(".sce-chrome");
        const strip = document.querySelector<HTMLElement>(".sce-part-draft-conflict .sce-draft-conflict");
        if (!chrome || !strip) return null;
        const outer = chrome.getBoundingClientRect();
        const sentence = strip.querySelector<HTMLElement>(".sce-draft-conflict-text")?.getBoundingClientRect();
        const choices = [...strip.querySelectorAll<HTMLElement>(".sce-draft-choice")].map((choice) => {
          const area = choice.getBoundingClientRect();
          const top = document.elementFromPoint(area.left + area.width / 2, area.top + area.height / 2);
          return {
            inside: area.top >= outer.top - 0.5 && area.bottom <= outer.top + chrome.clientHeight + 0.5,
            hit: top === choice || choice.contains(top),
          };
        });
        return {
          sentenceInside:
            sentence !== undefined &&
            sentence.top >= outer.top - 0.5 &&
            sentence.bottom <= outer.top + chrome.clientHeight + 0.5,
          choices,
        };
      });
      expect(found?.sentenceInside, `${width}: the sentence is in the chrome`).toBe(true);
      expect(
        found?.choices.map((choice) => choice.inside),
        `${width}: both choices are in the chrome`,
      ).toEqual([true, true]);
      expect(
        found?.choices.map((choice) => choice.hit),
        `${width}: both choices are on top`,
      ).toEqual([true, true]);
      await harness.destroy();
    }
  });

  /** Our first edit is saved; another window then writes the draft; our next edit is refused as a conflict. */
  async function conflict(page: Page, press: (target: Locator) => Promise<void>) {
    const store = new Store(page);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);
    const theirs = await store.external(
      "test-page",
      storedDraft({ source: { lyrics: "", score: QUARTERS }, score: THEIRS }),
    );
    await press(noteNamed(page, F4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 2);
    return { store, theirs };
  }

  test("is told to the user inside the editor, with two ways out, and not to the host", async ({
    page,
    harness,
    press,
  }) => {
    await openEditor(page, harness);
    const { store } = await conflict(page, press);

    await expect(page.getByRole("alert")).toHaveText(
      "This draft was changed somewhere else after you opened it. Your changes are not being saved until you choose.",
    );
    await expect(overwrite(page)).toBeVisible();
    await expect(overwrite(page)).toHaveAccessibleDescription(
      "The other version is replaced and can't be brought back.",
    );
    await expect(loadTheirs(page)).toBeVisible();
    await expect(loadTheirs(page)).toHaveAccessibleDescription(
      "It opens here, and your changes in this window are dropped.",
    );
    expect((await store.callsOf("write")).map((call) => call.result)).toEqual([
      expect.stringMatching(/^v\d+$/),
      "conflict",
    ]);
    expect(await harness.notices()).toEqual([]);
  });

  test("the editor goes on editing while it stands, and writes nothing until the user chooses", async ({
    page,
    harness,
    press,
  }) => {
    await openEditor(page, harness);
    const { store } = await conflict(page, press);
    await expect(overwrite(page)).toBeVisible();

    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await expect(noteNamed(page, E4)).toHaveCount(0);
    await page.clock.runFor(5 * DEBOUNCE_MS);

    expect(await store.callsOf("write")).toHaveLength(2);
    await expect(overwrite(page)).toBeVisible();
  });

  test("overwriting writes the user's project over the other version, which the editor reads first", async ({
    page,
    harness,
    press,
  }) => {
    await openEditor(page, harness);
    const { store, theirs } = await conflict(page, press);

    await press(overwrite(page));

    await expect(overwrite(page)).toBeHidden();
    await expectCount(() => store.callsOf("write"), 3);
    const write = (await store.callsOf("write"))[2];
    expect(write?.expected).toBe(theirs);
    expect(write?.result).toMatch(/^v\d+$/);
    expect(draftOf(write).project.score).toBe(OURS);
    expect(draftOf({ text: (await store.fileOf("test-page"))?.text }).project.score).toBe(OURS);
    await expect(noteNamed(page, D4)).toHaveCount(0);
    await expect(noteNamed(page, F4)).toHaveCount(0);
    expect(await harness.notices()).toEqual([]);

    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 4);
    expect((await store.callsOf("write"))[3]?.expected).toBe(write?.result);
  });

  test("while the store answers the first press, both choices are off and a second press does nothing", async ({
    page,
    harness,
    press,
  }) => {
    await openEditor(page, harness);
    const { store } = await conflict(page, press);
    const readsBefore = (await store.callsOf("read")).length;
    await store.hold();

    await press(overwrite(page));
    await expect(overwrite(page)).toHaveAttribute("aria-disabled", "true");
    await expect(loadTheirs(page)).toHaveAttribute("aria-disabled", "true");
    // Playwright does not press what is aria-disabled, so the second presses are sent as the click a script could make.
    await overwrite(page).dispatchEvent("click");
    await loadTheirs(page).dispatchEvent("click");
    await store.release();

    await expect(overwrite(page)).toBeHidden();
    expect((await store.callsOf("read")).length - readsBefore).toBe(1);
    expect(await store.callsOf("write")).toHaveLength(3);
    await expect(noteNamed(page, F4)).toHaveCount(0);
  });

  test("loading the other version shows it in the editor and writes nothing", async ({ page, harness, press }) => {
    await openEditor(page, harness);
    const { store, theirs } = await conflict(page, press);
    await expect(noteNamed(page, D4)).toHaveCount(0);

    await press(loadTheirs(page));

    await expect(loadTheirs(page)).toBeHidden();
    await expect(noteNamed(page, D4)).toBeVisible();
    await expect(noteNamed(page, E4)).toHaveCount(0);
    await expect(noteNamed(page, F4)).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveAttribute("aria-disabled", "true");
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toHaveLength(2);
    expect(await store.callsOf("remove")).toEqual([]);
    expect((await store.fileOf("test-page"))?.version).toBe(theirs);

    await press(noteNamed(page, F4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 3);
    expect((await store.callsOf("write"))[2]?.expected).toBe(theirs);
  });

  test("the strip takes no focus, and Restore original stays there during it", async ({ page, harness, press }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);
    await store.external("test-page", storedDraft({ source: { lyrics: "", score: QUARTERS }, score: THEIRS }));

    await press(noteNamed(page, F4));
    const remove = page.getByRole("button", { name: "Delete", exact: true });
    await remove.focus();
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(remove).toBeFocused();
    await expect(overwrite(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore original", exact: true })).toBeVisible();
    expect((await store.callsOf("write"))[1]?.result).toBe("conflict");
  });
});

test.describe("a save that fails", () => {
  test("is told to the host in one sentence, and the next edit tries again", async ({ page, harness, press }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await store.failNext("write");

    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);

    await expectCount(() => harness.notices(), 1);
    expect(await harness.notices()).toEqual([
      {
        code: "draft-save-failed",
        level: "error",
        message: "The draft was not saved or cleared. The next change tries again.",
      },
    ]);
    expect((await store.callsOf("write")).map((call) => call.result)).toEqual(["failed"]);
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toHaveLength(1);

    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 2);
    const second = (await store.callsOf("write"))[1];
    expect(second?.expected).toBeNull();
    expect(second?.result).toMatch(/^v\d+$/);
    expect(draftOf(second).project.score).toBe(QUARTERS.replace("C4D4E4F4|", "C4z4z4F4|"));
    expect(await harness.notices()).toHaveLength(1);
  });
});

test.describe("restoring the original", () => {
  const restore = (page: Page) => page.getByRole("button", { name: "Restore original", exact: true });
  const question = (page: Page) => page.getByRole("dialog", { name: "Go back to the original score?" });

  /** An editor opened on a saved draft (the D is a rest), with the E also turned into a rest and saved. */
  async function editedTwice(page: Page, harness: Harness, press: (target: Locator) => Promise<void>) {
    const store = new Store(page);
    await store.seed("test-page", storedDraft({ source: { lyrics: "", score: QUARTERS }, score: WITHOUT_D }));
    await openEditor(page, harness);
    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);
    return store;
  }

  test("asks once, in the editor, what will be lost; Cancel changes nothing", async ({ page, harness, press }) => {
    const store = await editedTwice(page, harness, press);

    await press(restore(page));

    await expect(question(page)).toBeVisible();
    await expect(question(page)).toContainText(
      "Every change you made is discarded and the saved draft is deleted. You can't undo this.",
    );
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    const asked = await box(question(page));
    const viewport = page.viewportSize();
    expect(asked.x).toBeGreaterThanOrEqual(0);
    expect(asked.x + asked.width).toBeLessThanOrEqual(viewport?.width ?? 0);

    await press(page.getByRole("button", { name: "Cancel", exact: true }));

    await expect(question(page)).toBeHidden();
    await expect(restore(page)).toBeFocused();
    await expect(noteNamed(page, D4)).toHaveCount(0);
    await expect(noteNamed(page, E4)).toHaveCount(0);
    expect(await store.callsOf("remove")).toEqual([]);
  });

  test("Restore original shows the original, removes the draft with the version the editor wrote, and says so", async ({
    page,
    harness,
    press,
  }) => {
    const store = await editedTwice(page, harness, press);
    const [write] = await store.callsOf("write");
    await press(restore(page));

    await press(question(page).getByRole("button", { name: "Restore original", exact: true }));

    await expect(question(page)).toBeHidden();
    await expect(noteNamed(page, D4)).toBeVisible();
    await expect(noteNamed(page, E4)).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveAttribute("aria-disabled", "true");
    await expectCount(() => store.callsOf("remove"), 1);
    expect((await store.callsOf("remove"))[0]).toMatchObject({
      key: "test-page",
      expected: write?.result,
      result: "removed",
    });
    expect(await store.fileOf("test-page")).toBeNull();
    await expect(page.getByRole("status").filter({ hasText: "The original score is back" })).toHaveCount(1);
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toHaveLength(1);
    expect(await harness.notices()).toEqual([]);
  });

  test("a removal that fails shows the original and says the draft could not be cleared", async ({
    page,
    harness,
    press,
  }) => {
    const store = await editedTwice(page, harness, press);
    await store.failNext("remove");

    await press(restore(page));
    await press(question(page).getByRole("button", { name: "Restore original", exact: true }));

    await expect(noteNamed(page, D4)).toBeVisible();
    await expect(noteNamed(page, E4)).toBeVisible();
    await expectCount(() => store.callsOf("remove"), 1);
    expect((await store.callsOf("remove"))[0]?.result).toBe("failed");
    expect(await store.fileOf("test-page")).not.toBeNull();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "The original score is back, but the saved draft could not be deleted" }),
    ).toHaveCount(1);
    expect(await harness.notices()).toEqual([
      {
        code: "draft-save-failed",
        level: "error",
        message: "The draft was not saved or cleared. The next change tries again.",
      },
    ]);
  });

  test("an edit not yet saved is dropped with the rest, and nothing is written", async ({ page, harness, press }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await expect(noteNamed(page, D4)).toHaveCount(0);

    await press(restore(page));
    await press(question(page).getByRole("button", { name: "Restore original", exact: true }));
    await expect(noteNamed(page, D4)).toBeVisible();
    await page.clock.runFor(5 * DEBOUNCE_MS);

    expect(await store.callsOf("write")).toEqual([]);
    expect(await store.callsOf("remove")).toEqual([]);
  });

  test("the control is not there while the editor is read-only, and follows update from one to the other", async ({
    page,
    harness,
  }) => {
    await page.clock.install();
    await harness.mount({ score: { text: QUARTERS }, drafts: true, editable: false });
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();
    await expect(restore(page)).toHaveCount(0);

    await harness.update({ editable: true });
    await expect(restore(page)).toBeVisible();
    await harness.update({ editable: false });
    await expect(restore(page)).toHaveCount(0);
  });

  test("the Escape key closes the question and gives the focus back to the button", async ({
    page,
    harness,
    isMobile,
  }) => {
    test.skip(isMobile, "keys are checked on the desktop project");
    await openEditor(page, harness);
    await restore(page).click();
    await expect(question(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(question(page)).toBeHidden();
    await expect(restore(page)).toBeFocused();
  });
});

test.describe("a new song inherits the lyric lines of the draft it was regenerated from", () => {
  const LYRICS = "[a]\nla la";
  const LINES = [{ text: "la la", phrase: { firstBar: 0, barCount: 2 } }];
  const newSong = { lyrics: LYRICS, sourceKey: "new-song" };

  test("the draft whose handoff hash is this song's hash gives its lines, saved under the new key", async ({
    page,
    harness,
  }) => {
    const store = new Store(page);
    await store.seed(
      "old-song",
      storedDraft({
        sourceKey: "old-song",
        source: { lyrics: "[a]\nold words", score: QUARTERS.replace("G16|", "A16|") },
        score: QUARTERS,
        lyrics: LYRICS,
        lyricLines: LINES,
        handoffHash: hashOf(LYRICS, QUARTERS),
      }),
    );
    await openEditor(page, harness, { project: newSong });

    await expectCount(() => store.callsOf("list"), 1);
    expect((await store.callsOf("read")).map((call) => call.key)).toEqual(["new-song", "old-song"]);
    expect(await store.callsOf("write")).toEqual([]);

    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);
    const [write] = await store.callsOf("write");
    expect(write?.key).toBe("new-song");
    expect(write?.expected).toBeNull();
    const draft = draftOf(write);
    expect(draft.sourceKey).toBe("new-song");
    expect(draft.sourceHash).toBe(hashOf(LYRICS, QUARTERS));
    expect(draft.project.lyricLines).toEqual(LINES);
    expect(draft.project.score).toBe(QUARTERS);
    expect(draft.handoffHash).toBeNull();
    expect(await store.fileOf("old-song")).not.toBeNull();
    expect(await store.callsOf("remove")).toEqual([]);
  });

  test("a draft whose handoff hash is another song's is not inherited", async ({ page, harness }) => {
    const store = new Store(page);
    await store.seed(
      "old-song",
      storedDraft({
        sourceKey: "old-song",
        source: { lyrics: "[a]\nold words", score: QUARTERS },
        score: QUARTERS,
        lyrics: LYRICS,
        lyricLines: LINES,
        handoffHash: hashOf("[a]\nsome other words", QUARTERS),
      }),
    );
    await openEditor(page, harness, { project: newSong });

    await expectCount(() => store.callsOf("list"), 1);
    await page.clock.runFor(10 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toEqual([]);
  });
});

test.describe("when nothing may be written", () => {
  test("a read-only editor never calls the store, and a press of Delete changes nothing in it", async ({
    page,
    harness,
  }) => {
    const store = new Store(page);
    await store.seed("test-page", storedDraft({ source: { lyrics: "", score: QUARTERS }, score: WITHOUT_D }));
    await page.clock.install();
    await harness.mount({ score: { text: QUARTERS }, drafts: true, editable: false });
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();

    await page.keyboard.press("Delete");
    await page.clock.runFor(10 * DEBOUNCE_MS);

    expect(await store.calls()).toEqual([]);
    await expect(noteNamed(page, D4)).toBeVisible();
    expect(await harness.notices()).toEqual([]);
  });

  test("an editor mounted without a store never calls one, and offers no way to restore", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await page.clock.install();
    await harness.mount({ score: { text: QUARTERS } });
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();

    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(10 * DEBOUNCE_MS);

    await expect(noteNamed(page, D4)).toHaveCount(0);
    expect(await store.calls()).toEqual([]);
    await expect(page.getByRole("button", { name: "Restore original" })).toHaveCount(0);
  });

  test("an editor without a store builds no restore control and no strip, and builds both when a store arrives", async ({
    page,
    harness,
  }) => {
    const restore = page.getByRole("button", { name: "Restore original", exact: true });
    const strip = page.locator(".sce-part-draft-conflict");
    await page.clock.install();
    await harness.mount({ score: { text: QUARTERS } });
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();

    await expect(restore).toHaveCount(0);
    await expect(page.locator(".sce-restore-button")).toHaveCount(0);
    await expect(page.locator(".sce-restore-popover")).toHaveCount(0);
    await expect(strip).toHaveCount(0);

    await harness.update({ drafts: true });
    await expect(restore).toBeVisible();
    await expect(strip).toHaveCount(1);

    await harness.update({ drafts: false });
    await expect(restore).toHaveCount(0);
    await expect(strip).toHaveCount(0);
  });
});

test.describe("update and destroy with drafts", () => {
  /** A second song's score: the same as QUARTERS but for the last note. */
  const OTHER = QUARTERS.replace("G16|", "A16|");
  const a4 = (page: Page) => page.getByRole("listitem", { name: /^A4,/ });

  test("a new score for the same key is a new original: the old draft is discarded and told, and nothing is saved for the new one", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);
    const [write] = await store.callsOf("write");

    await harness.update({ score: { text: OTHER } });

    await expect(a4(page)).toBeVisible();
    await expect(noteNamed(page, D4)).toBeVisible();
    await expectCount(() => store.callsOf("remove"), 1);
    expect((await store.callsOf("remove"))[0]).toMatchObject({ key: "test-page", expected: write?.result });
    expect((await harness.notices()).map((notice) => notice.code)).toEqual(["draft-source-changed"]);
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toHaveLength(1);
  });

  test("a new song under another key saves what was pending for the old one, and opens the new one on its own key", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");

    await harness.update({ project: { sourceKey: "other-song" }, score: { text: OTHER } });

    await expect(a4(page)).toBeVisible();
    await expectCount(() => store.callsOf("write"), 1);
    const [write] = await store.callsOf("write");
    expect(write?.key).toBe("test-page");
    expect(write?.expected).toBeNull();
    expect(draftOf(write).sourceHash).toBe(hashOf("", QUARTERS));
    expect(draftOf(write).project.score).toBe(WITHOUT_D);
    // The new keeper reads its own key, then looks through the listed drafts for one to inherit: the old song's draft, just written, is one of them and is not inherited.
    await expect
      .poll(async () => (await store.callsOf("read")).map((call) => call.key))
      .toEqual(["test-page", "other-song", "test-page"]);
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toHaveLength(1);
    expect(await harness.notices()).toEqual([]);
  });

  test("passing the same original again does not take the user's edits away or remove their draft", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);

    await harness.update({ score: { text: QUARTERS } });
    await page.clock.runFor(5 * DEBOUNCE_MS);

    await expect(noteNamed(page, D4)).toHaveCount(0);
    expect(await store.callsOf("remove")).toEqual([]);
    expect(await store.fileOf("test-page")).not.toBeNull();
  });

  test("taking the store away saves what was pending, and nothing is saved afterwards", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");

    await harness.update({ drafts: false });

    await expectCount(() => store.callsOf("write"), 1);
    await expect(page.getByRole("button", { name: "Restore original" })).toHaveCount(0);
    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toHaveLength(1);
    await expect(noteNamed(page, E4)).toHaveCount(0);
  });

  test("giving a store to an editor that had none opens the draft and saves from then on", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await store.seed("test-page", storedDraft({ source: { lyrics: "", score: QUARTERS }, score: WITHOUT_D }));
    await page.clock.install();
    await harness.mount({ score: { text: QUARTERS } });
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    expect(await store.calls()).toEqual([]);

    await harness.update({ drafts: true });

    await expect(page.getByRole("button", { name: "Restore original" })).toBeVisible();
    await expect(noteNamed(page, D4)).toHaveCount(0);
    expect((await store.callsOf("read")).map((call) => call.key)).toEqual(["test-page"]);
    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);
  });

  test("destroying the editor saves what was pending, once, and the store is not called again", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");

    await harness.destroy();

    await expectCount(() => store.callsOf("write"), 1);
    expect(draftOf((await store.callsOf("write"))[0]).project.score).toBe(WITHOUT_D);
    const calls = (await store.calls()).length;
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect((await store.calls()).length).toBe(calls);
  });
});

test.describe("the host changes a field that is not part of the original", () => {
  /** The fields a host can change that a project command carries, each with a value other than the page's own. */
  const FIELDS = [
    { field: "style", value: "jazz" },
    { field: "seed", value: 7 },
    { field: "scoreMode", value: "melody" },
  ] as const;

  /** The D is turned into a rest, and the draft with that is saved. */
  async function editedAndSaved(page: Page, harness: Harness, press: (target: Locator) => Promise<void>) {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);
    return store;
  }

  for (const { field, value } of FIELDS) {
    test(`a new ${field} keeps the user's edits, and the draft is saved with the edits and the new ${field}`, async ({
      page,
      harness,
      press,
    }) => {
      const store = await editedAndSaved(page, harness, press);
      const [first] = await store.callsOf("write");

      await harness.update({ project: { [field]: value } });
      await page.clock.runFor(DEBOUNCE_MS + 100);

      await expect(noteNamed(page, D4)).toHaveCount(0);
      await expectCount(() => store.callsOf("write"), 2);
      const second = (await store.callsOf("write"))[1];
      expect(second?.expected).toBe(first?.result);
      expect(draftOf(second).project.score).toBe(WITHOUT_D);
      expect(draftOf(second).project[field]).toBe(value);
      expect((await store.callsOf("read")).map((call) => call.key)).toEqual(["test-page"]);
      expect(await store.callsOf("remove")).toEqual([]);
      expect(await harness.notices()).toEqual([]);
    });
  }

  test("two fields changed in one update are both carried, as one history step", async ({ page, harness, press }) => {
    const store = await editedAndSaved(page, harness, press);

    await harness.update({ project: { style: "jazz", seed: 7 } });
    await page.clock.runFor(DEBOUNCE_MS + 100);

    await expectCount(() => store.callsOf("write"), 2);
    const { project } = draftOf((await store.callsOf("write"))[1]);
    expect(project.style).toBe("jazz");
    expect(project.seed).toBe(7);
    expect(project.score).toBe(WITHOUT_D);

    await press(page.getByRole("button", { name: "Undo", exact: true }));
    await page.clock.runFor(DEBOUNCE_MS + 100);

    await expectCount(() => store.callsOf("write"), 3);
    const undone = draftOf((await store.callsOf("write"))[2]).project;
    expect(undone.style).toBe("");
    expect(undone.seed).toBeNull();
    expect(undone.score).toBe(WITHOUT_D);
  });

  test("a value that the project commands refuse is told to the host, and the fields beside it are still carried", async ({
    page,
    harness,
    press,
  }) => {
    const store = await editedAndSaved(page, harness, press);

    await harness.update({ project: { style: "jazz", seed: 1.5 } });
    await page.clock.runFor(DEBOUNCE_MS + 100);

    await expectCount(() => harness.notices(), 1);
    expect((await harness.notices())[0]).toMatchObject({ code: "command-refused", level: "warning" });
    await expectCount(() => store.callsOf("write"), 2);
    const { project } = draftOf((await store.callsOf("write"))[1]);
    expect(project.style).toBe("jazz");
    expect(project.seed).toBeNull();
  });

  test("a draft that was opened is not restored over the host's new style", async ({ page, harness, press }) => {
    const store = new Store(page);
    await store.seed(
      "test-page",
      storedDraft({ source: { lyrics: "", score: QUARTERS }, score: WITHOUT_D, style: "stored" }),
    );
    await openEditor(page, harness);
    await expect(noteNamed(page, D4)).toHaveCount(0);

    await harness.update({ project: { style: "jazz" } });
    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);

    await expectCount(() => store.callsOf("write"), 1);
    const { project } = draftOf((await store.callsOf("write"))[0]);
    expect(project.style).toBe("jazz");
    expect(project.score).toBe(QUARTERS.replace("C4D4E4F4|", "C4z4z4F4|"));
    await expect(noteNamed(page, D4)).toHaveCount(0);
    expect((await store.callsOf("read")).map((call) => call.key)).toEqual(["test-page"]);
  });

  test("a style that arrives while the draft is still being read is carried after it, and not lost to it", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await store.seed(
      "test-page",
      storedDraft({ source: { lyrics: "", score: QUARTERS }, score: WITHOUT_D, style: "stored" }),
    );
    await store.hold();
    await page.clock.install();
    await stopClock(page);
    await harness.mount({ score: { text: QUARTERS }, drafts: true });
    await expect(page.getByText("Opening draft…", { exact: true })).toBeVisible();

    await harness.update({ project: { style: "jazz" } });
    await store.release();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await press(noteNamed(page, E4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);

    await expectCount(() => store.callsOf("write"), 1);
    const { project } = draftOf((await store.callsOf("write"))[0]);
    expect(project.style).toBe("jazz");
    expect(project.score).toBe(QUARTERS.replace("C4D4E4F4|", "C4z4z4F4|"));
  });
});

test.describe("other changes to the options with drafts", () => {
  test("new lyrics for the same key and score are a new original: the old draft is discarded and told", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expectCount(() => store.callsOf("write"), 1);

    await harness.update({ project: { lyrics: "[a]\nnew words" } });

    await expect(noteNamed(page, D4)).toBeVisible();
    await expectCount(() => store.callsOf("remove"), 1);
    expect((await harness.notices()).map((notice) => notice.code)).toEqual(["draft-source-changed"]);
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toHaveLength(1);
  });

  test("making the editor read only saves what was pending and ends the keeper; making it editable opens the draft again", async ({
    page,
    harness,
    press,
  }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");

    await harness.update({ editable: false });

    await expectCount(() => store.callsOf("write"), 1);
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore original" })).toHaveCount(0);
    const calls = (await store.calls()).length;
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect((await store.calls()).length).toBe(calls);

    await harness.update({ editable: true });

    await expect(page.getByRole("button", { name: "Restore original" })).toBeVisible();
    expect((await store.callsOf("read")).map((call) => call.key)).toEqual(["test-page", "test-page"]);
    await expect(noteNamed(page, D4)).toHaveCount(0);
    await page.clock.runFor(5 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toHaveLength(1);
  });
});

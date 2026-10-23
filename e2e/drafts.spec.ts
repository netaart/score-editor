// ABOUTME: Seam 5 for drafts in the mounted editor: a fake host store records every call, and the tests read what the editor sent it.
// ABOUTME: The debounce runs on the page's faked clock; the conflict, the failure and the inheritance are caused by what the store holds.
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, type Harness, test, vocalOnly } from "./fixtures";

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

  /** What the store holds for the key, or null. */
  fileOf(key: string): Promise<{ text: string; version: string } | null> {
    return this.page.evaluate((name) => (window as unknown as PageWithStore).harness.drafts.file(name), key);
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
  handoffHash?: string | null;
  updatedAt?: number;
}): string {
  return JSON.stringify({
    version: 1,
    sourceKey: options.sourceKey ?? "test-page",
    sourceHash: hashOf(options.source.lyrics, options.source.score),
    project: {
      style: "",
      lyrics: options.lyrics ?? options.source.lyrics,
      lyricLines: options.lyricLines ?? [],
      score: options.score,
      scoreMode: "full",
      seed: null,
    },
    handoffHash: options.handoffHash ?? null,
    updatedAt: options.updatedAt ?? 1_000,
  });
}

/** The draft a write carried, read back from its JSON text. */
function draftOf(call: StoreCall | undefined) {
  if (call?.text === undefined) throw new Error("the call carries no text");
  return JSON.parse(call.text) as {
    version: number;
    sourceKey: string;
    sourceHash: string;
    project: { score: string; lyrics: string; style: string; lyricLines: unknown[] };
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
    await expect.poll(async () => (await store.callsOf("write")).length).toBe(1);
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
    await expect.poll(async () => (await store.callsOf("write")).length).toBe(1);
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
    await expect.poll(async () => (await store.callsOf("write")).length).toBe(1);
    const [write] = await store.callsOf("write");
    expect(write?.result).toMatch(/^v\d+$/);

    await page.keyboard.press("Control+z");
    await expect(page.getByRole("listitem", { name: /^D4,/ })).toBeVisible();
    await page.clock.runFor(DEBOUNCE_MS - 100);
    expect(await store.callsOf("remove")).toEqual([]);
    await page.clock.runFor(200);

    await expect.poll(async () => (await store.callsOf("remove")).length).toBe(1);
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
    await expect.poll(async () => (await store.callsOf("write")).length).toBe(1);
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
    await expect.poll(async () => (await store.callsOf("remove")).length).toBe(1);
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

test.describe("a save that fails", () => {
  test("is told to the host in one sentence, and the next edit tries again", async ({ page, harness, press }) => {
    const store = new Store(page);
    await openEditor(page, harness);
    await store.failNext("write");

    await press(noteNamed(page, D4));
    await page.keyboard.press("Delete");
    await page.clock.runFor(DEBOUNCE_MS + 100);

    await expect.poll(async () => (await harness.notices()).length).toBe(1);
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
    await expect.poll(async () => (await store.callsOf("write")).length).toBe(2);
    const second = (await store.callsOf("write"))[1];
    expect(second?.expected).toBeNull();
    expect(second?.result).toMatch(/^v\d+$/);
    expect(draftOf(second).project.score).toBe(QUARTERS.replace("C4D4E4F4|", "C4z4z4F4|"));
    expect(await harness.notices()).toHaveLength(1);
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

    await expect.poll(async () => (await store.callsOf("list")).length).toBe(1);
    expect((await store.callsOf("read")).map((call) => call.key)).toEqual(["new-song", "old-song"]);
    expect(await store.callsOf("write")).toEqual([]);

    await page.clock.runFor(DEBOUNCE_MS + 100);
    await expect.poll(async () => (await store.callsOf("write")).length).toBe(1);
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

    await expect.poll(async () => (await store.callsOf("list")).length).toBe(1);
    await page.clock.runFor(10 * DEBOUNCE_MS);
    expect(await store.callsOf("write")).toEqual([]);
  });
});

test.describe("when nothing may be written", () => {
  test("a read-only editor never calls the store, whatever is done to it", async ({ page, harness }) => {
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
});

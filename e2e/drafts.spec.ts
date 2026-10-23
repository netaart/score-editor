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

/** Mounts an editable editor on the fake store with the clock faked and stopped once the editing controls are there. */
async function openEditor(page: Page, harness: Harness, options: Record<string, unknown> = {}) {
  await page.clock.install();
  await harness.mount({ score: { text: QUARTERS }, drafts: true, ...options });
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await stopClock(page);
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

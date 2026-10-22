// ABOUTME: Playwright fixtures of the mount seam: a harness that drives the test page, plus real touch input.
// ABOUTME: Tests talk to the page only through window.harness and through what a user can see and do.
import { test as base, type Page } from "@playwright/test";

export interface Point {
  x: number;
  y: number;
}

/** The editing session as the test page exposes it: what the parts spec reads and drives. */
interface PageSession {
  project: { score: string };
  view: { zoom: number; scrollLeft: number; language: string };
  reading: { kind: string; score?: { notes: Array<{ id: string; voice: string; midi: number | null }> } };
  canUndo: boolean;
  canRedo: boolean;
  dispatch(command: unknown): { ok: boolean; diagnostics: Array<{ code: string }> };
  undo(): boolean;
  redo(): boolean;
  setView(patch: Record<string, unknown>): void;
  replaceProject(project: unknown): void;
}

interface PageLayout {
  /** Set while a layout is open; the page holds null otherwise. */
  session: PageSession;
  slots: Record<string, HTMLElement>;
  shadowRoot: ShadowRoot | null;
  host: HTMLElement | null;
  open(options?: Record<string, unknown>): Promise<void>;
  replace(options: Record<string, unknown>): Promise<void>;
  mountPart(name: string): void;
  destroyPart(name: string, times?: number): void;
  roots(): Record<string, string>;
  freshRoots(): Record<string, string>;
  close(): void;
}

interface PageHarness {
  stage: HTMLElement;
  layout: PageLayout;
  shadowRoot: ShadowRoot | null;
  mount(options?: Record<string, unknown>): Promise<void>;
  update(options: Record<string, unknown>): Promise<void>;
  destroy(): void;
}

declare global {
  interface Window {
    harness: PageHarness;
  }
}

export class Harness {
  constructor(readonly page: Page) {}

  mount(options: Record<string, unknown> = {}) {
    return this.page.evaluate((o) => window.harness.mount(o), options);
  }

  update(options: Record<string, unknown>) {
    return this.page.evaluate((o) => window.harness.update(o), options);
  }

  destroy() {
    return this.page.evaluate(() => window.harness.destroy());
  }

  /** Opens an editing session and mounts view parts on it, in a layout the test page builds itself. */
  openLayout(options: Record<string, unknown> = {}) {
    return this.page.evaluate((o) => window.harness.layout.open(o), options);
  }

  closeLayout() {
    return this.page.evaluate(() => window.harness.layout.close());
  }

  /** A one-finger gesture from `from` to `to`, sent as real touch input so the browser decides scroll or not. */
  async swipe(from: Point, to: Point, steps = 10) {
    const cdp = await this.page.context().newCDPSession(this.page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", point?: Point) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [] });
    await touch("touchStart", from);
    for (let step = 1; step <= steps; step++) {
      await touch("touchMove", {
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps,
      });
    }
    await touch("touchEnd");
    await cdp.detach();
  }
}

export const test = base.extend<{ harness: Harness }>({
  harness: async ({ page }, use) => {
    await page.goto("/");
    await use(new Harness(page));
  },
});

export { expect } from "@playwright/test";

// ABOUTME: Playwright fixtures of the mount seam: a harness that drives the test page and records the host's fake callbacks.
// ABOUTME: Tests talk to the page only through window.harness and through what a user can see and do.
import { test as base, type Page } from "@playwright/test";

export interface RecordedNotice {
  code: string;
  level: string;
  message: string;
}

interface PageHarness {
  stage: HTMLElement;
  notices: RecordedNotice[];
  mount(options?: Record<string, unknown>): void;
  update(options: Record<string, unknown>): void;
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

  notices() {
    return this.page.evaluate(() => window.harness.notices);
  }
}

export const test = base.extend<{ harness: Harness }>({
  harness: async ({ page }, use) => {
    await page.goto("/");
    await use(new Harness(page));
  },
});

export { expect } from "@playwright/test";

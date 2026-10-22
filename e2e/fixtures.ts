// ABOUTME: Playwright fixtures of seam 5: a harness that drives the test page, a press that taps or clicks, and real touch input.
// ABOUTME: Tests talk to the page only through window.harness and through what a user can see and do.
import { test as base, type Locator, type Page } from "@playwright/test";

export interface Point {
  x: number;
  y: number;
}

/** The box a locator occupies on the page; throws when nothing is drawn for it. */
export async function box(target: Locator) {
  const found = await target.boundingBox();
  if (!found) throw new Error("nothing is drawn for the locator");
  return found;
}

/** A Vocal-only song2 score in C major, 4/4, with the given music lines under one section. */
export function vocalOnly(...music: string[]): string {
  const header = ["X:1", "T:", "M:4/4", "L:1/16", "Q:1/4=100", 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"'];
  return [...header, "K:C", "% a", ...music.flatMap((line) => ["V: Vocal", line]), ""].join("\n");
}

/** The editing session as the test page exposes it to the helpers below. */
interface PageSession {
  project: { score: string };
  selection: string[];
  insertionPoint: { tick: number } | null;
  view: { zoom: number; scrollLeft: number; language: string; editable: boolean };
  reading: { kind: string; score?: { notes: Array<{ id: string; voice: string; midi: number | null }> } };
  canUndo: boolean;
  dispatch(command: unknown): { ok: boolean; diagnostics: Array<{ code: string }> };
  undo(): boolean;
  redo(): boolean;
  setView(patch: Record<string, unknown>): void;
}

interface PageLayout {
  /** The open session, or null when no layout is open. */
  session: PageSession | null;
  /** The session of the open layout; throws when none is open. */
  live(): PageSession;
  slots: Record<string, HTMLElement>;
  shadowRoot: ShadowRoot | null;
  host: HTMLElement | null;
  partNames: { all: string[]; axis: string[] };
  retained: { root: Element; nodes: Node[] } | null;
  open(options?: Record<string, unknown>): Promise<void>;
  replace(options: Record<string, unknown>): Promise<void>;
  mountPart(name: string): void;
  destroyPart(name: string, times?: number): void;
  roots(): Record<string, string>;
  freshRoots(): Record<string, string>;
  setTheme(variables: Record<string, string>): void;
  retain(name: string): void;
  retainedHtml(): string;
  leftInShadowRoot(): number;
  close(): void;
}

/** A one-time message the mounted editor sent to its host. */
export interface PageNotice {
  code: string;
  level: string;
  message: string;
}

interface PageHarness {
  stage: HTMLElement;
  notices: PageNotice[];
  layout: PageLayout;
  host: { addRules(kind: "important" | "hostile"): void; addProbe(): void; setColorScheme(scheme: string): void };
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

/** One editing session with several view parts mounted on it, in a layout the test page builds itself. */
export class Layout {
  constructor(private readonly page: Page) {}

  /**
   * `score`, `language`, `project`, `editable` and `shadow` as for mount; `parts` names the parts to mount; `scene` a host
   * layout.
   */
  open(options: Record<string, unknown> = {}) {
    return this.page.evaluate((o) => window.harness.layout.open(o), options);
  }

  close() {
    return this.page.evaluate(() => window.harness.layout.close());
  }

  /** Replaces the project from outside, the way a host does with new data. */
  replace(options: Record<string, unknown>) {
    return this.page.evaluate((o) => window.harness.layout.replace(o), options);
  }

  mountPart(...names: string[]) {
    return this.page.evaluate((all) => {
      for (const name of all) window.harness.layout.mountPart(name);
    }, names);
  }

  destroyPart(name: string, times = 1) {
    return this.page.evaluate(
      ([target, count]) => window.harness.layout.destroyPart(target as string, count as number),
      [name, times] as const,
    );
  }

  /** The markup each mounted part has drawn. */
  roots() {
    return this.page.evaluate(() => window.harness.layout.roots());
  }

  /** The markup the same parts draw when mounted fresh on a new session in the same state. */
  freshRoots() {
    return this.page.evaluate(() => window.harness.layout.freshRoots());
  }

  /** Sets theme variables on the element the layout sits in, the way a host themes the parts. */
  setTheme(variables: Record<string, string>) {
    return this.page.evaluate((v) => window.harness.layout.setTheme(v), variables);
  }

  /** Holds on to the nodes one part drew, so the listeners left on them and their markup can be looked at later. */
  retain(name: string) {
    return this.page.evaluate((target) => window.harness.layout.retain(target), name);
  }

  retainedHtml() {
    return this.page.evaluate(() => window.harness.layout.retainedHtml());
  }

  /** The style sheets held by the document, and by the layout's shadow root when it has one. */
  sheets() {
    return this.page.evaluate(() => ({
      document: document.adoptedStyleSheets.length,
      shadowRoot: window.harness.layout.shadowRoot?.adoptedStyleSheets.length ?? null,
    }));
  }

  /** How many elements a closed layout left in its shadow root beyond the page's own layout boxes. */
  leftInShadowRoot() {
    return this.page.evaluate(() => window.harness.layout.leftInShadowRoot());
  }

  /** The names of the parts the page can mount: all of them, and those on the time axis. */
  partNames() {
    return this.page.evaluate(() => window.harness.layout.partNames);
  }

  view() {
    return this.page.evaluate(() => ({ ...window.harness.layout.live().view }));
  }

  /** The ids of the selected notes, as the session holds them. */
  selection() {
    return this.page.evaluate(() => [...window.harness.layout.live().selection]);
  }

  /** The insertion point, as the session holds it. */
  insertionPoint() {
    return this.page.evaluate(() => {
      const { insertionPoint } = window.harness.layout.live();
      return insertionPoint === null ? null : { ...insertionPoint };
    });
  }

  /** The score text of the session's project. */
  scoreText() {
    return this.page.evaluate(() => window.harness.layout.live().project.score);
  }

  /** Says, as a host does with its permissions, whether the user may edit. */
  setEditable(editable: boolean) {
    return this.page.evaluate((value) => window.harness.layout.live().setView({ editable: value }), editable);
  }

  setView(patch: Record<string, unknown>) {
    return this.page.evaluate((p) => window.harness.layout.live().setView(p), patch);
  }

  dispatch(command: unknown) {
    return this.page.evaluate((c) => window.harness.layout.live().dispatch(c), command);
  }

  undo() {
    return this.page.evaluate(() => window.harness.layout.live().undo());
  }

  redo() {
    return this.page.evaluate(() => window.harness.layout.live().redo());
  }

  canUndo() {
    return this.page.evaluate(() => window.harness.layout.live().canUndo);
  }

  /** The id of the first pitched note of Vocal, as the session reads the score. */
  firstVocalNoteId() {
    return this.page.evaluate(() => {
      const { reading } = window.harness.layout.live();
      const note = reading.score?.notes.find((found) => found.voice === "Vocal" && found.midi !== null);
      if (!note) throw new Error("Vocal has no pitched note");
      return note.id;
    });
  }
}

export class Harness {
  readonly layout: Layout;

  constructor(readonly page: Page) {
    this.layout = new Layout(page);
  }

  mount(options: Record<string, unknown> = {}) {
    return this.page.evaluate((o) => window.harness.mount(o), options);
  }

  update(options: Record<string, unknown>) {
    return this.page.evaluate((o) => window.harness.update(o), options);
  }

  destroy() {
    return this.page.evaluate(() => window.harness.destroy());
  }

  /** Adds to the page the element rules a host page might have: "important" ones, or plainly "hostile" ones. */
  addHostRules(kind: "important" | "hostile") {
    return this.page.evaluate((k) => window.harness.host.addRules(k), kind);
  }

  /** Switches the page's `color-scheme`, as a host with a dark mode does. */
  setColorScheme(scheme: "dark" | "light") {
    return this.page.evaluate((value) => window.harness.host.setColorScheme(value), scheme);
  }

  /** The notices the mounted editor has sent to its host so far, in order. */
  notices() {
    return this.page.evaluate(() => window.harness.notices.map((notice) => ({ ...notice })));
  }

  /** Waits for the browser to render `count` frames, which is when scroll events reach the page. */
  frames(count = 2) {
    return this.page.evaluate(
      (n) =>
        new Promise<void>((resolve) => {
          const next = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => next(left - 1)));
          next(n);
        }),
      count,
    );
  }

  /** Adds a button and some text of the host's own, to see whether the editor changes them. */
  addHostProbe() {
    return this.page.evaluate(() => window.harness.host.addProbe());
  }

  /**
   * A one-finger gesture from `from` to `to`, sent as real touch input so the browser decides scroll or not. The
   * finger rests before it lifts: lifting at speed starts a fling, and the next tap would only stop that.
   */
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
    await this.page.waitForTimeout(150);
    await touch("touchEnd");
    await cdp.detach();
  }
}

export const test = base.extend<{
  harness: Harness;
  press: (target: Locator, position?: Point) => Promise<void>;
  partNames: { all: string[]; axis: string[] };
}>({
  harness: async ({ page }, use) => {
    await page.goto("/");
    await use(new Harness(page));
  },
  /** The names of the parts the page can mount, from the page itself so the specs and the page share one list. */
  partNames: async ({ harness }, use) => {
    await use(await harness.layout.partNames());
  },
  /** Taps where the project has a touch screen and clicks where it has a mouse, at `position` in the target when given. */
  press: async ({ isMobile }, use) => {
    await use((target, position) => {
      const options = position ? { position } : {};
      return isMobile ? target.tap(options) : target.click(options);
    });
  },
});

export { expect } from "@playwright/test";

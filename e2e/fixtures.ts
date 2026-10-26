// ABOUTME: Playwright fixtures of seam 5: a harness that drives the test page, a press that taps or clicks, and real touch input.
// ABOUTME: Tests talk to the page only through window.harness and through what a user can see and do.
import { test as base, type CDPSession, type Locator, type Page } from "@playwright/test";

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
  activeView: string;
  rejectedText: { text: string; diagnostics: Array<{ code: string }> } | null;
  canUndo: boolean;
  dispatch(command: unknown): { ok: boolean; diagnostics: Array<{ code: string }> };
  undo(): boolean;
  redo(): boolean;
  select(noteIds: string[]): void;
  setInsertionPoint(point: { tick: number } | null): void;
  setView(patch: Record<string, unknown>): void;
  setActiveView(name: string): void;
  setRejectedText(next: { text: string; diagnostics: Array<{ code: string }> } | null): void;
  checkScoreText(text: string): Array<{ code: string }>;
}

interface PageLayout {
  /** The open session, or null when no layout is open. */
  session: PageSession | null;
  /** The session of the open layout; throws when none is open. */
  live(): PageSession;
  slots: Record<string, HTMLElement>;
  shadowRoot: ShadowRoot | null;
  host: HTMLElement | null;
  partNames: { all: string[]; axis: string[]; views: string[] };
  retained: { root: Element; nodes: Node[] } | null;
  open(options?: Record<string, unknown>): Promise<void>;
  replace(options: Record<string, unknown>): Promise<void>;
  replaceDialects(): void;
  mountPart(name: string, hidden?: boolean): void;
  setSlotHidden(name: string, hidden: boolean): void;
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

/** What the helpers below have the page keep for a test to read: stand-ins and listeners they install themselves. */
interface PageProbes {
  vibrations: unknown[];
  pointerId: number | null;
  keysSeen: boolean[];
}

interface PageHarness {
  stage: HTMLElement;
  notices: PageNotice[];
  probes?: Partial<PageProbes>;
  layout: PageLayout;
  host: {
    addRules(kind: "important" | "hostile" | "hostile-svg", inShadowRoot?: boolean): void;
    addProbe(): void;
    setColorScheme(scheme: string): void;
    cover(): void;
  };
  shadowRoot: ShadowRoot | null;
  previewNote(midi: number, options?: { duration?: number }): Promise<boolean>;
  previewPlayer(): {
    readonly playing: boolean;
    readonly tick: number | null;
    readonly from: number | null;
    start(): Promise<string>;
    stop(): void;
  };
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

  /** Mounts a part in a box that is not shown, as a host does whose tab is not the open one. */
  mountHiddenPart(name: string) {
    return this.page.evaluate((n) => window.harness.layout.mountPart(n, true), name);
  }

  /** Shows or hides the box a mounted part stands in. */
  setSlotHidden(name: string, hidden: boolean) {
    return this.page.evaluate(([n, value]) => window.harness.layout.setSlotHidden(n, value), [name, hidden] as const);
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

  /** Selects exactly these notes through the session, as a host or a later view part would. */
  select(noteIds: string[]) {
    return this.page.evaluate((ids) => window.harness.layout.live().select(ids), noteIds);
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

  /** Which view the session says is shown. */
  activeView() {
    return this.page.evaluate(() => window.harness.layout.live().activeView);
  }

  /** Says, as a host's own switcher does, which view is shown. */
  setActiveView(name: string) {
    return this.page.evaluate((value) => window.harness.layout.live().setActiveView(value), name);
  }

  /** The text the text view holds that the session did not take, with the codes of what is wrong with it; null when none. */
  rejectedText() {
    return this.page.evaluate(() => {
      const { rejectedText } = window.harness.layout.live();
      return rejectedText === null
        ? null
        : { text: rejectedText.text, codes: rejectedText.diagnostics.map((diagnostic) => diagnostic.code) };
    });
  }

  /**
   * Says that the text view holds this text and the session did not take it, with what the dialect finds wrong with it; null
   * says it holds none.
   */
  setRejectedText(text: string | null) {
    return this.page.evaluate((value) => {
      const session = window.harness.layout.live();
      session.setRejectedText(value === null ? null : { text: value, diagnostics: session.checkScoreText(value) });
    }, text);
  }

  /** Reads the project with a new registry of the same dialects, the way a host that swaps its dialects does. */
  replaceDialects() {
    return this.page.evaluate(() => window.harness.layout.replaceDialects());
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

  /**
   * Adds to the page the element rules a host page might have: "important" ones, or plainly "hostile" ones; `inShadowRoot`
   * adds them to the open shadow root the editor or the layout stands in.
   */
  addHostRules(kind: "important" | "hostile" | "hostile-svg", inShadowRoot = false) {
    return this.page.evaluate(([k, inside]) => window.harness.host.addRules(k, inside), [kind, inShadowRoot] as const);
  }

  /** Switches the page's `color-scheme`, as a host with a dark mode does. */
  setColorScheme(scheme: "dark" | "light") {
    return this.page.evaluate((value) => window.harness.host.setColorScheme(value), scheme);
  }

  /** Lets the host's covering layer take the pointer, as a toast or a dialog of the host does once it is shown. */
  coverHost() {
    return this.page.evaluate(() => window.harness.host.cover());
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
   * Stands in for the device's buzz and keeps what the page asked of it. A browser buzzes only for a page that has been
   * touched, so the test touches the page first. Gives back a way to read the patterns asked for so far.
   */
  async recordVibrations(): Promise<() => Promise<unknown[]>> {
    await this.page.evaluate(() => {
      const asked: unknown[] = [];
      window.harness.probes ??= {};
      window.harness.probes.vibrations = asked;
      Object.assign(navigator, {
        vibrate: (pattern: unknown) => {
          asked.push(pattern);
          return true;
        },
      });
    });
    return () => this.page.evaluate(() => window.harness.probes?.vibrations?.slice() ?? []);
  }

  /**
   * Keeps the id of the last pointer that went down, so a test can cancel it the way a browser does when it takes a
   * touch for a gesture of its own. `cancel` sends the `pointercancel` to `target`, which the pointer is over.
   */
  async watchPointer(): Promise<{ cancel(target: Locator): Promise<void> }> {
    await this.page.evaluate(() => {
      window.harness.probes ??= {};
      const probes = window.harness.probes;
      addEventListener("pointerdown", (event) => (probes.pointerId = event.pointerId), true);
    });
    return {
      cancel: (target) =>
        target.evaluate((el) => {
          const pointerId = window.harness.probes?.pointerId ?? -1;
          el.dispatchEvent(new PointerEvent("pointercancel", { pointerId, bubbles: true }));
        }),
    };
  }

  /** Sends `blur` to the window, as a switch to another window does. */
  loseWindowFocus() {
    return this.page.evaluate(() => window.dispatchEvent(new Event("blur")));
  }

  /** Whether the browser would open its own menu on `target`: false when the page called `preventDefault` on it. */
  contextMenuOpensOn(target: Locator): Promise<boolean> {
    return target.evaluate((el) =>
      el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
    );
  }

  /**
   * Listens on the document, as a host does, for presses of `key`. Gives back a way to read, for each press so far,
   * whether the press had been handled (`defaultPrevented`) by the time it reached the document.
   */
  async watchKey(key: string): Promise<() => Promise<boolean[]>> {
    await this.page.evaluate((watched) => {
      const seen: boolean[] = [];
      window.harness.probes ??= {};
      window.harness.probes.keysSeen = seen;
      document.addEventListener("keydown", (event) => {
        if (event.key === watched) seen.push(event.defaultPrevented);
      });
    }, key);
    return () => this.page.evaluate(() => window.harness.probes?.keysSeen?.slice() ?? []);
  }

  /** The text the page has selected, as the browser's own select all leaves it. */
  hostSelection() {
    return this.page.evaluate(() => window.getSelection()?.toString() ?? "");
  }

  clearHostSelection() {
    return this.page.evaluate(() => window.getSelection()?.removeAllRanges());
  }

  /** How far `target` has scrolled. */
  scrollOf(target: Locator) {
    return target.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  }

  /**
   * The first `y` from `from` up to `until`, in steps of 4 pixels, where the element on top at `x` is `target` or
   * inside it; null when none is. A part may pin a header over `target`, so the first free spot is found by looking.
   */
  firstYOn(target: Locator, x: number, from: number, until: number) {
    return target.evaluate(
      (el, { at, start, end }) => {
        for (let y = start; y < end; y += 4) {
          const top = document.elementFromPoint(at, y);
          if (top && el.contains(top)) return y;
        }
        return null;
      },
      { at: x, start: from, end: until },
    );
  }

  /** A finger to put down, slide and lift by hand; close it when the test is done with it. */
  finger(options: { shift?: boolean } = {}) {
    return Finger.open(this.page, options);
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

/** One finger sent as real touch input, a step at a time, so a test can look at the page between the steps. */
export class Finger {
  private at: Point | null = null;

  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
    private readonly modifiers: number,
  ) {}

  /** `shift` holds Shift on a keyboard that is attached to the touch screen, for the whole life of the finger. */
  static async open(page: Page, options: { shift?: boolean } = {}) {
    return new Finger(page, await page.context().newCDPSession(page), options.shift ? 8 : 0);
  }

  private send(type: "touchStart" | "touchMove" | "touchEnd", point?: Point) {
    return this.cdp.send("Input.dispatchTouchEvent", {
      type,
      modifiers: this.modifiers,
      touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [],
    });
  }

  /** Puts the finger down at `point`, and keeps it there for `holdMs` before it does anything else. */
  async down(point: Point, holdMs = 0) {
    this.at = point;
    await this.send("touchStart", point);
    if (holdMs > 0) await this.page.waitForTimeout(holdMs);
  }

  /** Slides the finger to `point` in a few steps, as a finger does. */
  async move(point: Point, steps = 8) {
    const from = this.at;
    if (!from) throw new Error("the finger is not down");
    for (let step = 1; step <= steps; step++) {
      await this.send("touchMove", {
        x: from.x + ((point.x - from.x) * step) / steps,
        y: from.y + ((point.y - from.y) * step) / steps,
      });
      await this.page.waitForTimeout(16);
    }
    this.at = point;
  }

  /** Puts a second finger down at `point`, while the first stays where it is. */
  async addSecond(point: Point) {
    const first = this.at;
    if (!first) throw new Error("the finger is not down");
    await this.cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      modifiers: this.modifiers,
      touchPoints: [
        { x: first.x, y: first.y, id: 1 },
        { x: point.x, y: point.y, id: 2 },
      ],
    });
  }

  /** Rests, then lifts: lifting at speed would start a fling. */
  async up() {
    await this.page.waitForTimeout(100);
    await this.send("touchEnd");
    this.at = null;
  }

  async close() {
    await this.cdp.detach();
  }
}

export const test = base.extend<{
  harness: Harness;
  press: (target: Locator, position?: Point) => Promise<void>;
  partNames: { all: string[]; axis: string[]; views: string[] };
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

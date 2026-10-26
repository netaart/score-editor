// ABOUTME: Playwright fixtures of seam 5: a harness that drives the test page, a press that taps or clicks, and real touch input.
// ABOUTME: Tests talk to the page only through window.harness and through what a user can see and do.
import { test as base, type CDPSession, expect, type Locator, type Page } from "@playwright/test";

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

/** The corner of the lyric track where its pitch column begins, which the lane scrolls under. */
export const lyricKeys = (root: Locator) => root.locator(".sce-keys");

/** The panel under the lyric track's lane, which holds the unaligned list and the editor. */
export const lyricPanel = (root: Locator) => root.locator(".sce-lyric-panel");

/** The line a lyric edge drag would land on, drawn in the lane while the pointer is down. */
export const lyricGuide = (root: Locator) => root.locator(".sce-lyric-guide");

/** The bar a lyric line would take if it were let go, drawn in the lane while the pointer is down. */
export const lyricDropMark = (root: Locator) => root.locator(".sce-lyric-drop");

/** A grip in the lyric track's unaligned list, which a pointer drags onto bars. */
export const lyricGrips = (root: Locator) => root.locator(".sce-lyric-grip");

/** One cell of the lyric track's syllable row: a note start with its syllable, or empty when the counts differ. */
export const lyricSyllableCells = (root: Locator) => root.locator(".sce-lyric-syl");

/** The head of the lyric track: its name, its New line button and its legend. */
export const lyricHead = (root: Locator) => root.locator(".sce-lyric-head");

/** The scroller the default editor shares between its tracks. */
export const editorScroller = (page: Page) => page.locator(".sce-scroller");

/** The ground colour the package's UI is drawn on, read from the root of the part the element is in. */
export const groundOf = (target: Locator) =>
  target.evaluate((el) => {
    const root = el.closest(".sce-root");
    if (!root) throw new Error("the element is not in a part");
    return getComputedStyle(root).backgroundColor;
  });

/**
 * Counts the event listeners on every element the page gains from now on, kept so one that a redraw removed can still be
 * asked what it listened to: the way to see listeners piling up on a part that draws again.
 */
export async function listenerCounter(page: Page) {
  await page.evaluate(() => {
    const seen = new Set<Element>();
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof Element) for (const element of [node, ...node.querySelectorAll("*")]) seen.add(element);
    }).observe(document, { childList: true, subtree: true });
    window.harness.probes ??= {};
    window.harness.probes.elements = seen;
  });
  const cdp = await page.context().newCDPSession(page);
  return {
    /** The listeners on all of those elements, as the browser's debugger counts them. */
    async listeners() {
      const { result: list } = await cdp.send("Runtime.evaluate", {
        expression: "Array.from(window.harness.probes?.elements ?? [])",
      });
      if (!list.objectId) throw new Error("no list of elements");
      const { result: items } = await cdp.send("Runtime.getProperties", {
        objectId: list.objectId,
        ownProperties: true,
      });
      let total = 0;
      for (const item of items) {
        const objectId = /^\d+$/.test(item.name) ? item.value?.objectId : undefined;
        if (!objectId) continue;
        total += (await cdp.send("DOMDebugger.getEventListeners", { objectId })).listeners.length;
      }
      return total;
    },
    detach: () => cdp.detach(),
  };
}

/**
 * Waits until the list `read` gives has `count` entries. The page fills such a list as the editor works (the calls a fake
 * store was made, the notices a host was sent), so a test waits for it instead of counting once.
 */
export async function expectCount(read: () => Promise<ReadonlyArray<unknown>>, count: number) {
  await expect.poll(async () => (await read()).length).toBe(count);
}

/** The editing session as the test page exposes it to the helpers below. */
interface PageSession {
  project: { score: string };
  selection: string[];
  insertionPoint: { tick: number } | null;
  view: { zoom: number; scrollLeft: number; language: string; editable: boolean };
  reading: {
    kind: string;
    score?: {
      bars: Array<{ start: number; length: number }>;
      notes: Array<{ id: string; voice: string; start: number; duration: number; midi: number | null }>;
    };
  };
  grid: { value: number; dotted?: boolean };
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
  commitPart(name: string): void;
  /** Drives the mounted staff part's play position in seconds, or clears it for null. */
  setPlayPosition(seconds: number | null): void;
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

/** What the host callback of the handoff received, and the store calls made before it ran. */
export interface PageHandoff {
  payload: {
    attachment: { name: string; mediaType: string; text: string };
    instruction: string;
    project: { score: string; style: string; lyrics: string; scoreMode: string; seed: number | null };
  };
  calls: Array<Record<string, unknown>>;
}

/** What the helpers below have the page keep for a test to read: stand-ins and listeners they install themselves. */
interface PageProbes {
  vibrations: unknown[];
  pointerId: number | null;
  keysSeen: boolean[];
  elements?: Set<Element>;
}

interface PageHarness {
  stage: HTMLElement;
  notices: PageNotice[];
  handoffs: PageHandoff[];
  drafts: { calls(): Array<Record<string, unknown>> };
  scoreFile: null | {
    file(): { text: string; version: string };
    calls(): Array<Record<string, unknown>>;
    external(text: string): string;
    failNext(method: "save" | "read", count?: number): void;
    holdSave(): void;
    releaseSave(): void;
  };
  saveAs: string[];
  unsavedChanges: boolean[];
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
    start(fromTick?: number): Promise<string>;
    stop(): void;
  };
  mount(options?: Record<string, unknown>): Promise<void>;
  update(options: Record<string, unknown>): Promise<void>;
  hasUnsavedChanges(): boolean;
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

  /** Takes a pending field on a part the host mounted itself, as a host does when it closes its own container. */
  commitPart(name: string) {
    return this.page.evaluate((target) => window.harness.layout.commitPart(target), name);
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

  /** The grid, as the session holds it. */
  grid() {
    return this.page.evaluate(() => ({ ...window.harness.layout.live().grid }));
  }

  /** The pitched notes of the score as the session reads it: voice, first tick, length in ticks and MIDI number. */
  pitchedNotes() {
    return this.page.evaluate(() =>
      (window.harness.layout.live().reading.score?.notes ?? [])
        .filter((found) => found.midi !== null)
        .map(({ voice, start, duration, midi }) => ({ voice, start, duration, midi })),
    );
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

  /** Sets the height of the stage the editor fills, as a host resizing the editor's box does. */
  async stageHeight(px: number) {
    await this.page.evaluate((height) => {
      window.harness.stage.style.height = `${height}px`;
    }, px);
    await this.frames(1);
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

  /** The page's fake score file, or null when the mounted editor did not open one. */
  scoreFile() {
    return this.page.evaluate(() => {
      const file = window.harness.scoreFile;
      return file === null
        ? null
        : {
            file: file.file(),
            calls: file.calls(),
          };
    });
  }

  /** Every call the fake score file recorded. */
  scoreCalls() {
    return this.page.evaluate(() => window.harness.scoreFile?.calls() ?? []);
  }

  /** Another window writes the score file. */
  externalScore(text: string) {
    return this.page.evaluate((next) => window.harness.scoreFile?.external(next), text);
  }

  /** Makes the next score-file calls of one kind fail. */
  failScoreNext(method: "save" | "read", count = 1) {
    return this.page.evaluate(
      ([kind, times]) => window.harness.scoreFile?.failNext(kind as "save" | "read", times as number),
      [method, count] as const,
    );
  }

  /** Makes the next score-file save wait until `releaseScoreSave`. */
  holdScoreSave() {
    return this.page.evaluate(() => window.harness.scoreFile?.holdSave());
  }

  releaseScoreSave() {
    return this.page.evaluate(() => window.harness.scoreFile?.releaseSave());
  }

  /** Every call the page's fake draft store recorded. */
  draftCalls() {
    return this.page.evaluate(() => window.harness.drafts.calls());
  }

  /** What the save-as callback has received. */
  savedAs() {
    return this.page.evaluate(() => [...window.harness.saveAs]);
  }

  /** Every unsaved state the host was told about. */
  unsavedChanges() {
    return this.page.evaluate(() => [...window.harness.unsavedChanges]);
  }

  /** What the mounted editor answers for `hasUnsavedChanges()`. */
  hasUnsavedChanges() {
    return this.page.evaluate(() => window.harness.hasUnsavedChanges());
  }

  /** What the handoff callback has received so far, in order, with the store calls made before each. */
  handoffs(): Promise<PageHandoff[]> {
    return this.page.evaluate(() =>
      window.harness.handoffs.map((handoff) => ({
        payload: handoff.payload,
        calls: handoff.calls,
      })),
    );
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
   * The first `y` from `from` up to `until`, in steps of 4 pixels, where the element on top at `x` is `target` itself
   * and so is the element 8 pixels below it; null when none is. A note or another child of `target` does not count, and
   * requiring the second point leaves room for the finger. A part may pin a header over `target`, so the first empty
   * spot is found by looking.
   */
  firstYOn(target: Locator, x: number, from: number, until: number) {
    return target.evaluate(
      (el, { at, start, end }) => {
        for (let y = start; y + 8 < end; y += 4) {
          if (document.elementFromPoint(at, y) === el && document.elementFromPoint(at, y + 8) === el) return y;
        }
        return null;
      },
      { at: x, start: from, end: until },
    );
  }

  /** A finger to put down, slide and lift by hand; close it when the test is done with it. */
  finger(options: { shift?: boolean; alt?: boolean } = {}) {
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

  /** `shift` and `alt` hold those keys on a keyboard attached to the touch screen, for the whole life of the finger. */
  static async open(page: Page, options: { shift?: boolean; alt?: boolean } = {}) {
    return new Finger(page, await page.context().newCDPSession(page), (options.shift ? 8 : 0) | (options.alt ? 1 : 0));
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

/**
 * Taps or clicks the first note of Vocal whose centre is the top element at that point, and gives back its name. It
 * works through the DOM and the pointer directly, so it does not scroll the note into view the way `locator.tap()` does.
 */
export async function tapFirstVisibleNote(page: Page): Promise<string> {
  const at = await page.evaluate(() => {
    const notes = document.querySelectorAll<HTMLElement>('[role="list"][aria-label="Vocal"] [role="listitem"]');
    for (const note of notes) {
      const rect = note.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      if (document.elementFromPoint(x, y) !== note) continue;
      return { x, y, name: note.getAttribute("aria-label") ?? "" };
    }
    return null;
  });
  if (at === null) throw new Error("no note is hit-testable");
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) {
    await page.touchscreen.tap(at.x, at.y);
  } else {
    await page.mouse.click(at.x, at.y);
  }
  return at.name;
}

/** A way to press, move and lift one pointer: a mouse on the desktop project, a finger on the phone project. */
export interface Pointer {
  down(point: Point): Promise<void>;
  move(point: Point): Promise<void>;
  up(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The pointer the project has. A finger waits `holdMs` after it goes down, 550 ms unless the test says otherwise: as long
 * as a person rests it to start a box. A gesture that must start before the hold is over (a slide on a selected note)
 * asks for 0.
 */
export async function pointerOf(
  page: Page,
  harness: Harness,
  isMobile: boolean,
  options: { shift?: boolean; alt?: boolean; holdMs?: number } = {},
): Promise<Pointer> {
  if (!isMobile) {
    return {
      async down(point) {
        if (options.shift) await page.keyboard.down("Shift");
        if (options.alt) await page.keyboard.down("Alt");
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
      },
      move: (point) => page.mouse.move(point.x, point.y, { steps: 8 }),
      async up() {
        await page.mouse.up();
        if (options.alt) await page.keyboard.up("Alt");
        if (options.shift) await page.keyboard.up("Shift");
      },
      close: async () => {},
    };
  }
  const finger = await harness.finger({
    ...(options.shift ? { shift: true } : {}),
    ...(options.alt ? { alt: true } : {}),
  });
  return {
    down: (point) => finger.down(point, options.holdMs ?? 550),
    move: (point) => finger.move(point),
    up: () => finger.up(),
    close: () => finger.close(),
  };
}

/** A quarter note is 256 ticks and a beat is a quarter. */
export const BEAT = 256;
/** Middle C, the pitch most notes in these scores start from. */
export const MIDDLE_C = 60;

export const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);
export const toolbar = (page: Page) => slot(page, "toolbar");
export const laneOf = (page: Page) => slot(page, "vocal").locator(".sce-lane");
export const ghosts = (page: Page) => slot(page, "vocal").locator(".sce-ghost");
export const said = (page: Page) => slot(page, "vocal").getByRole("status");
export const trackRegion = (page: Page) => slot(page, "vocal").getByRole("region", { name: "Vocal" });
/** A note by the start of its name, which holds whether it is selected or not. */
export const block = (page: Page, label: string) => slot(page, "vocal").getByRole("listitem", { name: label });
export const gridButton = (page: Page) => toolbar(page).getByRole("button", { name: /^(Grid|网格): / });
export const gridItem = (page: Page, name: string) => toolbar(page).getByRole("menuitemradio", { name, exact: true });

/** One note of C4 at the first beat, then rests, and a whole note in the second bar: eight beats. */
export const LEAD = vocalOnly("C4z12|G16|");
/** Four quarter notes, then a whole note: at 40 pixels a beat they start 0, 40, 80 and 120 pixels into the lane. */
export const QUARTERS = vocalOnly("C4D4E4F4|G16|");

/** Opens the toolbar and the Vocal track on one session, in the page's layout. */
export async function openTrack(harness: Harness, score: string = QUARTERS, options: Record<string, unknown> = {}) {
  await harness.layout.open({ score: { text: score }, parts: ["toolbar", "vocal"], ...options });
}

export async function centreOf(target: Locator): Promise<Point> {
  const area = await box(target);
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}

/** How wide a beat and how high a row are on this project, in pixels, for a score of `beats` beats. */
export async function metrics(page: Page, beats: number) {
  const lane = await box(laneOf(page));
  const row = (await box(slot(page, "vocal").getByRole("listitem").first())).height;
  return { lane, beat: lane.width / beats, row };
}

/** Presses at `from`, slides to `to`, and lets `during` look at the page before the release. */
export async function drag(
  page: Page,
  harness: Harness,
  isMobile: boolean,
  from: Point,
  to: Point,
  during: () => Promise<void> = async () => {},
) {
  const pointer = await pointerOf(page, harness, isMobile, { holdMs: 0 });
  await withPointer(pointer, async () => {
    await pointer.down(from);
    await pointer.move(to);
    await during();
    await pointer.up();
  });
}

/** Runs a gesture with one pointer and always lets the pointer go, even when the gesture fails. */
export async function withPointer<T>(pointer: { close(): Promise<void> }, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } finally {
    await pointer.close();
  }
}

/** The notes the session holds, as the voice, start tick, length in ticks and MIDI number of each. */
export const noteList = (harness: Harness) => harness.layout.pitchedNotes();
export const vocal = (start: number, duration: number, midi: number) => ({ voice: "Vocal", start, duration, midi });

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

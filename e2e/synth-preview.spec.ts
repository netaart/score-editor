// ABOUTME: Seam 5 for the synth preview: the play control, the playhead, where the sound starts, read-only, and that no request is made.
// ABOUTME: Real Chromium plays real Web Audio; a spy on the audio constructor records what is sounded. Whether it sounds right is not tested.
import type { Locator, Page } from "@playwright/test";
import { box, expect, Harness, test, vocalOnly } from "./fixtures";

/** What the spy on the page's audio constructor has recorded. */
interface AudioLog {
  contexts: Array<{ state: string }>;
  tones: Array<{ hz: number; type: string; at: number; until: number }>;
}

declare global {
  interface Window {
    audioLog?: { contexts: AudioContext[]; tones: AudioLog["tones"] };
    /** The timers the page has set that have neither fired nor been cleared, by their id. */
    timers?: Map<number, { repeats: boolean }>;
    /** The media element a test started in the page, so it can be read afterwards. */
    hostMedia?: HTMLMediaElement;
    /** Whether each Escape key the window saw had been prevented by the time it got there. */
    escapes?: boolean[];
  }
}

/** Runs on the page before its own scripts: wraps the audio constructor to record the contexts and every tone started. */
function spyOnAudio() {
  const Real = window.AudioContext;
  const log: { contexts: AudioContext[]; tones: AudioLog["tones"] } = { contexts: [], tones: [] };
  window.audioLog = log;
  window.AudioContext = class extends Real {
    constructor(options?: AudioContextOptions) {
      super(options);
      log.contexts.push(this);
    }
    createOscillator() {
      const oscillator = super.createOscillator();
      const start = oscillator.start.bind(oscillator);
      const stop = oscillator.stop.bind(oscillator);
      const tone = { hz: 0, type: "", at: 0, until: 0 };
      oscillator.start = (when?: number) => {
        Object.assign(tone, { hz: oscillator.frequency.value, type: oscillator.type, at: when ?? 0 });
        log.tones.push(tone);
        start(when);
      };
      oscillator.stop = (when?: number) => {
        tone.until = when ?? 0;
        stop(when);
      };
      return oscillator;
    }
  };
}

/** Runs on the page before its own scripts: a browser with no Web Audio at all. */
function withoutAudio() {
  const scope = window as unknown as Record<string, unknown>;
  scope.AudioContext = undefined;
  scope.webkitAudioContext = undefined;
}

/** Runs on the page before its own scripts: records every timer set and not yet fired or cleared, so a test can see what is left. */
function trackTimers() {
  const live = new Map<number, { repeats: boolean }>();
  window.timers = live;
  const real = {
    setTimeout: window.setTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    clearInterval: window.clearInterval.bind(window),
  };
  window.setTimeout = ((handler: () => void, delay?: number) => {
    const id = real.setTimeout(() => {
      live.delete(id);
      handler();
    }, delay);
    live.set(id, { repeats: false });
    return id;
  }) as typeof window.setTimeout;
  window.setInterval = ((handler: () => void, delay?: number) => {
    const id = real.setInterval(handler, delay);
    live.set(id, { repeats: true });
    return id;
  }) as typeof window.setInterval;
  window.clearTimeout = ((id?: number) => {
    if (id !== undefined) live.delete(id);
    real.clearTimeout(id);
  }) as typeof window.clearTimeout;
  window.clearInterval = ((id?: number) => {
    if (id !== undefined) live.delete(id);
    real.clearInterval(id);
  }) as typeof window.clearInterval;
}

/** Opens the test page with the audio spy installed, before any of the page's own scripts run. */
async function visit(page: Page, init: () => void = spyOnAudio) {
  await page.addInitScript(init);
  await page.goto("/");
  return new Harness(page);
}

const audio = (page: Page) =>
  page.evaluate(
    (): AudioLog => ({
      contexts: (window.audioLog?.contexts ?? []).map((context) => ({ state: context.state })),
      tones: [...(window.audioLog?.tones ?? [])],
    }),
  );

/** Waits until the page's one audio context has run `seconds` more on its own clock: a wait on the sound, not on the wall. */
async function letAudioRun(page: Page, seconds: number) {
  const now = () => page.evaluate(() => window.audioLog?.contexts[0]?.currentTime ?? 0);
  const from = await now();
  await expect
    .poll(now, { message: `the audio clock runs ${seconds} s`, timeout: seconds * 1000 + 5000 })
    .toBeGreaterThanOrEqual(from + seconds);
}

/** What has been sounded, each as its waveform and rounded pitch, once each and sorted. */
const soundsOf = (log: AudioLog) => [...new Set(log.tones.map((tone) => `${tone.type}:${Math.round(tone.hz)}`))].sort();

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);
const previewButton = (page: Page) => page.getByRole("button", { name: /^(Preview|Stop)$/ });
const playhead = (page: Page) => page.locator(".sce-playhead");
const lane = (page: Page) => page.getByRole("list", { name: "Vocal" });
/** The caption is plain text beside the button and has no role, so it is found by its class, here and nowhere else. */
const caption = (scope: Page | Locator) => scope.locator(".sce-synth-caption");

/** Puts the insertion point at a tick through the session, as a host would. */
const setInsertionPoint = (page: Page, point: { tick: number } | null) =>
  page.evaluate((p) => window.harness.layout.live().setInsertionPoint(p), point);

/** Calls the single-note preview export the way a host does, from inside the page; resolves what it resolved. */
const previewNote = (page: Page, midi: number, options?: { duration?: number }) =>
  page.evaluate(([m, o]) => window.harness.previewNote(m, o), [midi, options] as const);

/** Where the playhead stands, in pixels from the left edge of the Vocal lane. */
async function playheadAt(page: Page) {
  const line = await box(playhead(page).first());
  return line.x + line.width / 2 - (await box(lane(page))).x;
}

/** The first tone of the lead voice, as a rounded frequency: the pitch of the first note the preview sounded. */
async function firstLead(page: Page) {
  const lead = (await audio(page)).tones.find((tone) => tone.type === "triangle");
  return lead ? Math.round(lead.hz) : null;
}

// Playwright's trace recording gives the page a user activation, and a page that has had one may start sound by itself,
// which the test of a sound that is refused needs not to happen. The file is therefore run without traces.
test.use({ trace: "off" });

/** At 40 pixels a beat, the notes start at 0, 40, 80 and 120 pixels into the lane: C4, D4, E4, F4, then a whole note. */
const QUARTERS = vocalOnly("C4D4E4F4|G16|C4D4E4F4|G16|");
const C4_HZ = 262;
const E4_HZ = 330;

/** Opens the preview control and the Vocal track on one session, each in a slot of the page's own layout. */
async function openLayout(harness: Harness, score = QUARTERS, options: Record<string, unknown> = {}) {
  await harness.layout.open({ score: { text: score }, parts: ["synth", "vocal"], ...options });
}

test.describe("the play control", () => {
  test("a press starts the preview and says Stop, a second press stops it and says Preview again", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await openLayout(harness);
    const button = slot(page, "synth").getByRole("button");
    await expect(button).toHaveText("Preview");

    await press(button);
    await expect(button).toHaveText("Stop");
    await expect(playhead(page)).toHaveCount(1);
    expect((await audio(page)).contexts.map((context) => context.state)).toEqual(["running"]);

    await press(button);
    await expect(button).toHaveText("Preview");
    await expect(playhead(page)).toHaveCount(0);
  });

  test("says in both languages that the sound is synthetic and not the finished song", async ({ page, harness }) => {
    await harness.mount();
    const words = caption(page);
    await expect(words).toHaveText("Synthetic preview, not the final sound");
    await expect(previewButton(page)).toHaveAttribute("aria-description", "Synthetic preview, not the final sound");

    await harness.update({ language: "zh" });
    await expect(words).toHaveText("合成试听，不代表成品效果");
    await expect(page.getByRole("button", { name: "试听" })).toHaveAttribute(
      "aria-description",
      "合成试听，不代表成品效果",
    );
  });

  test("a browser with no Web Audio gets a control that says so, and no preview", async ({ page, isMobile }) => {
    const harness = await visit(page, withoutAudio);
    await openLayout(harness);
    const button = slot(page, "synth").getByRole("button");
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAttribute("title", "This browser can’t play the preview");
    await expect(caption(slot(page, "synth"))).toHaveText("This browser can’t play the preview");

    // The control is aria-disabled so that it stays focusable and can say why; Playwright treats that as disabled.
    await (isMobile ? button.tap({ force: true }) : button.click({ force: true }));
    await expect(slot(page, "synth").getByRole("status")).toHaveText("This browser can’t play the preview");
    await expect(button).toHaveText("Preview");
    await expect(playhead(page)).toHaveCount(0);
  });

  test("a score with nothing to play says so and does not start", async ({ page, press }) => {
    const harness = await visit(page);
    await openLayout(harness, vocalOnly("z16|"));
    await press(slot(page, "synth").getByRole("button"));
    await expect(slot(page, "synth").getByRole("status")).toHaveText("There is nothing to play from here");
    const words = caption(slot(page, "synth"));
    await expect(words).toHaveText("There is nothing to play from here");
    await expect(words, "the caption comes back").toHaveText("Synthetic preview, not the final sound", {
      timeout: 7000,
    });
    await expect(slot(page, "synth").getByRole("button")).toHaveText("Preview");
    await expect(playhead(page)).toHaveCount(0);
  });
});

test.describe("the caption at rest on a narrow screen", () => {
  // The phone project is the width of a phone (412 pixels); the desktop project is made as narrow as the narrowest host.
  for (const editable of [true, false]) {
    test(`is whole and in view with nothing to scroll to, ${editable ? "editable" : "read-only"}`, async ({
      page,
      isMobile,
      press,
    }) => {
      if (!isMobile) await page.setViewportSize({ width: 320, height: 700 });
      const harness = await visit(page);
      await harness.mount({ score: { text: QUARTERS }, editable });
      await expect(previewButton(page)).toBeInViewport({ ratio: 1 });
      await expect(caption(page)).toHaveText("Synthetic preview, not the final sound");
      await expect(caption(page), "a caption that is out of the toolbar's box is cut").toBeInViewport({
        ratio: 1,
      });

      await press(previewButton(page));
      await expect(previewButton(page)).toHaveText("Stop");
      await expect(caption(page), "and it stays so while it plays").toBeInViewport({ ratio: 1 });
    });
  }
});

test.describe("without a user gesture", () => {
  test("a sound the browser refuses to start, with no user gesture behind it, is said and does not play", async ({
    page,
    press,
  }) => {
    // A click made by a script is no gesture, which is what a host that calls start on its own would give.
    await page.addInitScript(() => {
      window.addEventListener("load", () => {
        const wait = setInterval(() => {
          const button = document.querySelector<HTMLButtonElement>(".sce-synth-button");
          if (!button) return;
          clearInterval(wait);
          button.click();
        }, 20);
      });
    });
    await page.addInitScript(spyOnAudio);
    await page.goto("/?demo");
    await expect(page.getByRole("status").filter({ hasText: "Blocked by the browser" })).toHaveText(
      "Blocked by the browser. Press Preview again.",
    );
    await expect(caption(page)).toHaveText("Blocked by the browser. Press Preview again.");
    await expect(previewButton(page)).toHaveText("Preview");
    await expect(playhead(page)).toHaveCount(0);

    // A real press is a gesture, and the control plays.
    await press(previewButton(page));
    await expect(previewButton(page)).toHaveText("Stop");
    await expect(caption(page)).toHaveText("Synthetic preview, not the final sound");
    // One line in each of the two voice tracks of the demo score.
    await expect(playhead(page)).toHaveCount(2);
  });
});

test.describe("the playhead", () => {
  test("moves while the preview plays and is gone, with no sound left, once it is stopped", async ({ page, press }) => {
    const harness = await visit(page);
    await openLayout(harness);
    const button = slot(page, "synth").getByRole("button");

    await press(button);
    await expect(playhead(page)).toHaveCount(1);
    const first = await playheadAt(page);
    await expect.poll(() => playheadAt(page), { message: "the playhead moves right" }).toBeGreaterThan(first + 10);

    await press(button);
    await expect(playhead(page)).toHaveCount(0);
    const tones = (await audio(page)).tones.length;
    // The device is let go once nothing plays, which is later than the next hand-over of notes would have been.
    await expect
      .poll(async () => (await audio(page)).contexts.map((context) => context.state), {
        message: "the audio device is let go once nothing plays",
      })
      .toEqual(["suspended"]);
    await expect(playhead(page)).toHaveCount(0);
    expect((await audio(page)).tones.length, "nothing new is sounded after the stop").toBe(tones);
  });

  test("is not the insertion point: both are drawn at once, and the playhead has no flag", async ({ page, press }) => {
    const harness = await visit(page);
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["toolbar", "synth", "vocal"] });
    await press(lane(page), { x: 70, y: 4 });
    await expect(slot(page, "vocal").getByRole("separator")).toHaveCount(1);
    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);
    await expect(slot(page, "vocal").getByRole("separator")).toHaveCount(1);
    await expect(playhead(page)).toHaveAttribute("aria-hidden", "true");
    await expect(playhead(page).locator("*")).toHaveCount(0);
  });

  test("ends by itself when the music ends: the control is back to Preview and the line is gone", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await openLayout(harness, vocalOnly("C4D4E4F4|").replace("Q:1/4=100", "Q:1/4=480"));
    const button = slot(page, "synth").getByRole("button");
    await press(button);
    await expect(button).toHaveText("Stop");
    await expect(button).toHaveText("Preview", { timeout: 4000 });
    await expect(playhead(page)).toHaveCount(0);
    await expect.poll(async () => (await audio(page)).contexts.map((context) => context.state)).toEqual(["suspended"]);
  });

  test("stops when the score is replaced from outside, so the line never points into another song", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await openLayout(harness);
    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);

    await harness.layout.replace({ score: { text: vocalOnly("G4A4B4c4|") } });
    await expect(playhead(page)).toHaveCount(0);
    await expect(slot(page, "synth").getByRole("button")).toHaveText("Preview");
  });

  test("turns the page ahead of the line when it passes the right edge of a long score", async ({ page, press }) => {
    const harness = await visit(page);
    await openLayout(
      harness,
      vocalOnly(...Array.from({ length: 12 }, () => "C4D4E4F4|")).replace("Q:1/4=100", "Q:1/4=480"),
    );
    expect((await harness.layout.view()).scrollLeft).toBe(0);
    await press(slot(page, "synth").getByRole("button"));
    await expect.poll(async () => (await harness.layout.view()).scrollLeft, { timeout: 5000 }).toBeGreaterThan(100);
  });
});

test.describe("stopping and following", () => {
  test("Escape stops the preview from wherever the focus is, and does nothing when nothing plays", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await openLayout(harness);
    await page.keyboard.press("Escape");
    await expect(playhead(page)).toHaveCount(0);

    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(playhead(page)).toHaveCount(0);
    await expect(slot(page, "synth").getByRole("button")).toHaveText("Preview");
    await expect(slot(page, "synth").getByRole("status")).toHaveText("Preview stopped");
  });

  test("Escape is left to the host as well: it still reaches the window, and has not been prevented", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await openLayout(harness);
    await page.evaluate(() => {
      window.escapes = [];
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") window.escapes?.push(event.defaultPrevented);
      });
    });
    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(playhead(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.escapes)).toEqual([false]);
  });

  test("the page is turned a beat before the line reaches the right edge, so it never touches it", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await openLayout(
      harness,
      vocalOnly(...Array.from({ length: 12 }, () => "C4D4E4F4|")).replace("Q:1/4=100", "Q:1/4=480"),
    );
    const region = slot(page, "vocal").getByRole("region", { name: "Vocal" });
    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);
    // Every frame for three seconds: how close the line comes to the right edge of what the view shows.
    const closest = await page.evaluate(async () => {
      const view = document.querySelector('[data-slot="vocal"] [role="region"]');
      if (!view) throw new Error("no view");
      let nearest = Number.NEGATIVE_INFINITY;
      const end = performance.now() + 3000;
      while (performance.now() < end) {
        await new Promise((next) => requestAnimationFrame(next));
        const line = document.querySelector(".sce-playhead");
        if (line) nearest = Math.max(nearest, line.getBoundingClientRect().right - view.getBoundingClientRect().right);
      }
      return nearest;
    });
    expect(closest, "the line stays at least a beat short of the edge").toBeLessThan(-30);
    expect((await harness.layout.view()).scrollLeft, "and the view was turned").toBeGreaterThan(100);
    await expect(region).toBeVisible();
  });
});

test.describe("where the preview starts", () => {
  test("from the insertion point: the line starts there and the first note sounded is the one at it", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["toolbar", "synth", "vocal"] });
    // Beats are 40 pixels wide: 70 pixels in is nearer the line at 80, the start of E4 on beat 3.
    await press(lane(page), { x: 70, y: 4 });
    expect(await harness.layout.insertionPoint()).toEqual({ tick: 512 });

    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);
    const at = await playheadAt(page);
    expect(at).toBeGreaterThanOrEqual(79);
    expect(at, "within a beat of where it was told to start").toBeLessThan(120);
    await expect(slot(page, "synth").getByRole("status")).toHaveText("Playing the preview from bar 1 beat 3");
    expect(await firstLead(page)).toBe(E4_HZ);
  });

  test("from the start when there is no insertion point", async ({ page, press }) => {
    const harness = await visit(page);
    await openLayout(harness);
    expect(await harness.layout.insertionPoint()).toBeNull();

    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);
    expect(await playheadAt(page)).toBeLessThan(40);
    await expect(slot(page, "synth").getByRole("status")).toHaveText("Playing the preview from the start");
    expect(await firstLead(page)).toBe(C4_HZ);
  });

  test("from the middle of a later bar, set through the session as a host does", async ({ page, press }) => {
    const harness = await visit(page);
    await openLayout(harness);
    // The third bar starts at 320 pixels: bar 3 beat 3 is two bars and two beats in.
    await setInsertionPoint(page, { tick: 2 * 1024 + 512 });
    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);
    expect(await playheadAt(page)).toBeGreaterThanOrEqual(320 + 79);
    await expect(slot(page, "synth").getByRole("status")).toHaveText("Playing the preview from bar 3 beat 3");
    expect(await firstLead(page)).toBe(E4_HZ);
  });
});

test.describe("read-only", () => {
  test("a guest can listen: the control is there and plays from the start, with the line drawn", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await harness.mount({ score: { text: QUARTERS }, editable: false });
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

    await press(previewButton(page));
    await expect(previewButton(page)).toHaveText("Stop");
    await expect(playhead(page)).toHaveCount(1);
    const first = await playheadAt(page);
    await expect.poll(() => playheadAt(page)).toBeGreaterThan(first + 10);
    expect(await firstLead(page)).toBe(C4_HZ);

    await press(previewButton(page));
    await expect(playhead(page)).toHaveCount(0);
  });

  test("starts at the start whatever insertion point the session was left with, since a read-only view shows none", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await harness.layout.open({ score: { text: QUARTERS }, parts: ["toolbar", "synth", "vocal"] });
    await setInsertionPoint(page, { tick: 512 });
    await expect(slot(page, "vocal").getByRole("separator")).toHaveCount(1);

    await harness.layout.setEditable(false);
    await expect(slot(page, "vocal").getByRole("separator"), "a read-only view draws no insertion point").toHaveCount(
      0,
    );
    await press(slot(page, "synth").getByRole("button"));
    await expect(slot(page, "synth").getByRole("status")).toHaveText("Playing the preview from the start");
    expect(await firstLead(page)).toBe(C4_HZ);
  });

  test("goes on playing when the session turns read-only", async ({ page, press }) => {
    const harness = await visit(page);
    await openLayout(harness);
    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);

    await harness.layout.setEditable(false);
    await expect(slot(page, "synth").getByRole("button")).toHaveText("Stop");
    await expect(playhead(page)).toHaveCount(1);
  });
});

test.describe("other sound on the page", () => {
  type Kind = "audio" | "video" | "detached" | "shadow";

  /**
   * Starts three seconds of a tone that belongs to the page, not to the editor, in a media element of the given kind: an
   * `<audio>` or a `<video>` in the document, an `<audio>` made with `new Audio()` and never put in the document, or an
   * `<audio>` inside a shadow root. Resolves once it plays.
   */
  const playPageMedia = (page: Page, kind: Kind) =>
    page.evaluate(async (what) => {
      const rate = 8000;
      const samples = rate * 3;
      const bytes = new ArrayBuffer(44 + samples * 2);
      const view = new DataView(bytes);
      const text = (at: number, words: string) => {
        for (let i = 0; i < words.length; i++) view.setUint8(at + i, words.charCodeAt(i));
      };
      text(0, "RIFF");
      view.setUint32(4, 36 + samples * 2, true);
      text(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      text(36, "data");
      view.setUint32(40, samples * 2, true);
      const src = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      let media: HTMLMediaElement;
      if (what === "detached") media = new Audio(src);
      else {
        media = document.createElement(what === "video" ? "video" : "audio");
        media.src = src;
        if (what === "shadow") {
          const host = document.createElement("div");
          document.body.append(host);
          host.attachShadow({ mode: "open" }).append(media);
        } else document.body.append(media);
      }
      window.hostMedia = media;
      await media.play();
    }, kind);
  const hostMedia = (page: Page) =>
    page.evaluate(() => ({ paused: window.hostMedia?.paused, position: window.hostMedia?.currentTime ?? 0 }));

  for (const kind of ["audio", "video"] as const) {
    test(`a ${kind} element in the document that starts while the preview plays stops the preview, and the page's own sound goes on`, async ({
      page,
      press,
    }) => {
      const harness = await visit(page);
      await openLayout(harness);
      await press(slot(page, "synth").getByRole("button"));
      await expect(playhead(page)).toHaveCount(1);

      await playPageMedia(page, kind);
      await expect(slot(page, "synth").getByRole("button")).toHaveText("Preview");
      await expect(playhead(page)).toHaveCount(0);
      expect((await hostMedia(page)).paused).toBe(false);
    });
  }

  // These two the preview does not hear: a capturing listener on the document gets no `play` event from them.
  for (const kind of ["detached", "shadow"] as const) {
    test(`a ${kind} audio element is not heard: the preview and the page's own sound play on together`, async ({
      page,
      press,
    }) => {
      const harness = await visit(page);
      await openLayout(harness);
      await press(slot(page, "synth").getByRole("button"));
      await expect(playhead(page)).toHaveCount(1);

      await playPageMedia(page, kind);
      await letAudioRun(page, 0.5);
      await expect(slot(page, "synth").getByRole("button")).toHaveText("Stop");
      await expect(playhead(page)).toHaveCount(1);
      expect((await hostMedia(page)).paused).toBe(false);
    });
  }

  test("a preview started while the page's audio plays leaves that audio playing, and both run", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await openLayout(harness);
    await playPageMedia(page, "audio");
    expect((await hostMedia(page)).paused).toBe(false);

    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);
    const before = (await hostMedia(page)).position;
    await expect
      .poll(async () => (await hostMedia(page)).position, {
        message: "the page's audio goes on, not paused and not stuck",
      })
      .toBeGreaterThan(before + 0.3);
    expect((await hostMedia(page)).paused).toBe(false);
    await expect(playhead(page)).toHaveCount(1);
    expect((await audio(page)).contexts.map((context) => context.state)).toEqual(["running"]);
  });
});

test.describe("requests", () => {
  /** Two voices and a chord: a bar of Vocal quarter notes C D E F under the chord C, and Ins half notes c and e. */
  const TWO_VOICES = [
    "X:1",
    "T:",
    "M:4/4",
    "L:1/16",
    "Q:1/4=100",
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    'V: Ins clef=treble name="Ins Melody" snm="Inst."',
    "K:C",
    "% a",
    "V: Vocal",
    '"C"C4D4E4F4|',
    "V: Ins",
    "c8e8|",
    "",
  ].join("\n");

  test("none leaves the page from before the editor is mounted to the stop, and nothing came from another origin", async ({
    page,
    press,
  }) => {
    const requests: string[] = [];
    const sockets: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("websocket", (socket) => sockets.push(socket.url()));
    const harness = await visit(page);
    const loaded = requests.length;
    expect(loaded, "the page and its own files were fetched before the editor was mounted").toBeGreaterThan(0);
    const origin = new URL(page.url()).origin;

    await harness.mount({ score: { text: TWO_VOICES } });
    await expect(lane(page)).toBeVisible();
    await press(previewButton(page));
    await expect(previewButton(page)).toHaveText("Stop");
    await expect
      .poll(async () => soundsOf(await audio(page)), {
        message: "the melody, the second voice and the chord all sound, each at its pitch",
        timeout: 8000,
      })
      .toEqual(
        [
          // Vocal C D E F as a triangle wave, Ins c and e as a square wave, the chord C (bass C2, then C3 E3 G3) as sine waves.
          "triangle:262",
          "triangle:294",
          "triangle:330",
          "triangle:349",
          "square:523",
          "square:659",
          "sine:65",
          "sine:131",
          "sine:165",
          "sine:196",
        ].sort(),
      );
    await press(previewButton(page));
    await expect(previewButton(page)).toHaveText("Preview");
    expect(await previewNote(page, 64)).toBe(true);
    await expect
      .poll(async () => (await audio(page)).contexts.map((context) => context.state), {
        message: "the note has died away and the audio device is let go",
      })
      .toEqual(["suspended"]);

    expect(requests.slice(loaded), "no request from before the mount to the end of the note").toEqual([]);
    expect(
      requests.filter((url) => new URL(url).origin !== origin),
      "no request to another origin",
    ).toEqual([]);
    expect(sockets).toEqual([]);
  });
});

test.describe("the single-note preview", () => {
  const lastTone = async (page: Page) => {
    const tone = (await audio(page)).tones.at(-1);
    if (!tone) throw new Error("no tone was sounded");
    return tone;
  };

  test("sounds one pitch for about a third of a second, or as long as it is asked to", async ({ page }) => {
    await visit(page);
    expect(await previewNote(page, 69)).toBe(true);
    let tone = await lastTone(page);
    expect(tone.hz).toBeCloseTo(440, 1);
    expect(tone.until - tone.at, "0.35 seconds and the tail that lets the release finish").toBeCloseTo(0.37, 3);
    expect((await audio(page)).tones).toHaveLength(1);

    expect(await previewNote(page, 60, { duration: 1 })).toBe(true);
    tone = await lastTone(page);
    expect(tone.hz).toBeCloseTo(261.63, 1);
    expect(tone.until - tone.at).toBeCloseTo(1.02, 3);
  });

  test("keeps a duration between a fiftieth of a second and ten seconds", async ({ page }) => {
    await visit(page);
    await previewNote(page, 60, { duration: 0 });
    const shortest = await lastTone(page);
    expect(shortest.until - shortest.at).toBeCloseTo(0.04, 3);
    await previewNote(page, 60, { duration: 600 });
    const longest = await lastTone(page);
    expect(longest.until - longest.at).toBeCloseTo(10.02, 3);
  });

  test("lets go of the audio device once the note has died away", async ({ page }) => {
    await visit(page);
    await previewNote(page, 72, { duration: 0.1 });
    expect((await audio(page)).contexts.map((context) => context.state)).toEqual(["running"]);
    await expect
      .poll(async () => (await audio(page)).contexts.map((context) => context.state), { timeout: 4000 })
      .toEqual(["suspended"]);
  });

  test("shares the one audio context with the preview, and does not end it", async ({ page, press }) => {
    const harness = await visit(page);
    await openLayout(harness);
    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);

    // C5 is not a pitch of the score; one second of the audio clock is long after its note has died away.
    await previewNote(page, 72, { duration: 0.1 });
    await letAudioRun(page, 1);
    const { contexts } = await audio(page);
    expect(
      contexts.map((context) => context.state),
      "one context, still running for the preview",
    ).toEqual(["running"]);
    await expect(playhead(page)).toHaveCount(1);
  });

  test("a stop silences the preview for good, even while another sound keeps the audio context running", async ({
    page,
    press,
  }) => {
    const harness = await visit(page);
    await openLayout(harness);
    const button = slot(page, "synth").getByRole("button");
    await press(button);
    await expect(playhead(page)).toHaveCount(1);
    await previewNote(page, 60, { duration: 4 });

    await press(button);
    await expect(playhead(page)).toHaveCount(0);
    const placed = (await audio(page)).tones.length;
    // The preview keeps handing out its next notes a few seconds ahead of the clock for as long as it is not stopped.
    await letAudioRun(page, 1.5);
    expect((await audio(page)).tones.length, "no tone is placed after the stop").toBe(placed);
    expect((await audio(page)).contexts.map((context) => context.state)).toEqual(["running"]);
  });
});

test.describe("the preview player of a session", () => {
  test("a host reads where it plays and stops it, and the control follows", async ({ page, press }) => {
    const harness = await visit(page);
    await openLayout(harness);
    await setInsertionPoint(page, { tick: 512 });
    expect(await page.evaluate(() => window.harness.previewPlayer().playing)).toBe(false);

    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);
    const state = await page.evaluate(() => {
      const { playing, tick, from } = window.harness.previewPlayer();
      return { playing, tick, from };
    });
    expect(state.playing).toBe(true);
    expect(state.from).toBe(512);
    expect(state.tick).toBeGreaterThanOrEqual(512);

    await page.evaluate(() => window.harness.previewPlayer().stop());
    await expect(slot(page, "synth").getByRole("button")).toHaveText("Preview");
    await expect(playhead(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.harness.previewPlayer().tick)).toBeNull();
  });

  test("a host starts it from its own gesture handler, and the control shows it", async ({ page }) => {
    const harness = await visit(page);
    await openLayout(harness);
    expect(await page.evaluate(() => window.harness.previewPlayer().start())).toBe("started");
    await expect(slot(page, "synth").getByRole("button")).toHaveText("Stop");
    await expect(playhead(page)).toHaveCount(1);
    expect(await page.evaluate(() => window.harness.previewPlayer().start()), "a second start is no new start").toBe(
      "started",
    );
    expect((await audio(page)).contexts).toHaveLength(1);
  });

  test("a part destroyed while it plays stops the sound, with no control left to stop it", async ({ page, press }) => {
    const harness = await visit(page);
    await openLayout(harness);
    await press(slot(page, "synth").getByRole("button"));
    await expect(playhead(page)).toHaveCount(1);

    await harness.layout.destroyPart("synth");
    await expect(playhead(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.harness.previewPlayer().playing)).toBe(false);
    const placed = (await audio(page)).tones.length;
    await expect
      .poll(async () => (await audio(page)).contexts.map((context) => context.state), {
        message: "no sound is left, so the audio device is let go",
      })
      .toEqual(["suspended"]);
    expect((await audio(page)).tones.length, "and nothing more is sounded").toBe(placed);
  });
});

test.describe("what the preview leaves running", () => {
  // Read in the same task as the stop, so that no timer has had the time to fire before it is counted.
  const leftBy = (page: Page, action: string) =>
    page.evaluate(async (what) => {
      const known = new Set(window.timers?.keys());
      const player = window.harness.previewPlayer();
      await player.start();
      if (what === "stop") player.stop();
      else window.harness.layout.destroyPart("synth");
      return [...(window.timers ?? [])].filter(([id]) => !known.has(id)).map(([, timer]) => timer);
    }, action);

  test("a stopped preview leaves one timer, the one that lets go of the audio device, and no interval", async ({
    page,
  }) => {
    await page.addInitScript(trackTimers);
    const harness = await visit(page);
    await openLayout(harness);
    expect(await leftBy(page, "stop")).toEqual([{ repeats: false }]);
  });

  test("a control destroyed while it plays leaves the same one timer", async ({ page }) => {
    await page.addInitScript(trackTimers);
    const harness = await visit(page);
    await openLayout(harness);
    expect(await leftBy(page, "destroy")).toEqual([{ repeats: false }]);
    await expect(playhead(page)).toHaveCount(0);
  });

  test("a note preview that is sounding has no timer of its own running", async ({ page }) => {
    await page.addInitScript(trackTimers);
    await visit(page);
    const left = await page.evaluate(async () => {
      const known = new Set(window.timers?.keys());
      await window.harness.previewNote(60, { duration: 2 });
      return [...(window.timers ?? [])].filter(([id]) => !known.has(id)).map(([, timer]) => timer);
    });
    expect(left).toEqual([]);
  });
});

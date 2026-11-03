// ABOUTME: Seam 5 for the time stretch: pulse trains through an identity map and a known map, a changed map, and FLAC decoding.
// ABOUTME: Runs in Chromium, Firefox and WebKit on synthetic audio; expected pulse times are worked by hand from the anchors.
import { expect, type Page, test } from "@playwright/test";

interface Segment {
  output: number;
  input: number;
  rate: number;
  active: boolean;
}

interface StretchPage {
  renderPulses(options: {
    inputs: number[];
    segments: Segment[];
    seconds: number;
    fixedOffsetSeconds?: number | undefined;
  }): Promise<{ peaks: number[] }>;
  decodeFlac(indices: number[]): Promise<{
    sampleRate: number;
    channels: number;
    length: number;
    left: number[];
    right: number[];
  }>;
  renderFlacIdentity(): Promise<{ peaks: number[] }>;
  prepareLive(options: {
    inputs: number[];
    before: Segment[];
    after: Segment[];
    swapAtSeconds: number;
    endSeconds: number;
  }): Promise<void>;
  live: null | { peaks: number[]; postedAt: number | null; rate: number };
}

declare global {
  interface Window {
    stretch?: StretchPage;
  }
}

/** The most a detected pulse may sit from its hand-worked time, in seconds, once the fixed offset is subtracted. */
const TOLERANCE = 0.003;
/** The most the pulses' mean error may be, in seconds, once the fixed offset is subtracted: a fraction of the raw 2.9 ms. */
const MEAN_TOLERANCE = 0.0005;

/** One pulse every half second from 0.5 s to 9.5 s of input. */
const PULSE_INPUTS = Array.from({ length: 19 }, (_, k) => 0.5 + k * 0.5);

/** The identity map: output time equals input time, and playback stops at 10 s. */
const IDENTITY: Segment[] = [
  { output: 0, input: 0, rate: 1, active: true },
  { output: 10, input: 10, rate: 1, active: false },
];

/**
 * A known map, worked by hand from three anchors: input 0 at output 0, input 4 at output 4.8, input 8 at output 7.8.
 * The first segment runs at 4 / 4.8 = 5/6 and the second at 4 / 3; the stop sits at the last anchor.
 */
const KNOWN: Segment[] = [
  { output: 0, input: 0, rate: 5 / 6, active: true },
  { output: 4.8, input: 4, rate: 4 / 3, active: true },
  { output: 7.8, input: 8, rate: 1, active: false },
];

/** Where an input time lands on KNOWN: input times below 4 s are 1.2 times later, the rest 0.75 times later, from 4.8 s on. */
const onKnown = (input: number) => (input < 4 ? input * 1.2 : 4.8 + (input - 4) * 0.75);

/** The pulses of PULSE_INPUTS that KNOWN plays before it stops, and where they land. */
const KNOWN_INPUTS = PULSE_INPUTS.filter((input) => input <= 7.5);
const KNOWN_OUTPUTS = KNOWN_INPUTS.map(onKnown);

async function pulses(
  page: Page,
  segments: Segment[],
  {
    inputs = PULSE_INPUTS,
    seconds = 10,
    fixedOffsetSeconds,
  }: { inputs?: number[]; seconds?: number; fixedOffsetSeconds?: number } = {},
) {
  return page.evaluate(
    (options) => window.stretch?.renderPulses(options) ?? Promise.reject(new Error("no stretch page")),
    { inputs, segments, seconds, fixedOffsetSeconds },
  );
}

/**
 * Each detected pulse, in order, sits within the tolerance of the time it should land on, and there are no others. With
 * the fixed offset taken off, the pulses also sit on average within MEAN_TOLERANCE: the engine's raw offset is 2.9 ms, so
 * this fails if the offset is not taken off, where the per-pulse tolerance alone would not.
 */
function expectLandedOn(peaks: number[], expected: number[], label: string) {
  expect(peaks.length, `${label}: number of pulses`).toBe(expected.length);
  const pairs = expected.map((time, k) => ({ time, peak: peaks[k] ?? Number.NaN }));
  pairs.forEach(({ time, peak }, k) => {
    expect(
      Math.abs(peak - time),
      `${label}: pulse ${k} at ${peak.toFixed(4)} s, expected ${time.toFixed(4)} s`,
    ).toBeLessThanOrEqual(TOLERANCE);
  });
  const mean = pairs.reduce((sum, { time, peak }) => sum + (peak - time), 0) / pairs.length;
  expect(Math.abs(mean), `${label}: mean error ${(mean * 1000).toFixed(3)} ms`).toBeLessThanOrEqual(MEAN_TOLERANCE);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/page/stretch.html");
  await page.waitForFunction(() => window.stretch !== undefined);
});

test("identity map: every pulse lands on its input time once the fixed offset is subtracted", async ({ page }) => {
  const { peaks } = await pulses(page, IDENTITY);
  expectLandedOn(peaks, PULSE_INPUTS, "identity");
});

test("self-check: the raw offset is one fixed delay, and no pulse wanders from it by more than the tolerance", async ({
  page,
}, testInfo) => {
  const { peaks } = await pulses(page, IDENTITY, { fixedOffsetSeconds: 0 });
  expect(peaks.length).toBe(PULSE_INPUTS.length);
  const residuals = PULSE_INPUTS.map((input, k) => (peaks[k] ?? Number.NaN) - input);
  const mean = residuals.reduce((sum, value) => sum + value, 0) / residuals.length;
  const spread = Math.max(...residuals) - Math.min(...residuals);
  testInfo.annotations.push({ type: "raw-offset-ms", description: (mean * 1000).toFixed(3) });
  testInfo.annotations.push({ type: "raw-spread-ms", description: (spread * 1000).toFixed(3) });
  expect(spread).toBeLessThanOrEqual(TOLERANCE);
});

test("known map: pulses land where the hand-worked anchors put them", async ({ page }) => {
  const { peaks } = await pulses(page, KNOWN, { seconds: 8 });
  expectLandedOn(peaks, KNOWN_OUTPUTS, "known");
});

test("a changed map renders the new map on the same stems", async ({ page }) => {
  const before = await pulses(page, IDENTITY);
  expectLandedOn(before.peaks, PULSE_INPUTS, "before");
  const after = await pulses(page, KNOWN, { seconds: 8 });
  expectLandedOn(after.peaks, KNOWN_OUTPUTS, "after");
});

test("FLAC decodes in this engine and its 16-bit samples come back exactly", async ({ page }) => {
  const indices = [11025, 33075, 55125, 77175];
  const flac = await page.evaluate(
    (at) => window.stretch?.decodeFlac(at) ?? Promise.reject(new Error("no page")),
    indices,
  );
  expect(flac.sampleRate).toBe(44100);
  expect(flac.channels).toBe(2);
  expect(flac.length).toBe(88200);
  expect(flac.left).toEqual([12345, -30000, 32767, 1]);
  expect(flac.right).toEqual([-23456, 7000, -32768, -1]);
});

test("the decoded FLAC stems render with their pulses in place", async ({ page }) => {
  const { peaks } = await page.evaluate(
    () => window.stretch?.renderFlacIdentity() ?? Promise.reject(new Error("no page")),
  );
  // The fourth pulse is one LSB, below the detection threshold, so only the three large pulses are expected.
  expectLandedOn(peaks, [0.25, 0.75, 1.25], "flac");
});

/** How far a time is from the grid of multiples of half a second that starts at `offset`, in seconds. */
const distanceToGrid = (time: number, offset: number) => {
  const steps = (time - offset) / 0.5;
  return Math.abs(steps - Math.round(steps)) * 0.5;
};

test("live: a map posted during playback takes effect from the next block", async ({ page }) => {
  // Pulses every half second. The first map plays them on the half-second grid; the posted map starts the same stems a
  // quarter second further on, so its pulses sit a quarter second off that grid. The map is posted when the audio clock
  // reaches 2 s, and the recording stops at 6 s of the same clock, so the regions do not depend on wall-clock timing.
  const inputs = Array.from({ length: 12 }, (_, k) => 0.5 + k * 0.5);
  await page.evaluate(
    (options) => {
      if (!window.stretch) throw new Error("no stretch page");
      window.stretch.prepareLive(options);
    },
    {
      inputs,
      before: [
        { output: 0, input: 0, rate: 1, active: true },
        { output: 1000, input: 1000, rate: 1, active: false },
      ],
      after: [
        { output: 0, input: 0.25, rate: 1, active: true },
        { output: 1000, input: 1000.25, rate: 1, active: false },
      ],
      swapAtSeconds: 2,
      endSeconds: 6,
    },
  );
  await page.getByRole("button", { name: "Start live check" }).click();
  await expect
    .poll(() => page.evaluate(() => window.stretch?.live?.peaks !== undefined), { timeout: 15_000 })
    .toBe(true);
  const live = await page.evaluate(() => window.stretch?.live ?? null);
  expect(live).not.toBeNull();
  const posted = live?.postedAt ?? Number.NaN;
  expect(Number.isFinite(posted)).toBe(true);
  const before = (live?.peaks ?? []).filter((time) => time < posted - 0.1);
  const after = (live?.peaks ?? []).filter((time) => time > posted + 0.3);
  expect(before.length, "pulses before the map was posted").toBeGreaterThanOrEqual(2);
  expect(after.length, "pulses after the map was posted").toBeGreaterThanOrEqual(2);
  for (const time of before) {
    expect(distanceToGrid(time, 0), `before: pulse at ${time.toFixed(4)} s`).toBeLessThanOrEqual(0.02);
  }
  for (const time of after) {
    expect(distanceToGrid(time, 0.25), `after: pulse at ${time.toFixed(4)} s`).toBeLessThanOrEqual(0.02);
  }
});

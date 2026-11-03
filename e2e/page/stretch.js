// ABOUTME: Page side of the time-stretch seam: window.stretch renders synthetic pulse trains through the built stretch and reads back the peaks.
// ABOUTME: Pulses are integers written into 16-bit stems; peaks are found by threshold runs, so the page does no timing of its own.
import { createStretchNode, int16Stem, renderStretch } from "/packages/score-editor/dist/index.js";

const SAMPLE_RATE = 44100;
const THRESHOLD = 0.1;
const LOBE_GAP = 0.02;

/** A 16-bit stem of `seconds` with one pulse of `amplitude` at each input time (seconds). */
function pulseStem(seconds, inputs, amplitude, rate = SAMPLE_RATE) {
  const stem = new Int16Array(Math.ceil(seconds * rate));
  for (const time of inputs) stem[Math.round(time * rate)] = amplitude;
  return stem;
}

/**
 * The output times (seconds) of the pulses in |x|: a run of samples above the threshold is one pulse, at its largest
 * sample. Runs closer than LOBE_GAP belong to one pulse, because a smeared pulse can ring above and below the threshold.
 */
function peaksOf(channel, rate) {
  const gap = Math.round(LOBE_GAP * rate);
  const runs = [];
  let run = null;
  for (let i = 0; i < channel.length; i++) {
    const level = Math.abs(channel[i]);
    if (level > THRESHOLD) {
      if (run === null) run = { at: i, level, last: i };
      if (level > run.level) {
        run.level = level;
        run.at = i;
      }
      run.last = i;
    } else if (run !== null && i - run.last > gap) {
      runs.push(run);
      run = null;
    }
  }
  if (run !== null) runs.push(run);
  return runs.map((found) => found.at / rate);
}

/** Renders the pulses through `segments` and returns the peak times of the left channel. */
async function renderPulses({ inputs, segments, seconds, fixedOffsetSeconds }) {
  const length = Math.max(seconds, ...inputs) + 1;
  const stems = [pulseStem(length, inputs, 16000), pulseStem(length, inputs, -12000)];
  const options = { stems, sampleRate: SAMPLE_RATE, segments, seconds };
  if (fixedOffsetSeconds !== undefined) options.fixedOffsetSeconds = fixedOffsetSeconds;
  const [left] = await renderStretch(options);
  return { peaks: peaksOf(left, SAMPLE_RATE) };
}

/** The FLAC fixture: its left and right samples at the given indices, and the file's own shape. */
async function decodeFlac(indices) {
  const bytes = await (await fetch("/e2e/page/pulses.flac")).arrayBuffer();
  const context = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  const buffer = await context.decodeAudioData(bytes);
  const left = int16Stem(buffer.getChannelData(0));
  const right = int16Stem(buffer.getChannelData(1));
  return {
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    length: buffer.length,
    left: indices.map((index) => left[index]),
    right: indices.map((index) => right[index]),
  };
}

/** The decoded FLAC's left channel as stems, rendered through the identity map: the peak times of its three big pulses. */
async function renderFlacIdentity() {
  const bytes = await (await fetch("/e2e/page/pulses.flac")).arrayBuffer();
  const context = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  const buffer = await context.decodeAudioData(bytes);
  const stems = [int16Stem(buffer.getChannelData(0)), int16Stem(buffer.getChannelData(1))];
  const segments = [
    { output: 0, input: 0, rate: 1, active: true },
    { output: 3, input: 3, rate: 1, active: false },
  ];
  const [left] = await renderStretch({ stems, sampleRate: SAMPLE_RATE, segments, seconds: 2 });
  return { peaks: peaksOf(left, SAMPLE_RATE) };
}

/**
 * The live check: a real-time stretch node plays pulses, a new map is posted to it mid-play, and what it plays is recorded
 * by a recorder worklet on the audio thread. The button is the user gesture the browser needs before it lets the context
 * make sound.
 */
let liveOptions = null;
function prepareLive(options) {
  liveOptions = options;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Start live check";
  button.addEventListener("click", () => void startLive());
  document.getElementById("stage").append(button);
}

async function startLive() {
  const context = new AudioContext();
  await context.resume();
  const { inputs, before, after, swapAtSeconds, endSeconds } = liveOptions;
  const stems = [
    pulseStem(endSeconds + 1, inputs, 16000, context.sampleRate),
    pulseStem(endSeconds + 1, inputs, -12000, context.sampleRate),
  ];
  const node = await createStretchNode(context, { stems, segments: before });
  await context.audioWorklet.addModule("/e2e/page/recorder.js");
  const splitter = context.createChannelSplitter(2);
  const recorder = new AudioWorkletNode(context, "live-recorder", { processorOptions: { swapAtSeconds, endSeconds } });
  const silent = context.createGain();
  silent.gain.value = 0;
  node.connect(splitter);
  splitter.connect(recorder, 0);
  recorder.connect(silent);
  silent.connect(context.destination);
  // The recorder runs on the audio thread: the swap is reported on the audio clock, and the recording comes with the clock
  // time of its first sample, so the peaks and the posted time are on the same clock as the node's map.
  let postedAt = null;
  recorder.port.onmessage = (event) => {
    if (event.data.kind === "swap") {
      postedAt = event.data.at;
      node.setSegments(after);
      return;
    }
    const { start, samples } = event.data;
    const peaks = peaksOf(samples, context.sampleRate).map((time) => start + time);
    window.stretch.live = { peaks, postedAt, rate: context.sampleRate };
    void context.close();
  };
}

window.stretch = { renderPulses, decodeFlac, renderFlacIdentity, prepareLive, live: null };

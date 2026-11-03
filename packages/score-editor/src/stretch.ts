// ABOUTME: The time stretch on the main thread: makes the per-track stretch node and renders a track offline through the same processor.
// ABOUTME: The processor (stretch-worklet.ts) does the work in the audio thread; this side loads it with the WASM and converts decoded audio to 16-bit stems.

import { STRETCH_WASM_BASE64 } from "./stretch-wasm";

/** One piece of a time map, with times in seconds: from `output` on, the stem plays from `input` at `rate`; `active: false` stops playback there. */
export interface StretchSegment {
  output: number;
  input: number;
  rate: number;
  active: boolean;
}

/** A stretch node: an audio node with one output of two channels, whose time map can be replaced while it plays. */
export interface StretchNode extends AudioWorkletNode {
  /** Replaces the time map; the node uses it from the next block it processes. */
  setSegments(segments: readonly StretchSegment[]): void;
}

export interface StretchNodeOptions {
  /** One 16-bit array per channel, at the context's sample rate (see int16Stem). The node keeps its own copy. */
  stems: readonly Int16Array[];
  /** The time map, covering the whole timeline the node plays. Times before its first entry are silent. */
  segments: readonly StretchSegment[];
  /**
   * The fixed delay the engine adds, in seconds, which the node takes off: by default the delay the pulse self-check
   * measured in the browsers the tests run in. Pass 0 to hear the engine's delay as it is.
   */
  fixedOffsetSeconds?: number;
}

export interface RenderStretchOptions extends StretchNodeOptions {
  /** The sample rate of the stems and of the render. */
  sampleRate: number;
  /** The length of the render, in seconds. */
  seconds: number;
}

/**
 * The fixed delay of the engine's output, in seconds: 2.9 ms, the raw offset of the pulse self-check in Chromium
 * (pulses land that much late at every rate, within a sample). Firefox and WebKit are checked against it by the tests.
 */
const FIXED_OFFSET_SECONDS = 0.0029;

const PROCESSOR_NAME = "score-editor-stretch";
const loadedContexts = new WeakMap<BaseAudioContext, Promise<void>>();
let wasmBytes: ArrayBuffer | undefined;

/**
 * Converts one channel of decoded audio to 16-bit samples. The browser's float is scaled by 32768 and rounded, so a
 * 16-bit file comes back exactly; a value that would overflow is clamped to the 16-bit range.
 */
export function int16Stem(channel: Float32Array): Int16Array {
  const samples = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i++) {
    samples[i] = Math.max(-32768, Math.min(32767, Math.round((channel[i] ?? 0) * 32768)));
  }
  return samples;
}

function engineBinary(): ArrayBuffer {
  if (wasmBytes === undefined) {
    const text = atob(STRETCH_WASM_BASE64);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    wasmBytes = bytes.buffer;
  }
  return wasmBytes;
}

/** Adds the processor module to a context once; a failed load is forgotten, so the next call tries again. */
function loadProcessor(context: BaseAudioContext): Promise<void> {
  let loaded = loadedContexts.get(context);
  if (loaded === undefined) {
    loaded = context.audioWorklet.addModule(new URL("./stretch-worklet.js", import.meta.url).href);
    loadedContexts.set(context, loaded);
    loaded.catch(() => loadedContexts.delete(context));
  }
  return loaded;
}

/**
 * Makes a stretch node in `context`. The stems must be at the context's sample rate: decode them in that context, so the
 * browser resamples them to its rate. The node is not started by hand: it plays from the context's clock, so the time map
 * says what the stem plays at each time of that clock.
 */
export async function createStretchNode(context: BaseAudioContext, options: StretchNodeOptions): Promise<StretchNode> {
  await loadProcessor(context);
  const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      wasm: engineBinary(),
      stems: options.stems,
      segments: options.segments,
      fixedOffsetSeconds: options.fixedOffsetSeconds ?? FIXED_OFFSET_SECONDS,
    },
  });
  return Object.assign(node, {
    setSegments(segments: readonly StretchSegment[]) {
      node.port.postMessage({ segments });
    },
  });
}

/**
 * Renders a stem through a time map offline, with the same processor a node uses, and returns the two channels. The
 * render is `seconds` long at `sampleRate`; the map's times are times of that render.
 */
export async function renderStretch(options: RenderStretchOptions): Promise<Float32Array[]> {
  const context = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(options.seconds * options.sampleRate),
    sampleRate: options.sampleRate,
  });
  const node = await createStretchNode(context, options);
  node.connect(context.destination);
  const rendered = await context.startRendering();
  return [rendered.getChannelData(0).slice(), rendered.getChannelData(1).slice()];
}

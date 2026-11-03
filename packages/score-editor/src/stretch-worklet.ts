// ABOUTME: The audio-thread half of the time stretch: one AudioWorkletProcessor per track, holding its 16-bit stems and its whole segment table.
// ABOUTME: It instantiates the Signalsmith Stretch WASM itself, feeds the input continuously, and seeks only when the input jumps.

/** A piece of the time map: from `output` on, the input runs at `rate` from `input`; `active: false` stops playback there. */
interface Segment {
  output: number;
  input: number;
  rate: number;
  active: boolean;
}

/** What the node hands the processor when it is made: the WASM bytes, the stems and the first segment table. */
interface ProcessorOptions {
  wasm: ArrayBuffer;
  stems: Int16Array[];
  segments: Segment[];
  fixedOffsetSeconds: number;
}

/** The worklet global scope, which the DOM library does not declare. */
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(
  name: string,
  processor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;
declare const currentTime: number;
declare const sampleRate: number;

/**
 * The exports of signalsmith-stretch 1.3.2's WASM. The build names them with single letters; these are the names the
 * upstream glue gives them (`_setBuffers` is `h`, `_process` is `w`, and so on), and the binary is pinned by stretch-wasm.ts.
 */
interface StretchExports {
  /** The linear memory the engine's buffers live in. */
  e: WebAssembly.Memory;
  /** __wasm_call_ctors: the static constructors, run once before `main`. */
  f(): void;
  /** main, which the glue calls once after instantiation. */
  y(argc: number, argv: number): number;
  /** setBuffers(channels, length): the base address of the input and output blocks. */
  h(channels: number, length: number): number;
  /** inputLatency(): the input latency in samples. */
  k(): number;
  /** outputLatency(): the output latency in samples. */
  l(): number;
  /** presetDefault(channels, sampleRate). */
  n(channels: number, sampleRate: number): void;
  /** setTransposeSemitones(semitones, tonalityLimit as a fraction of the sample rate). */
  r(semitones: number, tonalityLimit: number): void;
  /** setFormantSemitones(semitones, compensate). */
  t(semitones: number, compensate: number): void;
  /** setFormantBase(base as a fraction of the sample rate; 0 detects it). */
  u(base: number): void;
  /** seek(inputLength, rate): reposition the engine's input at the end of the block it was given. */
  v(length: number, rate: number): void;
  /** process(inputSamples, outputSamples): consume `inputSamples` new input samples and produce `outputSamples`. */
  w(inputSamples: number, outputSamples: number): void;
}

/** The imports the build asks for: four functions of emscripten's runtime, written here for a worklet. */
function engineImports(memory: () => WebAssembly.Memory) {
  // A fixed generator, so the same stems through the same map give the same samples on every run.
  let seed = 0x2545f491;
  const nextByte = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed & 0xff;
  };
  return {
    a: {
      /** random_get(buffer, length): fills the bytes with values from the fixed generator. */
      a(buffer: number, length: number): number {
        const bytes = new Uint8Array(memory().buffer, buffer, length);
        for (let i = 0; i < length; i++) bytes[i] = nextByte();
        return 0;
      },
      /** emscripten_resize_heap(size): grows the memory to `size` bytes. */
      b(size: number): number {
        const target = memory();
        const pages = Math.ceil((size - target.buffer.byteLength) / 65536);
        if (pages <= 0) return 1;
        target.grow(pages);
        return 1;
      },
      /** emscripten_memcpy_js(destination, source, count). */
      c(destination: number, source: number, count: number): void {
        new Uint8Array(memory().buffer).copyWithin(destination, source, source + count);
      },
      /** abort(). */
      d(): never {
        throw new Error("the stretch engine aborted");
      },
    },
  };
}

/** A started engine: its exports, and the addresses and sizes of its input and output blocks. */
interface Engine {
  wasm: StretchExports;
  bufferLength: number;
  inputLatency: number;
  outputLatency: number;
  inputs: number[];
  outputs: number[];
}

/** Instantiates the WASM and sets it up the way the upstream glue does, with the default preset and no transposition. */
function startEngine(binary: ArrayBuffer, rate: number, channels: number): Engine {
  const wasm = {} as StretchExports;
  const instance = new WebAssembly.Instance(
    new WebAssembly.Module(binary),
    engineImports(() => wasm.e),
  );
  Object.assign(wasm, instance.exports);
  wasm.f();
  wasm.y(0, 0);
  wasm.n(channels, rate);
  const bufferLength = wasm.k() + wasm.l();
  const base = wasm.h(channels, bufferLength);
  const blockBytes = bufferLength * 4;
  const inputs = Array.from({ length: channels }, (_, c) => base + blockBytes * c);
  const outputs = Array.from({ length: channels }, (_, c) => base + blockBytes * (c + channels));
  wasm.r(0, 8000 / rate);
  wasm.t(0, 0);
  wasm.u(0);
  return {
    wasm,
    bufferLength,
    inputLatency: wasm.k() / rate,
    outputLatency: wasm.l() / rate,
    inputs,
    outputs,
  };
}

/** The segment that covers `time`: the last one that starts at or before it, or null before the first. */
function segmentAt(segments: readonly Segment[], time: number): Segment | null {
  let low = 0;
  let high = segments.length - 1;
  let found: Segment | null = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const segment = segments[middle];
    if (segment === undefined) break;
    if (segment.output <= time) {
      found = segment;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function sorted(segments: readonly Segment[]): Segment[] {
  return [...segments].sort((a, b) => a.output - b.output);
}

class StretchProcessor extends AudioWorkletProcessor {
  readonly #engine: Engine;
  readonly #stems: Int16Array[];
  readonly #fixedOffset: number;
  #segments: Segment[];
  /** The next input sample the engine has not been given yet; null after silence, so the next sound seeks. */
  #streamEnd: number | null = null;

  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    const given = options.processorOptions as ProcessorOptions;
    this.#engine = startEngine(given.wasm, sampleRate, 2);
    this.#stems = given.stems;
    this.#fixedOffset = given.fixedOffsetSeconds;
    this.#segments = sorted(given.segments);
    this.port.onmessage = (event: MessageEvent<{ segments: Segment[] }>) => {
      this.#segments = sorted(event.data.segments);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (out === undefined) return true;
    const block = out[0]?.length ?? 0;
    const engine = this.#engine;
    const time = currentTime + engine.outputLatency;
    const segment = segmentAt(this.#segments, time);
    if (segment === null || !segment.active) {
      for (const channel of out) channel.fill(0);
      this.#streamEnd = null;
      return true;
    }
    // Read ahead by the engine's latency, and by the measured fixed offset. The offset is a delay of the output, so it
    // moves the read point along the map at the segment's rate.
    const inputTime = segment.input + (time + this.#fixedOffset - segment.output) * segment.rate + engine.inputLatency;
    const end = Math.round(inputTime * sampleRate);
    const { wasm, bufferLength } = engine;
    // The engine keeps its own history, so it is fed only the samples the map moved over since the last block. A start,
    // or any jump backwards or further than its buffer, seeks it to the end of a full buffer instead.
    const streamEnd = this.#streamEnd;
    const advanced = streamEnd === null ? -1 : end - streamEnd;
    if (streamEnd !== null && advanced >= 0 && advanced <= bufferLength) {
      this.#feed(streamEnd, end);
      wasm.w(advanced, block);
    } else {
      this.#feed(end - bufferLength, end);
      wasm.v(bufferLength, segment.rate);
      wasm.w(0, block);
    }
    this.#streamEnd = end;
    for (let c = 0; c < out.length; c++) {
      const channel = out[c];
      const from = engine.outputs[c];
      if (channel === undefined || from === undefined) continue;
      channel.set(new Float32Array(wasm.e.buffer, from, block));
    }
    return true;
  }

  /** Writes the stem samples in [from, to) into the engine's input blocks; outside the stems it is silence. */
  #feed(from: number, to: number) {
    const { wasm, inputs } = this.#engine;
    inputs.forEach((address, c) => {
      const target = new Float32Array(wasm.e.buffer, address, to - from);
      const stem = this.#stems[c % this.#stems.length];
      for (let i = 0; i < target.length; i++) {
        const at = from + i;
        target[i] = stem !== undefined && at >= 0 && at < stem.length ? (stem[at] ?? 0) / 32768 : 0;
      }
    });
  }
}

registerProcessor("score-editor-stretch", StretchProcessor);

export {};

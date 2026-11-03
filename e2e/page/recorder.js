// ABOUTME: The live check's recorder: an AudioWorkletProcessor that keeps one channel of a node's output on the audio thread.
// ABOUTME: It sees every render quantum, so nothing is dropped; it reports the swap time and, at the end, the recording with its first sample's clock time.

class LiveRecorder extends AudioWorkletProcessor {
  #swapAt;
  #endAt;
  #blocks = [];
  #start = null;
  #swapped = false;

  constructor(options) {
    super(options);
    this.#swapAt = options.processorOptions.swapAtSeconds;
    this.#endAt = options.processorOptions.endSeconds;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel !== undefined) {
      this.#start ??= currentTime;
      this.#blocks.push(new Float32Array(channel));
    }
    if (!this.#swapped && currentTime >= this.#swapAt) {
      this.#swapped = true;
      this.port.postMessage({ kind: "swap", at: currentTime });
    }
    if (currentTime >= this.#endAt) {
      const samples = new Float32Array(this.#blocks.reduce((sum, block) => sum + block.length, 0));
      let at = 0;
      for (const block of this.#blocks) {
        samples.set(block, at);
        at += block.length;
      }
      this.port.postMessage({ kind: "end", start: this.#start, samples }, [samples.buffer]);
      return false;
    }
    return true;
  }
}

registerProcessor("live-recorder", LiveRecorder);

// ABOUTME: The single-note preview: one MIDI pitch for a short time, made by an oscillator, for a view that sounds a note as the user draws it.
// ABOUTME: It shares the audio context of the synth preview, so a page never holds more than one; it makes no request.
import { type AudioUse, joinAudio, playPitch } from "./synth-engine";

export interface PreviewNoteOptions {
  /** How long the note sounds, in seconds. Defaults to 0.35. */
  duration?: number;
}

const DEFAULT_DURATION = 0.35;
const LONGEST = 10;

async function sound(use: AudioUse, midi: number, duration: number): Promise<boolean> {
  if (!(await use.ready)) {
    use.leave();
    return false;
  }
  playPitch(use.context, midi, duration);
  setTimeout(() => use.leave(), duration * 1000 + 100);
  return true;
}

/**
 * Sounds one pitch, a MIDI number from 0 to 127 (60 is middle C), for a short time. Resolves true once the note has been
 * handed to the audio device, and false where the browser has no Web Audio or did not let the sound start. A browser
 * lets sound start only for a user gesture, so call this synchronously from a pointer or key handler, before any
 * `await`. Throws a `RangeError` for a pitch that is not a whole number from 0 to 127.
 */
export function previewNote(midi: number, options: PreviewNoteOptions = {}): Promise<boolean> {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError("A note preview needs a whole MIDI number from 0 to 127.");
  }
  const duration = Math.min(LONGEST, Math.max(0.02, options.duration ?? DEFAULT_DURATION));
  const use = joinAudio();
  return use ? sound(use, midi, duration) : Promise.resolve(false);
}

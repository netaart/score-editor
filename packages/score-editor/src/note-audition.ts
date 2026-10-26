// ABOUTME: The short sounds a drawing gesture makes: one pitch of the ticket-11 single-note preview, once per distinct pitch.
// ABOUTME: It holds no audio of its own; the preview's shared context is the only one the page makes.
import { previewNote } from "./preview-note";

/** Sounds one pitch, if it can: a browser without Web Audio or one that refuses it stays silent. */
export function auditionPitch(midi: number): void {
  try {
    void previewNote(midi).catch(() => undefined);
  } catch {
    // A pitch that is not a whole MIDI number is a caller's bug; drawing never makes one.
  }
}

/** Sounds each distinct pitch once, in the order given. */
export function auditionPitches(midis: Iterable<number>): void {
  const heard = new Set<number>();
  for (const midi of midis) {
    if (heard.has(midi)) continue;
    heard.add(midi);
    auditionPitch(midi);
  }
}

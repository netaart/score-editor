// ABOUTME: The synth preview's schedule: a score and a start tick become timed note and chord events, in seconds from the start.
// ABOUTME: Pure and headless, so it runs in Node and in a worker; the browser player that sounds the events is another module.
import { notesByVoice, tieJoins } from "./arrangement";
import type { Score } from "./score";

/** One note to sound: `at` seconds after the start, for `length` seconds. */
export interface PreviewNote {
  readonly kind: "note";
  readonly voice: string;
  readonly midi: number;
  readonly at: number;
  readonly length: number;
}

/** One chord to sound: its notes together, from `at` seconds after the start, for `length` seconds. */
export interface PreviewChord {
  readonly kind: "chord";
  /** The name as the score writes it. */
  readonly name: string;
  /** MIDI notes, lowest first: the bass, then the chord above it. */
  readonly midis: ReadonlyArray<number>;
  readonly at: number;
  readonly length: number;
}

export type PreviewEvent = PreviewNote | PreviewChord;

/** What a preview plays: the events in time order, and how long it lasts. */
export interface PreviewSchedule {
  readonly events: ReadonlyArray<PreviewEvent>;
  /** The tick of the score at time zero: where the preview starts. */
  readonly fromTick: number;
  /** Seconds in one tick. Time is linear in ticks, so a position is `fromTick + seconds / secondsPerTick`. */
  readonly secondsPerTick: number;
  /** Seconds from the start until the music ends, a rest at the end included; 0 when there is nothing to play. */
  readonly length: number;
}

const WHOLE_NOTE_TICKS = 1024;

/** Seconds in one tick: the tempo names a note value (such as "1/4") and how many of it go in a minute. */
function secondsPerTick(score: Score): number {
  const denominator = Number(/^1\/(\d+)$/.exec(score.tempo.unit)?.[1] ?? 4);
  return 60 / (score.tempo.bpm * (WHOLE_NOTE_TICKS / denominator));
}

const LETTERS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTALS: Readonly<Record<string, number>> = { bb: -2, b: -1, "": 0, "#": 1, "##": 2 };

/** Semitones above the root for each chord quality a dialect can write after the root. */
const QUALITY_STEPS: Readonly<Record<string, ReadonlyArray<number>>> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "7sus4": [0, 5, 7, 10],
  "m(maj7)": [0, 3, 7, 11],
};

/** The MIDI of the lowest note of the bass octave and of the octave the chord is stacked from: C2 and C3. */
const BASS_BASE = 36;
const CHORD_BASE = 48;

function pitchClass(letter: string, accidental: string | undefined): number {
  return ((((LETTERS[letter] ?? 0) + (ACCIDENTALS[accidental ?? ""] ?? 0)) % 12) + 12) % 12;
}

/** The notes of a chord name, bass first, or null when the name is not one this reads. */
function chordMidis(name: string): number[] | null {
  const found = /^([A-G])(bb|b|##|#)?(.*?)(?:\/([A-G])(bb|b|##|#)?)?$/.exec(name);
  if (!found) return null;
  const [, letter = "", accidental, quality = "", bassLetter, bassAccidental] = found;
  const steps = QUALITY_STEPS[quality];
  if (!steps) return null;
  const root = pitchClass(letter, accidental);
  const bass = bassLetter === undefined ? root : pitchClass(bassLetter, bassAccidental);
  return [BASS_BASE + bass, ...steps.map((step) => CHORD_BASE + root + step)];
}

/**
 * The events of a preview that starts at `fromTick` (the start of the score by default), with times counted from there.
 * A note or tied chain that began before the start is not sounded again; the chord in force at the start is heard to
 * its end. The music ends where its last note or rest does, not at the end of the bar grid of a cut score.
 */
export function schedulePreview(score: Score, fromTick = 0): PreviewSchedule {
  const perTick = secondsPerTick(score);
  const events: PreviewEvent[] = [];
  let contentEnd = 0;
  for (const [voice, notes] of notesByVoice(score)) {
    const joins = tieJoins(notes);
    for (let at = 0; at < notes.length; at++) {
      const first = notes[at];
      if (!first) continue;
      contentEnd = Math.max(contentEnd, first.start + first.duration);
      if (first.midi === null) continue;
      // A tied chain sounds once, from its first note to the end of its last.
      let end = first.start + first.duration;
      while (joins.has(notes[at]?.id ?? "") && notes[at + 1]) {
        at += 1;
        end = (notes[at]?.start ?? end) + (notes[at]?.duration ?? 0);
      }
      contentEnd = Math.max(contentEnd, end);
      if (first.start < fromTick) continue;
      events.push({
        kind: "note",
        voice,
        midi: first.midi,
        at: (first.start - fromTick) * perTick,
        length: (end - first.start) * perTick,
      });
    }
  }
  score.chords.forEach((chord, index) => {
    const midis = chordMidis(chord.name);
    if (!midis) return;
    const end = Math.min(score.chords[index + 1]?.start ?? contentEnd, contentEnd);
    if (end <= Math.max(chord.start, fromTick)) return;
    const start = Math.max(chord.start, fromTick);
    events.push({
      kind: "chord",
      name: chord.name,
      midis,
      at: (start - fromTick) * perTick,
      length: (end - start) * perTick,
    });
  });
  events.sort((a, b) => a.at - b.at);
  const length = events.length === 0 ? 0 : (contentEnd - fromTick) * perTick;
  return { events, fromTick, secondsPerTick: perTick, length };
}

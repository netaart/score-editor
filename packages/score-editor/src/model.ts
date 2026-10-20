// ABOUTME: The editor's score model for the spike: notes with ticks and MIDI pitch, grid choices and pitch naming.
// ABOUTME: Pure data and functions, no DOM; the command layer and the views build on it.
import type { SpikeScore } from "./types";

export const TICKS_PER_BEAT = 480;
export const BEATS_PER_BAR = 4;
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;

/** A note. `id` is "voice:start", so a note that is not moved keeps its id across edits. */
export interface Note {
  id: string;
  voice: string;
  midi: number;
  start: number;
  duration: number;
}

export interface GridChoice {
  /** The label shown to the user, also the key of the choice. */
  id: "1/4" | "1/8" | "1/16";
  ticks: number;
  /** Subdivisions of a beat that the grid lines show. */
  perBeat: number;
}

export const GRID_CHOICES: ReadonlyArray<GridChoice> = [
  { id: "1/4", ticks: TICKS_PER_BEAT, perBeat: 1 },
  { id: "1/8", ticks: TICKS_PER_BEAT / 2, perBeat: 2 },
  { id: "1/16", ticks: TICKS_PER_BEAT / 4, perBeat: 4 },
];

export const DEFAULT_GRID: GridChoice = GRID_CHOICES[2] as GridChoice;

export function noteId(voice: string, start: number): string {
  return `${voice}:${start}`;
}

/** Notes of the spike score, in order, dropping a note that starts where another of its voice already starts. */
export function notesFromScore(score: SpikeScore): Note[] {
  const seen = new Set<string>();
  const notes: Note[] = [];
  for (const note of score.notes) {
    const id = noteId(note.voice, note.start);
    if (seen.has(id)) continue;
    seen.add(id);
    notes.push({ id, voice: note.voice, midi: note.midi, start: note.start, duration: note.duration });
  }
  return notes;
}

/** The voices to show: `Vocal` always first, then the others in order of appearance. */
export function voicesOf(notes: ReadonlyArray<Note>): string[] {
  const voices = ["Vocal"];
  for (const note of notes) if (!voices.includes(note.voice)) voices.push(note.voice);
  return voices;
}

export interface PitchRange {
  /** Lowest pitch row, a multiple of 12. */
  lo: number;
  /** One above the highest pitch row, a multiple of 12. */
  hi: number;
}

const DEFAULT_RANGE: PitchRange = { lo: 48, hi: 84 };

/** The pitch rows of a voice: its notes' range plus a margin, rounded out to whole octaves. */
export function pitchRangeOf(notes: ReadonlyArray<Note>, voice: string): PitchRange {
  let min = 127;
  let max = 0;
  let any = false;
  for (const note of notes) {
    if (note.voice !== voice) continue;
    any = true;
    if (note.midi < min) min = note.midi;
    if (note.midi > max) max = note.midi;
  }
  if (!any) return DEFAULT_RANGE;
  return {
    lo: Math.max(0, Math.floor((min - 3) / 12) * 12),
    hi: Math.min(132, Math.ceil((max + 4) / 12) * 12),
  };
}

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Scientific pitch name; MIDI 60 is C4. */
export function pitchName(midi: number): string {
  return `${PITCH_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Bar and beat of a position, both counted from 1; the beat may carry a fraction. */
export function barAndBeat(start: number): { bar: number; beat: number } {
  const bar = Math.floor(start / TICKS_PER_BAR) + 1;
  const beat = 1 + (start % TICKS_PER_BAR) / TICKS_PER_BEAT;
  return { bar, beat: Math.round(beat * 100) / 100 };
}

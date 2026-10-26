// ABOUTME: The voice commands: move Vocal by whole octaves, or move its notes into Ins and keep only its rests and chords.
// ABOUTME: Both are pure model edits; the command result also says what the voice or the instrumental version became.
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import { fillEnds, fillVoice, piecesFor, placeChords, repairTies, spansOf, splitAtKeyChanges } from "./commands-notes";
import { noteAt, orderNotes } from "./commands-shared";
import type { Note, Score } from "./score";
import type { DialectConstraints } from "./types";

/** Move only Vocal's pitched notes by this many whole octaves; Ins, the chords and the key timeline stay. */
export interface VoiceOctaveCommand {
  readonly type: "voiceOctave";
  readonly octaves: 1 | -1 | 2 | -2;
}

/** Move Vocal's pitched notes to Ins; Vocal keeps only rests and its chords. */
export interface InstrumentalVersionCommand {
  readonly type: "instrumentalVersion";
}

export type VoiceCommand = VoiceOctaveCommand | InstrumentalVersionCommand;

/** What a Voice octave run reports about the voice after it moved. */
export interface VoiceOctaveReport {
  readonly kind: "voiceOctave";
  readonly octaves: number;
  /** The lower median of the moved tie chains, or null when Vocal had no pitched notes. */
  readonly medianMidi: number | null;
  /** Whether the median is inside the singable range 60-82. */
  readonly singable: boolean;
}

/** What an instrumental version reports about Vocal's notes and the Ins notes they met. */
export interface InstrumentalReport {
  readonly kind: "instrumentalVersion";
  readonly moved: number;
  /** Ins tie chains shortened, split or otherwise cut by a moved note; counted once each. */
  readonly shortened: number;
  /** Ins tie chains fully covered by a moved note. */
  readonly dropped: number;
}

/** A command's result beyond its score: what the edit did, in the words a tool's status line needs. */
export type CommandReport = VoiceOctaveReport | InstrumentalReport;

function medianOf(pitches: ReadonlyArray<number>): number | null {
  if (pitches.length === 0) return null;
  const ordered = [...pitches].sort((left, right) => left - right);
  return ordered[Math.floor((ordered.length - 1) / 2)] as number;
}

function octave(score: Score, command: VoiceOctaveCommand): ScoreCommandResult {
  const delta = command.octaves * 12;
  for (const note of score.notes) {
    if (note.voice !== "Vocal" || note.midi === null) continue;
    const moved = note.midi + delta;
    if (moved < 0 || moved > 127) {
      return commandRefusal(
        "voice-octave-range",
        { voice: "Vocal", octaves: command.octaves, midi: note.midi, moved },
        noteAt(score, note.id),
      );
    }
  }
  const notes = score.notes.map((note) =>
    note.voice === "Vocal" && note.midi !== null ? { ...note, midi: note.midi + delta } : note,
  );
  const pitches = spansOf(score, "Vocal")
    .filter((span) => span.midi !== null)
    .map((span) => (span.midi as number) + delta);
  const medianMidi = medianOf(pitches);
  const report: VoiceOctaveReport = {
    kind: "voiceOctave",
    octaves: command.octaves,
    medianMidi,
    singable: medianMidi !== null && medianMidi >= 60 && medianMidi <= 82,
  };
  return { ok: true, score: { ...score, notes }, report };
}

interface Interval {
  readonly start: number;
  readonly end: number;
}

/** The parts of [start,end) that no moved span covers. The moved spans are sorted and do not overlap. */
function uncovered(start: number, end: number, moved: ReadonlyArray<Interval>): Interval[] {
  const kept: Interval[] = [];
  let cursor = start;
  for (const span of moved) {
    if (span.end <= cursor) continue;
    if (span.start >= end) break;
    if (span.start > cursor) kept.push({ start: cursor, end: Math.min(span.start, end) });
    cursor = Math.max(cursor, span.end);
    if (cursor >= end) break;
  }
  if (cursor < end) kept.push({ start: cursor, end });
  return kept.filter((piece) => piece.end > piece.start);
}

function notesOf(
  score: Score,
  spans: ReadonlyArray<{
    readonly voice: string;
    readonly start: number;
    readonly end: number;
    readonly midi: number | null;
    readonly notes: ReadonlyArray<Note> | null;
  }>,
  unitTicks: number,
  constraints: DialectConstraints,
): Note[] {
  const notes: Note[] = [];
  for (const span of spans) {
    if (span.notes !== null) notes.push(...span.notes);
    else notes.push(...piecesFor(score, span, unitTicks, constraints.durations));
  }
  return notes;
}

function instrumental(score: Score, constraints: DialectConstraints): ScoreCommandResult {
  if (score.unitTicks === undefined) return commandRefusal("unit-unknown", {}, {});
  const unitTicks = score.unitTicks;
  const vocal = spansOf(score, "Vocal");
  const moved = vocal.filter((span) => span.midi !== null);
  if (moved.length === 0) {
    return { ok: true, score, report: { kind: "instrumentalVersion", moved: 0, shortened: 0, dropped: 0 } };
  }
  const blockers = [...moved].sort((left, right) => left.start - right.start);
  const ins = spansOf(score, "Ins");
  const kept: Array<{
    voice: string;
    start: number;
    end: number;
    midi: number | null;
    notes: ReadonlyArray<Note> | null;
  }> = [];
  const affected = new Set<string>();
  let shortened = 0;
  let dropped = 0;
  for (const span of ins) {
    if (span.midi === null) continue;
    const pieces = uncovered(span.start, span.end, blockers);
    const remaining = pieces.reduce((total, piece) => total + piece.end - piece.start, 0);
    if (remaining === 0) {
      dropped += 1;
      for (const note of span.notes ?? []) affected.add(note.id);
      continue;
    }
    if (remaining < span.end - span.start) {
      shortened += 1;
      for (const note of span.notes ?? []) affected.add(note.id);
    }
    for (const piece of pieces) {
      kept.push({ voice: "Ins", start: piece.start, end: piece.end, midi: span.midi, notes: null });
    }
  }
  for (const span of moved) {
    for (const note of span.notes ?? []) affected.add(note.id);
    kept.push({ voice: "Ins", start: span.start, end: span.end, midi: span.midi, notes: null });
  }

  const voices = score.voices.includes("Ins") ? score.voices : [...score.voices, "Ins"];
  const ends = fillEnds(score);
  const insEnds = new Map(ends);
  if (!score.voices.includes("Ins")) {
    // A new Ins voice has no source bars to tell fillVoice where the voice stops, so it fills every whole bar.
    for (const bar of score.bars) insEnds.set(`Ins:${bar.index}`, bar.start + bar.length);
  }
  const vocalNotes = fillVoice(score, "Vocal", [], ends, unitTicks, constraints);
  const insNotes = fillVoice(
    score,
    "Ins",
    notesOf(score, kept, unitTicks, constraints),
    insEnds,
    unitTicks,
    constraints,
  );
  let notes = [...vocalNotes, ...insNotes];
  notes = splitAtKeyChanges(score, notes, unitTicks, constraints.durations);
  notes = repairTies(score, notes, affected);
  const placed = placeChords(score, notes, unitTicks, constraints.durations);
  const ordered = orderNotes({ ...score, voices }, placed.notes);
  return {
    ok: true,
    score: { ...score, voices, notes: ordered, chords: placed.chords },
    report: { kind: "instrumentalVersion", moved: moved.length, shortened, dropped },
  };
}

/** Applies one voice command to a model. */
export function runVoiceCommand(
  score: Score,
  command: VoiceCommand,
  constraints: DialectConstraints,
): ScoreCommandResult {
  switch (command.type) {
    case "voiceOctave":
      return octave(score, command);
    case "instrumentalVersion":
      return instrumental(score, constraints);
  }
}

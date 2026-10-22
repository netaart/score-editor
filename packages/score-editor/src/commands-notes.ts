// ABOUTME: The note commands: move notes in time and pitch, and resize their start or end edge, as one grid-snapped edit.
// ABOUTME: One voice holds one note at a time: a placed note removes a note it covers and shortens one it crosses.
import { positionOf } from "./arrangement";
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import { orderNotes, splitLength } from "./commands-shared";
import type { DiagnosticAt } from "./diagnostics";
import { type Chord, type Note, noteId, type Score, TICKS_PER_QUARTER } from "./score";
import type { DialectConstraints, DurationSet } from "./types";

/** The note values the grid offers: a quarter, an eighth, a sixteenth and, when the score allows it, a thirty-second. */
export type GridValue = 4 | 8 | 16 | 32;

/** A time grid: a note value, and whether it is dotted, which makes one step half as long again. */
export interface Grid {
  readonly value: GridValue;
  readonly dotted?: boolean;
}

export interface MoveNotesCommand {
  readonly type: "moveNotes";
  readonly noteIds: ReadonlyArray<string>;
  /** A time offset in ticks. The result's start is snapped to the nearest grid line. */
  readonly timeTicks: number;
  /** A pitch offset in semitones, an octave being twelve. */
  readonly semitones: number;
  readonly grid: Grid;
}

export interface ResizeNotesCommand {
  readonly type: "resizeNotes";
  readonly noteIds: ReadonlyArray<string>;
  /** The edge that moves; the other one stays where it is. */
  readonly edge: "start" | "end";
  /** A time offset in ticks. The moved edge is snapped to the nearest grid line. */
  readonly timeTicks: number;
  readonly grid: Grid;
}

export type NoteCommand = MoveNotesCommand | ResizeNotesCommand;

const GRID_VALUES: ReadonlyArray<number> = [4, 8, 16, 32];

interface Unit {
  readonly voice: string;
  readonly start: number;
  readonly end: number;
  readonly midi: number | null;
  /** The read notes, while the unit is untouched; null once it has to be written again from its interval. */
  readonly notes: ReadonlyArray<Note> | null;
}

interface Target {
  readonly unit: Unit;
  readonly voice: string;
  readonly start: number;
  readonly end: number;
  readonly midi: number;
  readonly order: number;
}

function noteAt(score: Score, id: string): DiagnosticAt {
  const note = score.notes.find((candidate) => candidate.id === id);
  if (note === undefined) return { noteId: id };
  const { bar, beat } = positionOf(score.bars, note.bar, note.start);
  return { voice: note.voice, bar, beat, noteId: note.id };
}

function snap(tick: number, step: number): number {
  return Math.round(tick / step) * step;
}

function gridStepOf(grid: Grid): number | null {
  if (!GRID_VALUES.includes(grid.value)) return null;
  if (grid.dotted !== undefined && typeof grid.dotted !== "boolean") return null;
  return (((4 * TICKS_PER_QUARTER) / grid.value) * (grid.dotted === true ? 3 : 2)) / 2;
}

function gridLabel(grid: Grid): string {
  return `1/${String(grid.value)}`;
}

/** True when a whole number of written units can be made from the dialect's duration numbers. */
function canWriteUnits(units: number, durations: DurationSet): boolean {
  if (units <= 0) return false;
  const reachable = new Array<boolean>(units + 1).fill(false);
  reachable[0] = true;
  for (let at = 1; at <= units; at += 1) {
    for (const duration of durations) {
      if (Number.isInteger(duration) && duration > 0 && duration <= at && reachable[at - duration] === true) {
        reachable[at] = true;
        break;
      }
    }
  }
  return reachable[units] === true;
}

/** True when one grid step is a whole number of the score's written units and that many units are writable. */
function gridAllowed(score: Score, step: number, constraints: DialectConstraints): boolean {
  if (!Number.isInteger(step) || step <= 0) return false;
  if (score.unitTicks <= 0 || step % score.unitTicks !== 0) return false;
  return canWriteUnits(step / score.unitTicks, constraints.durations);
}

/**
 * The notes of one voice grouped into what the user sees as one note: a pitched note and every note its tie continues
 * into, or one rest.
 */
function unitsOf(score: Score, voice: string): Unit[] {
  const notes = score.notes.filter((note) => note.voice === voice).sort((left, right) => left.start - right.start);
  const units: Unit[] = [];
  let index = 0;
  while (index < notes.length) {
    const first = notes[index] as Note;
    if (first.midi === null) {
      units.push({
        voice,
        start: first.start,
        end: first.start + first.duration,
        midi: null,
        notes: [first],
      });
      index += 1;
      continue;
    }
    const pieces: Note[] = [first];
    let last = first;
    while (last.tie) {
      const next = notes[index + 1];
      if (next === undefined || next.midi !== first.midi || next.start !== last.start + last.duration) break;
      index += 1;
      last = next;
      pieces.push(next);
    }
    units.push({
      voice,
      start: first.start,
      end: last.start + last.duration,
      midi: first.midi,
      notes: pieces,
    });
    index += 1;
  }
  return units;
}

function barIndexAt(score: Score, tick: number): number {
  let index = 0;
  for (const bar of score.bars) {
    if (bar.start > tick) break;
    index = bar.index;
  }
  return index;
}

/** Writes an interval as the note or rest pieces the dialect can write, split at every bar line and tied between. */
function piecesFor(score: Score, unit: Unit, constraints: DialectConstraints): Note[] {
  const pieces: Note[] = [];
  let at = unit.start;
  while (at < unit.end) {
    const bar = score.bars[barIndexAt(score, at)];
    if (bar === undefined) break;
    const segmentEnd = Math.min(unit.end, bar.start + bar.length);
    for (const duration of splitLength(segmentEnd - at, score.unitTicks, constraints.durations)) {
      pieces.push({
        id: noteId(unit.voice, at),
        voice: unit.voice,
        bar: bar.index,
        start: at,
        duration,
        midi: unit.midi,
        tie: false,
      });
      at += duration;
    }
  }
  return pieces.map((piece, index) => ({
    ...piece,
    tie: piece.midi !== null && index < pieces.length - 1,
  }));
}

function restPieces(
  score: Score,
  voice: string,
  bar: number,
  start: number,
  length: number,
  durations: DurationSet,
): Note[] {
  const pieces: Note[] = [];
  let at = start;
  for (const duration of splitLength(length, score.unitTicks, durations)) {
    pieces.push({ id: noteId(voice, at), voice, bar, start: at, duration, midi: null, tie: false });
    at += duration;
  }
  return pieces;
}

/**
 * How far a voice's material reaches in each bar: a complete bar's end, or the last finished token of a bar where
 * the voice is cut. A bar with no material for that voice has no entry, so an untouched short voice grows no rests.
 */
function fillEnds(score: Score): Map<string, number> {
  const ends = new Map<string, number>();
  for (const note of score.notes) {
    const key = `${note.voice}:${note.bar}`;
    const end = note.start + note.duration;
    if (end > (ends.get(key) ?? 0)) ends.set(key, end);
  }
  for (const bar of score.bars) {
    for (const voice of score.voices) {
      const key = `${voice}:${bar.index}`;
      const reached = ends.get(key);
      if (reached === undefined) continue;
      const cutHere = score.truncation?.voice === voice && bar.index >= score.truncation.bar;
      ends.set(key, bar.incomplete || cutHere ? reached : bar.start + bar.length);
    }
  }
  return ends;
}

/** Fills every gap of one voice in one bar with rests, including the space a moved or shortened note leaves. */
function fillVoice(
  score: Score,
  voice: string,
  notes: Note[],
  ends: Map<string, number>,
  constraints: DialectConstraints,
): Note[] {
  const filled = [...notes];
  for (const bar of score.bars) {
    const key = `${voice}:${bar.index}`;
    const events = filled
      .filter((note) => note.voice === voice && note.bar === bar.index)
      .sort((left, right) => left.start - right.start);
    if (!ends.has(key) && events.length === 0) continue;
    const cutHere = score.truncation?.voice === voice && bar.index >= score.truncation.bar;
    let cursor = bar.start;
    let reached = ends.get(key) ?? bar.start;
    for (const event of events) {
      if (event.start > cursor)
        filled.push(...restPieces(score, voice, bar.index, cursor, event.start - cursor, constraints.durations));
      cursor = Math.max(cursor, event.start + event.duration);
      reached = Math.max(reached, event.start + event.duration);
    }
    const end = bar.incomplete || cutHere ? Math.min(reached, bar.start + bar.length) : bar.start + bar.length;
    if (cursor < end) filled.push(...restPieces(score, voice, bar.index, cursor, end - cursor, constraints.durations));
  }
  return filled;
}

/** Clears a tie whose continuation is gone, is a rest, or has another pitch; RULES.md P10 and P12. */
function repairTies(score: Score, notes: Note[], affected: ReadonlySet<string>): Note[] {
  const original = new Map(score.notes.map((note) => [note.id, note]));
  const originalNext = new Map<string, Note>();
  for (const voice of score.voices) {
    const voiceNotes = score.notes
      .filter((note) => note.voice === voice)
      .sort((left, right) => left.start - right.start);
    for (let index = 0; index + 1 < voiceNotes.length; index += 1) {
      originalNext.set((voiceNotes[index] as Note).id, voiceNotes[index + 1] as Note);
    }
  }
  const cleared = new Set<string>();
  for (const voice of score.voices) {
    const voiceNotes = notes.filter((note) => note.voice === voice).sort((left, right) => left.start - right.start);
    for (let index = 0; index < voiceNotes.length; index += 1) {
      const note = voiceNotes[index] as Note;
      if (!note.tie) continue;
      const before = original.get(note.id);
      if (before?.tie === true && !affected.has(note.id)) {
        const beforeNext = originalNext.get(note.id);
        // An untouched dangling tie is the score's own; a tie to an untouched note still holds.
        if (beforeNext === undefined) continue;
        if (!affected.has(beforeNext.id)) continue;
      }
      const next = voiceNotes[index + 1];
      if (next === undefined || next.midi !== note.midi || next.start !== note.start + note.duration) {
        cleared.add(note.id);
      }
    }
  }
  return notes.map((note) => (cleared.has(note.id) ? { ...note, tie: false } : note));
}

/**
 * Splits the one event that covers `at` into pieces the dialect can write, so the writer has a token boundary there;
 * the pieces stay tied while they sound the same note.
 */
function splitEventAt(notes: Note[], at: number, score: Score, durations: DurationSet): boolean {
  const index = notes.findIndex((note) => note.start < at && at < note.start + note.duration);
  if (index < 0) return false;
  const event = notes[index] as Note;
  const pieces: Note[] = [];
  let start = event.start;
  const lengths = [
    ...splitLength(at - event.start, score.unitTicks, durations),
    ...splitLength(event.start + event.duration - at, score.unitTicks, durations),
  ];
  for (const duration of lengths) {
    pieces.push({ ...event, id: noteId(event.voice, start), start, duration, tie: false });
    start += duration;
  }
  const last = pieces[pieces.length - 1];
  if (last !== undefined) pieces[pieces.length - 1] = { ...last, tie: event.tie };
  for (let piece = 0; piece < pieces.length - 1; piece += 1) {
    pieces[piece] = { ...(pieces[piece] as Note), tie: (pieces[piece] as Note).midi !== null };
  }
  notes.splice(index, 1, ...pieces);
  return true;
}

/** Splits every event that a mid-bar key change now falls inside, so `[K:...]` has a token boundary (W7). */
function splitAtKeyChanges(score: Score, notes: Note[], durations: DurationSet): Note[] {
  for (const change of score.keys) {
    if (change.at > 0) splitEventAt(notes, change.at, score, durations);
  }
  return notes;
}

/** Keeps every chord at its position and points it at the Vocal event that now starts there, splitting one if needed. */
function placeChords(score: Score, notes: Note[], durations: DurationSet): { notes: Note[]; chords: Chord[] } {
  const next = [...notes];
  const chords = score.chords.map((chord) => {
    let event = next.find((note) => note.voice === "Vocal" && note.start === chord.start);
    if (event === undefined && splitEventAt(next, chord.start, score, durations)) {
      event = next.find((note) => note.voice === "Vocal" && note.start === chord.start);
    }
    return { ...chord, noteId: event?.id ?? null };
  });
  return { notes: next, chords };
}

/**
 * Moves or resizes the whole tie chain of every named note as one command. All targets are checked before anything
 * changes, so a refusal names the first note that cannot be placed and leaves the score as it was.
 */
export function runNoteCommand(
  score: Score,
  command: NoteCommand,
  constraints: DialectConstraints,
): ScoreCommandResult {
  const firstId = command.noteIds[0];
  if (!Number.isInteger(command.timeTicks)) {
    return commandRefusal("offset-not-integer", { field: "time" }, firstId === undefined ? {} : noteAt(score, firstId));
  }
  if (command.type === "moveNotes" && !Number.isInteger(command.semitones)) {
    return commandRefusal(
      "offset-not-integer",
      { field: "pitch" },
      firstId === undefined ? {} : noteAt(score, firstId),
    );
  }

  const byVoice = new Map<string, Unit[]>(score.voices.map((voice) => [voice, unitsOf(score, voice)]));
  const unitOf = new Map<string, Unit>();
  for (const units of byVoice.values()) {
    for (const unit of units) {
      for (const note of unit.notes ?? []) unitOf.set(note.id, unit);
    }
  }

  const chosen: { unit: Unit; order: number }[] = [];
  const seen = new Set<Unit>();
  const affected = new Set<string>();
  for (let order = 0; order < command.noteIds.length; order += 1) {
    const id = command.noteIds[order] as string;
    const note = score.notes.find((candidate) => candidate.id === id);
    if (note === undefined) return commandRefusal("note-not-found", { noteId: id }, { noteId: id });
    if (note.midi === null) return commandRefusal("not-a-note", { noteId: id }, noteAt(score, id));
    const unit = unitOf.get(id);
    if (unit !== undefined && !seen.has(unit)) {
      seen.add(unit);
      for (const member of unit.notes ?? []) affected.add(member.id);
      chosen.push({ unit, order });
    }
  }

  const step = gridStepOf(command.grid);
  if (step === null || !gridAllowed(score, step, constraints)) {
    const at = firstId === undefined ? {} : noteAt(score, firstId);
    return commandRefusal(
      "grid-not-allowed",
      { grid: gridLabel(command.grid), dotted: command.grid.dotted === true },
      at,
    );
  }

  const last = score.bars[score.bars.length - 1];
  const scoreEnd = last === undefined ? 0 : last.start + last.length;
  const targets: Target[] = [];
  for (const { unit, order } of chosen) {
    const length = unit.end - unit.start;
    let start: number;
    let end: number;
    if (command.type === "moveNotes") {
      start = command.timeTicks === 0 ? unit.start : snap(unit.start + command.timeTicks, step);
      end = start + length;
    } else if (command.edge === "start") {
      start = snap(unit.start + command.timeTicks, step);
      end = unit.end;
    } else {
      start = unit.start;
      end = snap(unit.end + command.timeTicks, step);
    }
    const midi = (unit.midi as number) + (command.type === "moveNotes" ? command.semitones : 0);
    const at = noteAt(score, (unit.notes?.[0] as Note).id);
    if (start < 0) return commandRefusal("note-before-start", {}, at);
    if (end > scoreEnd) return commandRefusal("note-past-end", {}, at);
    if (command.type === "resizeNotes" && end - start < step) {
      return commandRefusal("note-too-short", { grid: gridLabel(command.grid) }, at);
    }
    if (midi < 0 || midi > 127) return commandRefusal("pitch-out-of-range", { midi }, at);
    targets.push({ unit, voice: unit.voice, start, end, midi, order });
  }

  const changed = targets.some(
    (target) =>
      target.start !== target.unit.start || target.end !== target.unit.end || target.midi !== target.unit.midi,
  );
  if (!changed) return { ok: true, score };

  const targetUnits = new Set(targets.map((target) => target.unit));
  for (const [voice, units] of byVoice)
    byVoice.set(
      voice,
      units.filter((unit) => !targetUnits.has(unit)),
    );

  const ordered = [...targets].sort((left, right) => left.start - right.start || left.order - right.order);
  for (const target of ordered) {
    const units = byVoice.get(target.voice) ?? [];
    const kept: Unit[] = [];
    for (const unit of units) {
      if (unit.end <= target.start || unit.start >= target.end) {
        kept.push(unit);
        continue;
      }
      for (const member of unit.notes ?? []) affected.add(member.id);
      if (unit.start >= target.start) continue;
      kept.push({ ...unit, end: target.start, notes: null });
    }
    kept.push({
      voice: target.voice,
      start: target.start,
      end: target.end,
      midi: target.midi,
      notes: null,
    });
    kept.sort((left, right) => left.start - right.start);
    byVoice.set(target.voice, kept);
  }

  const ends = fillEnds(score);
  const notes: Note[] = [];
  for (const voice of score.voices) {
    const voiceNotes: Note[] = [];
    for (const unit of byVoice.get(voice) ?? []) {
      if (unit.notes !== null) voiceNotes.push(...unit.notes);
      else voiceNotes.push(...piecesFor(score, unit, constraints));
    }
    notes.push(...fillVoice(score, voice, voiceNotes, ends, constraints));
  }

  const split = splitAtKeyChanges(score, notes, constraints.durations);
  const repaired = repairTies(score, split, affected);
  const placed = placeChords(score, repaired, constraints.durations);
  const orderedNotes = orderNotes(score, placed.notes);
  return { ok: true, score: { ...score, notes: orderedNotes, chords: placed.chords } };
}

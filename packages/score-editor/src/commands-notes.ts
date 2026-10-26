// ABOUTME: The note commands: move notes in time and pitch, and resize their start or end edge, as one grid-snapped edit.
// ABOUTME: One voice holds one note at a time: a placed note removes a note it covers and shortens one it starts inside.
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import { noteAt, orderNotes, splitLength, tieChain } from "./commands-shared";
import { type Chord, type Note, noteId, type Score, TICKS_PER_QUARTER } from "./score";
import type { DialectConstraints, DurationSet } from "./types";

export const GRID_VALUES = [4, 8, 16, 32] as const;

/** The note values the grid offers: a quarter, an eighth, a sixteenth and, when the score allows it, a thirty-second. */
export type GridValue = (typeof GRID_VALUES)[number];

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

/** The commands that move or resize notes; `toRest` and `toRests` are score commands but not these. */
export type MoveResizeCommand = MoveNotesCommand | ResizeNotesCommand;

/** One event as the user sees it: a note with its whole tie chain, or one rest. */
export interface NoteSpan {
  readonly voice: string;
  readonly start: number;
  readonly end: number;
  readonly midi: number | null;
  /** The read notes, while the span is untouched; null once it has to be written again from its interval. */
  readonly notes: ReadonlyArray<Note> | null;
}

/** One note span and the place it is being put, with the id the command named for it. */
interface Placement {
  readonly span: NoteSpan;
  readonly voice: string;
  readonly namedId: string;
  readonly start: number;
  readonly end: number;
  readonly midi: number;
  readonly order: number;
}

/**
 * The grid line nearest `tick`, counted from the start of the score. Adding zero turns the -0 that rounding a small
 * negative gives into 0, which the read-back compares with Object.is. `snapToGrid` is this line with the score's ends in
 * view, so the two cannot round differently.
 */
export function snap(tick: number, step: number): number {
  return Math.round(tick / step) * step + 0;
}

/** One step of a grid in ticks, or null for a grid that is not one: a value outside the offered ones, or a dotted flag that is no boolean. */
export function gridStepOf(grid: Grid): number | null {
  if (!GRID_VALUES.some((value) => value === grid.value)) return null;
  if (grid.dotted !== undefined && typeof grid.dotted !== "boolean") return null;
  const base = (4 * TICKS_PER_QUARTER) / grid.value;
  return grid.dotted === true ? (base * 3) / 2 : base;
}

export function gridLabel(grid: Grid): string {
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
export function gridAllowed(score: Score, step: number, constraints: DialectConstraints): boolean {
  const unitTicks = score.unitTicks;
  if (unitTicks === undefined || !Number.isInteger(step) || step <= 0) return false;
  if (!Number.isInteger(unitTicks) || unitTicks <= 0 || step % unitTicks !== 0) return false;
  return canWriteUnits(step / unitTicks, constraints.durations);
}

/** Whether the note commands take this grid on this score: the one check they and the editor's grid control share. */
export function isGridAllowed(score: Score, grid: Grid, constraints: DialectConstraints): boolean {
  const step = gridStepOf(grid);
  return step !== null && gridAllowed(score, step, constraints);
}

/**
 * The notes of one voice grouped into what the user sees as one note: a pitched note and every note its tie continues
 * into, or one rest. The voice's notes are passed already sorted, so `tieChain` does not sort them again per chain.
 */
export function spansOf(score: Score, voice: string): NoteSpan[] {
  const notes = score.notes.filter((note) => note.voice === voice).sort((left, right) => left.start - right.start);
  const spans: NoteSpan[] = [];
  let index = 0;
  while (index < notes.length) {
    const first = notes[index] as Note;
    if (first.midi === null) {
      spans.push({
        voice,
        start: first.start,
        end: first.start + first.duration,
        midi: null,
        notes: [first],
      });
      index += 1;
      continue;
    }
    const chain = tieChain(notes, first, notes);
    const last = chain[chain.length - 1] ?? first;
    spans.push({
      voice,
      start: first.start,
      end: last.start + last.duration,
      midi: first.midi,
      notes: chain,
    });
    index += chain.length;
  }
  return spans;
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
export function piecesFor(score: Score, span: NoteSpan, unitTicks: number, durations: DurationSet): Note[] {
  const pieces: Note[] = [];
  let at = span.start;
  while (at < span.end) {
    const bar = score.bars[barIndexAt(score, at)];
    if (bar === undefined) break;
    const segmentEnd = Math.min(span.end, bar.start + bar.length);
    for (const duration of splitLength(segmentEnd - at, unitTicks, durations)) {
      pieces.push({
        id: noteId(span.voice, at),
        voice: span.voice,
        bar: bar.index,
        start: at,
        duration,
        midi: span.midi,
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

function restSpan(voice: string, start: number, end: number): NoteSpan {
  return { voice, start, end, midi: null, notes: null };
}

/**
 * How far a voice's material reaches in each bar: a complete bar's end, or the last finished token of a bar where
 * the voice is cut. A bar with no material for that voice has no entry, so an untouched short voice grows no rests.
 */
export function fillEnds(score: Score): Map<string, number> {
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
export function fillVoice(
  score: Score,
  voice: string,
  notes: Note[],
  ends: Map<string, number>,
  unitTicks: number,
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
      if (event.start > cursor) {
        filled.push(...piecesFor(score, restSpan(voice, cursor, event.start), unitTicks, constraints.durations));
      }
      cursor = Math.max(cursor, event.start + event.duration);
      reached = Math.max(reached, event.start + event.duration);
    }
    const end = bar.incomplete || cutHere ? Math.min(reached, bar.start + bar.length) : bar.start + bar.length;
    if (cursor < end) {
      filled.push(...piecesFor(score, restSpan(voice, cursor, end), unitTicks, constraints.durations));
    }
  }
  return filled;
}

/** Clears a tie whose continuation is gone, is a rest, or has another pitch; RULES.md P10 and P12. */
export function repairTies(score: Score, notes: Note[], affected: ReadonlySet<string>): Note[] {
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
function splitEventAt(notes: Note[], at: number, unitTicks: number, durations: DurationSet, voice?: string): boolean {
  const index = notes.findIndex(
    (note) => (voice === undefined || note.voice === voice) && note.start < at && at < note.start + note.duration,
  );
  if (index < 0) return false;
  const event = notes[index] as Note;
  const pieces: Note[] = [];
  let start = event.start;
  const lengths = [
    ...splitLength(at - event.start, unitTicks, durations),
    ...splitLength(event.start + event.duration - at, unitTicks, durations),
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
export function splitAtKeyChanges(score: Score, notes: Note[], unitTicks: number, durations: DurationSet): Note[] {
  for (const change of score.keys) {
    if (change.at <= 0) continue;
    // A key change is shared by both voices, so every event still crossing it needs a boundary, not just the first.
    while (splitEventAt(notes, change.at, unitTicks, durations)) {
      // The split removes the crossing, and the next call finds another voice's event if one is still there.
    }
  }
  return notes;
}

/** Keeps every chord at its position and points it at the Vocal event that now starts there, splitting one if needed. */
export function placeChords(
  score: Score,
  notes: Note[],
  unitTicks: number,
  durations: DurationSet,
): { notes: Note[]; chords: Chord[] } {
  const next = [...notes];
  const chords = score.chords.map((chord) => {
    let event = next.find((note) => note.voice === "Vocal" && note.start === chord.start);
    if (event === undefined && splitEventAt(next, chord.start, unitTicks, durations, "Vocal")) {
      event = next.find((note) => note.voice === "Vocal" && note.start === chord.start);
    }
    return { ...chord, noteId: event?.id ?? null };
  });
  return { notes: next, chords };
}

/** A chain of tied notes as one thing with a pitch: from where it starts to where it ends. */
export interface Chain {
  readonly start: number;
  readonly end: number;
  readonly midi: number;
}

/**
 * Where a chain lands under a command at one grid step, before the refusal rules and the overlap rule act on it. A move
 * snaps the start only when it moves in time and keeps the length; a resize snaps the edge it moves and keeps the other.
 * The command and everything that shows or follows its result read the arithmetic here.
 */
export function landing(chain: Chain, command: MoveResizeCommand, step: number): Chain {
  if (command.type === "moveNotes") {
    const start = command.timeTicks === 0 ? chain.start : snap(chain.start + command.timeTicks, step);
    return { start, end: start + (chain.end - chain.start), midi: chain.midi + command.semitones };
  }
  if (command.edge === "start") {
    return { start: snap(chain.start + command.timeTicks, step), end: chain.end, midi: chain.midi };
  }
  return { start: chain.start, end: snap(chain.end + command.timeTicks, step), midi: chain.midi };
}

/**
 * The id each named note will have after the command: a chain is named by its first segment, which starts where the
 * chain lands, so the note a user moved is found again by its new start. Ids that name nothing pitched are left out.
 */
export function movedIds(score: Score, command: MoveResizeCommand): Map<string, string> {
  const moved = new Map<string, string>();
  const step = gridStepOf(command.grid);
  if (step === null) return moved;
  const byVoice = new Map<string, NoteSpan[]>();
  for (const id of command.noteIds) {
    const note = score.notes.find((candidate) => candidate.id === id);
    if (note === undefined || note.midi === null) continue;
    let spans = byVoice.get(note.voice);
    if (spans === undefined) {
      spans = spansOf(score, note.voice);
      byVoice.set(note.voice, spans);
    }
    const span = spans.find((candidate) => candidate.notes?.some((member) => member.id === id));
    if (span === undefined) continue;
    const { start } = landing({ start: span.start, end: span.end, midi: span.midi as number }, command, step);
    moved.set(id, noteId(span.voice, start));
  }
  return moved;
}

/**
 * Puts one span into a voice under the one-note-a-time rule: a span whose start it covers goes, and a span it starts
 * inside is shortened to the placed note's start. Every note touched is added to `affected`, so its ties are repaired.
 */
export function placeOverlap(byVoice: Map<string, NoteSpan[]>, span: NoteSpan, affected: Set<string>): void {
  const spans = byVoice.get(span.voice) ?? [];
  const kept: NoteSpan[] = [];
  for (const present of spans) {
    if (present.end <= span.start || present.start >= span.end) {
      kept.push(present);
      continue;
    }
    for (const member of present.notes ?? []) affected.add(member.id);
    if (present.start >= span.start) continue;
    kept.push({ ...present, end: span.start, notes: null });
  }
  kept.push(span);
  kept.sort((left, right) => left.start - right.start);
  byVoice.set(span.voice, kept);
}

/**
 * Writes the spans of every voice out as the notes and rests the score can hold, splitting at bar lines, tying across
 * them, repairing the ties the edit broke, rebinding chords, and putting the voices back in their order.
 */
export function finishPlacement(
  score: Score,
  byVoice: Map<string, NoteSpan[]>,
  affected: Set<string>,
  unitTicks: number,
  constraints: DialectConstraints,
): Score {
  const ends = fillEnds(score);
  const notes: Note[] = [];
  for (const voice of score.voices) {
    const voiceNotes: Note[] = [];
    for (const span of byVoice.get(voice) ?? []) {
      if (span.notes !== null) voiceNotes.push(...span.notes);
      else voiceNotes.push(...piecesFor(score, span, unitTicks, constraints.durations));
    }
    notes.push(...fillVoice(score, voice, voiceNotes, ends, unitTicks, constraints));
  }

  const split = splitAtKeyChanges(score, notes, unitTicks, constraints.durations);
  const repaired = repairTies(score, split, affected);
  const placed = placeChords(score, repaired, unitTicks, constraints.durations);
  return { ...score, notes: orderNotes(score, placed.notes), chords: placed.chords };
}

/**
 * Moves or resizes the whole tie chain of every named note as one command. All targets are checked before anything
 * changes, so a refusal names the first note that cannot be placed and leaves the score as it was.
 */
export function runNoteCommand(
  score: Score,
  command: MoveResizeCommand,
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

  const byVoice = new Map<string, NoteSpan[]>(score.voices.map((voice) => [voice, spansOf(score, voice)]));
  const spanOf = new Map<string, NoteSpan>();
  for (const spans of byVoice.values()) {
    for (const span of spans) {
      for (const note of span.notes ?? []) spanOf.set(note.id, span);
    }
  }

  const chosen: { span: NoteSpan; namedId: string; order: number }[] = [];
  const seen = new Set<NoteSpan>();
  const affected = new Set<string>();
  for (let order = 0; order < command.noteIds.length; order += 1) {
    const id = command.noteIds[order] as string;
    const note = score.notes.find((candidate) => candidate.id === id);
    if (note === undefined) return commandRefusal("note-not-found", { noteId: id }, { noteId: id });
    if (note.midi === null) return commandRefusal("not-a-note", { noteId: id }, noteAt(score, id));
    const span = spanOf.get(id);
    if (span !== undefined && !seen.has(span)) {
      seen.add(span);
      for (const member of span.notes ?? []) affected.add(member.id);
      chosen.push({ span, namedId: id, order });
    }
  }

  if (score.unitTicks === undefined) {
    const at = firstId === undefined ? {} : noteAt(score, firstId);
    return commandRefusal("unit-unknown", {}, at);
  }
  const unitTicks = score.unitTicks;

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
  const placements: Placement[] = [];
  for (const { span, namedId, order } of chosen) {
    const { start, end, midi } = landing(
      { start: span.start, end: span.end, midi: span.midi as number },
      command,
      step,
    );
    const at = noteAt(score, namedId);
    if (start < 0) return commandRefusal("note-before-start", {}, at);
    if (end > scoreEnd) return commandRefusal("note-past-end", {}, at);
    if (command.type === "resizeNotes" && end - start < step) {
      return commandRefusal(
        "note-too-short",
        { grid: gridLabel(command.grid), dotted: command.grid.dotted === true },
        at,
      );
    }
    if (midi < 0 || midi > 127) return commandRefusal("pitch-out-of-range", { midi }, at);
    placements.push({ span, voice: span.voice, namedId, start, end, midi, order });
  }

  const changed = placements.some(
    (placement) =>
      placement.start !== placement.span.start ||
      placement.end !== placement.span.end ||
      placement.midi !== placement.span.midi,
  );
  if (!changed) return { ok: true, score };

  const targetSpans = new Set(placements.map((placement) => placement.span));
  for (const [voice, spans] of byVoice)
    byVoice.set(
      voice,
      spans.filter((span) => !targetSpans.has(span)),
    );

  const ordered = [...placements].sort((left, right) => left.start - right.start || left.order - right.order);
  for (const placement of ordered) {
    placeOverlap(
      byVoice,
      { voice: placement.voice, start: placement.start, end: placement.end, midi: placement.midi, notes: null },
      affected,
    );
  }

  return { ok: true, score: finishPlacement(score, byVoice, affected, unitTicks, constraints) };
}

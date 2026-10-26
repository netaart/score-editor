// ABOUTME: The placing commands: add a note, paste copied notes at the insertion point, and repeat a selection after itself.
// ABOUTME: All three land on the current grid and obey the note commands' one-note-a-time rule within a voice.
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import {
  finishPlacement,
  type Grid,
  gridStepOf,
  isGridAllowed,
  type NoteSpan,
  placeOverlap,
  snap,
  spansOf,
} from "./commands-notes";
import type { Note, Score } from "./score";
import type { DialectConstraints } from "./types";

/** Adds one note of one grid step at `start`, on the nearest line of `grid`. */
export interface AddNoteCommand {
  readonly type: "addNote";
  readonly voice: string;
  readonly start: number;
  readonly midi: number;
  readonly grid: Grid;
}

/** One note as copy holds it: the voice, the user-visible start and length, and the pitch. */
export interface CopiedNote {
  readonly voice: string;
  readonly start: number;
  readonly duration: number;
  readonly midi: number;
}

/** Puts copied notes at `at`, keeping the distance between them. */
export interface PasteNotesCommand {
  readonly type: "pasteNotes";
  readonly notes: ReadonlyArray<CopiedNote>;
  readonly at: number;
  readonly grid: Grid;
}

/** Repeats every named note's whole tie chain right after the selection. */
export interface DuplicateNotesCommand {
  readonly type: "duplicateNotes";
  readonly noteIds: ReadonlyArray<string>;
  readonly grid: Grid;
}

/** Copies every named note's whole tie chain by a drag's distance and pitch, leaving the originals where they are. */
export interface CopyNotesCommand {
  readonly type: "copyNotes";
  readonly noteIds: ReadonlyArray<string>;
  readonly timeTicks: number;
  readonly semitones: number;
  readonly grid: Grid;
}

/** The user-visible spans the named notes belong to, refusing an id that names nothing or a rest. */
function spansForSelection(
  score: Score,
  noteIds: ReadonlyArray<string>,
): { ok: true; spans: NoteSpan[] } | { ok: false; result: ScoreCommandResult } {
  const wanted = new Set<string>();
  for (const id of noteIds) {
    const note = score.notes.find((candidate) => candidate.id === id);
    if (note === undefined) {
      return { ok: false, result: commandRefusal("note-not-found", { noteId: id }, { noteId: id }) };
    }
    if (note.midi === null) {
      return { ok: false, result: commandRefusal("not-a-note", { noteId: id }, { noteId: id, voice: note.voice }) };
    }
    wanted.add(id);
  }
  const spans: NoteSpan[] = [];
  for (const voice of score.voices) {
    for (const span of spansOf(score, voice)) {
      if (!(span.notes ?? []).some((note) => wanted.has(note.id))) continue;
      spans.push(span);
    }
  }
  return { ok: true, spans };
}

/** Runs the commands that add notes: the new notes all go through the overlap rule and the writer's bar-line split. */
export function runPlaceCommand(
  score: Score,
  command: AddNoteCommand | PasteNotesCommand | DuplicateNotesCommand | CopyNotesCommand,
  constraints: DialectConstraints,
): ScoreCommandResult {
  if (score.unitTicks === undefined) return commandRefusal("unit-unknown", {});
  const unitTicks = score.unitTicks;
  const step = gridStepOf(command.grid);
  if (step === null || !isGridAllowed(score, command.grid, constraints)) {
    return commandRefusal("grid-not-allowed", {
      grid: `1/${String(command.grid.value)}`,
      dotted: command.grid.dotted === true,
    });
  }
  const last = score.bars[score.bars.length - 1];
  const scoreEnd = last === undefined ? 0 : last.start + last.length;
  const spans = new Map(score.voices.map((name) => [name, spansOf(score, name)]));

  const wanted: NoteSpan[] = [];
  if (command.type === "duplicateNotes" || command.type === "copyNotes") {
    const found = spansForSelection(score, command.noteIds);
    if (!found.ok) return found.result;
    const selected = found.spans;
    if (selected.length === 0) return { ok: true, score };
    if (command.type === "copyNotes") {
      if (!Number.isInteger(command.timeTicks)) return commandRefusal("offset-not-integer", { field: "time" });
      if (!Number.isInteger(command.semitones)) return commandRefusal("offset-not-integer", { field: "pitch" });
      if (command.timeTicks === 0 && command.semitones === 0) return { ok: true, score };
      for (const span of selected) {
        const start = snap(span.start + command.timeTicks, step);
        const midi = (span.midi as number) + command.semitones;
        if (midi < 0 || midi > 127) return commandRefusal("pitch-out-of-range", { midi });
        wanted.push({ voice: span.voice, start, end: start + (span.end - span.start), midi, notes: null });
      }
    } else {
      const first = Math.min(...selected.map((span) => span.start));
      const last = Math.max(...selected.map((span) => span.end));
      const offset = Math.max(step, snap(last, step) - snap(first, step));
      for (const span of selected) {
        const start = snap(span.start + offset, step);
        const end = Math.max(start + step, snap(span.end + offset, step));
        wanted.push({ voice: span.voice, start, end, midi: span.midi as number, notes: null });
      }
    }
  } else if (command.type === "addNote") {
    if (!Number.isFinite(command.start) || !Number.isInteger(command.start)) {
      return commandRefusal("offset-not-integer", { field: "time" });
    }
    if (!Number.isInteger(command.midi) || command.midi < 0 || command.midi > 127) {
      return commandRefusal("pitch-out-of-range", { midi: command.midi });
    }
    const start = snap(command.start, step);
    wanted.push({ voice: command.voice, start, end: start + step, midi: command.midi, notes: null });
  } else if (command.notes.length > 0) {
    if (!Number.isFinite(command.at) || !Number.isInteger(command.at)) {
      return commandRefusal("offset-not-integer", { field: "time" });
    }
    const copies = command.notes;
    const first = Math.min(...copies.map((note) => note.start));
    const target = snap(command.at, step);
    for (const note of copies) {
      if (!Number.isFinite(note.start) || !Number.isFinite(note.duration)) {
        return commandRefusal("offset-not-integer", { field: "time" });
      }
      if (!Number.isInteger(note.start) || !Number.isInteger(note.duration) || note.duration <= 0) {
        return commandRefusal("note-too-short", {});
      }
      if (!Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) {
        return commandRefusal("pitch-out-of-range", { midi: note.midi });
      }
      const start = snap(note.start + (target - first), step);
      const end = Math.max(start + step, snap(note.start + note.duration + (target - first), step));
      wanted.push({ voice: note.voice, start, end, midi: note.midi, notes: null });
    }
  }

  for (const span of wanted) {
    if (!spans.has(span.voice)) return commandRefusal("not-a-note", { voice: span.voice });
    if (span.start < 0) return commandRefusal("note-before-start", {});
    if (span.end > scoreEnd) return commandRefusal("note-past-end", {});
  }

  const affected = new Set<string>();
  const ordered = [...wanted].sort((left, right) => left.start - right.start);
  for (const span of ordered) placeOverlap(spans, span, affected);
  return { ok: true, score: finishPlacement(score, spans, affected, unitTicks, constraints) };
}

/** The pitched notes of `after` whose ids were not in `before`: what a placing command added or copied. */
export function placedNotes(before: Score, after: Score): Note[] {
  const known = new Set(before.notes.map((note) => note.id));
  return after.notes.filter((note) => note.midi !== null && !known.has(note.id));
}

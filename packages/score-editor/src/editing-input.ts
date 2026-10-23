// ABOUTME: The editing input layer: what a key or a click means for an editing session, with no DOM and no event objects.
// ABOUTME: The view parts turn their events into these inputs, so a host's own views get the same keys and clicks.

import { gridTicks } from "./arrangement";
import type { ScoreCommand } from "./commands";
import { type Grid, gridStepOf } from "./commands-notes";
import type { Diagnostic } from "./diagnostics";
import { gridLineAfter, gridLineBefore, snapToGrid } from "./grid";
import type { Score } from "./score";
import {
  clearSelection,
  invertSelection,
  selectAll,
  selectionActionOf,
  selectNotes,
  toggleNote,
} from "./selection-input";
import type { EditingSession, InsertionPoint } from "./session";
import type { ScoreTool } from "./tool";
import { arrangementShown } from "./view-rules";

/** A key press with the modifiers that were held. */
export interface EditingKeyInput {
  readonly type: "key";
  /** The key as the platform names it: `Delete`, `Backspace`, `ArrowLeft`, `z`. */
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

/** One thing the user did, as the session understands it. */
export type EditingInput =
  | EditingKeyInput
  /** A click or tap on a note. */
  | { readonly type: "click-note"; readonly noteId: string }
  /** A click or tap on empty space, at a position of the time axis in ticks (it need not be a whole number). */
  | { readonly type: "click-empty"; readonly tick: number }
  /** A control that deletes, such as a toolbar button: it does what the Delete key does. */
  | { readonly type: "delete" }
  /** A click or tap on a note with Shift held: the note joins the selection, or leaves it when it is selected. */
  | { readonly type: "toggle-note"; readonly noteId: string }
  /**
   * A box drawn around notes: exactly the pitched notes among `noteIds` are selected, or with `add` they join the
   * selection. A box with no note in it clears the selection, unless it adds.
   */
  | { readonly type: "select-notes"; readonly noteIds: ReadonlyArray<string>; readonly add?: boolean }
  /** A control that selects every note, such as a menu item: it does what Ctrl+A does. */
  | { readonly type: "select-all" }
  /** A control that inverts the selection: it does what Ctrl+Shift+A does. */
  | { readonly type: "invert-selection" }
  /** A control that clears the selection: it does what Escape does. */
  | { readonly type: "clear-selection" }
  /**
   * A drag that moves the selected notes, as one edit: by `timeTicks` in time, which the session's grid snaps each start
   * to, and by `semitones` in pitch. It does what an arrow key does, with the distance the pointer covered.
   */
  | { readonly type: "move-notes"; readonly timeTicks: number; readonly semitones: number }
  /** A drag of one edge of the selected notes, as one edit: the edge moves by `timeTicks`, snapped to the session's grid. */
  | { readonly type: "resize-notes"; readonly edge: "start" | "end"; readonly timeTicks: number };

/** What an input came to. */
export interface EditingInputResult {
  /** The input meant something here, so the caller should keep the browser from also acting on it. */
  readonly handled: boolean;
  /** The diagnostics of a command this input caused and the session refused; empty otherwise. */
  readonly refused: ReadonlyArray<Diagnostic>;
}

const IGNORED: EditingInputResult = { handled: false, refused: [] };
const HANDLED: EditingInputResult = { handled: true, refused: [] };

/**
 * The score the session reads, or null while its project cannot be read or a view other than the arrangement is shown:
 * then no selection, insertion point or delete has anything to act on, since the notes they name are not on screen.
 */
function readableScore(session: EditingSession): Score | null {
  const { reading } = session;
  return reading.kind === "score" && arrangementShown(session) ? reading.score : null;
}

/** Ctrl or Cmd with Z undoes and with Shift redoes; Ctrl with Y redoes. Null for any other key. */
function historyActionOf(input: EditingKeyInput): "undo" | "redo" | null {
  if (input.altKey === true || (input.ctrlKey !== true && input.metaKey !== true)) return null;
  const letter = input.key.toLowerCase();
  if (letter === "z") return input.shiftKey === true ? "redo" : "undo";
  if (letter === "y" && input.ctrlKey === true && input.metaKey !== true && input.shiftKey !== true) return "redo";
  return null;
}

/**
 * Where an insertion point key sends the point, in ticks, or null when the key is not one or has nothing to act on:
 * Left and Right step to the neighbouring line of the grid and need a point, Home and End go to the ends of the score.
 */
function insertionPointTargetOf(
  score: Score,
  step: number,
  point: InsertionPoint | null,
  input: EditingKeyInput,
): number | null {
  if (input.ctrlKey === true || input.metaKey === true || input.shiftKey === true || input.altKey === true) return null;
  if (input.key === "Home") return 0;
  if (input.key === "End") return gridTicks(score);
  if (point === null) return null;
  if (input.key === "ArrowLeft") return gridLineBefore(point.tick, step);
  if (input.key === "ArrowRight") return gridLineAfter(point.tick, step, gridTicks(score));
  return null;
}

/**
 * The selected ids that name a pitched note in `score`, in the order of the score. A rest keeps its id, so the selection
 * can still hold one. The order is the score's, not the order the notes were picked in, so what a refusal points at does
 * not depend on it.
 */
function pitchedSelection(score: Score, selection: ReadonlyArray<string>): string[] {
  const selected = new Set(selection);
  return score.notes.filter((note) => note.midi !== null && selected.has(note.id)).map((note) => note.id);
}

/**
 * Delete as a tool, so the session runs it through the one path every tool takes: all of it applies as one history
 * step, or none of it does. It is one command on every selected pitched note, so the score is written and checked once.
 */
function deleteTool(score: Score): ScoreTool {
  return {
    id: "delete",
    name: { en: "Delete", zh: "删除" },
    commands(_project, selection) {
      const noteIds = pitchedSelection(score, selection);
      return noteIds.length === 0 ? [] : [{ type: "toRests", noteIds }];
    },
  };
}

/**
 * Moves or resizes the selected pitched notes with one command on the session's grid. Nothing is handled when no pitched
 * note is selected, which leaves the key to the insertion point. The offsets are whole ticks and semitones, so a pointer's
 * fraction is rounded here and the command never refuses it as a fraction.
 */
function editSelection(
  session: EditingSession,
  command: (noteIds: string[], grid: Grid) => ScoreCommand,
): EditingInputResult {
  const score = readableScore(session);
  if (score === null) return IGNORED;
  const noteIds = pitchedSelection(score, session.selection);
  if (noteIds.length === 0) return IGNORED;
  const result = session.dispatch(command(noteIds, session.grid));
  return { handled: true, refused: result.ok ? [] : result.diagnostics };
}

function moveSelection(session: EditingSession, timeTicks: number, semitones: number): EditingInputResult {
  return editSelection(session, (noteIds, grid) => ({
    type: "moveNotes",
    noteIds,
    timeTicks: Math.round(timeTicks),
    semitones: Math.round(semitones),
    grid,
  }));
}

function resizeSelection(session: EditingSession, edge: "start" | "end", timeTicks: number): EditingInputResult {
  return editSelection(session, (noteIds, grid) => ({
    type: "resizeNotes",
    noteIds,
    edge,
    timeTicks: Math.round(timeTicks),
    grid,
  }));
}

/**
 * What an arrow key does to the selected notes. Left and Right move them by a grid step, Up and Down by a semitone and
 * with Shift by an octave; Shift with Left and Right moves the end edge by a grid step. Ctrl, Cmd and Alt are left to the
 * keys that walk the focus and to the system.
 */
function pressNoteKey(session: EditingSession, input: EditingKeyInput): EditingInputResult {
  if (input.ctrlKey === true || input.metaKey === true || input.altKey === true) return IGNORED;
  const step = gridStepOf(session.grid);
  const shift = input.shiftKey === true;
  if (step === null) return IGNORED;
  switch (input.key) {
    case "ArrowLeft":
    case "ArrowRight": {
      const direction = input.key === "ArrowRight" ? 1 : -1;
      return shift ? resizeSelection(session, "end", direction * step) : moveSelection(session, direction * step, 0);
    }
    case "ArrowUp":
    case "ArrowDown": {
      const direction = input.key === "ArrowUp" ? 1 : -1;
      return moveSelection(session, 0, direction * (shift ? 12 : 1));
    }
    default:
      return IGNORED;
  }
}

/**
 * Whether the editing keys have a note to act on: the session is editable, the arrangement is shown and a pitched note
 * is selected. Then the arrow keys move and resize the selection, and no key steps from note to note or moves the
 * insertion point.
 */
export function canEditSelection(session: EditingSession): boolean {
  const score = readableScore(session);
  return session.view.editable && score !== null && pitchedSelection(score, session.selection).length > 0;
}

/** Whether Delete has a note to act on: the same notes the editing keys act on. */
export function canDeleteSelection(session: EditingSession): boolean {
  return canEditSelection(session);
}

/** Turns the selected notes into rests, as one edit. Nothing is handled when no selected note is pitched. */
function deleteSelection(session: EditingSession): EditingInputResult {
  const score = readableScore(session);
  if (score === null || pitchedSelection(score, session.selection).length === 0) return IGNORED;
  const result = session.runTool(deleteTool(score));
  return { handled: true, refused: result.ok ? [] : result.diagnostics };
}

function clickNote(session: EditingSession, noteId: string): EditingInputResult {
  const note = readableScore(session)?.notes.find((found) => found.id === noteId);
  if (note === undefined || note.midi === null) return IGNORED;
  session.select([noteId]);
  return HANDLED;
}

function clickEmpty(session: EditingSession, tick: number): EditingInputResult {
  const score = readableScore(session);
  if (score === null || !Number.isFinite(tick)) return IGNORED;
  session.select([]);
  const step = gridStepOf(session.grid) ?? 1;
  session.setInsertionPoint({ tick: snapToGrid(tick, step, gridTicks(score)) });
  return HANDLED;
}

/** Runs a selection input over the score, which must be readable: then there are no notes to select and nothing is handled. */
function selectWith(session: EditingSession, act: (score: Score) => EditingInputResult): EditingInputResult {
  const score = readableScore(session);
  return score === null ? IGNORED : act(score);
}

function pressKey(session: EditingSession, input: EditingKeyInput): EditingInputResult {
  if (input.key === "Delete" || input.key === "Backspace") return deleteSelection(session);
  const history = historyActionOf(input);
  if (history !== null) {
    session[history]();
    return HANDLED;
  }
  const selecting = selectionActionOf(input);
  if (selecting !== null) return handleEditingInput(session, { type: selecting });
  const editing = pressNoteKey(session, input);
  if (editing.handled) return editing;
  const score = readableScore(session);
  const step = gridStepOf(session.grid) ?? 1;
  const tick = score === null ? null : insertionPointTargetOf(score, step, session.insertionPoint, input);
  if (tick === null) return IGNORED;
  session.setInsertionPoint({ tick });
  return HANDLED;
}

/**
 * Applies one input to the session. While the session is not editable nothing is handled and nothing changes.
 */
export function handleEditingInput(session: EditingSession, input: EditingInput): EditingInputResult {
  if (!session.view.editable) return IGNORED;
  switch (input.type) {
    case "click-note":
      return clickNote(session, input.noteId);
    case "click-empty":
      return clickEmpty(session, input.tick);
    case "delete":
      return deleteSelection(session);
    case "toggle-note":
      return selectWith(session, (score) => toggleNote(session, score, input.noteId));
    case "select-notes":
      return selectWith(session, (score) => selectNotes(session, score, input.noteIds, input.add === true));
    case "select-all":
      return selectWith(session, (score) => selectAll(session, score));
    case "invert-selection":
      return selectWith(session, (score) => invertSelection(session, score));
    case "clear-selection":
      return selectWith(session, () => clearSelection(session));
    case "move-notes":
      return moveSelection(session, input.timeTicks, input.semitones);
    case "resize-notes":
      return resizeSelection(session, input.edge, input.timeTicks);
    case "key":
      return pressKey(session, input);
  }
}

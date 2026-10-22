// ABOUTME: The editing input layer: what a key or a click means for an editing session, with no DOM and no event objects.
// ABOUTME: The view parts turn their events into these inputs, so a host's own views get the same keys and clicks.
import { beatLineAfter, beatLineBefore, gridTicks, nearestBeatLine } from "./arrangement";
import type { Diagnostic } from "./diagnostics";
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
  | { readonly type: "clear-selection" };

/** What an input came to. */
export interface EditingInputResult {
  /** The input meant something here, so the caller should keep the browser from also acting on it. */
  readonly handled: boolean;
  /** The diagnostics of a command this input caused and the session refused; empty otherwise. */
  readonly refused: ReadonlyArray<Diagnostic>;
}

const IGNORED: EditingInputResult = { handled: false, refused: [] };
const HANDLED: EditingInputResult = { handled: true, refused: [] };

/** The score the session reads, or null while its project cannot be read: then no input has anything to act on. */
function readableScore(session: EditingSession): Score | null {
  const { reading } = session;
  return reading.kind === "score" ? reading.score : null;
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
 * Left and Right step to the neighbouring beat line and need a point, Home and End go to the ends of the score.
 */
function insertionPointTargetOf(score: Score, point: InsertionPoint | null, input: EditingKeyInput): number | null {
  if (input.ctrlKey === true || input.metaKey === true || input.shiftKey === true || input.altKey === true) return null;
  if (input.key === "Home") return 0;
  if (input.key === "End") return gridTicks(score);
  if (point === null) return null;
  if (input.key === "ArrowLeft") return beatLineBefore(score.bars, point.tick);
  if (input.key === "ArrowRight") return beatLineAfter(score.bars, point.tick);
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

/** Whether Delete has a note to act on: the session is editable and a pitched note is selected. */
export function canDeleteSelection(session: EditingSession): boolean {
  const score = readableScore(session);
  return session.view.editable && score !== null && pitchedSelection(score, session.selection).length > 0;
}

/** Turns the selected notes into rests, as one edit. Nothing is handled when no selected note is pitched. */
function deleteSelection(session: EditingSession): EditingInputResult {
  const score = readableScore(session);
  if (score === null || pitchedSelection(score, session.selection).length === 0) return IGNORED;
  const result = session.runTool(deleteTool(score));
  return { handled: true, refused: result.diagnostics };
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
  session.setInsertionPoint({ tick: nearestBeatLine(score.bars, tick) });
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
  const score = readableScore(session);
  const tick = score === null ? null : insertionPointTargetOf(score, session.insertionPoint, input);
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
    case "key":
      return pressKey(session, input);
  }
}

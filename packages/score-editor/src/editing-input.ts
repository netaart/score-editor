// ABOUTME: The editing input layer: what a key or a click means for an editing session, with no DOM and no event objects.
// ABOUTME: The view parts turn their events into these inputs, so a host's own views get the same keys and clicks.
import { beatLineAfter, beatLineBefore, gridTicks, nearestBeatLine } from "./arrangement";
import type { Diagnostic } from "./diagnostics";
import type { Score } from "./score";
import type { EditingSession, InsertionPoint } from "./session";

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
  | { readonly type: "click-empty"; readonly tick: number };

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

/** The selected ids that still name a pitched note, read now: an earlier command may have turned some into rests. */
function selectedNotes(session: EditingSession): string[] {
  const score = readableScore(session);
  if (score === null) return [];
  const pitched = new Set(score.notes.filter((note) => note.midi !== null).map((note) => note.id));
  return session.selection.filter((id) => pitched.has(id));
}

/**
 * Turns each selected note into a rest. A tie chain turns as a whole, so one command can take the other selected
 * segments of its chain with it: the selection is read again after every command.
 */
function deleteSelection(session: EditingSession): EditingInputResult {
  const refused: Diagnostic[] = [];
  const tried = new Set<string>();
  const untried = () => selectedNotes(session).find((id) => !tried.has(id));
  for (let noteId = untried(); noteId !== undefined; noteId = untried()) {
    tried.add(noteId);
    const result = session.dispatch({ type: "toRest", noteId });
    if (!result.ok) refused.push(...result.diagnostics);
  }
  return { handled: tried.size > 0, refused };
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

function pressKey(session: EditingSession, input: EditingKeyInput): EditingInputResult {
  if (input.key === "Delete" || input.key === "Backspace") return deleteSelection(session);
  const history = historyActionOf(input);
  if (history !== null) {
    session[history]();
    return HANDLED;
  }
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
    case "key":
      return pressKey(session, input);
  }
}

// ABOUTME: The editing input layer: what a key or a click means for an editing session, with no DOM and no event objects.
// ABOUTME: The view parts turn their events into these inputs, so a host's own views get the same keys and clicks.
import { beatLineAfter, beatLineBefore, gridTicks, nearestBeatLine } from "./arrangement";
import type { Diagnostic } from "./diagnostics";
import type { EditingSession } from "./session";

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

/** Ctrl or Cmd with Z undoes and with Shift redoes; Ctrl with Y redoes. True when the key was one of these. */
function historyKey(session: EditingSession, input: EditingKeyInput): boolean {
  if (input.altKey === true || (input.ctrlKey !== true && input.metaKey !== true)) return false;
  const letter = input.key.toLowerCase();
  if (letter === "z") {
    if (input.shiftKey === true) session.redo();
    else session.undo();
    return true;
  }
  if (letter === "y" && input.ctrlKey === true && input.metaKey !== true && input.shiftKey !== true) {
    session.redo();
    return true;
  }
  return false;
}

/** The selected ids that still name a pitched note, read now: an earlier command may have turned some into rests. */
function selectedNotes(session: EditingSession): string[] {
  const { reading, selection } = session;
  if (reading.kind !== "score") return [];
  const pitched = new Set(reading.score.notes.filter((note) => note.midi !== null).map((note) => note.id));
  return selection.filter((id) => pitched.has(id));
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
  const { reading } = session;
  const note = reading.kind === "score" ? reading.score.notes.find((found) => found.id === noteId) : undefined;
  if (note === undefined || note.midi === null) return IGNORED;
  session.select([noteId]);
  return HANDLED;
}

function clickEmpty(session: EditingSession, tick: number): EditingInputResult {
  const { reading } = session;
  if (reading.kind !== "score" || !Number.isFinite(tick)) return IGNORED;
  session.select([]);
  session.setInsertionPoint({ tick: nearestBeatLine(reading.score.bars, tick) });
  return HANDLED;
}

/** Left and Right step the insertion point to the neighbouring beat line, Home and End send it to the ends. */
function moveInsertionPoint(session: EditingSession, input: EditingKeyInput): boolean {
  if (input.ctrlKey === true || input.metaKey === true || input.shiftKey === true || input.altKey === true)
    return false;
  const { reading, insertionPoint } = session;
  if (reading.kind !== "score") return false;
  const { bars } = reading.score;
  let tick: number;
  if (input.key === "Home") tick = 0;
  else if (input.key === "End") tick = gridTicks(reading.score);
  else if (insertionPoint === null) return false;
  else if (input.key === "ArrowLeft") tick = beatLineBefore(bars, insertionPoint.tick);
  else if (input.key === "ArrowRight") tick = beatLineAfter(bars, insertionPoint.tick);
  else return false;
  session.setInsertionPoint({ tick });
  return true;
}

/**
 * Applies one input to the session. While the session is not editable nothing is handled and nothing changes.
 */
export function handleEditingInput(session: EditingSession, input: EditingInput): EditingInputResult {
  if (!session.view.editable) return IGNORED;
  if (input.type === "click-note") return clickNote(session, input.noteId);
  if (input.type === "click-empty") return clickEmpty(session, input.tick);
  if (input.key === "Delete" || input.key === "Backspace") return deleteSelection(session);
  return historyKey(session, input) || moveInsertionPoint(session, input) ? HANDLED : IGNORED;
}

// ABOUTME: What selecting several notes means for an editing session: toggling one, taking a box, all, the rest, none.
// ABOUTME: DOM-free, over a session and its score; a tie chain is selected as a whole, so "selected" means a chain with a selected note.
import { tieChain } from "./commands-shared";
import type { EditingInputResult, EditingKeyInput } from "./editing-input";
import type { Score } from "./score";
import type { EditingSession } from "./session";

const HANDLED: EditingInputResult = { handled: true, refused: [] };
const IGNORED: EditingInputResult = { handled: false, refused: [] };

/** The ids of every pitched note of the score, in the score's order. Only a pitched note can be selected. */
function pitchedIds(score: Score): string[] {
  return score.notes.filter((note) => note.midi !== null).map((note) => note.id);
}

/**
 * The ids of the notes shown as selected: every note of a tie chain in which some pitched note is selected. A rest keeps
 * its id, so the selection can hold ids that name rests; they are not selected in this sense.
 */
function selectedIds(score: Score, selection: ReadonlyArray<string>): Set<string> {
  const selected = new Set(selection);
  const byVoice = new Map<string, Array<Score["notes"][number]>>();
  for (const note of score.notes) {
    const notes = byVoice.get(note.voice);
    if (notes === undefined) byVoice.set(note.voice, [note]);
    else notes.push(note);
  }

  const shown = new Set<string>();
  for (const notes of byVoice.values()) {
    notes.sort((a, b) => a.start - b.start);
    let chain: Array<Score["notes"][number]> = [];
    for (const note of notes) {
      chain.push(note);
      if (note.tie) continue;
      if (chain.some((member) => member.midi !== null && selected.has(member.id))) {
        for (const member of chain) shown.add(member.id);
      }
      chain = [];
    }
    if (chain.some((member) => member.midi !== null && selected.has(member.id))) {
      for (const member of chain) shown.add(member.id);
    }
  }
  return shown;
}

/** Adds the note to the selection, or takes it out together with its tie chain when it is selected already. */
export function toggleNote(session: EditingSession, score: Score, noteId: string): EditingInputResult {
  const note = score.notes.find((found) => found.id === noteId);
  if (note === undefined || note.midi === null) return IGNORED;
  if (selectedIds(score, session.selection).has(noteId)) {
    const chain = new Set(tieChain(score.notes, note).map((member) => member.id));
    session.select(session.selection.filter((id) => !chain.has(id)));
  } else {
    session.select([...session.selection, noteId]);
  }
  return HANDLED;
}

/** Selects the pitched notes among `noteIds`, in place of the selection or, with `add`, besides it. */
export function selectNotes(
  session: EditingSession,
  score: Score,
  noteIds: ReadonlyArray<string>,
  add: boolean,
): EditingInputResult {
  const pitched = new Set(pitchedIds(score));
  const wanted = noteIds.filter((id) => pitched.has(id));
  session.select(add ? [...session.selection, ...wanted] : wanted);
  return HANDLED;
}

export function selectAll(session: EditingSession, score: Score): EditingInputResult {
  session.select(pitchedIds(score));
  return HANDLED;
}

/** Selects every pitched note that is not selected, and lets go of those that are. */
export function invertSelection(session: EditingSession, score: Score): EditingInputResult {
  const shown = selectedIds(score, session.selection);
  session.select(pitchedIds(score).filter((id) => !shown.has(id)));
  return HANDLED;
}

/**
 * Clears the selection. Nothing is handled when it is empty, which leaves Escape to the host. A selection that holds only
 * the ids of rests, which is what Delete leaves, is not empty: it is cleared though nothing shows it.
 */
export function clearSelection(session: EditingSession): EditingInputResult {
  if (session.selection.length === 0) return IGNORED;
  session.select([]);
  return HANDLED;
}

export type SelectionAction = "select-all" | "invert-selection" | "clear-selection";

/**
 * Ctrl or Cmd with A selects all and with Shift inverts; Escape clears. Alt, and Escape with any modifier, are left to
 * whoever else wants them. Null for any other key.
 */
export function selectionActionOf(input: EditingKeyInput): SelectionAction | null {
  if (input.altKey === true) return null;
  const command = input.ctrlKey === true || input.metaKey === true;
  if (input.key === "Escape") return command || input.shiftKey === true ? null : "clear-selection";
  if (command && input.key.toLowerCase() === "a") return input.shiftKey === true ? "invert-selection" : "select-all";
  return null;
}

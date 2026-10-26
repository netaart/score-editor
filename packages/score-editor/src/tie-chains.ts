// ABOUTME: The tie chains of one voice: a pitched note and every note its tie continues into, in time order.
// ABOUTME: filterNotes counts a chain as one note, and the commands and selection paths act on the same chain.
import type { Note } from "./score";

/**
 * One voice's notes, in time order, as the chains a person sees: a pitched note and every note its tie continues into.
 * A rest ends the chain before it and is not part of one; a tie that leads nowhere ends the chain with its note.
 */
export function tieChains(voiceNotes: ReadonlyArray<Note>): Note[][] {
  const chains: Note[][] = [];
  let members: Note[] = [];
  const close = (): void => {
    if (members.length > 0) chains.push(members);
    members = [];
  };
  for (const note of voiceNotes) {
    if (note.midi === null) {
      close();
      continue;
    }
    members.push(note);
    if (!note.tie) close();
  }
  close();
  return chains;
}

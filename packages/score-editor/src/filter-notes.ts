// ABOUTME: filterNotes: the notes of a score that satisfy a set of conditions, as ids. Pure: it reads the score and nothing else.
// ABOUTME: A tie chain counts as one note and a rest as none; conditions combine with "and", and invert takes the others.
import type { Note, Score } from "./score";

/** An inclusive range of whole or fractional numbers; a bound that is not given is open. */
interface Range {
  readonly min?: number;
  readonly max?: number;
}

/**
 * The conditions that pick notes. Each one that is present narrows the picked notes, so they combine with "and"; a
 * condition that is absent does not count. A note is a tie chain: a run of notes joined by ties is one note, as long as
 * the whole run, starting where the run starts, with the pitch of the run. A rest is no note.
 */
export interface NoteFilter {
  /** MIDI pitch, both bounds inclusive. */
  readonly pitch?: Range;
  /** Ticks. A note passes when it starts at `from` or later and before `to`, so ranges that meet share no note. */
  readonly time?: { readonly from?: number; readonly to?: number };
}

/** One note as the filter sees it: a tie chain, or a single note that is tied to nothing. */
interface Chain {
  readonly voice: string;
  readonly members: ReadonlyArray<Note>;
  readonly start: number;
  readonly duration: number;
  readonly midi: number;
}

/**
 * The pitched notes of every voice as chains, voice by voice and in time order. A chain goes on while a note is tied and
 * a pitched note follows it; a rest ends it, and a rest is never a chain of its own.
 */
function chainsOf(score: Score): Chain[] {
  const chains: Chain[] = [];
  for (const voice of score.voices) {
    const notes = score.notes.filter((note) => note.voice === voice).sort((a, b) => a.start - b.start);
    let members: Note[] = [];
    const close = (): void => {
      const [first] = members;
      const last = members[members.length - 1];
      if (first !== undefined && last !== undefined && first.midi !== null) {
        chains.push({
          voice,
          members,
          start: first.start,
          duration: last.start + last.duration - first.start,
          midi: first.midi,
        });
      }
      members = [];
    };
    for (const note of notes) {
      if (note.midi === null) {
        close();
        continue;
      }
      members.push(note);
      if (!note.tie) close();
    }
    close();
  }
  return chains;
}

function within(value: number, range: Range): boolean {
  return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
}

function startsIn(start: number, time: { readonly from?: number; readonly to?: number }): boolean {
  return (time.from === undefined || start >= time.from) && (time.to === undefined || start < time.to);
}

/**
 * The ids of the notes that satisfy `filter`, in the order of `score.notes`. A tie chain that satisfies it contributes
 * the id of each of its segments, as selecting all notes does, so the result can go straight to `session.select`.
 */
export function filterNotes(score: Score, filter: NoteFilter): string[] {
  const picked = new Set<string>();
  for (const chain of chainsOf(score)) {
    if (filter.pitch !== undefined && !within(chain.midi, filter.pitch)) continue;
    if (filter.time !== undefined && !startsIn(chain.start, filter.time)) continue;
    for (const member of chain.members) picked.add(member.id);
  }
  return score.notes.filter((note) => picked.has(note.id)).map((note) => note.id);
}

// ABOUTME: filterNotes: the notes of a score that satisfy a set of conditions, as ids, and the counts the Filter panel shows. Pure: it reads the score and nothing else.
// ABOUTME: A tie chain counts as one note and a rest as none; conditions combine with "and", and invert takes the others.
import { effectiveKeyAt } from "./commands-shared";
import type { Note, Score } from "./score";
import { keyPitchClasses } from "./spelling";

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
  /** Ticks, both bounds inclusive: the length of the whole note, a tie chain counted as one. */
  readonly duration?: Range;
  /**
   * Whether the pitch class of the note is in the scale of the key in force where the note starts ("in"), or is not ("out").
   * A minor key counts as its natural minor. A note whose key cannot be read is neither in nor out.
   */
  readonly key?: "in" | "out";
  /**
   * One note in every `every` (a whole number, 1 or more) of the notes the other conditions let through, counted along
   * each voice on its own in time order, after passing over the first `skip` (a whole number, 0 or more; default 0). Numbers
   * that are not those take nothing, as an empty range does; nothing is refused.
   */
  readonly count?: { readonly every: number; readonly skip?: number };
  /** Takes the pitched notes that the conditions above do not take, all of them together, instead of those they take. */
  readonly invert?: boolean;
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

/** Whether the note is in the key in force at its start; null when that key cannot be read. */
function inKey(score: Score, chain: Chain, scales: Map<string, ReadonlySet<number> | null>): boolean | null {
  const key = effectiveKeyAt(score, chain.start);
  if (!scales.has(key)) scales.set(key, keyPitchClasses(key));
  const scale = scales.get(key);
  return scale === undefined || scale === null ? null : scale.has(chain.midi % 12);
}

function within(value: number, range: Range): boolean {
  return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
}

function startsIn(start: number, time: { readonly from?: number; readonly to?: number }): boolean {
  return (time.from === undefined || start >= time.from) && (time.to === undefined || start < time.to);
}

/** The chains at the places `skip`, `skip + every`, `skip + 2 * every` and so on of their own voice, in the order given. */
function oneInEvery(chains: ReadonlyArray<Chain>, count: { readonly every: number; readonly skip?: number }): Chain[] {
  const skip = count.skip ?? 0;
  if (!Number.isInteger(count.every) || count.every < 1 || !Number.isInteger(skip) || skip < 0) return [];
  const seen = new Map<string, number>();
  return chains.filter((chain) => {
    const place = seen.get(chain.voice) ?? 0;
    seen.set(chain.voice, place + 1);
    return place >= skip && (place - skip) % count.every === 0;
  });
}

/**
 * The ids of the notes that satisfy `filter`, in the order of `score.notes`. A tie chain that satisfies it contributes
 * the id of each of its segments, as selecting all notes does, so the result can go straight to `session.select`.
 */
export function filterNotes(score: Score, filter: NoteFilter): string[] {
  const scales = new Map<string, ReadonlySet<number> | null>();
  const chains = chainsOf(score);
  const passing = chains.filter(
    (chain) =>
      (filter.pitch === undefined || within(chain.midi, filter.pitch)) &&
      (filter.time === undefined || startsIn(chain.start, filter.time)) &&
      (filter.duration === undefined || within(chain.duration, filter.duration)) &&
      (filter.key === undefined || inKey(score, chain, scales) === (filter.key === "in")),
  );
  const taken = new Set(filter.count === undefined ? passing : oneInEvery(passing, filter.count));
  const chosen = chains.filter((chain) => taken.has(chain) !== (filter.invert === true));
  const picked = new Set(chosen.flatMap((chain) => chain.members.map((member) => member.id)));
  return score.notes.filter((note) => picked.has(note.id)).map((note) => note.id);
}

/** What the Filter panel offers choices from: how many notes a score has, its pitch range and the lengths its notes have. */
export interface NoteSummary {
  readonly notes: number;
  readonly lowest: number | null;
  readonly highest: number | null;
  /** The distinct lengths in ticks, shortest first. */
  readonly durations: ReadonlyArray<number>;
}

/** The notes of a score as `filterNotes` counts them: a tie chain once, a rest never. Not part of the package entry. */
export function summarizeNotes(score: Score): NoteSummary {
  const chains = chainsOf(score);
  let lowest: number | null = null;
  let highest: number | null = null;
  for (const { midi } of chains) {
    if (lowest === null || midi < lowest) lowest = midi;
    if (highest === null || midi > highest) highest = midi;
  }
  return {
    notes: chains.length,
    lowest,
    highest,
    durations: [...new Set(chains.map((chain) => chain.duration))].sort((a, b) => a - b),
  };
}

/** How many notes, counted as `filterNotes` counts them, the ids name: the chains that have one of them. Not part of the package entry. */
export function countNotes(score: Score, ids: ReadonlyArray<string>): number {
  const named = new Set(ids);
  return chainsOf(score).filter((chain) => chain.members.some((member) => named.has(member.id))).length;
}

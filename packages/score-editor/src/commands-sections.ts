// ABOUTME: Section commands for the score model: delete, duplicate, move, rename and name-at-bar.
// ABOUTME: They keep each bar's meter and each note's sounding pitch, and rebuild the key timeline at the new boundaries.
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import { orderNotes } from "./commands-shared";
import type { CommandDiagnosticCode, DiagnosticAt } from "./diagnostics";
import {
  type Bar,
  type Chord,
  type KeyChange,
  type Note,
  noteId,
  type Score,
  type Section,
  type Truncation,
} from "./score";

/** A section while a command rearranges it. `bars` are old bar indices and may repeat for a copy. */
interface Block {
  readonly name: string | null;
  readonly bars: ReadonlyArray<number>;
}

interface Placement {
  readonly oldBar: number;
  readonly oldStart: number;
  readonly newBar: number;
  readonly start: number;
}

type SectionCommand =
  | { readonly type: "deleteSection"; readonly section: number }
  | { readonly type: "duplicateSection"; readonly section: number }
  | { readonly type: "moveSection"; readonly section: number; readonly direction: "earlier" | "later" }
  | { readonly type: "renameSection"; readonly section: number; readonly name: string }
  | { readonly type: "nameSection"; readonly bar: number; readonly name: string };

function isIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function blocksOf(score: Score): Block[] {
  return score.sections.map((section) => ({
    name: section.name,
    bars: Array.from({ length: section.barCount }, (_item, offset) => section.firstBar + offset),
  }));
}

function sectionRefusal(score: Score, index: number): ScoreCommandResult {
  const section = score.sections[index];
  const at: DiagnosticAt = { bar: section === undefined ? 1 : Math.max(1, section.firstBar + 1) };
  return commandRefusal("section-out-of-range", { section: index + 1, sections: score.sections.length }, at);
}

function sectionHasCut(score: Score, section: Section): boolean {
  const truncation = score.truncation;
  if (truncation === null) return false;
  const end = section.firstBar + section.barCount;
  if (truncation.bar >= section.firstBar && truncation.bar < end) return true;
  return truncation.bar === end && end === score.bars.length;
}

function nameFailure(name: string): CommandDiagnosticCode | null {
  if (name === "") return "section-name-empty";
  if (/^[ \t]+$/.test(name)) return "section-name-blank";
  if (/[\r\n]/.test(name)) return "section-name-line-break";
  if (/[ \t]+$/.test(name)) return "section-name-trailing-space";
  return null;
}

function nameRefusal(code: CommandDiagnosticCode, name: string, at: DiagnosticAt): ScoreCommandResult {
  return commandRefusal(code, { name }, at);
}

/** New bars in output order, with every key change carried to its shifted absolute position. */
function placementsOf(score: Score, blocks: ReadonlyArray<Block>): { bars: Bar[]; placements: Placement[] } {
  const bars: Bar[] = [];
  const placements: Placement[] = [];
  let start = 0;
  for (const block of blocks) {
    for (const oldBar of block.bars) {
      const old = score.bars[oldBar];
      if (old === undefined) throw new Error("a section names a bar the score does not have");
      const newBar = bars.length;
      bars.push({
        ...old,
        index: newBar,
        start,
        keyChanges: old.keyChanges.map((change) => ({ ...change, at: change.at - old.start + start })),
      });
      placements.push({ oldBar, oldStart: old.start, newBar, start });
      start += old.length;
    }
  }
  return { bars, placements };
}

function oldSuccessors(score: Score): Map<string, string> {
  const successors = new Map<string, string>();
  for (const voice of score.voices) {
    const notes = score.notes.filter((note) => note.voice === voice).sort((left, right) => left.start - right.start);
    for (let index = 0; index + 1 < notes.length; index += 1) {
      const note = notes[index] as Note;
      const next = notes[index + 1] as Note;
      if (next.start === note.start + note.duration) successors.set(note.id, next.id);
    }
  }
  return successors;
}

function effectiveKey(keys: ReadonlyArray<KeyChange>, at: number): string {
  let key = keys[0]?.key ?? "C";
  for (const change of keys) {
    if (change.at <= at) key = change.key;
    else break;
  }
  return key;
}

/** Carries every internal key change with its bar, states a section boundary only when the key there changes. */
function keysFor(score: Score, placements: ReadonlyArray<Placement>, bars: ReadonlyArray<Bar>): KeyChange[] {
  const header = score.keys[0]?.key ?? "C";
  const keys: KeyChange[] = [{ at: 0, key: header }];
  for (const placement of placements) {
    const oldBar = score.bars[placement.oldBar] as Bar;
    const oldEnd = placement.oldStart + oldBar.length;
    for (const change of score.keys) {
      if (change.at !== placement.oldStart) continue;
      const at = placement.start;
      if (at === 0 && change === score.keys[0]) continue;
      if (change.key === effectiveKey(keys, at)) continue;
      keys.push({ at, key: change.key });
    }
    for (const change of score.keys) {
      if (change.at <= placement.oldStart || change.at >= oldEnd) continue;
      keys.push({ at: change.at - placement.oldStart + placement.start, key: change.key });
    }
  }
  keys.sort((left, right) => left.at - right.at);

  for (const bar of bars) {
    if (effectiveKey(keys, bar.start) === bar.key) continue;
    const headerEntry = keys.find((change) => change.at === 0);
    if (bar.start === 0 && headerEntry !== undefined) {
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const change = keys[index] as KeyChange;
        if (change.at === 0 && change !== headerEntry) keys.splice(index, 1);
      }
      if (headerEntry.key !== bar.key) keys.push({ at: 0, key: bar.key });
    } else {
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        if ((keys[index] as KeyChange).at === bar.start) keys.splice(index, 1);
      }
      keys.push({ at: bar.start, key: bar.key });
    }
    keys.sort((left, right) => left.at - right.at);
  }
  return keys;
}

function truncationAfterDelete(score: Score, block: Block, count: number, first: number): Truncation | null {
  const truncation = score.truncation;
  if (truncation === null) return null;
  const last = score.sections.length > 0 && first + block.bars.length === score.bars.length;
  if (last) return null;
  if (truncation.bar >= first + count) return { ...truncation, bar: truncation.bar - count };
  if (truncation.bar >= first) return null;
  return truncation;
}

function truncationAfterInsert(score: Score, at: number, count: number): Truncation | null {
  const truncation = score.truncation;
  if (truncation === null) return null;
  return truncation.bar >= at ? { ...truncation, bar: truncation.bar + count } : truncation;
}

function buildScore(score: Score, blocks: ReadonlyArray<Block>, truncation: Truncation | null): ScoreCommandResult {
  const total = blocks.reduce((sum, block) => sum + block.bars.length, 0);
  if (total === 0) return commandRefusal("last-bar", { bar: 1 }, { bar: 1 });

  const { bars, placements } = placementsOf(score, blocks);
  const notes: Note[] = [];
  const origins = new Map<string, string>();
  for (const placement of placements) {
    for (const note of score.notes) {
      if (note.bar !== placement.oldBar) continue;
      const start = placement.start + (note.start - placement.oldStart);
      const id = noteId(note.voice, start);
      notes.push({ ...note, id, bar: placement.newBar, start });
      origins.set(id, note.id);
    }
  }

  const chords: Chord[] = [];
  for (const placement of placements) {
    const oldBar = score.bars[placement.oldBar] as Bar;
    const inBar = score.chords.filter(
      (chord) => chord.start >= oldBar.start && chord.start < oldBar.start + oldBar.length,
    );
    for (const chord of inBar) {
      const start = placement.start + (chord.start - placement.oldStart);
      let attached: string | null = null;
      if (chord.noteId !== null) {
        const source = score.notes.find((note) => note.id === chord.noteId);
        if (source !== undefined && source.bar === placement.oldBar) {
          attached = noteId(source.voice, placement.start + (source.start - placement.oldStart));
        }
      }
      chords.push({ ...chord, start, noteId: attached });
    }
  }

  const ordered = orderNotes(score, notes);
  const successors = oldSuccessors(score);
  const starts = new Set(ordered.map((note) => `${note.voice}:${note.start}`));
  const finalNotes = ordered.map((note) => {
    if (!note.tie) return note;
    const old = origins.get(note.id);
    const successor = starts.has(`${note.voice}:${note.start + note.duration}`);
    if (old !== undefined && successors.has(old) && !successor) return { ...note, tie: false };
    return note;
  });

  const nonEmpty = blocks.filter((block) => block.bars.length > 0);
  const boundaryStarts: number[] = [];
  let tickCursor = 0;
  for (let index = 0; index < nonEmpty.length; index += 1) {
    const block = nonEmpty[index] as Block;
    if (index > 0) {
      const previous = nonEmpty[index - 1] as Block;
      const lastOld = previous.bars[previous.bars.length - 1] as number;
      const firstOld = block.bars[0] as number;
      if (lastOld + 1 !== firstOld) boundaryStarts.push(tickCursor);
    }
    for (const oldBar of block.bars) tickCursor += (score.bars[oldBar] as Bar).length;
  }
  const boundary = new Set(boundaryStarts);
  const notesWithBoundaries = finalNotes.map((note) =>
    note.tie && boundary.has(note.start + note.duration) ? { ...note, tie: false } : note,
  );

  let firstBar = 0;
  const sections: Section[] = blocks.map((block) => {
    const section = { name: block.name, firstBar, barCount: block.bars.length };
    firstBar += block.bars.length;
    return section;
  });

  const hasChords = score.hasChords && (chords.length > 0 || truncation?.short === true);

  return {
    ok: true,
    score: {
      ...score,
      bars,
      keys: keysFor(score, placements, bars),
      notes: notesWithBoundaries,
      chords,
      sections,
      truncation,
      hasChords,
    },
  };
}

function deleteSection(score: Score, index: number): ScoreCommandResult {
  if (!isIndex(index) || index >= score.sections.length) return sectionRefusal(score, index);
  const section = score.sections[index] as Section;
  if (sectionHasCut(score, section) && index !== score.sections.length - 1) {
    return commandRefusal(
      "truncated-tail",
      { bar: Math.max(1, section.firstBar + 1) },
      { bar: Math.max(1, section.firstBar + 1) },
    );
  }
  const blocks = blocksOf(score);
  const block = blocks[index] as Block;
  blocks.splice(index, 1);
  const truncation = truncationAfterDelete(score, block, block.bars.length, section.firstBar);
  return buildScore(score, blocks, truncation);
}

function duplicateSection(score: Score, index: number): ScoreCommandResult {
  if (!isIndex(index) || index >= score.sections.length) return sectionRefusal(score, index);
  const section = score.sections[index] as Section;
  if (section.name === null) {
    return commandRefusal("section-unnamed", { section: index + 1 }, { bar: Math.max(1, section.firstBar + 1) });
  }
  if (sectionHasCut(score, section)) {
    return commandRefusal(
      "truncated-tail",
      { bar: Math.max(1, section.firstBar + 1) },
      { bar: Math.max(1, section.firstBar + 1) },
    );
  }
  const blocks = blocksOf(score);
  const block = blocks[index] as Block;
  blocks.splice(index + 1, 0, { name: block.name, bars: [...block.bars] });
  const at = section.firstBar + section.barCount;
  return buildScore(score, blocks, truncationAfterInsert(score, at, section.barCount));
}

function moveSection(score: Score, index: number, direction: "earlier" | "later"): ScoreCommandResult {
  if (!isIndex(index) || index >= score.sections.length) return sectionRefusal(score, index);
  const section = score.sections[index] as Section;
  if (section.name === null) {
    return commandRefusal("section-unnamed", { section: index + 1 }, { bar: Math.max(1, section.firstBar + 1) });
  }
  if (direction === "earlier" && index === 0) {
    return commandRefusal("section-move-start", { section: index + 1 }, { bar: Math.max(1, section.firstBar + 1) });
  }
  if (direction === "later" && index === score.sections.length - 1) {
    return commandRefusal("section-move-end", { section: index + 1 }, { bar: Math.max(1, section.firstBar + 1) });
  }
  const neighbourIndex = direction === "earlier" ? index - 1 : index + 1;
  const neighbour = score.sections[neighbourIndex] as Section;
  if (neighbour.name === null) {
    return commandRefusal("section-before-unnamed", { section: index + 1 }, { bar: Math.max(1, section.firstBar + 1) });
  }
  if (sectionHasCut(score, section) || sectionHasCut(score, neighbour)) {
    return commandRefusal(
      "truncated-tail",
      { bar: Math.max(1, section.firstBar + 1) },
      { bar: Math.max(1, section.firstBar + 1) },
    );
  }
  const blocks = blocksOf(score);
  const current = blocks[index] as Block;
  const other = blocks[neighbourIndex] as Block;
  blocks[index] = other;
  blocks[neighbourIndex] = current;
  return buildScore(score, blocks, score.truncation);
}

function renameSection(score: Score, index: number, name: string): ScoreCommandResult {
  if (!isIndex(index) || index >= score.sections.length) return sectionRefusal(score, index);
  const section = score.sections[index] as Section;
  const at: DiagnosticAt = { bar: Math.max(1, section.firstBar + 1) };
  const failure = nameFailure(name);
  if (failure !== null) return nameRefusal(failure, name, at);
  const blocks = blocksOf(score);
  blocks[index] = { name, bars: (blocks[index] as Block).bars };
  return buildScore(score, blocks, score.truncation);
}

function nameSection(score: Score, bar: number, name: string): ScoreCommandResult {
  if (!isIndex(bar) || bar >= score.bars.length) {
    return commandRefusal("bar-out-of-range", { bar: bar + 1 }, { bar: bar + 1 });
  }
  const at: DiagnosticAt = { bar: bar + 1 };
  const failure = nameFailure(name);
  if (failure !== null) return nameRefusal(failure, name, at);
  const blocks = blocksOf(score);
  const index = blocks.findIndex((block) => block.bars.includes(bar));
  if (index < 0) return commandRefusal("bar-out-of-range", { bar: bar + 1 }, at);
  const block = blocks[index] as Block;
  const first = block.bars[0] as number;
  if (first === bar) {
    blocks[index] = { name, bars: block.bars };
  } else {
    const offset = block.bars.indexOf(bar);
    blocks.splice(
      index,
      1,
      { name: block.name, bars: block.bars.slice(0, offset) },
      { name, bars: block.bars.slice(offset) },
    );
  }
  return buildScore(score, blocks, score.truncation);
}

/** Applies the section commands: delete, duplicate, move, rename and naming a section at a bar. */
export function runSectionCommand(score: Score, command: SectionCommand): ScoreCommandResult {
  switch (command.type) {
    case "deleteSection":
      return deleteSection(score, command.section);
    case "duplicateSection":
      return duplicateSection(score, command.section);
    case "moveSection":
      return moveSection(score, command.section, command.direction);
    case "renameSection":
      return renameSection(score, command.section, command.name);
    case "nameSection":
      return nameSection(score, command.bar, command.name);
  }
}

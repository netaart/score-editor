// ABOUTME: Carries lyric lines through score commands: one bar mapping per command and one remapping step for every line.
// ABOUTME: A legacy project's computed lines are carried too, but a command that changes no line writes nothing.
import type { ScoreCommand } from "./commands";
import type { ScoreDialect } from "./dialect";
import { clipPhraseToSection, joinLyrics, type LyricLine, lyricLinesOf, sectionIndexAt } from "./lyrics";
import type { Score, SongProject } from "./score";

interface BarPlacement {
  readonly oldBar: number;
  readonly newBar: number;
  readonly block: string;
}

interface BlockChoice {
  readonly oldSection: number;
  readonly block: string;
}

function sectionBlock(index: number): string {
  return `section:${index}`;
}

function blockAt(score: Score, bar: number): string {
  return sectionBlock(Math.max(0, sectionIndexAt(score, bar)));
}

type StructuralCommand = Extract<ScoreCommand, { type: "deleteSection" | "duplicateSection" | "moveSection" }>;

function assertNever(value: never): never {
  throw new Error(`Unhandled score command: ${JSON.stringify(value)}`);
}

function choicesFor(score: Score, command: StructuralCommand): BlockChoice[] {
  const choices = score.sections.map((_section, index) => ({ oldSection: index, block: sectionBlock(index) }));
  switch (command.type) {
    case "deleteSection":
      choices.splice(command.section, 1);
      return choices;
    case "duplicateSection":
      choices.splice(command.section + 1, 0, {
        oldSection: command.section,
        block: `copy:${command.section}`,
      });
      return choices;
    case "moveSection": {
      const neighbour = command.direction === "earlier" ? command.section - 1 : command.section + 1;
      const current = choices[command.section];
      const other = choices[neighbour];
      if (current === undefined || other === undefined) throw new Error("a section move names no neighbour");
      choices[command.section] = other;
      choices[neighbour] = current;
      return choices;
    }
    default:
      return assertNever(command);
  }
}

function structuralPlacements(score: Score, after: Score, choices: ReadonlyArray<BlockChoice>): BarPlacement[] {
  const placements: BarPlacement[] = [];
  for (let index = 0; index < choices.length; index += 1) {
    const choice = choices[index] as BlockChoice;
    const oldSection = score.sections[choice.oldSection];
    const newSection = after.sections[index];
    if (oldSection === undefined || newSection === undefined) continue;
    const count = Math.min(oldSection.barCount, newSection.barCount);
    for (let offset = 0; offset < count; offset += 1) {
      placements.push({
        oldBar: oldSection.firstBar + offset,
        newBar: newSection.firstBar + offset,
        block: choice.block,
      });
    }
  }
  return placements;
}

function addPlacement(score: Score, after: Score, placements: BarPlacement[], oldBar: number, newBar: number): void {
  if (after.bars[newBar] === undefined) return;
  placements.push({ oldBar, newBar, block: blockAt(score, oldBar) });
}

function identityPlacements(score: Score): BarPlacement[] {
  const placements: BarPlacement[] = [];
  for (const bar of score.bars) addPlacement(score, score, placements, bar.index, bar.index);
  return placements;
}

function insertedBarPlacements(
  score: Score,
  after: Score,
  command: Extract<ScoreCommand, { type: "insertBar" }>,
): BarPlacement[] {
  const placements: BarPlacement[] = [];
  for (const bar of score.bars) {
    const newBar = bar.index < command.bar ? bar.index : bar.index + 1;
    addPlacement(score, after, placements, bar.index, newBar);
  }
  return placements;
}

function deletedBarPlacements(
  score: Score,
  after: Score,
  command: Extract<ScoreCommand, { type: "deleteBars" }>,
): BarPlacement[] {
  const placements: BarPlacement[] = [];
  for (const bar of score.bars) {
    if (bar.index >= command.from && bar.index < command.from + command.count) continue;
    const newBar = bar.index < command.from ? bar.index : bar.index - command.count;
    addPlacement(score, after, placements, bar.index, newBar);
  }
  return placements;
}

function truncatedBarPlacements(score: Score, after: Score): BarPlacement[] {
  const placements: BarPlacement[] = [];
  const cut = score.truncation?.bar ?? score.bars.length;
  for (const bar of score.bars) {
    if (bar.index < cut) addPlacement(score, after, placements, bar.index, bar.index);
  }
  return placements;
}

function meterPlacements(
  score: Score,
  after: Score,
  command: Extract<ScoreCommand, { type: "setSectionMeter" }>,
): BarPlacement[] {
  const placements: BarPlacement[] = [];
  const section = score.sections[command.section];
  const newSection = after.sections[command.section];
  const delta = after.bars.length - score.bars.length;
  for (const bar of score.bars) {
    if (section === undefined || bar.index < section.firstBar) {
      addPlacement(score, after, placements, bar.index, bar.index);
    } else if (bar.index < section.firstBar + section.barCount) {
      if (newSection === undefined) continue;
      for (let index = newSection.firstBar; index < newSection.firstBar + newSection.barCount; index += 1) {
        const candidate = after.bars[index];
        if (candidate === undefined) continue;
        if (candidate.start < bar.start + bar.length && bar.start < candidate.start + candidate.length) {
          addPlacement(score, after, placements, bar.index, index);
        }
      }
    } else {
      addPlacement(score, after, placements, bar.index, bar.index + delta);
    }
  }
  return placements;
}

/** One description of how the command maps every old bar to its new bar (or to none). */
function placementsFor(score: Score, after: Score, command: ScoreCommand): BarPlacement[] {
  switch (command.type) {
    case "deleteSection":
    case "duplicateSection":
    case "moveSection":
      return structuralPlacements(score, after, choicesFor(score, command));
    case "setSectionMeter":
      return meterPlacements(score, after, command);
    case "insertBar":
      return insertedBarPlacements(score, after, command);
    case "deleteBars":
      return deletedBarPlacements(score, after, command);
    case "deleteTruncatedBar":
      return truncatedBarPlacements(score, after);
    case "toRest":
    case "toRests":
    case "setChord":
    case "fillTruncatedBar":
    case "transpose":
    case "setKey":
    case "setTempo":
    case "removeChords":
    case "renameSection":
    case "nameSection":
    case "moveNotes":
    case "resizeNotes":
    case "addNote":
    case "pasteNotes":
    case "duplicateNotes":
    case "copyNotes":
    case "splitNotes":
    case "chopNotes":
    case "joinNotes":
    case "legatoNotes":
    case "reverseNotes":
    case "flipNotes":
    case "snapNotesToKey":
    case "scaleNoteLengths":
    case "setNoteLength":
    case "fitNotesToRange":
      return identityPlacements(score);
    default:
      return assertNever(command);
  }
}

function groupByBlock(placements: ReadonlyArray<BarPlacement>): BarPlacement[][] {
  const groups = new Map<string, BarPlacement[]>();
  for (const placement of placements) {
    const list = groups.get(placement.block) ?? [];
    list.push(placement);
    groups.set(placement.block, list);
  }
  return [...groups.values()];
}

/**
 * Remaps every line through the command's bar mapping. A phrase that keeps some bars stays on them, spanning a bar
 * inserted inside it and closing over a bar deleted inside it; a phrase that loses every bar goes with those bars.
 */
export function remapLyricLines(
  score: Score,
  after: Score,
  command: ScoreCommand,
  lines: ReadonlyArray<LyricLine>,
): LyricLine[] {
  const placements = placementsFor(score, after, command);
  const aligned: LyricLine[] = [];
  const unaligned: LyricLine[] = [];
  for (const line of lines) {
    if (line.phrase === null) {
      unaligned.push(line);
      continue;
    }
    const oldPhrase = clipPhraseToSection(score, line.phrase.firstBar, line.phrase.firstBar + line.phrase.barCount - 1);
    if (oldPhrase === null) {
      unaligned.push({ text: line.text, phrase: null });
      continue;
    }
    const oldFirst = oldPhrase.firstBar;
    const oldEnd = oldFirst + oldPhrase.barCount;
    const inRange = placements.filter((placement) => placement.oldBar >= oldFirst && placement.oldBar < oldEnd);
    for (const group of groupByBlock(inRange)) {
      const newBars = group.map((placement) => placement.newBar);
      const first = Math.min(...newBars);
      const phrase = clipPhraseToSection(after, first, Math.max(...newBars));
      if (phrase !== null) aligned.push({ text: line.text, phrase });
    }
  }
  aligned.sort((left, right) => (left.phrase?.firstBar ?? 0) - (right.phrase?.firstBar ?? 0));
  return [...aligned, ...unaligned];
}

function sameLines(left: ReadonlyArray<LyricLine>, right: ReadonlyArray<LyricLine>): boolean {
  if (left.length !== right.length) return false;
  return left.every((line, index) => {
    const other = right[index] as LyricLine;
    return (
      line.text === other.text &&
      line.phrase?.firstBar === other.phrase?.firstBar &&
      line.phrase?.barCount === other.phrase?.barCount
    );
  });
}

/** Remaps a project's stored or computed lines and writes them back only when the lines or their join changed. */
export function withRemappedLyrics(
  dialect: ScoreDialect,
  project: SongProject,
  command: ScoreCommand,
  scoreText: string,
): SongProject {
  const before = dialect.parse(project.score).score;
  const after = dialect.parse(scoreText).score;
  if (before === null || after === null) return { ...project, score: scoreText };
  const source = project.lyricLines ?? lyricLinesOf(project, before);
  const lines = remapLyricLines(before, after, command, source);
  const joined = joinLyrics(after, lines);
  const linesChanged = !sameLines(lines, source);
  const joinChanged = joined !== joinLyrics(before, source);
  if (!linesChanged && !joinChanged) return { ...project, score: scoreText };
  if (project.lyricLines === undefined && source.length === 0) return { ...project, score: scoreText };
  return { ...project, score: scoreText, lyricLines: lines, lyrics: joined };
}

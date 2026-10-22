// ABOUTME: Carries lyric lines through score commands: one bar mapping per command and one remapping step for every line.
// ABOUTME: A legacy project's computed lines are carried too, but a command that changes no line writes nothing.
import type { ScoreCommand } from "./commands";
import type { ScoreDialect } from "./dialect";
import { joinLyrics, type LyricLine, type LyricPhrase, lyricLinesOf } from "./lyrics";
import type { Score, SongProject } from "./score";

interface BarPlacement {
  readonly oldBar: number;
  readonly newBar: number;
  readonly instance: number;
}

interface BlockChoice {
  /** The old section this new block came from. */
  readonly oldSection: number;
  /** Distinguishes an original block from a duplicate of it. */
  readonly instance: number;
}

function sectionIndexAt(score: Score, bar: number): number {
  return score.sections.findIndex((section) => bar >= section.firstBar && bar < section.firstBar + section.barCount);
}

/** The bar mapping of the three section commands that rearrange whole section blocks. */
function sectionChoices(score: Score, command: ScoreCommand): BlockChoice[] | null {
  const choices = score.sections.map((_section, index) => ({ oldSection: index, instance: index }));
  switch (command.type) {
    case "deleteSection":
      choices.splice(command.section, 1);
      return choices;
    case "duplicateSection":
      choices.splice(command.section + 1, 0, {
        oldSection: command.section,
        instance: -command.section - 1,
      });
      return choices;
    case "moveSection": {
      const neighbour = command.direction === "earlier" ? command.section - 1 : command.section + 1;
      const current = choices[command.section];
      const other = choices[neighbour];
      if (current === undefined || other === undefined) return null;
      choices[command.section] = other;
      choices[neighbour] = current;
      return choices;
    }
    default:
      return null;
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
        instance: choice.instance,
      });
    }
  }
  return placements;
}

/** One description of how the command maps every old bar to its new bar (or to none). */
function placementsFor(score: Score, after: Score, command: ScoreCommand): BarPlacement[] {
  const choices = sectionChoices(score, command);
  if (choices !== null) return structuralPlacements(score, after, choices);

  const placements: BarPlacement[] = [];
  const push = (oldBar: number, newBar: number | null): void => {
    if (newBar === null || after.bars[newBar] === undefined) return;
    placements.push({ oldBar, newBar, instance: Math.max(0, sectionIndexAt(score, oldBar)) });
  };

  if (command.type === "setSectionMeter") {
    const section = score.sections[command.section];
    const newSection = after.sections[command.section];
    const delta = after.bars.length - score.bars.length;
    for (const bar of score.bars) {
      if (section === undefined || bar.index < section.firstBar) {
        push(bar.index, bar.index);
      } else if (bar.index < section.firstBar + section.barCount) {
        if (newSection !== undefined) {
          for (let index = newSection.firstBar; index < newSection.firstBar + newSection.barCount; index += 1) {
            const candidate = after.bars[index];
            if (candidate === undefined) continue;
            if (candidate.start < bar.start + bar.length && bar.start < candidate.start + candidate.length) {
              push(bar.index, index);
            }
          }
        }
      } else {
        push(bar.index, bar.index + delta);
      }
    }
    return placements;
  }

  for (const bar of score.bars) {
    switch (command.type) {
      case "insertBar":
        push(bar.index, bar.index < command.bar ? bar.index : bar.index + 1);
        break;
      case "deleteBars":
        if (bar.index >= command.from && bar.index < command.from + command.count) break;
        push(bar.index, bar.index < command.from ? bar.index : bar.index - command.count);
        break;
      case "deleteTruncatedBar": {
        const cut = score.truncation?.bar ?? score.bars.length;
        if (bar.index < cut) push(bar.index, bar.index);
        break;
      }
      default:
        push(bar.index, bar.index);
    }
  }
  return placements;
}

function groupByInstance(placements: ReadonlyArray<BarPlacement>): BarPlacement[][] {
  const groups = new Map<number, BarPlacement[]>();
  for (const placement of placements) {
    const list = groups.get(placement.instance) ?? [];
    list.push(placement);
    groups.set(placement.instance, list);
  }
  return [...groups.values()];
}

/** Keeps only the part of a phrase inside the new section that starts at its first new bar. */
function clipToSection(after: Score, firstBar: number, lastBar: number): LyricPhrase | null {
  const section = after.sections[sectionIndexAt(after, firstBar)];
  if (section === undefined) return null;
  const start = Math.max(firstBar, section.firstBar);
  const end = Math.min(lastBar + 1, section.firstBar + section.barCount, after.bars.length);
  return end <= start ? null : { firstBar: start, barCount: end - start };
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
    const oldSection = sectionIndexAt(score, line.phrase.firstBar);
    const section = score.sections[oldSection];
    if (section === undefined) {
      unaligned.push({ text: line.text, phrase: null });
      continue;
    }
    const oldFirst = Math.max(line.phrase.firstBar, section.firstBar);
    const oldEnd = Math.min(
      line.phrase.firstBar + line.phrase.barCount,
      section.firstBar + section.barCount,
      score.bars.length,
    );
    if (oldEnd <= oldFirst) {
      unaligned.push({ text: line.text, phrase: null });
      continue;
    }
    const inRange = placements.filter((placement) => placement.oldBar >= oldFirst && placement.oldBar < oldEnd);
    for (const group of groupByInstance(inRange)) {
      const newBars = group.map((placement) => placement.newBar);
      const first = Math.min(...newBars);
      const phrase = clipToSection(after, first, Math.max(...newBars));
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

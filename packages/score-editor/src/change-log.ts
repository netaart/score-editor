// ABOUTME: The readable change log of a song project against its original, recomputed from the two projects.
// ABOUTME: Pure and headless: it reads both score texts with the same dialect and returns one sentence per kind of change.
import type { ScoreDialect } from "./dialect";
import { type Messages, messagesFor } from "./i18n";
import { joinLyrics, lyricLinesOf } from "./lyrics";
import type { LyricLine, Score, Section, SongProject } from "./score";
import type { Language } from "./types";

export interface ChangeLogOptions {
  /** The language of the sentences. */
  language: Language;
  /** The dialect that reads both scores. Without it only project fields and the raw text can be compared. */
  dialect?: ScoreDialect;
}

interface SectionPair {
  readonly before: Section;
  readonly after: Section;
  readonly renamed: boolean;
}

interface SectionDiff {
  readonly entries: ReadonlyArray<string>;
  readonly pairs: ReadonlyArray<SectionPair>;
}

function nameOf(section: Section, t: Messages): string {
  return section.name ?? t.unnamedSection;
}

function scoreOf(project: SongProject, dialect: ScoreDialect | undefined): Score | null {
  if (dialect === undefined) return null;
  return dialect.parse(project.score).score;
}

/** Every musical field except the dialect's private source, so two texts that read the same compare equal. */
function sameScoreContent(left: Score, right: Score): boolean {
  const fields = (score: Score) => [
    score.tempo,
    score.tempoChanges ?? null,
    score.voices,
    score.bars,
    score.keys,
    score.sections,
    score.notes,
    score.chords,
    score.truncation,
    score.hasChords,
    score.unitTicks ?? null,
  ];
  return JSON.stringify(fields(left)) === JSON.stringify(fields(right));
}

function barStart(score: Score, section: Section): number {
  return score.bars[section.firstBar]?.start ?? 0;
}

/** The notes of one bar, in coordinates relative to its section, so a moved section keeps the same signature. */
function sectionBarNotes(score: Score, section: Section, offset: number): string[] {
  const bar = section.firstBar + offset;
  const start = score.bars[bar]?.start ?? 0;
  return score.notes
    .filter((note) => note.bar === bar)
    .map(
      (note) =>
        `${note.voice}|${note.start - start}|${note.duration}|${note.midi === null ? "rest" : note.midi}|${note.tie ? "tie" : ""}`,
    )
    .sort();
}

function sectionNotesSignature(score: Score, section: Section): string {
  return Array.from({ length: section.barCount }, (_item, offset) => sectionBarNotes(score, section, offset).join(","))
    .join(";")
    .concat(`|${section.barCount}`);
}

function sectionSignature(score: Score, section: Section): string {
  return `${section.barCount}:${sectionNotesSignature(score, section)}`;
}

function sectionChords(score: Score, section: Section): string[] {
  const start = barStart(score, section);
  const end =
    start +
    score.bars.slice(section.firstBar, section.firstBar + section.barCount).reduce((sum, bar) => sum + bar.length, 0);
  return score.chords
    .filter((chord) => chord.start >= start && chord.start < end)
    .map((chord) => `${chord.name}|${chord.start - start}`)
    .sort();
}

/** The longest common subsequence of two lists of paired sections, by object identity. */
function longestCommonSubsequence(
  left: ReadonlyArray<SectionPair>,
  right: ReadonlyArray<SectionPair>,
): Set<SectionPair> {
  const table = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      const row = table[i] as number[];
      const next = table[i + 1] as number[];
      row[j] = left[i] === right[j] ? (next[j + 1] as number) + 1 : Math.max(next[j] as number, row[j + 1] as number);
    }
  }
  const stable = new Set<SectionPair>();
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      stable.add(left[i] as SectionPair);
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] as number) >= (table[i]?.[j + 1] as number)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return stable;
}

function diffSections(before: Score, after: Score, t: Messages): SectionDiff {
  const usedAfter = new Set<number>();
  const usedBefore = new Set<number>();
  const pairs: SectionPair[] = [];

  // Same-name occurrences pair in order, so a move does not read as a delete plus a copy.
  before.sections.forEach((section, beforeIndex) => {
    const afterIndex = after.sections.findIndex(
      (candidate, index) => !usedAfter.has(index) && candidate.name === section.name,
    );
    if (afterIndex < 0) return;
    usedBefore.add(beforeIndex);
    usedAfter.add(afterIndex);
    pairs.push({ before: section, after: after.sections[afterIndex] as Section, renamed: false });
  });

  // A leftover before and after with the same bars and the same notes is a rename, wherever it moved to.
  before.sections.forEach((section, beforeIndex) => {
    if (usedBefore.has(beforeIndex)) return;
    const signature = sectionSignature(before, section);
    const afterIndex = after.sections.findIndex(
      (candidate, index) => !usedAfter.has(index) && sectionSignature(after, candidate) === signature,
    );
    if (afterIndex < 0) return;
    usedBefore.add(beforeIndex);
    usedAfter.add(afterIndex);
    pairs.push({ before: section, after: after.sections[afterIndex] as Section, renamed: true });
  });

  const deleted: Section[] = [];
  before.sections.forEach((section, index) => {
    if (!usedBefore.has(index)) deleted.push(section);
  });
  const copied: Section[] = [];
  const added: Section[] = [];
  after.sections.forEach((section, index) => {
    if (usedAfter.has(index)) return;
    if (before.sections.some((candidate) => candidate.name === section.name)) copied.push(section);
    else added.push(section);
  });

  const byBefore = [...pairs].sort((a, b) => before.sections.indexOf(a.before) - before.sections.indexOf(b.before));
  const byAfter = [...pairs].sort((a, b) => after.sections.indexOf(a.after) - after.sections.indexOf(b.after));
  const stable = longestCommonSubsequence(byBefore, byAfter);
  const moved = byBefore.filter((pair) => !pair.renamed && !stable.has(pair));
  const renamed = byBefore.filter((pair) => pair.renamed);

  const entries: string[] = [
    ...deleted.map((section) => t.changeLogSectionDeleted(nameOf(section, t))),
    ...copied.map((section) => t.changeLogSectionCopied(nameOf(section, t))),
    ...moved.map((pair) => t.changeLogSectionMoved(nameOf(pair.after, t))),
    ...renamed.map((pair) => t.changeLogSectionRenamed(nameOf(pair.before, t), nameOf(pair.after, t))),
    ...added.map((section) => t.changeLogSectionAdded(nameOf(section, t))),
  ];
  return { entries, pairs };
}

function changedNoteBars(before: Score, after: Score, pairs: ReadonlyArray<SectionPair>, t: Messages): string[] {
  const bars = new Set<number>();
  for (const pair of pairs) {
    if (pair.before.barCount !== pair.after.barCount) continue;
    for (let offset = 0; offset < pair.after.barCount; offset += 1) {
      const left = sectionBarNotes(before, pair.before, offset).join(",");
      const right = sectionBarNotes(after, pair.after, offset).join(",");
      if (left !== right) bars.add(pair.after.firstBar + offset + 1);
    }
  }
  return bars.size === 0 ? [] : [t.changeLogNotes(bars.size)];
}

function changedMeters(before: Score, after: Score, pairs: ReadonlyArray<SectionPair>, t: Messages): string[] {
  const found: { from: string; to: string; bar: number }[] = [];
  for (const pair of pairs) {
    const count = Math.min(pair.before.barCount, pair.after.barCount);
    for (let offset = 0; offset < count; offset += 1) {
      const left = before.bars[pair.before.firstBar + offset]?.meter;
      const right = after.bars[pair.after.firstBar + offset]?.meter;
      if (left === undefined || right === undefined) continue;
      if (left.numerator === right.numerator && left.denominator === right.denominator) continue;
      found.push({
        from: t.meterText(left),
        to: t.meterText(right),
        bar: pair.after.firstBar + offset + 1,
      });
    }
  }
  if (found.length === 0) return [];
  const first = found[0] as { from: string; to: string; bar: number };
  return [t.changeLogMeter(first.from, first.to, found.length)];
}

function changedChords(before: Score, after: Score, pairs: ReadonlyArray<SectionPair>, t: Messages): string[] {
  for (const pair of pairs) {
    if (pair.before.barCount !== pair.after.barCount) continue;
    if (sectionChords(before, pair.before).join("\n") !== sectionChords(after, pair.after).join("\n")) {
      return [t.changeLogChords];
    }
  }
  if (before.hasChords !== after.hasChords) return [t.changeLogChords];
  return [];
}

function effectiveLines(project: SongProject, score: Score | null): ReadonlyArray<LyricLine> {
  return score === null ? (project.lyricLines ?? []) : lyricLinesOf(project, score);
}

/**
 * Every readable change from `original` to `current`, in the session's language. The list is recomputed from the two
 * projects; nothing is read from a stored draft. A score text that changed while it still reads as the same score is
 * the text view's edit. When the text changed the music, the music changes are named instead.
 */
export function changeLog(
  original: SongProject,
  current: SongProject,
  options: ChangeLogOptions,
): ReadonlyArray<string> {
  const t = messagesFor(options.language);
  const before = scoreOf(original, options.dialect);
  const after = scoreOf(current, options.dialect);
  const entries: string[] = [];
  const sections = before !== null && after !== null ? diffSections(before, after, t) : null;

  if (before !== null && after !== null && sections !== null) {
    entries.push(...sections.entries);

    if (before.tempo.unit !== after.tempo.unit || before.tempo.bpm !== after.tempo.bpm) {
      entries.push(t.changeLogTempo(before.tempo.bpm, after.tempo.bpm));
    } else if (JSON.stringify(before.tempoChanges ?? []) !== JSON.stringify(after.tempoChanges ?? [])) {
      entries.push(t.changeLogTempoChanges);
    }

    if (JSON.stringify(before.keys) !== JSON.stringify(after.keys)) {
      const from = before.keys[0]?.key;
      const to = after.keys[0]?.key;
      entries.push(
        from !== undefined && to !== undefined && from !== to ? t.changeLogKey(from, to) : t.changeLogKeyChanges,
      );
    }

    entries.push(...changedMeters(before, after, sections.pairs, t));
    entries.push(...changedChords(before, after, sections.pairs, t));
  }

  const beforeLines = effectiveLines(original, before);
  const afterLines = effectiveLines(current, after);
  if (original.lyrics !== current.lyrics || JSON.stringify(beforeLines) !== JSON.stringify(afterLines)) {
    entries.push(t.changeLogLyrics);
  }
  if (original.style !== current.style) entries.push(t.changeLogStyle);
  if (original.scoreMode !== current.scoreMode) {
    entries.push(t.changeLogScoreMode(original.scoreMode, current.scoreMode));
  }
  if (original.seed !== current.seed) {
    entries.push(
      t.changeLogSeed(
        original.seed === null ? t.changeLogSeedNone : String(original.seed),
        current.seed === null ? t.changeLogSeedNone : String(current.seed),
      ),
    );
  }

  if (before !== null && after !== null && sections !== null && original.score !== current.score) {
    entries.push(...changedNoteBars(before, after, sections.pairs, t));
  }

  if (original.score !== current.score && (before === null || after === null || sameScoreContent(before, after))) {
    entries.push(t.changeLogText);
  }
  return entries;
}

/** The joined lyrics the handoff states: what the score and the current lyric lines make, not the stored field alone. */
function handoffLyrics(current: SongProject, dialect: ScoreDialect | undefined): string {
  const after = scoreOf(current, dialect);
  if (after === null) return current.lyrics;
  return joinLyrics(after, lyricLinesOf(current, after));
}

/** What the prefilled instruction says for a project and its original. See the package README, "Change log and handoff". */
export interface HandoffInstructionOptions extends ChangeLogOptions {
  readonly original: SongProject;
  readonly current: SongProject;
  /** The work's title; the original's source key when absent or blank. */
  readonly title?: string;
}

/** The instruction a host prefills with the attachment and the final project, in the chosen language. */
export function handoffInstruction(options: HandoffInstructionOptions): string {
  const t = messagesFor(options.language);
  const title = options.title?.trim() ? options.title : options.original.sourceKey;
  const changes = changeLog(options.original, options.current, options);
  const lines = [
    `${t.handoffInstructionTitle}: ${title}`,
    "",
    t.handoffInstructionIntro,
    "",
    t.handoffInstructionFinal,
    `${t.handoffInstructionStyle}:`,
    options.current.style,
    `${t.handoffInstructionLyrics}:`,
    handoffLyrics(options.current, options.dialect),
    "",
    `${t.handoffInstructionMode}: ${options.current.scoreMode}`,
  ];
  if (options.current.seed !== null) lines.push(`${t.handoffInstructionSeed}: ${options.current.seed}`);
  lines.push("", `${t.handoffInstructionChanges}:`);
  if (changes.length === 0) lines.push(t.changeLogNone);
  else for (const change of changes) lines.push(`- ${change}`);
  return `${lines.join("\n")}\n`;
}

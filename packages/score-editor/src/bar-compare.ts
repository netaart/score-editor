// ABOUTME: The "changed" comparison of two song projects, bar by bar: which bars differ in notes, chords, section or covering lyric lines.
// ABOUTME: Bars are compared by what they hold, never by text line numbers, so the same score written another way compares equal.
import type { Diagnostic } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import { type LyricLine, lyricLinesOf, lyricPhraseProblem, sectionIndexAt } from "./lyrics";
import { tiedFromPrevious } from "./rewritten-bars";
import type { Bar, Score, SongProject } from "./score";
import { fallbackDiagnostic } from "./score-text";

/** The bars whose content differs, as 0-based indices in order, or the reasons a score could not be read. */
export type BarCompareResult =
  | { readonly ok: true; readonly bars: ReadonlyArray<number> }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<Diagnostic> };

interface ReadProject {
  readonly score: Score;
  readonly lines: ReadonlyArray<LyricLine>;
}

function readProject(
  dialect: ScoreDialect,
  project: SongProject,
): ReadProject | { readonly diagnostics: ReadonlyArray<Diagnostic> } {
  const parsed = dialect.parse(project.score);
  if (parsed.score === null) {
    return { diagnostics: parsed.diagnostics.length > 0 ? parsed.diagnostics : [fallbackDiagnostic()] };
  }
  return { score: parsed.score, lines: lyricLinesOf(project, parsed.score) };
}

/**
 * What one bar holds, as a comparable string: its meter and key, its section and where that starts, its notes and chords
 * at their place in the bar, and the lyric lines whose phrase covers it.
 */
function barRecord(score: Score, lines: ReadonlyArray<LyricLine>, tied: ReadonlySet<string>, bar: Bar): string {
  const start = bar.start;
  const end = start + bar.length;
  const section = score.sections[sectionIndexAt(score, bar.index)];
  const notes = score.notes
    .filter((note) => note.bar === bar.index)
    .sort((left, right) => left.voice.localeCompare(right.voice) || left.start - right.start)
    .map((note) => [note.voice, note.start - start, note.duration, note.midi, note.tie, tied.has(note.id)]);
  const chords = score.chords
    .filter((chord) => chord.start >= start && chord.start < end)
    .sort((left, right) => left.start - right.start)
    .map((chord) => [chord.start - start, chord.name]);
  const covering: Array<[string, boolean]> = [];
  for (const line of lines) {
    const phrase = line.phrase;
    if (phrase === null || lyricPhraseProblem(score, phrase) !== null) continue;
    if (bar.index < phrase.firstBar || bar.index >= phrase.firstBar + phrase.barCount) continue;
    covering.push([line.text, phrase.firstBar === bar.index]);
  }
  return JSON.stringify({
    meter: [bar.meter.numerator, bar.meter.denominator],
    length: bar.length,
    incomplete: bar.incomplete,
    key: bar.key,
    keyChanges: bar.keyChanges.map((change) => [change.at - start, change.key]),
    section: section === undefined ? null : [section.name, section.firstBar === bar.index],
    notes,
    chords,
    lyrics: covering,
  });
}

function recordsOf(read: ReadProject): ReadonlyArray<string> {
  const tied = tiedFromPrevious(read.score);
  return read.score.bars.map((bar) => barRecord(read.score, read.lines, tied, bar));
}

/**
 * Compares the scores of two projects bar by bar, read with the same dialect. A bar that exists in only one of them
 * differs. The result is the 0-based index of every bar that differs, the same numbers `Bar.index` uses.
 */
export function compareBars(dialect: ScoreDialect, current: SongProject, other: SongProject): BarCompareResult {
  const left = readProject(dialect, current);
  if (!("score" in left)) return { ok: false, diagnostics: left.diagnostics };
  const right = readProject(dialect, other);
  if (!("score" in right)) return { ok: false, diagnostics: right.diagnostics };

  const leftRecords = recordsOf(left);
  const rightRecords = recordsOf(right);
  const count = Math.max(leftRecords.length, rightRecords.length);
  const bars: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if ((leftRecords[index] ?? null) !== (rightRecords[index] ?? null)) bars.push(index);
  }
  return { ok: true, bars };
}

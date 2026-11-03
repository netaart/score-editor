// ABOUTME: Extracts a run of whole bars of a song project as a song project of its own, which is the score editor's fragment.
// ABOUTME: The core builds the fragment's model; the dialect writes it and its check decides whether the fragment is legal.
import { commandRefusal } from "./command-refusal";
import { checkProject } from "./commands-project";
import { effectiveKeyAt, hasChordsAfter, isIndex } from "./commands-shared";
import type { Diagnostic } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import { joinLyrics, type LyricLine, lyricLinesOf, lyricPhraseProblem } from "./lyrics";
import {
  type Bar,
  type Chord,
  type KeyChange,
  type Note,
  noteId,
  type Score,
  type Section,
  type SongProject,
} from "./score";
import { fallbackDiagnostic, readScoreText } from "./score-text";

/** The run of whole bars to extract: `from` is the 0-based index of its first bar and `count` is at least one. */
export interface FragmentRange {
  readonly from: number;
  readonly count: number;
}

/**
 * The fragment as a project of its own, with the notices its lines and score carry; or the reasons it is not one. A
 * refused extraction says nothing about the original, which is never changed.
 */
export type FragmentResult =
  | { readonly ok: true; readonly project: SongProject; readonly diagnostics: ReadonlyArray<Diagnostic> }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<Diagnostic> };

function refused(diagnostic: Diagnostic): FragmentResult {
  return { ok: false, diagnostics: [diagnostic] };
}

/**
 * Extracts `range` of the project's score as a song project of its own: the header and the sections, voices, chords and
 * notes of those bars, and the lyric lines bound to their phrases (a phrase that reaches past the range keeps the bars
 * inside it). Ties that run out of the range are cut at its edge. A range that reaches the score's cut is refused.
 */
export function extractFragment(dialect: ScoreDialect, project: SongProject, range: FragmentRange): FragmentResult {
  const parsed = dialect.parse(project.score);
  if (parsed.score === null) {
    return { ok: false, diagnostics: parsed.diagnostics.length > 0 ? parsed.diagnostics : [fallbackDiagnostic()] };
  }
  const score = parsed.score;
  const { from, count } = range;
  if (!isIndex(from) || !isIndex(count) || count < 1 || from + count > score.bars.length) {
    return refused(commandRefusal("bar-out-of-range", { from: from + 1 }, { bar: from + 1 }).diagnostic);
  }
  if (score.truncation !== null && from + count > score.truncation.bar) {
    return refused(
      commandRefusal("truncated-tail", { bar: score.truncation.bar + 1 }, { bar: score.truncation.bar + 1 }).diagnostic,
    );
  }

  const first = score.bars[from] as Bar;
  const last = score.bars[from + count - 1] as Bar;
  const startTick = first.start;
  const endTick = last.start + last.length;
  const inRange = (bar: number): boolean => bar >= from && bar < from + count;

  const bars: Bar[] = score.bars.slice(from, from + count).map((bar, index) => ({
    ...bar,
    index,
    start: bar.start - startTick,
    keyChanges: bar.keyChanges.map((change) => ({ ...change, at: change.at - startTick })),
  }));
  const keys: KeyChange[] = [
    { at: 0, key: effectiveKeyAt(score, startTick) },
    ...score.keys
      .filter((change) => change.at > startTick && change.at < endTick)
      .map((change) => ({ at: change.at - startTick, key: change.key })),
  ];
  const kept = score.notes.filter((note) => inRange(note.bar));
  const starts = new Set(kept.map((note) => `${note.voice}:${note.start}`));
  const notes: Note[] = kept.map((note) => {
    const start = note.start - startTick;
    const continues = starts.has(`${note.voice}:${note.start + note.duration}`);
    return {
      ...note,
      id: noteId(note.voice, start),
      bar: note.bar - from,
      start,
      tie: note.tie && continues,
    };
  });
  const newIds = new Map<string, string>(
    kept.map((note) => [note.id, noteId(note.voice, note.start - startTick)] as const),
  );
  const chords: Chord[] = score.chords
    .filter((chord) => chord.start >= startTick && chord.start < endTick)
    .map((chord) => ({
      ...chord,
      start: chord.start - startTick,
      noteId: chord.noteId === null ? null : (newIds.get(chord.noteId) ?? null),
    }));
  const sections: Section[] = score.sections.flatMap((section) => {
    const begin = Math.max(section.firstBar, from);
    const end = Math.min(section.firstBar + section.barCount, from + count);
    return end > begin ? [{ name: section.name, firstBar: begin - from, barCount: end - begin }] : [];
  });

  const fragment: Score = {
    ...score,
    bars,
    keys,
    notes,
    chords,
    sections,
    truncation: null,
    hasChords: hasChordsAfter(chords, null),
  };
  let text: string;
  try {
    text = dialect.serialize(fragment);
  } catch {
    return refused(commandRefusal("write-mismatch", {}).diagnostic);
  }
  const taken = readScoreText(dialect, text);
  if (!taken.ok) return { ok: false, diagnostics: taken.diagnostics };

  const lines: LyricLine[] = [];
  for (const line of lyricLinesOf(project, score)) {
    const phrase = line.phrase;
    if (phrase === null || lyricPhraseProblem(score, phrase) !== null) continue;
    const begin = Math.max(phrase.firstBar, from);
    const end = Math.min(phrase.firstBar + phrase.barCount, from + count);
    if (end > begin) lines.push({ text: line.text, phrase: { firstBar: begin - from, barCount: end - begin } });
  }
  lines.sort((left, right) => (left.phrase?.firstBar ?? 0) - (right.phrase?.firstBar ?? 0));

  const next: SongProject = {
    style: project.style,
    lyrics: joinLyrics(taken.score, lines),
    lyricLines: lines,
    score: taken.text,
    scoreMode: project.scoreMode,
    seed: project.seed,
    modelId: project.modelId,
    sourceKey: project.sourceKey,
  };
  return { ok: true, project: next, diagnostics: checkProject(dialect, next) };
}

// ABOUTME: The adopt-by-bar command: a run of bars of another score replaces the same bars of this one, as one history step.
// ABOUTME: The spliced score is written and checked by the dialect, so an illegal result is refused and the score stays as it was.
import { commandRefusal } from "./command-refusal";
import type { ProjectCommand, ProjectCommandResult } from "./commands-project";
import { effectiveKeyAt, hasChordsAfter, isIndex, keyChangesInside, orderNotes, sectionsFrom } from "./commands-shared";
import type { ScoreDialect } from "./dialect";
import { clipPhraseToSection, joinLyrics, type LyricLine, lyricLinesOf } from "./lyrics";
import { rewrittenBars } from "./rewritten-bars";
import { type Bar, type Chord, type KeyChange, type Note, noteId, type Score, type SongProject } from "./score";
import { fallbackDiagnostic, readScoreText } from "./score-text";

type AdoptCommand = Extract<ProjectCommand, { readonly type: "adoptBars" }>;

/** The end of a score in ticks: where its last bar stops, or zero for a score with no bars. */
function endOf(score: Score): number {
  const last = score.bars[score.bars.length - 1];
  return last === undefined ? 0 : last.start + last.length;
}

/** A stretch of bars one section contributes to the spliced score; `starts` says that section begins at its first bar. */
interface Piece {
  readonly name: string | null;
  readonly firstBar: number;
  readonly starts: boolean;
  readonly barCount: number;
}

/**
 * The score with the bars `bar` through `bar + count - 1` taken from `source` in place of the bars this score has there.
 * The bars after the run keep their index and move in time by the length the run adds or removes. A run that goes past
 * the end appends. Keys and sections are rebuilt from the spliced pieces, and each bar's key is read back from the keys.
 */
function spliceBars(score: Score, source: Score, bar: number, count: number): Score {
  const replaced = Math.min(count, score.bars.length - bar);
  const shift = count - replaced;
  const aStart = bar < score.bars.length ? (score.bars[bar] as Bar).start : endOf(score);
  const aEnd = bar + replaced < score.bars.length ? (score.bars[bar + replaced] as Bar).start : endOf(score);
  const bStart = (source.bars[bar] as Bar).start;
  const bEnd = bar + count < source.bars.length ? (source.bars[bar + count] as Bar).start : endOf(source);
  const delta = bEnd - bStart - (aEnd - aStart);

  const bars: Bar[] = [
    ...score.bars.slice(0, bar),
    ...source.bars.slice(bar, bar + count).map((item, offset) => ({
      ...item,
      index: bar + offset,
      start: aStart + (item.start - bStart),
    })),
    ...score.bars.slice(bar + replaced).map((item) => ({
      ...item,
      index: item.index + shift,
      start: item.start + delta,
    })),
  ];

  const runNotes = source.notes.filter((note) => note.bar >= bar && note.bar < bar + count);
  const runStarts = new Set(runNotes.map((note) => `${note.voice}:${note.start}`));
  const runIds = new Map<string, string>();
  const adopted: Note[] = runNotes.map((note) => {
    const start = aStart + (note.start - bStart);
    const id = noteId(note.voice, start);
    runIds.set(note.id, id);
    // A tie that leaves the run would join the other score's next bar, which is not adopted, so it is cut at the edge.
    const continues = runStarts.has(`${note.voice}:${note.start + note.duration}`);
    return { ...note, id, start, tie: note.tie && continues };
  });
  const afterIds = new Map<string, string>();
  const after: Note[] = score.notes
    .filter((note) => note.bar >= bar + replaced)
    .map((note) => {
      const start = note.start + delta;
      const id = noteId(note.voice, start);
      afterIds.set(note.id, id);
      return { ...note, id, bar: note.bar + shift, start };
    });
  const notes = orderNotes(score, [...score.notes.filter((note) => note.bar < bar), ...adopted, ...after]);

  const chords: Chord[] = [
    ...score.chords.filter((chord) => chord.start < aStart),
    ...source.chords
      .filter((chord) => chord.start >= bStart && chord.start < bEnd)
      .map((chord) => ({
        ...chord,
        start: aStart + (chord.start - bStart),
        noteId: chord.noteId === null ? null : (runIds.get(chord.noteId) ?? null),
      })),
    ...score.chords
      .filter((chord) => chord.start >= aEnd)
      .map((chord) => ({
        ...chord,
        start: chord.start + delta,
        noteId: chord.noteId === null ? null : (afterIds.get(chord.noteId) ?? null),
      })),
  ];

  const pieces: Piece[] = [];
  for (const section of score.sections) {
    const end = Math.min(section.firstBar + section.barCount, bar);
    if (end > section.firstBar) {
      pieces.push({ name: section.name, firstBar: section.firstBar, starts: true, barCount: end - section.firstBar });
    }
  }
  for (const section of source.sections) {
    const begin = Math.max(section.firstBar, bar);
    const end = Math.min(section.firstBar + section.barCount, bar + count);
    if (end > begin) {
      pieces.push({ name: section.name, firstBar: begin, starts: section.firstBar === begin, barCount: end - begin });
    }
  }
  for (const section of score.sections) {
    const begin = Math.max(section.firstBar, bar + replaced);
    const end = section.firstBar + section.barCount;
    if (end > begin) {
      pieces.push({
        name: section.name,
        firstBar: begin + shift,
        starts: section.firstBar === begin,
        barCount: end - begin,
      });
    }
  }
  const markers: Array<{ name: string | null; firstBar: number }> = [];
  for (const piece of pieces) {
    const last = markers[markers.length - 1];
    if (last !== undefined && !piece.starts && piece.name === last.name) continue;
    markers.push({ name: piece.name, firstBar: piece.firstBar });
  }

  // The key in force is the score's before the run, the other score's inside it, and the score's again after it.
  const keys: KeyChange[] = score.keys.filter((change) => change.at < aStart).map((change) => ({ ...change }));
  const startKey = effectiveKeyAt(source, bStart);
  if (keys[keys.length - 1]?.key !== startKey) keys.push({ at: aStart, key: startKey });
  for (const change of source.keys) {
    if (change.at > bStart && change.at < bEnd) keys.push({ at: aStart + (change.at - bStart), key: change.key });
  }
  if (bar + replaced < score.bars.length) {
    const tailKey = effectiveKeyAt(score, aEnd);
    if (keys[keys.length - 1]?.key !== tailKey) keys.push({ at: aEnd + delta, key: tailKey });
    for (const change of score.keys) {
      if (change.at > aEnd) keys.push({ at: change.at + delta, key: change.key });
    }
  }

  const truncation = score.truncation === null ? null : { ...score.truncation, bar: score.truncation.bar + shift };
  const withKeys: Score = { ...score, keys };
  const spliced: Score = {
    ...withKeys,
    bars: bars.map((item) => ({
      ...item,
      key: effectiveKeyAt(withKeys, item.start),
      keyChanges: keyChangesInside(keys, item.start, item.length),
    })),
    notes,
    chords,
    truncation,
    hasChords: hasChordsAfter(chords, truncation),
  };
  return { ...spliced, sections: sectionsFrom(spliced, markers) };
}

/**
 * The lines keep their bars, since the splice never moves a bar's index. Each phrase is clipped to the sections the
 * spliced score has, so a section marker that the adopted bars bring cannot leave a phrase across two sections.
 */
function clipLyricLines(next: Score, lines: ReadonlyArray<LyricLine>): LyricLine[] {
  return lines.map((line) => {
    if (line.phrase === null) return line;
    const phrase = clipPhraseToSection(next, line.phrase.firstBar, line.phrase.firstBar + line.phrase.barCount - 1);
    return { text: line.text, phrase };
  });
}

/** Applies the adopt command: the run is read from the other text, spliced in, and checked by the dialect before it is written. */
export function runAdoptBars(dialect: ScoreDialect, project: SongProject, command: AdoptCommand): ProjectCommandResult {
  const { bar, count } = command;
  const parsed = dialect.parse(project.score);
  if (parsed.score === null) return { ok: false, diagnostic: parsed.diagnostics[0] ?? fallbackDiagnostic() };
  const score = parsed.score;
  const other = readScoreText(dialect, command.other);
  if (!other.ok) return { ok: false, diagnostic: other.diagnostics[0] ?? fallbackDiagnostic() };
  const source = other.score;

  if (!isIndex(bar) || !isIndex(count) || count < 1 || bar > score.bars.length || bar + count > source.bars.length) {
    return commandRefusal("bar-out-of-range", { from: bar + 1 }, { bar: bar + 1 });
  }
  if (score.truncation !== null && bar + count > score.truncation.bar) {
    return commandRefusal("truncated-tail", { bar: score.truncation.bar + 1 }, { bar: score.truncation.bar + 1 });
  }
  if (source.truncation !== null && bar + count > source.truncation.bar) {
    return commandRefusal("truncated-tail", { bar: source.truncation.bar + 1 }, { bar: source.truncation.bar + 1 });
  }

  const next = spliceBars(score, source, bar, count);
  let written: string;
  try {
    written = dialect.serialize(next);
  } catch {
    return commandRefusal("write-mismatch", { field: "bars" });
  }
  const first = dialect.check(next)[0];
  if (first !== undefined) return { ok: false, diagnostic: first };

  const lines = clipLyricLines(next, lyricLinesOf(project, score));
  const changed = rewrittenBars(score, next);
  return {
    ok: true,
    project: { ...project, score: written, lyricLines: lines, lyrics: joinLyrics(next, lines) },
    ...(changed.length === 0 ? {} : { rewrittenBars: changed }),
  };
}

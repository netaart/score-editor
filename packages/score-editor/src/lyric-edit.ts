// ABOUTME: The headless half of the lyric track: which line sits where, and which commands a boundary drag, a drop and a split send.
// ABOUTME: Pure functions of a score and lyric lines, so a host's own lyric view reuses the track's rules and seam 1 can check them.
import { barIndexAt } from "./arrangement";
import type { ProjectCommand } from "./commands-project";
import { alignedLyricLines, alignLyricLine, type LyricAlignment, sectionIndexAt, syllableCount } from "./lyrics";
import type { LyricLine, LyricPhrase, Score } from "./score";

/** One lyric line as the track places it. */
export interface LyricRow {
  /** The line's place in the project's lines: the number every lyric command names it by. */
  readonly index: number;
  readonly line: LyricLine;
  /** The line's phrase when it fits the score; null for a line in the unaligned area, a phrase that no longer fits included. */
  readonly phrase: LyricPhrase | null;
  /** What the phrase's notes say about the line's syllables; null for a line in the unaligned area. */
  readonly alignment: LyricAlignment | null;
}

/**
 * The lines in the order the project stores them, each with the phrase it sits on. A line whose phrase does not fit the
 * score counts as unaligned, whatever it stores, so the track and the commands agree about which area a line is in.
 */
export function lyricRows(score: Score, lines: ReadonlyArray<LyricLine>): ReadonlyArray<LyricRow> {
  // The aligned lines are a subsequence of `lines`, in order, so walking both finds each line's area without comparing text.
  const aligned = alignedLyricLines(lines, score);
  let next = 0;
  return lines.map((line, index) => {
    if (aligned[next] !== line) return { index, line, phrase: null, alignment: null };
    next += 1;
    return { index, line, phrase: line.phrase, alignment: alignLyricLine(score, line) };
  });
}

/** Which edge of a phrase is dragged: the line before its first bar, or the line after its last bar. */
export type LyricEdge = "start" | "end";

/** An edge of a line's phrase dragged to a place on the time axis. */
export interface LyricBoundaryDrag {
  /** The line's place in the project's lines. */
  readonly line: number;
  readonly edge: LyricEdge;
  /** Where the pointer is, in ticks on the time axis. */
  readonly tick: number;
}

/** One phrase that a drag changes. */
export interface LyricBoundaryMove {
  readonly line: number;
  readonly phrase: LyricPhrase;
}

/** What dragging an edge comes to. */
export interface LyricBoundaryPlan {
  /** The bar line the edge lands on once it is held inside its limits: a 0-based bar index, the bar count being the end. */
  readonly boundary: number;
  /** The phrases that change, in the order their commands go. Empty when the edge stays where it was. */
  readonly moves: ReadonlyArray<LyricBoundaryMove>;
  /** One `setLyricLinePhrase` for each move. Apply them as one list: the song project refuses a step that overlaps. */
  readonly commands: ReadonlyArray<ProjectCommand>;
}

/**
 * The tick of the bar line `index`: the start of that bar, the line after the last bar being the end of the score. A line
 * before the first bar is held at the start of the score and one past the end at its end, so a step off either end of the
 * score lands where it was.
 */
export function barLineTick(score: Score, index: number): number {
  const first = score.bars[0];
  const last = score.bars[score.bars.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (index <= 0) return first.start;
  return score.bars[index]?.start ?? last.start + last.length;
}

/** The bar line nearest `tick`; halfway between two lines belongs to the earlier one. */
function nearestBarLine(score: Score, tick: number): number {
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= score.bars.length; index += 1) {
    const away = Math.abs(barLineTick(score, index) - tick);
    if (away < distance) {
      nearest = index;
      distance = away;
    }
  }
  return nearest;
}

/** The bar line after the phrase's last bar, as the 0-based index of the bar that would follow it. */
export const phraseEnd = (phrase: LyricPhrase): number => phrase.firstBar + phrase.barCount;

function setPhrase(line: number, phrase: LyricPhrase): ProjectCommand {
  return { type: "setLyricLinePhrase", line, phrase };
}

/**
 * Which phrases change, and which commands go, when an edge of a line's phrase is dragged to a place on the time axis.
 * The edge lands on the nearest bar line and is held there: a phrase keeps one bar at least, stays in its section and
 * does not reach into another line's bars. The line next to it that shares the edge gives up or takes the bars the edge
 * crosses, and the line that gives up goes first, because the song project refuses a step that leaves two phrases on
 * one bar. Null for a line that is not there or sits in the unaligned area.
 */
export function lyricBoundaryPlan(
  score: Score,
  lines: ReadonlyArray<LyricLine>,
  drag: LyricBoundaryDrag,
): LyricBoundaryPlan | null {
  const rows = lyricRows(score, lines);
  const own = rows[drag.line];
  const phrase = own?.phrase;
  if (own === undefined || !phrase || score.bars.length === 0 || !Number.isFinite(drag.tick)) return null;

  const section = score.sections[sectionIndexAt(score, phrase.firstBar)];
  if (section === undefined) return null;
  const sectionEnd = section.firstBar + section.barCount;
  const others = rows.flatMap((row) =>
    row.index !== own.index && row.phrase ? [{ line: row.index, phrase: row.phrase }] : [],
  );
  const wanted = nearestBarLine(score, drag.tick);
  const start = phrase.firstBar;
  const end = phraseEnd(phrase);

  const moves: LyricBoundaryMove[] = [];
  let boundary: number;
  if (drag.edge === "start") {
    const before = others
      .filter((other) => phraseEnd(other.phrase) <= start)
      .sort((a, b) => phraseEnd(b.phrase) - phraseEnd(a.phrase))[0];
    // A line that ends where this one starts, in the same section, is moved with the edge; across a section line it is not.
    const shared = before !== undefined && phraseEnd(before.phrase) === start && start > section.firstBar;
    const lowest = shared
      ? before.phrase.firstBar + 1
      : Math.max(section.firstBar, before ? phraseEnd(before.phrase) : 0);
    boundary = Math.min(end - 1, Math.max(lowest, wanted));
    if (boundary !== start) {
      const mine = { line: own.index, phrase: { firstBar: boundary, barCount: end - boundary } };
      if (shared) {
        const theirs = {
          line: before.line,
          phrase: { firstBar: before.phrase.firstBar, barCount: boundary - before.phrase.firstBar },
        };
        moves.push(...(boundary > start ? [mine, theirs] : [theirs, mine]));
      } else {
        moves.push(mine);
      }
    }
  } else {
    const after = others
      .filter((other) => other.phrase.firstBar >= end)
      .sort((a, b) => a.phrase.firstBar - b.phrase.firstBar)[0];
    const shared = after !== undefined && after.phrase.firstBar === end && end < sectionEnd;
    const highest = shared ? phraseEnd(after.phrase) - 1 : Math.min(sectionEnd, after?.phrase.firstBar ?? sectionEnd);
    boundary = Math.max(start + 1, Math.min(highest, wanted));
    if (boundary !== end) {
      const mine = { line: own.index, phrase: { firstBar: start, barCount: boundary - start } };
      if (shared) {
        const theirs = {
          line: after.line,
          phrase: { firstBar: boundary, barCount: phraseEnd(after.phrase) - boundary },
        };
        moves.push(...(boundary > end ? [theirs, mine] : [mine, theirs]));
      } else {
        moves.push(mine);
      }
    }
  }
  return { boundary, moves, commands: moves.map((move) => setPhrase(move.line, move.phrase)) };
}

/** A line let go of at a place on the time axis. */
export interface LyricDrop {
  /** The line's place in the project's lines. */
  readonly line: number;
  /** Where the pointer is, in ticks on the time axis. */
  readonly tick: number;
}

/** What dropping a line comes to. */
export interface LyricDropPlan {
  /** The phrase the line is given: the bar under the pointer. */
  readonly phrase: LyricPhrase;
  /** False when another line already sits on that bar; the command is still named, and the song project refuses it. */
  readonly free: boolean;
  /** One `setLyricLinePhrase`, or none when the line already has this phrase. */
  readonly commands: ReadonlyArray<ProjectCommand>;
}

/**
 * Gives a line one bar, the bar under the pointer, which is how a line in the unaligned area is put on the song. The
 * phrase is widened afterwards by dragging its edge. Null for a line that is not there or a pointer that is not a place.
 */
export function lyricDropPlan(score: Score, lines: ReadonlyArray<LyricLine>, drop: LyricDrop): LyricDropPlan | null {
  const rows = lyricRows(score, lines);
  const own = rows[drop.line];
  if (own === undefined || score.bars.length === 0 || !Number.isFinite(drop.tick)) return null;
  const firstBar = barIndexAt(score.bars, drop.tick);
  const phrase = { firstBar, barCount: 1 };
  const free = !rows.some(
    (row) =>
      row.index !== own.index &&
      row.phrase !== null &&
      firstBar >= row.phrase.firstBar &&
      firstBar < phraseEnd(row.phrase),
  );
  const same = own.phrase?.firstBar === firstBar && own.phrase.barCount === 1;
  return { phrase, free, commands: same ? [] : [setPhrase(own.index, phrase)] };
}

/** A caret in a line's text. */
export interface LyricSplit {
  /** The line's place in the project's lines. */
  readonly line: number;
  /** How many code points of the text come before the caret. */
  readonly offset: number;
}

/** The bar a split starts its second half on, inside a phrase of two bars or more. */
function splitBar(score: Score, row: LyricRow, phrase: LyricPhrase, offset: number): number {
  const before = syllableCount(Array.from(row.line.text).slice(0, offset).join(""));
  const alignment = row.alignment;
  const first = phrase.firstBar + 1;
  const last = phraseEnd(phrase) - 1;
  const onset = alignment?.equal ? alignment.onsets[before] : undefined;
  if (onset !== undefined) {
    // The second half starts on the note that carries the first syllable after the caret; the bar line nearest it wins.
    let best = first;
    for (let bar = first; bar <= last; bar += 1) {
      if (Math.abs(barLineTick(score, bar) - onset.start) < Math.abs(barLineTick(score, best) - onset.start))
        best = bar;
    }
    return best;
  }
  const total = alignment?.syllables.length ?? 0;
  const share = total === 0 ? phrase.barCount / 2 : (phrase.barCount * before) / total;
  return Math.min(last, Math.max(first, phrase.firstBar + Math.round(share)));
}

/**
 * The `splitLyricLine` command for a caret in a line's text. A line in a phrase of two bars or more is cut in the bars
 * as well: at the bar line nearest the note of the first syllable after the caret when the counts are equal, and in the
 * proportion of the syllables when they are not. A phrase of one bar, and a line in the unaligned area, are split in the
 * text only; the song project then leaves the second half unaligned. Null for a line that is not there.
 */
export function lyricSplitCommand(
  score: Score,
  lines: ReadonlyArray<LyricLine>,
  split: LyricSplit,
): ProjectCommand | null {
  const row = lyricRows(score, lines)[split.line];
  if (row === undefined) return null;
  const base = { type: "splitLyricLine", line: split.line, offset: split.offset } as const;
  const phrase = row.phrase;
  if (phrase === null || phrase.barCount < 2 || !Number.isInteger(split.offset) || split.offset < 0) return base;
  return { ...base, bar: splitBar(score, row, phrase, split.offset) };
}

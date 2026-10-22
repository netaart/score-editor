// ABOUTME: Writes the two truncation commands: fill an incomplete bar with rests, or delete it and its unfinished bytes.
// ABOUTME: Only the cut line and a tie it may have cleared in an earlier line are rewritten; every other line keeps its bytes.
import type { Score } from "@neta-art/score-editor";
import { barContentOf, type Song2Source, type Song2SourceLine } from "./parser";
import { sameContent, writeBar } from "./writer";

function lastSegmentBars(line: Song2SourceLine) {
  return line.segments[line.segments.length - 1]?.bars ?? [];
}

function cutLineOf(source: Song2Source): Song2SourceLine | undefined {
  const truncation = source.truncation;
  if (truncation === null) return undefined;
  for (const line of source.musicLines) {
    if (line.voice !== truncation.voice || line.endsWithBarline) continue;
    const bars = lastSegmentBars(line);
    if (bars.some((bar) => bar.bar === truncation.bar)) return line;
  }
  return undefined;
}

function hasVoiceNotes(score: Score, voice: string, bar: number): boolean {
  return score.notes.some((note) => note.voice === voice && note.bar === bar);
}

function lineFor(
  score: Score,
  line: Song2SourceLine,
  unitDenominator: number,
  lastBar: number | null,
  close: boolean,
): string | null {
  const pieces: string[] = [];
  for (let index = 0; index < line.segments.length; index += 1) {
    const segment = line.segments[index] as Song2SourceLine["segments"][number];
    const isLast = index === line.segments.length - 1;
    if (lastBar !== null && isLast) {
      const bar = segment.bars[0]?.bar;
      if (bar === undefined || bar > lastBar) break;
      pieces.push(
        writeBar(
          score,
          { voice: line.voice, bar, content: barContentOf(score, line.voice, bar), inlineKeys: [] },
          unitDenominator,
        ),
      );
      continue;
    }
    const unchanged = segment.bars.every((bar) => sameContent(bar.content, barContentOf(score, bar.voice, bar.bar)));
    if (unchanged) pieces.push(segment.raw);
    else {
      pieces.push(
        segment.bars
          .map((bar) =>
            writeBar(
              score,
              { voice: line.voice, bar: bar.bar, content: barContentOf(score, line.voice, bar.bar), inlineKeys: [] },
              unitDenominator,
            ),
          )
          .join("|"),
      );
    }
  }
  if (pieces.length === 0) return null;
  return `${pieces.join("|")}${close || line.endsWithBarline ? "|" : ""}`;
}

function blockStart(lines: ReadonlyArray<string>, musicLine: number): number {
  let start = musicLine;
  while (start > 0) {
    const previous = lines[start - 1] as string;
    if (previous.startsWith("M:") || previous.startsWith("K:")) {
      start -= 1;
      continue;
    }
    break;
  }
  if (start > 0 && (lines[start - 1] as string).startsWith("V: ")) start -= 1;
  return start;
}

/** Rewrites only the cut line after a truncation command. Other lines are rewritten only when a tie changed. */
export function serializeTruncationSong2(score: Score, source: Song2Source): string {
  const lines = source.text.split("\n");
  const dropped = new Set<number>();
  const cut = cutLineOf(source);
  const truncation = source.truncation;
  const cutBar = truncation?.bar ?? -1;
  const cutVoice = truncation?.voice ?? "";
  const filling = truncation !== null && hasVoiceNotes(score, cutVoice, cutBar);
  const keepBar = filling ? cutBar : Math.min(cutBar - 1, score.bars.length - 1);

  for (const line of source.musicLines) {
    if (line === cut) {
      if (filling) {
        const rebuilt = lineFor(score, line, source.unitDenominator, cutBar, true);
        if (rebuilt === null) throw new Error("song2: the cut line has no measures to write");
        lines[line.line] = rebuilt;
        continue;
      }
      const rebuilt = lineFor(score, line, source.unitDenominator, keepBar, true);
      if (rebuilt !== null) {
        lines[line.line] = rebuilt;
        continue;
      }
      const start = blockStart(lines, line.line);
      for (let index = start; index <= line.line; index += 1) dropped.add(index);
      continue;
    }

    const tail = line.cutTail;
    if (tail !== null) {
      const rebuilt = lineFor(score, line, source.unitDenominator, null, line.endsWithBarline);
      if (rebuilt !== null) lines[line.line] = rebuilt;
      continue;
    }
    const pieces: string[] = [];
    let changed = false;
    for (const segment of line.segments) {
      const unchanged = segment.bars.every((bar) => sameContent(bar.content, barContentOf(score, bar.voice, bar.bar)));
      if (unchanged) {
        pieces.push(segment.raw);
      } else {
        changed = true;
        pieces.push(
          segment.bars
            .map((bar) =>
              writeBar(
                score,
                { voice: line.voice, bar: bar.bar, content: barContentOf(score, line.voice, bar.bar), inlineKeys: [] },
                source.unitDenominator,
              ),
            )
            .join("|"),
        );
      }
    }
    if (!changed) continue;
    lines[line.line] = `${pieces.join("|")}${line.endsWithBarline ? "|" : ""}`;
  }

  return lines.filter((_line, index) => !dropped.has(index)).join("\n");
}

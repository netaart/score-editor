// ABOUTME: Writes a song2 score whose bar grid changed: unchanged bars keep their read bytes, new bars come from the model.
// ABOUTME: It groups bars into voice blocks of one to four measures and writes M:/K: fields only where the model needs them.
import type { Bar, Meter, Score } from "@neta-art/score-editor";
import { type BarContent, barContentOf, type Song2Source, type Song2SourceBar, type Song2SourceLine } from "./parser";
import { writeBar } from "./writer";

interface SourceBar {
  readonly record: Song2SourceBar;
  readonly segmentStart: number;
  readonly segmentLength: number;
  readonly segmentRaw: string;
}

interface SourceFacts {
  readonly lines: ReadonlyArray<string>;
  readonly musicLines: ReadonlyArray<Song2SourceLine>;
  readonly byVoiceBar: ReadonlyMap<string, SourceBar>;
  readonly byBar: ReadonlyMap<number, BarContent>;
  readonly oldBarCount: number;
  readonly oldFinalGroupStart: number;
  readonly keyIndex: number;
  readonly headerMeter: Meter;
  readonly headerKey: string;
  readonly trailingNewline: boolean;
}

interface Alignment {
  readonly prefix: number;
  readonly suffix: number;
  readonly suffixStartNew: number;
  readonly suffixStartOld: number;
  readonly oldAt: ReadonlyArray<number | undefined>;
}

interface Piece {
  readonly text: string;
  readonly count: number;
  readonly raw: boolean;
  readonly inlineAtStart: boolean;
}

interface Unit {
  readonly from: number;
  readonly end: number;
}

function keyOf(voice: string, bar: number): string {
  return `${voice}:${bar}`;
}

function parseMeter(text: string): Meter {
  const match = /^M:([1-9][0-9]{0,5})\/([1-9][0-9]{0,5})$/.exec(text);
  if (match === null) throw new Error("song2: the header meter cannot be read back");
  return { numerator: Number(match[1]), denominator: Number(match[2]) };
}

function factsOf(score: Score, source: Song2Source): SourceFacts {
  const lines = source.text.split("\n");
  const byVoiceBar = new Map<string, SourceBar>();
  const byBar = new Map<number, BarContent>();
  let oldBarCount = 0;
  let lastVocalStart = 0;
  for (const line of source.musicLines) {
    for (let segmentIndex = 0; segmentIndex < line.segments.length; segmentIndex += 1) {
      const segment = line.segments[segmentIndex] as Song2SourceLine["segments"][number];
      for (const record of segment.bars) {
        byVoiceBar.set(keyOf(record.voice, record.bar), {
          record,
          segmentStart: (segment.bars[0] as Song2SourceBar).bar,
          segmentLength: segment.bars.length,
          segmentRaw: segment.raw,
        });
        if (!byBar.has(record.bar)) byBar.set(record.bar, record.content);
        if (record.bar + 1 > oldBarCount) oldBarCount = record.bar + 1;
      }
    }
    if (line.voice === "Vocal") {
      const first = line.segments[0]?.bars[0]?.bar;
      if (first !== undefined) lastVocalStart = first;
    }
  }
  const keyIndex = 6 + (score.voices.includes("Ins") ? 1 : 0);
  const keyLine = lines[keyIndex] ?? "K:C";
  const headerKey = keyLine.startsWith("K:") ? keyLine.slice(2) : (score.keys[0]?.key ?? "C");
  return {
    lines,
    musicLines: source.musicLines,
    byVoiceBar,
    byBar,
    oldBarCount,
    oldFinalGroupStart: lastVocalStart,
    keyIndex,
    headerMeter: parseMeter(lines[2] ?? "M:4/4"),
    headerKey,
    trailingNewline: /\n[ \t]*$/.test(source.text),
  };
}

function contentSignature(content: BarContent): string {
  const notes = content.notes.map((note) => [note.start - content.start, note.duration, note.midi, note.tie]);
  const chords = content.chords.map((chord) => [chord.start - content.start, chord.name]);
  const keys = content.keyChanges.map((change) => [change.at - content.start, change.key]);
  return JSON.stringify([content.length, content.meter, content.key, content.incomplete, keys, notes, chords]);
}

function modelSignature(score: Score, barIndex: number, voice: string): string {
  const bar = score.bars[barIndex];
  if (bar === undefined) throw new Error(`song2: bar ${barIndex} has no model record`);
  const notes = score.notes
    .filter((note) => note.voice === voice && note.bar === barIndex)
    .map((note) => [note.start - bar.start, note.duration, note.midi, note.tie]);
  const chords =
    voice === "Vocal"
      ? score.chords
          .filter((chord) => chord.start >= bar.start && chord.start < bar.start + bar.length)
          .map((chord) => [chord.start - bar.start, chord.name])
      : [];
  const keys = bar.keyChanges.map((change) => [change.at - bar.start, change.key]);
  return JSON.stringify([
    bar.length,
    `${bar.meter.numerator}/${bar.meter.denominator}`,
    bar.key,
    bar.incomplete,
    keys,
    notes,
    chords,
  ]);
}

function sameAt(score: Score, newIndex: number, oldIndex: number, facts: SourceFacts): string | null {
  const old = facts.byBar.get(oldIndex);
  if (old === undefined) return null;
  for (const voice of score.voices) {
    if (facts.byVoiceBar.has(keyOf(voice, oldIndex))) {
      if (contentSignature(old) !== modelSignature(score, newIndex, voice)) return null;
      return voice;
    }
  }
  return null;
}

/** Matches the unchanged head and tail by content and absolute start; the middle is the edit. */
function align(score: Score, facts: SourceFacts, newEnd: number, oldEnd: number): Alignment {
  let prefix = 0;
  while (prefix < newEnd && prefix < oldEnd && sameAt(score, prefix, prefix, facts) !== null) prefix += 1;

  let suffix = 0;
  const newLast = newEnd - 1;
  const oldLast = oldEnd - 1;
  if (newLast >= prefix && oldLast >= 0) {
    const oldContent = facts.byBar.get(oldLast);
    if (oldContent !== undefined) {
      const delta = (score.bars[newLast] as Bar).start - oldContent.start;
      while (suffix < newEnd - prefix && suffix < oldEnd) {
        const newIndex = newLast - suffix;
        const oldIndex = oldLast - suffix;
        if (sameAt(score, newIndex, oldIndex, facts) === null) break;
        if ((score.bars[newIndex] as Bar).start - (facts.byBar.get(oldIndex) as BarContent).start !== delta) break;
        suffix += 1;
      }
    }
  }

  const cappedPrefix = Math.min(prefix, newEnd - suffix);
  const oldAt: (number | undefined)[] = new Array(newEnd).fill(undefined);
  for (let index = 0; index < cappedPrefix; index += 1) oldAt[index] = index;
  for (let index = 0; index < suffix; index += 1) oldAt[newLast - index] = oldLast - index;
  return {
    prefix: cappedPrefix,
    suffix,
    suffixStartNew: newEnd - suffix,
    suffixStartOld: oldEnd - suffix,
    oldAt,
  };
}

function segmentMatches(
  score: Score,
  facts: SourceFacts,
  voice: string,
  oldIndex: number,
  count: number,
  newIndex: number,
): boolean {
  for (let offset = 0; offset < count; offset += 1) {
    const sourceBar = facts.byVoiceBar.get(keyOf(voice, oldIndex + offset));
    if (sourceBar === undefined) return false;
    if (contentSignature(sourceBar.record.content) !== modelSignature(score, newIndex + offset, voice)) return false;
  }
  return true;
}

function buildPieces(
  score: Score,
  facts: SourceFacts,
  alignment: Alignment,
  newEnd: number,
  unitDenominator: number,
): Map<string, Map<number, Piece>> {
  const byVoice = new Map<string, Map<number, Piece>>();
  for (const voice of score.voices) {
    const pieces = new Map<number, Piece>();
    let index = 0;
    while (index < newEnd) {
      const old = alignment.oldAt[index];
      if (old !== undefined) {
        const sourceBar = facts.byVoiceBar.get(keyOf(voice, old));
        const mappedStart =
          old >= alignment.suffixStartOld ? alignment.suffixStartNew + (old - alignment.suffixStartOld) : old;
        if (
          mappedStart === index &&
          sourceBar !== undefined &&
          sourceBar.segmentStart === old &&
          segmentMatches(score, facts, voice, old, sourceBar.segmentLength, index)
        ) {
          pieces.set(index, {
            text: sourceBar.segmentRaw,
            count: sourceBar.segmentLength,
            raw: true,
            inlineAtStart: sourceBar.record.inlineKeys.some((change) => change.at === sourceBar.record.content.start),
          });
          index += sourceBar.segmentLength;
          continue;
        }
      }
      pieces.set(index, {
        text: writeBar(
          score,
          { voice, bar: index, content: barContentOf(score, voice, index), inlineKeys: [] },
          unitDenominator,
        ),
        count: 1,
        raw: false,
        inlineAtStart: false,
      });
      index += 1;
    }
    byVoice.set(voice, pieces);
  }
  return byVoice;
}

/** Maximal blocks that no voice may split; a Z4 in one voice can contain a Z2 in the other. */
function buildUnits(pieces: Map<string, Map<number, Piece>>, newEnd: number): Unit[] {
  const intervals: Unit[] = [];
  for (const voicePieces of pieces.values()) {
    for (const [from, piece] of voicePieces) intervals.push({ from, end: from + piece.count });
  }
  intervals.sort((left, right) => left.from - right.from || left.end - right.end);
  const units: Unit[] = [];
  let current: Unit | undefined;
  for (const interval of intervals) {
    if (current === undefined || interval.from >= current.end) {
      if (current !== undefined) units.push(current);
      current = { ...interval };
      continue;
    }
    current = { from: current.from, end: Math.max(current.end, interval.end) };
  }
  if (current !== undefined) units.push(current);
  if (units.length === 0 && newEnd > 0) units.push({ from: 0, end: newEnd });
  return units;
}

function keyEntriesAt(score: Score, at: number) {
  return score.keys.filter((change) => change.at === at);
}

function sectionStarts(score: Score): Map<number, string[]> {
  const starts = new Map<number, string[]>();
  for (const section of score.sections) {
    if (section.name === null) continue;
    const names = starts.get(section.firstBar) ?? [];
    names.push(section.name);
    starts.set(section.firstBar, names);
  }
  return starts;
}

function rawInlineAt(pieces: Map<string, Map<number, Piece>>, voices: ReadonlyArray<string>, from: number): boolean {
  return voices.some((voice) => pieces.get(voice)?.get(from)?.inlineAtStart ?? false);
}

function keyFieldAt(score: Score, pieces: Map<string, Map<number, Piece>>, from: number): boolean {
  const bar = score.bars[from] as Bar;
  const entries = keyEntriesAt(score, bar.start);
  const bodyEntries = entries.length - (from === 0 ? 1 : 0);
  const inline = rawInlineAt(pieces, score.voices, from);
  return bodyEntries > (inline ? 1 : 0);
}

function writeGroup(
  score: Score,
  facts: SourceFacts,
  from: number,
  to: number,
  pieces: Map<string, Map<number, Piece>>,
  sections: Map<number, string[]>,
): string[] {
  const lines: string[] = [];
  for (const name of sections.get(from) ?? []) lines.push(`% ${name}`);
  const bar = score.bars[from] as Bar;
  const meterBefore = from === 0 ? facts.headerMeter : (score.bars[from - 1] as Bar).meter;
  const meterField = bar.meter.numerator !== meterBefore.numerator || bar.meter.denominator !== meterBefore.denominator;
  for (const voice of score.voices) {
    lines.push(`V: ${voice}`);
    if (meterField) lines.push(`M:${bar.meter.numerator}/${bar.meter.denominator}`);
    if (keyFieldAt(score, pieces, from)) lines.push(`K:${bar.key}`);
    const voicePieces: string[] = [];
    let index = from;
    while (index <= to) {
      const piece = pieces.get(voice)?.get(index);
      if (piece === undefined) throw new Error(`song2: bar ${index} of ${voice} has no piece`);
      voicePieces.push(piece.text);
      index += piece.count;
    }
    lines.push(`${voicePieces.join("|")}|`);
  }
  return lines;
}

/** Writes a score whose bars moved, were inserted or deleted: unchanged pieces keep their bytes. */
export function serializeBarsSong2(score: Score, source: Song2Source, unitDenominator: number): string {
  const facts = factsOf(score, source);
  const truncated = score.truncation !== null;
  const oldFinalStart = truncated ? facts.oldFinalGroupStart : facts.oldBarCount;
  const delta = score.bars.length - facts.oldBarCount;
  const newFinalStart = truncated ? oldFinalStart + delta : score.bars.length;
  const prefixEnd = Math.max(0, Math.min(newFinalStart, score.bars.length));
  const alignment = align(score, facts, prefixEnd, oldFinalStart);
  const pieces = buildPieces(score, facts, alignment, prefixEnd, unitDenominator);
  const units = buildUnits(pieces, prefixEnd);
  const sections = sectionStarts(score);
  const body: string[] = [];
  let groupFrom = 0;
  let groupSize = 0;
  const flush = (to: number): void => {
    if (groupSize === 0) return;
    body.push(...writeGroup(score, facts, groupFrom, to, pieces, sections));
    groupSize = 0;
  };
  for (const unit of units) {
    const length = unit.end - unit.from;
    if (groupSize > 0) {
      const bar = score.bars[unit.from] as Bar;
      const previous = score.bars[unit.from - 1] as Bar;
      const meterChanged =
        bar.meter.numerator !== previous.meter.numerator || bar.meter.denominator !== previous.meter.denominator;
      if (meterChanged || keyFieldAt(score, pieces, unit.from) || sections.has(unit.from) || groupSize + length > 4) {
        flush(unit.from - 1);
        groupFrom = unit.from;
      }
    }
    if (groupSize === 0) groupFrom = unit.from;
    groupSize += length;
  }
  flush(prefixEnd - 1);

  if (truncated && newFinalStart < score.bars.length) {
    body.push(...writeFinalGroup(score, facts, newFinalStart, sections));
  }
  const lines = [...facts.lines.slice(0, facts.keyIndex + 1), ...body];
  return `${lines.join("\n")}${facts.trailingNewline ? "\n" : ""}`;
}

function sourceCoverage(facts: SourceFacts, score: Score): Map<string, Set<number>> {
  const coverage = new Map<string, Set<number>>();
  for (const voice of score.voices) {
    const bars = new Set<number>();
    for (const line of facts.musicLines) {
      if (line.voice !== voice) continue;
      for (const segment of line.segments) for (const bar of segment.bars) bars.add(bar.bar);
    }
    coverage.set(voice, bars);
  }
  return coverage;
}

function coveredAt(alignment: Alignment, coverage: Map<string, Set<number>>, voice: string, index: number): boolean {
  const old = alignment.oldAt[index];
  if (old === undefined) return true;
  return coverage.get(voice)?.has(old) ?? false;
}

function buildCoveredPieces(
  score: Score,
  facts: SourceFacts,
  alignment: Alignment,
  newEnd: number,
  unitDenominator: number,
  coverage: Map<string, Set<number>>,
): Map<string, Map<number, Piece>> {
  const byVoice = new Map<string, Map<number, Piece>>();
  for (const voice of score.voices) {
    const pieces = new Map<number, Piece>();
    let index = 0;
    while (index < newEnd) {
      if (!coveredAt(alignment, coverage, voice, index)) {
        index += 1;
        continue;
      }
      const old = alignment.oldAt[index];
      if (old !== undefined) {
        const sourceBar = facts.byVoiceBar.get(keyOf(voice, old));
        let usable = sourceBar !== undefined && sourceBar.segmentStart === old;
        if (usable && sourceBar !== undefined) {
          for (let offset = 0; offset < sourceBar.segmentLength; offset += 1) {
            if (!coveredAt(alignment, coverage, voice, index + offset)) usable = false;
          }
        }
        if (
          usable &&
          sourceBar !== undefined &&
          segmentMatches(score, facts, voice, old, sourceBar.segmentLength, index)
        ) {
          pieces.set(index, {
            text: sourceBar.segmentRaw,
            count: sourceBar.segmentLength,
            raw: true,
            inlineAtStart: sourceBar.record.inlineKeys.some((change) => change.at === sourceBar.record.content.start),
          });
          index += sourceBar.segmentLength;
          continue;
        }
      }
      pieces.set(index, {
        text: writeBar(
          score,
          { voice, bar: index, content: barContentOf(score, voice, index), inlineKeys: [] },
          unitDenominator,
        ),
        count: 1,
        raw: false,
        inlineAtStart: false,
      });
      index += 1;
    }
    byVoice.set(voice, pieces);
  }
  return byVoice;
}

function writeTruncatedGroup(
  score: Score,
  facts: SourceFacts,
  from: number,
  to: number,
  pieces: Map<string, Map<number, Piece>>,
  sections: Map<number, string[]>,
  coverage: Map<string, Set<number>>,
  alignment: Alignment,
): string[] {
  const lines: string[] = [];
  for (const name of sections.get(from) ?? []) lines.push(`% ${name}`);
  const bar = score.bars[from] as Bar;
  const meterBefore = from === 0 ? facts.headerMeter : (score.bars[from - 1] as Bar).meter;
  const meterField = bar.meter.numerator !== meterBefore.numerator || bar.meter.denominator !== meterBefore.denominator;
  for (const voice of score.voices) {
    const voicePieces: string[] = [];
    let lastCovered = -1;
    for (let index = from; index <= to; index += 1) {
      if (!coveredAt(alignment, coverage, voice, index)) {
        continue;
      }
      const piece = pieces.get(voice)?.get(index);
      if (piece === undefined) throw new Error(`song2: bar ${index} of ${voice} has no piece`);
      voicePieces.push(piece.text);
      lastCovered = index;
      index += piece.count - 1;
    }
    if (voicePieces.length === 0) continue;
    lines.push(`V: ${voice}`);
    if (meterField) lines.push(`M:${bar.meter.numerator}/${bar.meter.denominator}`);
    if (keyFieldAt(score, pieces, from)) lines.push(`K:${bar.key}`);
    const lastBar = score.bars[lastCovered] as Bar;
    const incomplete =
      (lastBar.incomplete ||
        (score.truncation?.voice === voice && score.truncation.short && lastCovered === score.truncation.bar)) ??
      false;
    lines.push(`${voicePieces.join("|")}${incomplete ? "" : "|"}`);
  }
  return lines;
}

/** Writes a cut score after a structural edit: every bar comes from the model, and unchanged pieces keep their bytes. */
export function serializeTruncatedBarsSong2(score: Score, source: Song2Source, unitDenominator: number): string {
  const facts = factsOf(score, source);
  const alignment = align(score, facts, score.bars.length, facts.oldBarCount);
  const coverage = sourceCoverage(facts, score);
  const pieces = buildCoveredPieces(score, facts, alignment, score.bars.length, unitDenominator, coverage);
  const units = buildUnits(pieces, score.bars.length);
  const sections = sectionStarts(score);
  const body: string[] = [];
  let groupFrom = 0;
  let groupSize = 0;
  const flush = (to: number): void => {
    if (groupSize === 0) return;
    body.push(...writeTruncatedGroup(score, facts, groupFrom, to, pieces, sections, coverage, alignment));
    groupSize = 0;
  };
  for (const unit of units) {
    const length = unit.end - unit.from;
    if (groupSize > 0) {
      const bar = score.bars[unit.from] as Bar;
      const previous = score.bars[unit.from - 1] as Bar;
      const meterChanged =
        bar.meter.numerator !== previous.meter.numerator || bar.meter.denominator !== previous.meter.denominator;
      if (meterChanged || keyFieldAt(score, pieces, unit.from) || sections.has(unit.from) || groupSize + length > 4) {
        flush(unit.from - 1);
        groupFrom = unit.from;
      }
    }
    if (groupSize === 0) groupFrom = unit.from;
    groupSize += length;
  }
  flush(score.bars.length - 1);

  let lastMusicLine = facts.keyIndex;
  for (const line of facts.musicLines) lastMusicLine = Math.max(lastMusicLine, line.line);
  const lines = [...facts.lines.slice(0, facts.keyIndex + 1), ...body, ...facts.lines.slice(lastMusicLine + 1)];
  return lines.join("\n");
}

function writeFinalGroup(
  score: Score,
  facts: SourceFacts,
  newStart: number,
  sections: Map<number, string[]>,
): string[] {
  const oldStart = facts.oldFinalGroupStart;
  const lines: string[] = [];
  for (const name of sections.get(newStart) ?? []) lines.push(`% ${name}`);
  const bar = score.bars[newStart] as Bar;
  const meterBefore = newStart === 0 ? facts.headerMeter : (score.bars[newStart - 1] as Bar).meter;
  const meterField = bar.meter.numerator !== meterBefore.numerator || bar.meter.denominator !== meterBefore.denominator;
  const entries = keyEntriesAt(score, bar.start);
  const bodyEntries = entries.length - (newStart === 0 ? 1 : 0);
  const finalLines = finalSourceLines(facts, oldStart);
  let lastLine = facts.keyIndex;
  for (const line of finalLines) {
    lines.push(`V: ${line.voice}`);
    const firstBar = line.segments[0]?.bars[0];
    const inline = (firstBar?.inlineKeys ?? []).some((change) => change.at === (firstBar?.content.start ?? -1));
    if (meterField) lines.push(`M:${bar.meter.numerator}/${bar.meter.denominator}`);
    if (bodyEntries > (inline ? 1 : 0)) lines.push(`K:${bar.key}`);
    lines.push(facts.lines[line.line] as string);
    lastLine = Math.max(lastLine, line.line);
  }
  for (const line of facts.lines.slice(lastLine + 1)) lines.push(line);
  return lines;
}

function finalSourceLines(facts: SourceFacts, oldStart: number): Song2SourceLine[] {
  const seen = new Set<string>();
  const result: Song2SourceLine[] = [];
  for (const line of facts.musicLines) {
    const first = line.segments[0]?.bars[0]?.bar;
    if (first !== oldStart || seen.has(line.voice)) continue;
    seen.add(line.voice);
    result.push(line);
  }
  return result;
}

// ABOUTME: Writes a song2 score whose bar grid changed: unchanged bars keep their read bytes, new bars come from the model.
// ABOUTME: One piece/group pipeline serves both a complete score and one that still carries a cut.
import type { Bar, Meter, Score } from "@neta-art/score-editor";
import { type BarContent, barContentOf, type Song2Source, type Song2SourceBar, type Song2SourceLine } from "./parser";
import { stripTrailingWhitespace, trimWhitespace } from "./text";
import { keepsCutTail } from "./write-chords";
import { sameContent, writeBar } from "./writer";

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
  readonly oldBarCount: number;
  readonly keyIndex: number;
  readonly headerMeter: Meter;
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
  readonly inlineAtStart: boolean;
}

interface Unit {
  readonly from: number;
  readonly end: number;
}

interface Group {
  readonly from: number;
  readonly to: number;
}

function keyOf(voice: string, bar: number): string {
  return `${voice}:${bar}`;
}

function parseMeter(text: string): Meter {
  const match = /^M:([1-9][0-9]{0,5})\/([1-9][0-9]{0,5})$/.exec(stripTrailingWhitespace(text));
  if (match === null) throw new Error("song2: the header meter cannot be read back");
  return { numerator: Number(match[1]), denominator: Number(match[2]) };
}

function factsOf(score: Score, source: Song2Source): SourceFacts {
  const lines = source.text.split("\n");
  const byVoiceBar = new Map<string, SourceBar>();
  let oldBarCount = 0;
  for (const line of source.musicLines) {
    for (const segment of line.segments) {
      for (const record of segment.bars) {
        byVoiceBar.set(keyOf(record.voice, record.bar), {
          record,
          segmentStart: (segment.bars[0] as Song2SourceBar).bar,
          segmentLength: segment.bars.length,
          segmentRaw: segment.raw,
        });
        if (record.bar + 1 > oldBarCount) oldBarCount = record.bar + 1;
      }
    }
  }
  const keyIndex = 6 + (score.voices.includes("Ins") ? 1 : 0);
  return {
    lines,
    musicLines: source.musicLines,
    byVoiceBar,
    oldBarCount,
    keyIndex,
    headerMeter: parseMeter(lines[2] ?? "M:4/4"),
    trailingNewline: endsWithBlankLine(source.text),
  };
}

function endsWithBlankLine(text: string): boolean {
  const lineStart = text.lastIndexOf("\n") + 1;
  return lineStart > 0 && stripTrailingWhitespace(text.slice(lineStart)) === "";
}

function normalizeContent(content: BarContent): BarContent {
  return {
    ...content,
    start: 0,
    notes: content.notes.map((note) => ({ ...note, start: note.start - content.start })),
    chords: content.chords.map((chord) => ({ ...chord, start: chord.start - content.start })),
    keyChanges: content.keyChanges.map((change) => ({ ...change, at: change.at - content.start })),
  };
}

function contentMatches(score: Score, facts: SourceFacts, voice: string, oldIndex: number, newIndex: number): boolean {
  const sourceBar = facts.byVoiceBar.get(keyOf(voice, oldIndex));
  if (sourceBar === undefined) return false;
  return sameContent(
    normalizeContent(sourceBar.record.content),
    normalizeContent(barContentOf(score, voice, newIndex)),
  );
}

function sameAt(score: Score, newIndex: number, oldIndex: number, facts: SourceFacts): boolean {
  let found = false;
  for (const voice of score.voices) {
    if (!facts.byVoiceBar.has(keyOf(voice, oldIndex))) continue;
    found = true;
    if (!contentMatches(score, facts, voice, oldIndex, newIndex)) return false;
  }
  return found;
}

/** Matches the unchanged head and tail by content and absolute start; the middle is the edit. */
function align(score: Score, facts: SourceFacts, newEnd: number, oldEnd: number): Alignment {
  let prefix = 0;
  while (prefix < newEnd && prefix < oldEnd && sameAt(score, prefix, prefix, facts)) prefix += 1;

  const newLast = newEnd - 1;
  const oldLast = oldEnd - 1;
  const sourceContentAt = (index: number) => {
    for (const voice of score.voices) {
      const sourceBar = facts.byVoiceBar.get(keyOf(voice, index));
      if (sourceBar !== undefined) return sourceBar.record.content;
    }
    return undefined;
  };
  let suffix = 0;
  const oldBar = oldLast >= 0 ? sourceContentAt(oldLast) : undefined;
  if (newLast >= prefix && oldBar !== undefined) {
    const delta = (score.bars[newLast] as Bar).start - oldBar.start;
    while (suffix < newEnd - prefix && suffix < oldEnd) {
      const newIndex = newLast - suffix;
      const oldIndex = oldLast - suffix;
      if (!sameAt(score, newIndex, oldIndex, facts)) break;
      const sourceStart = sourceContentAt(oldIndex)?.start;
      if (sourceStart === undefined || (score.bars[newIndex] as Bar).start - sourceStart !== delta) break;
      suffix += 1;
    }
  }

  const cappedPrefix = Math.min(prefix, newEnd - suffix);
  const oldAt: (number | undefined)[] = new Array(newEnd).fill(undefined);
  for (let index = 0; index < cappedPrefix; index += 1) oldAt[index] = index;
  for (let index = 0; index < suffix; index += 1) oldAt[newLast - index] = oldLast - index;

  // A move keeps the bar count. Map a moved segment by its relative content, so its bytes move with it.
  if (newEnd === oldEnd) {
    const used = new Set<number>();
    for (const oldIndex of oldAt) if (oldIndex !== undefined) used.add(oldIndex);
    const candidates: { start: number; count: number; voice: string }[] = [];
    const seen = new Set<string>();
    for (const line of facts.musicLines) {
      for (const segment of line.segments) {
        const first = segment.bars[0]?.bar;
        const count = segment.bars.length;
        if (first === undefined || count === 0) continue;
        const key = `${line.voice}:${first}:${count}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ start: first, count, voice: line.voice });
      }
    }
    candidates.sort((left, right) => left.start - right.start || right.count - left.count);
    const gapEnd = newEnd - suffix;
    for (let index = cappedPrefix; index < gapEnd; index += 1) {
      if (oldAt[index] !== undefined) continue;
      for (const candidate of candidates) {
        if (index + candidate.count > gapEnd || candidate.start + candidate.count > oldEnd) continue;
        if (
          score.sections.some(
            (section) =>
              section.name !== null && section.firstBar > index && section.firstBar < index + candidate.count,
          )
        ) {
          continue;
        }
        let free = true;
        for (let offset = 0; offset < candidate.count; offset += 1) {
          if (oldAt[index + offset] !== undefined || used.has(candidate.start + offset)) free = false;
        }
        if (!free) continue;
        let matches = true;
        for (let offset = 0; offset < candidate.count; offset += 1) {
          if (!contentMatches(score, facts, candidate.voice, candidate.start + offset, index + offset)) {
            matches = false;
          }
        }
        if (!matches) continue;
        for (let offset = 0; offset < candidate.count; offset += 1) {
          oldAt[index + offset] = candidate.start + offset;
          used.add(candidate.start + offset);
        }
        break;
      }
    }
  }

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
    if (!contentMatches(score, facts, voice, oldIndex + offset, newIndex + offset)) return false;
  }
  return true;
}

function coverageAll(score: Score, barCount: number): Map<string, Set<number>> {
  const coverage = new Map<string, Set<number>>();
  for (const voice of score.voices) {
    coverage.set(voice, new Set(Array.from({ length: barCount }, (_item, index) => index)));
  }
  return coverage;
}

/**
 * The bars each voice still writes. A voice stops at its last note; the cut voice also keeps its
 * partial bar, even when the cut happened before any finished token.
 */
function modelCoverage(score: Score): Map<string, Set<number>> {
  const coverage = new Map<string, Set<number>>();
  for (const voice of score.voices) {
    const bars = new Set<number>();
    for (const note of score.notes) if (note.voice === voice) bars.add(note.bar);
    const cut = score.truncation;
    if (cut !== null && cut.voice === voice && cut.short && cut.bar < score.bars.length) bars.add(cut.bar);
    coverage.set(voice, bars);
  }
  return coverage;
}

function coveredAt(coverage: Map<string, Set<number>>, voice: string, index: number): boolean {
  return coverage.get(voice)?.has(index) ?? false;
}

function cutTailAt(score: Score, facts: SourceFacts, voice: string, index: number): string {
  if (score.truncation === null || score.truncation.voice !== voice || score.truncation.bar !== index) return "";
  for (const line of facts.musicLines) {
    if (line.voice !== voice || line.cutTail === null) continue;
    const voiceNotes = score.notes
      .filter((note) => note.voice === voice)
      .sort((left, right) => left.start - right.start);
    return keepsCutTail(score, line.cutTail, voiceNotes[voiceNotes.length - 1]?.tie === true) ? line.cutTail.raw : "";
  }
  return "";
}

/** The raw text for a run of a source segment, or null when the run cannot keep its bytes. */
function reusedText(sourceBar: SourceBar, old: number, count: number): string | null {
  const offset = old - sourceBar.segmentStart;
  if (offset < 0 || offset + count > sourceBar.segmentLength) return null;
  const whole = /^Z([234]?)$/.exec(sourceBar.segmentRaw.trim());
  if (whole !== null && sourceBar.segmentLength === (whole[1] === undefined ? 1 : Number(whole[1]))) {
    return count === 1 ? "Z" : `Z${count}`;
  }
  const bodies = sourceBar.segmentRaw.split("|");
  if (bodies.length !== sourceBar.segmentLength) return null;
  return bodies.slice(offset, offset + count).join("|");
}

function buildPieces(
  score: Score,
  facts: SourceFacts,
  alignment: Alignment,
  newEnd: number,
  coverage: Map<string, Set<number>>,
  unitDenominator: number,
): Map<string, Map<number, Piece>> {
  const byVoice = new Map<string, Map<number, Piece>>();
  for (const voice of score.voices) {
    const pieces = new Map<number, Piece>();
    let index = 0;
    while (index < newEnd) {
      if (!coveredAt(coverage, voice, index)) {
        index += 1;
        continue;
      }
      const old = alignment.oldAt[index];
      if (old !== undefined) {
        const sourceBar = facts.byVoiceBar.get(keyOf(voice, old));
        if (sourceBar !== undefined) {
          const segmentStart = sourceBar.segmentStart;
          const segmentEnd = segmentStart + sourceBar.segmentLength;
          if (old >= segmentStart && old < segmentEnd) {
            const nextSection = score.sections.find(
              (section) => section.name !== null && section.firstBar > index && section.firstBar < segmentEnd,
            )?.firstBar;
            const available = segmentEnd - old;
            const sectionLimit = nextSection === undefined ? available : nextSection - index;
            const count = Math.min(available, sectionLimit, newEnd - index);
            let usable = count > 0;
            for (let offset = 0; usable && offset < count; offset += 1) {
              if (!coveredAt(coverage, voice, index + offset)) usable = false;
            }
            if (usable && segmentMatches(score, facts, voice, old, count, index)) {
              const text = reusedText(sourceBar, old, count);
              if (text !== null) {
                const startBar = facts.byVoiceBar.get(keyOf(voice, old));
                pieces.set(index, {
                  text,
                  count,
                  inlineAtStart:
                    startBar?.record.inlineKeys.some((change) => change.at === startBar.record.content.start) ?? false,
                });
                index += count;
                continue;
              }
            }
          }
        }
      }
      pieces.set(index, {
        text: `${writeBar(
          score,
          { voice, bar: index, content: barContentOf(score, voice, index), inlineKeys: [] },
          unitDenominator,
        )}${cutTailAt(score, facts, voice, index)}`,
        count: 1,
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
  const bodyEntries = keyEntriesAt(score, bar.start).length - (from === 0 ? 1 : 0);
  return bodyEntries > (rawInlineAt(pieces, score.voices, from) ? 1 : 0);
}

function writeGroup(
  score: Score,
  facts: SourceFacts,
  group: Group,
  pieces: Map<string, Map<number, Piece>>,
  sections: Map<number, string[]>,
  coverage: Map<string, Set<number>>,
  lastGroup: boolean,
  allowCutAtNext: boolean,
): string[] {
  const lines: string[] = [];
  for (const name of sections.get(group.from) ?? []) lines.push(`% ${name}`);
  const bar = score.bars[group.from] as Bar;
  const meterBefore = group.from === 0 ? facts.headerMeter : (score.bars[group.from - 1] as Bar).meter;
  const meterField = bar.meter.numerator !== meterBefore.numerator || bar.meter.denominator !== meterBefore.denominator;
  for (const voice of score.voices) {
    const voicePieces: string[] = [];
    let lastCovered = -1;
    for (let index = group.from; index <= group.to; index += 1) {
      if (!coveredAt(coverage, voice, index)) continue;
      const piece = pieces.get(voice)?.get(index);
      if (piece === undefined) throw new Error(`song2: bar ${index} of ${voice} has no piece`);
      voicePieces.push(piece.text);
      lastCovered = index + piece.count - 1;
      index += piece.count - 1;
    }
    if (voicePieces.length === 0) continue;
    lines.push(`V: ${voice}`);
    if (meterField) lines.push(`M:${bar.meter.numerator}/${bar.meter.denominator}`);
    if (keyFieldAt(score, pieces, group.from)) lines.push(`K:${bar.key}`);
    const lastBar = score.bars[lastCovered] as Bar;
    const incomplete =
      (lastBar.incomplete ||
        (score.truncation?.voice === voice && score.truncation.short && lastCovered === score.truncation.bar)) ??
      false;
    // RULES.md X10/X9: a cut at the next measure is written without the closing barline, so it reads
    // as the same cut instead of a complete score.
    const cutAtNext =
      allowCutAtNext &&
      lastGroup &&
      score.truncation !== null &&
      score.truncation.voice === voice &&
      lastCovered + 1 === score.truncation.bar;
    lines.push(`${voicePieces.join("|")}${incomplete || cutAtNext ? "" : "|"}`);
  }
  return lines;
}

function voicesAt(index: number, voices: ReadonlyArray<string>, coverage: Map<string, Set<number>>): string {
  return voices.filter((voice) => coverage.get(voice)?.has(index) ?? false).join(",");
}

function splitAtCoverage(
  units: ReadonlyArray<Unit>,
  coverage: Map<string, Set<number>>,
  voices: ReadonlyArray<string>,
): Unit[] {
  const key = (index: number): string => voicesAt(index, voices, coverage);
  const split: Unit[] = [];
  for (const unit of units) {
    let from = unit.from;
    let current = key(from);
    for (let index = from + 1; index < unit.end; index += 1) {
      const next = key(index);
      if (next === current) continue;
      split.push({ from, end: index });
      from = index;
      current = next;
    }
    split.push({ from, end: unit.end });
  }
  return split;
}

function groupsOf(
  units: ReadonlyArray<Unit>,
  score: Score,
  pieces: Map<string, Map<number, Piece>>,
  sections: Map<number, string[]>,
  coverage: Map<string, Set<number>>,
  splitByCoverage: boolean,
): Group[] {
  const groups: Group[] = [];
  let from = 0;
  let size = 0;
  for (const unit of units) {
    const length = unit.end - unit.from;
    if (size > 0) {
      const bar = score.bars[unit.from] as Bar;
      const previous = score.bars[unit.from - 1] as Bar;
      const meterChanged =
        bar.meter.numerator !== previous.meter.numerator || bar.meter.denominator !== previous.meter.denominator;
      const voicesChanged =
        splitByCoverage && voicesAt(from, score.voices, coverage) !== voicesAt(unit.from, score.voices, coverage);
      if (
        voicesChanged ||
        meterChanged ||
        keyFieldAt(score, pieces, unit.from) ||
        sections.has(unit.from) ||
        size + length > 4
      ) {
        groups.push({ from, to: unit.from - 1 });
        size = 0;
      }
    }
    if (size === 0) from = unit.from;
    size += length;
  }
  const last = units[units.length - 1];
  if (size > 0 && last !== undefined) groups.push({ from, to: last.end - 1 });
  return groups;
}

function writeBody(
  score: Score,
  facts: SourceFacts,
  pieces: Map<string, Map<number, Piece>>,
  coverage: Map<string, Set<number>>,
  allowCutAtNext = true,
  splitByCoverage = true,
): string[] {
  const merged = buildUnits(pieces, score.bars.length);
  const units = splitByCoverage ? splitAtCoverage(merged, coverage, score.voices) : merged;
  const sections = sectionStarts(score);
  let groups = groupsOf(units, score, pieces, sections, coverage, splitByCoverage);
  const cut = score.truncation;
  if (cut !== null && cut.voice === "Ins" && cut.short && cut.bar < score.bars.length) {
    // RULES.md X9: the final Ins block starts at the cut measure; every later Vocal bar is written
    // before that block, so one final group carries the cut and the bars after it.
    const before: Group[] = [];
    for (const group of groups) {
      if (group.to < cut.bar) before.push(group);
      else if (group.from < cut.bar) before.push({ from: group.from, to: cut.bar - 1 });
    }
    groups = [...before, { from: cut.bar, to: score.bars.length - 1 }];
  }
  const body: string[] = [];
  for (const [index, group] of groups.entries()) {
    body.push(
      ...writeGroup(score, facts, group, pieces, sections, coverage, index === groups.length - 1, allowCutAtNext),
    );
  }
  return body;
}

/** Writes a complete score whose bars moved: unchanged pieces keep their bytes. */
export function serializeBarsSong2(score: Score, source: Song2Source): string {
  const facts = factsOf(score, source);
  const alignment = align(score, facts, score.bars.length, facts.oldBarCount);
  const coverage = coverageAll(score, score.bars.length);
  const pieces = buildPieces(score, facts, alignment, score.bars.length, coverage, source.unitDenominator);
  const lines = [...facts.lines.slice(0, facts.keyIndex + 1), ...writeBody(score, facts, pieces, coverage)];
  return `${lines.join("\n")}${facts.trailingNewline ? "\n" : ""}`;
}

/** Writes a cut score after a structural edit: every bar comes from the model, and unchanged pieces keep their bytes. */
export function serializeTruncatedBarsSong2(score: Score, source: Song2Source): string {
  const facts = factsOf(score, source);
  const alignment = align(score, facts, score.bars.length, facts.oldBarCount);
  const coverage = modelCoverage(score);
  const pieces = buildPieces(score, facts, alignment, score.bars.length, coverage, source.unitDenominator);
  let lastMusicLine = facts.keyIndex;
  for (const line of facts.musicLines) lastMusicLine = Math.max(lastMusicLine, line.line);
  // RULES.md X8: when the empty partial measure is dropped, its block opening still states the cut.
  const cutBlock: string[] = [];
  const cut = score.truncation;
  const lastSource = facts.musicLines.find((line) => line.line === lastMusicLine);
  const lastSourceBar = lastSource?.segments[lastSource.segments.length - 1]?.bars.at(-1)?.bar;
  const sourceLastKept = lastSourceBar !== undefined && alignment.oldAt.includes(lastSourceBar);
  const droppedCutBlock =
    cut !== null &&
    !cut.short &&
    cut.bar === score.bars.length &&
    lastSource !== undefined &&
    lastSource.voice === cut.voice &&
    cut.voice !== "Ins" &&
    lastSourceBar !== undefined &&
    lastSourceBar >= score.bars.length &&
    !sourceLastKept;
  if (droppedCutBlock && lastSource !== undefined) {
    cutBlock.push(...facts.lines.slice(lastSource.blockStart, lastMusicLine));
  }
  const trailing = facts.lines.slice(lastMusicLine + 1).some((line) => trimWhitespace(line) !== "");
  const splitByCoverage = cut === null || cut.voice !== "Ins" || !cut.short || trailing;
  const body = writeBody(score, facts, pieces, coverage, cutBlock.length === 0, splitByCoverage);
  const lines = [
    ...facts.lines.slice(0, facts.keyIndex + 1),
    ...body,
    ...cutBlock,
    ...facts.lines.slice(lastMusicLine + 1),
  ];
  return lines.join("\n");
}

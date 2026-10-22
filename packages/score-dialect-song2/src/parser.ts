// ABOUTME: The song2 reader. It turns a score text into the shared score model by following RULES.md directly, never throwing.
// ABOUTME: Cuts are accepted only at the end of the text; the original normalized text is kept for a byte-for-byte write-back.
import type {
  Bar,
  Chord,
  Diagnostic,
  DiagnosticAt,
  DiagnosticParams,
  KeyChange,
  Meter,
  Note,
  Score,
  Section,
  Tempo,
  Truncation,
} from "@neta-art/score-editor";

// The core's tick unit. The dialect depends on the core for types only, so it restates this one number.
const TICKS_PER_QUARTER = 256;

const VOCAL_HEADER = 'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"';
const INS_HEADER = 'V: Ins clef=treble name="Ins Melody" snm="Inst."';
const VOCAL_OPEN = "V: Vocal";
const INS_OPEN = "V: Ins";

export const MAJOR_KEYS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
export const MINOR_KEYS = [
  "Abm",
  "Ebm",
  "Bbm",
  "Fm",
  "Cm",
  "Gm",
  "Dm",
  "Am",
  "Em",
  "Bm",
  "F#m",
  "C#m",
  "G#m",
  "D#m",
  "A#m",
];
export const KEY_FIFTHS = new Map<string, number>();
for (const [index, key] of MAJOR_KEYS.entries()) KEY_FIFTHS.set(key, index - 7);
for (const [index, key] of MINOR_KEYS.entries()) KEY_FIFTHS.set(key, index - 7);

export type Letter = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export const LETTER_SEMITONES: Record<Letter, number> = { A: 9, B: 11, C: 0, D: 2, E: 4, F: 5, G: 7 };
const SHARP_ORDER: ReadonlyArray<Letter> = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER: ReadonlyArray<Letter> = ["B", "E", "A", "D", "G", "C", "F"];
const DURATIONS: ReadonlyArray<number> = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48];
// RULES.md C2, in the order the format lists them.
const QUALITIES = [
  "",
  "m",
  "dim",
  "aug",
  "7",
  "maj7",
  "m7",
  "dim7",
  "m7b5",
  "sus4",
  "sus2",
  "6",
  "m6",
  "7sus4",
  "m(maj7)",
];
const ROOT_SOURCE = ["A", "B", "C", "D", "E", "F", "G"];
const ROOT_SUFFIXES = ["bb", "b", "", "#", "##"];
const CHORD_ROOTS = ROOT_SOURCE.flatMap((letter) => ROOT_SUFFIXES.map((suffix) => `${letter}${suffix}`));

type AccidentalState = Partial<Record<Letter, number>>;

export interface Signature {
  readonly key: string;
  readonly values: Partial<Record<Letter, number>>;
}

interface MeasureRecord {
  readonly bar: number;
  readonly start: number;
  readonly length: number;
  readonly meter: Meter;
  readonly key: string;
}

interface PartialMeasure {
  readonly bar: number;
  readonly start: number;
  readonly length: number;
  readonly meter: Meter;
  readonly key: string;
}

interface InternalChord {
  name: string;
  start: number;
  noteId: string | null;
}

interface PendingTie {
  readonly pitch: number;
  readonly written: number;
}

interface VoiceState {
  readonly name: string;
  meter: Meter;
  key: string;
  signature: Partial<Record<Letter, number>>;
  timeline: KeyChange[];
  inlineKeys: Song2SourceKey[];
  measures: MeasureRecord[];
  partial: PartialMeasure | null;
  notes: Note[];
  chords: InternalChord[];
  pendingTie: PendingTie | null;
  accidental: AccidentalState;
  measureStart: number;
}

interface GroupCounts {
  readonly vocal: number;
  readonly ins: number;
  readonly insPartial: boolean;
  /** Absolute measure index in Ins where this group starts. */
  readonly insStart: number;
}

interface PlannedSection {
  readonly name: string | null;
  readonly firstBar: number;
}

class ParseFailure extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super("song2 reading stopped");
  }
}

class MeasureCut extends Error {
  constructor(
    readonly offset: number,
    readonly reason: "tie" | "unfinished" = "unfinished",
    readonly raw = "",
  ) {
    super("cut");
  }
}

export interface Song2ParseResult {
  readonly score: Score | null;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

/** What one bar of one voice held when it was read. The writer compares this to the model bar. */
export interface BarContent {
  readonly start: number;
  readonly length: number;
  readonly meter: string;
  readonly key: string;
  readonly keyChanges: ReadonlyArray<KeyChange>;
  readonly notes: ReadonlyArray<{
    readonly start: number;
    readonly duration: number;
    readonly midi: number | null;
    readonly tie: boolean;
  }>;
  readonly chords: ReadonlyArray<{ readonly start: number; readonly name: string }>;
  readonly incomplete: boolean;
}

/** A `[K:...]` token and its place in the score's shared key timeline, so a later write finds its new key. */
export interface Song2SourceKey extends KeyChange {
  readonly timelineIndex: number;
}

export interface Song2SourceBar {
  readonly voice: string;
  readonly bar: number;
  readonly content: BarContent;
  /** The `[K:...]` tokens read in this bar, including one at its first instant. */
  readonly inlineKeys: ReadonlyArray<Song2SourceKey>;
}

/** One piece between barlines. A `Z2`-`Z4` piece expands to more than one bar. */
export interface Song2SourceSegment {
  readonly raw: string;
  readonly bars: ReadonlyArray<Song2SourceBar>;
}

/** The unfinished bytes at the end of a cut measure and the X rule that kept them. */
export interface Song2CutTail {
  readonly kind: "x4" | "x5";
  readonly raw: string;
}

export interface Song2SourceLine {
  /** 0-based line index in the normalized text. */
  readonly line: number;
  readonly voice: string;
  readonly endsWithBarline: boolean;
  readonly segments: ReadonlyArray<Song2SourceSegment>;
  /** X5: the reader dropped a final tie continuation whose pitch did not match. */
  readonly unfinishedTie: boolean;
  /** The unfinished remainder of this line's partial measure, if it has one. */
  readonly cutTail: Song2CutTail | null;
}

/** A `K:` field line at the start of a block, and the timeline entry it states, so a later write finds its new key. */
export interface Song2SourceKeyField {
  /** 0-based line index in the normalized text. */
  readonly line: number;
  readonly timelineIndex: number;
}

export interface Song2Source {
  /** The text with CRLF and lone CR already turned into LF. */
  readonly text: string;
  /** The denominator of the `L:1/d` line, so a duration can be written in the format's units. */
  readonly unitDenominator: number;
  readonly musicLines: ReadonlyArray<Song2SourceLine>;
  /** The block `K:` field lines the reader applied, in text order. A trailing cut field is not here. */
  readonly keyFields: ReadonlyArray<Song2SourceKeyField>;
}

interface PendingBar {
  readonly voice: string;
  readonly bar: number;
}

interface PendingSegment {
  readonly raw: string;
  readonly bars: ReadonlyArray<PendingBar>;
}

interface PendingLine {
  readonly line: number;
  readonly voice: string;
  readonly endsWithBarline: boolean;
  readonly segments: ReadonlyArray<PendingSegment>;
  /** X5: the last token is a tie continuation that the reader dropped as unfinished. */
  unfinishedTie: boolean;
  /** X4 or X5: the unfinished bytes that end this line's partial measure. */
  cutTail: Song2CutTail | null;
}

type BarContentSource = Pick<Score, "bars" | "notes" | "chords">;

/** The content the writer compares: everything a rewritten bar must reproduce. */
export function barContentOf(score: BarContentSource, voice: string, barIndex: number): BarContent {
  const bar = score.bars[barIndex];
  if (bar === undefined) throw new Error(`song2: bar ${barIndex} of ${voice} has no model record`);
  const start = bar.start;
  const end = start + bar.length;
  return {
    start,
    length: bar.length,
    meter: `${bar.meter.numerator}/${bar.meter.denominator}`,
    key: bar.key,
    keyChanges: bar.keyChanges.map((change) => ({ at: change.at, key: change.key })),
    notes: score.notes
      .filter((note) => note.voice === voice && note.bar === barIndex)
      .sort((a, b) => a.start - b.start)
      .map((note) => ({ start: note.start, duration: note.duration, midi: note.midi, tie: note.tie })),
    chords:
      voice === "Vocal"
        ? score.chords
            .filter((chord) => chord.start >= start && chord.start < end)
            .map((chord) => ({ start: chord.start, name: chord.name }))
        : [],
    incomplete: bar.incomplete,
  };
}

// RULES.md H9 and P3: a key is its count of fifths, which gives the alteration of each letter.
export function signatureOf(key: string): Signature {
  const fifths = KEY_FIFTHS.get(key) ?? 0;
  const values: Partial<Record<Letter, number>> = {};
  if (fifths > 0) {
    for (const letter of SHARP_ORDER.slice(0, fifths)) values[letter] = 1;
  } else {
    for (const letter of FLAT_ORDER.slice(0, -fifths)) values[letter] = -1;
  }
  return { key, values };
}

function meterOf(numerator: number, denominator: number): Meter {
  return { numerator, denominator };
}

function meterText(meter: Meter): string {
  return `${meter.numerator}/${meter.denominator}`;
}

function measureTicks(meter: Meter): number {
  return (4 * meter.numerator * TICKS_PER_QUARTER) / meter.denominator;
}

function isPowerOfTwoAtMost(value: number, max: number): boolean {
  return value >= 1 && value <= max && (value & (value - 1)) === 0;
}

function isKey(key: string): boolean {
  return KEY_FIFTHS.has(key);
}

function isLetter(char: string | undefined): char is Letter {
  return char !== undefined && "ABCDEFG".includes(char);
}

function isLowerLetter(char: string | undefined): boolean {
  return char !== undefined && "abcdefg".includes(char);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function isSpace(char: string | undefined): boolean {
  return char === " " || char === "\t";
}

function trimBody(body: string): string {
  return body.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

// RULES.md M4: only Z, Z2, Z3 and Z4 are whole-measure rests.
function wholeRestCount(body: string): number | null {
  if (body === "Z") return 1;
  if (body.length === 2 && body[0] === "Z" && body[1] !== undefined && "234".includes(body[1])) {
    return Number(body[1]);
  }
  return null;
}

function rootPattern(): string {
  return "([A-G](?:bb|b|##|#)?)";
}

const CHORD_PATTERN = new RegExp(
  `^${rootPattern()}(?:${[...QUALITIES]
    .sort((a, b) => b.length - a.length)
    .filter(Boolean)
    .map(escapeRegExp)
    .join("|")})?(?:/${rootPattern()})?$`,
);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// RULES.md C1-C4: a root, exactly one quality from the table, and an optional slash bass.
function isChordName(name: string): boolean {
  return CHORD_PATTERN.test(name);
}

function fail(code: Diagnostic["code"], params: DiagnosticParams, at: DiagnosticAt): never {
  throw new ParseFailure({ code, params, at });
}

class Song2Parser {
  private readonly lines: string[];
  private readonly normalized: string;
  private index = 0;
  private hasIns = false;
  private unitDenominator = 16;
  private initialMeter: Meter = meterOf(4, 4);
  private initialKey = "C";
  private tempo: Tempo = { unit: "1/4", bpm: 120 };
  private vocal: VoiceState;
  private ins: VoiceState | null = null;
  private readonly groups: GroupCounts[] = [];
  private readonly plannedSections: PlannedSection[] = [];
  private readonly keyFields: Song2SourceKeyField[] = [];
  private musicLines = 0;
  private readonly sourceLines: PendingLine[] = [];
  private lastCutReason: "tie" | "unfinished" = "unfinished";
  private cutTail: Song2CutTail | null = null;
  private hasChords = false;
  private truncation: Truncation | null = null;

  constructor(normalized: string) {
    this.normalized = normalized;
    // RULES.md T2 strips trailing space and tab; T3 removes blank lines at the end only.
    const stripped = normalized.split("\n").map((line) => line.replace(/[ \t]+$/, ""));
    // RULES.md T3: a final LF is not a score line; trailing blank lines are not a cut.
    while (stripped.length > 0 && stripped[stripped.length - 1] === "") stripped.pop();
    this.lines = stripped;
    this.vocal = this.makeVoice("Vocal");
  }

  parse(): Score {
    this.readHeader();
    this.vocal = this.makeVoice("Vocal");
    this.ins = this.hasIns ? this.makeVoice("Ins") : null;
    this.readBody();
    if (this.musicLines === 0) this.failNoMusic();
    this.checkVoices();
    return this.buildScore();
  }

  private makeVoice(name: string): VoiceState {
    return {
      name,
      meter: this.initialMeter,
      key: this.initialKey,
      signature: signatureOf(this.initialKey).values,
      timeline: [{ at: 0, key: this.initialKey }],
      inlineKeys: [],
      measures: [],
      partial: null,
      notes: [],
      chords: [],
      pendingTie: null,
      accidental: {},
      measureStart: 0,
    };
  }

  private failNoMusic(): never {
    fail("bar-count", { reason: "no-music" }, { line: 1 });
  }

  // RULES.md H1-H10: the header is fixed, in order, and its last line is the key line.
  // --- header ------------------------------------------------------------------------------------

  private readHeader(): void {
    this.expectHeaderLine(0, "X:1", "X");
    this.expectHeaderLine(1, "T:", "T");

    const meterLine = this.lines[2];
    if (meterLine === undefined) this.failHeader("M", 3);
    const meterMatch = /^M:([1-9][0-9]{0,5})\/([1-9][0-9]{0,5})$/.exec(meterLine);
    if (!meterMatch) this.failHeader("M", 3, meterLine);
    const numerator = Number(meterMatch[1]);
    const denominator = Number(meterMatch[2]);
    if (!isPowerOfTwoAtMost(denominator, 1024)) this.failHeader("M", 3, meterLine);
    this.initialMeter = meterOf(numerator, denominator);

    const unitLine = this.lines[3];
    if (unitLine === undefined) this.failHeader("L", 4);
    const unitMatch = /^L:1\/([1-9][0-9]{0,5})$/.exec(unitLine);
    if (!unitMatch) this.failHeader("L", 4, unitLine);
    const unit = Number(unitMatch[1]);
    if (!isPowerOfTwoAtMost(unit, 1024)) this.failHeader("L", 4, unitLine);
    this.unitDenominator = unit;

    const tempoLine = this.lines[4];
    if (tempoLine === undefined) this.failHeader("Q", 5);
    const tempoMatch = /^Q:1\/4=([1-9][0-9]*)$/.exec(tempoLine);
    if (!tempoMatch) this.failHeader("Q", 5, tempoLine);
    this.tempo = { unit: "1/4", bpm: Number(tempoMatch[1]) };

    this.expectHeaderLine(5, VOCAL_HEADER, "V");

    let next = 6;
    const possibleIns = this.lines[next];
    if (possibleIns?.startsWith("V:")) {
      if (possibleIns !== INS_HEADER) this.failHeader("V", next + 1, possibleIns);
      this.hasIns = true;
      next += 1;
    }
    this.expectHeaderLine(next, null, "K");
    const keyLine = this.lines[next] as string;
    if (!keyLine.startsWith("K:")) this.failHeader("K", next + 1, keyLine);
    const key = keyLine.slice(2);
    if (!isKey(key)) this.failHeader("K", next + 1, key, key);
    this.initialKey = key;
    this.index = next + 1;
  }

  private expectHeaderLine(at: number, expected: string | null, field: string): void {
    const line = this.lines[at];
    if (line === undefined) this.failHeader(field, at + 1);
    if (expected !== null && line !== expected) this.failHeader(field, at + 1, line);
  }

  private failHeader(field: string, line: number, value?: string, reason?: string): never {
    const params: Record<string, string> = { field, reason: reason ?? "wrong" };
    if (value !== undefined) params.value = value;
    fail("header", params, { line });
  }

  // --- body --------------------------------------------------------------------------------------

  // RULES.md B1-B8, S1-S3 and X11-X12: groups, section markers at group boundaries, and cuts at the end.
  private readBody(): void {
    while (true) {
      let commentsSeen = false;
      while (this.index < this.lines.length) {
        const line = this.lines[this.index] as string;
        if (line === "") fail("empty-line", { expected: VOCAL_OPEN }, { line: this.index + 1 });
        if (line.startsWith("% ")) {
          this.addSection(line.slice(2));
          commentsSeen = true;
          this.index += 1;
          continue;
        }
        if (line === "%") {
          if (this.index === this.lines.length - 1) {
            if (this.musicLines === 0) this.failNoMusic();
            this.cutAt("Vocal", this.vocal.measures.length, false);
            this.index = this.lines.length;
            return;
          }
          fail("comment-position", { expected: VOCAL_OPEN }, { line: this.index + 1 });
        }
        if (line.startsWith("%") || /^[ \t]+%/.test(line)) {
          fail("comment-position", { expected: VOCAL_OPEN }, { line: this.index + 1 });
        }
        break;
      }

      if (this.index >= this.lines.length) {
        if (commentsSeen) {
          if (this.musicLines === 0) this.failNoMusic();
          this.cutAt("Vocal", this.vocal.measures.length, false);
        }
        return;
      }

      const vocalStart = this.vocal.measures.length;
      if (!this.readVoiceBlock(this.vocal)) {
        this.groups.push({
          vocal: this.vocal.measures.length - vocalStart,
          ins: 0,
          insPartial: false,
          insStart: this.ins?.measures.length ?? 0,
        });
        return;
      }
      const vocalCount = this.vocal.measures.length - vocalStart;

      if (!this.hasIns || this.ins === null) {
        this.groups.push({ vocal: vocalCount, ins: 0, insPartial: false, insStart: 0 });
        continue;
      }

      const insStart = this.ins.measures.length;
      if (this.index >= this.lines.length) {
        this.groups.push({ vocal: vocalCount, ins: 0, insPartial: false, insStart });
        this.cutAt("Ins", this.ins.measures.length, false);
        return;
      }

      if (!this.readVoiceBlock(this.ins)) {
        this.groups.push({
          vocal: vocalCount,
          ins: this.ins.measures.length - insStart,
          insPartial: this.ins.partial !== null,
          insStart,
        });
        return;
      }
      const insCount = this.ins.measures.length - insStart;
      // RULES.md X9: a short Ins block is a cut only when its music line is the last line of the text.
      if (this.index < this.lines.length && insCount !== vocalCount) {
        const bar = insCount > vocalCount ? insStart + vocalCount + 1 : insStart + insCount + 1;
        fail("bar-count", { vocal: vocalCount, ins: insCount, reason: "voices" }, { bar });
      }
      this.groups.push({
        vocal: vocalCount,
        ins: insCount,
        insPartial: false,
        insStart,
      });
    }
  }

  // RULES.md S1-S6: a marker opens a section at the next complete Vocal measure; music before it is unnamed.
  private addSection(name: string): void {
    if (this.plannedSections.length === 0 && this.vocal.measures.length > 0) {
      this.plannedSections.push({ name: null, firstBar: 0 });
    }
    this.plannedSections.push({ name, firstBar: this.vocal.measures.length });
  }

  private cutAt(voice: string, bar: number, short: boolean): void {
    this.truncation = { voice, bar, short };
  }

  /** Reads one `V:` block. Returns false when an accepted cut ended the text inside it. */
  // RULES.md B2-B4 and X6-X8: one exact V: line, optional M:/K:, then exactly one music line.
  private readVoiceBlock(voice: VoiceState): boolean {
    const opening = voice.name === "Vocal" ? VOCAL_OPEN : INS_OPEN;
    if (!this.expectOpening(opening, voice)) return false;

    let meterField = false;
    let keyField = false;
    while (this.index < this.lines.length) {
      const line = this.lines[this.index] as string;
      if (line === "") fail("empty-line", { expected: "a music line" }, { line: this.index + 1 });
      if (line === "M" || line === "K" || line.startsWith("M:") || line.startsWith("K:")) {
        if (this.index === this.lines.length - 1) {
          this.cutAt(voice.name, voice.measures.length, false);
          this.index = this.lines.length;
          return false;
        }
        if (line === "M" || line === "K") {
          fail("voice-order", { expected: "a music line" }, { line: this.index + 1 });
        }
        if (line.startsWith("M:")) {
          if (meterField) fail("header", { field: "M", reason: "repeated" }, { line: this.index + 1 });
          meterField = true;
          voice.meter = this.readMeterField(line, this.index + 1);
        } else {
          if (keyField) fail("header", { field: "K", reason: "repeated" }, { line: this.index + 1 });
          keyField = true;
          this.readKeyField(line, voice, this.index + 1);
        }
        this.index += 1;
        continue;
      }
      break;
    }

    if (this.index >= this.lines.length) {
      this.cutAt(voice.name, voice.measures.length, false);
      return false;
    }

    const line = this.lines[this.index] as string;
    if (line === "") fail("empty-line", { expected: "a music line" }, { line: this.index + 1 });
    if (line.startsWith("%")) {
      fail(
        "token",
        { reason: "unrecognized", token: line, bar: voice.measures.length + 1 },
        this.at(voice, this.index + 1),
      );
    }

    const finalLine = this.index === this.lines.length - 1;
    const outcome = this.readMusicLine(line, voice, finalLine, this.index + 1);
    this.index += 1;

    if (outcome === "partial") {
      this.cutAt(voice.name, voice.measures.length, true);
      return false;
    }
    if (outcome === "next") {
      this.cutAt(voice.name, voice.measures.length, false);
      return false;
    }
    return true;
  }

  // RULES.md B2, X7 and X8: a wrong line is voice-order; a final proper prefix of the expected V: line is a cut.
  private expectOpening(expected: string, voice: VoiceState): boolean {
    if (this.index >= this.lines.length) {
      this.cutAt(voice.name, voice.measures.length, false);
      return false;
    }
    const line = this.lines[this.index] as string;
    if (line === "") fail("empty-line", { expected }, { line: this.index + 1 });
    if (line === expected) {
      this.index += 1;
      return true;
    }
    if (line.startsWith("%") || /^[ \t]+%/.test(line)) {
      fail("comment-position", { expected }, { line: this.index + 1 });
    }
    if (this.index === this.lines.length - 1 && line.length > 0 && expected.startsWith(line)) {
      this.cutAt(voice.name, voice.measures.length, false);
      this.index = this.lines.length;
      return false;
    }
    fail("voice-order", { expected }, { line: this.index + 1 });
  }

  // RULES.md H3 and B3.
  private readMeterField(line: string, lineNumber: number): Meter {
    const match = /^M:([1-9][0-9]{0,5})\/([1-9][0-9]{0,5})$/.exec(line);
    if (!match) this.failHeader("M", lineNumber, line);
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (!isPowerOfTwoAtMost(denominator, 1024)) this.failHeader("M", lineNumber, line);
    return meterOf(numerator, denominator);
  }

  // RULES.md H8, B3 and P7: a block K: takes effect at the block's current position and clears accidentals.
  private readKeyField(line: string, voice: VoiceState, lineNumber: number): void {
    const key = line.slice(2);
    if (!isKey(key)) this.failHeader("K", lineNumber, line, key);
    this.setKey(voice, key, voice.measureStart);
    this.keyFields.push({ line: lineNumber - 1, timelineIndex: voice.timeline.length - 1 });
  }

  private setKey(voice: VoiceState, key: string, at: number): void {
    const signature = signatureOf(key);
    voice.key = signature.key;
    voice.signature = signature.values;
    voice.accidental = {};
    voice.timeline.push({ at, key });
  }

  // --- music lines -------------------------------------------------------------------------------

  // RULES.md M1-M4, B5, X10 and X18: split on |, expand Z, allow a partial final measure only at the end.
  private readMusicLine(
    line: string,
    voice: VoiceState,
    finalLine: boolean,
    lineNumber: number,
  ): "none" | "partial" | "next" {
    const endsWithBar = line.endsWith("|");
    if (!endsWithBar && !finalLine) {
      fail("token", { reason: "no-barline", bar: voice.measures.length + 1 }, this.at(voice, lineNumber));
    }

    const bodies = line.split("|");
    if (endsWithBar) bodies.pop();
    if (bodies.length === 0) {
      fail("token", { reason: "empty-bar", bar: voice.measures.length + 1 }, this.at(voice, lineNumber));
    }

    let count = 0;
    for (const raw of bodies) {
      const body = trimBody(raw);
      if (body === "") {
        fail("token", { reason: "empty-bar", bar: voice.measures.length + 1 }, this.at(voice, lineNumber));
      }
      count += wholeRestCount(body) ?? 1;
    }
    if (count > 4) {
      fail("bar-count", { count, max: 4, reason: "too-many" }, this.at(voice, lineNumber, voice.measures.length + 1));
    }

    let nextBar = voice.measures.length;
    const segments: PendingSegment[] = [];
    for (const raw of bodies) {
      const expanded = wholeRestCount(trimBody(raw)) ?? 1;
      const bars: PendingBar[] = [];
      for (let offset = 0; offset < expanded; offset += 1) bars.push({ voice: voice.name, bar: nextBar + offset });
      segments.push({ raw, bars });
      nextBar += expanded;
    }
    const sourceLine: PendingLine = {
      line: lineNumber - 1,
      voice: voice.name,
      endsWithBarline: endsWithBar,
      segments,
      unfinishedTie: false,
      cutTail: null,
    };
    this.sourceLines.push(sourceLine);

    this.musicLines += 1;
    let outcome: "none" | "partial" | "next" = "none";
    for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
      this.cutTail = null;
      const body = trimBody(bodies[bodyIndex] as string);
      const partialBody = !endsWithBar && bodyIndex === bodies.length - 1;
      const rests = wholeRestCount(body);
      if (rests !== null) {
        for (let rest = 0; rest < rests; rest += 1) this.addWholeRestMeasure(voice, lineNumber);
        if (partialBody) outcome = "next";
        continue;
      }
      const result = this.readMeasureBody(voice, body, partialBody, lineNumber);
      if (result !== "complete") {
        outcome = result === "cut" ? "partial" : result;
        sourceLine.cutTail = this.cutTail;
        break;
      }
    }
    if (outcome === "partial" && this.lastCutReason === "tie") sourceLine.unfinishedTie = true;
    return outcome === "none" && !endsWithBar ? "next" : outcome;
  }

  // RULES.md D5-D7 and P6: a complete measure must fill exactly; a cut measure may stay short.
  private readMeasureBody(
    voice: VoiceState,
    body: string,
    partialBody: boolean,
    lineNumber: number,
  ): "complete" | "partial" | "cut" {
    const start = voice.measureStart;
    const length = measureTicks(voice.meter);
    const bar = voice.measures.length;
    voice.accidental = {};
    this.lastCutReason = "unfinished";
    this.cutTail = null;

    let offset = 0;
    let cut = false;
    try {
      offset = this.readTokens(body, voice, start, length, bar, partialBody, lineNumber);
    } catch (error) {
      if (!(error instanceof MeasureCut)) throw error;
      cut = true;
      offset = error.offset;
      this.lastCutReason = error.reason;
      this.cutTail = { kind: error.reason === "tie" ? "x5" : "x4", raw: error.raw };
    }

    if (!cut && offset === length) {
      this.completeMeasure(voice, {
        bar,
        start,
        length,
        meter: voice.meter,
        key: this.effectiveKeyAt(voice, start),
      });
      return "complete";
    }
    if (partialBody || cut) {
      voice.partial = { bar, start, length, meter: voice.meter, key: this.effectiveKeyAt(voice, start) };
      return cut ? "cut" : "partial";
    }
    fail(
      "bar-length",
      {
        bar: bar + 1,
        meter: meterText(voice.meter),
        actual: offset,
        expected: length,
        reason: "short",
      },
      this.at(voice, lineNumber, bar + 1),
    );
  }

  // RULES.md M5-M11, D, P and C: skipped whitespace, chord and key tokens that do not advance, notes and rests that do.
  private readTokens(
    body: string,
    voice: VoiceState,
    measureStart: number,
    length: number,
    bar: number,
    partialBody: boolean,
    lineNumber: number,
  ): number {
    let pos = 0;
    let offset = 0;

    while (true) {
      while (isSpace(body[pos])) pos += 1;
      if (pos >= body.length) return offset;

      const tokenStart = pos;
      const char = body[pos] as string;
      if (char === '"') {
        const end = body.indexOf('"', pos + 1);
        this.hasChords = true;
        if (end < 0) {
          if (voice.name === "Ins") {
            fail("chord", { voice: "Ins", bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
          }
          if (partialBody) throw new MeasureCut(offset, "unfinished", body.slice(pos));
          fail(
            "token",
            { reason: "unrecognized", token: body.slice(pos), bar: bar + 1 },
            this.at(voice, lineNumber, bar + 1),
          );
        }
        this.requireRoom(voice, offset, length, bar, lineNumber);
        const name = body.slice(pos + 1, end);
        if (!isChordName(name)) {
          fail("chord", { name, bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
        }
        if (voice.name === "Ins") {
          fail("chord", { voice: "Ins", name, bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
        }
        voice.chords.push({ name, start: measureStart + offset, noteId: null });
        pos = end + 1;
        continue;
      }

      if (char === "[") {
        const end = body.indexOf("]", pos);
        if (end < 0) {
          const rest = body.slice(pos);
          if (partialBody && (rest === "[" || rest === "[K" || rest.startsWith("[K:"))) {
            throw new MeasureCut(offset, "unfinished", rest);
          }
          fail("token", { reason: "unrecognized", token: rest, bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
        }
        const token = body.slice(pos, end + 1);
        if (!token.startsWith("[K:")) {
          fail("token", { reason: "unrecognized", token, bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
        }
        const key = token.slice(3, -1);
        if (key === "") {
          fail("token", { reason: "unrecognized", token, bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
        }
        this.requireRoom(voice, offset, length, bar, lineNumber);
        if (!isKey(key)) this.failHeader("K", lineNumber, key, key);
        this.setKey(voice, key, measureStart + offset);
        voice.inlineKeys.push({
          at: measureStart + offset,
          key,
          timelineIndex: voice.timeline.length - 1,
        });
        pos = end + 1;
        continue;
      }

      let accidental: number | null = null;
      if (char === "^" || char === "_" || char === "=") {
        if (char === "^") {
          if (body[pos + 1] === "^") {
            accidental = 2;
            pos += 2;
          } else {
            accidental = 1;
            pos += 1;
          }
        } else if (char === "_") {
          if (body[pos + 1] === "_") {
            accidental = -2;
            pos += 2;
          } else {
            accidental = -1;
            pos += 1;
          }
        } else {
          accidental = 0;
          pos += 1;
        }
      }

      const next = body[pos];
      if (next === "z") {
        this.requireRoom(voice, offset, length, bar, lineNumber);
        const rest = this.readRest(
          body,
          pos,
          accidental !== null,
          offset,
          voice,
          measureStart,
          length,
          bar,
          lineNumber,
        );
        pos = rest.end;
        offset = rest.offset;
        continue;
      }
      if (isLetter(next) || isLowerLetter(next)) {
        this.requireRoom(voice, offset, length, bar, lineNumber);
        const note = this.readNote(
          body,
          pos,
          accidental,
          offset,
          voice,
          measureStart,
          length,
          bar,
          partialBody,
          tokenStart,
          lineNumber,
        );
        pos = note.end;
        offset = note.offset;
        continue;
      }
      if (accidental !== null && pos >= body.length && partialBody) {
        throw new MeasureCut(offset, "unfinished", body.slice(tokenStart));
      }
      fail(
        "token",
        { reason: "unrecognized", token: body.slice(pos), bar: bar + 1 },
        this.at(voice, lineNumber, bar + 1),
      );
    }
  }

  // RULES.md M7, D2, P12 and P15: a rest cannot be decorated or continue a tie.
  // RULES.md D7: a note, rest, chord or inline key may not start at or after the bar's end.
  private requireRoom(voice: VoiceState, offset: number, length: number, bar: number, lineNumber: number): void {
    if (offset < length) return;
    fail(
      "bar-length",
      { bar: bar + 1, meter: meterText(voice.meter), actual: offset, expected: length, reason: "full" },
      this.at(voice, lineNumber, bar + 1),
    );
  }

  private readRest(
    body: string,
    startPos: number,
    accidental: boolean,
    offset: number,
    voice: VoiceState,
    measureStart: number,
    length: number,
    bar: number,
    lineNumber: number,
  ): { end: number; offset: number } {
    let pos = startPos + 1;
    let decorated = accidental;
    while (body[pos] === "'" || body[pos] === ",") {
      decorated = true;
      pos += 1;
    }
    let digits = "";
    while (isDigit(body[pos])) {
      digits += body[pos];
      pos += 1;
    }
    if (digits.length > 2) {
      fail("duration", { value: digits, digits: digits.length, bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
    }
    if (body[pos] === "-") {
      decorated = true;
      pos += 1;
    }
    if (decorated) {
      fail("token", { reason: "rest-decoration", bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
    }
    if (voice.pendingTie !== null) {
      fail("tie", { reason: "rest", bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
    }
    const duration = this.durationOf(digits, voice, lineNumber, bar);
    if (offset + duration > length) {
      fail(
        "bar-length",
        {
          bar: bar + 1,
          meter: meterText(voice.meter),
          actual: offset + duration,
          expected: length,
          reason: "overflow",
        },
        this.at(voice, lineNumber, bar + 1),
      );
    }
    const note = this.pushNote(voice, measureStart + offset, duration, null, false, bar);
    this.attachChords(voice, note.start, note.id);
    return { end: pos, offset: offset + duration };
  }

  // RULES.md M6, D1-D3, P1-P16: spelling, accidentals, ties and the MIDI range.
  private readNote(
    body: string,
    startPos: number,
    accidental: number | null,
    offset: number,
    voice: VoiceState,
    measureStart: number,
    length: number,
    bar: number,
    partialBody: boolean,
    tokenStart: number,
    lineNumber: number,
  ): { end: number; offset: number } {
    let pos = startPos;
    const raw = body[pos] as string;
    const letter = raw.toUpperCase() as Letter;
    const lower = raw !== letter;
    pos += 1;

    let apostrophes = 0;
    let commas = 0;
    while (body[pos] === "'" || body[pos] === ",") {
      if (body[pos] === "'") apostrophes += 1;
      else commas += 1;
      pos += 1;
    }
    if (apostrophes > 0 && commas > 0) {
      fail("token", { reason: "mixed-octave", bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
    }

    let digits = "";
    while (isDigit(body[pos])) {
      digits += body[pos];
      pos += 1;
    }
    if (digits.length > 2) {
      fail("duration", { value: digits, digits: digits.length, bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
    }

    const tied = body[pos] === "-";
    if (tied) pos += 1;

    const duration = this.durationOf(digits, voice, lineNumber, bar);
    const written = 60 + LETTER_SEMITONES[letter] + (lower ? 12 : 0) + 12 * (apostrophes - commas);

    let pitch: number;
    if (voice.pendingTie !== null && accidental === null && written === voice.pendingTie.written) {
      pitch = voice.pendingTie.pitch;
    } else {
      const alteration = accidental ?? voice.accidental[letter] ?? voice.signature[letter] ?? 0;
      pitch = written + alteration;
      if (voice.pendingTie !== null && pitch !== voice.pendingTie.pitch) {
        if (partialBody && pos >= body.length) throw new MeasureCut(offset, "tie", body.slice(tokenStart));
        fail("tie", { reason: "pitch", bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
      }
    }

    if (pitch < 0 || pitch > 127) {
      fail("pitch-range", { midi: pitch, bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
    }

    if (accidental !== null) voice.accidental[letter] = accidental;
    if (offset + duration > length) {
      fail(
        "bar-length",
        {
          bar: bar + 1,
          meter: meterText(voice.meter),
          actual: offset + duration,
          expected: length,
          reason: "overflow",
        },
        this.at(voice, lineNumber, bar + 1),
      );
    }

    const note = this.pushNote(voice, measureStart + offset, duration, pitch, tied, bar);
    this.attachChords(voice, note.start, note.id);
    voice.pendingTie = tied ? { pitch, written } : null;
    return { end: pos, offset: offset + duration };
  }

  // RULES.md D1-D3: allowed numbers only, at most two digits, duration is 4n/d quarter notes.
  private durationOf(digits: string, voice: VoiceState, lineNumber: number, bar: number): number {
    const value = digits === "" ? 1 : Number(digits);
    if (!DURATIONS.includes(value)) {
      fail("duration", { value, bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
    }
    return (4 * value * TICKS_PER_QUARTER) / this.unitDenominator;
  }

  private pushNote(
    voice: VoiceState,
    start: number,
    duration: number,
    midi: number | null,
    tie: boolean,
    bar: number,
  ): Note {
    const note: Note = {
      id: `${voice.name}:${start}`,
      voice: voice.name,
      bar,
      start,
      duration,
      midi,
      tie,
    };
    voice.notes.push(note);
    return note;
  }

  private attachChords(voice: VoiceState, start: number, id: string): void {
    for (const chord of voice.chords) {
      if (chord.start === start && chord.noteId === null) chord.noteId = id;
    }
  }

  // RULES.md M4, D8 and P12: Z expands to complete measures of rests; a tie may not enter one.
  private addWholeRestMeasure(voice: VoiceState, lineNumber: number): void {
    const start = voice.measureStart;
    const length = measureTicks(voice.meter);
    const bar = voice.measures.length;
    if (voice.pendingTie !== null) {
      fail("tie", { reason: "whole-bar-rest", bar: bar + 1 }, this.at(voice, lineNumber, bar + 1));
    }
    voice.accidental = {};
    this.pushNote(voice, start, length, null, false, bar);
    this.completeMeasure(voice, { bar, start, length, meter: voice.meter, key: voice.key });
  }

  private completeMeasure(voice: VoiceState, measure: MeasureRecord): void {
    voice.measures.push(measure);
    voice.measureStart += measure.length;
  }

  /** The key in force at a position, including a change written exactly there (an inline key at offset 0). */
  private effectiveKeyAt(voice: VoiceState, at: number): string {
    for (let index = voice.timeline.length - 1; index >= 0; index -= 1) {
      const entry = voice.timeline[index] as KeyChange;
      if (entry.at <= at) return entry.key;
    }
    return this.initialKey;
  }

  // --- agreement and result ----------------------------------------------------------------------

  // RULES.md V2-V4 and V8: bar counts, the shared grid, and key timelines before the shorter voice's end.
  private checkVoices(): void {
    if (this.ins === null) return;

    for (let index = 0; index < this.groups.length; index += 1) {
      const group = this.groups[index] as GroupCounts;
      const last = index === this.groups.length - 1;
      const ins = group.ins + (group.insPartial ? 1 : 0);
      if (ins > group.vocal) {
        fail("bar-count", { vocal: group.vocal, ins, reason: "voices" }, { bar: group.insStart + group.vocal + 1 });
      }
      if (ins < group.vocal) {
        if (!last) {
          fail("bar-count", { vocal: group.vocal, ins, reason: "voices" }, { bar: group.insStart + ins + 1 });
        }
        if (this.truncation === null) this.cutAt("Ins", group.insStart + group.ins, false);
      }
    }

    const shared = Math.min(this.vocal.measures.length, this.ins.measures.length);
    for (let index = 0; index < shared; index += 1) {
      const vocal = this.vocal.measures[index] as MeasureRecord;
      const ins = this.ins.measures[index] as MeasureRecord;
      if (
        vocal.start !== ins.start ||
        vocal.length !== ins.length ||
        vocal.meter.numerator !== ins.meter.numerator ||
        vocal.meter.denominator !== ins.meter.denominator
      ) {
        fail("bar-length", { bar: index + 1, reason: "voices" }, { voice: "Vocal", bar: index + 1 });
      }
    }

    const vocalEnd = this.voiceEnd(this.vocal);
    const insEnd = this.voiceEnd(this.ins);
    const compareEnd = Math.min(vocalEnd, insEnd);
    const vocalKeys = this.vocal.timeline.filter((entry) => entry.at < compareEnd);
    const insKeys = this.ins.timeline.filter((entry) => entry.at < compareEnd);
    const same =
      vocalKeys.length === insKeys.length &&
      vocalKeys.every((entry, index) => {
        const other = insKeys[index] as KeyChange;
        return entry.at === other.at && entry.key === other.key;
      });
    if (!same) {
      fail("header", { field: "K", reason: "voices" }, { voice: "Vocal", bar: 1 });
    }
  }

  private voiceEnd(voice: VoiceState): number {
    const last = voice.measures[voice.measures.length - 1];
    return last === undefined ? 0 : last.start + last.length;
  }

  // RULES.md S4 and X14: sections cover the shared grid; a partial measure is a bar but not a complete measure.
  private buildScore(): Score {
    const bars: Bar[] = this.vocal.measures.map((measure) => ({
      index: measure.bar,
      start: measure.start,
      length: measure.length,
      meter: measure.meter,
      key: measure.key,
      keyChanges: this.keyChangesInside(measure.start, measure.length),
      incomplete: false,
    }));

    const notes: Note[] = [...this.vocal.notes];
    if (this.ins !== null) notes.push(...this.ins.notes);
    const chords = this.vocal.chords.map((chord: InternalChord): Chord => ({ ...chord }));

    const partial = this.vocal.partial ?? this.ins?.partial ?? null;
    if (partial !== null && partial.bar >= bars.length) {
      bars.push({
        index: bars.length,
        start: partial.start,
        length: partial.length,
        meter: partial.meter,
        key: partial.key,
        keyChanges: this.keyChangesInside(partial.start, partial.length),
        incomplete: true,
      });
    }

    const planned = this.plannedSections.length > 0 ? this.plannedSections : [{ name: null, firstBar: 0 }];
    const sections: Section[] = planned.map((section, index) => {
      const next = planned[index + 1]?.firstBar ?? bars.length;
      return {
        name: section.name,
        firstBar: section.firstBar,
        barCount: Math.max(0, next - section.firstBar),
      };
    });

    const contentSource: BarContentSource = { bars, notes, chords };

    const source: Song2Source = {
      text: this.normalized,
      unitDenominator: this.unitDenominator,
      keyFields: this.keyFields,
      musicLines: this.sourceLines.map((line) => ({
        line: line.line,
        voice: line.voice,
        endsWithBarline: line.endsWithBarline,
        unfinishedTie: line.unfinishedTie,
        cutTail: line.cutTail,
        segments: line.segments.map((segment) => ({
          raw: segment.raw,
          bars: segment.bars
            .filter((bar) => bar.bar < bars.length)
            .map((bar) => {
              const record = bars[bar.bar] as Bar;
              const state = bar.voice === "Vocal" ? this.vocal : this.ins;
              return {
                voice: bar.voice,
                bar: bar.bar,
                content: barContentOf(contentSource, bar.voice, bar.bar),
                inlineKeys: (state?.inlineKeys ?? []).filter(
                  (change) => change.at >= record.start && change.at < record.start + record.length,
                ),
              };
            }),
        })),
      })),
    };

    return {
      tempo: this.tempo,
      voices: this.hasIns ? ["Vocal", "Ins"] : ["Vocal"],
      bars,
      keys: [...this.vocal.timeline],
      sections,
      notes,
      chords,
      truncation: this.truncation,
      hasChords: this.hasChords,
      source,
    };
  }

  private keyChangesInside(start: number, length: number): KeyChange[] {
    return this.vocal.timeline.filter((entry) => entry.at > start && entry.at < start + length);
  }

  private at(voice: VoiceState, line: number, bar?: number): DiagnosticAt {
    return bar === undefined ? { voice: voice.name, line } : { voice: voice.name, bar, line };
  }
}

/** Reads a score text. It never throws: anything outside RULES.md becomes one diagnostic and a null score. */
// RULES.md T1: CRLF and a lone CR both become LF before any line is read.
export function parseSong2(text: string): Song2ParseResult {
  const normalized = text.replace(/\r\n?/g, "\n");
  try {
    return { score: new Song2Parser(normalized).parse(), diagnostics: [] };
  } catch (error) {
    if (error instanceof ParseFailure) {
      return { score: null, diagnostics: [error.diagnostic] };
    }
    return {
      score: null,
      diagnostics: [{ code: "token", params: { reason: "unrecognized" }, at: {} }],
    };
  }
}

export { CHORD_ROOTS, QUALITIES };

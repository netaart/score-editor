// ABOUTME: The dialect-agnostic score and song-project model: plain immutable data with no behaviour and no DOM.
// ABOUTME: Positions and lengths are integer ticks of 1/1024 note, so every value the song2 format permits is exact.
/** The tick unit of the score model. The song2 format's finest value, a 1/1024 note, is one tick. */
export const TICKS_PER_QUARTER = 256;

/** A meter written as a fraction of a whole note. */
export interface Meter {
  readonly numerator: number;
  readonly denominator: number;
}

/** A tempo as the dialect writes it: the unit (such as "1/4") and beats per minute in that unit. */
export interface Tempo {
  readonly unit: string;
  readonly bpm: number;
}

/** A key in force from a tick on. A redundant entry is kept: the dialect's text states it explicitly. */
export interface KeyChange {
  readonly at: number;
  readonly key: string;
}

/** One bar of the shared grid. `index` and `keyChanges[].at` are absolute; the bar's own start is `start`. */
export interface Bar {
  /** 0-based index in the score's bar grid. */
  readonly index: number;
  readonly start: number;
  readonly length: number;
  readonly meter: Meter;
  /** The effective key at `start`. */
  readonly key: string;
  /** Key changes strictly after `start` and before its end. */
  readonly keyChanges: ReadonlyArray<KeyChange>;
  /** True for the partial measure at a cut: it has its meter's length but no complete measure behind it. */
  readonly incomplete: boolean;
}

/** A section and the bars it covers. The unnamed section before the first marker has `name: null`. */
export interface Section {
  readonly name: string | null;
  /** 0-based index of its first bar. */
  readonly firstBar: number;
  readonly barCount: number;
}

/** A finished note or rest. A tie flag means it continues into the next note of its voice. */
export interface Note {
  /** `${voice}:${start}`, so a note that does not move keeps its id across edits. */
  readonly id: string;
  readonly voice: string;
  /** 0-based bar index in the shared grid. */
  readonly bar: number;
  readonly start: number;
  readonly duration: number;
  /** MIDI 0-127, or `null` for a rest. */
  readonly midi: number | null;
  readonly tie: boolean;
}

/** A chord in `Vocal`, attached to the note or rest that starts at its position when there is one. */
export interface Chord {
  /** The name exactly as written. */
  readonly name: string;
  readonly start: number;
  /** Id of the `Vocal` note or rest it sits on; `null` when no event follows at that position. */
  readonly noteId: string | null;
}

/** Where a cut is: the voice, its 0-based bar index, and whether that bar is short of its meter. */
export interface Truncation {
  readonly voice: string;
  /** 0-based. It may equal the bar count when the cut is before a new bar rather than inside one. */
  readonly bar: number;
  readonly short: boolean;
  /** True only when the cut ends inside an unfinished chord string (RULES.md C8 and X4). */
  readonly unfinishedChord?: true;
}

/** A parsed score. `source` is dialect-private data the core never reads; the dialect uses it to write unchanged text. */
export interface Score {
  readonly tempo: Tempo;
  /**
   * Tempo changes after the opening `tempo`, in tick order. A dialect that can write one fills this; `song2` cannot,
   * so it is absent there. Positions in seconds count each stretch at the tempo in force in it.
   */
  readonly tempoChanges?: ReadonlyArray<{ readonly at: number; readonly tempo: Tempo }>;
  /** Display order: `Vocal` first, then `Ins` when present. */
  readonly voices: ReadonlyArray<string>;
  readonly bars: ReadonlyArray<Bar>;
  /** The shared key timeline: the header key at 0 and every stated change, in order. */
  readonly keys: ReadonlyArray<KeyChange>;
  readonly sections: ReadonlyArray<Section>;
  readonly notes: ReadonlyArray<Note>;
  readonly chords: ReadonlyArray<Chord>;
  readonly truncation: Truncation | null;
  /** True when the text carries any chord token, finished or unfinished. */
  readonly hasChords: boolean;
  readonly source: unknown;
  /**
   * The score's written duration unit in ticks: one number after a note lasts this many ticks. It is optional so a
   * caller that builds a 0.1.0-shaped Score still type-checks; a note command that needs it refuses with
   * `unit-unknown` when the dialect did not state it. A command writing a new length also takes the duration numbers
   * from the dialect's constraints.
   */
  readonly unitTicks?: number;
}

/** A phrase: a run of consecutive bars, inside one section. `firstBar` is a 0-based bar index. */
export interface LyricPhrase {
  readonly firstBar: number;
  readonly barCount: number;
}

/** One lyric line. `phrase` is `null` for a line in the unaligned area. */
export interface LyricLine {
  readonly text: string;
  readonly phrase: LyricPhrase | null;
}

/** The song project that carries a score. The lyric field is optional so a project built by 0.1.0 still opens. */
export interface SongProject {
  readonly style: string;
  readonly lyrics: string;
  readonly score: string;
  readonly scoreMode: "full" | "melody";
  readonly seed: number | null;
  readonly modelId: string;
  readonly sourceKey: string;
  /** The stored lyric lines and their phrase bindings; absent means the layout is computed from `lyrics`. */
  readonly lyricLines?: ReadonlyArray<LyricLine>;
}

export function noteId(voice: string, start: number): string {
  return `${voice}:${start}`;
}

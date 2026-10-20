// ABOUTME: The public types of @neta-art/score-editor: mount options, host callbacks and the dialect constraints.
// ABOUTME: Type-only, so importing it costs nothing at runtime and dialect packages can depend on it safely.

/** Interface languages the package ships text for. The host picks one. */
export type Language = "zh" | "en";

/** Machine-readable reason of a notice. Hosts may key their own handling on it. */
export type NoticeCode = "read-only" | "pitch-out-of-range" | "move-blocked";

/**
 * A one-time message the editor wants the user to see. The editor never renders it itself:
 * the host shows it in its own toast system. `message` is already in the current language.
 */
export interface Notice {
  code: NoticeCode;
  level: "info" | "warning" | "error";
  message: string;
}

/** A note in the spike's score. Positions and lengths are in ticks, 480 per quarter note. */
export interface SpikeNote {
  voice: string;
  /** MIDI pitch, 0-127. */
  midi: number;
  /** Start in ticks from the beginning of the score. */
  start: number;
  /** Length in ticks. */
  duration: number;
}

/** The spike's whole score: a bar count in 4/4 and the notes of each voice. */
export interface SpikeScore {
  bars: number;
  notes: SpikeNote[];
}

export interface MountOptions {
  /** Interface language. */
  language: Language;
  /** Whether the user may change the score. Defaults to true. */
  editable?: boolean;
  /** Receives every one-time message the editor wants shown. */
  notify?: (notice: Notice) => void;
  /**
   * Spike only: the score to show. It stands in for the song project (score text, lyrics, style,
   * mode, seed) until the dialect parser exists.
   */
  spikeScore?: SpikeScore;
}

export interface MountedEditor {
  /** Applies new options. Only the given keys change. Does nothing after `destroy`. */
  update(options: Partial<MountOptions>): void;
  /** Removes every listener and node the editor added. Safe to call twice. */
  destroy(): void;
}

/** The durations a dialect writes, as the numbers it puts after a note under its written unit. */
export type DurationSet = ReadonlyArray<number>;

/** How a dialect writes meters. A symbolic meter (such as `C`) is either allowed or not. */
export interface MeterRule {
  readonly form: "fraction";
  readonly numerator: { readonly min: number; readonly max: number };
  readonly denominator: { readonly min: number; readonly max: number; readonly powerOfTwo: boolean };
  readonly symbolic: boolean;
}

/** The chord names a dialect accepts: root spellings, quality suffixes and whether a slash bass is allowed. */
export interface ChordVocabulary {
  readonly roots: ReadonlyArray<string>;
  /** Suffixes after the root. The empty string is a major triad. */
  readonly qualities: ReadonlyArray<string>;
  readonly slashBass: boolean;
}

/**
 * What a score dialect declares about itself. The editor narrows its interface by these.
 */
export interface DialectConstraints {
  /** The voices of a score, in display order. */
  voices: ReadonlyArray<{ name: string; required: boolean; allowsChords: boolean }>;
  /** Keys a score may use, spelled as the dialect writes them. */
  keys: { major: ReadonlyArray<string>; minor: ReadonlyArray<string> };
  /** The tempo unit the dialect writes and its inclusive range. */
  tempo: { unit: string; min: number; max: number };
  /** The comment prefix that starts a section. */
  sectionMarker: string;
  /** Whether lyrics may appear inside the score text. */
  lyricsInScore: boolean;
  /** The durations the dialect can write. */
  durations: DurationSet;
  /** The meter rule the dialect enforces. */
  meter: MeterRule;
  /** The chord vocabulary the dialect accepts. */
  chords: ChordVocabulary;
}

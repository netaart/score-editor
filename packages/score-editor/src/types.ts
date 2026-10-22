// ABOUTME: The public types of @neta-art/score-editor: mount options, host callbacks and the dialect constraints.
// ABOUTME: Almost type-only, so importing it costs nothing at runtime and dialect packages can depend on it safely.
import type { DialectRegistry } from "./dialect";
import type { SongProject } from "./score";

/** Interface languages the package ships text for. The host picks one. */
export type Language = "zh" | "en";

/** The reasons of the one-time messages the editor sends to the host. The set is closed and starts empty: a later ticket adds its codes here. */
export const NOTICE_CODES = [] as const;

/** Machine-readable reason of a notice. Hosts may key their own handling on it. */
export type NoticeCode = (typeof NOTICE_CODES)[number];

/**
 * A one-time message the editor wants the user to see. The editor never renders it itself:
 * the host shows it in its own toast system. `message` is already in the current language.
 */
export interface Notice {
  code: NoticeCode;
  level: "info" | "warning" | "error";
  message: string;
}

export interface MountOptions {
  /** Interface language. */
  language: Language;
  /**
   * Whether the user may change the score. Defaults to true. This version shows the score read-only whatever
   * the value; `false` additionally shows the read-only badge. Editing arrives in a later version.
   */
  editable?: boolean;
  /** Receives every one-time message the editor wants shown. No message exists yet, so it is never called. */
  notify?: (notice: Notice) => void;
  /** The song project to show. Only its score text and model ID are read in this version. */
  project: SongProject;
  /** The score dialects this editor can read, built by the host with `createDialectRegistry`. */
  dialects: DialectRegistry;
}

export interface MountedEditor {
  /** Applies new options. Only the given keys change. Does nothing after `destroy`. */
  update(options: Partial<MountOptions>): void;
  /** Removes every listener and node the editor added. Safe to call twice. */
  destroy(): void;
}

/**
 * A view part mounted on an element and bound to one editing session. It draws from the session and redraws when the
 * session announces a change, in the session's language.
 */
export interface ViewPart {
  /** Removes every listener, node and stylesheet the part added. Safe to call twice. */
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

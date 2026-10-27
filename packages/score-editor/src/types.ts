// ABOUTME: The public types of @neta-art/score-editor: mount options, host callbacks and the dialect constraints.
// ABOUTME: Almost type-only, so importing it costs nothing at runtime and dialect packages can depend on it safely.
import type { Diagnostic } from "./diagnostics";
import type { DialectRegistry } from "./dialect";
import type { SongProject } from "./score";
import type { ScoreFileHandoffResult } from "./score-source";
import type { ScoreTool } from "./tool";

/** Interface languages the package ships text for. The host picks one. */
export type Language = "zh" | "en";

/**
 * The reasons of the one-time messages the editor sends to the host. The set is closed; a later version adds its codes
 * here. `command-refused`: the user asked for an edit and the score would not take it, so nothing changed.
 * `draft-source-changed`: a draft was discarded because the original's lyrics and score changed under it.
 * `draft-save-failed`: a draft write or removal did not reach the host store.
 * `score-save-failed`: a score file write did not reach the host, and the changes are still unsaved.
 * `score-load-failed`: the other writer's version of a score file could not be read, so the conflict is still open.
 * `handoff-not-sent`: the handoff could not send the song because its save conflicted or failed.
 * `prehandoff-no-sections`: the score has no section markers.
 * `prehandoff-syllables-far`: the whole song's syllable count is far from its note count.
 * `prehandoff-vocal-range`: Vocal's median pitch is outside the singable range 60-82.
 * `prehandoff-melody-chords`: a melody project carries chords.
 */
export const NOTICE_CODES = [
  "command-refused",
  "draft-source-changed",
  "draft-save-failed",
  "score-save-failed",
  "score-load-failed",
  "handoff-not-sent",
  "prehandoff-no-sections",
  "prehandoff-syllables-far",
  "prehandoff-vocal-range",
  "prehandoff-melody-chords",
] as const;

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

/** What a part that takes the user's editing keys accepts besides its element and its session. */
export interface EditingPartOptions {
  /**
   * Called with the diagnostics when a command the user's keys caused is refused and nothing changed. Without it the
   * refusal is silent.
   */
  onRefused?: (diagnostics: ReadonlyArray<Diagnostic>) => void;
}

/** What every view part on the time axis takes besides its element and its session. */
export interface AxisPartOptions extends EditingPartOptions {
  /**
   * The element that scrolls the part in time, when the host puts several parts in one scroller, as the default editor
   * does. Without it the part is its own scroll surface.
   */
  scroller?: HTMLElement;
}

/**
 * The three things the editor hands to a host when the user asks to regenerate with this version: the score as the
 * `score.abc` attachment, the prefilled instruction in the interface language, and the final song project.
 */
export interface HandoffPayload {
  readonly attachment: {
    readonly name: "score.abc";
    readonly mediaType: "text/plain";
    readonly text: string;
  };
  /** The instruction the host prefills: title, the song2 command, the final fields and the change log. */
  readonly instruction: string;
  /** The project as it stands, including the lyric lines and the fields the instruction states. */
  readonly project: SongProject;
}

/** A field of the song project a host may mark as required for a generation. */
export type ProjectField = "style" | "scoreMode" | "seed" | "lyrics";

/** A model input the host says is required before the handoff; the editor reads no model declaration. */
export type RequiredInput = ProjectField;

/** A generated score: the original, edited through drafts. It is what an absent `source` means. */
export interface GeneratedScoreSource {
  readonly kind: "generated";
}

/**
 * A score file the host owns. The editor saves the score text back through `save` with the version it opened or last
 * saved at. `read` answers the file's current text and version, which is how "load theirs" gets the other version.
 * A version is an opaque string, as a `DraftStore` version is.
 */
export interface ScoreFileSource {
  readonly kind: "scoreFile";
  /** The file's name, shown in the handoff instruction's title. */
  readonly name: string;
  /** The version the file was opened at. */
  readonly version: string;
  /** Writes `text` over the file, if it is still at `expected`; answers as a `DraftStore` write does. */
  save(text: string, expected: string): Promise<ScoreFileSaveResult>;
  /** The file's text and version now, or null when it is gone. */
  read(): Promise<ScoreFileEntry | null>;
}

/** Where the score came from: a generated score or a score file. */
export type ScoreSource = GeneratedScoreSource | ScoreFileSource;

/** A score file's text and version; the same shape a draft store entry has, for the same reason. */
export type ScoreFileEntry = DraftStoreEntry;

/** The answer to a versioned save: success with the new version, a conflict, or a failure; the draft write's shape. */
export type ScoreFileSaveResult = DraftWriteResult;

export interface MountOptions {
  /** Interface language. */
  language: Language;
  /**
   * Whether the user may change the score. Defaults to true. While true the toolbar offers undo and redo, a click or tap
   * selects a note or sets the insertion point, and the Delete key, the history keys and the insertion point keys act.
   * While false none of that exists, the score is only shown, and the toolbar shows the read-only badge.
   */
  editable?: boolean;
  /** Receives every one-time message the editor wants shown, as listed in `NOTICE_CODES`. */
  notify?: (notice: Notice) => void;
  /** The song project to show. Only its score text and model ID are read in this version. */
  project: SongProject;
  /**
   * Where the score came from. Absent means a generated score, which keeps drafts as before. A score file saves through
   * its own `save` and never reads or writes a draft, even when `drafts` is also given.
   */
  source?: ScoreSource;
  /**
   * Receives the current score text when the user asks to save a generated score as a score file. Where it goes is the
   * host's business. Without it there is no "Save as" entry.
   */
  onSaveAs?: (text: string) => void;
  /**
   * Receives the file's unsaved state when it changes, so a host can guard closing or leaving. `hasUnsavedChanges()` on
   * the mounted editor answers the same question when the host asks. Generated scores have no unsaved state.
   */
  onUnsavedChange?: (unsaved: boolean) => void;
  /**
   * The model inputs the host says are required before a handoff. A missing one makes the handoff button ask the user to
   * fill it in the Project panel first. The editor reads no model declaration.
   */
  requiredInputs?: ReadonlyArray<RequiredInput>;
  /** The score dialects this editor can read, built by the host with `createDialectRegistry`. */
  dialects: DialectRegistry;
  /** The host's draft storage; see "In the default editor" in the package README. */
  drafts?: DraftStore;
  /**
   * The host's custom tools, added after the built-in note tools in the Tools panel. `update({ tools })` rebuilds the
   * panel's list, closing it when the tool it showed is gone.
   */
  tools?: ReadonlyArray<ScoreTool>;
  /** The work's title for the handoff instruction; the project's source key when absent or blank. */
  title?: string;
  /**
   * Receives what the editor hands to the host's agent when the user presses the handoff button: the score as
   * `score.abc`, the prefilled instruction and the final project. Without this callback there is no button. The editor
   * never calls a generation API and never sends anything by itself.
   */
  onHandoff?: (handoff: HandoffPayload) => void;
}

export interface MountedEditor {
  /** Applies new options. Only the given keys change. Does nothing after `destroy`. */
  update(options: Partial<MountOptions>): void;
  /** Whether a score file has changes that are not saved. Always false for a generated score. */
  hasUnsavedChanges(): boolean;
  /**
   * Saves the score file now, as the Save button and Ctrl/Cmd+S do, and settles when that save has. Answers the keeper's
   * `saved` / `unchanged` / `conflict` / `failed`: `unchanged` when there was nothing to write, including a generated
   * score, a read-only editor, a save already in flight, a standing conflict, or a destroyed editor.
   */
  save(): Promise<ScoreFileHandoffResult>;
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

/**
 * The chord names a dialect accepts. A root is a key spelling: a letter A-G, then #, ##, b or bb. A chord name
 * is a root, one quality, and optionally / and a bass root; the core reads this spelling to transpose.
 */
export interface ChordVocabulary {
  /** Roots in the key spelling, such as `C`, `F#` or `Bbb`. */
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
  /** Keys a score may use: a letter A-G, then #, ##, b or bb, then m for a minor key. */
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

/**
 * What a draft store returns for one key: the text it holds, and a version whose shape is the host's business.
 * `version` is opaque to the package and is only handed back in the next write or remove.
 */
export interface DraftStoreEntry {
  readonly text: string;
  readonly version: string;
}

/**
 * The answer to a versioned write or remove. A success carries the new version; a conflict says someone else
 * wrote the key since `expected`; a failure is any other reason the host could not store it.
 */
export type DraftWriteResult =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly reason: "conflict" | "failed" };

/**
 * The host's storage for drafts. The package passes source keys and text; where a key maps (a file, a path, a
 * record) is the host's business. A host without deletion may keep a tombstone, as long as `read` answers null
 * and `list` leaves the key out. Removing is required by the "a draft equal to the original leaves nothing" rule.
 */
export interface DraftStore {
  /** The stored text and version for a key, or null when there is none. */
  read(key: string): Promise<DraftStoreEntry | null>;
  /** Writes `text` for `key`; `expected` is the version last read or written, or null to create the key. */
  write(key: string, text: string, expected: string | null): Promise<DraftWriteResult>;
  /** Removes `key`; `expected` answers as it does for `write`. */
  remove(key: string, expected: string | null): Promise<DraftWriteResult>;
  /** The keys that hold a draft. */
  list(): Promise<ReadonlyArray<string>>;
}

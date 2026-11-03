// ABOUTME: The draft document a host stores by source key: its JSON text, the content hash, and the reader that rejects other versions.
// ABOUTME: Headless and dependency-free: the hash uses the Web Crypto subset found in browsers, Workers and Node.
import type { ChangeRecord } from "./change-records";
import { DEFAULT_MULTITRACK, type MultitrackPart } from "./multitrack";
import type { LyricLine, LyricPhrase, SongEnding } from "./score";

/**
 * The draft format this package writes. A later format bumps it and still reads the old one on purpose: version 1 has no
 * multitrack part, so it reads as the default one.
 */
export const DRAFT_FORMAT_VERSION = 2;

/** The song-project fields a draft keeps. The model ID and source key belong to the original, not to the draft. */
export interface DraftProject {
  readonly style: string;
  /** The joined lyrics text, kept so a restored project is byte for byte the one the user left. */
  readonly lyrics: string;
  readonly lyricLines: ReadonlyArray<LyricLine>;
  readonly score: string;
  readonly scoreMode: "full" | "melody";
  readonly seed: number | null;
  /** The multitrack part, the same data a song project carries under the same name. */
  readonly multitrack: MultitrackPart;
  /** The mood's name; absent when the song has none. */
  readonly mood?: string;
  /** How the last bar ends; absent when none was chosen. */
  readonly ending?: SongEnding;
  /** The batches the user stopped, in the order they were stopped; absent when none. */
  readonly stoppedBatches?: ReadonlyArray<string>;
  /** Milliseconds since the epoch of the last handoff of output; absent before the first one. */
  readonly handedOutAt?: number;
  /** The agent batches the editor has not seen yet, oldest first; absent when none. */
  readonly changeRecords?: ReadonlyArray<ChangeRecord>;
}

/** The fields a version 1 draft keeps: a draft project before the multitrack part existed. */
type DraftProjectFields = Omit<DraftProject, "multitrack">;

/** The optional fields a draft project keeps beside its core: each is absent, or the value the song project carries. */
export type OptionalDraftFields = Pick<
  DraftProject,
  "mood" | "ending" | "stoppedBatches" | "handedOutAt" | "changeRecords"
>;

/** The optional fields of a song project or of a draft project, copied only where they are present. */
export function optionalDraftFields(source: OptionalDraftFields): OptionalDraftFields {
  return {
    ...(source.mood === undefined ? {} : { mood: source.mood }),
    ...(source.ending === undefined ? {} : { ending: source.ending }),
    ...(source.stoppedBatches === undefined ? {} : { stoppedBatches: source.stoppedBatches }),
    ...(source.handedOutAt === undefined ? {} : { handedOutAt: source.handedOutAt }),
    ...(source.changeRecords === undefined ? {} : { changeRecords: source.changeRecords }),
  };
}

/** A saved edit of one source song. */
export interface ScoreDraft {
  /** The format version this package writes; a version 1 text is read into this shape. */
  readonly version: 2;
  /** The source project's key; the host maps it to its own storage. */
  readonly sourceKey: string;
  /** The content hash of the original's lyrics and score when the draft was started. */
  readonly sourceHash: string;
  readonly project: DraftProject;
  /** The content hash of the lyrics and score at the last handoff, or null before one. */
  readonly handoffHash: string | null;
  /** Milliseconds since the epoch, from the clock the keeper was given. */
  readonly updatedAt: number;
}

/** The SHA-256 of the UTF-8 bytes of `JSON.stringify([lyrics, score])`, as lowercase hex. */
export async function contentHash(lyrics: string, score: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([lyrics, score]));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  let hex = "";
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** The JSON text a host stores for a draft. */
export function draftText(draft: ScoreDraft): string {
  return JSON.stringify(draft);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isPhrase(value: unknown): value is LyricPhrase {
  return (
    isRecord(value) &&
    Number.isInteger(value.firstBar) &&
    (value.firstBar as number) >= 0 &&
    Number.isInteger(value.barCount) &&
    (value.barCount as number) > 0
  );
}

function isLyricLine(value: unknown): value is LyricLine {
  return isRecord(value) && typeof value.text === "string" && (value.phrase === null || isPhrase(value.phrase));
}

function isDraftProjectFields(value: unknown): value is DraftProjectFields {
  return (
    isRecord(value) &&
    typeof value.style === "string" &&
    typeof value.lyrics === "string" &&
    Array.isArray(value.lyricLines) &&
    value.lyricLines.every(isLyricLine) &&
    typeof value.score === "string" &&
    (value.scoreMode === "full" || value.scoreMode === "melody") &&
    (value.seed === null || (typeof value.seed === "number" && Number.isInteger(value.seed)))
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Positions and lengths of notes are whole ticks, and so is a MIDI number. */
function isTick(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isMix(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.volumeDb) &&
    isNumber(value.pan) &&
    typeof value.mute === "boolean" &&
    typeof value.solo === "boolean"
  );
}

function isVoice(value: unknown): boolean {
  return isRecord(value) && typeof value.timbre === "string" && isMix(value.mix);
}

function isTrackNote(value: unknown): boolean {
  return isRecord(value) && isTick(value.start) && isTick(value.duration) && isTick(value.midi);
}

function isScoreTrack(value: unknown): boolean {
  return (
    isRecord(value) &&
    isVoice(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.drum === "boolean" &&
    Array.isArray(value.notes) &&
    value.notes.every(isTrackNote)
  );
}

function isAnchor(value: unknown): boolean {
  return isRecord(value) && isNumber(value.recording) && isNumber(value.timeline);
}

function isSpan(value: unknown): boolean {
  return isRecord(value) && isNumber(value.start) && isNumber(value.end);
}

function isStem(value: unknown): boolean {
  return value === null || value === "vocals" || value === "drums" || value === "bass" || value === "other";
}

function isPlacement(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.take === "string" &&
    isStem(value.stem) &&
    Array.isArray(value.anchors) &&
    value.anchors.every(isAnchor) &&
    Array.isArray(value.removed) &&
    value.removed.every(isSpan) &&
    typeof value.uncertain === "boolean" &&
    Array.isArray(value.suspect) &&
    value.suspect.every(isSpan)
  );
}

function isAudioTrack(value: unknown): boolean {
  return (
    isRecord(value) &&
    isPlacement(value) &&
    isMix(value.mix) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isPlacement)
  );
}

function isTimePoint(value: unknown): boolean {
  return isRecord(value) && isNumber(value.score) && isNumber(value.timeline);
}

function isMultitrack(value: unknown): value is MultitrackPart {
  return (
    isRecord(value) &&
    isVoice(value.vocal) &&
    isVoice(value.instrumental) &&
    isVoice(value.chords) &&
    Array.isArray(value.scoreTracks) &&
    value.scoreTracks.every(isScoreTrack) &&
    Array.isArray(value.audioTracks) &&
    value.audioTracks.every(isAudioTrack) &&
    Array.isArray(value.bindings) &&
    value.bindings.every((group) => Array.isArray(group) && group.every((id) => typeof id === "string")) &&
    (value.baseTake === null || typeof value.baseTake === "string") &&
    (value.timeMap === null || (Array.isArray(value.timeMap) && value.timeMap.every(isTimePoint)))
  );
}

/**
 * A song project as a change record keeps it. It is the project's own fields and no change records of its own, so a
 * record never holds another record inside it.
 */
function isSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.style === "string" &&
    typeof value.lyrics === "string" &&
    typeof value.score === "string" &&
    (value.scoreMode === "full" || value.scoreMode === "melody") &&
    (value.seed === null || (typeof value.seed === "number" && Number.isInteger(value.seed))) &&
    typeof value.modelId === "string" &&
    typeof value.sourceKey === "string" &&
    (value.lyricLines === undefined || (Array.isArray(value.lyricLines) && value.lyricLines.every(isLyricLine))) &&
    (value.multitrack === undefined || isMultitrack(value.multitrack)) &&
    value.changeRecords === undefined &&
    hasOptionalFields(value)
  );
}

function isChangeRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.author === "string" &&
    typeof value.batch === "string" &&
    isNumber(value.at) &&
    typeof value.note === "string" &&
    Array.isArray(value.commands) &&
    value.commands.every((command) => isRecord(command) && typeof command.type === "string") &&
    isSnapshot(value.before)
  );
}

/** The optional fields a draft project may carry: each is absent or of its kind, and a malformed one makes the text no draft. */
function hasOptionalFields(value: Record<string, unknown>): boolean {
  return (
    (value.mood === undefined || typeof value.mood === "string") &&
    (value.ending === undefined || value.ending === "back-to-start" || value.ending === "end-here") &&
    (value.stoppedBatches === undefined ||
      (Array.isArray(value.stoppedBatches) && value.stoppedBatches.every((batch) => typeof batch === "string"))) &&
    (value.handedOutAt === undefined ||
      (typeof value.handedOutAt === "number" && Number.isFinite(value.handedOutAt))) &&
    (value.changeRecords === undefined ||
      (Array.isArray(value.changeRecords) && value.changeRecords.every(isChangeRecord)))
  );
}

/** The project of a stored text: version 1 has no multitrack part, so it reads as the default one. */
function readProject(version: unknown, value: unknown): DraftProject | null {
  const part = isRecord(value) ? value.multitrack : undefined;
  if (!isDraftProjectFields(value) || !hasOptionalFields(value)) return null;
  if (version === 1) return { ...value, multitrack: DEFAULT_MULTITRACK };
  if (version === DRAFT_FORMAT_VERSION && isMultitrack(part)) return { ...value, multitrack: part };
  return null;
}

/**
 * Reads a stored text as a draft of this package's format. Version 1 reads as the default multitrack part. Anything
 * else, a later version included, is no draft rather than an error: an old editor must not act on a document it does not
 * understand.
 */
export function readDraft(text: string): ScoreDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.sourceKey !== "string" ||
    !isHash(parsed.sourceHash) ||
    !(parsed.handoffHash === null || isHash(parsed.handoffHash)) ||
    typeof parsed.updatedAt !== "number" ||
    !Number.isFinite(parsed.updatedAt)
  ) {
    return null;
  }
  const project = readProject(parsed.version, parsed.project);
  if (project === null) return null;
  return {
    version: DRAFT_FORMAT_VERSION,
    sourceKey: parsed.sourceKey,
    sourceHash: parsed.sourceHash,
    project,
    handoffHash: parsed.handoffHash,
    updatedAt: parsed.updatedAt,
  };
}

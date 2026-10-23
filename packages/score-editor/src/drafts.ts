// ABOUTME: The draft document a host stores by source key: its JSON text, the content hash, and the reader that rejects other versions.
// ABOUTME: Headless and dependency-free: the hash uses the Web Crypto subset found in browsers, Workers and Node.
import type { LyricLine, LyricPhrase } from "./score";

/** The one draft format this package writes and reads. A later format bumps it and reads the old one on purpose. */
export const DRAFT_FORMAT_VERSION = 1;

/** The song-project fields a draft keeps. The model ID and source key belong to the original, not to the draft. */
export interface DraftProject {
  readonly style: string;
  /** The joined lyrics text, kept so a restored project is byte for byte the one the user left. */
  readonly lyrics: string;
  readonly lyricLines: ReadonlyArray<LyricLine>;
  readonly score: string;
  readonly scoreMode: "full" | "melody";
  readonly seed: number | null;
}

/** A saved edit of one source song. */
export interface ScoreDraft {
  /** The format version; only `DRAFT_FORMAT_VERSION` is a draft this package knows. */
  readonly version: 1;
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

function isDraftProject(value: unknown): value is DraftProject {
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

/**
 * Reads a stored text as a draft of the one version this package knows. Anything else, a later version included,
 * is no draft rather than an error: an old editor must not act on a document it does not understand.
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
    parsed.version !== DRAFT_FORMAT_VERSION ||
    typeof parsed.sourceKey !== "string" ||
    !isHash(parsed.sourceHash) ||
    !isDraftProject(parsed.project) ||
    !(parsed.handoffHash === null || isHash(parsed.handoffHash)) ||
    typeof parsed.updatedAt !== "number" ||
    !Number.isFinite(parsed.updatedAt)
  ) {
    return null;
  }
  return {
    version: DRAFT_FORMAT_VERSION,
    sourceKey: parsed.sourceKey,
    sourceHash: parsed.sourceHash,
    project: parsed.project,
    handoffHash: parsed.handoffHash,
    updatedAt: parsed.updatedAt,
  };
}

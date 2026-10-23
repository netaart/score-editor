// ABOUTME: The song-project commands and the song-project rules: style, score mode, seed, replacing the score text, the style BPM and melody chords.
// ABOUTME: Only replaceScoreText reads or writes the score text, and only through the dialect; applyProjectCommand is the one entry that runs the rules.

import type { ScoreCommand } from "./commands";
import { runLyricLineCommand } from "./commands-lyric-lines";
import type { Diagnostic } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import { joinLyrics, LYRICS_MAX_CHARACTERS, lyricCharacterCount, lyricLinesOf, unalignedLyricLines } from "./lyrics";
import type { LyricPhrase, SongProject } from "./score";
import { fallbackDiagnostic, readScoreText } from "./score-text";

const PROJECT_COMMAND_TYPES = [
  "setStyle",
  "setScoreMode",
  "setSeed",
  "replaceScoreText",
  "setLyricLineText",
  "insertLyricLine",
  "deleteLyricLine",
  "splitLyricLine",
  "mergeLyricLines",
  "setLyricLinePhrase",
] as const;

/**
 * A song-project edit that is not a score edit. The name is one word so the two command kinds stay apart.
 * `replaceScoreText` replaces the whole score text with another one, and is how a person's typing reaches the project: a
 * readable text is taken, an unreadable one is refused with its first diagnostic. The lyric-line commands name a line by
 * its index in the project's lines, and each keeps the lyric invariants or is refused with its own code.
 */
export type ProjectCommand =
  | { readonly type: "setStyle"; readonly style: string }
  | { readonly type: "setScoreMode"; readonly scoreMode: "full" | "melody" }
  | { readonly type: "setSeed"; readonly seed: number | null }
  | { readonly type: "replaceScoreText"; readonly text: string }
  | { readonly type: "setLyricLineText"; readonly line: number; readonly text: string }
  | {
      readonly type: "insertLyricLine";
      readonly line: number;
      readonly text: string;
      readonly phrase: LyricPhrase | null;
    }
  | { readonly type: "deleteLyricLine"; readonly line: number }
  | {
      readonly type: "splitLyricLine";
      readonly line: number;
      readonly offset: number;
      readonly bar?: number;
    }
  | { readonly type: "mergeLyricLines"; readonly line: number }
  | { readonly type: "setLyricLinePhrase"; readonly line: number; readonly phrase: LyricPhrase | null };

export type ProjectCommandResult =
  | { readonly ok: true; readonly project: SongProject }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/** The project half of the command union applyProjectCommand accepts besides ScoreCommand. */
export function isProjectCommand(command: { readonly type: string }): command is ProjectCommand {
  return (PROJECT_COMMAND_TYPES as ReadonlyArray<string>).includes(command.type);
}

/** Applies one project command. Only `replaceScoreText` touches the score text, and the dialect reads and writes it. */
export function runProjectCommand(
  dialect: ScoreDialect,
  project: SongProject,
  command: ProjectCommand,
): ProjectCommandResult {
  switch (command.type) {
    case "setStyle":
      if (typeof command.style !== "string") {
        return { ok: false, diagnostic: { code: "style-invalid", params: {}, at: {} } };
      }
      return { ok: true, project: { ...project, style: command.style } };
    case "setScoreMode":
      if (command.scoreMode !== "full" && command.scoreMode !== "melody") {
        return { ok: false, diagnostic: { code: "score-mode-invalid", params: {}, at: {} } };
      }
      return { ok: true, project: { ...project, scoreMode: command.scoreMode } };
    case "setSeed":
      if (command.seed !== null && !Number.isInteger(command.seed)) {
        return {
          ok: false,
          diagnostic: { code: "seed-not-integer", params: { seed: String(command.seed) }, at: {} },
        };
      }
      return { ok: true, project: { ...project, seed: command.seed } };
    case "replaceScoreText": {
      const read = readScoreText(dialect, command.text);
      if (!read.ok) return { ok: false, diagnostic: read.diagnostics[0] ?? fallbackDiagnostic() };
      return { ok: true, project: { ...project, score: read.text } };
    }
    case "setLyricLineText":
    case "insertLyricLine":
    case "deleteLyricLine":
    case "splitLyricLine":
    case "mergeLyricLines":
    case "setLyricLinePhrase":
      return runLyricLineCommand(dialect, project, command);
  }
}

// The forms a style text may use for a BPM are listed in the package README.
const BPM_PATTERN = /(?<![A-Za-z0-9_/.])(\d+)([ \t]*)(bpm)\b|(?<![A-Za-z0-9_])(bpm)([ \t]*[:=：]?[ \t]*)(\d+)/gi;

/**
 * Replaces every BPM written in a style text. A BPM number stands next to the BPM word and is not part of a
 * larger token, so a meter such as 3/4, a count or a year in the same sentence survives the tempo change.
 */
export function styleWithTempo(style: string, bpm: number): { readonly style: string; readonly found: boolean } {
  let found = false;
  const next = style.replace(BPM_PATTERN, (match: string, ...groups: Array<string | undefined>) => {
    const [digitsBefore, spaceBefore, wordBefore, wordAfter, spaceAfter, digitsAfter] = groups;
    if (digitsBefore !== undefined && wordBefore !== undefined) {
      found = true;
      return `${bpm}${spaceBefore ?? ""}${wordBefore}`;
    }
    if (wordAfter !== undefined && digitsAfter !== undefined) {
      found = true;
      return `${wordAfter}${spaceAfter ?? ""}${bpm}`;
    }
    return match;
  });
  return { style: found ? next : style, found };
}

/** The notices a project carries as it stands, without changing anything. */
export function checkProject(dialect: ScoreDialect, project: SongProject): ReadonlyArray<Diagnostic> {
  const diagnostics: Diagnostic[] = [];
  const parsed = dialect.parse(project.score).score;
  if (project.scoreMode === "melody" && parsed !== null && parsed.hasChords) {
    diagnostics.push({ code: "melody-with-chords", params: {}, at: {} });
  }
  if (parsed !== null) {
    const lines = lyricLinesOf(project, parsed);
    const unaligned = unalignedLyricLines(lines, parsed).length;
    if (unaligned > 0) diagnostics.push({ code: "lyrics-unaligned", params: { count: unaligned }, at: {} });
    const characters = lyricCharacterCount(joinLyrics(parsed, lines));
    if (characters > LYRICS_MAX_CHARACTERS) {
      diagnostics.push({
        code: "lyrics-too-long",
        params: { count: characters, max: LYRICS_MAX_CHARACTERS },
        at: {},
      });
    }
  }
  return diagnostics;
}

/**
 * The song-project rules after a command: a set tempo carries into the style text whether or not it changed the
 * score, and a melody project with chords carries its notice. A notice comes with a usable project; a refusal does not.
 */
export function applyProjectRules(
  dialect: ScoreDialect,
  project: SongProject,
  command: ScoreCommand | ProjectCommand,
): { readonly project: SongProject; readonly diagnostics: ReadonlyArray<Diagnostic> } {
  const diagnostics: Diagnostic[] = [];
  let next = project;
  if (command.type === "setTempo") {
    const synced = styleWithTempo(next.style, command.bpm);
    if (synced.found) next = { ...next, style: synced.style };
    else diagnostics.push({ code: "style-no-bpm", params: {}, at: {} });
  }
  diagnostics.push(...checkProject(dialect, next));
  return { project: next, diagnostics };
}

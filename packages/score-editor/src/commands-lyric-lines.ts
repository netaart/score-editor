// ABOUTME: The lyric-line project commands: set text, insert, delete, split, merge and set a phrase, with their refusals.
// ABOUTME: They change only lyricLines and lyrics; a line is named by its index in the project's own line order.
import { commandRefusal } from "./command-refusal";
import type { ProjectCommand } from "./commands-project";
import type { Diagnostic } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import { joinLyrics, lyricLabelName, lyricLinesOf, lyricPhraseProblem, sectionIndexAt } from "./lyrics";
import type { LyricLine, LyricPhrase, Score, SongProject } from "./score";
import { fallbackDiagnostic } from "./score-text";

/** The lyric-line commands, as one slice of the song-project command union. */
export type LyricLineCommand = Extract<
  ProjectCommand,
  {
    type:
      | "setLyricLineText"
      | "insertLyricLine"
      | "deleteLyricLine"
      | "splitLyricLine"
      | "mergeLyricLines"
      | "setLyricLinePhrase";
  }
>;

export type LyricLineCommandResult =
  | { readonly ok: true; readonly project: SongProject }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

const HAN_OR_KANA = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function lineAt(index: number): { readonly line: number } {
  return { line: Math.max(1, index + 1) };
}

/** The phrase a command acts on: `null` when there is none, or when the stored one no longer fits this score. */
function effectivePhrase(score: Score, line: LyricLine): LyricPhrase | null {
  if (line.phrase === null || lyricPhraseProblem(score, line.phrase) !== null) return null;
  return line.phrase;
}

/** The order `joinLyrics` needs: valid aligned lines by first bar, then every unaligned line in its stored order. */
function canonical(score: Score, lines: ReadonlyArray<LyricLine>): LyricLine[] {
  const indexed = lines.map((line, index) => ({ line, index }));
  const aligned = indexed
    .filter(({ line }) => effectivePhrase(score, line) !== null)
    .sort((left, right) => {
      const leftBar = (left.line.phrase as LyricPhrase).firstBar;
      const rightBar = (right.line.phrase as LyricPhrase).firstBar;
      return leftBar - rightBar || left.index - right.index;
    });
  const unaligned = indexed.filter(({ line }) => effectivePhrase(score, line) === null);
  return [...aligned, ...unaligned].map(({ line }) => line);
}

function sameLines(left: ReadonlyArray<LyricLine>, right: ReadonlyArray<LyricLine>): boolean {
  if (left.length !== right.length) return false;
  return left.every((line, index) => {
    const other = right[index] as LyricLine;
    return (
      line.text === other.text &&
      line.phrase?.firstBar === other.phrase?.firstBar &&
      line.phrase?.barCount === other.phrase?.barCount
    );
  });
}

/**
 * Writes the new lines, and their join when the lines or the join changed. A project without stored lines takes the
 * computed layout even when a command changes nothing, as the first lyric edit of an old song does.
 */
function withLines(project: SongProject, score: Score, lines: ReadonlyArray<LyricLine>): LyricLineCommandResult {
  const source = lyricLinesOf(project, score);
  const joined = joinLyrics(score, lines);
  const linesChanged = !sameLines(lines, source);
  const joinChanged = joined !== joinLyrics(score, source);
  if (project.lyricLines !== undefined && !linesChanged && !joinChanged) return { ok: true, project };
  const next: SongProject = { ...project, lyricLines: lines };
  return { ok: true, project: linesChanged || joinChanged ? { ...next, lyrics: joined } : next };
}

type TextProblem = "not-text" | "empty" | "line-break" | "label";

function textProblem(text: unknown): TextProblem | null {
  if (typeof text !== "string") return "not-text";
  if (text.trim() === "") return "empty";
  if (/[\r\n\u2028\u2029]/.test(text)) return "line-break";
  return lyricLabelName(text) === null ? null : "label";
}

function textRefusal(problem: TextProblem, at: ReturnType<typeof lineAt>): LyricLineCommandResult {
  return commandRefusal("lyric-text-invalid", { reason: problem }, at);
}

function phraseRefusal(
  score: Score,
  phrase: LyricPhrase,
  at: ReturnType<typeof lineAt>,
): LyricLineCommandResult | null {
  const problem = lyricPhraseProblem(score, phrase);
  if (problem === null) return null;
  const place = Number.isInteger(phrase.firstBar) && phrase.firstBar >= 0 ? { ...at, bar: phrase.firstBar + 1 } : at;
  const params =
    Number.isInteger(phrase.firstBar) && phrase.firstBar >= 0
      ? { reason: problem, bar: phrase.firstBar + 1, barCount: phrase.barCount }
      : { reason: problem, barCount: phrase.barCount };
  return commandRefusal("lyric-phrase-invalid", params, place);
}

/** The first line already on a bar this phrase would take; `null` when the phrase is free. */
function overlapRefusal(
  score: Score,
  lines: ReadonlyArray<LyricLine>,
  phrase: LyricPhrase,
  ignored: number,
): LyricLineCommandResult | null {
  const start = phrase.firstBar;
  const end = start + phrase.barCount;
  for (let index = 0; index < lines.length; index += 1) {
    if (index === ignored) continue;
    const other = effectivePhrase(score, lines[index] as LyricLine);
    if (other === null) continue;
    const otherEnd = other.firstBar + other.barCount;
    if (start < otherEnd && other.firstBar < end) {
      return commandRefusal(
        "lyric-phrase-overlap",
        { line: index + 1, bar: phrase.firstBar + 1, barCount: phrase.barCount },
        { line: index + 1, bar: phrase.firstBar + 1 },
      );
    }
  }
  return null;
}

function joinedText(left: string, right: string): string {
  const last = Array.from(left).at(-1);
  const first = Array.from(right)[0];
  const noSpace = last !== undefined && first !== undefined && HAN_OR_KANA.test(last) && HAN_OR_KANA.test(first);
  return noSpace ? `${left}${right}` : `${left} ${right}`;
}

function setText(
  project: SongProject,
  score: Score,
  lines: ReadonlyArray<LyricLine>,
  command: Extract<LyricLineCommand, { type: "setLyricLineText" }>,
): LyricLineCommandResult {
  if (!Number.isInteger(command.line) || command.line < 0 || command.line >= lines.length) {
    return commandRefusal(
      "lyric-line-out-of-range",
      { line: command.line + 1, lines: lines.length },
      lineAt(command.line),
    );
  }
  const at = lineAt(command.line);
  const problem = textProblem(command.text);
  if (problem !== null) return textRefusal(problem, at);
  const old = lines[command.line] as LyricLine;
  const next = [...lines];
  next[command.line] = { text: command.text, phrase: effectivePhrase(score, old) };
  return withLines(project, score, canonical(score, next));
}

function insertLine(
  project: SongProject,
  score: Score,
  lines: ReadonlyArray<LyricLine>,
  command: Extract<LyricLineCommand, { type: "insertLyricLine" }>,
): LyricLineCommandResult {
  if (!Number.isInteger(command.index) || command.index < 0 || command.index > lines.length) {
    return commandRefusal(
      "lyric-line-out-of-range",
      { line: command.index + 1, lines: lines.length },
      lineAt(command.index),
    );
  }
  const at = lineAt(command.index);
  const problem = textProblem(command.text);
  if (problem !== null) return textRefusal(problem, at);
  const phrase = command.phrase ?? null;
  if (phrase !== null) {
    const invalid = phraseRefusal(score, phrase, at);
    if (invalid !== null) return invalid;
    const overlap = overlapRefusal(score, lines, phrase, -1);
    if (overlap !== null) return overlap;
  }
  const next = [...lines];
  next.splice(command.index, 0, { text: command.text, phrase });
  return withLines(project, score, canonical(score, next));
}

function deleteLine(
  project: SongProject,
  score: Score,
  lines: ReadonlyArray<LyricLine>,
  command: Extract<LyricLineCommand, { type: "deleteLyricLine" }>,
): LyricLineCommandResult {
  if (!Number.isInteger(command.line) || command.line < 0 || command.line >= lines.length) {
    return commandRefusal(
      "lyric-line-out-of-range",
      { line: command.line + 1, lines: lines.length },
      lineAt(command.line),
    );
  }
  return withLines(
    project,
    score,
    lines.filter((_line, index) => index !== command.line),
  );
}

function splitLine(
  project: SongProject,
  score: Score,
  lines: ReadonlyArray<LyricLine>,
  command: Extract<LyricLineCommand, { type: "splitLyricLine" }>,
): LyricLineCommandResult {
  if (!Number.isInteger(command.line) || command.line < 0 || command.line >= lines.length) {
    return commandRefusal(
      "lyric-line-out-of-range",
      { line: command.line + 1, lines: lines.length },
      lineAt(command.line),
    );
  }
  const at = lineAt(command.line);
  const line = lines[command.line] as LyricLine;
  const chars = Array.from(line.text);
  if (!Number.isInteger(command.offset) || command.offset <= 0 || command.offset >= chars.length) {
    return commandRefusal("lyric-split-invalid", { reason: "offset", offset: command.offset }, at);
  }
  const firstText = chars.slice(0, command.offset).join("");
  const secondText = chars.slice(command.offset).join("");
  const firstProblem = textProblem(firstText);
  const secondProblem = textProblem(secondText);
  if (firstProblem === "empty" || secondProblem === "empty") {
    return commandRefusal("lyric-split-invalid", { reason: "empty-part", offset: command.offset }, at);
  }
  if (firstProblem === "label" || secondProblem === "label") {
    return commandRefusal("lyric-split-invalid", { reason: "label-part", offset: command.offset }, at);
  }
  if (firstProblem === "line-break" || secondProblem === "line-break") {
    return commandRefusal("lyric-split-invalid", { reason: "line-break", offset: command.offset }, at);
  }

  const phrase = effectivePhrase(score, line);
  let firstPhrase: LyricPhrase | null = phrase;
  let secondPhrase: LyricPhrase | null = null;
  if (phrase !== null && command.bar !== undefined) {
    if (
      !Number.isInteger(command.bar) ||
      command.bar <= phrase.firstBar ||
      command.bar >= phrase.firstBar + phrase.barCount
    ) {
      const place = Number.isInteger(command.bar) ? { ...at, bar: command.bar + 1 } : at;
      const params = Number.isInteger(command.bar) ? { reason: "bar", bar: command.bar + 1 } : { reason: "bar" };
      return commandRefusal("lyric-split-invalid", params, place);
    }
    firstPhrase = { firstBar: phrase.firstBar, barCount: command.bar - phrase.firstBar };
    secondPhrase = { firstBar: command.bar, barCount: phrase.firstBar + phrase.barCount - command.bar };
  }

  const next = [...lines];
  next.splice(command.line, 1, { text: firstText, phrase: firstPhrase }, { text: secondText, phrase: secondPhrase });
  return withLines(project, score, canonical(score, next));
}

function mergeLines(
  project: SongProject,
  score: Score,
  lines: ReadonlyArray<LyricLine>,
  command: Extract<LyricLineCommand, { type: "mergeLyricLines" }>,
): LyricLineCommandResult {
  if (!Number.isInteger(command.line) || command.line < 0 || command.line >= lines.length) {
    return commandRefusal(
      "lyric-line-out-of-range",
      { line: command.line + 1, lines: lines.length },
      lineAt(command.line),
    );
  }
  const at = lineAt(command.line);
  if (command.line + 1 >= lines.length) {
    return commandRefusal("lyric-lines-not-mergeable", { reason: "no-next" }, at);
  }

  const left = lines[command.line] as LyricLine;
  const right = lines[command.line + 1] as LyricLine;
  const leftPhrase = effectivePhrase(score, left);
  const rightPhrase = effectivePhrase(score, right);
  let phrase: LyricPhrase | null;
  if (leftPhrase !== null && rightPhrase !== null) {
    if (sectionIndexAt(score, leftPhrase.firstBar) !== sectionIndexAt(score, rightPhrase.firstBar)) {
      return commandRefusal("lyric-lines-not-mergeable", { reason: "not-one-section" }, lineAt(command.line + 1));
    }
    const leftEnd = leftPhrase.firstBar + leftPhrase.barCount;
    const rightEnd = rightPhrase.firstBar + rightPhrase.barCount;
    if (leftEnd !== rightPhrase.firstBar && rightEnd !== leftPhrase.firstBar) {
      return commandRefusal("lyric-lines-not-mergeable", { reason: "not-adjacent" }, lineAt(command.line + 1));
    }
    const first = Math.min(leftPhrase.firstBar, rightPhrase.firstBar);
    phrase = { firstBar: first, barCount: Math.max(leftEnd, rightEnd) - first };
  } else {
    phrase = leftPhrase ?? rightPhrase;
  }

  const text = joinedText(left.text, right.text);
  const problem = textProblem(text);
  if (problem !== null) return textRefusal(problem, at);

  const next = [...lines];
  next.splice(command.line, 2, { text, phrase });
  return withLines(project, score, canonical(score, next));
}

function setPhrase(
  project: SongProject,
  score: Score,
  lines: ReadonlyArray<LyricLine>,
  command: Extract<LyricLineCommand, { type: "setLyricLinePhrase" }>,
): LyricLineCommandResult {
  if (!Number.isInteger(command.line) || command.line < 0 || command.line >= lines.length) {
    return commandRefusal(
      "lyric-line-out-of-range",
      { line: command.line + 1, lines: lines.length },
      lineAt(command.line),
    );
  }
  const at = lineAt(command.line);
  const phrase = command.phrase ?? null;
  if (phrase !== null) {
    const invalid = phraseRefusal(score, phrase, at);
    if (invalid !== null) return invalid;
    const overlap = overlapRefusal(score, lines, phrase, command.line);
    if (overlap !== null) return overlap;
  }
  const next = [...lines];
  const old = lines[command.line] as LyricLine;
  next[command.line] = { text: old.text, phrase };
  return withLines(project, score, canonical(score, next));
}

/** Applies one lyric-line command. It reads the score once and leaves the project unchanged on every refusal. */
export function runLyricLineCommand(
  dialect: ScoreDialect,
  project: SongProject,
  command: LyricLineCommand,
): LyricLineCommandResult {
  const parsed = dialect.parse(project.score);
  if (parsed.score === null) {
    return { ok: false, diagnostic: parsed.diagnostics[0] ?? fallbackDiagnostic() };
  }
  const score = parsed.score;
  const lines = lyricLinesOf(project, score);
  switch (command.type) {
    case "setLyricLineText":
      return setText(project, score, lines, command);
    case "insertLyricLine":
      return insertLine(project, score, lines, command);
    case "deleteLyricLine":
      return deleteLine(project, score, lines, command);
    case "splitLyricLine":
      return splitLine(project, score, lines, command);
    case "mergeLyricLines":
      return mergeLines(project, score, lines, command);
    case "setLyricLinePhrase":
      return setPhrase(project, score, lines, command);
  }
}

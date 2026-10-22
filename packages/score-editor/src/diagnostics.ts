// ABOUTME: The closed diagnostic code sets and the zh/en text that turns a code, its parameters and a position into a sentence.
// ABOUTME: Codes carry no prose: hosts translate them here, and bar numbers are turned into the 1-based numbers people read.
import type { Language } from "./types";

/** Every rejection in RULES.md names one of these codes; no other reading code exists. */
export const READING_DIAGNOSTIC_CODES = [
  "header",
  "voice-order",
  "token",
  "duration",
  "bar-length",
  "bar-count",
  "tie",
  "chord",
  "pitch-range",
  "comment-position",
  "empty-line",
] as const;

export type ReadingDiagnosticCode = (typeof READING_DIAGNOSTIC_CODES)[number];

/** The codes the dialect-agnostic edit layer reports when a command cannot be applied or checked. */
export const COMMAND_DIAGNOSTIC_CODES = ["note-not-found", "not-a-note", "write-mismatch", "no-dialect"] as const;

export type CommandDiagnosticCode = (typeof COMMAND_DIAGNOSTIC_CODES)[number];

export type DiagnosticCode = ReadingDiagnosticCode | CommandDiagnosticCode;

export type DiagnosticParams = Readonly<Record<string, string | number | boolean>>;

/** Where a diagnostic points. `bar` is 1-based for people; `line` is 1-based. */
export interface DiagnosticAt {
  readonly voice?: string;
  readonly bar?: number;
  readonly noteId?: string;
  readonly line?: number;
}

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly params: DiagnosticParams;
  readonly at: DiagnosticAt;
}

type Text = (params: DiagnosticParams) => string;

interface Catalog {
  readonly header: Text;
  readonly voiceOrder: Text;
  readonly token: Text;
  readonly duration: Text;
  readonly barLength: Text;
  readonly barCount: Text;
  readonly tie: Text;
  readonly chord: Text;
  readonly pitchRange: Text;
  readonly commentPosition: Text;
  readonly emptyLine: Text;
  readonly noteNotFound: Text;
  readonly notANote: Text;
  readonly writeMismatch: Text;
  readonly noDialect: Text;
}

function value(params: DiagnosticParams, key: string): string {
  const found = params[key];
  return found === undefined ? "" : String(found);
}

function quoted(text: string): string {
  return text === "" ? "" : ` “${text}”`;
}

function englishHeader(params: DiagnosticParams): string {
  if (value(params, "reason") === "voices") return "The two voices do not agree on where the key changes.";
  const field = value(params, "field");
  const names: Record<string, string> = {
    X: "The X:1 line is missing or wrong.",
    T: "The title line T: is missing or wrong.",
    M: "The meter line M: is missing or wrong.",
    L: "The duration-unit line L: is missing or wrong.",
    Q: "The tempo line Q: is missing or wrong.",
    V: "A voice definition line V: is missing or wrong.",
    K: "The key line K: is missing or wrong.",
  };
  if (value(params, "reason") === "repeated") {
    const name = field === "" ? "field" : `${field}: field`;
    return `The ${name} appears more than once in this block.`;
  }
  return `${names[field] ?? "A header line is missing or wrong."}${quoted(value(params, "value"))}`;
}

function chineseHeader(params: DiagnosticParams): string {
  if (value(params, "reason") === "voices") return "两个声部的换调位置不一致。";
  const field = value(params, "field");
  const names: Record<string, string> = {
    X: "缺少或写错了 X:1 这一行。",
    T: "缺少或写错了标题行 T:。",
    M: "缺少或写错了拍号行 M:。",
    L: "缺少或写错了时值单位行 L:。",
    Q: "缺少或写错了速度行 Q:。",
    V: "缺少或写错了声部定义行 V:。",
    K: "缺少或写错了调号行 K:。",
  };
  if (value(params, "reason") === "repeated") {
    const name = field === "" ? "字段" : `${field}: 字段`;
    return `这个声部块里重复写了 ${name}。`;
  }
  return `${names[field] ?? "缺少或写错了标题区的一行。"}${quoted(value(params, "value"))}`;
}

function englishToken(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "no-barline":
      return "This music line does not end with |.";
    case "empty-bar":
      return "This measure is empty.";
    case "mixed-octave":
      return "A note mixes ' and , octave marks.";
    case "rest-decoration":
      return "A rest cannot carry an accidental, an octave mark, or a tie.";
    default:
      return `This is not something the format allows here${quoted(value(params, "token"))}.`;
  }
}

function chineseToken(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "no-barline":
      return "这一行乐谱没有以 | 结尾。";
    case "empty-bar":
      return "这一小节是空的。";
    case "mixed-octave":
      return "一个音符同时用了 ' 和 , 两种八度记号。";
    case "rest-decoration":
      return "休止符不能带升降号、八度记号或连音线。";
    default:
      return `这里写的内容格式不允许${quoted(value(params, "token"))}。`;
  }
}

function englishDuration(params: DiagnosticParams): string {
  const text = value(params, "value");
  return text === "" ? "A duration is not allowed." : `The duration${quoted(text)} is not allowed.`;
}

function chineseDuration(params: DiagnosticParams): string {
  const text = value(params, "value");
  return text === "" ? "时值不在允许的范围内。" : `时值${quoted(text)}不在允许的范围内。`;
}

function englishBarLength(params: DiagnosticParams): string {
  const meter = value(params, "meter");
  switch (value(params, "reason")) {
    case "short":
      return meter === ""
        ? "This measure is shorter than its meter."
        : `This measure is shorter than its ${meter} meter.`;
    case "overflow":
      return "A note or rest runs past the end of its measure.";
    case "full":
      return "Something follows a measure that is already full.";
    case "voices":
      return "The two voices disagree on a measure's start, length, or meter.";
    default:
      return "A measure does not match its meter.";
  }
}

function chineseBarLength(params: DiagnosticParams): string {
  const meter = value(params, "meter");
  switch (value(params, "reason")) {
    case "short":
      return meter === "" ? "这一小节没有写满拍号要求的长度。" : `这一小节没有写满 ${meter} 拍号要求的长度。`;
    case "overflow":
      return "有音符或休止符超出了这一小节的长度。";
    case "full":
      return "这一小节已经满了，后面还有内容。";
    case "voices":
      return "两个声部对同一小节的起点、长度或拍号不一致。";
    default:
      return "小节和拍号不一致。";
  }
}

function englishBarCount(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "no-music":
      return "The score has no music.";
    case "voices":
      return `Vocal has ${value(params, "vocal")} measures here and Ins has ${value(params, "ins")}.`;
    default: {
      const count = value(params, "count");
      const max = value(params, "max");
      return count === ""
        ? "A music line has too many measures."
        : `A music line has ${count} measures; at most ${max} are allowed.`;
    }
  }
}

function chineseBarCount(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "no-music":
      return "乐谱里没有音乐。";
    case "voices":
      return `这里 Vocal 有 ${value(params, "vocal")} 小节，Ins 有 ${value(params, "ins")} 小节。`;
    default: {
      const count = value(params, "count");
      const max = value(params, "max");
      return count === "" ? "一行乐谱的小节太多。" : `一行乐谱有 ${count} 小节，最多允许 ${max} 小节。`;
    }
  }
}

function englishTie(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "rest":
      return "A tie runs into a rest.";
    case "whole-bar-rest":
      return "A tie runs into a whole-measure rest.";
    default:
      return "The two notes of a tie have different pitches.";
  }
}

function chineseTie(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "rest":
      return "连音线连到了休止符。";
    case "whole-bar-rest":
      return "连音线连到了整小节休止。";
    default:
      return "连音线两端音符的音高不同。";
  }
}

function englishChord(params: DiagnosticParams): string {
  if (value(params, "voice") === "Ins") return "Chords are only allowed in Vocal.";
  const name = value(params, "name");
  return name === "" ? "This chord name is not allowed." : `The chord${quoted(name)} is not allowed.`;
}

function chineseChord(params: DiagnosticParams): string {
  if (value(params, "voice") === "Ins") return "和弦只能写在 Vocal 声部。";
  const name = value(params, "name");
  return name === "" ? "这个和弦名不在允许的范围内。" : `和弦${quoted(name)}不在允许的范围内。`;
}

function englishPitchRange(params: DiagnosticParams): string {
  const midi = value(params, "midi");
  return midi === "" ? "A note is outside MIDI 0-127." : `The pitch ${midi} is outside MIDI 0-127.`;
}

function chinesePitchRange(params: DiagnosticParams): string {
  const midi = value(params, "midi");
  return midi === "" ? "有音符超出了 MIDI 0-127 的范围。" : `音高 ${midi} 超出了 MIDI 0-127 的范围。`;
}

function englishCommentPosition(params: DiagnosticParams): string {
  const expected = value(params, "expected");
  return expected === ""
    ? "A % comment is not allowed here."
    : `A % comment is not allowed here; expected${quoted(expected)}.`;
}

function chineseCommentPosition(params: DiagnosticParams): string {
  const expected = value(params, "expected");
  return expected === "" ? "这里不能写 % 注释。" : `这里不能写 % 注释；这里应该是${quoted(expected)}。`;
}

function englishEmptyLine(): string {
  return "A blank line is not allowed here.";
}

function chineseEmptyLine(): string {
  return "这里不能有空行。";
}

function englishNoteNotFound(params: DiagnosticParams): string {
  return `The note${quoted(value(params, "noteId"))} is not in this score.`;
}

function chineseNoteNotFound(params: DiagnosticParams): string {
  return `乐谱里找不到音符${quoted(value(params, "noteId"))}。`;
}

function englishNotANote(params: DiagnosticParams): string {
  return `The event${quoted(value(params, "noteId"))} is a rest, not a note.`;
}

function chineseNotANote(params: DiagnosticParams): string {
  return `这个事件${quoted(value(params, "noteId"))}是休止符，不是音符。`;
}

function englishWriteMismatch(params: DiagnosticParams): string {
  const field = value(params, "field");
  return field === ""
    ? "The written score does not read back the same."
    : `The written score does not read back the same in ${field}.`;
}

function chineseWriteMismatch(params: DiagnosticParams): string {
  const field = value(params, "field");
  return field === ""
    ? "写回后的乐谱读回来和改动后的乐谱不一致。"
    : `写回后的乐谱读回来和改动后的乐谱不一致，${field} 字段不同。`;
}

function englishNoDialect(params: DiagnosticParams): string {
  return `The score format of${quoted(value(params, "modelId"))} isn't supported by this editor, so the score can't be changed.`;
}

function chineseNoDialect(params: DiagnosticParams): string {
  return `这个编辑器不支持${quoted(value(params, "modelId"))}的乐谱格式，所以无法修改这份乐谱。`;
}

const en: Catalog = {
  header: englishHeader,
  voiceOrder: (params) => `Expected${quoted(value(params, "expected"))} here.`,
  token: englishToken,
  duration: englishDuration,
  barLength: englishBarLength,
  barCount: englishBarCount,
  tie: englishTie,
  chord: englishChord,
  pitchRange: englishPitchRange,
  commentPosition: englishCommentPosition,
  emptyLine: englishEmptyLine,
  noteNotFound: englishNoteNotFound,
  notANote: englishNotANote,
  writeMismatch: englishWriteMismatch,
  noDialect: englishNoDialect,
};

const zh: Catalog = {
  header: chineseHeader,
  voiceOrder: (params) => `这里应该是${quoted(value(params, "expected"))}。`,
  token: chineseToken,
  duration: chineseDuration,
  barLength: chineseBarLength,
  barCount: chineseBarCount,
  tie: chineseTie,
  chord: chineseChord,
  pitchRange: chinesePitchRange,
  commentPosition: chineseCommentPosition,
  emptyLine: chineseEmptyLine,
  noteNotFound: chineseNoteNotFound,
  notANote: chineseNotANote,
  writeMismatch: chineseWriteMismatch,
  noDialect: chineseNoDialect,
};

const catalogs: Record<Language, Catalog> = { en, zh };

function textFor(diagnostic: Diagnostic, language: Language): string {
  const catalog = catalogs[language] ?? en;
  switch (diagnostic.code) {
    case "header":
      return catalog.header(diagnostic.params);
    case "voice-order":
      return catalog.voiceOrder(diagnostic.params);
    case "token":
      return catalog.token(diagnostic.params);
    case "duration":
      return catalog.duration(diagnostic.params);
    case "bar-length":
      return catalog.barLength(diagnostic.params);
    case "bar-count":
      return catalog.barCount(diagnostic.params);
    case "tie":
      return catalog.tie(diagnostic.params);
    case "chord":
      return catalog.chord(diagnostic.params);
    case "pitch-range":
      return catalog.pitchRange(diagnostic.params);
    case "comment-position":
      return catalog.commentPosition(diagnostic.params);
    case "empty-line":
      return catalog.emptyLine(diagnostic.params);
    case "note-not-found":
      return catalog.noteNotFound(diagnostic.params);
    case "not-a-note":
      return catalog.notANote(diagnostic.params);
    case "write-mismatch":
      return catalog.writeMismatch(diagnostic.params);
    case "no-dialect":
      return catalog.noDialect(diagnostic.params);
    default:
      return "";
  }
}

function position(diagnostic: Diagnostic, language: Language): string {
  const parts: string[] = [];
  if (diagnostic.at.bar !== undefined) {
    parts.push(language === "zh" ? `第 ${diagnostic.at.bar} 小节` : `bar ${diagnostic.at.bar}`);
  }
  if (diagnostic.at.line !== undefined) {
    parts.push(language === "zh" ? `第 ${diagnostic.at.line} 行` : `line ${diagnostic.at.line}`);
  }
  if (parts.length === 0) return "";
  return language === "zh" ? `（${parts.join("，")}）` : ` (${parts.join(", ")})`;
}

/** One sentence in the host's language. Bar and line numbers are already the 1-based ones people see. */
export function formatDiagnostic(diagnostic: Diagnostic, language: Language): string {
  return `${textFor(diagnostic, language)}${position(diagnostic, language)}`;
}

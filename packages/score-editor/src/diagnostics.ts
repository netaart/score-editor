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

/**
 * The codes a command is refused with: the dialect-agnostic headless layer reports the first three when a command cannot be
 * applied or checked, `session.dispatch` reports `no-dialect` for a model the registry has no dialect for, and a tool
 * run reports `tool-parameter` for a parameter of the wrong type or outside its declaration, or a tool with no builder.
 */
export const COMMAND_DIAGNOSTIC_CODES = [
  "note-not-found",
  "not-a-note",
  "write-mismatch",
  "no-dialect",
  "tool-parameter",
  "bar-out-of-range",
  "section-out-of-range",
  "meter-not-allowed",
  "no-truncation",
  "no-incomplete-bar",
  "tie-across-bar",
  "truncated-tail",
  "meter-does-not-fit",
  "last-bar",
] as const;

export type CommandDiagnosticCode = (typeof COMMAND_DIAGNOSTIC_CODES)[number];

export type DiagnosticCode = ReadingDiagnosticCode | CommandDiagnosticCode;

export type DiagnosticParams = Readonly<Record<string, string | number | boolean>>;

/** Where a diagnostic points. `bar`, `beat` and `line` are 1-based, the numbers people count with. */
export interface DiagnosticAt {
  readonly voice?: string;
  readonly bar?: number;
  /** The beat in the bar's own meter; it may carry a fraction. */
  readonly beat?: number;
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
  readonly toolParameter: Text;
  readonly barOutOfRange: Text;
  readonly sectionOutOfRange: Text;
  readonly meterNotAllowed: Text;
  readonly noTruncation: Text;
  readonly noIncompleteBar: Text;
  readonly tieAcrossBar: Text;
  readonly truncatedTail: Text;
  readonly meterDoesNotFit: Text;
  readonly lastBar: Text;
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

/** The model's field that differed stays in `params` for hosts and logs; a creator is told only what it means. */
function englishWriteMismatch(): string {
  return "This change can't be written into the score safely, so the score was left as it was.";
}

function chineseWriteMismatch(): string {
  return "这个改动没法安全地写进乐谱，乐谱保持原样。";
}

function englishNoDialect(params: DiagnosticParams): string {
  return `The score format of${quoted(value(params, "modelId"))} isn't supported by this editor, so the score can't be changed.`;
}

function chineseNoDialect(params: DiagnosticParams): string {
  return `这个编辑器不支持${quoted(value(params, "modelId"))}的乐谱格式，所以无法修改这份乐谱。`;
}

function englishToolParameterType(params: DiagnosticParams): string {
  switch (value(params, "type")) {
    case "number":
      return "a number";
    case "boolean":
      return "true or false";
    case "choice":
      return `one of ${value(params, "values")}`;
    case "text":
      return "text";
    default:
      return "a valid value";
  }
}

function chineseToolParameterType(params: DiagnosticParams): string {
  switch (value(params, "type")) {
    case "number":
      return "数字";
    case "boolean":
      return "真或假";
    case "choice":
      return `${value(params, "values")} 之一`;
    case "text":
      return "文本";
    default:
      return "有效值";
  }
}

function englishToolParameter(params: DiagnosticParams): string {
  const tool = quoted(value(params, "toolId"));
  const parameter = quoted(value(params, "parameter"));
  switch (value(params, "reason")) {
    case "commands":
      return `The tool${tool} has no commands builder.`;
    case "range": {
      const min = value(params, "min");
      const max = value(params, "max");
      if (min !== "" && max !== "") return `The tool${tool} needs${parameter} between ${min} and ${max}.`;
      if (min !== "") return `The tool${tool} needs${parameter} at least ${min}.`;
      if (max !== "") return `The tool${tool} needs${parameter} at most ${max}.`;
      break;
    }
    case "value":
      return `The tool${tool} needs${parameter} to be one of ${value(params, "values")}.`;
  }
  return `The tool${tool} needs ${englishToolParameterType(params)} for${parameter}.`;
}

function chineseToolParameter(params: DiagnosticParams): string {
  const tool = quoted(value(params, "toolId"));
  const parameter = quoted(value(params, "parameter"));
  switch (value(params, "reason")) {
    case "commands":
      return `工具${tool}没有命令生成函数。`;
    case "range": {
      const min = value(params, "min");
      const max = value(params, "max");
      if (min !== "" && max !== "") return `工具${tool}的参数${parameter}的值必须在 ${min} 到 ${max} 之间。`;
      if (min !== "") return `工具${tool}的参数${parameter}的值不小于 ${min}。`;
      if (max !== "") return `工具${tool}的参数${parameter}的值不大于 ${max}。`;
      break;
    }
    case "value":
      return `工具${tool}的参数${parameter}的值必须是 ${value(params, "values")} 之一。`;
  }
  return `工具${tool}的参数${parameter}需要${chineseToolParameterType(params)}。`;
}

function englishBarOutOfRange(params: DiagnosticParams): string {
  const from = value(params, "from");
  if (from !== "") return `The bar range starting at ${from} is outside this score.`;
  return `The bar${quoted(value(params, "bar"))} is outside this score.`;
}

function chineseBarOutOfRange(params: DiagnosticParams): string {
  const from = value(params, "from");
  if (from !== "") return `从第 ${from} 小节开始的范围超出了这份乐谱。`;
  return `小节${quoted(value(params, "bar"))}超出了这份乐谱的范围。`;
}

function englishSectionOutOfRange(params: DiagnosticParams): string {
  return `The section${quoted(value(params, "section"))} is outside this score.`;
}

function chineseSectionOutOfRange(params: DiagnosticParams): string {
  return `段落${quoted(value(params, "section"))}超出了这份乐谱的范围。`;
}

function englishMeterNotAllowed(params: DiagnosticParams): string {
  const meter = `${value(params, "numerator")}/${value(params, "denominator")}`;
  return `The meter ${meter} is not allowed in this score format.`;
}

function chineseMeterNotAllowed(params: DiagnosticParams): string {
  const meter = `${value(params, "numerator")}/${value(params, "denominator")}`;
  return `这个乐谱格式不允许 ${meter} 拍。`;
}

function englishNoTruncation(): string {
  return "This score has no truncated end.";
}

function chineseNoTruncation(): string {
  return "这份乐谱的末尾没有被截断。";
}

function englishNoIncompleteBar(): string {
  return "The truncated end has no incomplete bar to change.";
}

function chineseNoIncompleteBar(): string {
  return "被截断的末尾没有不完整的小节可以改。";
}

function englishTieAcrossBar(params: DiagnosticParams): string {
  return `A tie in ${value(params, "voice")} crosses this bar boundary, so a bar cannot be inserted there.`;
}

function chineseTieAcrossBar(params: DiagnosticParams): string {
  return `${value(params, "voice")} 声部有连音线跨过这条小节线，所以不能在这里插入小节。`;
}

function englishTruncatedTail(): string {
  return "That would touch the truncated end of the score; use the truncation commands for it.";
}

function chineseTruncatedTail(): string {
  return "这样会动到乐谱被截断的末尾；请用截断专用的操作处理它。";
}

function englishMeterDoesNotFit(params: DiagnosticParams): string {
  return `This section's length does not fill whole ${value(params, "numerator")}/${value(params, "denominator")} bars.`;
}

function chineseMeterDoesNotFit(params: DiagnosticParams): string {
  return `这个段落的长度不是 ${value(params, "numerator")}/${value(params, "denominator")} 拍的整小节。`;
}

function englishLastBar(): string {
  return "The score would have no bars left.";
}

function chineseLastBar(): string {
  return "删掉以后乐谱就没有小节了。";
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
  toolParameter: englishToolParameter,
  barOutOfRange: englishBarOutOfRange,
  sectionOutOfRange: englishSectionOutOfRange,
  meterNotAllowed: englishMeterNotAllowed,
  noTruncation: englishNoTruncation,
  noIncompleteBar: englishNoIncompleteBar,
  tieAcrossBar: englishTieAcrossBar,
  truncatedTail: englishTruncatedTail,
  meterDoesNotFit: englishMeterDoesNotFit,
  lastBar: englishLastBar,
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
  toolParameter: chineseToolParameter,
  barOutOfRange: chineseBarOutOfRange,
  sectionOutOfRange: chineseSectionOutOfRange,
  meterNotAllowed: chineseMeterNotAllowed,
  noTruncation: chineseNoTruncation,
  noIncompleteBar: chineseNoIncompleteBar,
  tieAcrossBar: chineseTieAcrossBar,
  truncatedTail: chineseTruncatedTail,
  meterDoesNotFit: chineseMeterDoesNotFit,
  lastBar: chineseLastBar,
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
    case "tool-parameter":
      return catalog.toolParameter(diagnostic.params);
    case "bar-out-of-range":
      return catalog.barOutOfRange(diagnostic.params);
    case "section-out-of-range":
      return catalog.sectionOutOfRange(diagnostic.params);
    case "meter-not-allowed":
      return catalog.meterNotAllowed(diagnostic.params);
    case "no-truncation":
      return catalog.noTruncation(diagnostic.params);
    case "no-incomplete-bar":
      return catalog.noIncompleteBar(diagnostic.params);
    case "tie-across-bar":
      return catalog.tieAcrossBar(diagnostic.params);
    case "truncated-tail":
      return catalog.truncatedTail(diagnostic.params);
    case "meter-does-not-fit":
      return catalog.meterDoesNotFit(diagnostic.params);
    case "last-bar":
      return catalog.lastBar(diagnostic.params);
    default:
      return "";
  }
}

function position(diagnostic: Diagnostic, language: Language): string {
  const parts: string[] = [];
  if (diagnostic.at.bar !== undefined) {
    parts.push(language === "zh" ? `第 ${diagnostic.at.bar} 小节` : `bar ${diagnostic.at.bar}`);
  }
  if (diagnostic.at.beat !== undefined) {
    parts.push(language === "zh" ? `第 ${diagnostic.at.beat} 拍` : `beat ${diagnostic.at.beat}`);
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

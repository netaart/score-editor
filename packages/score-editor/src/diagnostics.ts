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
 * run reports `tool-parameter` for a parameter of the wrong type or outside its declaration, or a tool with no builder,
 * and `setChord` reports the voice and the vocabulary failures.
 */
export const COMMAND_DIAGNOSTIC_CODES = [
  "note-not-found",
  "not-a-note",
  "write-mismatch",
  "no-dialect",
  "tool-parameter",
  "chord-voice",
  "chord-vocabulary",
  "bar-out-of-range",
  "section-out-of-range",
  "meter-not-allowed",
  "no-truncation",
  "no-incomplete-bar",
  "tie-across-bar",
  "truncated-tail",
  "meter-does-not-fit",
  "last-bar",
  "cut-in-complete-bar",
  "pitch-out-of-range",
  "semitones-not-integer",
  "key-not-allowed",
  "key-change-not-found",
  "key-unavailable",
  "chord-invalid",
  "tempo-out-of-range",
  "seed-not-integer",
  "style-invalid",
  "score-mode-invalid",
  "not-a-score-command",
  "section-unnamed",
  "section-move-start",
  "section-move-end",
  "section-before-unnamed",
  "section-name-empty",
  "section-name-blank",
  "section-name-line-break",
  "section-name-trailing-space",
  "note-before-start",
  "note-past-end",
  "note-too-short",
  "grid-not-allowed",
  "offset-not-integer",
  "unit-unknown",
  "lyric-line-out-of-range",
  "lyric-phrase-invalid",
  "lyric-phrase-overlap",
  "lyric-text-invalid",
  "lyric-lines-not-mergeable",
  "lyric-split-invalid",
] as const;

export type CommandDiagnosticCode = (typeof COMMAND_DIAGNOSTIC_CODES)[number];

/** A diagnostic that reports something the user should know, while the project it describes is still usable. */
export const NOTICE_DIAGNOSTIC_CODES = [
  "style-no-bpm",
  "melody-with-chords",
  "lyrics-unaligned",
  "lyrics-too-long",
] as const;

export type NoticeDiagnosticCode = (typeof NOTICE_DIAGNOSTIC_CODES)[number];

export type DiagnosticCode = ReadingDiagnosticCode | CommandDiagnosticCode | NoticeDiagnosticCode;

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
  readonly chordVoice: Text;
  readonly chordVocabulary: Text;
  readonly barOutOfRange: Text;
  readonly sectionOutOfRange: Text;
  readonly meterNotAllowed: Text;
  readonly noTruncation: Text;
  readonly noIncompleteBar: Text;
  readonly tieAcrossBar: Text;
  readonly truncatedTail: Text;
  readonly meterDoesNotFit: Text;
  readonly lastBar: Text;
  readonly cutInCompleteBar: Text;
  readonly pitchOutOfRange: Text;
  readonly semitonesNotInteger: Text;
  readonly keyNotAllowed: Text;
  readonly keyChangeNotFound: Text;
  readonly keyUnavailable: Text;
  readonly chordInvalid: Text;
  readonly tempoOutOfRange: Text;
  readonly seedNotInteger: Text;
  readonly styleInvalid: Text;
  readonly scoreModeInvalid: Text;
  readonly notAScoreCommand: Text;
  readonly sectionUnnamed: Text;
  readonly sectionMoveStart: Text;
  readonly sectionMoveEnd: Text;
  readonly sectionBeforeUnnamed: Text;
  readonly sectionNameEmpty: Text;
  readonly sectionNameBlank: Text;
  readonly sectionNameLineBreak: Text;
  readonly sectionNameTrailingSpace: Text;
  readonly noteBeforeStart: Text;
  readonly notePastEnd: Text;
  readonly noteTooShort: Text;
  readonly gridNotAllowed: Text;
  readonly offsetNotInteger: Text;
  readonly unitUnknown: Text;
  readonly styleNoBpm: Text;
  readonly melodyWithChords: Text;
  readonly lyricsUnaligned: Text;
  readonly lyricsTooLong: Text;
  readonly lyricLineOutOfRange: Text;
  readonly lyricPhraseInvalid: Text;
  readonly lyricPhraseOverlap: Text;
  readonly lyricTextInvalid: Text;
  readonly lyricLinesNotMergeable: Text;
  readonly lyricSplitInvalid: Text;
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
  return name === ""
    ? "This chord is not in the score format's chord vocabulary."
    : `The chord${quoted(name)} is not in the score format's chord vocabulary.`;
}

function chineseChord(params: DiagnosticParams): string {
  if (value(params, "voice") === "Ins") return "和弦只能写在 Vocal 声部。";
  const name = value(params, "name");
  return name === "" ? "这个和弦不在乐谱方言的和弦词表里。" : `和弦${quoted(name)}不在乐谱方言的和弦词表里。`;
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

function englishChordVoice(params: DiagnosticParams): string {
  const voice = value(params, "voice");
  return voice === "" ? "This voice cannot take a chord." : `The ${voice} voice cannot take a chord.`;
}

function chineseChordVoice(params: DiagnosticParams): string {
  const voice = value(params, "voice");
  return voice === "" ? "这个声部不能挂和弦。" : `${voice} 声部不能挂和弦。`;
}

function englishChordVocabulary(params: DiagnosticParams): string {
  const name = value(params, "name");
  return name === ""
    ? "This chord is not in the score format's chord vocabulary."
    : `The chord${quoted(name)} is not in the score format's chord vocabulary.`;
}

function chineseChordVocabulary(params: DiagnosticParams): string {
  const name = value(params, "name");
  return name === "" ? "这个和弦不在乐谱方言的和弦词表里。" : `和弦${quoted(name)}不在乐谱方言的和弦词表里。`;
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
  return "This score has no cut.";
}

function chineseNoTruncation(): string {
  return "这份乐谱没有截断处。";
}

function englishNoIncompleteBar(): string {
  return "The cut has no incomplete bar to change.";
}

function chineseNoIncompleteBar(): string {
  return "截断处没有不完整的小节可以改。";
}

function englishTieAcrossBar(params: DiagnosticParams): string {
  return `A tie in ${value(params, "voice")} crosses this bar boundary, so a bar cannot be inserted there.`;
}

function chineseTieAcrossBar(params: DiagnosticParams): string {
  return `${value(params, "voice")} 声部有连音线跨过这条小节线，所以不能在这里插入小节。`;
}

function englishTruncatedTail(): string {
  return "That would touch the score's cut; use the truncation commands for it.";
}

function chineseTruncatedTail(): string {
  return "这样会动到乐谱的截断处；请用截断专用的操作处理它。";
}

function englishMeterDoesNotFit(params: DiagnosticParams): string {
  return `This section's length does not fill whole ${value(params, "numerator")}/${value(params, "denominator")} bars.`;
}

function chineseMeterDoesNotFit(params: DiagnosticParams): string {
  return `这个段落的长度不是 ${value(params, "numerator")}/${value(params, "denominator")} 拍的整小节。`;
}

function englishCutInCompleteBar(): string {
  return "The cut is inside a measure another voice still uses; fill it with rests instead.";
}

function chineseCutInCompleteBar(): string {
  return "截断落在另一个声部还在用的小节里；请改用休止把它补齐。";
}

function englishLastBar(): string {
  return "The score would have no bars left.";
}

function chineseLastBar(): string {
  return "删掉以后乐谱就没有小节了。";
}

function englishPitchOutOfRange(params: DiagnosticParams): string {
  const midi = value(params, "midi");
  return midi === ""
    ? "A note would be moved outside MIDI 0-127."
    : `The note would be moved to pitch ${midi}, outside MIDI 0-127.`;
}

function chinesePitchOutOfRange(params: DiagnosticParams): string {
  const midi = value(params, "midi");
  return midi === "" ? "移调后的音高超出了 MIDI 0-127 的范围。" : `移调后的音高 ${midi} 超出了 MIDI 0-127 的范围。`;
}

function englishSemitonesNotInteger(): string {
  return "Transpose by a whole number of semitones.";
}

function chineseSemitonesNotInteger(): string {
  return "移调必须用整数个半音。";
}

function englishKeyNotAllowed(params: DiagnosticParams): string {
  return `The key${quoted(value(params, "key"))} is not one this format allows.`;
}

function chineseKeyNotAllowed(params: DiagnosticParams): string {
  return `这个格式不支持${quoted(value(params, "key"))}这个调。`;
}

function englishKeyChangeNotFound(): string {
  return "The score has no key change at the chosen position.";
}

function chineseKeyChangeNotFound(): string {
  return "乐谱在选定的位置没有换调。";
}

function englishKeyUnavailable(): string {
  return "No spelling this format allows fits that key after the shift.";
}

function chineseKeyUnavailable(): string {
  return "这个格式里没有适合移调后这个调的调号写法。";
}

function englishChordInvalid(params: DiagnosticParams): string {
  return `The chord${quoted(value(params, "name"))} cannot be transposed.`;
}

function chineseChordInvalid(params: DiagnosticParams): string {
  return `和弦${quoted(value(params, "name"))}无法移调。`;
}

function englishTempoOutOfRange(params: DiagnosticParams): string {
  const bpm = value(params, "bpm");
  const min = value(params, "min");
  const max = value(params, "max");
  return `The tempo ${bpm} BPM is outside ${min}-${max} BPM.`;
}

function chineseTempoOutOfRange(params: DiagnosticParams): string {
  const bpm = value(params, "bpm");
  const min = value(params, "min");
  const max = value(params, "max");
  return `速度 ${bpm} BPM 不在 ${min}-${max} BPM 的范围内。`;
}

function englishSeedNotInteger(params: DiagnosticParams): string {
  const seed = value(params, "seed");
  return seed === ""
    ? "The seed must be a whole number, or empty."
    : `The seed ${seed} is not a whole number. Use a whole number, or clear it.`;
}

function chineseSeedNotInteger(params: DiagnosticParams): string {
  const seed = value(params, "seed");
  return seed === "" ? "seed 必须是整数，或者留空。" : `seed ${seed} 不是整数。请填整数，或者清空。`;
}

function englishStyleInvalid(): string {
  return "The style must be text.";
}

function chineseStyleInvalid(): string {
  return "风格描述必须是文本。";
}

function englishScoreModeInvalid(): string {
  return "The score mode must be full or melody.";
}

function chineseScoreModeInvalid(): string {
  return "乐谱模式必须是 full 或 melody。";
}

function englishNotAScoreCommand(): string {
  return "This is a song-project command, not a score command; apply it to the project instead.";
}

function chineseNotAScoreCommand(): string {
  return "这是歌曲工程级命令，不是乐谱命令；请把它应用到歌曲工程上。";
}

function englishSectionUnnamed(): string {
  return "The unnamed section has no marker, so it can be deleted but not copied or moved.";
}

function chineseSectionUnnamed(): string {
  return "无名段落没有段落标记，只能删除，不能复制或移动。";
}

function englishSectionMoveStart(params: DiagnosticParams): string {
  return `The section${quoted(value(params, "section"))} is already first and cannot move earlier.`;
}

function chineseSectionMoveStart(params: DiagnosticParams): string {
  return `段落${quoted(value(params, "section"))}已经是第一段，不能再往前移。`;
}

function englishSectionMoveEnd(params: DiagnosticParams): string {
  return `The section${quoted(value(params, "section"))} is already last and cannot move later.`;
}

function chineseSectionMoveEnd(params: DiagnosticParams): string {
  return `段落${quoted(value(params, "section"))}已经是最后一段，不能再往后移。`;
}

function englishSectionBeforeUnnamed(): string {
  return "A named section cannot move before the unnamed section, which has no marker and can only come first.";
}

function chineseSectionBeforeUnnamed(): string {
  return "有名字的段落不能移到无名段落前面；无名段落没有标记，只能放在最前面。";
}

function englishSectionNameEmpty(): string {
  return "A section needs a name; the name cannot be empty.";
}

function chineseSectionNameEmpty(): string {
  return "段落需要一个名字，名字不能为空。";
}

function englishSectionNameBlank(): string {
  return "A section name cannot be only spaces or tabs.";
}

function chineseSectionNameBlank(): string {
  return "段落名不能只有空格或制表符。";
}

function englishSectionNameLineBreak(): string {
  return "A section name cannot contain a line break.";
}

function chineseSectionNameLineBreak(): string {
  return "段落名不能包含换行。";
}

function englishSectionNameTrailingSpace(): string {
  return "A section name cannot end with a space or tab, because the score format drops it.";
}

function chineseSectionNameTrailingSpace(): string {
  return "段落名不能以空格或制表符结尾，因为乐谱格式会去掉它。";
}

function englishNoteBeforeStart(): string {
  return "The note would start before the beginning of the score.";
}

function chineseNoteBeforeStart(): string {
  return "音符会被移到乐谱开头之前。";
}

function englishNotePastEnd(): string {
  return "The note would end past the end of the score.";
}

function chineseNotePastEnd(): string {
  return "音符的结尾会超出乐谱的末尾。";
}

function gridName(params: DiagnosticParams): string {
  return `${value(params, "grid")}${value(params, "dotted") === "true" ? " dotted" : ""}`;
}

function englishNoteTooShort(params: DiagnosticParams): string {
  return `A note cannot be shorter than one grid step of ${gridName(params)}.`;
}

function chineseNoteTooShort(params: DiagnosticParams): string {
  return `音符不能短于 ${gridName(params)} 网格的一步。`;
}

function englishGridNotAllowed(params: DiagnosticParams): string {
  return `The ${value(params, "grid")}${value(params, "dotted") === "true" ? " dotted" : ""} grid is not one this score can write.`;
}

function chineseGridNotAllowed(params: DiagnosticParams): string {
  return `这份乐谱写不出 ${value(params, "grid")}${value(params, "dotted") === "true" ? " 附点" : ""}的网格。`;
}

function englishOffsetNotInteger(params: DiagnosticParams): string {
  return `The ${value(params, "field")} offset must be a whole number.`;
}

function chineseOffsetNotInteger(params: DiagnosticParams): string {
  return `${value(params, "field") === "pitch" ? "音高" : "时间"}偏移必须是整数。`;
}

function englishUnitUnknown(): string {
  return "This score does not state its written duration unit, so its notes cannot be moved on a grid.";
}

function chineseUnitUnknown(): string {
  return "这份乐谱没有写明时值单位，所以不能按网格移动音符。";
}

function englishStyleNoBpm(): string {
  return "The style text has no BPM, so it was left as it is.";
}

function chineseStyleNoBpm(): string {
  return "风格描述里没有写 BPM，所以没有改动它。";
}

function englishMelodyWithChords(): string {
  return "Melody mode cannot carry chords; delete all chords or switch to full.";
}

function chineseMelodyWithChords(): string {
  return "melody 模式不能带和弦；可以删掉所有和弦，或改回 full。";
}

function englishLyricsUnaligned(params: DiagnosticParams): string {
  const count = value(params, "count");
  const isOne = count === "1";
  return `${count} lyric line${isOne ? "" : "s"} ${isOne ? "is" : "are"} unaligned and left out of the joined lyrics.`;
}

function chineseLyricsUnaligned(params: DiagnosticParams): string {
  return `有 ${value(params, "count")} 行歌词没有对齐，拼回 lyrics 时不会写进去。`;
}

function englishLyricsTooLong(params: DiagnosticParams): string {
  return `The joined lyrics are ${value(params, "count")} characters; song2 generation accepts ${value(params, "max")}.`;
}

function chineseLyricsTooLong(params: DiagnosticParams): string {
  return `拼回的 lyrics 有 ${value(params, "count")} 字，超过 song2 生成接受的 ${value(params, "max")} 字上限。`;
}

function englishLyricLineOutOfRange(params: DiagnosticParams): string {
  return `There is no lyric line at position ${value(params, "line")}.`;
}

function chineseLyricLineOutOfRange(params: DiagnosticParams): string {
  return `第 ${value(params, "line")} 行歌词不存在。`;
}

function englishLyricPhraseInvalid(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "empty":
      return "A lyric phrase needs at least one bar.";
    case "outside-score":
      return "The lyric phrase is outside this score's bars.";
    case "cross-section":
      return "A lyric phrase must stay inside one section.";
    case "not-integer":
      return "A lyric phrase must start on a whole bar and cover whole bars.";
    default:
      return "This lyric phrase is not valid.";
  }
}

function chineseLyricPhraseInvalid(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "empty":
      return "一个乐句至少要覆盖一小节。";
    case "outside-score":
      return "乐句超出了这份乐谱的小节。";
    case "cross-section":
      return "一个乐句必须落在一个段落里。";
    case "not-integer":
      return "乐句必须从整小节开始，覆盖整数个小节。";
    default:
      return "这个乐句不合法。";
  }
}

function englishLyricPhraseOverlap(params: DiagnosticParams): string {
  return `The lyric phrase from bar ${value(params, "bar")} for ${value(params, "barCount")} bars overlaps line ${value(params, "line")}.`;
}

function chineseLyricPhraseOverlap(params: DiagnosticParams): string {
  return `从第 ${value(params, "bar")} 小节起 ${value(params, "barCount")} 小节的乐句和第 ${value(params, "line")} 行重叠。`;
}

function englishLyricTextInvalid(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "not-text":
      return "A lyric line must be text.";
    case "empty":
      return "A lyric line cannot be empty.";
    case "line-break":
      return "A lyric line cannot contain a line break.";
    case "label":
      return "A lyric line cannot be only a [section] label, because it would read as a label when the lyrics are joined.";
    default:
      return "This lyric line's text is not valid.";
  }
}

function chineseLyricTextInvalid(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "not-text":
      return "歌词行的内容必须是文本。";
    case "empty":
      return "歌词行不能为空。";
    case "line-break":
      return "歌词行不能包含换行。";
    case "label":
      return "歌词行不能只有 [段落] 标签，否则拼回歌词时会被当成段落标记。";
    default:
      return "这一行歌词的内容不合法。";
  }
}

function englishLyricLinesNotMergeable(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "no-next":
      return "The last lyric line has no next line to merge with.";
    case "not-adjacent":
      return "The two lyric phrases are not next to each other, so they cannot become one phrase.";
    case "not-one-section":
      return "The two lyric phrases are in different sections, so they cannot become one phrase.";
    default:
      return "These lyric lines cannot be merged.";
  }
}

function chineseLyricLinesNotMergeable(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "no-next":
      return "最后一行歌词后面没有可以合并的行。";
    case "not-adjacent":
      return "两个乐句不相邻，不能合成一个乐句。";
    case "not-one-section":
      return "两个乐句在不同的段落里，不能合成一个乐句。";
    default:
      return "这些歌词行不能合并。";
  }
}

function englishLyricSplitInvalid(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "offset":
      return "Split a lyric line at a character inside it, not at either end.";
    case "empty-part":
      return "Both halves of a split lyric line need text.";
    case "label-part":
      return "One half of the split would read as a section label.";
    case "line-break":
      return "A split lyric line cannot contain a line break.";
    case "bar":
      return "The split bar must leave at least one bar on each side of the phrase.";
    default:
      return "This lyric line cannot be split here.";
  }
}

function chineseLyricSplitInvalid(params: DiagnosticParams): string {
  switch (value(params, "reason")) {
    case "offset":
      return "拆分歌词行时，拆分位置要在行内，不能在两端。";
    case "empty-part":
      return "拆开的两行都需有文字。";
    case "label-part":
      return "拆出的其中一半会被当成段落标记。";
    case "line-break":
      return "拆开的歌词行不能包含换行。";
    case "bar":
      return "拆分用的小节两边都至少要留一小节。";
    default:
      return "这一行歌词不能在这里拆开。";
  }
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
  chordVoice: englishChordVoice,
  chordVocabulary: englishChordVocabulary,
  barOutOfRange: englishBarOutOfRange,
  sectionOutOfRange: englishSectionOutOfRange,
  meterNotAllowed: englishMeterNotAllowed,
  noTruncation: englishNoTruncation,
  noIncompleteBar: englishNoIncompleteBar,
  tieAcrossBar: englishTieAcrossBar,
  truncatedTail: englishTruncatedTail,
  meterDoesNotFit: englishMeterDoesNotFit,
  lastBar: englishLastBar,
  cutInCompleteBar: englishCutInCompleteBar,
  pitchOutOfRange: englishPitchOutOfRange,
  semitonesNotInteger: englishSemitonesNotInteger,
  keyNotAllowed: englishKeyNotAllowed,
  keyChangeNotFound: englishKeyChangeNotFound,
  keyUnavailable: englishKeyUnavailable,
  chordInvalid: englishChordInvalid,
  tempoOutOfRange: englishTempoOutOfRange,
  seedNotInteger: englishSeedNotInteger,
  styleInvalid: englishStyleInvalid,
  scoreModeInvalid: englishScoreModeInvalid,
  notAScoreCommand: englishNotAScoreCommand,
  sectionUnnamed: englishSectionUnnamed,
  sectionMoveStart: englishSectionMoveStart,
  sectionMoveEnd: englishSectionMoveEnd,
  sectionBeforeUnnamed: englishSectionBeforeUnnamed,
  sectionNameEmpty: englishSectionNameEmpty,
  sectionNameBlank: englishSectionNameBlank,
  sectionNameLineBreak: englishSectionNameLineBreak,
  sectionNameTrailingSpace: englishSectionNameTrailingSpace,
  noteBeforeStart: englishNoteBeforeStart,
  notePastEnd: englishNotePastEnd,
  noteTooShort: englishNoteTooShort,
  gridNotAllowed: englishGridNotAllowed,
  offsetNotInteger: englishOffsetNotInteger,
  unitUnknown: englishUnitUnknown,
  styleNoBpm: englishStyleNoBpm,
  melodyWithChords: englishMelodyWithChords,
  lyricsUnaligned: englishLyricsUnaligned,
  lyricsTooLong: englishLyricsTooLong,
  lyricLineOutOfRange: englishLyricLineOutOfRange,
  lyricPhraseInvalid: englishLyricPhraseInvalid,
  lyricPhraseOverlap: englishLyricPhraseOverlap,
  lyricTextInvalid: englishLyricTextInvalid,
  lyricLinesNotMergeable: englishLyricLinesNotMergeable,
  lyricSplitInvalid: englishLyricSplitInvalid,
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
  chordVoice: chineseChordVoice,
  chordVocabulary: chineseChordVocabulary,
  barOutOfRange: chineseBarOutOfRange,
  sectionOutOfRange: chineseSectionOutOfRange,
  meterNotAllowed: chineseMeterNotAllowed,
  noTruncation: chineseNoTruncation,
  noIncompleteBar: chineseNoIncompleteBar,
  tieAcrossBar: chineseTieAcrossBar,
  truncatedTail: chineseTruncatedTail,
  meterDoesNotFit: chineseMeterDoesNotFit,
  lastBar: chineseLastBar,
  cutInCompleteBar: chineseCutInCompleteBar,
  pitchOutOfRange: chinesePitchOutOfRange,
  semitonesNotInteger: chineseSemitonesNotInteger,
  keyNotAllowed: chineseKeyNotAllowed,
  keyChangeNotFound: chineseKeyChangeNotFound,
  keyUnavailable: chineseKeyUnavailable,
  chordInvalid: chineseChordInvalid,
  tempoOutOfRange: chineseTempoOutOfRange,
  seedNotInteger: chineseSeedNotInteger,
  styleInvalid: chineseStyleInvalid,
  scoreModeInvalid: chineseScoreModeInvalid,
  notAScoreCommand: chineseNotAScoreCommand,
  sectionUnnamed: chineseSectionUnnamed,
  sectionMoveStart: chineseSectionMoveStart,
  sectionMoveEnd: chineseSectionMoveEnd,
  sectionBeforeUnnamed: chineseSectionBeforeUnnamed,
  sectionNameEmpty: chineseSectionNameEmpty,
  sectionNameBlank: chineseSectionNameBlank,
  sectionNameLineBreak: chineseSectionNameLineBreak,
  sectionNameTrailingSpace: chineseSectionNameTrailingSpace,
  noteBeforeStart: chineseNoteBeforeStart,
  notePastEnd: chineseNotePastEnd,
  noteTooShort: chineseNoteTooShort,
  gridNotAllowed: chineseGridNotAllowed,
  offsetNotInteger: chineseOffsetNotInteger,
  unitUnknown: chineseUnitUnknown,
  styleNoBpm: chineseStyleNoBpm,
  melodyWithChords: chineseMelodyWithChords,
  lyricsUnaligned: chineseLyricsUnaligned,
  lyricsTooLong: chineseLyricsTooLong,
  lyricLineOutOfRange: chineseLyricLineOutOfRange,
  lyricPhraseInvalid: chineseLyricPhraseInvalid,
  lyricPhraseOverlap: chineseLyricPhraseOverlap,
  lyricTextInvalid: chineseLyricTextInvalid,
  lyricLinesNotMergeable: chineseLyricLinesNotMergeable,
  lyricSplitInvalid: chineseLyricSplitInvalid,
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
    case "chord-voice":
      return catalog.chordVoice(diagnostic.params);
    case "chord-vocabulary":
      return catalog.chordVocabulary(diagnostic.params);
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
    case "cut-in-complete-bar":
      return catalog.cutInCompleteBar(diagnostic.params);
    case "pitch-out-of-range":
      return catalog.pitchOutOfRange(diagnostic.params);
    case "semitones-not-integer":
      return catalog.semitonesNotInteger(diagnostic.params);
    case "key-not-allowed":
      return catalog.keyNotAllowed(diagnostic.params);
    case "key-change-not-found":
      return catalog.keyChangeNotFound(diagnostic.params);
    case "key-unavailable":
      return catalog.keyUnavailable(diagnostic.params);
    case "chord-invalid":
      return catalog.chordInvalid(diagnostic.params);
    case "tempo-out-of-range":
      return catalog.tempoOutOfRange(diagnostic.params);
    case "seed-not-integer":
      return catalog.seedNotInteger(diagnostic.params);
    case "style-invalid":
      return catalog.styleInvalid(diagnostic.params);
    case "score-mode-invalid":
      return catalog.scoreModeInvalid(diagnostic.params);
    case "not-a-score-command":
      return catalog.notAScoreCommand(diagnostic.params);
    case "section-unnamed":
      return catalog.sectionUnnamed(diagnostic.params);
    case "section-move-start":
      return catalog.sectionMoveStart(diagnostic.params);
    case "section-move-end":
      return catalog.sectionMoveEnd(diagnostic.params);
    case "section-before-unnamed":
      return catalog.sectionBeforeUnnamed(diagnostic.params);
    case "section-name-empty":
      return catalog.sectionNameEmpty(diagnostic.params);
    case "section-name-blank":
      return catalog.sectionNameBlank(diagnostic.params);
    case "section-name-line-break":
      return catalog.sectionNameLineBreak(diagnostic.params);
    case "section-name-trailing-space":
      return catalog.sectionNameTrailingSpace(diagnostic.params);
    case "note-before-start":
      return catalog.noteBeforeStart(diagnostic.params);
    case "note-past-end":
      return catalog.notePastEnd(diagnostic.params);
    case "note-too-short":
      return catalog.noteTooShort(diagnostic.params);
    case "grid-not-allowed":
      return catalog.gridNotAllowed(diagnostic.params);
    case "offset-not-integer":
      return catalog.offsetNotInteger(diagnostic.params);
    case "unit-unknown":
      return catalog.unitUnknown(diagnostic.params);
    case "style-no-bpm":
      return catalog.styleNoBpm(diagnostic.params);
    case "melody-with-chords":
      return catalog.melodyWithChords(diagnostic.params);
    case "lyrics-unaligned":
      return catalog.lyricsUnaligned(diagnostic.params);
    case "lyrics-too-long":
      return catalog.lyricsTooLong(diagnostic.params);
    case "lyric-line-out-of-range":
      return catalog.lyricLineOutOfRange(diagnostic.params);
    case "lyric-phrase-invalid":
      return catalog.lyricPhraseInvalid(diagnostic.params);
    case "lyric-phrase-overlap":
      return catalog.lyricPhraseOverlap(diagnostic.params);
    case "lyric-text-invalid":
      return catalog.lyricTextInvalid(diagnostic.params);
    case "lyric-lines-not-mergeable":
      return catalog.lyricLinesNotMergeable(diagnostic.params);
    case "lyric-split-invalid":
      return catalog.lyricSplitInvalid(diagnostic.params);
    default:
      return "";
  }
}

/** True for a notice: the project it describes is usable, and the message is something to tell the user. */
export function isNoticeDiagnostic(diagnostic: Diagnostic): diagnostic is Diagnostic & {
  readonly code: NoticeDiagnosticCode;
} {
  return (NOTICE_DIAGNOSTIC_CODES as ReadonlyArray<string>).includes(diagnostic.code);
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

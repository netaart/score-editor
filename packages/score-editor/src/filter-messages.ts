// ABOUTME: The texts of the Filter button and its panel in Chinese and English, chosen by the session's language.
// ABOUTME: They live beside the panel so a change to the panel is one change; the rest of the editor's texts are in i18n.ts.
import type { Language } from "./types";

export interface FilterMessages {
  /** The button in the toolbar, and its tooltip. */
  button: string;
  buttonTip: string;
  /** The name of the panel. */
  panel: string;
  /** What the word between the two ends of a range reads. */
  to: string;
  pitch: string;
  pitchLowest: string;
  pitchHighest: string;
  time: string;
  /** The word before the first bar of the time range. */
  timeBars: string;
  timeFirst: string;
  timeLast: string;
  length: string;
  lengthShortest: string;
  lengthLongest: string;
  key: string;
  keyChoice: string;
  keyIn: string;
  keyOut: string;
  count: string;
  /** The names of the two numbers of the count, and the words around each: "One in every" 2 "notes", "Skip the first" 0 "notes". */
  countEvery: string;
  countEveryBefore: string;
  countEveryAfter: string;
  countSkip: string;
  countSkipBefore: string;
  countSkipAfter: string;
  invert: string;
  invertHint: string;
  reapply: string;
  done: string;
  /** The status line: nothing chosen yet, nothing matched, how many matched, and that what was selected is out of date. */
  statusIdle: string;
  statusNone: string;
  statusSelected(selected: number, total: number): string;
  statusStale: string;
}

const en: FilterMessages = {
  button: "Filter",
  buttonTip: "Select notes by filter",
  panel: "Select by filter",
  to: "to",
  pitch: "Pitch",
  pitchLowest: "Lowest pitch",
  pitchHighest: "Highest pitch",
  time: "Time",
  timeBars: "Bars",
  timeFirst: "First bar",
  timeLast: "Last bar",
  length: "Length",
  lengthShortest: "Shortest length",
  lengthLongest: "Longest length",
  key: "Key",
  keyChoice: "In or out of the key",
  keyIn: "In the key",
  keyOut: "Out of the key",
  count: "Count",
  countEvery: "One in every",
  countEveryBefore: "One in every",
  countEveryAfter: "notes",
  countSkip: "Skip the first",
  countSkipBefore: "Skip the first",
  countSkipAfter: "notes",
  invert: "Invert",
  invertHint: "Select the notes that do not match",
  reapply: "Re-apply",
  done: "Done",
  statusIdle: "Pick a condition to select notes.",
  statusNone: "No note matches these conditions.",
  statusSelected: (selected, total) => `${selected} of ${total} ${total === 1 ? "note" : "notes"} selected`,
  statusStale: "The score or the selection has changed since. Re-apply to select again.",
};

const zh: FilterMessages = {
  button: "筛选",
  buttonTip: "按条件筛选选中",
  panel: "筛选选中",
  to: "到",
  pitch: "音高",
  pitchLowest: "最低音",
  pitchHighest: "最高音",
  time: "时间",
  timeBars: "小节",
  timeFirst: "起始小节",
  timeLast: "结束小节",
  length: "时值",
  lengthShortest: "最短时值",
  lengthLongest: "最长时值",
  key: "调",
  keyChoice: "调内或调外",
  keyIn: "调内",
  keyOut: "调外",
  count: "个数",
  countEvery: "每几个取一个",
  countEveryBefore: "每",
  countEveryAfter: "个取一个",
  countSkip: "跳过前几个",
  countSkipBefore: "跳过前",
  countSkipAfter: "个",
  invert: "反选",
  invertHint: "选中不符合条件的音符",
  reapply: "重新应用",
  done: "完成",
  statusIdle: "选一个条件来选中音符。",
  statusNone: "没有音符符合这些条件。",
  statusSelected: (selected, total) => `已选中 ${selected} 个音符，共 ${total} 个`,
  statusStale: "乐谱或选中的音符已变，点“重新应用”再选一次。",
};

export function filterMessagesFor(language: Language): FilterMessages {
  return language === "zh" ? zh : en;
}

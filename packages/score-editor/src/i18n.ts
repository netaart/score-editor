// ABOUTME: The editor's own texts in Chinese and English, chosen by the host's language option.
// ABOUTME: The host maps nothing here: it passes "zh" or "en" and the package speaks for itself.
import type { BarPosition, Cut } from "./arrangement";
import type { Meter } from "./score";
import type { Language } from "./types";

export interface Messages {
  title: string;
  hint: string;
  hintEditing: string;
  zoom: string;
  zoomIn: string;
  zoomOut: string;
  zoomFit: string;
  readOnly: string;
  history: string;
  undo: string;
  redo: string;
  delete: string;
  bars: string;
  timeRuler: string;
  sections: string;
  unnamedSection: string;
  chords: string;
  noChords: string;
  unreadable: string;
  moreProblems(count: number): string;
  noDialect(modelId: string): string;
  marks: string;
  incompleteBar: string;
  cutOff: string;
  cutNotice(cut: Cut): string;
  meterText(meter: Meter): string;
  meterName(meter: Meter): string;
  keyText(key: string): string;
  noteLabel(pitch: string, position: BarPosition, length: number, tiedToNext: boolean, selected: boolean): string;
  /** The name of the insertion point; `position` is null at the end of the score, where no bar has the next beat. */
  insertionPoint(position: BarPosition | null): string;
}

const en: Messages = {
  title: "Arrangement",
  hint: "Scroll with the arrow keys or a swipe. Zoom with the plus and minus keys, the zoom buttons, or Ctrl and the mouse wheel.",
  hintEditing:
    "Scroll with the arrow keys or a swipe. Zoom with the plus and minus keys, the zoom buttons, or Ctrl and the mouse wheel. Click or tap a note to select it, and press Delete to turn it into a rest. Click or tap empty space to set the insertion point, then move it with Left, Right, Home and End. Ctrl and Z undoes, Ctrl and Y redoes.",
  zoom: "Zoom",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomFit: "Fit whole song",
  readOnly: "Read only",
  history: "History",
  undo: "Undo",
  redo: "Redo",
  delete: "Delete",
  bars: "Bars",
  timeRuler: "Time ruler",
  sections: "Sections",
  unnamedSection: "Unnamed",
  chords: "Chords",
  noChords: "No chords in this score",
  unreadable: "This score can't be shown because it can't be read.",
  moreProblems: (count) => `and ${count} more`,
  noDialect: (modelId) =>
    `The score format of “${modelId}” isn't supported by this editor, so the score can't be shown.`,
  marks: "Marks",
  incompleteBar: "Incomplete bar",
  cutOff: "Cut off",
  cutNotice({ voice, bar, short }) {
    if (short) return `This score is cut off: bar ${bar} of ${voice} is incomplete.`;
    return bar === 0
      ? `This score is cut off before the first bar of ${voice}.`
      : `This score is cut off after bar ${bar} of ${voice}.`;
  },
  meterText: ({ numerator, denominator }) => `${numerator}/${denominator}`,
  meterName: ({ numerator, denominator }) => `Meter ${numerator}/${denominator}`,
  keyText: (key) => `Key ${key}`,
  noteLabel(pitch, { bar, beat }, length, tiedToNext, selected) {
    const tie = tiedToNext ? ", tied to the next note" : "";
    const chosen = selected ? ", selected" : "";
    return `${pitch}, bar ${bar} beat ${beat}, length ${length} ${length === 1 ? "beat" : "beats"}${tie}${chosen}`;
  },
  insertionPoint: (position) =>
    position ? `Insertion point, bar ${position.bar} beat ${position.beat}` : "Insertion point, end of the score",
};

const zh: Messages = {
  title: "编曲视图",
  hint: "用方向键或滑动来滚动；用加号、减号键、缩放按钮或 Ctrl 加鼠标滚轮来缩放。",
  hintEditing:
    "用方向键或滑动来滚动；用加号、减号键、缩放按钮或 Ctrl 加鼠标滚轮来缩放。点击或轻点音符来选中它，按 Delete 把它变成休止符。点击或轻点空白处来放置插入点，再用左、右、Home、End 键移动。Ctrl 加 Z 撤销，Ctrl 加 Y 重做。",
  zoom: "缩放",
  zoomIn: "放大",
  zoomOut: "缩小",
  zoomFit: "适合整首歌",
  readOnly: "只读",
  history: "历史",
  undo: "撤销",
  redo: "重做",
  delete: "删除",
  bars: "小节",
  timeRuler: "时间尺",
  sections: "段落",
  unnamedSection: "未命名",
  chords: "和弦",
  noChords: "这份乐谱里没有和弦",
  unreadable: "这份乐谱读不通，所以无法显示。",
  moreProblems: (count) => `还有 ${count} 条`,
  noDialect: (modelId) => `这个编辑器不支持“${modelId}”的乐谱格式，所以无法显示这份乐谱。`,
  marks: "标记",
  incompleteBar: "不完整的小节",
  cutOff: "在此截断",
  cutNotice({ voice, bar, short }) {
    if (short) return `这份乐谱在末尾被截断：${voice} 的第 ${bar} 小节不完整。`;
    return bar === 0
      ? `这份乐谱在末尾被截断：${voice} 连第一个小节都还没有写完。`
      : `这份乐谱在末尾被截断：${voice} 写到第 ${bar} 小节为止。`;
  },
  meterText: ({ numerator, denominator }) => `${numerator}/${denominator}`,
  meterName: ({ numerator, denominator }) => `拍号 ${numerator}/${denominator}`,
  keyText: (key) => `调号 ${key}`,
  noteLabel(pitch, { bar, beat }, length, tiedToNext, selected) {
    const tie = tiedToNext ? "，连到下一个音" : "";
    return `${pitch}，第 ${bar} 小节第 ${beat} 拍，长 ${length} 拍${tie}${selected ? "，已选中" : ""}`;
  },
  insertionPoint: (position) =>
    position ? `插入点，第 ${position.bar} 小节第 ${position.beat} 拍` : "插入点，乐谱末尾",
};

const catalogs: Record<Language, Messages> = { en, zh };

export function messagesFor(language: Language): Messages {
  return catalogs[language] ?? en;
}

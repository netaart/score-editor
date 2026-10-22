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
  /** What a live region says when one note is selected, and when several are. */
  selectedNote(pitch: string, position: BarPosition): string;
  selectedNotes(count: number): string;
  /** What a live region says when a delete took one note, and when it took several. */
  deletedNote(pitch: string, position: BarPosition): string;
  deletedNotes(count: number): string;
  /** What a live region says when an undo brought back one deleted note, and when it brought back several. */
  restoredNote(pitch: string, position: BarPosition): string;
  restoredNotes(count: number): string;
}

const en: Messages = {
  title: "Arrangement",
  hint: "Scroll with the arrow keys or a swipe. Zoom with the plus and minus keys, the zoom buttons, or Ctrl and the mouse wheel.",
  hintEditing:
    "Scroll with the arrow keys or a swipe. Zoom with the plus and minus keys, the zoom buttons, or Ctrl and the mouse wheel. Click or tap a note to select it, or press Tab to reach the notes, then Left and Right to step from note to note, selecting each, and Enter or Space to select the one you are on. Shift-click or Shift-tap adds a note to the selection or takes it out. Drag across empty space to select the notes in a box. On a touch screen, touch and hold a note to add it or take it out, or touch and hold empty space and then drag to draw the box. Ctrl and A selects all, Ctrl and Shift and A selects the others instead, and Escape clears the selection. To pick notes one by one from the keyboard, Ctrl and Left, Right, Home or End move from note to note without selecting, and Shift and Space adds the note you are on or takes it out. Press Delete, Backspace or the Delete button to turn the selected notes into rests. Click or tap empty space to set the insertion point, then move it with Left, Right, Home and End. Ctrl and Z undoes, Ctrl and Y redoes.",
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
  selectedNote: (pitch, { bar, beat }) => `Selected ${pitch}, bar ${bar} beat ${beat}`,
  selectedNotes: (count) => `Selected ${count} notes`,
  deletedNote: (pitch, { bar, beat }) => `Deleted ${pitch}, bar ${bar} beat ${beat}`,
  deletedNotes: (count) => `Deleted ${count} notes`,
  restoredNote: (pitch, { bar, beat }) => `Restored ${pitch}, bar ${bar} beat ${beat}`,
  restoredNotes: (count) => `Restored ${count} notes`,
};

const zh: Messages = {
  title: "编曲视图",
  hint: "用方向键或滑动来滚动；用加号、减号键、缩放按钮或 Ctrl 加鼠标滚轮来缩放。",
  hintEditing:
    "用方向键或滑动来滚动；用加号、减号键、缩放按钮或 Ctrl 加鼠标滚轮来缩放。点击或轻点音符来选中它，也可以按 Tab 到达音符，再用左、右键在音符之间逐个移动并选中，用 Enter 或空格选中当前所在的音符。按住 Shift 点击或轻点音符，可把它加进选中或移出选中；在空白处拖动，可框选框里的音符；在触屏上，长按音符可加进或移出选中，长按空白处再拖动可画出选框。Ctrl 加 A 全选，Ctrl 加 Shift 加 A 反选，Esc 取消选中。用键盘逐个挑选时，Ctrl 加左、右、Home 或 End 在音符之间移动但不改变选中，Shift 加空格把当前音符加进或移出选中。按 Delete、Backspace 或删除按钮把选中的音符变成休止符。点击或轻点空白处来放置插入点，再用左、右、Home、End 键移动。Ctrl 加 Z 撤销，Ctrl 加 Y 重做。",
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
  selectedNote: (pitch, { bar, beat }) => `已选中 ${pitch}，第 ${bar} 小节第 ${beat} 拍`,
  selectedNotes: (count) => `已选中 ${count} 个音符`,
  deletedNote: (pitch, { bar, beat }) => `已删除 ${pitch}，第 ${bar} 小节第 ${beat} 拍`,
  deletedNotes: (count) => `已删除 ${count} 个音符`,
  restoredNote: (pitch, { bar, beat }) => `已恢复 ${pitch}，第 ${bar} 小节第 ${beat} 拍`,
  restoredNotes: (count) => `已恢复 ${count} 个音符`,
};

const catalogs: Record<Language, Messages> = { en, zh };

export function messagesFor(language: Language): Messages {
  return catalogs[language] ?? en;
}

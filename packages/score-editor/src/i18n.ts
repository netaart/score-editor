// ABOUTME: The editor's own texts in Chinese and English, chosen by the host's language option.
// ABOUTME: The host maps nothing here: it passes "zh" or "en" and the package speaks for itself.
import type { BarPosition, Cut } from "./arrangement";
import type { Grid } from "./commands-notes";
import type { Meter } from "./score";
import type { ViewName } from "./session";
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
  select: string;
  selectAll: string;
  selectInvert: string;
  selectClear: string;
  /** The name of the Grid menu, its tooltip, a choice in it (`Dotted 1/8`), and the tooltip of a choice the score cannot write. */
  grid: string;
  gridTip: string;
  gridValue(grid: Grid): string;
  gridUnavailable: string;
  /** What the live region says when a grid the score cannot write is put back to the default; `dropped` is the old grid. */
  gridDropped(dropped: Grid): string;
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
  /** What a live region says when a move took one note to a new place or pitch, and when it took several. */
  movedNote(pitch: string, position: BarPosition): string;
  movedNotes(count: number): string;
  /** What a live region says when a resize gave one note a new length (in beats of its bar), and when it gave several. */
  resizedNote(pitch: string, position: BarPosition, length: number): string;
  resizedNotes(count: number): string;
  /** The text view: the name of its box and of its list of problems, and the sentence under the box. */
  scoreText: string;
  problems: string;
  noProblems: string;
  /** `kept`: the text is not in the project, which still has the last score that read. */
  problemCount(count: number, kept: boolean): string;
  /** The view switch: the name of its group, the name of the staff view, and the stale notice. */
  viewSwitch: string;
  staff: string;
  staleNotice: string;
  /** The staff view: what its drawing is, and what it says while abcjs is on its way and when abcjs fails. */
  staffDrawing: string;
  staffLoading: string;
  staffFailed: string;
  /** The synth preview control: the two words on its button, the caption that says what the sound is, and what it says aloud. */
  previewPlay: string;
  previewStop: string;
  previewCaption: string;
  /** Said when the preview starts; `position` is null when it starts at the beginning of the score. */
  previewStarted(position: BarPosition | null): string;
  previewStopped: string;
  previewNothing: string;
  previewUnsupported: string;
  previewBlocked: string;
  /** Draft keeper notices: the source changed under a draft, and a write or removal did not reach the host store. */
  draftSourceChanged: string;
  draftSaveFailed: string;
}

/** A grid the way a menu item and the button name it: the dotted word of the language, then the fraction. */
const gridValueIn = (dotted: string) => (grid: Grid): string => `${grid.dotted === true ? dotted : ""}1/${grid.value}`;
const enGridValue = gridValueIn("Dotted ");
const zhGridValue = gridValueIn("附点 ");

const en: Messages = {
  title: "Arrangement",
  hint: "Scroll with the arrow keys or a swipe. Zoom with the plus and minus keys, the zoom buttons, or Ctrl and the mouse wheel.",
  hintEditing:
    "Scroll with the arrow keys or a swipe. Zoom with the plus and minus keys, the zoom buttons, or Ctrl and the mouse wheel. Click or tap a note to select it, or press Tab to reach the notes, then, while no note is selected, Left and Right to step from note to note, selecting each, and Enter or Space to select the one you are on. Shift-click or Shift-tap adds a note to the selection or takes it out. Drag across empty space to select the notes in a box. On a touch screen, touch and hold a note to add it or take it out, or touch and hold empty space and then drag to draw the box. Ctrl and A selects all, Ctrl and Shift and A selects the others instead, and Escape clears the selection. To pick notes one by one from the keyboard, Ctrl and Left, Right, Home or End move from note to note without selecting, and Shift and Space adds the note you are on or takes it out. Press Delete, Backspace or the Delete button to turn the selected notes into rests. With notes selected, Left and Right move them by one step of the grid, Up and Down by a semitone, Shift with Up or Down by an octave, and Shift with Left or Right changes their length by a step; the Grid menu sets the step, and Ctrl with Left or Right then moves between notes. Drag a selected note to move it, or drag its left or right edge to change its length; Escape gives the drag up. Click or tap empty space to set the insertion point, then move it with Left, Right, Home and End. Ctrl and Z undoes, Ctrl and Y redoes.",
  zoom: "Zoom",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomFit: "Fit whole song",
  readOnly: "Read only",
  history: "History",
  undo: "Undo",
  redo: "Redo",
  delete: "Delete",
  select: "Select",
  selectAll: "Select all",
  selectInvert: "Invert selection",
  selectClear: "Clear selection",
  grid: "Grid",
  gridTip: "Grid: the step notes move and resize by, and the insertion point snaps to",
  gridValue: enGridValue,
  gridUnavailable: "This score cannot write this step",
  gridDropped: (dropped) =>
    `The grid went back to ${enGridValue({ value: 4 })}: this score cannot write ${enGridValue(dropped)}`,
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
  movedNote: (pitch, { bar, beat }) => `Moved to ${pitch}, bar ${bar} beat ${beat}`,
  movedNotes: (count) => `Moved ${count} notes`,
  resizedNote: (pitch, { bar, beat }, length) =>
    `Resized ${pitch}, bar ${bar} beat ${beat}, length ${length} ${length === 1 ? "beat" : "beats"}`,
  resizedNotes: (count) => `Resized ${count} notes`,
  scoreText: "Score text",
  problems: "Problems",
  noProblems: "No problems",
  problemCount: (count, kept) =>
    `${count} ${count === 1 ? "problem" : "problems"}${kept ? ". The other views still show the last readable score." : ""}`,
  viewSwitch: "View",
  staff: "Staff",
  staleNotice:
    "The score text has a problem, so this view still shows the last score that could be read. Fix it in the text view.",
  staffDrawing: "The score drawn on a staff",
  staffLoading: "Loading the staff…",
  staffFailed: "The staff couldn't be drawn. The other views still work.",
  previewPlay: "Preview",
  previewStop: "Stop",
  previewCaption: "Synthetic preview, not the final sound",
  previewStarted: (position) =>
    position
      ? `Playing the preview from bar ${position.bar} beat ${position.beat}`
      : "Playing the preview from the start",
  previewStopped: "Preview stopped",
  previewNothing: "There is nothing to play from here",
  previewUnsupported: "This browser can’t play the preview",
  previewBlocked: "Blocked by the browser. Press Preview again.",
  draftSourceChanged: "The original has changed since this draft was saved, so the draft was discarded.",
  draftSaveFailed: "The draft was not saved or cleared. The next change tries again.",
};

const zh: Messages = {
  title: "编曲视图",
  hint: "用方向键或滑动来滚动；用加号、减号键、缩放按钮或 Ctrl 加鼠标滚轮来缩放。",
  hintEditing:
    "用方向键或滑动来滚动；用加号、减号键、缩放按钮或 Ctrl 加鼠标滚轮来缩放。点击或轻点音符来选中它，也可以按 Tab 到达音符，没有音符被选中时，再用左、右键在音符之间逐个移动并选中，用 Enter 或空格选中当前所在的音符。按住 Shift 点击或轻点音符，可把它加进选中或移出选中；在空白处拖动，可框选框里的音符；在触屏上，长按音符可加进或移出选中，长按空白处再拖动可画出选框。Ctrl 加 A 全选，Ctrl 加 Shift 加 A 反选，Esc 取消选中。用键盘逐个挑选时，Ctrl 加左、右、Home 或 End 在音符之间移动但不改变选中，Shift 加空格把当前音符加进或移出选中。按 Delete、Backspace 或删除按钮把选中的音符变成休止符。选中音符后，左、右键按一格网格前后挪，上、下键按半音升降，Shift 加上、下键按八度升降，Shift 加左、右键按一格改长短；网格菜单设定一格的大小，这时 Ctrl 加左、右键才在音符之间移动。拖动选中的音符来移动它，拖它的左边缘或右边缘来改长短，按 Esc 放弃这次拖动。点击或轻点空白处来放置插入点，再用左、右、Home、End 键移动。Ctrl 加 Z 撤销，Ctrl 加 Y 重做。",
  zoom: "缩放",
  zoomIn: "放大",
  zoomOut: "缩小",
  zoomFit: "适合整首歌",
  readOnly: "只读",
  history: "历史",
  undo: "撤销",
  redo: "重做",
  delete: "删除",
  select: "选择",
  selectAll: "全选",
  selectInvert: "反选",
  selectClear: "取消选中",
  grid: "网格",
  gridTip: "网格：音符移动和改长短的一格，插入点也吸附到网格上",
  gridValue: zhGridValue,
  gridUnavailable: "这份乐谱写不出这一格",
  gridDropped: (dropped) =>
    `网格已回到 ${zhGridValue({ value: 4 })}：这份乐谱写不出 ${zhGridValue(dropped)}`,
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
  movedNote: (pitch, { bar, beat }) => `已移到 ${pitch}，第 ${bar} 小节第 ${beat} 拍`,
  movedNotes: (count) => `已移动 ${count} 个音符`,
  resizedNote: (pitch, { bar, beat }, length) => `已调整 ${pitch}，第 ${bar} 小节第 ${beat} 拍，长 ${length} 拍`,
  resizedNotes: (count) => `已调整 ${count} 个音符的长短`,
  scoreText: "乐谱文本",
  problems: "问题",
  noProblems: "没有问题",
  problemCount: (count, kept) => `${count} 个问题${kept ? "。其他视图显示的仍是上一份能读的乐谱。" : ""}`,
  viewSwitch: "视图",
  staff: "五线谱",
  staleNotice: "乐谱文本里有问题，所以这个视图显示的仍是上一份能读的乐谱。请在文本视图中修正。",
  staffDrawing: "用五线谱画出的乐谱",
  staffLoading: "正在载入五线谱…",
  staffFailed: "五线谱画不出来。其他视图不受影响。",
  previewPlay: "试听",
  previewStop: "停止",
  previewCaption: "合成试听，不代表成品效果",
  previewStarted: (position) => (position ? `从第 ${position.bar} 小节第 ${position.beat} 拍开始试听` : "从头开始试听"),
  previewStopped: "试听已停止",
  previewNothing: "从这里开始没有可以试听的内容",
  previewUnsupported: "这个浏览器无法播放试听",
  previewBlocked: "浏览器没有允许发声，请再按一次试听",
  draftSourceChanged: "原版在这份草稿保存之后变过，草稿已经丢弃。",
  draftSaveFailed: "草稿没有保存或清除成功，下一次改动会再试。",
};

const catalogs: Record<Language, Messages> = { en, zh };

/** What a view is called: in the switch, as its tooltip, and as the toolbar's title while it is shown. */
export function viewName(t: Messages, view: ViewName): string {
  return { arrangement: t.title, staff: t.staff, text: t.scoreText }[view];
}

export function messagesFor(language: Language): Messages {
  return catalogs[language] ?? en;
}

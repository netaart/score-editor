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
  /** The tempo, key and transpose controls of the toolbar: the group's name, the field's name and what is said aloud. */
  songControls: string;
  tempo: string;
  tempoSet(bpm: number): string;
  key: string;
  keyMajor: string;
  keyMinor: string;
  keySet(key: string): string;
  transposeDown: string;
  transposeUp: string;
  /** Said when the whole song moved by a semitone; `semitones` is -1 or 1. */
  transposed(semitones: number): string;
  /** The song project panel and its toolbar button; `projectNotices` is the button's name while the project carries notices. */
  projectName: string;
  projectNotices(count: number): string;
  projectNotSet: string;
  projectStyle: string;
  projectStyleHint: string;
  projectStyleEmpty: string;
  projectMode: string;
  projectModeFull: string;
  projectModeFullHint: string;
  projectModeMelody: string;
  projectModeMelodyHint: string;
  projectModeEmpty: string;
  projectSeed: string;
  projectSeedClear: string;
  projectSeedClearName: string;
  projectSeedHint: string;
  projectSeedEmpty: string;
  projectLyrics: string;
  projectLyricsHint: string;
  projectLyricsEmpty: string;
  projectLyricsUnreadable: string;
  /** The joined lyrics' length against what generation accepts, written as the notice for it writes them. */
  projectLyricsCount(count: string, max: string): string;
  projectRemoveChords: string;
  projectSwitchToFull: string;
  /** Said when a field of the panel was taken. */
  projectStyleSaid: string;
  projectSeedSaid(seed: number): string;
  projectSeedClearedSaid: string;
  projectModeSaid(mode: "full" | "melody"): string;
  projectChordsRemovedSaid: string;
  /** The section menu. `name` is null for the unnamed music before the first marker. The name of a band's control and of its menu. */
  sectionButton(name: string | null): string;
  /** The choices, without the ellipsis the menu adds to the three that open the name form. */
  sectionRename: string;
  sectionNameIt: string;
  sectionStart: string;
  sectionMoveEarlier: string;
  sectionMoveLater: string;
  sectionDuplicate: string;
  sectionDelete: string;
  /** The name form: its two fields, the line that says which bars the opened section covers, and its buttons. */
  sectionFormName: string;
  sectionFormBar: string;
  sectionFormCovers(firstBar: number, lastBar: number): string;
  /** Said under the bar field while the bar typed is the first bar of a section, which the command renames and does not split. */
  sectionFormRenames(name: string | null, bar: number): string;
  /** Said instead of the opened section's line while the typed bar lies inside another section, which the command splits there. */
  sectionFormBarCovers(name: string | null, bar: number, firstBar: number, lastBar: number): string;
  sectionFormCancel: string;
  sectionConfirmName: string;
  sectionConfirmStart: string;
  /** What a live region says once a section command was taken. */
  sectionDeleted(name: string | null): string;
  sectionDuplicated(name: string | null): string;
  sectionMoved(name: string | null, direction: "earlier" | "later"): string;
  sectionRenamed(from: string | null, to: string): string;
  sectionStarted(name: string, bar: number): string;
  /** The lyric track: its name, what it says with no lyrics and with none on bars, and the name of the area of lines not on bars. */
  lyrics: string;
  noLyrics: string;
  noLyricsOnBars: string;
  lyricUnaligned: string;
  /** The words in a phrase block: syllables over note starts. */
  lyricCount(syllables: number, starts: number): string;
  /** The name of a phrase: its place, the two counts in words, whether they are equal, whether it is selected, and its text. */
  lyricPhraseLabel(info: LyricPhraseInfo): string;
  lyricUnalignedLabel(line: number, text: string, selected: boolean): string;
  /** The handles of a phrase's two edges (sliders on the bar lines), the value they read aloud, and the grip of a line not on bars. */
  lyricStartHandle(line: number, bar: number): string;
  lyricEndHandle(line: number, bar: number): string;
  lyricBarValue(bar: number): string;
  lyricGrip(line: number): string;
  /** The editor of a line: the names of its box and of its buttons. */
  lyricTextLabel: string;
  lyricNewTextLabel: string;
  lyricEditorLabel(line: number): string;
  lyricNewLine: string;
  lyricAdd: string;
  lyricSplit: string;
  lyricMerge: string;
  lyricDelete: string;
  /** The way to put a line that is not on bars on a bar without dragging: a bar number and the button that places it. */
  lyricBarField: string;
  lyricPlace: string;
  /** What the track tells a person who selects a line, in a sentence its lists are described by. */
  lyricHint: string;
  lyricUnalignedHint: string;
  lyricLegend: string;
  /** What a live region says after an edit of a line. */
  lyricMoved(line: number, first: number, last: number): string;
  lyricPlaced(line: number, bar: number): string;
  lyricTextSet(line: number): string;
  lyricAdded(line: number): string;
  lyricDeleted(line: number): string;
  lyricSplitDone(line: number): string;
  lyricMerged(line: number): string;
  /** What the badge says in place of "Read only" while a draft keeper is still reading the host's store. */
  draftOpening: string;
  /** The conflict strip: its name, the sentence that says what happened, and each way out with what it does. */
  draftConflict: string;
  draftConflictText: string;
  draftOverwrite: string;
  draftOverwriteNote: string;
  draftLoadTheirs: string;
  draftLoadTheirsNote: string;
  /** Restore original: the button, the question it asks and what that costs, the two answers, and what is said once it is done. */
  restoreOriginal: string;
  restoreQuestion: string;
  restoreWarning: string;
  restoreCancel: string;
  restoreDone: string;
  /** Said when the original is back but the stored draft could not be cleared. */
  restoreNotCleared: string;
}

/** A grid the way a menu item and the button name it: the dotted word of the language, then the fraction. */
const gridValueIn =
  (dotted: string) =>
  (grid: Grid): string =>
    `${grid.dotted === true ? dotted : ""}1/${grid.value}`;
const enGridValue = gridValueIn("Dotted ");
const zhGridValue = gridValueIn("附点 ");

/** What a phrase's name says about it; `first` and `last` are 1-based bars. */
export interface LyricPhraseInfo {
  readonly line: number;
  readonly text: string;
  readonly first: number;
  readonly last: number;
  readonly syllables: number;
  readonly starts: number;
  readonly equal: boolean;
  readonly selected: boolean;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const en: Messages = {
  title: "Arrangement",
  hint: "Scroll with the arrow keys or a swipe. Zoom with the plus and minus keys, the zoom buttons, or Ctrl and the mouse wheel.",
  hintEditing:
    "Scroll with the arrow keys or a swipe. Zoom with the plus and minus keys, the zoom buttons, or Ctrl and the mouse wheel. Click or tap a note to select it, or press Tab to reach the notes, then, while no note is selected, Left and Right to step from note to note, selecting each, and Enter or Space to select the one you are on. Shift-click or Shift-tap adds a note to the selection or takes it out. Drag across empty space to select the notes in a box. On a touch screen, touch and hold a note to add it or take it out, or touch and hold empty space and then drag to draw the box. Ctrl and A selects all, Ctrl and Shift and A selects the others instead, and Escape clears the selection. To pick notes one by one from the keyboard, Ctrl and Left, Right, Home or End move from note to note without selecting, and Shift and Space adds the note you are on or takes it out. Press Delete, Backspace or the Delete button to turn the selected notes into rests. With notes selected, Left and Right move them by one step of the grid, Up and Down by a semitone, Shift with Up or Down by an octave, and Shift with Left or Right changes their length by a step; the Grid menu sets the step, and Ctrl with Left or Right then moves between notes. Drag a selected note to move it, or drag its left or right edge to change its length; Escape gives the drag up. Click or tap empty space to set the insertion point, then move it with Left, Right, Home and End. Ctrl and Z undoes, Ctrl and Y redoes. Click or tap the name of a section in the bar above the notes to open its menu, which renames, moves, duplicates or deletes the section. From the keyboard, press Shift and F10, or the Menu key, on the arrangement to open the menu of the section at the insertion point; once the focus is on a section, Left and Right move from section to section and Enter opens its menu.",
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
  songControls: "Tempo, key and transpose",
  tempo: "Tempo (BPM)",
  tempoSet: (bpm) => `Tempo set to ${bpm} BPM`,
  key: "Key",
  keyMajor: "Major",
  keyMinor: "Minor",
  keySet: (key) => `Key set to ${key}`,
  transposeDown: "Transpose down a semitone",
  transposeUp: "Transpose up a semitone",
  transposed: (semitones) => `Transposed ${semitones < 0 ? "down" : "up"} a semitone`,
  projectName: "Project",
  projectNotices: (count) => `Project, ${count} ${count === 1 ? "notice" : "notices"}`,
  projectNotSet: "Not set",
  projectStyle: "Style description",
  projectStyleHint: "A BPM written here follows the tempo.",
  projectStyleEmpty: "Not set. Describe the style you want.",
  projectMode: "Score mode",
  projectModeFull: "Full",
  projectModeFullHint: "Melody and chords",
  projectModeMelody: "Melody",
  projectModeMelodyHint: "Melody only, no chords",
  projectModeEmpty: "Not set. Choose one.",
  projectSeed: "Seed",
  projectSeedClear: "Clear",
  projectSeedClearName: "Clear the seed",
  projectSeedHint: "Clear it to let each generation pick its own.",
  projectSeedEmpty: "Not set. Each generation picks its own.",
  projectLyrics: "Lyrics",
  projectLyricsHint: "As the next generation receives them. Not editable here.",
  projectLyricsEmpty: "No lyrics yet.",
  projectLyricsUnreadable: "The score can’t be read, so the lyrics can’t be joined.",
  projectLyricsCount: (count, max) => `${count} of ${max} characters`,
  projectRemoveChords: "Delete all chords",
  projectSwitchToFull: "Switch to full",
  projectStyleSaid: "Style description updated",
  projectSeedSaid: (seed) => `Seed set to ${seed}`,
  projectSeedClearedSaid: "Seed cleared",
  projectModeSaid: (mode) => `Score mode set to ${mode}`,
  projectChordsRemovedSaid: "All chords deleted",
  sectionButton: (name) => (name === null ? "Unnamed section" : `Section ${name}`),
  sectionRename: "Rename",
  sectionNameIt: "Name this section",
  sectionStart: "Start a section at a bar",
  sectionMoveEarlier: "Move earlier",
  sectionMoveLater: "Move later",
  sectionDuplicate: "Duplicate",
  sectionDelete: "Delete section",
  sectionFormName: "Name",
  sectionFormBar: "Bar",
  sectionFormCovers: (first, last) =>
    first === last ? `This section is bar ${first}.` : `This section covers bars ${first} to ${last}.`,
  sectionFormRenames: (name, bar) =>
    name === null
      ? `Bar ${bar} starts the unnamed section, so this names it.`
      : `Bar ${bar} starts “${name}”, so this renames it.`,
  sectionFormBarCovers: (name, bar, first, last) =>
    name === null
      ? `Bar ${bar} is in the unnamed section, which covers bars ${first} to ${last}, so this splits it.`
      : `Bar ${bar} is in “${name}”, which covers bars ${first} to ${last}, so this splits it.`,
  sectionFormCancel: "Cancel",
  sectionConfirmName: "Name",
  sectionConfirmStart: "Start section",
  sectionDeleted: (name) => (name === null ? "Deleted the unnamed section" : `Deleted section “${name}”`),
  sectionDuplicated: (name) => (name === null ? "Duplicated the unnamed section" : `Duplicated section “${name}”`),
  sectionMoved: (name, direction) =>
    `Moved ${name === null ? "the unnamed section" : `section “${name}”`} ${direction}`,
  sectionRenamed: (from, to) =>
    from === null ? `Named the unnamed section “${to}”` : `Renamed section “${from}” to “${to}”`,
  sectionStarted: (name, bar) => `Started section “${name}” at bar ${bar}`,
  lyrics: "Lyrics",
  noLyrics: "No lyrics in this song",
  noLyricsOnBars: "No lyric line sits on bars yet",
  lyricUnaligned: "Not aligned",
  lyricCount: (syllables, starts) => `${syllables} / ${starts}`,
  lyricPhraseLabel: ({ line, text, first, last, syllables, starts, equal, selected }) =>
    `Line ${line}, ${first === last ? `bar ${first}` : `bars ${first} to ${last}`}, ${plural(syllables, "syllable", "syllables")} and ${plural(starts, "note start", "note starts")}, ${equal ? "equal" : "they differ"}${selected ? ", selected" : ""}: ${text}`,
  lyricUnalignedLabel: (line, text, selected) => `Line ${line}, not aligned${selected ? ", selected" : ""}: ${text}`,
  lyricStartHandle: (line, bar) => `Start of line ${line}, bar ${bar}`,
  lyricEndHandle: (line, bar) => `End of line ${line}, bar ${bar}`,
  lyricBarValue: (bar) => `bar ${bar}`,
  lyricGrip: (line) => `Drag line ${line} onto bars`,
  lyricTextLabel: "Lyric line text",
  lyricNewTextLabel: "New lyric line text",
  lyricEditorLabel: (line) => `Line ${line}`,
  lyricNewLine: "New line",
  lyricAdd: "Add",
  lyricSplit: "Split at cursor",
  lyricMerge: "Merge with next",
  lyricDelete: "Delete line",
  lyricBarField: "Bar number",
  lyricPlace: "Place on bar",
  lyricHint:
    "Select a line to edit its text. The start and end handles of a selected line move it one bar with the Left and Right keys, and as far as they can go with Home and End. Delete removes the line.",
  lyricUnalignedHint: "Drag a line onto bars, or choose it and type a bar number.",
  lyricLegend: "syllables / note starts",
  lyricMoved: (line, first, last) =>
    `Line ${line} now covers ${first === last ? `bar ${first}` : `bars ${first} to ${last}`}`,
  lyricPlaced: (line, bar) => `Line ${line} placed on bar ${bar}`,
  lyricTextSet: (line) => `Line ${line} text changed`,
  lyricAdded: (line) => `Line ${line} added, not aligned`,
  lyricDeleted: (line) => `Line ${line} deleted`,
  lyricSplitDone: (line) => `Line ${line} split into lines ${line} and ${line + 1}`,
  lyricMerged: (line) => `Lines ${line} and ${line + 1} merged`,
  draftOpening: "Opening draft…",
  draftConflict: "Draft conflict",
  draftConflictText:
    "This draft was changed somewhere else after you opened it. Your changes are not being saved until you choose.",
  draftOverwrite: "Overwrite with my version",
  draftOverwriteNote: "The other version is replaced by yours.",
  draftLoadTheirs: "Load the other version",
  draftLoadTheirsNote: "It opens here, and your changes in this window are dropped.",
  restoreOriginal: "Restore original",
  restoreQuestion: "Go back to the original score?",
  restoreWarning: "Every change you made is discarded and the saved draft is deleted. You can't undo this.",
  restoreCancel: "Cancel",
  restoreDone: "The original score is back",
  restoreNotCleared:
    "The original score is back, but the saved draft could not be deleted. The next change tries again.",
};

const zh: Messages = {
  title: "编曲视图",
  hint: "用方向键或滑动来滚动；用加号、减号键、缩放按钮或 Ctrl 加鼠标滚轮来缩放。",
  hintEditing:
    "用方向键或滑动来滚动；用加号、减号键、缩放按钮或 Ctrl 加鼠标滚轮来缩放。点击或轻点音符来选中它，也可以按 Tab 到达音符，没有音符被选中时，再用左、右键在音符之间逐个移动并选中，用 Enter 或空格选中当前所在的音符。按住 Shift 点击或轻点音符，可把它加进选中或移出选中；在空白处拖动，可框选框里的音符；在触屏上，长按音符可加进或移出选中，长按空白处再拖动可画出选框。Ctrl 加 A 全选，Ctrl 加 Shift 加 A 反选，Esc 取消选中。用键盘逐个挑选时，Ctrl 加左、右、Home 或 End 在音符之间移动但不改变选中，Shift 加空格把当前音符加进或移出选中。按 Delete、Backspace 或删除按钮把选中的音符变成休止符。选中音符后，左、右键按一格网格前后挪，上、下键按半音升降，Shift 加上、下键按八度升降，Shift 加左、右键按一格改长短；网格菜单设定一格的大小，这时 Ctrl 加左、右键才在音符之间移动。拖动选中的音符来移动它，拖它的左边缘或右边缘来改长短，按 Esc 放弃这次拖动。点击或轻点空白处来放置插入点，再用左、右、Home、End 键移动。Ctrl 加 Z 撤销，Ctrl 加 Y 重做。点击或轻点音符上方小节条里的段落名，打开该段落的菜单，可以重命名、移动、复制或删除这一段。用键盘时，在编曲视图上按 Shift 加 F10 或菜单键，打开插入点所在段落的菜单；焦点在某个段落上后，左、右键在段落之间移动，Enter 打开它的菜单。",
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
  gridDropped: (dropped) => `网格已回到 ${zhGridValue({ value: 4 })}：这份乐谱写不出 ${zhGridValue(dropped)}`,
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
  songControls: "速度、调和移调",
  tempo: "速度（BPM）",
  tempoSet: (bpm) => `速度已设为 ${bpm} BPM`,
  key: "调",
  keyMajor: "大调",
  keyMinor: "小调",
  keySet: (key) => `已改为 ${key} 调`,
  transposeDown: "降半音",
  transposeUp: "升半音",
  transposed: (semitones) => (semitones < 0 ? "整首已降半音" : "整首已升半音"),
  projectName: "歌曲项目",
  projectNotices: (count) => `歌曲项目，${count} 条提示`,
  projectNotSet: "未设置",
  projectStyle: "风格描述",
  projectStyleHint: "这里写的 BPM 会跟着速度一起改。",
  projectStyleEmpty: "未设置。写下想要的风格。",
  projectMode: "谱面模式",
  projectModeFull: "完整（full）",
  projectModeFullHint: "旋律和和弦",
  projectModeMelody: "旋律（melody）",
  projectModeMelodyHint: "只有旋律，没有和弦",
  projectModeEmpty: "未设置。请选一个。",
  projectSeed: "种子",
  projectSeedClear: "清除",
  projectSeedClearName: "清除种子",
  projectSeedHint: "清除后，每次生成会自己挑种子。",
  projectSeedEmpty: "未设置。每次生成会自己挑种子。",
  projectLyrics: "歌词",
  projectLyricsHint: "下一次生成收到的样子，这里不能编辑。",
  projectLyricsEmpty: "还没有歌词。",
  projectLyricsUnreadable: "谱面读不出来，所以拼不出歌词。",
  projectLyricsCount: (count, max) => `${count} / ${max} 字`,
  projectRemoveChords: "删掉所有和弦",
  projectSwitchToFull: "改为 full",
  projectStyleSaid: "风格描述已更新",
  projectSeedSaid: (seed) => `种子已设为 ${seed}`,
  projectSeedClearedSaid: "种子已清除",
  projectModeSaid: (mode) => `谱面模式已设为 ${mode}`,
  projectChordsRemovedSaid: "所有和弦已删除",
  sectionButton: (name) => (name === null ? "未命名段落" : `段落 ${name}`),
  sectionRename: "重命名",
  sectionNameIt: "给这段命名",
  sectionStart: "从某个小节另起一段",
  sectionMoveEarlier: "往前移",
  sectionMoveLater: "往后移",
  sectionDuplicate: "复制",
  sectionDelete: "删除这一段",
  sectionFormName: "名称",
  sectionFormBar: "小节",
  sectionFormCovers: (first, last) =>
    first === last ? `这一段是第 ${first} 小节。` : `这一段是第 ${first} 到 ${last} 小节。`,
  sectionFormRenames: (name, bar) =>
    name === null
      ? `第 ${bar} 小节是未命名段落的开头，所以这会给它命名。`
      : `第 ${bar} 小节是段落“${name}”的开头，所以这会重命名它。`,
  sectionFormBarCovers: (name, bar, first, last) =>
    name === null
      ? `第 ${bar} 小节在未命名段落中（第 ${first} 到 ${last} 小节），所以这会把它分成两段。`
      : `第 ${bar} 小节在段落“${name}”中（第 ${first} 到 ${last} 小节），所以这会把它分成两段。`,
  sectionFormCancel: "取消",
  sectionConfirmName: "命名",
  sectionConfirmStart: "另起一段",
  sectionDeleted: (name) => (name === null ? "已删除未命名的段落" : `已删除段落“${name}”`),
  sectionDuplicated: (name) => (name === null ? "已复制未命名的段落" : `已复制段落“${name}”`),
  sectionMoved: (name, direction) =>
    `${name === null ? "未命名的段落" : `段落“${name}”`}已往${direction === "earlier" ? "前" : "后"}移`,
  sectionRenamed: (from, to) => (from === null ? `已把未命名的段落命名为“${to}”` : `已把段落“${from}”重命名为“${to}”`),
  sectionStarted: (name, bar) => `已在第 ${bar} 小节另起段落“${name}”`,
  lyrics: "歌词",
  noLyrics: "这首歌还没有歌词",
  noLyricsOnBars: "还没有歌词行放在小节上",
  lyricUnaligned: "未对齐",
  lyricCount: (syllables, starts) => `${syllables} / ${starts}`,
  lyricPhraseLabel: ({ line, text, first, last, syllables, starts, equal, selected }) =>
    `第 ${line} 行，${first === last ? `第 ${first} 小节` : `第 ${first} 至 ${last} 小节`}，${syllables} 个音节、${starts} 个音符起点，${equal ? "相等" : "不相等"}${selected ? "，已选中" : ""}：${text}`,
  lyricUnalignedLabel: (line, text, selected) => `第 ${line} 行，未对齐${selected ? "，已选中" : ""}：${text}`,
  lyricStartHandle: (line, bar) => `第 ${line} 行的起点，第 ${bar} 小节`,
  lyricEndHandle: (line, bar) => `第 ${line} 行的终点，第 ${bar} 小节`,
  lyricBarValue: (bar) => `第 ${bar} 小节`,
  lyricGrip: (line) => `把第 ${line} 行拖到小节上`,
  lyricTextLabel: "歌词行文字",
  lyricNewTextLabel: "新歌词行的文字",
  lyricEditorLabel: (line) => `第 ${line} 行`,
  lyricNewLine: "新增一行",
  lyricAdd: "添加",
  lyricSplit: "在光标处拆开",
  lyricMerge: "与下一行合并",
  lyricDelete: "删除这一行",
  lyricBarField: "小节号",
  lyricPlace: "放到这一小节",
  lyricHint:
    "选中一行即可改它的文字。选中行的起点和终点手柄可以用左、右键按小节移动，用 Home、End 移到能到的最远处。按 Delete 删除这一行。",
  lyricUnalignedHint: "把一行拖到小节上，或选中它再输入小节号。",
  lyricLegend: "音节 / 音符起点",
  lyricMoved: (line, first, last) =>
    `第 ${line} 行现在占 ${first === last ? `第 ${first} 小节` : `第 ${first} 至 ${last} 小节`}`,
  lyricPlaced: (line, bar) => `第 ${line} 行已放到第 ${bar} 小节`,
  lyricTextSet: (line) => `第 ${line} 行的文字已改`,
  lyricAdded: (line) => `已添加第 ${line} 行，未对齐`,
  lyricDeleted: (line) => `已删除第 ${line} 行`,
  lyricSplitDone: (line) => `第 ${line} 行已拆成第 ${line} 行和第 ${line + 1} 行`,
  lyricMerged: (line) => `第 ${line} 行和第 ${line + 1} 行已合并`,
  draftOpening: "正在打开草稿…",
  draftConflict: "草稿冲突",
  draftConflictText: "这份草稿在你打开之后，在别处被改过。你选择之前，你的修改不会保存。",
  draftOverwrite: "用我的版本覆盖",
  draftOverwriteNote: "对方的版本会被你的版本替换。",
  draftLoadTheirs: "载入对方的版本",
  draftLoadTheirsNote: "它会在这里打开，你在这个窗口里的修改会丢掉。",
  restoreOriginal: "恢复原谱",
  restoreQuestion: "恢复到原来的乐谱？",
  restoreWarning: "你做过的所有修改都会丢弃，已保存的草稿也会删除，之后无法撤销。",
  restoreCancel: "取消",
  restoreDone: "已恢复原谱",
  restoreNotCleared: "已恢复原谱，但保存的草稿没能删除。下一次改动会再试。",
};

const catalogs: Record<Language, Messages> = { en, zh };

/** What a view is called: in the switch, as its tooltip, and as the toolbar's title while it is shown. */
export function viewName(t: Messages, view: ViewName): string {
  return { arrangement: t.title, staff: t.staff, text: t.scoreText }[view];
}

export function messagesFor(language: Language): Messages {
  return catalogs[language] ?? en;
}

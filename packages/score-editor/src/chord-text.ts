// ABOUTME: The words of chord editing in Chinese and English: the picker, the keyboard cursor and what a live region says.
// ABOUTME: Kept apart from the main catalog so the chord track owns its own text; it is chosen by the same language option.
import type { BarPosition } from "./arrangement";
import type { Language } from "./types";

export interface ChordMessages {
  /** The name of the keyboard cursor: where it stands and the chord there, or none. */
  cursorLabel(position: BarPosition, chord: string | null): string;
  /** How the cursor is used, said after its name by a screen reader. */
  cursorHint: string;
  /** The name of the picker, and the line in it that says which start was taken. */
  pickerLabel(position: BarPosition): string;
  pickerPlace(position: BarPosition): string;
  /** The line that says what is on the start now. */
  pickerNow(chord: string | null): string;
  /** The sentence of an empty chord row while a press places a chord: the row's own sentence and then how. */
  emptyEditable(empty: string): string;
  /** The names of the picker's groups. */
  root: string;
  /** The name of the row of spellings (sharp or flat) under the letters. */
  accidental: string;
  type: string;
  bass: string;
  bassNone: string;
  /** The picker's actions; the primary one is `place` for a start with no chord and `change` for one with a chord. */
  place: string;
  change: string;
  remove: string;
  cancel: string;
  /** What a live region says after the user's own edit. */
  placed(name: string, position: BarPosition): string;
  changed(name: string, position: BarPosition): string;
  removed(position: BarPosition): string;
  /** What a live region says after an undo or redo changed a chord: what the start holds now. */
  chordNow(chord: string | null, position: BarPosition): string;
}

const en: ChordMessages = {
  cursorLabel: ({ bar, beat }, chord) => `Chord place, bar ${bar} beat ${beat}, ${chord ?? "no chord"}`,
  cursorHint: "Left and Right move between places. Enter opens the choice of chord. Delete removes the chord.",
  emptyEditable: (empty) => `${empty}. Click or tap a beat to add one.`,
  pickerLabel: ({ bar, beat }) => `Chord at bar ${bar} beat ${beat}`,
  pickerPlace: ({ bar, beat }) => `Bar ${bar}, beat ${beat}`,
  pickerNow: (chord) => (chord === null ? "No chord yet" : `Now ${chord}`),
  root: "Root",
  accidental: "Sharp or flat",
  type: "Type",
  bass: "Bass note",
  bassNone: "None",
  place: "Place",
  change: "Change",
  remove: "Remove",
  cancel: "Cancel",
  placed: (name, { bar, beat }) => `Chord ${name} placed at bar ${bar} beat ${beat}`,
  changed: (name, { bar, beat }) => `Chord changed to ${name} at bar ${bar} beat ${beat}`,
  removed: ({ bar, beat }) => `Chord removed at bar ${bar} beat ${beat}`,
  chordNow: (chord, { bar, beat }) =>
    chord === null ? `No chord at bar ${bar} beat ${beat}` : `Chord ${chord} at bar ${bar} beat ${beat}`,
};

const zh: ChordMessages = {
  cursorLabel: ({ bar, beat }, chord) => `和弦位置，第 ${bar} 小节第 ${beat} 拍，${chord ?? "没有和弦"}`,
  cursorHint: "左、右键在位置之间移动，Enter 打开和弦选择，Delete 删除和弦。",
  emptyEditable: (empty) => `${empty}，点按某一拍可以添加。`,
  pickerLabel: ({ bar, beat }) => `第 ${bar} 小节第 ${beat} 拍的和弦`,
  pickerPlace: ({ bar, beat }) => `第 ${bar} 小节，第 ${beat} 拍`,
  pickerNow: (chord) => (chord === null ? "还没有和弦" : `现在是 ${chord}`),
  root: "根音",
  accidental: "升降号",
  type: "类型",
  bass: "低音",
  bassNone: "无",
  place: "放上",
  change: "改成",
  remove: "删除",
  cancel: "取消",
  placed: (name, { bar, beat }) => `已在第 ${bar} 小节第 ${beat} 拍放上和弦 ${name}`,
  changed: (name, { bar, beat }) => `第 ${bar} 小节第 ${beat} 拍的和弦已改成 ${name}`,
  removed: ({ bar, beat }) => `已删除第 ${bar} 小节第 ${beat} 拍的和弦`,
  chordNow: (chord, { bar, beat }) =>
    chord === null ? `第 ${bar} 小节第 ${beat} 拍没有和弦` : `第 ${bar} 小节第 ${beat} 拍的和弦是 ${chord}`,
};

const catalogs: Record<Language, ChordMessages> = { en, zh };

export function chordMessagesFor(language: Language): ChordMessages {
  return catalogs[language] ?? en;
}

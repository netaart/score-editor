// ABOUTME: The editor's own texts in Chinese and English, chosen by the host's language option.
// ABOUTME: The host maps nothing here: it passes "zh" or "en" and the package speaks for itself.
import { barAndBeat, type Note, pitchName, TICKS_PER_BEAT } from "./model";
import type { Language } from "./types";

interface Messages {
  title: string;
  hint: string;
  grid: string;
  gridChoices: Record<"1/4" | "1/8" | "1/16", string>;
  readOnly: string;
  noticeReadOnly: string;
  noticePitchRange: string;
  position(midi: number, start: number): string;
  noteLabel(note: Note): string;
}

function beats(length: number): string {
  return String(Math.round(length * 100) / 100);
}

const en: Messages = {
  title: "Piano roll",
  hint: "Drag a note to change its time and pitch. Swipe empty space to scroll.",
  grid: "Grid",
  gridChoices: { "1/4": "Quarter note (1/4)", "1/8": "Eighth note (1/8)", "1/16": "Sixteenth note (1/16)" },
  readOnly: "Read only",
  noticeReadOnly: "This score is read only, so notes can't be moved.",
  noticePitchRange: "Notes can't go beyond the pitch range shown.",
  position(midi, start) {
    const { bar, beat } = barAndBeat(start);
    return `${pitchName(midi)} · bar ${bar} beat ${beat}`;
  },
  noteLabel(note) {
    const { bar, beat } = barAndBeat(note.start);
    const length = note.duration / TICKS_PER_BEAT;
    return `${pitchName(note.midi)}, bar ${bar} beat ${beat}, length ${beats(length)} ${length === 1 ? "beat" : "beats"}`;
  },
};

const zh: Messages = {
  title: "钢琴卷帘",
  hint: "拖动音符来改变它的时间和音高。在空白处滑动来滚动。",
  grid: "网格",
  gridChoices: { "1/4": "四分音符 (1/4)", "1/8": "八分音符 (1/8)", "1/16": "十六分音符 (1/16)" },
  readOnly: "只读",
  noticeReadOnly: "乐谱是只读的，不能移动音符。",
  noticePitchRange: "音符不能超出当前显示的音高范围。",
  position(midi, start) {
    const { bar, beat } = barAndBeat(start);
    return `${pitchName(midi)} · 第 ${bar} 小节第 ${beat} 拍`;
  },
  noteLabel(note) {
    const { bar, beat } = barAndBeat(note.start);
    return `${pitchName(note.midi)}，第 ${bar} 小节第 ${beat} 拍，长 ${beats(note.duration / TICKS_PER_BEAT)} 拍`;
  },
};

const catalogs: Record<Language, Messages> = { en, zh };

export function messagesFor(language: Language): Messages {
  return catalogs[language] ?? en;
}

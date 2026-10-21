// ABOUTME: The editor's own texts in Chinese and English, chosen by the host's language option.
// ABOUTME: The host maps nothing here: it passes "zh" or "en" and the package speaks for itself.
import type { BarPosition } from "./arrangement";
import type { Language } from "./types";

interface Messages {
  title: string;
  hint: string;
  readOnly: string;
  bars: string;
  sections: string;
  unnamedSection: string;
  chords: string;
  noChords: string;
  noteLabel(pitch: string, position: BarPosition, length: number, tiedToNext: boolean): string;
}

const en: Messages = {
  title: "Arrangement",
  hint: "Scroll with the arrow keys or a swipe.",
  readOnly: "Read only",
  bars: "Bars",
  sections: "Sections",
  unnamedSection: "Unnamed",
  chords: "Chords",
  noChords: "No chords in this score",
  noteLabel(pitch, { bar, beat }, length, tiedToNext) {
    const tie = tiedToNext ? ", tied to the next note" : "";
    return `${pitch}, bar ${bar} beat ${beat}, length ${length} ${length === 1 ? "beat" : "beats"}${tie}`;
  },
};

const zh: Messages = {
  title: "编曲视图",
  hint: "用方向键或滑动来滚动。",
  readOnly: "只读",
  bars: "小节",
  sections: "段落",
  unnamedSection: "未命名",
  chords: "和弦",
  noChords: "这份乐谱里没有和弦",
  noteLabel(pitch, { bar, beat }, length, tiedToNext) {
    return `${pitch}，第 ${bar} 小节第 ${beat} 拍，长 ${length} 拍${tiedToNext ? "，连到下一个音" : ""}`;
  },
};

const catalogs: Record<Language, Messages> = { en, zh };

export function messagesFor(language: Language): Messages {
  return catalogs[language] ?? en;
}

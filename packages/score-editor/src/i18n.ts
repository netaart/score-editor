// ABOUTME: The editor's own texts in Chinese and English, chosen by the host's language option.
// ABOUTME: The host maps nothing here: it passes "zh" or "en" and the package speaks for itself.
import type { Language } from "./types";

interface Messages {
  title: string;
  hint: string;
  readOnly: string;
  bars: string;
}

const en: Messages = {
  title: "Arrangement",
  hint: "Scroll with the arrow keys or a swipe.",
  readOnly: "Read only",
  bars: "Bars",
};

const zh: Messages = {
  title: "编曲视图",
  hint: "用方向键或滑动来滚动。",
  readOnly: "只读",
  bars: "小节",
};

const catalogs: Record<Language, Messages> = { en, zh };

export function messagesFor(language: Language): Messages {
  return catalogs[language] ?? en;
}

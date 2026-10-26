// ABOUTME: The texts of the Tools button and panel in Chinese and English, chosen by the session's language.
// ABOUTME: They live beside the panel so a change to the panel is one change; the shared editor texts stay in i18n.ts.
import { pitchName } from "./arrangement";
import type { InstrumentalReport, VoiceOctaveReport } from "./commands-voice";
import type { ToolGroup } from "./tool";
import type { Language } from "./types";

export interface ToolMessages {
  /** The button in the toolbar, its tooltip, and the name of the panel. */
  button: string;
  buttonTip: string;
  panel: string;
  /** The heading of each group; "more" is shown only when a tool without a group is registered. */
  group: Readonly<Record<ToolGroup, string>>;
  /** The footer's two buttons. */
  apply: string;
  close: string;
  /** The status line: nothing chosen, something chosen, nothing selected, what a preview would do, nothing, applied, read-only. */
  statusIdle: string;
  statusChooseTool: string;
  statusNoSelection: string;
  statusChooseFirst: string;
  statusPreview(notes: number): string;
  statusUnchanged: string;
  /** Why Fit into bars changes nothing when its bars are already the selection's. */
  statusFitSame(from: number, to: number): string;
  /** What a Voice octave preview or run reports: the direction, the median and the singable range. */
  statusVoiceOctave(report: VoiceOctaveReport, applied: boolean): string;
  /** What an Instrumental version preview or run reports: moved, shortened and dropped notes. */
  statusInstrumental(report: InstrumentalReport, applied: boolean): string;
  statusApplied: string;
  statusReadOnly: string;
  /** The step buttons beside a number field on a coarse pointer. */
  decrease(name: string): string;
  increase(name: string): string;
}

const en: ToolMessages = {
  button: "Tools",
  buttonTip: "Note tools",
  panel: "Tools",
  group: { note: "Note tools", quantize: "Quantize", transform: "Transform", generate: "Generate", more: "More tools" },
  apply: "Apply",
  close: "Close",
  statusIdle: "Select notes, then choose a tool.",
  statusChooseTool: "Choose a tool.",
  statusNoSelection: "Select notes first.",
  statusChooseFirst: "Choose a tool first.",
  statusPreview: (notes) => (notes === 1 ? "Preview: 1 note would change." : `Preview: ${notes} notes would change.`),
  statusUnchanged: "This tool changes nothing with the current selection and settings.",
  statusFitSame: (from, to) =>
    `The selected notes already fill ${from === to ? `bar ${from}` : `bars ${from} to ${to}`}. Change From bar or To bar to move them.`,
  statusVoiceOctave: (report, applied) => {
    const direction =
      report.octaves > 0
        ? `${report.octaves} octave${report.octaves === 1 ? "" : "s"} up`
        : `${-report.octaves} octave${report.octaves === -1 ? "" : "s"} down`;
    const opening = applied ? "Applied." : "Preview:";
    if (report.medianMidi === null) return `${opening} Vocal has no pitched notes, so nothing moves.`;
    return `${opening} Vocal ${applied ? "moved" : "moves"} ${direction}; median pitch ${pitchName(report.medianMidi)} (${report.medianMidi}), ${report.singable ? "inside" : "outside"} the singable range 60-82.`;
  },
  statusInstrumental: (report, applied) => {
    const opening = applied ? "Applied." : "Preview:";
    const moved = report.moved === 1 ? "1 Vocal note" : `${report.moved} Vocal notes`;
    const shortened = report.shortened === 1 ? "1 Ins note" : `${report.shortened} Ins notes`;
    const shortenedVerb = report.shortened === 1 ? (applied ? "was" : "is") : applied ? "were" : "are";
    const dropped = report.dropped === 1 ? "1 is" : `${report.dropped} are`;
    return `${opening} ${moved} ${applied ? "moved" : "move"} to Ins; ${shortened} ${shortenedVerb} cut short, ${dropped} dropped.`;
  },
  statusApplied: "Applied. Undo takes it back.",
  statusReadOnly: "This view is read-only.",
  decrease: (name) => `Decrease ${name}`,
  increase: (name) => `Increase ${name}`,
};

const zh: ToolMessages = {
  button: "工具",
  buttonTip: "音符工具",
  panel: "工具",
  group: { note: "音符工具", quantize: "量化", transform: "变换", generate: "生成", more: "更多工具" },
  apply: "应用",
  close: "关闭",
  statusIdle: "先选中音符，再选择工具。",
  statusChooseTool: "选择一个工具。",
  statusNoSelection: "请先选中音符。",
  statusChooseFirst: "请先选择一个工具。",
  statusPreview: (notes) => `预览：会改动 ${notes} 个音。`,
  statusUnchanged: "以当前的选区和参数，这个工具不会改动任何东西。",
  statusFitSame: (from, to) =>
    `选中的音已经刚好填满${from === to ? `第 ${from} 小节` : `第 ${from} 到第 ${to} 小节`}。改“起始小节”或“结束小节”就能移动它们。`,
  statusVoiceOctave: (report, applied) => {
    const direction = `${report.octaves > 0 ? "上" : "下"}移 ${Math.abs(report.octaves)} 个八度`;
    const opening = applied ? "已应用：" : "预览：";
    if (report.medianMidi === null) return `${opening}人声没有音，什么也不会动。`;
    return `${opening}人声${direction}；中位音高 ${pitchName(report.medianMidi)}（${report.medianMidi}），${report.singable ? "在" : "不在"}可唱区间 60–82 内。`;
  },
  statusInstrumental: (report, applied) => {
    const opening = applied ? "已应用：" : "预览：";
    return `${opening}${report.moved} 个人声部音符${applied ? "已" : "将"}移到器乐声部；截短 ${report.shortened} 个，丢弃 ${report.dropped} 个。`;
  },
  statusApplied: "已应用，撤销即可恢复。",
  statusReadOnly: "这里是只读视图。",
  decrease: (name) => `减小${name}`,
  increase: (name) => `增大${name}`,
};

export function toolMessagesFor(language: Language): ToolMessages {
  return language === "zh" ? zh : en;
}

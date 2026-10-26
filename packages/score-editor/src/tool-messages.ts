// ABOUTME: The texts of the Tools button and panel in Chinese and English, chosen by the session's language.
// ABOUTME: They live beside the panel so a change to the panel is one change; the shared editor texts stay in i18n.ts.
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
  /** The status line: nothing chosen, nothing selected, what a preview would do, nothing, applied, read-only. */
  statusIdle: string;
  statusNoSelection: string;
  statusChooseFirst: string;
  statusPreview(notes: number): string;
  statusUnchanged: string;
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
  statusNoSelection: "Select notes first.",
  statusChooseFirst: "Choose a tool first.",
  statusPreview: (notes) => (notes === 1 ? "Preview: 1 note would change." : `Preview: ${notes} notes would change.`),
  statusUnchanged: "This tool changes nothing with the current selection and settings.",
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
  statusNoSelection: "请先选中音符。",
  statusChooseFirst: "请先选择一个工具。",
  statusPreview: (notes) => `预览：会改动 ${notes} 个音。`,
  statusUnchanged: "以当前的选区和参数，这个工具不会改动任何东西。",
  statusApplied: "已应用，撤销即可恢复。",
  statusReadOnly: "这里是只读视图。",
  decrease: (name) => `减小${name}`,
  increase: (name) => `增大${name}`,
};

export function toolMessagesFor(language: Language): ToolMessages {
  return language === "zh" ? zh : en;
}

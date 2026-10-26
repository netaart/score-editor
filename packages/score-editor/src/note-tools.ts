// ABOUTME: The built-in note tools: the note group of the Tools panel, each one a ScoreTool that returns one command.
// ABOUTME: They read the grid and the insertion point from the tool context, so they stay pure functions like a custom tool.
import { TICKS_PER_QUARTER } from "./score";
import type { ScoreTool } from "./tool";

/** A note length named in the Set length menu, as a fraction of a whole note. */
const LENGTHS: Readonly<Record<string, number>> = {
  "1/1": 4 * TICKS_PER_QUARTER,
  "1/2": 2 * TICKS_PER_QUARTER,
  "1/4": TICKS_PER_QUARTER,
  "1/8": TICKS_PER_QUARTER / 2,
  "1/16": TICKS_PER_QUARTER / 4,
  "1/32": TICKS_PER_QUARTER / 8,
};

/** The note tools the package ships: split, chop, join, legato, reverse, flip, snap to key and the length tools. */
export const NOTE_TOOLS: ReadonlyArray<ScoreTool> = [
  {
    id: "split",
    group: "note",
    name: { en: "Split at the insertion point", zh: "在插入点切分" },
    description: {
      en: "Cut each selected note where the insertion point stands.",
      zh: "在插入点的位置切开每个选中的音。",
    },
    commands(_project, selection, _values, context) {
      return [{ type: "splitNotes", noteIds: selection, at: context.insertionPoint, grid: context.grid }];
    },
  },
  {
    id: "chop",
    group: "note",
    name: { en: "Chop on the grid", zh: "按网格切碎" },
    description: {
      en: "Cut each selected note at every grid line it crosses.",
      zh: "在每个穿过的网格线上切开选中的音。",
    },
    commands(_project, selection, _values, context) {
      return [{ type: "chopNotes", noteIds: selection, grid: context.grid }];
    },
  },
  {
    id: "join",
    group: "note",
    name: { en: "Join same pitch", zh: "合并同音高" },
    description: {
      en: "Merge selected notes that are next to each other on the same pitch.",
      zh: "把选中、相邻而且同音高的音并成一个。",
    },
    commands(_project, selection, _values, context) {
      return [{ type: "joinNotes", noteIds: selection, grid: context.grid }];
    },
  },
  {
    id: "legato",
    group: "note",
    name: { en: "Legato", zh: "连奏" },
    description: {
      en: "Extend each selected note to where the next note of its voice starts.",
      zh: "把每个选中的音延长到同声部下一个音开始的地方。",
    },
    commands(_project, selection, _values, context) {
      return [{ type: "legatoNotes", noteIds: selection, grid: context.grid }];
    },
  },
  {
    id: "reverse",
    group: "note",
    name: { en: "Reverse", zh: "倒序" },
    description: { en: "Turn the selected notes back to front in time.", zh: "把选中的音在时间上前后倒过来。" },
    commands(_project, selection, _values, context) {
      return [{ type: "reverseNotes", noteIds: selection, grid: context.grid }];
    },
  },
  {
    id: "flip",
    group: "note",
    name: { en: "Flip up and down", zh: "上下翻转" },
    description: {
      en: "Mirror the selected notes' pitches around the middle of the selection.",
      zh: "以选中音域的中线为轴，上下翻转音高。",
    },
    commands(_project, selection, _values, context) {
      return [{ type: "flipNotes", noteIds: selection, grid: context.grid }];
    },
  },
  {
    id: "snap-to-key",
    group: "note",
    name: { en: "Snap to key", zh: "吸附到当前调" },
    description: {
      en: "Move each selected note to the nearest pitch of the key in force.",
      zh: "把每个选中的音移到当前调里最近的音高。",
    },
    commands(_project, selection, _values, context) {
      return [{ type: "snapNotesToKey", noteIds: selection, grid: context.grid }];
    },
  },
  {
    id: "length-double",
    group: "note",
    name: { en: "Length ×2", zh: "长度乘 2" },
    description: { en: "Make each selected note twice as long.", zh: "把每个选中的音的长度乘 2。" },
    commands(_project, selection, _values, context) {
      return [{ type: "scaleNoteLengths", noteIds: selection, factor: 2, grid: context.grid }];
    },
  },
  {
    id: "length-halve",
    group: "note",
    name: { en: "Length ÷2", zh: "长度除以 2" },
    description: { en: "Make each selected note half as long.", zh: "把每个选中的音的长度除以 2。" },
    commands(_project, selection, _values, context) {
      return [{ type: "scaleNoteLengths", noteIds: selection, factor: 0.5, grid: context.grid }];
    },
  },
  {
    id: "set-length",
    group: "note",
    name: { en: "Set length", zh: "统一长度" },
    description: { en: "Give every selected note the same length.", zh: "把选中的音都设成同一个长度。" },
    parameters: [
      {
        name: "length",
        label: { en: "Length", zh: "长度" },
        type: "choice",
        values: ["1/1", "1/2", "1/4", "1/8", "1/16", "1/32"],
        default: "1/4",
      },
    ],
    commands(_project, selection, values, context) {
      const length = LENGTHS[String(values.length)] ?? LENGTHS["1/4"] ?? TICKS_PER_QUARTER;
      return [{ type: "setNoteLength", noteIds: selection, lengthTicks: length, grid: context.grid }];
    },
  },
  {
    id: "fit-range",
    group: "note",
    name: { en: "Fit into bars", zh: "压缩或拉伸到小节" },
    description: {
      en: "Stretch or squeeze the selected notes into a run of bars.",
      zh: "把选中的音压缩或拉伸到一段小节里。",
    },
    parameters: [
      { name: "from", label: { en: "First bar", zh: "第一小节" }, type: "number", min: 1, default: 1 },
      { name: "to", label: { en: "Last bar", zh: "最后一小节" }, type: "number", min: 1, default: 1 },
    ],
    commands(_project, selection, values, context) {
      const from = Number(values.from ?? 1) - 1;
      const to = Number(values.to ?? 4) - 1;
      return [{ type: "fitNotesToRange", noteIds: selection, fromBar: from, toBar: to, grid: context.grid }];
    },
  },
];

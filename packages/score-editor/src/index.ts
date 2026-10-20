// ABOUTME: Main entry of @neta-art/score-editor. Importing it has no side effects and touches no DOM.
// ABOUTME: Only a call to mount() creates nodes or listeners.
export { mount } from "./mount";
export type {
  DialectConstraints,
  Language,
  MountedEditor,
  MountOptions,
  Notice,
  NoticeCode,
  SpikeNote,
  SpikeScore,
} from "./types";

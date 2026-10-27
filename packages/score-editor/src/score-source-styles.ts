// ABOUTME: The look of the score-file controls (Save, Save as, the unsaved pill) as a stylesheet fragment.
// ABOUTME: styles.ts appends it to the editor's stylesheet; every colour comes from the theme variable contract.
export const scoreSourceCss = `
/* The Save / Save as control; see DESIGN.md, "Score source, save and save as". */
.sce-root.sce-part-save[hidden],
.sce-root.sce-part-save-conflict[hidden] {
  display: none !important;
}
.sce-root .sce-save-state {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--sce-_line-strong);
  border-radius: 999px;
  color: var(--sce-_muted);
  font-size: 0.92em;
  white-space: nowrap;
}
.sce-root .sce-save-state[data-state="dirty"] {
  color: var(--sce-_text);
  font-weight: 600;
}
/* A failed save is a state of the same pill, not a new danger colour; the words carry it. */
.sce-root .sce-save-state[data-state="failed"] {
  border-color: var(--sce-_text);
  color: var(--sce-_text);
  font-weight: 600;
}
.sce-root .sce-save-button[aria-busy="true"] {
  cursor: progress;
}
/* The mark is the state where the word has no room: one glyph per state, never a single dot for all. */
.sce-root .sce-save-mark {
  position: absolute;
  inset-block-start: 1px;
  inset-inline-end: 2px;
  font-weight: 600;
  line-height: 1;
  text-align: center;
}
.sce-root.sce-part-save[data-word="false"] .sce-save-state {
  display: none;
}
.sce-root.sce-part-save[data-word="true"] .sce-save-mark {
  display: none;
}
/* The icon form, chosen for the box when the widest state's words would add a row: the action word gives way to the mark. */
.sce-root.sce-part-save[data-compact="true"] .sce-save-label {
  display: none;
}
.sce-root.sce-part-save[data-compact="true"] .sce-save-button {
  width: 36px;
  justify-content: center;
  padding: 0;
}
@media (forced-colors: active) {
  .sce-root .sce-save-mark {
    color: CanvasText;
  }
}
/* The score-file conflict strip uses the draft strip's classes for its shared shape and choices. */
.sce-root .sce-save-conflict {
  border-bottom-color: var(--sce-_line-strong);
}
/* The one-action notice a failed save and a refused handoff draw; the sentence keeps the shared banner's measure. */
.sce-root .sce-save-notice .sce-save-again {
  flex: none;
}
`;

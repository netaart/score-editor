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
/* The dot is the unsaved state where the pill has no room: a small mark on the Save drawing. */
.sce-root .sce-save-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sce-_text);
}
/* At 320px the word and the pill would push a control to another row; the icon and the dot stay. */
.sce-root.sce-part-save[data-compact="true"] .sce-save-label,
.sce-root.sce-part-save[data-compact="true"] .sce-save-state {
  display: none;
}
.sce-root.sce-part-save[data-compact="true"] .sce-save-button {
  width: 36px;
  justify-content: center;
  padding: 0;
}
@media (forced-colors: active) {
  .sce-root .sce-save-dot {
    background: CanvasText;
  }
}
/* The score-file conflict strip uses the draft strip's classes for its shared shape and choices. */
.sce-root .sce-save-conflict {
  border-bottom-color: var(--sce-_line-strong);
}
`;

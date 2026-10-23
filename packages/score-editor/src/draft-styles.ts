// ABOUTME: The look of the draft controls (the conflict strip, the restore question) as a stylesheet fragment.
// ABOUTME: styles.ts appends it to the editor's stylesheet; every colour is a derivation of the theme variable contract.
export const draftCss = `
/*
 * The conflict strip: a sentence and two choices, each a button with one line on what it does. The choices sit side by
 * side where there is room and one above the other where there is not, with no breakpoint: each takes the width of its
 * longer line. A decision still open is told by the heavier line under the strip and the weight of its sentence, not by hue.
 */
.sce-root .sce-draft-conflict {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom-color: var(--sce-_line-strong);
}
.sce-root .sce-draft-conflict-text {
  margin: 0;
  font-weight: 600;
}
.sce-root .sce-draft-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}
.sce-root .sce-draft-choice {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}
.sce-root .sce-draft-note {
  color: var(--sce-_muted);
  font-size: 0.92em;
}
`;

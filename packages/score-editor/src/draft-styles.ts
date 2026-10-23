// ABOUTME: The look of the draft controls (the conflict strip, the restore question) as a stylesheet fragment.
// ABOUTME: styles.ts appends it to the editor's stylesheet; every colour is a derivation of the theme variable contract.
export const draftCss = `
/*
 * The conflict strip: a sentence and two choices, each one button of two lines, what it is and what it does. The choices
 * sit side by side where there is room and one above the other where there is not, with no breakpoint: each takes the
 * width of its longer line. A decision still open is told by the heavier line under the strip and the weight of its
 * sentence, not by hue.
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
  flex: 0 1 auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
  padding-block: 4px;
  text-align: start;
  white-space: normal;
}
.sce-root .sce-draft-note {
  color: var(--sce-_muted);
  font-size: 0.92em;
}

/*
 * Restore original: a word button like Select, and the question it opens in a native popover of the same make as the menus,
 * so it stacks above a host's full-screen layer. The question is a sentence and what it costs, then the two answers with the
 * one that does it last and heavier; there is no danger colour in the contract, and the focus starts on Cancel.
 */
.sce-root .sce-restore-popover {
  width: 22em;
  max-width: calc(100vw - 16px);
  padding: 12px;
}
.sce-root .sce-restore-popover:popover-open {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sce-root .sce-restore-question {
  margin: 0;
  font-weight: 600;
}
.sce-root .sce-restore-warning {
  margin: 0;
}
.sce-root .sce-restore-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.sce-root .sce-restore-confirm {
  font-weight: 600;
}
`;

// ABOUTME: The look of the draft controls (the conflict strip, the restore question) as a stylesheet fragment.
// ABOUTME: styles.ts appends it to the editor's stylesheet; every colour is a derivation of the theme variable contract.
export const draftCss = `
/* The conflict strip; see DESIGN.md, "Draft conflict strip". */
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

/* The restore question; see DESIGN.md, "Restore original". */
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

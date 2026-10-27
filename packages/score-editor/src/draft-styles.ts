// ABOUTME: The look of the draft controls (the conflict strip, the restore question) as a stylesheet fragment.
// ABOUTME: styles.ts appends it to the editor's stylesheet; every colour is a derivation of the theme variable contract.
export const draftCss = `
/* The conflict banner; see DESIGN.md, "Draft conflict banner". */
.sce-root .sce-draft-conflict {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px 12px;
  border-bottom-color: var(--sce-_line-strong);
}
.sce-root .sce-draft-conflict-text {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 70ch;
  margin: 0;
  font-weight: 600;
}
.sce-root .sce-draft-choose {
  flex: none;
}
/* The two ways out, each still two lines: what it is, and what it does. */
.sce-root .sce-draft-choices {
  width: 22em;
  max-width: calc(100vw - 16px);
  padding: 8px;
}
.sce-root .sce-draft-choices:popover-open {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sce-root .sce-draft-choice {
  flex: none;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  min-width: 0;
  padding: 4px 10px;
  text-align: start;
  white-space: normal;
}
.sce-root .sce-draft-label,
.sce-root .sce-draft-note {
  text-wrap: pretty;
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

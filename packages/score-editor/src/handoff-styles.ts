// ABOUTME: The look of the handoff control and its review dialog as a stylesheet fragment.
// ABOUTME: styles.ts appends it to the editor's stylesheet; every colour is a derivation of the theme variable contract.
export const handoffCss = `
/* The handoff control; see DESIGN.md, "Change log and handoff". */
.sce-root .sce-handoff-popover {
  width: 26em;
  max-width: calc(100vw - 16px);
  padding: 12px;
}
.sce-root .sce-handoff-popover:popover-open {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sce-root .sce-handoff-heading {
  margin: 0;
  font-weight: 600;
}
.sce-root .sce-handoff-log-label {
  margin: 4px 0 0;
  color: var(--sce-_muted);
  font-weight: 600;
}
.sce-root .sce-handoff-changes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-inline-start: 1.2em;
}
.sce-root .sce-handoff-empty,
.sce-root .sce-handoff-note {
  margin: 0;
  color: var(--sce-_muted);
}
.sce-root .sce-handoff-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.sce-root .sce-handoff-confirm {
  font-weight: 600;
}
`;

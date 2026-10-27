// ABOUTME: The look of the handoff control and its review dialog as a stylesheet fragment.
// ABOUTME: styles.ts appends it to the editor's stylesheet; every colour is a derivation of the theme variable contract.
export const handoffCss = `
/* The handoff control; see DESIGN.md, "Change log and handoff". */
.sce-root.sce-part-handoff[hidden] {
  display: none !important;
}
.sce-root .sce-handoff-popover {
  width: 26em;
  max-width: calc(100vw - 16px);
  padding: 12px;
  overflow: hidden;
}
.sce-root .sce-handoff-popover:popover-open {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sce-root .sce-handoff-heading {
  margin: 0;
  font-size: 1em;
  font-weight: 600;
}
.sce-root .sce-handoff-log-label {
  margin: 4px 0 0;
  color: var(--sce-_muted);
  font-weight: 600;
}
.sce-root .sce-handoff-changes {
  min-height: 0;
  margin: 0;
  padding-inline-start: 1.2em;
  overflow-y: auto;
  overflow-wrap: anywhere;
  font-variant-numeric: lining-nums;
}
.sce-root .sce-handoff-changes[hidden] {
  display: none;
}
.sce-root .sce-handoff-changes li + li {
  margin-block-start: 4px;
}
/* The entries that name a bar the last edit rewrote: weight and a text-colour dot, never the accent meant for focus. */
.sce-root .sce-handoff-changes li[data-rewritten] {
  position: relative;
  list-style: none;
  font-weight: 600;
}
.sce-root .sce-handoff-changes li[data-rewritten]::before {
  position: absolute;
  inset-block-start: 0.52em;
  inset-inline-start: -10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sce-_text);
  content: "";
}
.sce-root .sce-handoff-notices {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sce-root .sce-handoff-notices[hidden] {
  display: none;
}
.sce-root .sce-handoff-notices-lead {
  margin: 0;
  font-weight: 600;
}
.sce-root .sce-handoff-notice {
  margin: 0;
  padding-inline-start: 8px;
  border-inline-start: 3px solid var(--sce-_text);
  color: var(--sce-_text);
  text-wrap: pretty;
}
.sce-root .sce-handoff-marked {
  margin: 0;
  color: var(--sce-_muted);
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
@media (max-width: 30em) {
  .sce-root .sce-handoff-actions {
    flex-wrap: nowrap;
  }
  .sce-root .sce-handoff-actions .sce-button {
    flex: 1 1 auto;
    min-width: 0;
  }
}
.sce-root .sce-handoff-confirm {
  font-weight: 600;
}
`;

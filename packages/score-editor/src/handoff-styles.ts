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
/* The entries that name a bar the last edit rewrote: the bars stand out, the sentence stays as the change log writes it. */
.sce-root .sce-handoff-changes li[data-rewritten] {
  margin-inline: -4px;
  padding-inline: 4px;
  border-inline-start: 2px solid var(--sce-_accent);
  background: color-mix(in srgb, var(--sce-_accent) 10%, transparent);
}
.sce-root .sce-handoff-notices {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sce-root .sce-handoff-notices[hidden] {
  display: none;
}
.sce-root .sce-handoff-notice {
  padding-inline-start: 8px;
  border-inline-start: 2px solid var(--sce-_line-strong);
  color: var(--sce-_text);
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

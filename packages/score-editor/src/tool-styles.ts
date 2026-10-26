// ABOUTME: The look of the Tools button and panel as a stylesheet fragment, and the one media query that makes it a sheet on a phone.
// ABOUTME: styles.ts appends it to the editor's stylesheet; the panel takes every colour from the variable contract and no accent but focus.

/** A coarse pointer on a narrow window: the panel is a sheet from the bottom edge, as the Filter panel is. */
export const TOOLS_SHEET_QUERY = "(pointer: coarse) and (max-width: 640px)";

export const toolCss = `
/* The Tools button and panel: DESIGN.md, "The Tools panel"; the box and the sheet are the Filter panel's. */
.sce-root .sce-tool-button {
  gap: 4px;
  padding: 0 8px;
}
/* Tools and the Filter button after it end the row as one pair, held to its right edge: the panel hangs from the right,
   so a preview on the arrangement stays in view, and the pair wraps as one item onto the line Filter already used. */
.sce-root .sce-toolbar-tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-inline-start: auto;
}
.sce-root .sce-tool-button::after {
  content: "";
  width: 5px;
  height: 5px;
  margin-top: -3px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
}
.sce-root .sce-tool-panel:popover-open {
  display: flex;
  flex-direction: column;
  width: min(30em, calc(100vw - 16px));
  padding: 0;
  overflow: hidden;
}
.sce-root .sce-tool-title {
  position: relative;
  z-index: 2;
  padding: 12px 12px 2px;
  background: var(--sce-_surface);
  font-weight: 600;
}
/* One ground-coloured line below the title, over the first pixels of a row at the body's clipped top edge. */
.sce-root .sce-tool-title::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  bottom: -1px;
  height: 1px;
  background: var(--sce-_surface);
}
.sce-root .sce-tool-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  /* The heading carries the top padding, so its ground reaches the body's own top edge. */
  padding: 0 12px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.sce-root .sce-tool-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sce-root .sce-tool-group-name {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 12px 2px 4px;
  background: var(--sce-_surface);
  color: var(--sce-_muted);
  font-size: 0.92em;
  font-weight: 600;
}
.sce-root .sce-tool-entry {
  display: flex;
  flex-direction: column;
}
.sce-root .sce-tool-row {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: 2px;
  min-height: 40px;
  margin: 0;
  padding: 6px 24px 6px 8px;
  border: 1px solid transparent;
  border-radius: var(--sce-_radius);
  background: transparent;
  color: var(--sce-_text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.sce-root .sce-tool-row:hover {
  background: color-mix(in srgb, var(--sce-_text) 6%, transparent);
}
/* The open tool wears the view switch's chosen look: a fill and a text-colour border, never a hue. */
.sce-root .sce-tool-row[aria-expanded="true"] {
  border-color: var(--sce-_line-strong);
  background: color-mix(in srgb, var(--sce-_text) 12%, transparent);
}
.sce-root .sce-tool-row::after {
  content: "";
  position: absolute;
  inset-inline-end: 10px;
  top: 50%;
  width: 5px;
  height: 5px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-50%) rotate(-45deg);
}
.sce-root .sce-tool-row[aria-expanded="true"]::after {
  transform: translateY(-50%) rotate(45deg);
}
.sce-root .sce-tool-name {
  font-weight: 600;
}
.sce-root .sce-tool-description {
  color: var(--sce-_muted);
  font-size: 0.92em;
}
.sce-root .sce-tool-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 8px 10px;
}
.sce-root .sce-tool-field {
  display: grid;
  grid-template-columns: minmax(6em, auto) minmax(0, 1fr);
  align-items: center;
  gap: 4px 8px;
  min-height: 28px;
}
.sce-root .sce-tool-field-name {
  color: var(--sce-_muted);
  font-size: 0.92em;
}
.sce-root .sce-tool-check {
  grid-template-columns: auto minmax(0, 1fr);
}
.sce-root .sce-tool-check input {
  order: -1;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--sce-_text);
}
.sce-root :is(.sce-tool-number, .sce-tool-text, .sce-tool-select) {
  min-height: 28px;
  min-width: 0;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--sce-_text) 52%, var(--sce-_bg));
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  font-variant-numeric: lining-nums tabular-nums;
  color-scheme: inherit;
}
.sce-root .sce-tool-number {
  width: 7em;
}
.sce-root .sce-tool-stepper {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sce-root .sce-tool-step {
  display: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--sce-_text) 52%, var(--sce-_bg));
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  cursor: pointer;
}
.sce-root .sce-tool-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 12px;
  border-top: 1px solid var(--sce-_line);
  background: var(--sce-_surface);
}
.sce-root .sce-tool-live {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.sce-root .sce-tool-status {
  min-height: calc(2.6em + 4px);
  padding-block: 2px;
  color: var(--sce-_muted);
}
/* A preview, a refusal and an applied run are told by the words; a rule marks the two that changed nothing by themselves. */
.sce-root .sce-tool-status[data-state="preview"],
.sce-root .sce-tool-status[data-state="applied"] {
  color: var(--sce-_text);
}
.sce-root .sce-tool-status[data-state="refused"] {
  padding-inline-start: 8px;
  border-inline-start: 3px solid var(--sce-_text);
  color: var(--sce-_text);
}
.sce-root .sce-tool-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.sce-root :is(.sce-tool-button, .sce-tool-row, .sce-tool-apply, .sce-tool-actions .sce-button):focus-visible,
.sce-root :is(.sce-tool-number, .sce-tool-text, .sce-tool-select, .sce-tool-check input, .sce-tool-step):focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
@media (pointer: coarse) {
  .sce-root .sce-tool-row {
    min-height: 44px;
    padding: 8px;
  }
  .sce-root .sce-tool-field {
    min-height: 44px;
  }
  .sce-root .sce-tool-check input {
    width: 22px;
    height: 22px;
  }
  /* Controls are 40px high and at least 16px, so a phone does not zoom the page when one is focused. */
  .sce-root :is(.sce-tool-number, .sce-tool-text, .sce-tool-select) {
    min-height: 40px;
    font-size: max(16px, 1.25em);
  }
  .sce-root .sce-tool-actions .sce-button {
    min-height: 40px;
  }
  .sce-root .sce-tool-step {
    display: inline-flex;
  }
}
@media ${TOOLS_SHEET_QUERY} {
  /* The sheet stops above the floor of music under the chrome; the variables are the panel's own, kept by chrome-floor.ts. */
  .sce-root .sce-tool-panel:popover-open {
    inset: auto 0 0 0;
    width: auto;
    max-height: calc(100dvh - var(--sce-_chrome-h, 0px) - var(--sce-_sheet-floor, 190px));
    border-width: 1px 0 0;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }
  .sce-root .sce-tool-footer {
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }
}
`;

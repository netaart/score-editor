// ABOUTME: The look of the Filter button's panel as a stylesheet fragment, and the one media query that makes it a sheet on a phone.
// ABOUTME: styles.ts appends it to the editor's stylesheet; the panel takes every colour from the variable contract and no accent but focus.

/** A coarse pointer on a narrow window: the panel is a sheet from the bottom edge. The panel asks the same question in script. */
export const FILTER_SHEET_QUERY = "(pointer: coarse) and (max-width: 640px)";

export const filterCss = `
/* The Filter panel's box and the room its rows and fields need: DESIGN.md, "Filter panel"; docs/spike.md, popovers. */
.sce-root .sce-filter-panel:popover-open {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(26em, calc(100vw - 16px));
  padding: 12px 12px 0;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-filter-title {
  font-weight: 600;
}
.sce-root .sce-filter-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sce-root .sce-filter-row {
  display: grid;
  grid-template-columns: 6.5em minmax(0, 1fr);
  align-items: start;
  gap: 4px 8px;
}
.sce-root .sce-filter-check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  cursor: pointer;
}
.sce-root .sce-filter-check input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--sce-_text);
  cursor: pointer;
}
.sce-root .sce-filter-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  min-width: 0;
  min-height: 28px;
}
.sce-root .sce-filter-phrase {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.sce-root .sce-filter-select,
.sce-root .sce-filter-number {
  min-height: 28px;
  min-width: 0;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--sce-_text) 47%, var(--sce-_bg));
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  font-variant-numeric: lining-nums tabular-nums;
  color-scheme: inherit;
}
.sce-root .sce-filter-number {
  width: 4.5em;
}
/* The fields of a condition that is not counted read as resting: the checkbox alone would be a small sign. */
.sce-root .sce-filter-row:has(> .sce-filter-check > input:not(:checked)) :is(.sce-filter-select, .sce-filter-number, .sce-filter-word) {
  color: var(--sce-_muted);
}
.sce-root .sce-filter-invert {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 8px;
}
.sce-root .sce-filter-invert .sce-filter-hint {
  grid-column: 2;
  color: var(--sce-_muted);
}
/*
 * The status and the buttons stay at the bottom edge when the conditions scroll (a short window, a small phone), so
 * the count is in view while a condition changes.
 */
.sce-root .sce-filter-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-inline: -12px;
  padding: 8px 12px 12px;
  border-top: 1px solid var(--sce-_line);
  background: var(--sce-_surface);
}
.sce-root .sce-filter-status {
  min-height: calc(2.6em + 4px);
  padding-block: 2px;
}
/* A selection that is no longer what the conditions make is told by a rule at its start as well as by the words. */
.sce-root .sce-filter-status[data-state="stale"] {
  padding-inline-start: 8px;
  border-inline-start: 3px solid var(--sce-_text);
}
.sce-root .sce-filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.sce-root :is(.sce-filter-select, .sce-filter-number, .sce-filter-check input):focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
@media (pointer: coarse) {
  .sce-root .sce-filter-rows {
    gap: 8px;
  }
  .sce-root .sce-filter-check,
  .sce-root .sce-filter-fields {
    min-height: 40px;
  }
  .sce-root .sce-filter-check input {
    width: 22px;
    height: 22px;
  }
  /* Controls are 40px high, and their text is large enough that a phone does not zoom the page when one is focused. */
  .sce-root .sce-filter-select,
  .sce-root .sce-filter-number {
    min-height: 40px;
    font-size: max(16px, 1.25em);
  }
  .sce-root .sce-filter-actions .sce-button {
    min-height: 40px;
  }
}
@media ${FILTER_SHEET_QUERY} {
  .sce-root .sce-filter-panel:popover-open {
    inset: auto 0 0 0;
    width: auto;
    max-height: calc(100dvh - var(--sce-_chrome-h, 0px) - var(--sce-_sheet-floor, 190px));
    border-width: 1px 0 0;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }
  .sce-root .sce-filter-footer {
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
  }
}
`;

// ABOUTME: The look of the Filter button's panel as a stylesheet fragment, and the one media query that makes it a sheet on a phone.
// ABOUTME: styles.ts appends it to the editor's stylesheet; the panel takes every colour from the variable contract and no accent but focus.

/** A coarse pointer on a narrow window: the panel is a sheet from the bottom edge. The panel asks the same question in script. */
export const FILTER_SHEET_QUERY = "(pointer: coarse) and (max-width: 640px)";

export const filterCss = `
/*
 * The Filter panel: a native popover like the menus (top layer, above a host's full-screen layer), but a form, so it is
 * a column of condition rows, a status line and two buttons. It hangs under its button; on a phone it is a sheet.
 */
.sce-root .sce-filter-panel:popover-open {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(26em, calc(100vw - 16px));
  max-height: calc(100dvh - 16px);
  padding: 12px;
}
/*
 * A toolbar with neither the preview control nor the view switch does not wrap: its row scrolls, and the title gives way
 * first. With one more control in the row the title would give way entirely at a phone's width, so it keeps a sliver of
 * its own text and the row scrolls instead.
 */
.sce-root .sce-toolbar:not([data-synth], [data-views]) .sce-title {
  min-width: 2em;
}
.sce-root .sce-filter-title {
  font-weight: 600;
}
.sce-root .sce-filter-row {
  display: grid;
  grid-template-columns: 6.5em minmax(0, 1fr);
  align-items: center;
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
}
.sce-root .sce-filter-select,
.sce-root .sce-filter-number {
  min-height: 28px;
  min-width: 0;
  padding: 0 6px;
  border: 1px solid var(--sce-_line-strong);
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
.sce-root .sce-filter-invert {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 8px;
}
.sce-root .sce-filter-invert .sce-filter-hint {
  grid-column: 2;
  color: var(--sce-_muted);
}
.sce-root .sce-filter-status {
  min-height: 2.6em;
  padding-block: 2px;
}
/* A selection that is no longer what the conditions make is told by a rule at its start as well as by the words. */
.sce-root .sce-filter-status[data-state="stale"] {
  padding-inline-start: 8px;
  border-inline-start: 2px solid var(--sce-_text);
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
  .sce-root .sce-filter-check {
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
    font-size: 1.25em;
  }
}
@media ${FILTER_SHEET_QUERY} {
  .sce-root .sce-filter-panel:popover-open {
    inset: auto 0 0 0;
    width: auto;
    max-height: 75dvh;
    padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
    border-width: 1px 0 0;
    border-radius: calc(var(--sce-_radius) + 2px) calc(var(--sce-_radius) + 2px) 0 0;
  }
  .sce-root .sce-filter-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
`;

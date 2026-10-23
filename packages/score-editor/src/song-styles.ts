// ABOUTME: The look of the toolbar's tempo, key and transpose controls and of the song project panel, as a stylesheet fragment.
// ABOUTME: styles.ts appends it to the editor's stylesheet; every colour is a derivation of the variable contract and nothing moves.
export const songCss = `
/*
 * The tempo, key and transpose controls: one group that is a single item of the toolbar row. Where the row wraps, the
 * group moves to the next line as a whole, and only a box narrower than the group wraps it inside.
 */
.sce-root .sce-song-controls {
  display: inline-flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}
.sce-root .sce-toolbar:not(:is([data-synth], [data-views])) .sce-song-controls {
  flex: none;
  flex-wrap: nowrap;
}
.sce-root :is(.sce-tempo, .sce-key) {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
}
.sce-root :is(.sce-tempo-unit, .sce-key-label) {
  color: var(--sce-_muted);
  font-size: 0.92em;
}
/* A field is a button's size and edge, so a row of them reads as one family of controls. */
.sce-root .sce-field {
  box-sizing: border-box;
  min-height: 28px;
  padding: 0 6px;
  border: 1px solid var(--sce-_line-strong);
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-tempo-input {
  width: 5em;
}
.sce-root .sce-field:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
@media (pointer: coarse) {
  /* Below 16px a phone zooms the page when a field is focused, so the fields are 16px there (as the text view's box is). */
  .sce-root .sce-field {
    min-height: 36px;
    font-size: 16px;
  }
  .sce-root .sce-tempo-input {
    width: 4.2em;
  }
}
`;

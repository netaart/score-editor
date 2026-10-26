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
/*
 * In a toolbar with the view switch the group keeps its place while the score does not read, as the preview control does
 * (DESIGN.md, "Toolbar"): it comes after the switch, and its coming would move the switch along the line.
 */
.sce-root .sce-toolbar[data-views] .sce-song-controls[hidden][data-waiting] {
  display: inline-flex;
  visibility: hidden;
}
/* The two transpose buttons share an edge, as the view switch's do, so they read as one pair and not as the menu's chevron again. */
.sce-root .sce-transposes {
  gap: 0;
}
.sce-root .sce-transpose {
  border-radius: 0;
}
.sce-root .sce-transpose + .sce-transpose {
  margin-inline-start: -1px;
}
.sce-root .sce-transpose:first-child {
  border-start-start-radius: var(--sce-_radius);
  border-end-start-radius: var(--sce-_radius);
}
.sce-root .sce-transpose:last-child {
  border-start-end-radius: var(--sce-_radius);
  border-end-end-radius: var(--sce-_radius);
}
.sce-root :is(.sce-tempo, .sce-key, .sce-transposes) {
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
  border: 1px solid color-mix(in srgb, var(--sce-_text) 47%, var(--sce-_bg));
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-tempo-input {
  width: 5em;
}
.sce-root :is(.sce-field, .sce-panel-radio):focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
/* A taken command's own word (a style without a BPM after a tempo change): a bar at its start, as a panel notice has. */
.sce-root .sce-project-notice {
  margin: 0;
}
.sce-root :is(.sce-project-notice:not([hidden]), .sce-panel-notice) {
  border-inline-start: 3px solid var(--sce-_text);
  padding-inline-start: 9px;
}
.sce-root .sce-project-button {
  flex: none;
}
.sce-root .sce-project-count:not([hidden]) {
  display: inline-block;
  min-width: 1.4em;
  padding: 0 0.3em;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 0.85em;
  line-height: 1.4;
  text-align: center;
}

/*
 * The song project panel. In the toolbar it is the Project popover's content: under the button, 28em wide, and on a narrow
 * window the whole window's width with 8px margins. It scrolls inside when it is taller than the room below the toolbar.
 */
.sce-root .sce-project-popover {
  width: min(28em, calc(100vw - 16px));
  padding: 0;
}
.sce-root .sce-project-popover[data-narrow] {
  right: 8px;
  left: 8px;
  width: auto;
}
.sce-root .sce-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  outline: none;
}
.sce-root .sce-panel-field {
  display: grid;
  gap: 4px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.sce-root .sce-panel-label {
  padding: 0;
  font-weight: 600;
}
.sce-root :is(.sce-panel-hint, .sce-panel-value) {
  margin: 0;
}
.sce-root .sce-panel-hint {
  color: var(--sce-_muted);
  font-size: 0.92em;
}
.sce-root .sce-panel-value {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.sce-root .sce-panel-style {
  width: 100%;
  min-height: 4.5em;
  padding: 6px;
  line-height: 1.4;
  resize: vertical;
}
.sce-root .sce-panel-choices {
  display: grid;
  gap: 2px;
}
.sce-root .sce-panel-choice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 28px;
  cursor: pointer;
}
.sce-root .sce-panel-radio {
  flex: none;
  margin: 3px 0 0;
  accent-color: var(--sce-_accent);
}
.sce-root .sce-panel-choice-words {
  display: grid;
  gap: 0;
}
.sce-root .sce-panel-seed {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sce-root .sce-panel-seed-input {
  flex: 0 1 12em;
  min-width: 0;
}
.sce-root .sce-panel-lyrics-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.sce-root .sce-panel-count {
  color: var(--sce-_muted);
  font-size: 0.92em;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-panel-count[data-over="true"] {
  color: var(--sce-_text);
  font-weight: 600;
}
/* A reading, not a field: no fill, and the faint line, so it is not taken for a box to type in. */
.sce-root .sce-panel-lyrics {
  max-height: 12em;
  padding: 6px 8px;
  overflow: auto;
  border: 1px solid var(--sce-_line);
  border-radius: var(--sce-_radius);
  background: transparent;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.sce-root .sce-panel-lyrics[data-empty="true"] {
  color: var(--sce-_muted);
}
.sce-root .sce-panel-lyrics:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: -2px;
}
.sce-root .sce-panel-notices {
  display: grid;
  gap: 8px;
}
.sce-root .sce-panel-notices:empty {
  display: none;
}
.sce-root .sce-panel-notice {
  display: grid;
  gap: 6px;
}
.sce-root .sce-panel-notice-text {
  margin: 0;
}
.sce-root .sce-panel-notice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
@media (pointer: coarse) {
  .sce-root .sce-panel-choice {
    min-height: 36px;
    align-items: center;
  }
  .sce-root .sce-panel-radio {
    width: 20px;
    height: 20px;
    margin: 0;
  }
  /* Below 16px a phone zooms the page when a field is focused, so the fields are 16px there (as the text view's box is). */
  .sce-root .sce-field {
    min-height: 36px;
    font-size: 16px;
  }
  .sce-root .sce-tempo-input {
    width: 4.2em;
  }
}

@media (pointer: coarse) {
  /* A phone's 412px row is one line short unless the song controls are this compact; the buttons keep their 36px target. */
  .sce-root .sce-song-controls {
    gap: 4px;
  }
  .sce-root .sce-tempo-input {
    width: 4em;
  }
  .sce-root .sce-key-select {
    width: 4.5em;
  }
}
`;

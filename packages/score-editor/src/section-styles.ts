// ABOUTME: The look of the section menu: the control laid over each section band, a muted choice with its reason, and the name form.
// ABOUTME: styles.ts appends it to the editor's stylesheet; it takes every colour from the theme variables and adds no accent of its own.
export const sectionMenuCss = `
/*
 * The control of a section band is a transparent button over the whole band, so the band's name keeps its pinned place and
 * a press anywhere on the band opens the menu. A chevron after the name says the band opens something, as the zoom value
 * and the Select button do; it is there only while the part is editable.
 */
.sce-root .sce-section-open {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sce-root .sce-section-open:hover {
  background: color-mix(in srgb, var(--sce-_text) 8%, transparent);
}
.sce-root .sce-section-open[aria-expanded="true"] {
  background: color-mix(in srgb, var(--sce-_text) 12%, transparent);
}
.sce-root .sce-section-open:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: -2px;
}
.sce-root[data-editable="true"] .sce-section-name::after {
  content: "";
  display: inline-block;
  width: 4px;
  height: 4px;
  margin: 0 0 3px 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
}
.sce-root .sce-section-menus {
  display: contents;
}

/*
 * A choice the commands would refuse stays in the menu, muted. Their words stand once under the last of the muted choices
 * they are said about, aligned with the labels, and not under every one of them.
 */
.sce-root .sce-menu-note {
  max-width: 22em;
  padding: 0 10px 6px 22px;
  color: var(--sce-_muted);
  font-size: 0.92em;
}

/* The name form hangs under the band like the menu, and holds one or two text fields. */
.sce-root .sce-section-form {
  width: 20em;
  max-width: calc(100vw - 16px);
  padding: 10px;
}
.sce-root .sce-form {
  display: grid;
  gap: 10px;
  margin: 0;
}
.sce-root .sce-form-field {
  display: grid;
  gap: 4px;
}
.sce-root .sce-form-label {
  font-weight: 600;
}
.sce-root .sce-form-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 28px;
  margin: 0;
  padding: 0 8px;
  border: 1px solid var(--sce-_line-strong);
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  -webkit-user-select: text;
  user-select: text;
}
.sce-root .sce-form-input:focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 1px;
}
.sce-root .sce-form-input[aria-invalid="true"] {
  border-width: 2px;
  border-color: var(--sce-_text);
  padding: 0 7px;
}
.sce-root .sce-form-hint,
.sce-root .sce-form-error {
  margin: 0;
}
.sce-root .sce-form-hint {
  color: var(--sce-_muted);
  font-size: 0.92em;
}
.sce-root .sce-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.sce-root .sce-button-strong {
  font-weight: 600;
}
/*
 * WCAG 2.5.8 asks a target of at least 24px, and a band is 22px tall, so on a coarse pointer the row of bands is 25px: a
 * 24px control and the 1px rule under it. It stops there because a phone's frame has little height to give: at the 36px of
 * a toolbar button, the finger-drawn selection box of the multi-select spec no longer found empty lane to start on. Only
 * this row grows, and the offset the tracks hang from follows it; the bar numbers and the key and meter row stay as they are.
 */
@media (pointer: coarse) {
  .sce-root.sce-root {
    --sce-_sections: max(var(--sce-_band), 25px);
    --sce-_top: calc(var(--sce-_ruler) + var(--sce-_sections) + var(--sce-_band) + var(--sce-_chords));
  }
  .sce-root .sce-sections {
    height: var(--sce-_sections);
  }
  .sce-root .sce-form-input {
    min-height: 36px;
    font-size: max(16px, 1em);
  }
}
`;

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

/* A choice the commands would refuse stays in the menu, muted, with their words under its name. */
.sce-root .sce-menu-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 0;
}
.sce-root .sce-menu-reason {
  max-width: 22em;
  color: var(--sce-_muted);
  font-size: 0.92em;
  white-space: normal;
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
@media (pointer: coarse) {
  .sce-root .sce-form-input {
    min-height: 36px;
    font-size: max(16px, 1em);
  }
}
`;

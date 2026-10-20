// ABOUTME: The editor's stylesheet as a string, injected by mount() and removed again by destroy().
// ABOUTME: Every class is prefixed "sce-", every theme variable is "--sce-*", and nothing is imported as a CSS file.

/** Rows of a 12-row octave, counted from the top (B first), whose pitch is a black key. */
const BLACK_KEY_ROWS = [1, 3, 5, 8, 10];

/** One octave of row shading as hard-stop gradient stops: black-key rows shaded, a line under the C row. */
function octaveStripes(): string {
  const stops: string[] = [];
  for (let row = 0; row < 12; row++) {
    const color = BLACK_KEY_ROWS.includes(row) ? "var(--sce-_shade)" : "transparent";
    stops.push(`${color} calc(var(--sce-_row) * ${row})`, `${color} calc(var(--sce-_row) * ${row + 1})`);
  }
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

const css = `
/* The doubled class lifts specificity above the typical host rule such as ".page div". */
.sce-root.sce-root {
  all: initial;
  --sce-_bg: var(--sce-color-bg, light-dark(#ffffff, #1b1c1f));
  --sce-_text: var(--sce-color-text, light-dark(#18181b, #ececee));
  /* Unmapped greys are derived from the two that are mapped, so a host that maps only these stays readable. */
  --sce-_surface: var(--sce-color-surface, color-mix(in srgb, var(--sce-_text) 5%, var(--sce-_bg)));
  --sce-_muted: var(--sce-color-muted, color-mix(in srgb, var(--sce-_text) 66%, var(--sce-_bg)));
  --sce-_line: var(--sce-color-line, color-mix(in srgb, var(--sce-_text) 13%, var(--sce-_bg)));
  --sce-_line-strong: var(--sce-color-line-strong, color-mix(in srgb, var(--sce-_text) 28%, var(--sce-_bg)));
  --sce-_accent: var(--sce-color-accent, light-dark(#2457d6, #7da3ff));
  --sce-_note: var(--sce-color-note, var(--sce-_accent));
  --sce-_radius: var(--sce-radius, 4px);
  --sce-_row: var(--sce-row-height, 14px);
  --sce-_beat: var(--sce-beat-width, 40px);
  --sce-_keys: var(--sce-keys-width, 44px);
  --sce-_shade: color-mix(in srgb, var(--sce-_text) 5%, transparent);
  --sce-_sub: color-mix(in srgb, var(--sce-_line) 50%, transparent);

  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 288px;
  overflow: hidden;
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font-family: var(--sce-font-family, inherit);
  /* A keyword, so the user's browser font size applies and the host's rem tricks do not; the rest is in em. */
  font-size: small;
  line-height: 1.3;
  text-align: start;
  direction: inherit;
  color-scheme: inherit;
}
@media (pointer: coarse) {
  .sce-root.sce-root {
    --sce-_row: var(--sce-row-height, 24px);
  }
}

/*
 * Hard reset: a host's element selectors must not reach inside. Revert rolls back to browser defaults.
 * Notes are left out on purpose: all: revert on each of a few thousand nodes made first render
 * three times slower (style recalculation), so a note resets the few properties it needs by hand.
 */
.sce-root.sce-root :where(:not(.sce-note)),
.sce-root.sce-root :where(:not(.sce-note))::before,
.sce-root.sce-root :where(:not(.sce-note))::after {
  all: revert;
  box-sizing: border-box;
}
.sce-root.sce-root [hidden] {
  display: none;
}

.sce-root .sce-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 4px 12px;
  background: var(--sce-_surface);
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-title {
  font-weight: 600;
  white-space: nowrap;
}
.sce-root .sce-spacer {
  flex: 1 1 auto;
}
.sce-root .sce-badge {
  padding: 2px 8px;
  border: 1px solid var(--sce-_line-strong);
  border-radius: 999px;
  color: var(--sce-_muted);
  font-size: 0.92em;
  white-space: nowrap;
}
.sce-root .sce-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--sce-_line-strong);
  border-radius: var(--sce-_radius);
  background: var(--sce-_bg);
  color: var(--sce-_text);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.sce-root .sce-button:hover {
  background: color-mix(in srgb, var(--sce-_text) 6%, var(--sce-_bg));
}
.sce-root .sce-button[aria-expanded="true"] {
  background: color-mix(in srgb, var(--sce-_text) 10%, var(--sce-_bg));
}
.sce-root .sce-button-value {
  font-weight: 600;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-button::after {
  content: "";
  width: 5px;
  height: 5px;
  margin-top: -3px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
}
@media (pointer: coarse) {
  .sce-root .sce-button {
    min-height: 36px;
  }
}
.sce-root :is(.sce-button, .sce-menu-item, .sce-scroller, .sce-note):focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
/* The scroller's own outline would be hidden behind the sticky ruler and keys, so a ring is drawn over its box. */
.sce-root .sce-scroller:focus-visible {
  outline: none;
}
.sce-root .sce-body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
.sce-root .sce-body:has(> .sce-scroller:focus-visible)::after {
  content: "";
  position: absolute;
  z-index: 8;
  inset: 0;
  border: 2px solid var(--sce-_accent);
  pointer-events: none;
}

.sce-root .sce-scroller {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  /* Time runs left to right on a score whatever the page's writing direction. */
  direction: ltr;
  background: var(--sce-_bg);
  touch-action: pan-x pan-y pinch-zoom;
  -webkit-user-select: none;
  user-select: none;
}
.sce-root .sce-canvas {
  position: relative;
  width: calc(var(--sce-_keys) + var(--sce-bars) * 4 * var(--sce-_beat));
}

.sce-root .sce-ruler {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  height: 24px;
  background: var(--sce-_surface);
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-corner {
  position: sticky;
  left: 0;
  z-index: 1;
  flex: none;
  width: var(--sce-_keys);
  background: var(--sce-_surface);
  border-right: 1px solid var(--sce-_line);
}
.sce-root .sce-bars {
  position: relative;
  flex: none;
  width: calc(var(--sce-bars) * 4 * var(--sce-_beat));
  background: linear-gradient(90deg, var(--sce-_line-strong) 0 1px, transparent 1px) 0 0 / calc(4 * var(--sce-_beat)) 100%;
}
.sce-root .sce-bar-number {
  position: absolute;
  top: 4px;
  left: calc(var(--i) * 4 * var(--sce-_beat) + 5px);
  color: var(--sce-_muted);
  font-size: 0.92em;
  font-variant-numeric: lining-nums tabular-nums;
}

.sce-root .sce-track-group {
  position: relative;
}
.sce-root .sce-track-head {
  position: sticky;
  top: 24px;
  z-index: 4;
  display: flex;
  align-items: center;
  height: 22px;
  background: var(--sce-_surface);
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-track-name {
  position: sticky;
  left: 0;
  z-index: 1;
  padding: 0 10px;
  background: var(--sce-_surface);
  font-size: 0.92em;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.sce-root .sce-track {
  display: flex;
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-keys {
  position: sticky;
  left: 0;
  z-index: 3;
  flex: none;
  width: var(--sce-_keys);
  background: var(--sce-_surface);
  border-right: 1px solid var(--sce-_line);
}
.sce-root .sce-octave {
  display: flex;
  align-items: flex-end;
  height: calc(12 * var(--sce-_row));
  padding: 0 6px 1px;
  border-top: 1px solid var(--sce-_line);
  color: var(--sce-_muted);
  font-size: 0.85em;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-octave:first-child {
  border-top: 0;
}

.sce-root .sce-lane {
  position: relative;
  flex: none;
  width: calc(var(--sce-bars) * 4 * var(--sce-_beat));
  height: calc(var(--sce-rows) * var(--sce-_row));
  background-image:
    linear-gradient(90deg, var(--sce-_line-strong) 0 1px, transparent 1px),
    linear-gradient(90deg, var(--sce-_line) 0 1px, transparent 1px),
    linear-gradient(90deg, var(--sce-_sub) 0 1px, transparent 1px),
    ${octaveStripes()};
  background-size:
    calc(4 * var(--sce-_beat)) 100%,
    var(--sce-_beat) 100%,
    calc(var(--sce-_beat) / var(--sce-grid-div, 4)) 100%,
    100% calc(12 * var(--sce-_row));
}

.sce-root .sce-note {
  box-sizing: border-box;
  display: block;
  margin: 0;
  padding: 0;
  opacity: 1;
  box-shadow: none;
  filter: none;
  position: absolute;
  z-index: 1;
  left: calc(var(--t) * var(--sce-_beat) / 480);
  top: calc(var(--r) * var(--sce-_row));
  width: calc(var(--d) * var(--sce-_beat) / 480 - 1px);
  min-width: 5px;
  height: var(--sce-_row);
  border: 1px solid color-mix(in srgb, var(--sce-_text) 30%, var(--sce-_note));
  border-radius: min(var(--sce-_radius), 3px);
  background: var(--sce-_note);
  cursor: grab;
  touch-action: none;
  -webkit-touch-callout: none;
}
@media (pointer: coarse) {
  .sce-root .sce-note::before {
    content: "";
    position: absolute;
    inset: -4px -6px;
  }
}
.sce-root .sce-note[aria-pressed="true"] {
  z-index: 2;
  background: color-mix(in srgb, var(--sce-_note) 72%, var(--sce-_text));
  outline: 2px solid var(--sce-_text);
  outline-offset: 1px;
}
.sce-root .sce-note[aria-pressed="true"]:focus-visible {
  box-shadow: 0 0 0 5px var(--sce-_accent);
}
.sce-root .sce-note[data-dragging] {
  z-index: 2;
  cursor: grabbing;
  box-shadow: 0 4px 10px color-mix(in srgb, var(--sce-_text) 40%, transparent);
}
.sce-root .sce-note[data-blocked] {
  opacity: 0.45;
  outline: 2px dashed var(--sce-_text);
}
.sce-root[data-readonly] .sce-note {
  cursor: default;
}

.sce-root .sce-readout {
  position: absolute;
  z-index: 6;
  top: 0;
  left: 0;
  padding: 3px 8px;
  border-radius: var(--sce-_radius);
  background: var(--sce-_text);
  color: var(--sce-_bg);
  font-size: 0.92em;
  font-variant-numeric: lining-nums tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}
.sce-root .sce-readout[hidden] {
  display: none;
}

.sce-root .sce-popover {
  position: fixed;
  inset: auto;
  margin: 0;
  min-width: 190px;
  padding: 4px;
  border: 1px solid var(--sce-_line-strong);
  border-radius: calc(var(--sce-_radius) + 2px);
  background: var(--sce-_surface);
  color: var(--sce-_text);
  font: inherit;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--sce-_text) 22%, transparent);
}
.sce-root .sce-popover:not(:popover-open) {
  display: none;
}
.sce-root .sce-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 10px 0 8px;
  border: 0;
  border-radius: var(--sce-_radius);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.sce-root .sce-menu-item::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
}
.sce-root .sce-menu-item[aria-checked="true"]::before {
  background: var(--sce-_accent);
}
.sce-root .sce-menu-item:hover {
  background: color-mix(in srgb, var(--sce-_text) 8%, transparent);
}
@media (pointer: coarse) {
  .sce-root .sce-menu-item {
    min-height: 40px;
  }
}

.sce-root .sce-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (prefers-reduced-motion: no-preference) {
  .sce-root .sce-note {
    transition: opacity 120ms ease-out;
  }
}
`;

interface Injection {
  remove(): void;
  count: number;
}

type StyleScope = Document | ShadowRoot;

const injections = new WeakMap<StyleScope, Injection>();

/** One parsed sheet per document, adopted again on every mount: re-parsing the sheet made a re-mount about twice as slow. */
const sheets = new WeakMap<Document, CSSStyleSheet>();

/** Where the stylesheet must live for elements living in `el`'s tree: a shadow root itself, else the document. */
function scopeFor(el: HTMLElement): StyleScope {
  const root = el.getRootNode();
  return root.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? (root as ShadowRoot) : el.ownerDocument;
}

/**
 * Adds the sheet to the scope. A constructed stylesheet is preferred: a page whose Content-Security-Policy
 * forbids inline style elements blocks an injected <style> and leaves the editor unstyled, while the
 * stylesheet object model is not governed by that policy. The <style> element is the fallback.
 */
function addSheet(scope: StyleScope, doc: Document): () => void {
  const view = doc.defaultView;
  if (view && typeof view.CSSStyleSheet?.prototype.replaceSync === "function" && "adoptedStyleSheets" in scope) {
    let sheet = sheets.get(doc);
    if (!sheet) {
      sheet = new view.CSSStyleSheet();
      sheet.replaceSync(css);
      sheets.set(doc, sheet);
    }
    const adopted = sheet;
    scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, adopted];
    return () => {
      scope.adoptedStyleSheets = scope.adoptedStyleSheets.filter((candidate) => candidate !== adopted);
    };
  }
  const style = doc.createElement("style");
  style.textContent = css;
  (scope instanceof Document ? scope.head : scope).appendChild(style);
  return () => style.remove();
}

/** Adds the stylesheet where `el` lives, once per scope however many editors share it. Returns the release. */
export function acquireStyles(el: HTMLElement): () => void {
  const scope = scopeFor(el);
  let injection = injections.get(scope);
  if (!injection) {
    injection = { remove: addSheet(scope, el.ownerDocument), count: 0 };
    injections.set(scope, injection);
  }
  injection.count += 1;
  const held = injection;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.count -= 1;
    if (held.count === 0) {
      held.remove();
      injections.delete(scope);
    }
  };
}

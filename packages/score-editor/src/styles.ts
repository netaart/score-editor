// ABOUTME: The editor's stylesheet as a string, injected by mount() and removed again by destroy().
// ABOUTME: Every class is prefixed "sce-", every theme variable is "--sce-*", and nothing is imported as a CSS file.
import { MAX_LABEL_STEP } from "./arrangement";
import { TICKS_PER_QUARTER } from "./score";

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

/** Bar numbers thin out as bars get narrow: at step 2^e the numbers of rank below e are hidden. */
function labelThinning(): string {
  const rules: string[] = [];
  for (let e = 1; 2 ** e <= MAX_LABEL_STEP; e++) {
    const ranks = Array.from({ length: e }, (_, rank) => `[data-rank="${rank}"]`).join(", ");
    rules.push(`.sce-root[data-label-step="${2 ** e}"] .sce-bar-number:is(${ranks}) { display: none; }`);
  }
  return rules.join("\n");
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
  /* Row heights follow the text size, which the user's browser sets; round() keeps the 1px rules on whole pixels. */
  --sce-_ruler: round(1.85em, 1px);
  --sce-_band: round(1.7em, 1px);
  --sce-_chords: round(2em, 1px);
  --sce-_top: calc(var(--sce-_ruler) + 2 * var(--sce-_band) + var(--sce-_chords));

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
.sce-root .sce-notice {
  flex: none;
  padding: 6px 12px;
  background: var(--sce-_surface);
  border-bottom: 1px solid var(--sce-_line);
}
.sce-root .sce-problem {
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px 12px;
  overflow: auto;
}
.sce-root .sce-problem-title {
  margin: 0;
  font-weight: 600;
}
.sce-root .sce-problem-list {
  margin: 8px 0 0;
  padding: 0 0 0 1.4em;
  list-style: disc;
}
.sce-root .sce-problem-item {
  margin: 4px 0;
}
.sce-root .sce-problem-more {
  margin: 4px 0 0;
  color: var(--sce-_muted);
}
.sce-root .sce-zoom {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sce-root .sce-button {
  position: relative;
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
.sce-root .sce-button[aria-disabled="true"] {
  background: var(--sce-_bg);
  color: var(--sce-_muted);
  cursor: default;
}
.sce-root .sce-button-value {
  font-weight: 600;
  font-variant-numeric: lining-nums tabular-nums;
}
.sce-root .sce-zoom-value::after {
  content: "";
  width: 5px;
  height: 5px;
  margin-top: -3px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
}
/* The zoom steps draw their own minus and plus, so no glyph or font is involved. */
.sce-root .sce-step {
  justify-content: center;
  width: 28px;
  padding: 0;
}
.sce-root .sce-step::before,
.sce-root .sce-step[data-step="in"]::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 10px;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
}
.sce-root .sce-step[data-step="in"]::after {
  width: 2px;
  height: 10px;
}
@media (pointer: coarse) {
  .sce-root .sce-button {
    min-height: 36px;
  }
  .sce-root .sce-step {
    width: 36px;
  }
}
.sce-root :is(.sce-button, .sce-menu-item, .sce-scroller):focus-visible {
  outline: 2px solid var(--sce-_accent);
  outline-offset: 2px;
}
/* The scroller's own outline would be hidden behind the sticky ruler and keys, so a ring is drawn over its box. */
.sce-root .sce-scroller:focus-visible {
  outline: none;
}
.sce-root .sce-body:has(> .sce-scroller:focus-visible)::after {
  content: "";
  position: absolute;
  z-index: 8;
  inset: 0;
  border: 2px solid var(--sce-_accent);
  pointer-events: none;
}
.sce-root .sce-body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
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
/*
 * Everything on the time axis is placed in percent of the element that carries the axis (a timeline row or a lane).
 * Zooming only sets the width of those few elements. A zoom factor held in an inherited variable made every note
 * restyle on each step: about 70 ms at 1500 notes, against about 3 ms this way.
 */
.sce-root .sce-canvas {
  position: relative;
  width: calc(var(--sce-_keys) + var(--sce-ticks) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
}

.sce-root .sce-row {
  display: flex;
  border-bottom: 1px solid var(--sce-_line);
  background: var(--sce-_surface);
}
.sce-root .sce-corner {
  position: sticky;
  left: 0;
  z-index: 3;
  flex: none;
  width: var(--sce-_keys);
  background: var(--sce-_surface);
  border-right: 1px solid var(--sce-_line);
}
.sce-root .sce-timeline {
  position: relative;
  flex: none;
  width: calc(var(--sce-ticks) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
}
.sce-root .sce-top {
  position: sticky;
  top: 0;
  z-index: 5;
}
.sce-root .sce-ruler {
  height: var(--sce-_ruler);
}
.sce-root .sce-sections {
  height: var(--sce-_band);
}
.sce-root .sce-marks {
  height: var(--sce-_band);
}
.sce-root .sce-mark {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  column-gap: 8px;
  max-width: calc(var(--w) / var(--sce-ticks) * 100%);
  padding: 3px 0 0 5px;
  overflow: hidden;
  border-left: 1px solid var(--sce-_line-strong);
  font-size: 0.92em;
  font-variant-numeric: lining-nums tabular-nums;
  white-space: nowrap;
}
/*
 * Text that does not fit its stretch is left out whole instead of cut mid-word: a full-height empty first item
 * makes any item that is too wide wrap to a second line, which the clip hides. A cut "Dm" would read as "D".
 */
.sce-root .sce-mark::before,
.sce-root .sce-chord::before {
  content: "";
  flex: none;
  width: 0;
  height: 100%;
}
.sce-root .sce-mark::before {
  margin-right: -8px;
}
.sce-root .sce-mark[data-edge="end"] {
  right: 0;
  left: auto;
  max-width: none;
  padding: 3px 5px 0 0;
  border-right: 1px solid var(--sce-_line-strong);
  border-left: 0;
}
.sce-root .sce-chords {
  height: var(--sce-_chords);
}
.sce-root .sce-chords .sce-corner {
  display: flex;
  align-items: center;
  padding: 0 4px;
  overflow: hidden;
  color: var(--sce-_muted);
  font-size: 0.85em;
  white-space: nowrap;
}
.sce-root .sce-chord {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  max-width: calc(var(--w) / var(--sce-ticks) * 100%);
  padding: 5px 0 0 5px;
  overflow: hidden;
  border-left: 1px solid var(--sce-_line-strong);
  font-weight: 600;
  white-space: nowrap;
}
.sce-root .sce-empty {
  position: sticky;
  left: var(--sce-_keys);
  display: block;
  width: fit-content;
  padding: 5px 8px 0;
  color: var(--sce-_muted);
  font-size: 0.92em;
}
.sce-root .sce-section {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  border-left: 1px solid var(--sce-_line-strong);
}
.sce-root .sce-section:nth-child(even) {
  background: var(--sce-_shade);
}
.sce-root .sce-section-name {
  position: sticky;
  left: var(--sce-_keys);
  display: block;
  width: fit-content;
  max-width: 100%;
  padding: 3px 6px 0;
  overflow: hidden;
  font-size: 0.92em;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sce-root .sce-bar-number {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  padding: 4px 0 0 5px;
  border-left: 1px solid var(--sce-_line-strong);
  color: var(--sce-_muted);
  font-size: 0.92em;
  font-variant-numeric: lining-nums tabular-nums;
}

${labelThinning()}

.sce-root .sce-track-group {
  position: relative;
}
.sce-root .sce-track-head {
  position: sticky;
  top: var(--sce-_top);
  z-index: 4;
  display: flex;
  align-items: center;
  height: var(--sce-_band);
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
  width: calc(var(--sce-ticks) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
  height: calc(var(--sce-rows) * var(--sce-_row));
  background-image: ${octaveStripes()};
  background-size: 100% calc(12 * var(--sce-_row));
}
.sce-root .sce-grid {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  pointer-events: none;
}
/* The part of a cut voice that the text never reached: hatched, so a gap is not mistaken for a rest. */
.sce-root .sce-cut {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  background: repeating-linear-gradient(135deg, var(--sce-_line-strong) 0 1px, transparent 1px 7px);
  border-left: 1px dashed var(--sce-_line-strong);
}
.sce-root .sce-notes {
  position: absolute;
  inset: 0;
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
  left: calc(var(--t) / var(--sce-ticks) * 100%);
  top: calc(var(--r) * var(--sce-_row));
  width: calc(var(--d) / var(--sce-ticks) * 100% - 1px);
  min-width: 2px;
  height: var(--sce-_row);
  border: 1px solid color-mix(in srgb, var(--sce-_text) 30%, var(--sce-_note));
  border-radius: min(var(--sce-_radius), 3px);
  background: var(--sce-_note);
}
/* A tie joins two notes into one bar: no gap, no border and no rounding where they meet. */
.sce-root .sce-note[data-tie-next] {
  width: calc(var(--d) / var(--sce-ticks) * 100%);
  border-right-width: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.sce-root .sce-note[data-tie-prev] {
  border-left-width: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.sce-root .sce-popover {
  position: fixed;
  inset: auto;
  margin: 0;
  min-width: 190px;
  max-height: calc(100vh - 16px);
  padding: 4px;
  overflow: auto;
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
  font-variant-numeric: lining-nums tabular-nums;
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
.sce-root .sce-menu-rule {
  height: 1px;
  margin: 4px 0;
  background: var(--sce-_line);
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

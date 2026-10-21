// ABOUTME: The editor's stylesheet as a string, injected by mount() and removed again by destroy().
// ABOUTME: Every class is prefixed "sce-", every theme variable is "--sce-*", and nothing is imported as a CSS file.
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
.sce-root .sce-ruler {
  position: sticky;
  top: 0;
  z-index: 5;
  height: 24px;
}
.sce-root .sce-bar-number {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--t) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
  padding: 4px 0 0 5px;
  border-left: 1px solid var(--sce-_line-strong);
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
.sce-root .sce-lane {
  position: relative;
  flex: none;
  width: calc(var(--sce-ticks) * var(--sce-_beat) / ${TICKS_PER_QUARTER});
  height: calc(12 * var(--sce-_row));
  background-image: ${octaveStripes()};
  background-size: 100% calc(12 * var(--sce-_row));
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

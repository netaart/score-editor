// ABOUTME: Small DOM helpers shared by the view parts and the default editor's frame.
// ABOUTME: Nothing here runs at import time, so importing the package entry stays free of DOM access.

export function create<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  parent?: Element,
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  el.className = className;
  parent?.appendChild(el);
  return el;
}

const SVG = "http://www.w3.org/2000/svg";

/** A 16 by 16 line drawing of polylines, which the stylesheet strokes; why not paths is in DESIGN.md, "Undo, redo and Delete". */
export function lineIcon(doc: Document, polylines: ReadonlyArray<string>): SVGSVGElement {
  const icon = doc.createElementNS(SVG, "svg");
  icon.setAttribute("class", "sce-icon");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  for (const points of polylines) {
    const line = doc.createElementNS(SVG, "polyline");
    line.setAttribute("points", points);
    icon.appendChild(line);
  }
  return icon;
}

/** Throws the package's clear error where there is no DOM, so a server render fails with a reason and not a reference error. */
export function requireDom(who: string): void {
  if (typeof document === "undefined") {
    throw new Error(`@neta-art/score-editor: ${who}() needs a browser DOM; call it from client-side code only.`);
  }
}

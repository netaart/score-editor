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

/** Throws the package's clear error where there is no DOM, so a server render fails with a reason and not a reference error. */
export function requireDom(who: string): void {
  if (typeof document === "undefined") {
    throw new Error(`@neta-art/score-editor: ${who}() needs a browser DOM; call it from client-side code only.`);
  }
}

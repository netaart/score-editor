// ABOUTME: The one rule that brings a banner into view inside the editor's chrome without taking focus, and puts the chrome back.
// ABOUTME: It scrolls only the nearest .sce-chrome; a banner mounted in a host layout of its own is left where it is.
interface Reveal {
  readonly chrome: HTMLElement;
  readonly before: number;
  readonly after: number;
}

/** The scroll the reveal moved, by the banner that asked for it, so the banner can put the chrome back when it leaves. */
const reveals = new WeakMap<HTMLElement, Reveal>();

/** Scrolls the editor's chrome so the whole banner is inside its visible box. DOM order and focus stay as they are. */
export function revealConflictInChrome(strip: HTMLElement): void {
  const chrome = strip.closest<HTMLElement>(".sce-chrome");
  if (chrome === null) return;
  const run = (): void => {
    if (!strip.isConnected || strip.hidden) return;
    const outer = chrome.getBoundingClientRect();
    const inner = strip.getBoundingClientRect();
    const top = chrome.scrollTop + inner.top - outer.top;
    if (top > chrome.scrollTop) {
      const before = chrome.scrollTop;
      chrome.scrollTop = top;
      reveals.set(strip, { chrome, before, after: chrome.scrollTop });
    }
  };
  const view = strip.ownerDocument.defaultView;
  if (view === null) run();
  else view.requestAnimationFrame(run);
}

/**
 * Puts the chrome back where the reveal found it when the banner leaves. The caller hides the banner after this, so the
 * chrome still holds the height the reveal was measured against.
 */
export function restoreConflictInChrome(strip: HTMLElement): void {
  const reveal = reveals.get(strip);
  if (reveal === undefined) return;
  reveals.delete(strip);
  reveal.chrome.scrollTop = reveal.before;
}

// ABOUTME: The one rule that brings a conflict strip into view inside the editor's chrome without taking focus.
// ABOUTME: It scrolls only the nearest .sce-chrome; a strip mounted in a host layout of its own is left where it is.
/** Scrolls the editor's chrome so the whole strip is inside its visible box. DOM order and focus stay as they are. */
export function revealConflictInChrome(strip: HTMLElement): void {
  const chrome = strip.closest<HTMLElement>(".sce-chrome");
  if (chrome === null) return;
  const run = (): void => {
    if (!strip.isConnected) return;
    const outer = chrome.getBoundingClientRect();
    const inner = strip.getBoundingClientRect();
    const top = chrome.scrollTop + inner.top - outer.top;
    if (top > chrome.scrollTop) chrome.scrollTop = top;
  };
  const view = strip.ownerDocument.defaultView;
  if (view === null) run();
  else view.requestAnimationFrame(run);
}

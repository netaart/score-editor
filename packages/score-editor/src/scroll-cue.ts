// ABOUTME: Marks a scrolling box whose edge clips more content, so a person can see that there is more that way.
// ABOUTME: It writes a data attribute the stylesheet fades with, and clears it when nothing is left in that direction.

/** Which way the box scrolls: the chrome vertically, the toolbar's strip sideways. */
export type ScrollCueAxis = "vertical" | "horizontal";

/**
 * Keeps `el`'s `data-cue` in step with what it can scroll to: `up`/`down` for the chrome, `left`/`right` for the strip,
 * `both` in the middle, and no attribute when nothing is clipped. It follows scrolling, resizing and content changes.
 */
export function watchScrollCue(el: HTMLElement, axis: ScrollCueAxis, signal: AbortSignal): void {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  const vertical = axis === "vertical";
  let frame = 0;

  function sync(): void {
    frame = 0;
    if (!el.isConnected) return;
    const start = vertical ? el.scrollTop : el.scrollLeft;
    const visible = vertical ? el.clientHeight : el.clientWidth;
    const total = vertical ? el.scrollHeight : el.scrollWidth;
    const before = start > 1;
    const after = start + visible < total - 1;
    const cue =
      before && after ? "both" : before ? (vertical ? "up" : "left") : after ? (vertical ? "down" : "right") : "";
    if (cue === "") delete el.dataset.cue;
    else el.dataset.cue = cue;
  }

  function schedule(): void {
    if (frame !== 0) return;
    const scheduleFrame = view?.requestAnimationFrame;
    if (scheduleFrame === undefined) {
      sync();
      return;
    }
    frame = scheduleFrame.call(view, sync);
  }

  el.addEventListener("scroll", schedule, { passive: true, signal });
  view?.addEventListener("resize", schedule, { signal });
  const Observer = view?.ResizeObserver;
  if (Observer) {
    const observer = new Observer(schedule);
    observer.observe(el);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }
  const Mutations = view?.MutationObserver;
  if (Mutations) {
    const observer = new Mutations(schedule);
    observer.observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "style"],
    });
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }
  sync();
  schedule();
}

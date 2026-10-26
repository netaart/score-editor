// ABOUTME: Where the conflict banner's choice dialog opens: under the banner, or from the top of the editor when the room below is short.
// ABOUTME: It measures the dialog's whole height before it opens, so both choices and their consequences stay inside the root without scrolling.
/** The room the editor gives the dialog, and where its own box is; the window bounds a host layout without an editor. */
function frameOf(popover: HTMLElement): { top: number; bottom: number; left: number; right: number } {
  const view = popover.ownerDocument.defaultView;
  const width = Math.min(
    view?.innerWidth ?? 0,
    popover.ownerDocument.documentElement.clientWidth || view?.innerWidth || 0,
  );
  const height = view?.innerHeight ?? 0;
  const editor = popover.closest<HTMLElement>(".sce-editor")?.getBoundingClientRect() ?? null;
  return {
    top: Math.max(8, editor?.top ?? 8),
    bottom: Math.min(height, editor?.bottom ?? height),
    left: Math.max(8, editor?.left ?? 8),
    right: Math.min(width, editor?.right ?? width),
  };
}

/** The dialog's whole height, measured with its open layout while it is still invisible on the page. */
function naturalHeight(popover: HTMLElement): number {
  const previous = {
    display: popover.style.display,
    flexDirection: popover.style.flexDirection,
    gap: popover.style.gap,
    maxHeight: popover.style.maxHeight,
    overflowY: popover.style.overflowY,
  };
  popover.style.display = "flex";
  popover.style.flexDirection = "column";
  popover.style.gap = "6px";
  popover.style.maxHeight = "none";
  popover.style.overflowY = "visible";
  const height = popover.getBoundingClientRect().height;
  popover.style.display = previous.display;
  popover.style.flexDirection = previous.flexDirection;
  popover.style.gap = previous.gap;
  popover.style.maxHeight = previous.maxHeight;
  popover.style.overflowY = previous.overflowY;
  return height;
}

/**
 * Places the choices of a conflict banner: under the strip when the whole dialog fits there, otherwise from the root's
 * top, over the toolbar, where the whole dialog fits without scrolling. Either way it stays inside the root's box.
 */
export function placeConflictChoices(popover: HTMLElement, strip: HTMLElement): void {
  const view = popover.ownerDocument.defaultView;
  if (view === null) return;
  const frame = frameOf(popover);
  const stripBox = strip.getBoundingClientRect();
  const height = naturalHeight(popover);
  const width = popover.getBoundingClientRect().width;
  const under = stripBox.bottom + 4;
  const below = frame.bottom - 8 - under;
  const fitsBelow = below >= height;
  const top = fitsBelow ? under : frame.top;
  const bottomLimit = frame.bottom - 8;
  const maxHeight = Math.max(1, bottomLimit - top);
  popover.style.top = `${top}px`;
  popover.style.maxHeight = `${maxHeight}px`;
  popover.style.overflowY = height > maxHeight ? "auto" : "";
  popover.style.left = `${Math.max(frame.left, Math.min(stripBox.left, frame.right - 8 - width))}px`;
}

// ABOUTME: The menu that opens under a toolbar button or a section band: a native popover of menu items with arrow-key movement between them.
// ABOUTME: The zoom control, the selection and Project menus and the section menu share it, so a popover opens, places itself, takes focus and closes one way.
import { create } from "./dom";

/** How a floating layer sits under its anchor; a narrow layer spans the window instead of sitting on the anchor's left edge. */
export interface UnderAnchorOptions {
  narrow?: boolean;
  /** The room the caller gives the layer, for a panel that scrolls inside it. */
  maxHeight?: number;
}

export interface KeepInsideOptions extends UnderAnchorOptions {
  /** Keep the top the layer has and move it up only as far as the bottom edge needs, for a layer that grows after it is placed. */
  keepTop?: boolean;
}

/** Where a popover hangs: the left edge of its anchor, the line it sits 4px under, and the top the bottom rule needs. */
export interface PopoverAnchor {
  readonly left: number;
  readonly bottom: number;
  readonly top: number;
}

/** The anchor an element gives a popover: its box, including the top so a layer can go above it. */
export function anchorOf(element: HTMLElement): PopoverAnchor {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, bottom: rect.bottom, top: rect.top };
}

/** Leaves a popover to the stylesheet's own placement, such as a sheet fixed to the bottom edge of a phone. */
export function clearPlacement(popover: HTMLElement): void {
  popover.style.left = "";
  popover.style.top = "";
  popover.style.maxHeight = "";
  popover.style.overflowY = "";
}

/** Puts a popover that is about to open under its anchor, on the anchor's left edge, with no old height limit. */
export function placeUnder(anchor: PopoverAnchor, popover: HTMLElement, options: UnderAnchorOptions = {}): void {
  popover.style.maxHeight = options.maxHeight === undefined ? "" : `${options.maxHeight}px`;
  popover.style.overflowY = "";
  popover.style.left = options.narrow ? "" : `${anchor.left}px`;
  popover.style.top = `${anchor.bottom + 4}px`;
}

/**
 * Moves an open popover inside the window, 8px from its edges. It is nudged left when it runs off to the right, unless it
 * is narrow and spans the window. When its bottom runs off, it goes above its anchor when it fits there; otherwise it
 * starts 8px from the top and scrolls inside the room left. A caller's `maxHeight` stays the cap.
 */
export function keepInside(popover: HTMLElement, anchor: PopoverAnchor, options: KeepInsideOptions = {}): void {
  const view = popover.ownerDocument.defaultView;
  if (!view) return;
  const room = view.innerHeight - 16;
  // A growing layer is measured again at full height, so a cap from its first placement cannot clip what it gained.
  if (options.keepTop) {
    popover.style.maxHeight = `${options.maxHeight ?? room}px`;
    popover.style.overflowY = "";
  }
  const rect = popover.getBoundingClientRect();
  if (!options.narrow) {
    const layout = Math.min(view.innerWidth, popover.ownerDocument.documentElement.clientWidth || view.innerWidth);
    popover.style.left = `${Math.max(8, Math.min(rect.left, layout - 8 - rect.width))}px`;
  }
  const below = rect.bottom - (view.innerHeight - 8);
  if (below <= 0) return;
  if (options.keepTop) {
    const top = Math.max(8, rect.top - below);
    popover.style.top = `${top}px`;
    const left = view.innerHeight - top - 8;
    popover.style.maxHeight = `${Math.max(1, Math.min(options.maxHeight ?? left, left, room))}px`;
    popover.style.overflowY = "auto";
    return;
  }
  const above = anchor.top - 4 - rect.height;
  if (above >= 8) {
    popover.style.top = `${above}px`;
    return;
  }
  popover.style.top = "8px";
  popover.style.maxHeight = `${Math.max(1, Math.min(options.maxHeight ?? room, room))}px`;
  popover.style.overflowY = "auto";
}

export interface PopoverMenu {
  readonly element: HTMLElement;
  /** Adds an item. Choosing it closes the menu first and then runs `choose`. */
  item(
    role: "menuitem" | "menuitemradio",
    choose: () => unknown,
    options?: { readonly keepOpen?: boolean },
  ): HTMLButtonElement;
  /** Adds a rule between two groups of items. */
  rule(): void;
}

export interface PopoverMenuOptions {
  /** The item that takes the focus when the menu opens; the first shown item when this gives none. */
  initialFocus?(items: ReadonlyArray<HTMLButtonElement>): HTMLElement | undefined;
  /**
   * Where the menu hangs, when that is not the button's own box: its left edge, the line it sits 4px under, and its top.
   * A button that is wider than the part of it in view, such as a band, says where its visible start is.
   */
  anchor?(): PopoverAnchor;
}

/**
 * Places an open popover under `anchor` and inside the window. The menu and the section form hang from the same point,
 * so they place themselves the same way.
 */
export function placePopover(popover: HTMLElement, anchor: PopoverAnchor, options: UnderAnchorOptions = {}): void {
  placeUnder(anchor, popover, options);
  keepInside(popover, anchor, options);
}

/**
 * Makes the menu that `button` opens, as the last child of `root`. The menu is a native popover, so it stacks above a
 * host's full-screen layer, and it sits under the button, moved left or above it when it would run off the window. The
 * first shown item, or the one `initialFocus` names, takes the focus when it opens, and Up, Down, Home and End move
 * between the items. Everything it adds is removed with `root`.
 */
export function mountPopoverMenu(
  root: HTMLElement,
  button: HTMLButtonElement,
  signal: AbortSignal,
  options: PopoverMenuOptions = {},
): PopoverMenu {
  const doc = root.ownerDocument;
  const menu = create(doc, "div", "sce-popover", root);
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "menu");
  const items: HTMLButtonElement[] = [];
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.popoverTargetElement = menu;
  button.popoverTargetAction = "toggle";
  const anchor = (): PopoverAnchor => options.anchor?.() ?? anchorOf(button);

  menu.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      placeUnder(anchor(), menu);
    },
    { signal },
  );
  menu.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      keepInside(menu, anchor());
      (options.initialFocus?.(items) ?? items.find((item) => !item.hidden))?.focus();
    },
    { signal },
  );
  menu.addEventListener(
    "keydown",
    (event) => {
      if (!(event.target instanceof HTMLButtonElement)) return;
      if (!items.includes(event.target)) return;
      // An item that is left out (hidden) is not in the way: the keys go to the next one that is shown.
      const shown = items.filter((item) => !item.hidden);
      const here = shown.indexOf(event.target);
      let next: HTMLButtonElement | undefined;
      if (event.key === "ArrowDown") next = shown[(here + 1) % shown.length];
      else if (event.key === "ArrowUp") next = shown[(here - 1 + shown.length) % shown.length];
      else if (event.key === "Home") next = shown[0];
      else if (event.key === "End") next = shown.at(-1);
      if (next === undefined) return;
      event.preventDefault();
      next.focus();
    },
    { signal },
  );

  return {
    element: menu,
    item(role, choose, options = {}) {
      const item = create(doc, "button", "sce-menu-item", menu);
      item.type = "button";
      item.setAttribute("role", role);
      item.addEventListener(
        "click",
        () => {
          if (!options.keepOpen) {
            menu.hidePopover();
            choose();
            return;
          }
          if (choose() !== true) menu.hidePopover();
        },
        { signal },
      );
      items.push(item);
      return item;
    },
    rule() {
      create(doc, "div", "sce-menu-rule", menu).setAttribute("role", "separator");
    },
  };
}

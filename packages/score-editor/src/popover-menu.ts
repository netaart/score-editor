// ABOUTME: The menu that opens under a toolbar button or a section band: a native popover of menu items with arrow-key movement between them.
// ABOUTME: The zoom control, the selection menu and the section menu share it, so a menu opens, places itself, takes focus and closes one way.
import { create } from "./dom";

export interface PopoverMenu {
  readonly element: HTMLElement;
  /** Adds an item. Choosing it closes the menu first and then runs `choose`. */
  item(role: "menuitem" | "menuitemradio", choose: () => void): HTMLButtonElement;
  /** Adds a rule between two groups of items. */
  rule(): void;
}

export interface PopoverMenuOptions {
  /** The item that takes the focus when the menu opens; the first item when this gives none. */
  initialFocus?(items: ReadonlyArray<HTMLButtonElement>): HTMLElement | undefined;
  /**
   * Where the menu hangs, when that is not the button's own box: its left edge, and the line it sits 4px under. A button
   * that is wider than the part of it in view, such as a band, says where its visible start is.
   */
  anchor?(): { readonly left: number; readonly bottom: number };
}

/**
 * Places a popover under `anchor`, moved left when its right edge would run off the window. The menu and the section
 * form hang from the same point, so they place themselves the same way.
 */
export function placePopover(element: HTMLElement, anchor: { readonly left: number; readonly bottom: number }): void {
  element.style.left = `${anchor.left}px`;
  element.style.top = `${anchor.bottom + 4}px`;
  const view = element.ownerDocument.defaultView;
  if (!view) return;
  const box = element.getBoundingClientRect();
  const across = box.right - (view.innerWidth - 8);
  if (across > 0) element.style.left = `${Math.max(8, box.left - across)}px`;
}

/**
 * Makes the menu that `button` opens, as the last child of `root`. The menu is a native popover, so it stacks above a
 * host's full-screen layer, and it sits under the button, moved left when it would run off the window. The first item,
 * or the one `initialFocus` names, takes the focus when it opens, and Up, Down, Home and End move between the items.
 * Everything it adds is removed with `root`.
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

  menu.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      placePopover(menu, options.anchor?.() ?? button.getBoundingClientRect());
      (options.initialFocus?.(items) ?? items[0])?.focus();
    },
    { signal },
  );
  menu.addEventListener(
    "keydown",
    (event) => {
      if (!(event.target instanceof HTMLButtonElement)) return;
      const at = items.indexOf(event.target);
      if (at < 0) return;
      let next = -1;
      if (event.key === "ArrowDown") next = (at + 1) % items.length;
      else if (event.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      if (next < 0) return;
      event.preventDefault();
      items[next]?.focus();
    },
    { signal },
  );

  return {
    element: menu,
    item(role, choose) {
      const item = create(doc, "button", "sce-menu-item", menu);
      item.type = "button";
      item.setAttribute("role", role);
      item.addEventListener(
        "click",
        () => {
          menu.hidePopover();
          choose();
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

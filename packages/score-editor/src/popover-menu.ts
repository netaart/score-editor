// ABOUTME: The menu that opens under a toolbar button: a native popover of menu items with arrow-key movement between them.
// ABOUTME: The zoom control and the selection menu share it, so a menu opens, places itself, takes focus and closes one way.
import { create } from "./dom";

export interface PopoverMenu {
  readonly element: HTMLElement;
  /** Adds an item. Choosing it closes the menu first and then runs `choose`. */
  item(role: "menuitem" | "menuitemradio", choose: () => void): HTMLButtonElement;
  /** Adds a rule between two groups of items. */
  rule(): void;
}

/** Puts a popover that is about to open under its button, on the button's left edge. */
export function placeUnder(button: HTMLElement, popover: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  popover.style.left = `${rect.left}px`;
  popover.style.top = `${rect.bottom + 4}px`;
}

/** Moves an open popover left until it is inside the window, 8px from its edge, when it ran off to the right. */
export function nudgeIntoWindow(popover: HTMLElement): void {
  const view = popover.ownerDocument.defaultView;
  if (!view) return;
  const rect = popover.getBoundingClientRect();
  const overflow = rect.right - (view.innerWidth - 8);
  if (overflow > 0) popover.style.left = `${Math.max(8, rect.left - overflow)}px`;
}

export interface PopoverMenuOptions {
  /** The item that takes the focus when the menu opens; the first item when this gives none. */
  initialFocus?(items: ReadonlyArray<HTMLButtonElement>): HTMLElement | undefined;
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
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      placeUnder(button, menu);
    },
    { signal },
  );
  menu.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      nudgeIntoWindow(menu);
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

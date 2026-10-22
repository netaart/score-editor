// ABOUTME: The zoom control view part: the step buttons, the zoom readout and the menu of presets and "Fit whole song".
// ABOUTME: The menu is a native popover, so it stacks above a host's full-screen layer; it reads and sets the session's zoom.

import { stepZoom, ZOOM_PRESETS } from "./arrangement";
import { fitZoom, installZoomGestures, stepZoomBy, zoomTo } from "./axis";
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";
import { arrangementShown } from "./view-rules";

/**
 * Mounts the zoom control on `el`. It shows the session's zoom and changes it for every part bound to the session. It
 * is hidden while the session has no score to show.
 */
export function mountZoomControl(el: HTMLElement, session: EditingSession): ViewPart {
  requireDom("mountZoomControl");
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-zoom");
  el.appendChild(root);

  const group = create(doc, "div", "sce-zoom", root);
  group.setAttribute("role", "group");
  const stepButton = (direction: "in" | "out"): HTMLButtonElement => {
    const button = create(doc, "button", "sce-button sce-step", group);
    button.type = "button";
    button.dataset.step = direction;
    return button;
  };
  const zoomOut = stepButton("out");
  const zoomButton = create(doc, "button", "sce-button sce-zoom-value", group);
  zoomButton.type = "button";
  zoomButton.setAttribute("aria-haspopup", "menu");
  zoomButton.setAttribute("aria-expanded", "false");
  const zoomLabel = create(doc, "span", "sce-sr-only", zoomButton);
  const zoomValue = create(doc, "span", "sce-button-value", zoomButton);
  const zoomIn = stepButton("in");

  const menu = create(doc, "div", "sce-popover", root);
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "menu");
  const menuItem = (role: "menuitem" | "menuitemradio"): HTMLButtonElement => {
    const item = create(doc, "button", "sce-menu-item", menu);
    item.type = "button";
    item.setAttribute("role", role);
    return item;
  };
  const menuItems = new Map<number, HTMLButtonElement>();
  for (const preset of ZOOM_PRESETS) {
    const item = menuItem("menuitemradio");
    item.addEventListener(
      "click",
      () => {
        menu.hidePopover();
        zoomTo(session, preset);
      },
      { signal },
    );
    menuItems.set(preset, item);
  }
  create(doc, "div", "sce-menu-rule", menu).setAttribute("role", "separator");
  const fitItem = menuItem("menuitem");
  fitItem.addEventListener(
    "click",
    () => {
      menu.hidePopover();
      fitZoom(session);
    },
    { signal },
  );
  zoomButton.popoverTargetElement = menu;
  zoomButton.popoverTargetAction = "toggle";

  menu.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      const rect = zoomButton.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 4}px`;
    },
    { signal },
  );
  menu.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      zoomButton.setAttribute("aria-expanded", String(open));
      if (!open) return;
      const view = doc.defaultView;
      if (view) {
        const rect = menu.getBoundingClientRect();
        const overflow = rect.right - (view.innerWidth - 8);
        if (overflow > 0) menu.style.left = `${Math.max(8, rect.left - overflow)}px`;
      }
      const checked = [...menuItems.values()].find((item) => item.getAttribute("aria-checked") === "true");
      (checked ?? fitItem).focus();
    },
    { signal },
  );
  zoomOut.addEventListener("click", () => stepZoomBy(session, "out"), { signal });
  zoomIn.addEventListener("click", () => stepZoomBy(session, "in"), { signal });

  /** Arrow, Home and End keys move between the items of the open menu, as a menu is expected to behave. */
  root.addEventListener(
    "keydown",
    (event) => {
      if (!(event.target instanceof Element && event.target.closest(".sce-menu-item"))) return;
      const items = [...menuItems.values(), fitItem];
      const at = event.target instanceof HTMLButtonElement ? items.indexOf(event.target) : -1;
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
  installZoomGestures(root, session, signal, { wheel: false });

  let language: Language | null = null;
  function applyLanguage(): void {
    language = session.view.language;
    const t = messagesFor(language);
    root.lang = language;
    group.setAttribute("aria-label", t.zoom);
    zoomOut.setAttribute("aria-label", t.zoomOut);
    zoomIn.setAttribute("aria-label", t.zoomIn);
    zoomLabel.textContent = t.zoom;
    menu.setAttribute("aria-label", t.zoom);
    for (const [preset, item] of menuItems) item.textContent = `${Math.round(preset * 100)}%`;
    fitItem.textContent = t.zoomFit;
  }

  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    const { zoom } = session.view;
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    for (const [preset, item] of menuItems) item.setAttribute("aria-checked", String(Math.abs(preset - zoom) < 1e-6));
    zoomOut.setAttribute("aria-disabled", String(stepZoom(zoom, "out") === null));
    zoomIn.setAttribute("aria-disabled", String(stepZoom(zoom, "in") === null));
    group.hidden = session.reading.kind !== "score" || !arrangementShown(session);
  }

  draw();
  const unsubscribe = session.subscribe(draw);
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribe();
      root.remove();
      releaseStyles();
    },
  };
}

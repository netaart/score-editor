// ABOUTME: The zoom control view part: the step buttons, the zoom readout and the menu of presets and "Fit whole song".
// ABOUTME: The menu is a native popover, so it stacks above a host's full-screen layer; it reads and sets the session's zoom.

import { stepZoom, ZOOM_PRESETS } from "./arrangement";
import { fitZoom, installZoomGestures, stepZoomBy, zoomTo } from "./axis";
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import { mountPopoverMenu } from "./popover-menu";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

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
  const zoomLabel = create(doc, "span", "sce-sr-only", zoomButton);
  const zoomValue = create(doc, "span", "sce-button-value", zoomButton);
  const zoomIn = stepButton("in");

  const menu = mountPopoverMenu(root, zoomButton, signal, {
    initialFocus: (items) => items.find((item) => item.getAttribute("aria-checked") === "true") ?? items.at(-1),
  });
  const menuItems = new Map<number, HTMLButtonElement>();
  for (const preset of ZOOM_PRESETS)
    menuItems.set(
      preset,
      menu.item("menuitemradio", () => zoomTo(session, preset)),
    );
  menu.rule();
  const fitItem = menu.item("menuitem", () => fitZoom(session));
  zoomOut.addEventListener("click", () => stepZoomBy(session, "out"), { signal });
  zoomIn.addEventListener("click", () => stepZoomBy(session, "in"), { signal });

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
    menu.element.setAttribute("aria-label", t.zoom);
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
    group.hidden = session.reading.kind !== "score";
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

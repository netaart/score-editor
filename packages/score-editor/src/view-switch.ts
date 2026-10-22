// ABOUTME: The view switch part: three buttons that choose which view the session shows, the arrangement, the staff or the score text.
// ABOUTME: It works while the session is read-only, and it follows a view that something else sets.
import { create, requireDom } from "./dom";
import { messagesFor, viewName } from "./i18n";
import { lineIcon } from "./icons";
import { type EditingSession, VIEW_NAMES, type ViewName } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/**
 * What each view looks like in a 16 by 16 drawing: bars at different heights and starts for the tracks, five lines for the
 * staff, lines of text for the score text.
 */
const ICONS: Record<ViewName, ReadonlyArray<string>> = {
  arrangement: ["2.5,4 8,4", "5.5,8 13.5,8", "3.5,12 10,12"],
  staff: ["1.5,3 14.5,3", "1.5,5.75 14.5,5.75", "1.5,8.5 14.5,8.5", "1.5,11.25 14.5,11.25", "1.5,14 14.5,14"],
  text: ["2.5,4 13.5,4", "2.5,8 13.5,8", "2.5,12 9,12"],
};

/**
 * Mounts the view switch on `el`: one button for each of the views in `VIEW_NAMES`, the shown one pressed. Pressing one
 * sets the session's `activeView`, and the switch follows a view set by anything else. It works while the session is
 * read-only, since it changes what is shown and not the score. It follows the session's language.
 */
export function mountViewSwitch(el: HTMLElement, session: EditingSession): ViewPart {
  requireDom("mountViewSwitch");
  const doc = el.ownerDocument;
  const abort = new AbortController();
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-view-switch");
  el.appendChild(root);

  const group = create(doc, "div", "sce-views", root);
  group.setAttribute("role", "group");
  const buttons = new Map<ViewName, HTMLButtonElement>();
  for (const view of VIEW_NAMES) {
    const button = create(doc, "button", `sce-button sce-icon-button sce-view-button sce-view-${view}`, group);
    button.type = "button";
    button.appendChild(lineIcon(doc, ICONS[view]));
    button.addEventListener("click", () => session.setActiveView(view), { signal: abort.signal });
    buttons.set(view, button);
  }

  let language: Language | null = null;
  let shown: ViewName | null = null;
  function draw(): void {
    if (session.view.language !== language) {
      language = session.view.language;
      const t = messagesFor(language);
      root.lang = language;
      group.setAttribute("aria-label", t.viewSwitch);
      for (const [view, button] of buttons) {
        button.setAttribute("aria-label", viewName(t, view));
        button.title = viewName(t, view);
      }
    }
    if (session.activeView === shown) return;
    shown = session.activeView;
    for (const [view, button] of buttons) button.setAttribute("aria-pressed", String(view === shown));
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

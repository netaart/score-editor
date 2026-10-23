// ABOUTME: The toolbar's Project button and the popover that holds the song project panel.
// ABOUTME: The popover is native, so it stacks above a host's full-screen layer, closes with Escape and gives the focus back; closing takes what was typed.
import { create } from "./dom";
import { messagesFor } from "./i18n";
import type { LiveRegion } from "./live-region";
import { carriedNotices } from "./project-notices";
import { drawProjectPanel } from "./project-panel";
import type { EditingSession } from "./session";
import type { EditingPartOptions, Language, ViewPart } from "./types";

/**
 * Adds the Project button to `row` and the popover it opens as the last child of `root`. The popover sits under the button,
 * moved left where it would run off the window, and on a narrow window it spans the window, so the keys of a phone's
 * keyboard cannot cover it. The button is there while the session has a dialect to read the project with. While the project
 * carries notices the button's name says how many, so a closed panel does not hide them.
 */
export function mountProjectControl(
  row: HTMLElement,
  root: HTMLElement,
  session: EditingSession,
  live: LiveRegion,
  onRefused: EditingPartOptions["onRefused"],
): ViewPart {
  const doc = row.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;

  const button = create(doc, "button", "sce-button sce-project-button", row);
  button.type = "button";
  const word = create(doc, "span", "sce-project-word", button);
  const count = create(doc, "span", "sce-button-value sce-project-count", button);
  const popover = create(doc, "div", "sce-popover sce-project-popover", root);
  popover.setAttribute("popover", "auto");
  popover.setAttribute("role", "dialog");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.popoverTargetElement = popover;
  button.popoverTargetAction = "toggle";
  const panel = drawProjectPanel(popover, session, live, onRefused);

  popover.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState === "open") {
        const view = doc.defaultView;
        const rect = button.getBoundingClientRect();
        const room = (view?.innerHeight ?? 0) - rect.bottom - 12;
        popover.style.top = `${rect.bottom + 4}px`;
        const narrow = view?.matchMedia("(max-width: 40em)").matches ?? false;
        popover.toggleAttribute("data-narrow", narrow);
        popover.style.left = narrow ? "" : `${rect.left}px`;
        popover.style.maxHeight = `${Math.max(room, 0)}px`;
        return;
      }
      panel.commit();
    },
    { signal },
  );
  popover.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      const view = doc.defaultView;
      if (view && !popover.hasAttribute("data-narrow")) {
        const rect = popover.getBoundingClientRect();
        const overflow = rect.right - (view.innerWidth - 8);
        if (overflow > 0) popover.style.left = `${Math.max(8, rect.left - overflow)}px`;
      }
      panel.element.focus({ preventScroll: true });
    },
    { signal },
  );

  let language: Language | null = null;
  let t = messagesFor(session.view.language);
  function applyLanguage(): void {
    language = session.view.language;
    t = messagesFor(language);
    word.textContent = t.projectName;
    popover.setAttribute("aria-label", t.projectName);
  }

  /** What the last draw showed, so a change of zoom or scroll costs nothing here. */
  let drawn = "";
  function draw(): void {
    if (session.view.language !== language) {
      applyLanguage();
      drawn = "";
    }
    const notices = carriedNotices(session).length;
    const shown = `${session.dialect !== undefined}:${notices}`;
    if (shown === drawn) return;
    drawn = shown;
    button.hidden = session.dialect === undefined;
    count.hidden = notices === 0;
    count.textContent = String(notices);
    if (notices === 0) button.removeAttribute("aria-label");
    else button.setAttribute("aria-label", t.projectNotices(notices));
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
      panel.destroy();
      popover.remove();
      button.remove();
    },
  };
}

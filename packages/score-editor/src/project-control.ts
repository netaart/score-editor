// ABOUTME: The toolbar's Project button and the popover that holds the song project panel.
// ABOUTME: The popover is native, so it stacks above a host's full-screen layer, closes with Escape and gives the focus back; closing takes what was typed.
import { create } from "./dom";
import { messagesFor } from "./i18n";
import type { LiveRegion } from "./live-region";
import { keepInside, placeUnder } from "./popover-menu";
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
  const panel = drawProjectPanel(popover, session, live, onRefused, false);

  /** Puts the popover under the button: on a narrow window it spans the window, and its height is the room below the button. */
  function place(): void {
    const view = doc.defaultView;
    const rect = button.getBoundingClientRect();
    const narrow = view?.matchMedia("(max-width: 40em)").matches ?? false;
    popover.toggleAttribute("data-narrow", narrow);
    placeUnder(popover, button, {
      narrow,
      maxHeight: Math.max((view?.innerHeight ?? 0) - rect.bottom - 12, 0),
    });
  }
  /** The toolbar wraps again when its controls come and go or the window changes, which moves the button the popover hangs from. */
  function follow(): void {
    if (!popover.matches(":popover-open")) return;
    place();
    keepInside(popover, popover.hasAttribute("data-narrow"));
  }

  popover.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState === "open") place();
      else panel.commit();
    },
    { signal },
  );
  popover.addEventListener(
    "toggle",
    (event) => {
      const open = (event as ToggleEvent).newState === "open";
      button.setAttribute("aria-expanded", String(open));
      if (!open) return;
      keepInside(popover, popover.hasAttribute("data-narrow"));
      panel.element.focus({ preventScroll: true });
    },
    { signal },
  );
  doc.defaultView?.addEventListener("resize", follow, { signal });

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
    // The toolbar's other parts draw in this same change, so the button is where it will be a frame later.
    doc.defaultView?.requestAnimationFrame(follow);
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

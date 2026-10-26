// ABOUTME: The cut notice view part: the one sentence that says the score text stops before the song does, and where.
// ABOUTME: It holds the two repairs of an incomplete bar, Fill with rests and Delete, and is hidden when the score is complete.
import { cutOf } from "./arrangement";
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import { createLiveRegion, sayRefusals } from "./live-region";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { EditingPartOptions, Language, ViewPart } from "./types";

export interface CutNoticeOptions extends EditingPartOptions {}

/** Mounts the cut notice on `el`. It follows the session's reading, its editability and its language. */
export function mountCutNotice(el: HTMLElement, session: EditingSession, options: CutNoticeOptions = {}): ViewPart {
  requireDom("mountCutNotice");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-notice");
  el.appendChild(root);
  const live = createLiveRegion(root);
  const refused = sayRefusals(live, session, options.onRefused);
  const notice = create(doc, "div", "sce-notice sce-cut-notice", root);
  notice.setAttribute("role", "note");
  const sentence = create(doc, "span", "sce-cut-sentence", notice);
  const actions = create(doc, "span", "sce-notice-actions", notice);
  const fill = create(doc, "button", "sce-button sce-cut-fill", actions);
  fill.type = "button";
  const remove = create(doc, "button", "sce-button sce-cut-delete", actions);
  remove.type = "button";

  let reading = session.reading;
  let language: Language | null = null;
  let editable = session.view.editable;
  function render(): void {
    reading = session.reading;
    language = session.view.language;
    editable = session.view.editable;
    root.lang = language;
    const t = messagesFor(language);
    const cut = reading.kind === "score" ? cutOf(reading.score) : null;
    notice.hidden = !cut;
    sentence.textContent = cut ? t.cutNotice(cut) : "";
    const repair = cut?.short === true && editable;
    actions.hidden = !repair;
    if (cut === null) return;
    fill.textContent = t.fillTruncatedBar;
    remove.textContent = t.deleteTruncatedBar;
    const fillWords = t.fillTruncatedBarTitle(cut.bar, cut.voice);
    const removeWords = t.deleteTruncatedBarTitle(cut.bar, cut.voice);
    fill.title = fillWords;
    fill.setAttribute("aria-description", fillWords);
    remove.title = removeWords;
    remove.setAttribute("aria-description", removeWords);
  }

  function run(command: "fillTruncatedBar" | "deleteTruncatedBar"): void {
    const cut = reading.kind === "score" ? cutOf(reading.score) : null;
    if (cut === null) return;
    const t = messagesFor(session.view.language);
    const result = session.dispatch({ type: command });
    if (!result.ok) {
      refused(result.diagnostics);
      return;
    }
    live.say(command === "fillTruncatedBar" ? t.cutFilled(cut.bar, cut.voice) : t.cutDeleted(cut.bar, cut.voice));
  }

  const abort = new AbortController();
  fill.addEventListener("click", () => run("fillTruncatedBar"), { signal: abort.signal });
  remove.addEventListener("click", () => run("deleteTruncatedBar"), { signal: abort.signal });

  render();
  const unsubscribe = session.subscribe(() => {
    if (session.reading !== reading || session.view.language !== language || session.view.editable !== editable)
      render();
  });
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

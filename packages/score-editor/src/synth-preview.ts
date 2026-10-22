// ABOUTME: The synth preview control, a view part: a play and stop button and the caption that says the sound is synthetic.
// ABOUTME: Not an editing control, so it is there in read-only mode too; it drives the session's preview player and holds no audio itself.
import { insertionPosition } from "./arrangement";
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import { lineIcon } from "./icons";
import { createLiveRegion } from "./live-region";
import { holdPreviewPlayer, type PreviewStart } from "./preview-player";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import { audioAvailable } from "./synth-engine";
import type { Language, ViewPart } from "./types";

/** A triangle pointing right: play. */
const PLAY = ["4.5,2.5 12.5,8 4.5,13.5 4.5,2.5"];

/** A square: stop. */
const STOP = ["3.5,3.5 12.5,3.5 12.5,12.5 3.5,12.5 3.5,3.5"];

/**
 * Mounts the synth preview control on `el`: one button that plays the session's score as a synthetic preview of melody
 * and chords, from the insertion point or the start, and stops it; and a caption saying the sound is not the finished
 * song. It is hidden while the session has no readable score, and it is there whether or not the session is editable.
 */
export function mountSynthPreview(el: HTMLElement, session: EditingSession): ViewPart {
  requireDom("mountSynthPreview");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-synth");
  el.appendChild(root);

  const group = create(doc, "div", "sce-synth", root);
  const button = create(doc, "button", "sce-button sce-synth-button", group);
  button.type = "button";
  const playIcon = button.appendChild(lineIcon(doc, PLAY));
  const stopIcon = button.appendChild(lineIcon(doc, STOP));
  const label = create(doc, "span", "sce-synth-label", button);
  const caption = create(doc, "span", "sce-synth-caption", group);
  const live = createLiveRegion(root);
  const hold = holdPreviewPlayer(session);
  const { player } = hold;

  let language: Language | null = null;
  let t = messagesFor(session.view.language);
  let drawn = "";
  let wasPlaying = false;

  function applyLanguage(): void {
    language = session.view.language;
    t = messagesFor(language);
    root.lang = language;
    caption.textContent = t.previewCaption;
    drawn = "";
  }

  function draw(): void {
    if (session.view.language !== language) applyLanguage();
    const readable = session.reading.kind === "score";
    const playing = player.playing;
    const available = audioAvailable();
    if (playing !== wasPlaying) {
      wasPlaying = playing;
      if (!playing) live.say(t.previewStopped);
    }
    const shown = [readable, playing, available].join();
    if (shown === drawn) return;
    drawn = shown;
    group.hidden = !readable;
    playIcon.toggleAttribute("hidden", playing);
    stopIcon.toggleAttribute("hidden", !playing);
    label.textContent = playing ? t.previewStop : t.previewPlay;
    button.setAttribute("aria-disabled", String(!available));
    button.title = available ? "" : t.previewUnsupported;
  }

  function say(result: PreviewStart): void {
    if (result === "started") {
      const from = player.from;
      const reading = session.reading;
      const position =
        from !== null && from > 0 && reading.kind === "score" ? insertionPosition(reading.score, from) : null;
      live.say(t.previewStarted(position));
      // In a toolbar that scrolls sideways the caption may be out of sight; while the sound plays it should not be.
      caption.scrollIntoView({ block: "nearest", inline: "nearest" });
    } else if (result === "nothing-to-play") live.say(t.previewNothing);
    else if (result === "unsupported") live.say(t.previewUnsupported);
    else if (result === "blocked") live.say(t.previewBlocked);
  }

  const abort = new AbortController();
  button.addEventListener(
    "click",
    () => {
      if (player.playing) player.stop();
      else if (audioAvailable()) void player.start().then(say);
      else say("unsupported");
    },
    { signal: abort.signal },
  );

  applyLanguage();
  draw();
  const unsubscribeSession = session.subscribe(draw);
  const unsubscribePlayer = player.subscribe(draw);
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribeSession();
      unsubscribePlayer();
      hold.release();
      root.remove();
      releaseStyles();
    },
  };
}

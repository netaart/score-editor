// ABOUTME: The toolbar's tempo field, key menu and transpose buttons: the commands that change the speed and the key of the whole song.
// ABOUTME: Each change is one command and one history step; a refusal is said as every refusal is, and the control goes back to the project's value.
import type { ScoreCommand } from "./commands";
import type { Diagnostic } from "./diagnostics";
import { create } from "./dom";
import { messagesFor } from "./i18n";
import type { LiveRegion } from "./live-region";
import { newsOf } from "./project-notices";
import type { EditingSession } from "./session";
import type { Language, ViewPart } from "./types";

export interface TempoKeyHooks {
  /** A command the user asked for was refused and nothing changed: say why, and tell whoever asked to hear of refusals. */
  refused(diagnostics: ReadonlyArray<Diagnostic>): void;
  /** The words a taken change is told in, for a screen reader. */
  live: LiveRegion;
  /** Shows what a taken command itself had to say, and gives back the sentence. */
  noticed(notices: ReadonlyArray<Diagnostic>): string;
}

/** Whether `field` has the focus: a value typed into it is the person's, and a redraw does not take it away. */
function hasFocus(field: HTMLElement): boolean {
  const scope = field.getRootNode();
  return (scope instanceof Document || scope instanceof ShadowRoot) && scope.activeElement === field;
}

/**
 * The tempo field, drawn into `parent`, which must sit in a `.sce-root`. It is there while the session is editable and
 * its score reads, and it shows the score's BPM. A value that is taken is one `setTempo`; the song-project rules decide
 * what happens to the style text, and this control only shows the result.
 */
export function mountTempoKeyControls(parent: HTMLElement, session: EditingSession, hooks: TempoKeyHooks): ViewPart {
  const doc = parent.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const group = create(doc, "div", "sce-song-controls", parent);
  group.setAttribute("role", "group");

  const tempoLabel = create(doc, "label", "sce-tempo", group);
  const tempo = create(doc, "input", "sce-field sce-tempo-input", tempoLabel);
  tempo.type = "number";
  tempo.inputMode = "numeric";
  tempo.step = "1";
  create(doc, "span", "sce-tempo-unit", tempoLabel).textContent = "BPM";

  /**
   * Dispatches one command. A refusal is said; a taken command is told in `done`, with what it had to say itself. The
   * controls go back to the project's values either way.
   */
  function run(command: ScoreCommand, done: () => string): void {
    const result = session.dispatch(command);
    draw(true);
    if (!result.ok) {
      hooks.refused(result.diagnostics);
      return;
    }
    const news = newsOf(session, result.diagnostics);
    const sentence = news.length > 0 ? hooks.noticed(news) : "";
    hooks.live.say(sentence === "" ? done() : `${done()} ${sentence}`);
  }

  tempo.addEventListener(
    "change",
    () => {
      const bpm = tempo.valueAsNumber;
      if (Number.isNaN(bpm)) {
        draw(true);
        return;
      }
      run({ type: "setTempo", bpm }, () => messagesFor(session.view.language).tempoSet(bpm));
    },
    { signal },
  );

  let language: Language | null = null;
  function applyLanguage(): void {
    language = session.view.language;
    const t = messagesFor(language);
    group.lang = language;
    group.setAttribute("aria-label", t.songControls);
    tempo.setAttribute("aria-label", t.tempo);
  }

  /** `force` puts the project's values back even into a field that has the focus. */
  function draw(force = false): void {
    if (session.view.language !== language) applyLanguage();
    const { reading, dialect } = session;
    const shown = session.view.editable && reading.kind === "score" && dialect !== undefined;
    group.hidden = !shown;
    if (!shown || dialect === undefined || reading.kind !== "score") return;
    const { tempo: range } = dialect.constraints;
    tempo.min = String(range.min);
    tempo.max = String(range.max);
    if (force || !hasFocus(tempo)) tempo.value = String(reading.score.tempo.bpm);
  }

  draw();
  const unsubscribe = session.subscribe(() => draw());
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribe();
      group.remove();
    },
  };
}

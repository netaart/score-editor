// ABOUTME: The toolbar's tempo field, key menu and transpose buttons: the commands that change the speed and the key of the whole song.
// ABOUTME: Each change is one command and one history step; a refusal is said as every refusal is, and the control goes back to the project's value.
import type { ScoreCommand } from "./commands";
import type { Diagnostic } from "./diagnostics";
import { create } from "./dom";
import { messagesFor } from "./i18n";
import { lineIcon } from "./icons";
import type { LiveRegion } from "./live-region";
import { newsOf } from "./project-notices";
import type { Score } from "./score";
import type { EditingSession } from "./session";
import type { Language, ViewPart } from "./types";

/** A chevron pointing up, and one pointing down: the song moves a semitone that way. */
const CHEVRON_UP = ["3.5,10 8,5.5 12.5,10"];
const CHEVRON_DOWN = ["3.5,6 8,10.5 12.5,6"];

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

/** The key in force at the start of the score: the last key stated at tick 0, as the marks row shows it. */
function startKeyOf(score: Score): string | undefined {
  let key = score.keys[0]?.key;
  for (const change of score.keys) if (change.at === 0) key = change.key;
  return key;
}

/**
 * The tempo field and the key menu, drawn into `parent`, which must sit in a `.sce-root`. It is there while the session is editable and
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

  const keyLabel = create(doc, "label", "sce-key", group);
  const keyName = create(doc, "span", "sce-key-label", keyLabel);
  const keys = create(doc, "select", "sce-field sce-key-select", keyLabel);
  const majorKeys = create(doc, "optgroup", "", keys);
  const minorKeys = create(doc, "optgroup", "", keys);
  const transposeButton = (direction: "down" | "up") => {
    const button = create(doc, "button", `sce-button sce-icon-button sce-transpose sce-transpose-${direction}`, group);
    button.type = "button";
    button.appendChild(lineIcon(doc, direction === "up" ? CHEVRON_UP : CHEVRON_DOWN));
    button.addEventListener(
      "click",
      () => {
        const semitones = direction === "up" ? 1 : -1;
        run({ type: "transpose", semitones }, () => messagesFor(session.view.language).transposed(semitones));
      },
      { signal },
    );
    return button;
  };
  const down = transposeButton("down");
  const up = transposeButton("up");
  /** The key the menu was last filled for, with the dialect's lists: it is filled again when either changes. */
  let filled: { lists: unknown; extra: string | undefined } | null = null;

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

  keys.addEventListener(
    "change",
    () => {
      const key = keys.value;
      run({ type: "setKey", key }, () => messagesFor(session.view.language).keySet(key));
    },
    { signal },
  );

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
    keyName.textContent = t.key;
    majorKeys.label = t.keyMajor;
    minorKeys.label = t.keyMinor;
    for (const [button, label] of [
      [down, t.transposeDown],
      [up, t.transposeUp],
    ] as const) {
      button.setAttribute("aria-label", label);
      button.title = label;
    }
  }

  /** The menu lists the dialect's keys; a key the score has that the list lacks is added, so the menu never says another. */
  function fillKeys(
    lists: { major: ReadonlyArray<string>; minor: ReadonlyArray<string> },
    current: string | undefined,
  ) {
    const extra = current !== undefined && ![...lists.major, ...lists.minor].includes(current) ? current : undefined;
    if (filled?.lists === lists && filled.extra === extra) return;
    filled = { lists, extra };
    const option = (key: string) => {
      const item = create(doc, "option", "");
      item.value = key;
      item.textContent = key;
      return item;
    };
    majorKeys.replaceChildren(...lists.major.map(option));
    minorKeys.replaceChildren(...lists.minor.map(option));
    keys.querySelector(":scope > option")?.remove();
    if (extra !== undefined) keys.prepend(option(extra));
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
    const current = startKeyOf(reading.score);
    fillKeys(dialect.constraints.keys, current);
    if (current !== undefined) keys.value = current;
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

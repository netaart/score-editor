// ABOUTME: The song project panel, a view part: the style text, the score mode, the seed and the lyrics as they are joined, with the notices the project carries.
// ABOUTME: A field is one command when it is let go; read-only it shows the values and edits nothing, and a field the host did not give says so.
import type { ScoreCommand } from "./commands";
import type { ProjectCommand } from "./commands-project";
import { formatDiagnostic } from "./diagnostics";
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import { createLiveRegion, type LiveRegion, sayRefusals } from "./live-region";
import { joinLyrics, LYRICS_MAX_CHARACTERS, lyricCharacterCount, lyricLinesOf } from "./lyrics";
import { carriedNotices } from "./project-notices";
import type { SongProject } from "./score";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { EditingPartOptions, Language, ViewPart } from "./types";

/** The panel as the toolbar's popover holds it: `commit` takes a value typed into a field that has not been let go. */
export interface ProjectPanel extends ViewPart {
  /** The element the popover moves the focus to when it opens. */
  readonly element: HTMLElement;
  commit(): void;
}

let panels = 0;

/** Whether `field` has the focus: a value typed into it is the person's, and a redraw does not take it away. */
function hasFocus(field: HTMLElement): boolean {
  const scope = field.getRootNode();
  return (scope instanceof Document || scope instanceof ShadowRoot) && scope.activeElement === field;
}

/** The mode the project holds, or null when the host gave none (a host that is not typed can leave it out). */
function modeOf(project: SongProject): "full" | "melody" | null {
  const mode: unknown = project.scoreMode;
  return mode === "full" || mode === "melody" ? mode : null;
}

/**
 * The panel itself, drawn into `parent`, which must sit in a `.sce-root`. The toolbar draws it into its Project popover
 * and lends it its own live region, so a toolbar speaks with one voice; `mountProjectPanel` is the same panel as a part of
 * its own.
 */
export function drawProjectPanel(
  parent: HTMLElement,
  session: EditingSession,
  live: LiveRegion,
  onRefused: EditingPartOptions["onRefused"],
): ProjectPanel {
  const doc = parent.ownerDocument;
  const abort = new AbortController();
  const { signal } = abort;
  const n = ++panels;
  const id = (name: string) => `sce-project-${n}-${name}`;

  const root = create(doc, "div", "sce-panel", parent);
  root.setAttribute("role", "region");
  root.tabIndex = -1;
  const notices = create(doc, "div", "sce-panel-notices", root);

  const row = (name: string, tag: "section" | "fieldset" = "section") => {
    const element = create(doc, tag, "sce-panel-field", root);
    element.dataset.field = name;
    return element;
  };
  /** The sentence under a field: what it does, or that it is not set. */
  const hintIn = (field: HTMLElement) => {
    const hint = create(doc, "p", "sce-panel-hint", field);
    hint.id = id(`${field.dataset.field}-hint`);
    return hint;
  };
  /** The value of a field while the session cannot edit: text, not a control. */
  const valueIn = (field: HTMLElement) => create(doc, "p", "sce-panel-value", field);

  const styleRow = row("style");
  const styleLabel = create(doc, "label", "sce-panel-label", styleRow);
  const styleBox = create(doc, "textarea", "sce-field sce-panel-style", styleRow);
  styleBox.id = id("style");
  styleBox.rows = 3;
  styleLabel.htmlFor = styleBox.id;
  const styleValue = valueIn(styleRow);
  const styleHint = hintIn(styleRow);
  styleBox.setAttribute("aria-describedby", styleHint.id);

  const modeRow = row("mode", "fieldset");
  const modeLabel = create(doc, "legend", "sce-panel-label", modeRow);
  const choices = create(doc, "div", "sce-panel-choices", modeRow);
  const radios = new Map<"full" | "melody", { input: HTMLInputElement; name: HTMLElement; hint: HTMLElement }>();
  for (const mode of ["full", "melody"] as const) {
    const choice = create(doc, "label", "sce-panel-choice", choices);
    const input = create(doc, "input", "sce-panel-radio", choice);
    input.type = "radio";
    input.name = id("mode");
    input.value = mode;
    const words = create(doc, "span", "sce-panel-choice-words", choice);
    const name = create(doc, "span", "sce-panel-choice-name", words);
    const hint = create(doc, "span", "sce-panel-hint", words);
    name.id = id(`${mode}-name`);
    hint.id = id(`${mode}-hint`);
    input.setAttribute("aria-labelledby", name.id);
    input.setAttribute("aria-describedby", hint.id);
    radios.set(mode, { input, name, hint });
  }
  const modeValue = valueIn(modeRow);
  const modeHint = hintIn(modeRow);

  const seedRow = row("seed");
  const seedLabel = create(doc, "label", "sce-panel-label", seedRow);
  const seedLine = create(doc, "div", "sce-panel-seed", seedRow);
  const seedField = create(doc, "input", "sce-field sce-panel-seed-input", seedLine);
  seedField.id = id("seed");
  seedField.type = "number";
  seedField.inputMode = "numeric";
  seedField.step = "1";
  seedLabel.htmlFor = seedField.id;
  const seedClear = create(doc, "button", "sce-button sce-panel-seed-clear", seedLine);
  seedClear.type = "button";
  const seedValue = valueIn(seedRow);
  const seedHint = hintIn(seedRow);
  seedField.setAttribute("aria-describedby", seedHint.id);

  const lyricsRow = row("lyrics");
  const lyricsHead = create(doc, "div", "sce-panel-lyrics-head", lyricsRow);
  const lyricsLabel = create(doc, "span", "sce-panel-label", lyricsHead);
  lyricsLabel.id = id("lyrics-label");
  const lyricsCount = create(doc, "span", "sce-panel-count", lyricsHead);
  const lyricsText = create(doc, "div", "sce-panel-lyrics", lyricsRow);
  lyricsText.setAttribute("role", "region");
  lyricsText.setAttribute("aria-labelledby", lyricsLabel.id);
  lyricsText.tabIndex = 0;
  const lyricsHint = hintIn(lyricsRow);

  let language: Language | null = null;
  let t = messagesFor(session.view.language);
  /** What the last draw showed, so a change of zoom or scroll, which this part does not draw, costs nothing here. */
  let shown: { project: SongProject; reading: unknown; editable: boolean } | null = null;

  const refused = sayRefusals(live, session, onRefused);

  /** Dispatches one command. A refusal is said; a taken command is told in `done`. The fields go back to the project's values. */
  function run(command: ScoreCommand | ProjectCommand, done: () => string): void {
    const result = session.dispatch(command);
    draw(true);
    if (result.ok) live.say(done());
    else refused(result.diagnostics);
  }

  function commitStyle(): void {
    if (styleBox.value !== session.project.style) {
      run({ type: "setStyle", style: styleBox.value }, () => t.projectStyleSaid);
    }
  }
  /** The seed the field holds: null when it is empty, NaN when it holds what is not a number (the command refuses that). */
  function seedTyped(): number | null {
    if (seedField.validity.badInput) return Number.NaN;
    return seedField.value.trim() === "" ? null : seedField.valueAsNumber;
  }
  function commitSeed(): void {
    const seed = seedTyped();
    if (Object.is(seed, session.project.seed)) return;
    run({ type: "setSeed", seed }, () => (seed === null ? t.projectSeedClearedSaid : t.projectSeedSaid(seed)));
  }

  styleBox.addEventListener("change", commitStyle, { signal });
  seedField.addEventListener("change", commitSeed, { signal });
  seedClear.addEventListener("click", () => run({ type: "setSeed", seed: null }, () => t.projectSeedClearedSaid), {
    signal,
  });
  for (const [mode, { input }] of radios) {
    input.addEventListener(
      "change",
      () => {
        if (input.checked) run({ type: "setScoreMode", scoreMode: mode }, () => t.projectModeSaid(mode));
      },
      { signal },
    );
  }

  function applyLanguage(): void {
    language = session.view.language;
    t = messagesFor(language);
    root.lang = language;
    root.setAttribute("aria-label", t.projectName);
    styleLabel.textContent = t.projectStyle;
    modeLabel.textContent = t.projectMode;
    for (const [mode, { name, hint }] of radios) {
      name.textContent = mode === "full" ? t.projectModeFull : t.projectModeMelody;
      hint.textContent = mode === "full" ? t.projectModeFullHint : t.projectModeMelodyHint;
    }
    seedLabel.textContent = t.projectSeed;
    seedClear.textContent = t.projectSeedClear;
    seedClear.setAttribute("aria-label", t.projectSeedClearName);
    lyricsLabel.textContent = t.projectLyrics;
    lyricsHint.textContent = t.projectLyricsHint;
    shown = null;
  }

  /** The notices the project carries, each a sentence; a melody project with chords also gets its two fixes. */
  function drawNotices(editable: boolean): void {
    notices.replaceChildren();
    for (const notice of carriedNotices(session)) {
      const item = create(doc, "div", "sce-panel-notice", notices);
      item.setAttribute("role", "note");
      create(doc, "p", "sce-panel-notice-text", item).textContent = formatDiagnostic(notice, session.view.language);
      if (notice.code !== "melody-with-chords" || !editable) continue;
      const actions = create(doc, "div", "sce-panel-notice-actions", item);
      const fixes: ReadonlyArray<readonly [string, ScoreCommand | ProjectCommand, () => string]> = [
        [t.projectRemoveChords, { type: "removeChords" }, () => t.projectChordsRemovedSaid],
        [t.projectSwitchToFull, { type: "setScoreMode", scoreMode: "full" }, () => t.projectModeSaid("full")],
      ];
      for (const [label, command, done] of fixes) {
        const button = create(doc, "button", "sce-button sce-panel-fix", actions);
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => run(command, done), { signal });
      }
    }
  }

  /** `force` puts the project's values back even into a field that has the focus. */
  function draw(force = false): void {
    if (session.view.language !== language) applyLanguage();
    const { project, reading } = session;
    const editable = session.view.editable && session.dialect !== undefined;
    if (!force && shown?.project === project && shown.reading === reading && shown.editable === editable) return;
    shown = { project, reading, editable };

    drawNotices(editable);

    styleBox.hidden = !editable;
    styleValue.hidden = editable || project.style === "";
    styleValue.textContent = project.style;
    styleHint.hidden = !editable && project.style !== "";
    styleHint.textContent =
      project.style !== "" ? t.projectStyleHint : editable ? t.projectStyleEmpty : t.projectNotSet;
    if (force || !hasFocus(styleBox)) styleBox.value = project.style;

    const mode = modeOf(project);
    choices.hidden = !editable;
    modeValue.hidden = editable || mode === null;
    modeValue.textContent = mode === "full" ? t.projectModeFull : mode === "melody" ? t.projectModeMelody : "";
    modeHint.hidden = mode !== null;
    modeHint.textContent = editable ? t.projectModeEmpty : t.projectNotSet;
    for (const [value, { input }] of radios) input.checked = mode === value;

    seedLine.hidden = !editable;
    seedValue.hidden = editable || project.seed === null;
    seedValue.textContent = project.seed === null ? "" : String(project.seed);
    seedHint.hidden = !editable && project.seed !== null;
    seedHint.textContent = project.seed !== null ? t.projectSeedHint : editable ? t.projectSeedEmpty : t.projectNotSet;
    if (force || !hasFocus(seedField)) seedField.value = project.seed === null ? "" : String(project.seed);

    if (reading.kind === "score") {
      const text = joinLyrics(reading.score, lyricLinesOf(project, reading.score));
      lyricsText.textContent = text === "" ? t.projectLyricsEmpty : text;
      lyricsText.dataset.empty = String(text === "");
      lyricsCount.textContent = t.projectLyricsCount(
        lyricCharacterCount(text).toLocaleString(session.view.language),
        LYRICS_MAX_CHARACTERS.toLocaleString(session.view.language),
      );
      lyricsCount.dataset.over = String(lyricCharacterCount(text) > LYRICS_MAX_CHARACTERS);
      lyricsCount.hidden = false;
    } else {
      lyricsText.textContent = t.projectLyricsUnreadable;
      lyricsText.dataset.empty = "true";
      lyricsCount.hidden = true;
    }
  }

  draw();
  const unsubscribe = session.subscribe(() => draw());
  let destroyed = false;
  return {
    element: root,
    commit() {
      commitStyle();
      commitSeed();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      unsubscribe();
      root.remove();
    },
  };
}

/**
 * Mounts the song project panel on `el`: the style text, the score mode, the seed, the lyrics as they are joined for the
 * next generation with their count, and the notices the project carries. A field is handed over as one command when it
 * is let go, so each is one step of the history. While the session is read-only the panel shows the values and edits
 * nothing. It follows the session's language.
 */
export function mountProjectPanel(
  el: HTMLElement,
  session: EditingSession,
  options: EditingPartOptions = {},
): ViewPart {
  requireDom("mountProjectPanel");
  const doc = el.ownerDocument;
  const releaseStyles = acquireStyles(el);
  const root = create(doc, "div", "sce-root sce-part sce-part-project");
  el.appendChild(root);
  const live = createLiveRegion(root);
  const panel = drawProjectPanel(root, session, live, options.onRefused);
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      panel.destroy();
      root.remove();
      releaseStyles();
    },
  };
}

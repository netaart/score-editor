// ABOUTME: The text view part: the score text in a box the user edits, checked as it is typed, handed to the project when it reads.
// ABOUTME: Text that cannot be read stays in the box with its problems listed, and the project keeps the last score that could.
import { type Diagnostic, formatDiagnostic } from "./diagnostics";
import { create, requireDom } from "./dom";
import { messagesFor } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

/**
 * How long the box must stay untouched before what it holds is checked and, when it reads, handed to the project. A
 * burst of typing is one step of the history; a user who stops to think for a moment starts the next.
 */
const TEXT_PAUSE_MS = 600;

/** The most problems listed; a text that fails everywhere should not fill the screen with it. */
const MAX_LISTED_PROBLEMS = 20;

let instanceCount = 0;

/** Where line `line` (1-based) starts and ends in `text`, for selecting it. */
function lineSpan(text: string, line: number): { start: number; end: number } {
  let start = 0;
  for (let seen = 1; seen < line; seen++) {
    const next = text.indexOf("\n", start);
    if (next < 0) return { start: text.length, end: text.length };
    start = next + 1;
  }
  const end = text.indexOf("\n", start);
  return { start, end: end < 0 ? text.length : end };
}

/**
 * Mounts the text view on `el`: the score text in a box with a number for each line, and under it a sentence that says
 * whether the text has problems, and the problems themselves. A pause in typing, or leaving the box, checks the text; text
 * that reads replaces the project's score as one step, and text that does not is kept in the box and told to the session
 * (`setRejectedText`) while the project keeps the last score that read. The box is read-only while the session is.
 */
export function mountTextView(el: HTMLElement, session: EditingSession): ViewPart {
  requireDom("mountTextView");
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;
  const releaseStyles = acquireStyles(el);
  const n = ++instanceCount;

  const root = create(doc, "div", "sce-root sce-part sce-part-text");
  el.appendChild(root);
  const panel = create(doc, "div", "sce-text", root);
  const frame = create(doc, "div", "sce-text-frame", panel);
  const gutter = create(doc, "div", "sce-gutter", frame);
  gutter.setAttribute("aria-hidden", "true");
  const box = create(doc, "textarea", "sce-text-box", frame);
  box.setAttribute("wrap", "off");
  box.setAttribute("spellcheck", "false");
  box.setAttribute("autocapitalize", "off");
  box.setAttribute("autocomplete", "off");
  box.setAttribute("autocorrect", "off");
  box.dir = "ltr";
  const status = create(doc, "p", "sce-text-status", panel);
  status.id = `sce-text-status-${n}`;
  status.setAttribute("role", "status");
  const list = create(doc, "ul", "sce-text-problems", panel);
  list.setAttribute("role", "list");
  list.id = `sce-text-problems-${n}`;

  let destroyed = false;
  let timer: number | null = null;
  /** True while this part's own dispatch is announced, so the project change it makes is not mistaken for another's. */
  let committing = false;
  let knownScore = session.project.score;
  let drawnLines = 0;
  let drawnMarks = "";
  let drawnProblems = "";

  function stopTimer(): void {
    if (timer === null) return;
    win.clearTimeout(timer);
    timer = null;
  }

  /** The problems of the text the box holds: those it was refused with, else those of the project's own unreadable score. */
  function problems(): ReadonlyArray<Diagnostic> {
    const rejected = session.rejectedText;
    if (rejected !== null) return rejected.diagnostics;
    const { reading } = session;
    return reading.kind === "unreadable" ? reading.diagnostics : [];
  }

  function drawGutter(found: ReadonlyArray<Diagnostic>): void {
    const lines = box.value.split("\n").length;
    const marked = new Set<number>();
    for (const diagnostic of found) if (diagnostic.at.line !== undefined) marked.add(diagnostic.at.line);
    const marks = [...marked].sort((a, b) => a - b).join(",");
    if (lines === drawnLines && marks === drawnMarks) return;
    drawnLines = lines;
    drawnMarks = marks;
    const numbers = doc.createDocumentFragment();
    for (let line = 1; line <= lines; line++) {
      const number = create(doc, "span", "sce-gutter-line");
      number.textContent = String(line);
      if (marked.has(line)) number.dataset.problem = "true";
      numbers.appendChild(number);
    }
    gutter.replaceChildren(numbers);
    gutter.scrollTop = box.scrollTop;
  }

  function reveal(line: number): void {
    const { start, end } = lineSpan(box.value, line);
    box.focus();
    box.setSelectionRange(start, end);
    const height = gutter.firstElementChild?.getBoundingClientRect().height ?? 0;
    if (height > 0) box.scrollTop = Math.max(0, (line - 1) * height - box.clientHeight / 3);
  }

  function drawProblems(found: ReadonlyArray<Diagnostic>, language: Language): void {
    const sentences = found.slice(0, MAX_LISTED_PROBLEMS).map((diagnostic) => formatDiagnostic(diagnostic, language));
    const t = messagesFor(language);
    const more = found.length - sentences.length;
    const signature = JSON.stringify([language, sentences, more, found.map((diagnostic) => diagnostic.at.line ?? 0)]);
    if (signature === drawnProblems) return;
    drawnProblems = signature;
    list.replaceChildren();
    for (const [at, sentence] of sentences.entries()) {
      const item = create(doc, "li", "sce-text-problem-item", list);
      const button = create(doc, "button", "sce-text-problem", item);
      button.type = "button";
      button.textContent = sentence;
      const line = found[at]?.at.line;
      if (line !== undefined) button.addEventListener("click", () => reveal(line));
    }
    if (more > 0) create(doc, "li", "sce-text-more", list).textContent = t.moreProblems(more);
    list.hidden = found.length === 0;
  }

  function render(): void {
    const { language, editable } = session.view;
    const t = messagesFor(language);
    const { reading } = session;
    root.lang = language;
    box.setAttribute("aria-label", t.scoreText);
    list.setAttribute("aria-label", t.problems);
    box.readOnly = !editable || reading.kind === "no-dialect";
    if (box.readOnly) {
      // Text the user typed and that was not handed over is given up, since nothing may be handed over now.
      stopTimer();
      if (box.value !== session.project.score) setText(session.project.score);
      if (session.rejectedText !== null) session.setRejectedText(null);
    }
    const found = problems();
    const stale = session.rejectedText !== null;
    const sentence =
      reading.kind === "no-dialect"
        ? t.noDialect(reading.modelId)
        : found.length === 0
          ? t.noProblems
          : t.problemCount(found.length, stale);
    if (status.textContent !== sentence) status.textContent = sentence;
    panel.toggleAttribute("data-problems", found.length > 0);
    if (found.length > 0) box.setAttribute("aria-invalid", "true");
    else box.removeAttribute("aria-invalid");
    box.setAttribute("aria-describedby", found.length > 0 ? `${status.id} ${list.id}` : status.id);
    drawGutter(found);
    drawProblems(found, language);
  }

  function setText(text: string): void {
    box.value = text;
    drawGutter(problems());
  }

  /** Checks what the box holds and hands it over: to the project when it reads, to the session as rejected when it does not. */
  function settle(): void {
    stopTimer();
    if (destroyed || box.readOnly) return;
    const text = box.value;
    if (text === session.project.score) {
      session.setRejectedText(null);
      return;
    }
    const diagnostics = session.checkScoreText(text);
    if (diagnostics.length > 0) {
      session.setRejectedText({ text, diagnostics });
      return;
    }
    committing = true;
    let result: ReturnType<EditingSession["dispatch"]>;
    try {
      result = session.dispatch({ type: "replaceScoreText", text });
    } finally {
      committing = false;
    }
    session.setRejectedText(result.ok ? null : { text, diagnostics: result.diagnostics });
  }

  box.addEventListener("input", () => {
    if (destroyed) return;
    drawGutter(problems());
    stopTimer();
    timer = win.setTimeout(settle, TEXT_PAUSE_MS);
  });
  box.addEventListener("blur", () => {
    if (destroyed) return;
    settle();
    // What was handed over is stored as the dialect writes it, which may differ from what was typed; show that now.
    if (session.rejectedText === null && box.value !== session.project.score && !box.readOnly) {
      setText(session.project.score);
    }
  });
  box.addEventListener(
    "scroll",
    () => {
      gutter.scrollTop = box.scrollTop;
    },
    { passive: true },
  );

  setText(session.project.score);
  render();
  const unsubscribe = session.subscribe(() => {
    if (destroyed) return;
    const score = session.project.score;
    if (score !== knownScore) {
      knownScore = score;
      // The project moved under the box: an undo, a redo, new data. The box shows the project again.
      if (!committing) {
        stopTimer();
        setText(score);
      }
    }
    render();
  });

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopTimer();
      unsubscribe();
      root.remove();
      releaseStyles();
    },
  };
}

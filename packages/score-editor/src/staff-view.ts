// ABOUTME: The staff view part: the score drawn on a staff by abcjs, read-only, for those who check a score by reading it.
// ABOUTME: abcjs is loaded when the part is mounted, and draws inside a shadow root of its own, out of reach of the page's rules.
import { create, requireDom } from "./dom";
import { messagesFor, viewName } from "./i18n";
import type { EditingSession } from "./session";
import { acquireStyles } from "./styles";
import type { Language, ViewPart } from "./types";

type Abcjs = typeof import("abcjs");

/** The narrowest staff drawn; a box narrower than this scrolls sideways instead of squeezing the notes. */
const MIN_STAFF_WIDTH = 240;

/** What the drawing's own shadow root is styled with: it fills its box and takes the part's colour from outside. */
const DRAWING_CSS = ":host { display: block; } svg { display: block; }";

let loading: Promise<Abcjs> | null = null;

/**
 * Loads abcjs once for the page. It is a dynamic import so that importing the package, on a server or in a bundle
 * that never shows a staff, does not load it. A load that failed is tried again by the next staff view.
 */
function loadAbcjs(): Promise<Abcjs> {
  loading ??= import("abcjs").then(
    // abcjs is a CommonJS module: a bundler may hand over its functions as the namespace or under `default`.
    (loaded) => (loaded as { default?: Abcjs }).default ?? loaded,
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** A shadow root's style sheet, as the stylesheet object model makes it, which a strict style policy does not govern. */
function styleDrawing(doc: Document, shadow: ShadowRoot): void {
  const view = doc.defaultView;
  if (view && typeof view.CSSStyleSheet?.prototype.replaceSync === "function") {
    const sheet = new view.CSSStyleSheet();
    sheet.replaceSync(DRAWING_CSS);
    shadow.adoptedStyleSheets = [sheet];
    return;
  }
  const style = doc.createElement("style");
  style.textContent = DRAWING_CSS;
  shadow.appendChild(style);
}

/**
 * Mounts the staff view on `el`: the project's score drawn on a staff by abcjs, as wide as the box it has and drawn again
 * when the box changes width. It is read-only. abcjs is loaded by this call, not by importing the package; until it has
 * arrived the part says it is loading, and if it cannot be loaded the part says so and the others go on working. The drawing
 * sits in a shadow root of its own, so rules of the host page for svg and text do not reach it, and it takes the colour of
 * the part's text. A score that cannot be read is not drawn.
 */
export function mountStaffView(el: HTMLElement, session: EditingSession): ViewPart {
  requireDom("mountStaffView");
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;
  const releaseStyles = acquireStyles(el);

  const root = create(doc, "div", "sce-root sce-part sce-part-staff");
  el.appendChild(root);
  const scroller = create(doc, "div", "sce-staff", root);
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "region");
  const message = create(doc, "p", "sce-staff-message", scroller);
  const holder = create(doc, "div", "sce-staff-drawing", scroller);
  holder.setAttribute("role", "img");
  const shadow = holder.attachShadow({ mode: "open" });
  styleDrawing(doc, shadow);
  const target = doc.createElement("div");
  shadow.appendChild(target);

  let abcjs: Abcjs | null = null;
  let failed = false;
  let destroyed = false;
  let frame: number | null = null;
  /** What the drawing shows now, so a change that does not alter it costs nothing. */
  let drawnText: string | null = null;
  let drawnWidth = 0;
  let language: Language | null = null;

  function say(words: string, role: "status" | "alert"): void {
    message.textContent = words;
    message.setAttribute("role", role);
    message.hidden = false;
  }

  function clear(): void {
    target.replaceChildren();
    drawnText = null;
    drawnWidth = 0;
  }

  function draw(): void {
    frame = null;
    if (destroyed) return;
    const t = messagesFor(session.view.language);
    if (language !== session.view.language) {
      language = session.view.language;
      root.lang = language;
      scroller.setAttribute("aria-label", viewName(t, "staff"));
      holder.setAttribute("aria-label", t.staffDrawing);
    }
    if (failed) {
      say(t.staffFailed, "alert");
      return;
    }
    if (abcjs === null) {
      say(t.staffLoading, "status");
      return;
    }
    message.hidden = true;
    if (session.reading.kind !== "score") {
      clear();
      return;
    }
    const width = Math.floor(holder.clientWidth);
    // A box that is not shown has no width: the drawing waits until it has one, and keeps what it drew before.
    if (width <= 0) return;
    const text = session.project.score;
    if (text === drawnText && width === drawnWidth) return;
    try {
      target.replaceChildren();
      abcjs.renderAbc(target, text, {
        staffwidth: Math.max(MIN_STAFF_WIDTH, width),
        paddingleft: 0,
        paddingright: 0,
        wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
        add_classes: true,
      });
      drawnText = text;
      drawnWidth = width;
    } catch {
      clear();
      failed = true;
      say(t.staffFailed, "alert");
    }
  }

  function schedule(): void {
    if (destroyed || frame !== null) return;
    frame = win.requestAnimationFrame(draw);
  }

  draw();
  loadAbcjs().then(
    (loaded) => {
      abcjs = loaded;
      schedule();
    },
    () => {
      failed = true;
      schedule();
    },
  );
  const observer = new win.ResizeObserver(schedule);
  observer.observe(scroller);
  let heard = session.project.score;
  let heardReading = session.reading;
  const unsubscribe = session.subscribe(() => {
    if (session.project.score === heard && session.reading === heardReading && session.view.language === language)
      return;
    heard = session.project.score;
    heardReading = session.reading;
    schedule();
  });

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) win.cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
      root.remove();
      releaseStyles();
    },
  };
}

// ABOUTME: Measures the chrome above the music and the DESIGN body floor for a part that opens a bottom sheet.
// ABOUTME: The sheet's cap is the window minus both, kept current while it is open and removed again when it closes.

/** The private variables a sheet reads: where the chrome ends, and how much music the body keeps. */
const CHROME = "--sce-_chrome-h";
const FLOOR = "--sce-_sheet-floor";

/**
 * Keeps `--sce-_chrome-h` and `--sce-_sheet-floor` on `sheet` current while it is open. The chrome is the nearest
 * `.sce-chrome` of `anchor`, or its toolbar in a host's own layout; the floor is DESIGN.md's `--sce-_floor`, read with a
 * hidden probe so a calc() resolves to pixels. The values are set when the sheet opens, so a closed part draws the same
 * markup a fresh one would, and removed when it closes. Everything is removed with `signal`.
 */
export function watchChromeFloor(anchor: HTMLElement, sheet: HTMLElement, signal: AbortSignal): void {
  const doc = anchor.ownerDocument;
  const view = doc.defaultView;
  const chrome = anchor.closest<HTMLElement>(".sce-chrome") ?? anchor.closest<HTMLElement>(".sce-toolbar");
  const root = anchor.closest<HTMLElement>(".sce-root") ?? anchor;
  let armed = false;

  function clear(): void {
    sheet.style.removeProperty(CHROME);
    sheet.style.removeProperty(FLOOR);
  }

  function sync(): void {
    if (!armed) return;
    const bottom = chrome?.getBoundingClientRect().bottom ?? 0;
    sheet.style.setProperty(CHROME, `${Math.max(0, bottom)}px`);
    const probe = doc.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:var(--sce-_floor, 190px);width:0";
    root.appendChild(probe);
    const floor = probe.getBoundingClientRect().height;
    probe.remove();
    if (floor > 0) sheet.style.setProperty(FLOOR, `${floor}px`);
  }

  sheet.addEventListener(
    "beforetoggle",
    (event) => {
      if ((event as ToggleEvent).newState !== "open") {
        armed = false;
        clear();
        return;
      }
      armed = true;
      sync();
    },
    { signal },
  );
  sheet.addEventListener(
    "toggle",
    (event) => {
      if ((event as ToggleEvent).newState === "open") {
        armed = true;
        sync();
      } else {
        armed = false;
        clear();
      }
    },
    { signal },
  );

  const Observer = view?.ResizeObserver;
  if (Observer && chrome) {
    const observer = new Observer(sync);
    observer.observe(chrome);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }
  view?.addEventListener("resize", sync, { signal });
}

// ABOUTME: Line icons for the toolbar's buttons: a 16 by 16 drawing built of polylines, styled by the stylesheet.
// ABOUTME: Shared by the toolbar and the controls it assembles, so every icon is drawn the same way.

const SVG = "http://www.w3.org/2000/svg";

/**
 * A 16 by 16 line drawing. It is built of polylines, since the reset that isolates the parts reverts every CSS
 * property, and a path's `d` is one, where `points` is not; the stylesheet gives the lines their stroke.
 */
export function lineIcon(doc: Document, polylines: ReadonlyArray<string>): SVGSVGElement {
  const icon = doc.createElementNS(SVG, "svg");
  icon.setAttribute("class", "sce-icon");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  for (const points of polylines) {
    const line = doc.createElementNS(SVG, "polyline");
    line.setAttribute("points", points);
    icon.appendChild(line);
  }
  return icon;
}

// ABOUTME: Test-side copies of the RULES.md T1/T2 text layer for the seam helpers.
// ABOUTME: They stay independent of the package source so the expected bytes are not normalized by the code under test.
const WHITESPACE = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x001c, 0x001d, 0x001e, 0x001f, 0x0020, 0x0085, 0x00a0, 0x1680, 0x2000,
  0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
  0x3000,
]);

const LINE_BREAKS = new Set([0x000a, 0x000b, 0x000c, 0x000d, 0x001c, 0x001d, 0x001e, 0x0085, 0x2028, 0x2029]);

export function normalizeLineBreaks(text: string): string {
  const pieces: string[] = [];
  let index = 0;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === 0x000d && text.charCodeAt(index + 1) === 0x000a) {
      pieces.push("\n");
      index += 2;
    } else if (LINE_BREAKS.has(code)) {
      pieces.push("\n");
      index += 1;
    } else {
      pieces.push(text[index] as string);
      index += 1;
    }
  }
  return pieces.join("");
}

export function stripTrailingWhitespace(text: string): string {
  let end = text.length;
  while (end > 0 && WHITESPACE.has(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

export function trimWhitespace(text: string): string {
  let start = 0;
  while (start < text.length && WHITESPACE.has(text.charCodeAt(start))) start += 1;
  return stripTrailingWhitespace(text.slice(start));
}

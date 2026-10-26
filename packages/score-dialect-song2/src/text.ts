// ABOUTME: The song2 text layer: the line breaks the reader splits on and the whitespace T2 strips.
// ABOUTME: The writer uses the same trailing rule, so a line it copies untouched keeps the bytes it read.

// RULES.md T2 lists these characters; they are all in the BMP, so a code unit is enough.
const WHITESPACE = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x001c, 0x001d, 0x001e, 0x001f, 0x0020, 0x0085, 0x00a0, 0x1680, 0x2000,
  0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
  0x3000,
]);

// RULES.md T1 lists these; a CRLF pair is handled before this set is consulted.
const LINE_BREAKS = new Set([0x000a, 0x000b, 0x000c, 0x000d, 0x001c, 0x001d, 0x001e, 0x0085, 0x2028, 0x2029]);

/** RULES.md T1: every line boundary becomes LF; a CRLF pair is one boundary. */
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

/** RULES.md T2: the characters the reader treats as whitespace. */
export function isWhitespace(char: string | undefined): boolean {
  return char !== undefined && WHITESPACE.has(char.charCodeAt(0));
}

/** RULES.md T2: strip whitespace at the end of a line, keeping every other byte. */
export function stripTrailingWhitespace(text: string): string {
  let end = text.length;
  while (end > 0 && WHITESPACE.has(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(0, end);
}

/** RULES.md T2: strip whitespace at both edges, as a measure body does under M2. */
export function trimWhitespace(text: string): string {
  let start = 0;
  while (start < text.length && WHITESPACE.has(text.charCodeAt(start))) start += 1;
  return stripTrailingWhitespace(text.slice(start));
}

// ABOUTME: Helpers for the seam 1 tests that edit song2 scores: reading, splitting a score text into the bytes of each bar, and tie chains.
// ABOUTME: The bar pieces follow the reader's own line stripping, so they are the bytes the reader saw.
import { song2Dialect } from "@neta-art/score-dialect-song2";
import type { Note, Score } from "@neta-art/score-editor";
import { expect } from "vitest";
import { normalizeLineBreaks, stripTrailingWhitespace, trimWhitespace } from "./song2-text";

export function parse(text: string): Score {
  const { score, diagnostics } = song2Dialect.parse(text);
  expect(diagnostics).toEqual([]);
  expect(score).not.toBeNull();
  if (score === null) throw new Error("the score did not read");
  return score;
}

function wholeRestCount(body: string): number {
  if (body === "Z") return 1;
  if (body.length === 2 && body[0] === "Z" && body[1] !== undefined && "234".includes(body[1])) {
    return Number(body[1]);
  }
  return 1;
}

/** Splits a score text into the raw piece of every bar, keyed by voice and 0-based bar number, plus every other line. */
export function splitBars(text: string): { pieces: Map<string, string>; otherLines: string[] } {
  const lines = normalizeLineBreaks(text)
    .split("\n")
    .map((line) => stripTrailingWhitespace(line));
  let bodyStart = lines.findIndex((line) => line.startsWith("K:"));
  bodyStart = bodyStart < 0 ? lines.length : bodyStart + 1;
  const pieces = new Map<string, string>();
  const otherLines = lines.slice(0, bodyStart);
  const nextBar = new Map<string, number>();
  let voice: string | null = null;

  for (const line of lines.slice(bodyStart)) {
    if (line === "V: Vocal" || line === "V: Ins") {
      voice = line.slice(3);
      otherLines.push(line);
      continue;
    }
    if (line === "" || line.startsWith("M:") || line.startsWith("K:") || line.startsWith("%")) {
      otherLines.push(line);
      continue;
    }
    if (voice === null) {
      otherLines.push(line);
      continue;
    }

    const closes = line.endsWith("|");
    const bodies = line.split("|");
    if (closes) bodies.pop();
    for (const raw of bodies) {
      const body = trimWhitespace(raw);
      const count = wholeRestCount(body);
      const first = nextBar.get(voice) ?? 0;
      for (let offset = 0; offset < count; offset += 1) {
        pieces.set(`${voice}:${first + offset}`, raw);
      }
      nextBar.set(voice, first + count);
    }
  }

  return { pieces, otherLines };
}

/** The whole tie chain around a note, worked from the reading result by the rule P9-P13 states. */
export function chainAround(score: Score, id: string): Note[] {
  const target = score.notes.find((note) => note.id === id);
  if (target === undefined) return [];
  const voiceNotes = score.notes.filter((note) => note.voice === target.voice).sort((a, b) => a.start - b.start);
  const index = voiceNotes.findIndex((note) => note.id === id);
  let first = index;
  while (first > 0 && (voiceNotes[first - 1] as Note).tie) first -= 1;
  let last = index;
  while (last < voiceNotes.length - 1 && (voiceNotes[last] as Note).tie) last += 1;
  return voiceNotes.slice(first, last + 1);
}

export function noteFacts(note: Note): [string, number, number, number | null, boolean] {
  return [note.voice, note.start, note.duration, note.midi, note.tie];
}

export function pitched(score: Score, voice: string): Note[] {
  return score.notes.filter((note) => note.voice === voice && note.midi !== null).sort((a, b) => a.start - b.start);
}
/** First, middle and last pitched note of each voice, and one segment of a tie chain. */
export function spread(score: Score): string[] {
  const chosen = new Set<string>();
  for (const voice of score.voices) {
    const notes = pitched(score, voice);
    if (notes.length === 0) continue;
    for (const note of [notes[0], notes[Math.floor(notes.length / 2)], notes[notes.length - 1]]) {
      if (note !== undefined) chosen.add(note.id);
    }
  }
  for (const note of score.notes) {
    if (note.midi !== null && note.tie) {
      chosen.add(chainAround(score, note.id).at(-1)?.id ?? note.id);
      break;
    }
  }
  return [...chosen];
}

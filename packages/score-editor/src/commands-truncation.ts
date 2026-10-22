// ABOUTME: The two commands that repair a cut score: fill every short voice with rests, or delete the incomplete measure.
// ABOUTME: Both end with no cut; delete refuses when the incomplete measure is one another voice still uses.
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import { orderNotes, scoreUnit, sectionsFrom, splitLength } from "./commands-shared";
import { type Chord, type Note, noteId, type Score } from "./score";
import type { DialectConstraints } from "./types";

function coverageEnd(score: Score, voice: string): number {
  let end = 0;
  for (const note of score.notes) {
    if (note.voice === voice && note.bar + 1 > end) end = note.bar + 1;
  }
  return end;
}

function allowsChords(constraints: DialectConstraints, voice: string): boolean {
  return constraints.voices.find((candidate) => candidate.name === voice)?.allowsChords ?? false;
}

function clearTiesIntoRests(notes: ReadonlyArray<Note>): Note[] {
  const byVoice = new Map<string, Note[]>();
  for (const note of notes) {
    const list = byVoice.get(note.voice) ?? [];
    list.push(note);
    byVoice.set(note.voice, list);
  }
  const cleared = new Set<string>();
  for (const list of byVoice.values()) {
    list.sort((left, right) => left.start - right.start);
    for (let index = 0; index + 1 < list.length; index += 1) {
      const note = list[index] as Note;
      if (note.tie && (list[index + 1] as Note).midi === null) cleared.add(note.id);
    }
  }
  return notes.map((note) => (cleared.has(note.id) ? { ...note, tie: false } : note));
}

function fillTruncatedBar(score: Score, constraints: DialectConstraints): ScoreCommandResult {
  if (score.truncation === null) return commandRefusal("no-truncation", {});
  if (!score.truncation.short) return commandRefusal("no-incomplete-bar", {});
  const cut = score.truncation;
  const bar = score.bars[cut.bar];
  if (bar === undefined) return commandRefusal("no-incomplete-bar", {});
  const unit = scoreUnit(score, [bar.length]);
  const notes = [...score.notes];

  for (const voice of score.voices) {
    const end = coverageEnd(score, voice);
    if (voice !== cut.voice && end >= score.bars.length) continue;
    const first = voice === cut.voice ? cut.bar : end;
    for (let index = first; index < score.bars.length; index += 1) {
      const target = score.bars[index];
      if (target === undefined) continue;
      const voiceNotes = notes
        .filter((note) => note.voice === voice && note.bar === index)
        .sort((left, right) => left.start - right.start);
      let at = target.start;
      for (const note of voiceNotes) at = Math.max(at, note.start + note.duration);
      for (const duration of splitLength(target.start + target.length - at, unit, constraints.durations)) {
        notes.push({ id: noteId(voice, at), voice, bar: index, start: at, duration, midi: null, tie: false });
        at += duration;
      }
    }
  }

  const bars = score.bars.map((item) => (item.incomplete ? { ...item, incomplete: false } : item));
  const nextScore: Score = {
    ...score,
    bars,
    notes: orderNotes(score, clearTiesIntoRests(notes)),
    hasChords: score.chords.length > 0,
    truncation: null,
  };
  return { ok: true, score: nextScore };
}

function deleteTruncatedBar(score: Score, constraints: DialectConstraints): ScoreCommandResult {
  if (score.truncation === null) return commandRefusal("no-truncation", {});
  if (!score.truncation.short) return commandRefusal("no-incomplete-bar", {});
  const cut = score.truncation;
  const bar = score.bars[cut.bar];
  if (bar === undefined) return commandRefusal("no-incomplete-bar", {});
  const otherMaterial = score.notes.some((note) => note.voice !== cut.voice && note.bar === cut.bar);
  if (otherMaterial || cut.bar !== score.bars.length - 1) {
    return commandRefusal("cut-in-complete-bar", { bar: cut.bar + 1 }, { bar: cut.bar + 1 });
  }

  const removed = new Set(score.notes.filter((note) => note.bar === cut.bar).map((note) => note.id));
  const notes = score.notes.filter((note) => !removed.has(note.id));
  const byVoice = new Map<string, Note[]>();
  for (const note of notes) {
    const list = byVoice.get(note.voice) ?? [];
    list.push(note);
    byVoice.set(note.voice, list);
  }
  const cutTies = new Set<string>();
  for (const list of byVoice.values()) {
    list.sort((left, right) => left.start - right.start);
    for (let index = 0; index < list.length; index += 1) {
      const note = list[index] as Note;
      if (!note.tie) continue;
      const next = list[index + 1];
      if (next === undefined || next.start !== note.start + note.duration) cutTies.add(note.id);
    }
  }
  const finalNotes = notes.map((note) => (cutTies.has(note.id) ? { ...note, tie: false } : note));

  const chords: Chord[] = allowsChords(constraints, cut.voice)
    ? score.chords.filter((chord) => !(chord.start >= bar.start && chord.start < bar.start + bar.length))
    : [...score.chords];
  const bars = score.bars.filter((_item, index) => index !== cut.bar);
  if (bars.length === 0) return commandRefusal("last-bar", { bar: cut.bar + 1 }, { bar: cut.bar + 1 });
  const keys = score.keys.filter((change, index) => index === 0 || change.at < bar.start);
  const markers = score.sections
    .filter((section) => section.firstBar !== cut.bar)
    .map((section) => ({
      name: section.name,
      firstBar: section.firstBar > cut.bar ? section.firstBar - 1 : section.firstBar,
    }));

  const nextScore: Score = {
    ...score,
    bars: bars.map((item, index) => ({ ...item, index })),
    notes: orderNotes(score, finalNotes),
    chords,
    keys,
    hasChords: chords.length > 0,
    sections: sectionsFrom({ ...score, bars }, markers),
    truncation: null,
  };
  return { ok: true, score: nextScore };
}

/** Applies the two truncation repairs. Both leave the score with no cut. */
export function runTruncationCommand(
  score: Score,
  command: { readonly type: "fillTruncatedBar" } | { readonly type: "deleteTruncatedBar" },
  constraints: DialectConstraints,
): ScoreCommandResult {
  switch (command.type) {
    case "fillTruncatedBar":
      return fillTruncatedBar(score, constraints);
    case "deleteTruncatedBar":
      return deleteTruncatedBar(score, constraints);
  }
}

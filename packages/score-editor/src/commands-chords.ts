// ABOUTME: The set-chord command. It changes the chord on one note in a voice that allows chords and checks the constraints.
// ABOUTME: A note id names the note or rest; an empty name removes its chord, and every other chord stays untouched.

import { splitChordName } from "./chord-vocabulary";
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import { withoutChordMaterial } from "./commands-shared";
import type { Score } from "./score";
import type { DialectConstraints } from "./types";

function voiceAllowsChords(constraints: DialectConstraints, voice: string): boolean {
  return constraints.voices.find((candidate) => candidate.name === voice)?.allowsChords ?? false;
}

/** Sets one chord on a note or rest in a voice that allows chords, or removes it when `name` is empty. */
export function setChord(
  score: Score,
  noteId: string,
  name: string,
  constraints: DialectConstraints,
): ScoreCommandResult {
  const target = score.notes.find((note) => note.id === noteId);
  if (target === undefined) return commandRefusal("note-not-found", { noteId }, { noteId });

  const at = { voice: target.voice, bar: target.bar + 1, noteId };
  const targetChords = score.chords.filter((chord) => chord.noteId === target.id);
  if (name === "") {
    if (targetChords.length === 0) return { ok: true, score };
    const chords = score.chords.filter((chord) => !targetChords.includes(chord));
    return { ok: true, score: { ...score, ...withoutChordMaterial(score, chords) } };
  }

  if (!voiceAllowsChords(constraints, target.voice)) {
    return commandRefusal("chord-voice", { voice: target.voice, noteId }, at);
  }
  if (splitChordName(name, constraints.chords) === null) {
    return commandRefusal("chord-vocabulary", { name, noteId }, at);
  }

  const chords = score.chords.filter((chord) => !targetChords.includes(chord));
  const next = chords.findIndex((chord) => chord.start > target.start);
  chords.splice(next < 0 ? chords.length : next, 0, { name, start: target.start, noteId: target.id });
  return { ok: true, score: { ...score, chords, hasChords: true } };
}

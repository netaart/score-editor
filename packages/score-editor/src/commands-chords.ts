// ABOUTME: The set-chord command. It changes the chord on one note in a voice that allows chords and checks the constraints.
// ABOUTME: A note id names the note or rest; an empty name removes its chord, and every other chord stays untouched.
import { commandRefusal } from "./command-refusal";
import type { ScoreCommandResult } from "./commands";
import { hasChordsAfter, withoutUnfinishedChord } from "./commands-shared";
import type { Score } from "./score";
import type { ChordVocabulary, DialectConstraints } from "./types";

function isRoot(text: string, roots: ReadonlyArray<string>): boolean {
  return roots.includes(text);
}

/** True when `text` is exactly one root from the vocabulary followed by one of its qualities. */
function isRootAndQuality(text: string, chords: ChordVocabulary): boolean {
  return chords.roots.some((root) => text.startsWith(root) && chords.qualities.includes(text.slice(root.length)));
}

/** True when `name` is a root plus quality and, when the vocabulary allows one, an optional slash bass. */
function isChordInVocabulary(name: string, chords: ChordVocabulary): boolean {
  if (name === "") return false;
  const slash = name.indexOf("/");
  if (slash < 0) return isRootAndQuality(name, chords);
  if (!chords.slashBass || name.indexOf("/", slash + 1) >= 0) return false;
  const chord = name.slice(0, slash);
  const bass = name.slice(slash + 1);
  return chord.length > 0 && bass.length > 0 && isRootAndQuality(chord, chords) && isRoot(bass, chords.roots);
}

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
    const truncation = chords.length === 0 ? withoutUnfinishedChord(score.truncation) : score.truncation;
    return { ok: true, score: { ...score, chords, truncation, hasChords: hasChordsAfter(chords, truncation) } };
  }

  if (!voiceAllowsChords(constraints, target.voice)) {
    return commandRefusal("chord-voice", { voice: target.voice, noteId }, at);
  }
  if (!isChordInVocabulary(name, constraints.chords)) {
    return commandRefusal("chord-vocabulary", { name, noteId }, at);
  }

  const chords = score.chords.filter((chord) => !targetChords.includes(chord));
  const next = chords.findIndex((chord) => chord.start > target.start);
  chords.splice(next < 0 ? chords.length : next, 0, { name, start: target.start, noteId: target.id });
  return { ok: true, score: { ...score, chords, hasChords: true } };
}

// ABOUTME: The set-chord command. It changes the chord on one Vocal note or rest and validates the dialect's constraints.
// ABOUTME: A note id names the note or rest; an empty name removes its chord, and every other chord stays untouched.
import type { ScoreCommandResult } from "./commands";
import type { CommandDiagnosticCode, DiagnosticAt, DiagnosticParams } from "./diagnostics";
import type { Score } from "./score";
import type { ChordVocabulary, DialectConstraints } from "./types";

function failure(code: CommandDiagnosticCode, params: DiagnosticParams, at: DiagnosticAt): ScoreCommandResult {
  return { ok: false, diagnostic: { code, params, at } };
}

function isRoot(text: string, roots: ReadonlyArray<string>): boolean {
  return roots.includes(text);
}

/** True when `text` is exactly one root from the vocabulary followed by one of its qualities. */
function isRootAndQuality(text: string, chords: ChordVocabulary): boolean {
  return chords.roots.some((root) => text.startsWith(root) && chords.qualities.includes(text.slice(root.length)));
}

/** True when `name` is a root plus quality and, when the vocabulary allows one, an optional slash bass. */
export function isChordInVocabulary(name: string, chords: ChordVocabulary): boolean {
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

/** Sets one chord on a Vocal note or rest, or removes it when `name` is empty. */
export function setChord(
  score: Score,
  noteId: string,
  name: string,
  constraints: DialectConstraints,
): ScoreCommandResult {
  const target = score.notes.find((note) => note.id === noteId);
  if (target === undefined) return failure("note-not-found", { noteId }, { noteId });

  const at: DiagnosticAt = { voice: target.voice, bar: target.bar + 1, noteId };
  if (name === "") {
    const chords = score.chords.filter((chord) => chord.noteId !== target.id);
    if (chords.length === score.chords.length) return { ok: true, score };
    return { ok: true, score: { ...score, chords, hasChords: chords.length > 0 } };
  }

  if (!voiceAllowsChords(constraints, target.voice)) {
    return failure("chord-voice", { voice: target.voice, noteId }, at);
  }
  if (!isChordInVocabulary(name, constraints.chords)) {
    return failure("chord-vocabulary", { name, noteId }, at);
  }

  const chords = score.chords.filter((chord) => chord.noteId !== target.id);
  const next = chords.findIndex((chord) => chord.start > target.start);
  chords.splice(next < 0 ? chords.length : next, 0, { name, start: target.start, noteId: target.id });
  return { ok: true, score: { ...score, chords, hasChords: true } };
}

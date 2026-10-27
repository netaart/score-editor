// ABOUTME: The four notices a project carries before a handoff, computed from the project and its dialect with no DOM.
// ABOUTME: Each rule is defined once: the melody-with-chords rule is checkProject's and the register is commands-voice's vocalRange.
import { pitchName } from "./arrangement";
import { spansOf } from "./commands-notes";
import { checkProject } from "./commands-project";
import { SINGABLE_RANGE, vocalRange } from "./commands-voice";
import { formatDiagnostic } from "./diagnostics";
import type { ScoreDialect } from "./dialect";
import { messagesFor } from "./i18n";
import { lyricLinesOf, lyricSyllables } from "./lyrics";
import type { SongProject } from "./score";
import type { Language, Notice } from "./types";

/**
 * How many extra syllables per lyric line the whole song may drift by before the counts are called far apart. One is
 * ordinary (a melisma, a held note or a pickup); more than one per line means the lyrics were written for another melody.
 */
const SYLLABLE_GAP_PER_LINE = 1;

/**
 * The notices a project carries before a handoff, in the ticket's order: no sections, syllables far from the notes,
 * Vocal outside the singable range, and a melody project with chords. A score the dialect cannot read carries none.
 * The `message` is in `language`.
 */
export function preHandoffNotices(
  dialect: ScoreDialect,
  project: SongProject,
  language: Language,
): ReadonlyArray<Notice> {
  const score = dialect.parse(project.score).score;
  if (score === null) return [];
  const t = messagesFor(language);
  const notices: Notice[] = [];

  if (!score.sections.some((section) => section.name !== null)) {
    notices.push({ code: "prehandoff-no-sections", level: "warning", message: t.prehandoffNoSections });
  }

  const syllables = lyricLinesOf(project, score).reduce((total, line) => total + lyricSyllables(line.text).length, 0);
  const notes = spansOf(score, "Vocal").filter((span) => span.midi !== null).length;
  const lines = lyricLinesOf(project, score).length;
  if (Math.abs(syllables - notes) > SYLLABLE_GAP_PER_LINE * lines) {
    notices.push({
      code: "prehandoff-syllables-far",
      level: "warning",
      message: t.prehandoffSyllablesFar(syllables, notes),
    });
  }

  const range = vocalRange(score);
  if (!range.singable && range.medianMidi !== null) {
    notices.push({
      code: "prehandoff-vocal-range",
      level: "warning",
      message: t.prehandoffVocalRange(pitchName(range.medianMidi), range.medianMidi > SINGABLE_RANGE.max),
    });
  }

  if (checkProject(dialect, project).some((diagnostic) => diagnostic.code === "melody-with-chords")) {
    notices.push({
      code: "prehandoff-melody-chords",
      level: "warning",
      message: formatDiagnostic({ code: "melody-with-chords", params: {}, at: {} }, language),
    });
  }

  return notices;
}

// ABOUTME: The skill's end-to-end editing example: read a song2 score, find one note id, send one command, classify its diagnostics, and write back the returned project.
// ABOUTME: It is plain JavaScript with its dependencies passed in, so the shipped browser page and the seam 1 test run the same code.

function asDiagnostics(diagnostics, formatDiagnostic, language) {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    text: formatDiagnostic(diagnostic, language),
    at: diagnostic.at,
  }));
}

function failure(stage, message, scoreText, diagnostics, formatDiagnostic, language) {
  return {
    ok: false,
    stage,
    message,
    noteId: null,
    bar: 0,
    chord: "",
    before: scoreText,
    after: null,
    project: null,
    diagnostics: asDiagnostics(diagnostics, formatDiagnostic, language),
    notices: [],
    refusals: asDiagnostics(diagnostics, formatDiagnostic, language),
    changedLines: [],
    lineCount: scoreText.split("\n").length,
  };
}

/**
 * Reads `scoreText`, finds the first pitched Vocal note in `options.bar` (1-based), and sets
 * `options.chord` on it through applyProjectCommand. A notice means the returned project is the
 * edit; any other diagnostic is a refusal and the input is returned unchanged.
 */
export function editOneBar(scoreText, dependencies, options = {}) {
  const { song2Dialect, applyProjectCommand, noteId, isNoticeDiagnostic, formatDiagnostic } = dependencies;
  const bar = options.bar ?? 5;
  const chord = options.chord ?? "C";
  const language = options.language ?? "en";
  const scoreMode = options.scoreMode ?? "melody";

  const read = song2Dialect.parse(scoreText);
  if (read.score === null) {
    return failure("read", "The score did not read.", scoreText, read.diagnostics, formatDiagnostic, language);
  }

  const target = read.score.notes.find((note) => note.voice === "Vocal" && note.bar === bar - 1 && note.midi !== null);
  if (target === undefined) {
    return failure(
      "find",
      `Bar ${bar} has no pitched Vocal note to put a chord on.`,
      scoreText,
      [],
      formatDiagnostic,
      language,
    );
  }

  const targetId = noteId(target.voice, target.start);
  const project = {
    style: "",
    lyrics: "",
    score: scoreText,
    scoreMode,
    seed: null,
    modelId: song2Dialect.id,
    sourceKey: "skill-edit-one-bar",
  };

  const result = applyProjectCommand(song2Dialect, project, { type: "setChord", noteId: targetId, name: chord });
  const notices = result.diagnostics.filter((diagnostic) => isNoticeDiagnostic(diagnostic));
  const refusals = result.diagnostics.filter((diagnostic) => !isNoticeDiagnostic(diagnostic));
  if (refusals.length > 0) {
    const returned = failure(
      "command",
      `The command was refused: ${formatDiagnostic(refusals[0], language)} The project was not changed.`,
      scoreText,
      refusals,
      formatDiagnostic,
      language,
    );
    return { ...returned, noteId: targetId, bar, chord };
  }

  // The returned project is the one to write back; the score text is never rebuilt by hand here.
  const after = result.project.score;
  const readBack = song2Dialect.parse(after);
  if (readBack.score === null) {
    return failure(
      "check",
      "The written score did not read back.",
      scoreText,
      readBack.diagnostics,
      formatDiagnostic,
      language,
    );
  }
  const checked = song2Dialect.check(readBack.score);
  if (checked.length > 0) {
    return failure("check", "The written score did not check.", scoreText, checked, formatDiagnostic, language);
  }

  const beforeLines = scoreText.split("\n");
  const afterLines = after.split("\n");
  const changedLines = [];
  const lineCount = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < lineCount; index += 1) {
    if (beforeLines[index] !== afterLines[index]) changedLines.push(index + 1);
  }

  return {
    ok: true,
    stage: "written",
    message:
      notices.length === 0
        ? `Bar ${bar} changed with "${chord}" on ${targetId}.`
        : `Bar ${bar} changed with "${chord}" on ${targetId}; the notice ${notices[0].code} came with the changed project, not a refusal.`,
    noteId: targetId,
    bar,
    chord,
    before: scoreText,
    after,
    project: result.project,
    diagnostics: asDiagnostics(result.diagnostics, formatDiagnostic, language),
    notices: asDiagnostics(notices, formatDiagnostic, language),
    refusals: [],
    changedLines,
    lineCount: beforeLines.length,
  };
}

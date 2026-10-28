# Edit a score for a user

Use this page when someone hands you a song project or a `.abc` file and asks for a change: "put a C chord on bar 5",
"delete the last two bars", "set the tempo to 90", "turn that note into a rest". Work through the steps in this order.
The command names and every refusal code are in the [package README](../../../README.md#commands); do not copy a command
list from here.

## Read before you write

Read the project's score with the dialect its `modelId` names. A project with no readable score is not an editing
problem to guess around: report the diagnostics and stop.

```ts
import { song2Dialect } from "@neta-art/score-dialect-song2";
import { noteId } from "@neta-art/score-editor";

const reading = song2Dialect.parse(project.score);
if (reading.score === null) {
  // formatDiagnostic(diagnostic, language), then stop: the file is unchanged.
  throw new Error(reading.diagnostics.map((diagnostic) => diagnostic.code).join(", "));
}

// Bar 5 is index 4 in the parsed model. Find the note first; never build an id from a guess.
const target = reading.score.notes.find(
  (note) => note.voice === "Vocal" && note.bar === 4 && note.midi !== null,
);
if (!target) throw new Error("That bar has no pitched Vocal note.");
const id = noteId(target.voice, target.start); // the same id the model already has
```

`modelId` must equal a registered dialect's `id`; a note id comes from `noteId(voice, start)` or from the parsed model,
never from memory. Tool ids and parameter names come from the tool registry, and command names from the package
README. A guessed id fails with `note-not-found` or `no-dialect`; it does not edit anything.

## Send one command

Send the smallest command that does the whole requested change, through `applyProjectCommand` when you hold a project.
A command is applied once, written once and checked once; it either changes the score or leaves it as it was.

```ts
import { applyProjectCommand, formatDiagnostic, isNoticeDiagnostic } from "@neta-art/score-editor";

const result = applyProjectCommand(song2Dialect, project, { type: "setChord", noteId: id, name: "C" });

// A notice is not a refusal: it comes with the changed project. Anything else refuses the whole command.
const refusals = result.diagnostics.filter((diagnostic) => !isNoticeDiagnostic(diagnostic));
const notices = result.diagnostics.filter((diagnostic) => isNoticeDiagnostic(diagnostic));
if (refusals.length > 0) {
  const text = refusals.map((diagnostic) => formatDiagnostic(diagnostic, "en")).join(" ");
  throw new Error(`The command was refused and the project was not changed: ${text}`);
}
const next = result.project; // the project to write back, notices and all
```

If you only have score text and no project, `applyScoreCommand` returns `{ ok: true, text }` or
`{ ok: false, diagnostic }`; it refuses a project command. For several notes that one request names together, use the
command's multi-note form or `applyCommandList`, not a loop of separate commands that can half-apply.

## Tell a notice from a refusal

- A **notice** is a diagnostic for which `isNoticeDiagnostic` is true. The command was taken; the returned project is
  the new project. Report the notice to the user and keep the edit.
- A **refusal** is any other diagnostic. The returned project is the one you passed in, unchanged. Stop, report the
  diagnostic (with `formatDiagnostic` in the user's language), and do not write anything.

`applyProjectCommand` has no `ok` field; read the diagnostics. In an editing session, `session.dispatch` does return
`ok`, and a taken command may still carry notices in `diagnostics`, so `ok` is the field to read there.

## Write back the returned project

Use `result.project` as it is. Do not reconstruct the score, re-serialize a model you assembled, or paste a
hand-written whole score over the file. The command already wrote the score and checked it.

The layer preserves what the command did not touch: an unchanged bar keeps its original bytes, and an untouched line
stays byte for byte the same. That is the property to rely on for "only change this bar". If the request really needs
`replaceScoreText`, keep every other bar note for note (same pitches, onsets and durations); a silent whole-score
rewrite is a different song, not a formatting change. Fitting a lyric line to a melody that changed is a composition
question: see [Composing](../SKILL.md#composing).

Compare before handing it over, if your host can: exactly the requested bar should differ. If other lines changed, do
not hand the result over as a one-bar edit.

## Report what changed

Say what the user asked for and what the result actually is: the bar numbers and note ids, the chord, tempo, key,
section or lyrics that changed, the notices, and that the rest is untouched. If the command was refused, say so and
leave the project unchanged. Do not report a command you only previewed as if it had been applied.

## Before you hand it over

- `song2Dialect.parse(next.score)` returns a score and no error diagnostics.
- No non-notice diagnostic is present; every notice is reported.
- `song2Dialect.check(next.score)` returns `[]`.
- The written score is the one the command returned, not a rebuilt one.
- Every line and bar the request did not name is still byte for byte the same.
- The report names the change, the notices and anything the user still needs to decide.

If any check fails, return the diagnostics and the unchanged project. Do not "fix" the file on the way out with a
second change the user did not ask for.

## What this package does not do

The package edits and reads score text. It does not generate music, call a model or a network API, store drafts by
itself, talk to a host's chat, send a handoff, manage files or permissions, export MIDI or PDF, or play a real
instrument. The draft keeper is the headless half and the host supplies the store; saving, conflicts, handoff and
permissions belong to the host. The synth preview is a browser preview, not a render of the final song. If the request
needs one of those, say which layer owns it instead of looking for it here.

## The worked example

[`assets/edit-one-bar/`](../assets/edit-one-bar/README.md) is the end-to-end example: it reads a real-sized song2
score, finds the first pitched Vocal note in bar 5, sends one `setChord`, reads a notice (the project is in `melody`
mode, so the edit carries `melody-with-chords`), writes back the returned project, and shows that only the line holding
bar 5 changed. The same helper is exercised in seam 1 and in the browser test, including a refused chord that leaves
the input unchanged.

## Writing a score by hand

If the task is to produce or repair `.abc` text rather than edit an existing project, use the song2 writing page in the
dialect package: [`WRITING.md`](../../../../score-dialect-song2/WRITING.md). It gives the smallest correct score and
the rules agents break most, and points at [`RULES.md`](../../../../score-dialect-song2/RULES.md) for each rule. Finish
by reading the text back with `song2Dialect.parse` and `song2Dialect.check` and fixing every diagnostic before handing
it over.

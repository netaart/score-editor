# Change log and handoff

Use this page to show a person what their edits changed, and to give the host the three things it needs to regenerate
the song. The change log is headless; the handoff control is part of the default editor. The package never calls a
generation API and never sends anything itself.

## The change log

`changeLog(original, current, options: ChangeLogOptions)` reads both score texts and returns one sentence per kind of
change, in `"en"` or `"zh"`:

- a deleted, copied, moved, renamed or added section;
- the tempo, key, meter or chords;
- the lyrics, style description, score mode or seed;
- the notes of the bars whose music changed;
- a score text that changed while it still read as the same score (the text view's edit).

The list is recomputed from the two projects every time; it never reads a stored draft. A text edit that changed the
music is reported as the music it changed. A section move is named as a move, and its moved bars are not also called a
note change.

```ts
import { changeLog } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const changes = changeLog(original, current, { language: "en", dialect: song2Dialect });
```

When the dialect is omitted, only project fields and the raw text can be compared; pass it whenever both scores read.

## The instruction

`handoffInstruction(options: HandoffInstructionOptions)` writes the prefilled text the host puts in its chat input; the
options are `{ original, current, title?, language, dialect? }`. It states:

- the work's title (`title`, or the original's `sourceKey` when absent or blank); with a score-file source it is the
  file's name;
- the request to regenerate with song2 and pass the score in the attached `score.abc` through `--text`;
- the final style description and joined lyrics, already synced by the editor and not to be changed by the agent;
- the score mode, and the seed when there is one;
- the change log.

The joined lyrics come from the current score and lyric lines, not from the stored `lyrics` field alone.

`requiredInputs` is the host's list of `ProjectField` values the model requires. While one is missing, the handoff
trigger names it (`Add style first…` or `Add 2 required inputs…`) instead of opening the review; style, score mode and
seed open the Project panel on that field, while lyrics show the arrangement and open the lyric track's new-line editor.
A required empty field's hint starts `Required to regenerate.` The trigger comes back when the field is filled. The
editor reads no model declaration.

## The handoff in `mount`

`MountOptions.title` and `MountOptions.onHandoff` add the handoff. `onHandoff` receives a `HandoffPayload`:

```ts
const editor = mount(el, {
  project,
  dialects,
  language: "en",
  drafts: store,
  title: "My Song",
  onHandoff: ({ attachment, instruction, project: finalProject }) => {
    // Put score.abc and the instruction into the host's own input. Do not send it.
    host.attach(attachment.name, attachment.mediaType, attachment.text, instruction, finalProject);
  },
});
```

The toolbar shows **Regenerate…** in the strip after Restore original and before the song controls, only while the editor is
editable and `onHandoff` is given; read-only, or without the callback, there is no button. It opens a review headed
**Check before regenerating**, with the change log and the action **Regenerate with this version**. Pressing that
action:

1. takes the payload from the project the review showed;
2. saves the draft through the keeper's `handoff()` at once, with the handoff hash of that project's joined lyrics and
   score;
3. calls `onHandoff` when the keeper answers `"written"` or `"unchanged"`;
4. does not call `onHandoff` on `"conflict"` (the conflict banner's Choose opens the two ways out) or `"failed"` (the host has
   the `draft-save-failed` notice).

While the save runs, the trigger reads **Saving…** and cannot open the review. A host with no draft store still gets
the handoff: the keeper answers `"unchanged"`, so there is no draft to save. While the text view holds text the project
did not take, the review says the last readable score is what is handed off; the control is not disabled. The review
is bounded by the window and scrolls a long change list, so the action stays reachable. The change log is visible only
in that review.

With a score-file source the same trigger saves the file first when it is dirty (the review says `Saves <file> first,
then sends the song.`), uses the last saved project as the change log's original, and does not call the host on a
conflict or a failed save. A conflict is answered by the conflict banner; a failed save draws a one-action notice in the
chrome with the `handoffNotSentFailed` sentence and **Save again**, which saves, until the next successful save. Both
also send a `handoff-not-sent` notice and the same sentence in the toolbar's live region. The instruction's title is the
file name. See [score-files.md](score-files.md).

See [the package README](../../../README.md#change-log-and-handoff) for the same contract next to the draft rules.

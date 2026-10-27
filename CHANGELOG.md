# Changelog

Both packages share one version. The README's [Publish](README.md#publish) section has the release steps.

## Unreleased

### Changed

- **A song whose lyrics come as one text now spreads each section's lines over the section's bars by their syllables.** The editor chooses the phrases that fit each line's syllable count instead of putting one line on each bar, so a section's words reach its second half and its lines are no longer bunched at the start.

## 0.4.5

No export of 0.4.4 was removed or renamed: all 81 runtime exports of `@neta-art/score-editor`, all 3 of
`@neta-art/score-dialect-song2`, and all 146 type exports of the core are still exported. `tests/entries.test.ts` checks
every runtime name with `in` (a removal or rename fails `pnpm test`) and lists every 0.4.4 type in tuples the type-check
compiles (a removal or rename fails `pnpm typecheck`); both lists are taken from the `v0.4.4` tag. `git diff
v0.4.4..origin/integration/v1 -- packages/*/src` shows no exported shape change: `Messages` in `i18n.ts` gained
`draftConflictCancel`, `draftConflictOverwritten` and `draftConflictLoaded`, but `Messages` is not exported from either
package entry (the entry exports no `Messages` name), so it is not a host-facing type. A `Score`, `SongProject`,
`MountOptions`, `ScoreCommand` or `NoticeCode` written for 0.4.4 still type-checks and no exhaustive `switch` needs a new
case. Three behaviours a 0.4.4 host can notice are listed under Changed and Fixed: the conflict banner's outcome
sentences and Chinese label, the conflict dialog opening on Cancel, and the inherited draft after a score loses its last
line break; the song2 writer also keeps a lowercase X5 tail.

### Changed

- **The conflict banner says what a choice did.** After loading theirs the editor's live region says **Loaded the other
  version. Your changes in this window were replaced.** ("已载入对方的版本，这个窗口里的修改已被替换。"), and after
  overwriting it says **Saved your version over the other one.** ("已用你的版本覆盖。"). The Chinese button that opens
  the choices is now **选择版本**, so it no longer shares its name with the toolbar's Select. (`c1ba754`)

### Fixed

- **A lowercase X5 tail is left alone.** The writer's check for whether the cut tail still reads as unfinished matched
  only uppercase note letters, so a lowercase tail such as `C16-|c` was rewritten even when nothing changed (for example
  `C16-|=B,`): `serialize(parse(text))` did not give the text back, and `setTempo` changed the tail as well as the `Q:`
  line. The check now reads lowercase letters with their octave and keeps the tail's bytes, restoring both. The
  regression came with `a0ce468` (released in 0.4.3 and 0.4.4); a score saved with a rewritten tail under those versions
  keeps that text, because nothing rewrites it back. (`7e196e8`)
- **A regenerated song inherits the draft it was handed off from when the score comes back without its last line break.**
  The handoff hash now ignores trailing whitespace in the joined lyrics and the score, as song2 returns them, and the
  inheritance check compares the same way. A draft whose handoff hash is the old raw source hash is still accepted.
  (`75d2c48`, `8273225`)
- **The conflict dialog opens on Cancel.** Its visible Cancel button takes the focus when the dialog opens, so Enter
  pressed by habit closes it and writes nothing; Cancel, Escape and light dismiss return the focus to Choose. Both
  conflict kinds share the banner. (`c1ba754`)

## 0.4.4

No export of 0.4.3 was removed or renamed: all 81 runtime exports of `@neta-art/score-editor`, all 3 of
`@neta-art/score-dialect-song2`, and all 146 type exports of the core are still exported. `tests/entries.test.ts` checks
every runtime name with `in` (a removal or rename fails `pnpm test`) and lists every 0.4.3 type in tuples the type-check
compiles (a removal or rename fails `pnpm typecheck`); both lists are taken from the `v0.4.3` tag. No export or type shape
changed this round, so a `Score`, `SongProject`, `MountOptions`, `HandoffInstructionOptions` or `ScoreCommand` written for
0.4.3 still type-checks. The one behaviour a host can notice is the instruction text for a project whose style or lyrics
are blank: a host that asserts the old text for such a project must update its expectation. With both fields present the
instruction is unchanged byte for byte.

### Fixed

- **A blank style and wordless lyrics are not called final.** `handoffInstruction` now leaves out a style that is empty or
  whitespace, and joined lyrics with no syllable (empty, or only section labels and blank lines). One sentence says
  which field the score does not carry, tells the agent to take it from the person's message or the conversation, and to
  ask the person before generating if neither has it. A field with content keeps the final sentence and its label and
  value; with both fields blank the one sentence names both.

## 0.4.3

No export of 0.4.2 was removed or renamed: all 81 runtime exports of `@neta-art/score-editor`, all 3 of
`@neta-art/score-dialect-song2`, and all 146 type exports of the core are still exported. `tests/entries.test.ts` checks
every runtime name with `in` (a removal or rename fails `pnpm test`) and lists every 0.4.2 type in tuples the type-check
compiles (a removal or rename fails `pnpm typecheck`); both lists are taken from the `v0.4.2` tag. No export or type shape
changed this round, so a `Score`, `SongProject`, `MountOptions`, `ScoreCommand` or `NoticeCode` written for 0.4.2 still
type-checks and no exhaustive `switch` needs a new case. Two behaviours a host can notice are listed under Changed and
Fixed: the handoff's new words, and the cut rules note commands now enforce.

### Changed

- **The handoff is called “Hand to agent”.** The trigger reads **Hand to agent…** (`交给 agent…`), the review **Check
  before you hand to agent** (`交给 agent 前核对`), the primary action **Hand to agent** (`交给 agent`), the notices lead
  “before you hand to agent” (`交给 agent 前…`), and the not-sent lines end “then hand to agent” (`再交给 agent`). The
  source line now says the edited version or the song goes into the chat box and the person sends it. A host that matches
  the old **Regenerate…** / **重新生成…** label in tests, walks or docs must update it; the instruction text addressed to
  the agent did not change. (`276f53c`)

### Fixed

- **Note commands follow the gate's cut rules.** A move, add, paste, duplicate, copy, note-tool run, `toRests` tie chain
  or section split that would rewrite a cut score's cut measure, or leave a short or missing final `Ins` block non-final,
  is now refused with `write-mismatch`; a legal edit near the cut is written. The song2 writer keeps those pieces. A host
  that already shows the diagnostic needs no new code; the code itself is unchanged. (`a0ce468`, `aa9fdf6`)

## 0.4.2

No export of 0.4.1 was removed or renamed: all 81 runtime exports of `@neta-art/score-editor`, all 3 of
`@neta-art/score-dialect-song2`, and all 145 type exports of the core are still exported. `tests/entries.test.ts` checks
every runtime name with `in` (a removal or rename fails `pnpm test`) and lists every 0.4.1 type in tuples the type-check
compiles (a removal or rename fails `pnpm typecheck`); both lists are taken from the `v0.4.1` tag. The one new export is
`ScoreFileReadFailure` (type). A 0.4.1 `ScoreFileSource.read` that returns an entry or `null` still type-checks, a save
that answers `"failed"` still does, and the new `SourceLabelOptions.readOnly` is optional. Two unions gained members:
`DraftWriteResult.reason` (and so `ScoreFileSaveResult`) gained `"no-access"`, and `NoticeCode` / `NOTICE_CODES` gained
`prehandoff-lyrics-unaligned`; an exhaustive `switch` over either must add the new case. `ScoreFileKeeper` and
`ScoreFileKeeperChange` gained the required `accessLost` member: a host that reads a keeper needs no change, while one
that implements or mocks either interface must add it.

### Added in `@neta-art/score-editor`

- **The read-failure answer of a score file.** `ScoreFileReadFailure` is `{ ok: false, reason: "missing" | "failed" }`;
  `ScoreFileSource.read` may return it, while `null` still means the file is gone. This is the only new package-entry
  export; there are no new runtime exports. (`a0507e7`)

The public exports this adds, by the module they come from:

- `types`: `ScoreFileReadFailure` (type).

### Added in `@neta-art/score-dialect-song2`

No new exports and no new dialect API.

### Changed

- **`DraftWriteResult` and `ScoreFileSaveResult` gained `no-access`.** A host that answers `"failed"` still works; one
  that switches on the reason must add `"no-access"`. A score-file save refused because access was removed now says so,
  and its notice hides Save again because a retry cannot work until access returns. (`61d1328`)
- **`ScoreFileSource.read` can answer a `ScoreFileReadFailure`.** `null` keeps meaning missing, and a read written for
  0.4.1 still type-checks; a new `missing` or `failed` answer lets the editor distinguish a deleted file from a broken
  read. (`a0507e7`)
- **`ScoreFileKeeper` and `ScoreFileKeeperChange` gained `accessLost`.** It is true after a save was refused for access
  and clears on the next save, load or restore; a host that implements the keeper or builds a change object must add the
  field, while a host that only reads the values gets it. (`61d1328`)
- **`SourceLabelOptions` gained the optional `readOnly` getter.** A score file in a read-only editor now says **Score file
  (read only)** instead of claiming it saves to the file. (`bd060ba`)
- **`NoticeCode` and `NOTICE_CODES` gained `prehandoff-lyrics-unaligned`.** The pre-handoff review now carries five
  notices; an exhaustive switch must add the code, and a host that toasts every notice may skip the `prehandoff-*` ones
  because the review shows them. (`2f6c1b5`)
- **The desktop toolbar strip wraps instead of scrolling.** On a fine pointer the strip shows every control on wrapped
  lines rather than a sideways scroll, and Save keeps its words in a narrow desktop window; the phone's two-row layout is
  unchanged. (`f51327e`, `5d2f06d`)

### Fixed

- **Load-theirs on a deleted file** keeps the person's project, clears the conflict and lets the next Save write the file
  anew, instead of replacing the project or leaving the conflict standing. (`a0507e7`)
- **Lyric labels** match sections without regard to case or surrounding spaces, so `[Verse]` against `% verse` joins the
  lyrics instead of coming out empty, and “quiet” counts as two syllables. (`e704c7f`)
- **The pre-handoff review** names the lines left in the unaligned area, up to four opening words each, and says the
  joined lyrics leave them out. (`2f6c1b5`)
- **A read-only score file** is labelled read only in the toolbar. (`bd060ba`)
- **A short score's lane ground** reaches the stage's right edge, while its bars and bar numbers still stop at the last
  bar. (`2a2a574`)

## 0.4.1

No export of 0.4.0 was removed or renamed: all 81 runtime exports of `@neta-art/score-editor`, all 3 of
`@neta-art/score-dialect-song2`, and all 145 type exports of the core are still exported. `tests/entries.test.ts` checks
every runtime name with `in` (a removal or rename fails `pnpm test`) and lists every 0.4.0 type in tuples the type-check
compiles (a removal or rename fails `pnpm typecheck`); both lists are taken from the `v0.4.0` tag. The only shape changes
are optional fields — `HandoffInstructionOptions.scorePath`, `MountOptions.handoffScorePath` and
`SourceLabelOptions.say` — so a `MountOptions`, `HandoffInstructionOptions` or `SourceLabelOptions` written for 0.4.0
still type-checks and opens. No union gained a member, so no exhaustive `switch` needs a new case.

### Added in `@neta-art/score-editor`

- **A handoff instruction can name the score's file.** `handoffInstruction({ …, scorePath })` writes the file into its
  intro instead of pointing at the attached `score.abc`, in both languages; `mount`'s `handoffScorePath` callback supplies
  that path when the review builds the payload. The `score.abc` attachment stays in `HandoffPayload`, and without a path,
  or with a blank one, the instruction is exactly what 0.4.0 wrote. (`102c212`)
- **The App-05 review round's options.** `SourceLabelOptions.say` lets a host say the new source label once when Save as
  changes it, and the default editor's save notice takes `SaveNoticeOptions.save`, so its Save again runs the editor's one
  save path. Both are optional. (`17d7362`)
- **No new package-entry exports.** `python -I .port/changelog-exports.py /work v0.4.0 packages/score-editor` and the
  same for the dialect print no bullets: every name exported at 0.4.1 was already exported at 0.4.0.

### Added in `@neta-art/score-dialect-song2`

No new exports and no new dialect API.

### Changed

- **The handoff review's notices.** They come first under a count lead (`2 things to check before you regenerate` /
  `重新生成前有 2 处要看`), each is ordinary text behind a 3 px text-colour rule rather than a muted quote, and the four
  sentences name the next control: the “Unnamed” section bar and “Name this section”, the lyric and note counts, the
  middle note against the singable range with the Voice octave tool, and Score mode with the chords. The notices are part
  of the dialog's description and the lead is said once. (`17d7362`)
- **The source label and the review's first line.** The label is plain text with no pill or border, first in the strip;
  on a phone the bracketed half takes a second line. It says its new words once when Save as changes the source
  (`SourceLabelOptions.say`), and the handoff review opens with the same source sentence. (`17d7362`)
- **Save again** on the failed-save notice now calls the Save control's one save path, so a successful retry says Saved
  and updates the same state as Save and Ctrl/Cmd+S, instead of writing through the keeper alone. (`17d7362`)
- **The Chinese project mode names** are 完整 and 旋律, without the half-English `（full）`/`（melody）`, in the Project
  panel, the change log, the score-mode diagnostics and the handoff review. (`17d7362`)

### Fixed

- **The marked change-log entries** now use 600 weight and a text-colour dot with a one-line legend
  (`Marked: changed by your last step.`), not the accent line and tint that read as focus. (`17d7362`)
- **The melody-with-chords diagnostic** now says the score mode is Melody but the score has chords, and names the two
  ways out — delete the chords, or change Score mode to Full — in both languages. (`17d7362`)
- **The handoff review's actions** stay on one row at 320 px, each button sharing the width, so neither Cancel nor
  Regenerate… is cut or stacked. (`17d7362`)

## 0.4.0

No export of 0.3.0 was removed or renamed: all 76 runtime exports of `@neta-art/score-editor`, all 3 of
`@neta-art/score-dialect-song2`, and all 135 type exports of the core are still exported. `tests/entries.test.ts` checks
every runtime name with `in` (a removal or rename fails `pnpm test`) and lists every 0.3.0 type in tuples the type-check
compiles (a removal or rename fails `pnpm typecheck`); both lists are taken from the `v0.3.0` tag. The fields added to
existing shapes are optional, and the new members on the values a host receives (`MountedEditor.save()`,
`EditingSession.rewrittenBars`) are additive, so a `Score`, `SongProject`, `MountOptions`, `DraftStore` or `ScoreTool`
written for 0.3.0 still type-checks and opens, and a `ScoreCommand` written for it still type-checks. Two unions gained
members: `ScoreCommand` (`voiceOctave`, `instrumentalVersion`) and `NoticeCode` (the four `prehandoff-*` codes). Every
existing value is still valid and a host that handles a default needs no change, but an exhaustive `switch` must add the
new cases; that edge is under Changed, and this release is not called drop-in for such a switch.

### Added in `@neta-art/score-editor`

A host can now move only the Vocal voice by whole octaves or turn a Vocal-only song into an instrumental, save a score
file from its own code, and reach the same chrome at a phone's width with a review that names the bars an edit rewrote.
The feature areas since 0.3.0:

- **Voice octave and Instrumental version.** `vocalRange` and `SINGABLE_RANGE` report Vocal's median pitch against the
  singable range 60–82; the `voiceOctave` and `instrumentalVersion` commands run as two built-in tools in the Tools panel,
  one undo step each. Voice octave moves only Vocal — chords, the key and Ins stay — and refuses the whole move with the
  `voice-octave-range` code when a note would leave MIDI 0–127. Instrumental version moves Vocal's notes to Ins, keeps
  its rests and chords, cuts, splits or drops the Ins notes they overlap, and writes an Ins voice line into a Vocal-only
  score. Each reports what it did through `CommandReport` on the tool result.
- **A host-driven save.** `MountedEditor.save()` runs the Save button's one path and resolves with the keeper's own
  `saved`, `unchanged`, `conflict` or `failed`; it writes nothing for a generated score, a read-only editor, a save in
  flight, a standing conflict or a destroyed editor.
- **The strip, the bar and the conflict banner.** The toolbar is a sideways-scrolling strip of editing and song controls
  above an always-visible bar that holds Save, the view switch and the preview control, so a phone gets two rows of
  controls instead of four and Save and the views stay in sight at every width. The music keeps its floor while the
  chrome scrolls, a clipped edge fades, and a draft conflict and a score-file conflict share one banner with a Choose
  button and one dialog.
- **The pre-handoff review and the source label.** `preHandoffNotices` returns the four notices a project carries before
  a handoff; the review shows them in place and sends each once through `notify`. `changeLogEntries` and
  `session.rewrittenBars` let the review highlight the entries that name a bar the last edit rewrote, and
  `mountSourceLabel` draws the generated-score or score-file pill first in the strip.
- **The browser suite.** Every song2 sample sweep runs under one shared timeout and the placing sweep does less repeated
  work, so `pnpm test:e2e` finishes reliably on a loaded machine. No host API changes.

The public exports this adds, by the module they come from:

- `change-log`: `changeLogEntries`, `ChangeLogEntry` (type).
- `commands-voice`: `CommandReport` (type), `InstrumentalReport` (type), `InstrumentalVersionCommand` (type),
  `SINGABLE_RANGE`, `vocalRange`, `VocalRange` (type), `VoiceCommand` (type), `VoiceOctaveCommand` (type),
  `VoiceOctaveReport` (type).
- `handoff-notices`: `preHandoffNotices`.
- `source-label`: `mountSourceLabel`, `SourceLabelOptions` (type), `SourceLabelPart` (type).

### Added in `@neta-art/score-dialect-song2`

No new exports and no new dialect API. The writer changed as the Fixed list says.

### Changed

- **The phone toolbar is two rows, not four.** The controls split into a strip that scrolls sideways and a bar that stays
  in view; Save moved into the bar before the view switch, and the source label takes the strip's first slot. A host that
  mounts `mountToolbar` alone with `synthPreview: false` and no `viewSwitch` keeps the older single scrolling row; one
  that uses the default editor, or passes either control, gets the strip and the bar, so CSS that reached into the row's
  children should read the documented `.sce-tools` and `.sce-bar` structure. (`125d20a`, `a81dbfa`, `d07130a`)
- **A failed save and a refused handoff are said in the chrome.** The notice says the sentence and offers Save again;
  the handoff's conflict reason stays with the conflict banner. (`e333990`)
- **The pre-handoff notices reach `notify`.** The editor sends each of the four `prehandoff-*` codes once each time the
  review opens, not on every redraw; a host that toasts every notice may skip them because the review already shows them.
  (`769aaae`)
- **`ScoreCommand` and `NoticeCode` gained members.** The score command union adds `voiceOctave` and `instrumentalVersion`;
  the notice code union and `NOTICE_CODES` add `prehandoff-no-sections`, `prehandoff-syllables-far`,
  `prehandoff-vocal-range` and `prehandoff-melody-chords`. A host that switches exhaustively must add the new cases.
  (`a5dfacc`, `769aaae`)
- **Both conflict strips became one banner.** A draft conflict and a score-file conflict now show one sentence and a
  Choose button that opens one shared dialog, instead of two choices on the strip, so neither costs a row of chrome and
  both fit a short editor. (`8496b9f`, `d175233`)

### Fixed

- **song2 write-back** finds the key line by its `K:` prefix instead of counting header lines, and writes an Ins voice
  line when an instrumental version adds the voice to a Vocal-only score. (`7c09342`, `d51287d`)
- **The lyrics gate's field** scrolls into the editor's scroller with its Add button below the pinned head, and the page
  itself does not scroll; the browser's own tap highlight is off for every control. (`3f232e4`)
- **The conflict dialog** fits a short editor and the chrome returns to its earlier scroll when a banner goes; a control
  in the toolbar strip keeps its content width; the lyrics gate's focus ring stays inside the scroller.
  (`d175233`, `a81dbfa`, `eaeaa13`)
- **The browser suite's sweeps** are bounded by one shared timeout and the placing sweep no longer repeats work.
  (`4028577`, `41d6f73`)

## 0.3.0

No export of 0.2.0 was removed or renamed: the 66 runtime exports of `@neta-art/score-editor` and the 3 of
`@neta-art/score-dialect-song2` are all still exported, and so is every one of the core's 105 type exports.
`tests/entries.test.ts` imports every runtime name (a rename or removal fails the run) and lists every type in a tuple
the type-check compiles (a rename or removal fails `pnpm typecheck`). The fields added to the shapes a host builds are
optional or widened, and the new members on the values a host receives are additive, so a `Score`, `SongProject`,
`MountOptions`, `DraftStore` or `ScoreTool` written for 0.2.0 still type-checks and opens.

### Added in `@neta-art/score-editor`

A host can now open a score file and save it explicitly, hand the song and an instruction to its agent, choose bars and
a meter, open a section's menu, list its own tools beside the built-in note tools, and place notes with the pencil. The
feature areas since 0.2.0:

- **Score files and explicit save.** `source: { kind: "scoreFile", … }` opens a file with an opaque version; the toolbar
  gets Save and Save as, the unsaved state comes through `onUnsavedChange` and `MountedEditor.hasUnsavedChanges()`, a
  conflict is answered with Overwrite or Load, Restore goes back to the last save, a generated score saves through
  `onSaveAs`, and a dirty file is saved before a handoff.
- **The change log and the handoff.** `changeLog` and `handoffInstruction` build the one-sentence change list and the
  prefilled instruction; `onHandoff` receives the `score.abc` attachment and the final project from the editor's
  Regenerate… review; `requiredInputs` names a missing model input and opens the Project panel or the lyric track.
- **Bars and meter.** The Bars menu inserts and deletes bars and repairs the cut; the section Meter control offers the
  dialect's common meters and a custom row; `meter` exposes the rules the control uses, and the session holds the bars
  chosen in the ruler.
- **The section menu.** `sectionActions` lists a section's six actions with the command each runs and the refusal of one
  it cannot; the ruler's bands open the menu.
- **The Tools panel and placing notes.** `mountToolPanel` draws `NOTE_TOOLS` and the host's tools, with a preview and
  the `TOOL_GROUPS` groups; the `commands-place` types build add, copy, paste and duplicate commands; the pencil places
  notes by mouse and finger, with audition and the touch copy path.
- **The staff view and the lyric track part.** The staff cursor is anchored on the drawn onsets and follows the host's
  play position; a `Z2`–`Z4` run draws as separate bars; `LyricTrackPart` opens the editor on a missing lyric line.

The public exports this adds, by the module they come from:

- `change-log`: `changeLog`, `ChangeLogOptions` (type), `handoffInstruction`, `HandoffInstructionOptions` (type).
- `commands-place`: `AddNoteCommand` (type), `CopiedNote` (type), `CopyNotesCommand` (type), `DuplicateNotesCommand` (type), `PasteNotesCommand` (type).
- `lyric-track`: `LyricTrackPart` (type).
- `meter`: `COMMON_METERS`, `meterAllowed`, `meterChoices`.
- `note-tools`: `NOTE_TOOLS`.
- `project-panel`: `ProjectPanelOptions` (type).
- `score-source`: `createScoreFileKeeper`, `ScoreFileHandoffResult` (type), `ScoreFileKeeper` (type), `ScoreFileKeeperChange` (type), `ScoreFileKeeperOptions` (type), `ScoreFileKeeperStatus` (type).
- `section-actions`: `SectionAction` (type), `SectionActionName` (type), `sectionActions`.
- `session`: `BarSelection` (type).
- `tool`: `TOOL_GROUPS`, `ToolContext` (type), `ToolGroup` (type).
- `tool-panel`: `mountToolPanel`, `ToolPanelOptions` (type), `ToolPanelPart` (type).
- `toolbar`: `ToolbarPart` (type).
- `types`: `GeneratedScoreSource` (type), `HandoffPayload` (type), `ProjectField` (type), `RequiredInput` (type), `ScoreFileEntry` (type), `ScoreFileSaveResult` (type), `ScoreFileSource` (type), `ScoreSource` (type).

### Added in `@neta-art/score-dialect-song2`

No new exports and no new dialect API; the reader and the writer changed as the lists below say.

### Changed

- **The staff cursor.** It now sits on each bar's first drawn onset, not its first written note, and is drawn in the
  note colour: a 2 px line with a 3 px band of the same colour at 20% on each side, so it reads apart from the black
  bar lines. (`30a659a`, `395e52c`, `78d1328`, `6994ed5`)
- **`Z2`–`Z4` runs.** song2 reads each run as that many whole-bar rests in the bar's meter; the staff draws one bar per
  rest, and a `Score` may carry the optional `drawingText` a drawing view reads instead of the written text.
  (`fc55daa`, `0c343c1`)
- **Every popover** is placed through one helper, so the filter panel, the project panel, the chord picker and the
  section menu keep the same window margins and scroll inside a short window. (`3440ba9`, `b8083d5`, `206fd68`,
  `da313ac`, `a24b326`)
- **The phone toolbar** keeps its existing tab order, redraws the bars menu on a language change, and does not
  re-announce the voices on a view-only change. (`115311f`, `67e90d6`, `4c8d7b7`, `3d79c4d`)
- **The pnpm-bundler example** approves esbuild's install script, so it installs under pnpm 11 and later. (`59b4a6e`)

### Fixed

- **song2 write-back** keeps a cut, a trailing section marker and a key split through a save, and an edit that changes
  the cut writes the new one. (`de834dc`)
- **A meter change that reaches an early voice** is refused instead of writing a text the dialect then rejects.
  (`907a690`)
- **The handoff** stays after a restore when a draft store arrives, and a score file's save state survives
  `update({ project })` objects with the same file. (`4f43572`, `88ebdde`)
- **The save control** keeps one form and one height per box, language and font, including after the host's fonts
  settle; the conflict strip is scrolled into view, and a failed save says Save again with the recovery sentence.
  (`be6bd46`, `f0ec0f4`)
- **The pencil** shows its mode where the tap lands and has the touch copy path; the forced-colour marks stay under
  focus and zoom, and the lane word stays inside the view at every scroll. (`e6c91b1`, `a9f64f6`, `c938136`)
- **The Tools panel and its tools** after review: the panel's bottom sheet is capped by the chrome and the music's
  floor, the tool result names the tool, and the built-in note tools' parameters and preview follow the review.
  (`e066198`, `03edeae`)
- **Bars, meter and the section menu** after review: the cut sentence's landmark text, the bar drag's pointer capture,
  one-bar sections, the section form's announcement, and the reasons of the muted choices. (`2fe9fc1`, `4ca04e0`,
  `8a5b8b0`, `ce17a35`, `62af9f3`, `411b4bc`)
- **The handoff and score-source design reviews** changed the review's words and the file's restore and save wording.
  (`15d30d0`, `f0ec0f4`)

## 0.2.0

No export of 0.1.0 was removed or renamed, and `tests/entries.test.ts` checks that every 0.1.0 export is still there. Fields added to existing shapes are optional, so a `Score` or `SongProject` built for 0.1.0 still type-checks and opens.

### Added in `@neta-art/score-editor`

The editing session with its commands and history, the view parts and the default editor built from them, the staff and text views, the synthesized preview, lyrics, chords, sections, tempo, key and the song project panel, moving and resizing notes, filter select, drafts with Restore original, custom tools, and the editor skill. The public exports this adds, by the module they come from:

- `chord-edit`: `ChordSlot` (type), `chordSlots`, `nearestChordSlot`.
- `chord-track`: `mountChordTrack`.
- `chord-vocabulary`: `chordChoices`, `ChordChoices` (type), `ChordLetter` (type), `ChordNameParts` (type), `splitChordName`.
- `commands-notes`: `Grid` (type), `GridValue` (type), `MoveNotesCommand` (type), `MoveResizeCommand` (type), `ResizeNotesCommand` (type).
- `commands-project`: `checkProject`, `ProjectCommand` (type).
- `cut-notice`: `mountCutNotice`.
- `diagnostics`: `isNoticeDiagnostic`, `NOTICE_DIAGNOSTIC_CODES`, `NoticeDiagnosticCode` (type).
- `draft-conflict`: `mountDraftConflict`.
- `draft-keeper`: `createDraftKeeper`, `DraftHandoffResult` (type), `DraftKeeper` (type), `DraftKeeperChange` (type), `DraftKeeperOptions` (type), `DraftKeeperStatus` (type).
- `drafts`: `contentHash`, `DRAFT_FORMAT_VERSION`, `DraftProject` (type), `draftText`, `readDraft`, `ScoreDraft` (type).
- `editing-input`: `EditingInput` (type), `EditingInputResult` (type), `handleEditingInput`.
- `filter-notes`: `filterNotes`, `NoteFilter` (type).
- `filter-panel`: `mountFilterPanel`.
- `lyric-edit`: `barLineTick`, `LyricBoundaryDrag` (type), `LyricBoundaryMove` (type), `lyricBoundaryPlan`, `LyricBoundaryPlan` (type), `LyricDrop` (type), `lyricDropPlan`, `LyricDropPlan` (type), `LyricEdge` (type), `LyricRow` (type), `lyricRows`, `LyricSplit` (type), `lyricSplitCommand`.
- `lyric-track`: `mountLyricTrack`.
- `lyrics`: `alignedLyricLines`, `alignLyricLine`, `joinLyrics`, `layoutLyrics`, `LyricAlignment` (type), `lyricCharacterCount`, `lyricLinesOf`, `LYRICS_MAX_CHARACTERS`, `LyricSyllableNote` (type), `lyricSyllables`, `noteOnsets`, `syllableCount`, `unalignedLyricLines`.
- `preview-note`: `previewNote`, `PreviewNoteOptions` (type).
- `preview-player`: `previewPlayer`, `PreviewPlayer` (type), `PreviewStart` (type).
- `preview-schedule`: `PreviewChordEvent` (type), `PreviewEvent` (type), `PreviewNoteEvent` (type), `PreviewSchedule` (type), `schedulePreview`.
- `problem-view`: `mountProblemView`.
- `project-panel`: `mountProjectPanel`, `ProjectPanel` (type).
- `score`: `LyricLine` (type), `LyricPhrase` (type).
- `session`: `createEditingSession`, `DispatchResult` (type), `EditingSession` (type), `InsertionPoint` (type), `RejectedText` (type), `ScoreReading` (type), `SessionChange` (type), `SessionChangeCause` (type), `SessionListener` (type), `SessionOptions` (type), `VIEW_NAMES`, `ViewName` (type), `ViewState` (type).
- `staff-view`: `mountStaffView`, `StaffViewPart` (type).
- `stale-notice`: `mountStaleNotice`.
- `synth-preview`: `mountSynthPreview`.
- `tempo`: `tickAtSeconds`.
- `text-view`: `mountTextView`.
- `time-ruler`: `mountTimeRuler`.
- `tool`: `applyCommandList`, `BooleanToolParameter` (type), `ChoiceToolParameter` (type), `CommandListResult` (type), `createToolRegistry`, `NumberToolParameter` (type), `previewTool`, `ScoreTool` (type), `TextToolParameter` (type), `ToolCommandBuilder` (type), `ToolParameter` (type), `ToolParameterCheck` (type), `ToolParameterValue` (type), `ToolParameterValues` (type), `ToolRegistry` (type), `ToolResult` (type), `ToolText` (type), `validateToolParameters`.
- `toolbar`: `mountToolbar`, `ToolbarOptions` (type).
- `types`: `AxisPartOptions` (type), `DraftStore` (type), `DraftStoreEntry` (type), `DraftWriteResult` (type), `ViewPart` (type).
- `view-switch`: `mountViewSwitch`.
- `voice-track`: `mountVoiceTrack`, `VoiceTrackOptions` (type).
- `zoom-control`: `mountZoomControl`.

### Changed in reading song2 (`@neta-art/score-dialect-song2`)

The reader now reads as song2 generation does, in two places, so a text the editor accepts is a text generation accepts:

- A cut tail note that runs past the end of its bar is refused with a diagnostic at its position, and `check` fails. 0.1.0 read such a text; generation refused it.
- Characters such as U+2028 and the no-break space are read as a line break or as white space, as generation reads them. Bars that a command does not touch are still written back byte for byte.

The package's exports are the same as in 0.1.0. `RULES.md` in the package states both rules.

## 0.1.0

The first release: the read-only arrangement view, and the layer under it (the score model, reading and writing song2, the `toRest` command, diagnostics).

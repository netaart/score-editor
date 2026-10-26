# Changelog

Both packages share one version. The README's [Publish](README.md#publish) section has the release steps.

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

# Changelog

Both packages share one version. The README's [Publish](README.md#publish) section has the release steps.

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

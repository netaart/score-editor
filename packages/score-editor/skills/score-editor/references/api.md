# Public export index

Every public export of the two package entries, grouped by layer. A change that adds one updates this page in the same
change. The tests in the repository check that the list stays complete.

## Functions

| Export | Package | What it does |
| --- | --- | --- |
| `mount` | core | Mounts the default editor on an element; returns `MountedEditor`. |
| `createEditingSession` | core | Builds an `EditingSession` from a project and a `DialectRegistry`. |
| `mountToolbar` | core | Mounts the toolbar view part: title, zoom, and while editable undo, redo, Delete and the Select menu; takes `ToolbarOptions`. |
| `mountZoomControl` | core | Mounts the zoom control view part on `(el, session)`. |
| `mountCutNotice` | core | Mounts the cut-notice view part. |
| `mountProblemView` | core | Mounts the problem view part. |
| `mountTimeRuler` | core | Mounts the time-ruler view part; takes `AxisPartOptions`. |
| `mountChordTrack` | core | Mounts the chord-track view part; takes `AxisPartOptions`. While the session is editable, a press places, changes or removes a chord through a picker. |
| `mountVoiceTrack` | core | Mounts one voice track; takes `VoiceTrackOptions` with `voice`. |
| `mountTextView` | core | Mounts the text view part: the score text in a box, checked as it is typed, handed to the project when it reads. |
| `mountStaffView` | core | Mounts the staff view part: the score drawn by abcjs, read-only; abcjs is loaded by this call. Returns a `StaffViewPart`. |
| `mountStaleNotice` | core | Mounts the stale notice part: one sentence while the text view holds text the project did not take. |
| `mountViewSwitch` | core | Mounts the view switch part: three buttons that set the session's `activeView`. |
| `mountDraftConflict` | core | Mounts the draft conflict strip: shown while a `DraftKeeper` is in conflict, with the two ways out. |
| `createDialectRegistry` | core | Builds a `DialectRegistry` lookup from an array of dialects. |
| `applyScoreCommand` | core | Applies one `ScoreCommand` to score text and checks it; returns `ApplyScoreResult` and refuses a `ProjectCommand`. |
| `applyProjectCommand` | core | Applies one `ScoreCommand` or `ProjectCommand` to a `SongProject`; returns `ApplyProjectResult`. |
| `applyCommandList` | core | Applies a list of score and project commands as one unit; returns `CommandListResult`, all applied or the untouched project. |
| `checkProject` | core | Reports the song-project notices of a project as it stands, without changing it. |
| `lyricLinesOf` | core | The stored lyric lines, or the layout computed from a legacy `lyrics` text. |
| `layoutLyrics` | core | Lays a legacy `lyrics` text onto a score, one line per bar, with the unaligned area. |
| `joinLyrics` | core | Writes the joined `lyrics` text from a score and its lyric lines; unaligned lines are left out. |
| `alignedLyricLines` | core | The lines bound to a phrase that fits the score; pass the score to leave a stale phrase out. |
| `unalignedLyricLines` | core | The lines in the unaligned area: no phrase, or one that no longer fits the score. |
| `lyricSyllables` | core | Splits a lyrics text into the syllable units the count uses. |
| `syllableCount` | core | Counts syllables: Han and kana one each, Latin by vowel groups, `-` by hand. |
| `noteOnsets` | core | The `Vocal` notes in a phrase that are not rests or tie continuations. |
| `alignLyricLine` | core | Compares a line's syllables with its onsets; returns one note per syllable when equal. |
| `lyricCharacterCount` | core | Counts the characters of a lyrics text as Unicode code points. |
| `formatDiagnostic` | core | Turns a `Diagnostic` into a sentence in `en` or `zh`. |
| `isNoticeDiagnostic` | core | Says whether a diagnostic is a notice, so a changed project is not mistaken for a refusal. |
| `noteId` | core | Builds a note id from voice and start tick. |
| `createToolRegistry` | core | Builds a `ToolRegistry` from tools, refusing duplicates and malformed declarations. |
| `validateToolParameters` | core | Fills defaults and checks a tool's values; returns `ToolParameterCheck`. |
| `previewTool` | core | Computes a `ToolResult` without a session. |
| `handleEditingInput` | core | Does what a part does with one `EditingInput` (a key, a click on a note, a click on empty space, a delete, a toggle, a box, select all, invert, clear) to a session; returns `EditingInputResult`. |
| `mountProjectPanel` | core | Mounts the song project panel: the style text, the score mode, the seed, the joined lyrics with their count and the notices the project carries; takes `EditingPartOptions` and returns a `ProjectPanel`. |
| `mountSynthPreview` | core | Mounts the synth preview control: a Preview / Stop button and its caption; shown in read-only mode too. |
| `previewPlayer` | core | The session's one `PreviewPlayer`: start, stop, and the tick under the playhead. |
| `previewNote` | core | Sounds one MIDI pitch for a short time; resolves whether it sounded. Takes `PreviewNoteOptions`. |
| `schedulePreview` | core | Turns a `Score` and a start tick into timed note and chord events: a `PreviewSchedule`. Pure. |
| `tickAtSeconds` | core | The tick at a time from the score's start, following tempo changes and staying at the end past it. Pure. |
| `contentHash` | core | The lowercase SHA-256 of the UTF-8 bytes of `JSON.stringify([lyrics, score])`. |
| `draftText` | core | Writes a `ScoreDraft` as the JSON text a host stores. |
| `readDraft` | core | Reads a stored text as a `ScoreDraft`; another version or a malformed text is null. |
| `createDraftKeeper` | core | Binds a session to a `DraftStore`: opens, inherits, debounces writes, resolves conflicts and restores. |
| `sectionActions` | core | What one section offers a menu: rename, start a section at a bar, move earlier, move later, duplicate and delete, each with its command and, when the command layer would refuse it, the refusal. Asks without changing the session. |
| `chordSlots` | core | The places a chord can go in a `Score`: the starts of notes and rests in voices the constraints allow chords on, as `ChordSlot`s. Pure. |
| `nearestChordSlot` | core | The `ChordSlot` nearest a tick, the earlier one on a tie; null when there is none. Pure. |
| `chordChoices` | core | What a chord picker may offer from a `ChordVocabulary`: letters with their spellings, the types the grammar can write, and whether a bass note is allowed, as `ChordChoices`. Pure. |
| `splitChordName` | core | Splits a chord name into `ChordNameParts` by a vocabulary; null when the vocabulary does not allow the name. The grammar `setChord` checks. Pure. |
| `filterNotes` | core | The ids of the notes that satisfy a `NoteFilter` (pitch, time, length, in or out of key, one in every N, invert) in a `Score`. Pure. |
| `mountFilterPanel` | core | Mounts the Filter button and its panel on `(el, session)`: selects notes by condition through `session.select`; shown in read-only mode too. |
| `lyricRows` | core | Each lyric line with its place in the list, the phrase it sits on (null in the unaligned area) and its alignment; pass the score so a stale phrase is unaligned. |
| `lyricBoundaryPlan` | core | The phrases that change and the `setLyricLinePhrase` commands, the line that gives up bars first, when an edge of a phrase is dragged to a tick. |
| `lyricDropPlan` | core | The one-bar phrase, and its command, for a line let go of over a tick; says whether the bar is free. |
| `lyricSplitCommand` | core | The `splitLyricLine` command for a caret in a line's text, with the bar when the phrase has two bars or more. |
| `barLineTick` | core | The tick of a bar line, which is what a `LyricBoundaryPlan`'s `boundary` names; a line before the first bar is the start of the score, one past the last bar its end. |
| `mountLyricTrack` | core | Mounts the lyric track view part: phrase blocks with their syllable and note-start counts, syllables on their notes, the unaligned area, and while editable the edits of a line; takes `AxisPartOptions`. |

## Constants and values

| Export | Package | What it is |
| --- | --- | --- |
| `TICKS_PER_QUARTER` | core | 256; the tick unit of the shared model. |
| `READING_DIAGNOSTIC_CODES` | core | The closed reading diagnostic codes. |
| `COMMAND_DIAGNOSTIC_CODES` | core | The closed command diagnostic codes. |
| `NOTICE_DIAGNOSTIC_CODES` | core | The closed notice diagnostic codes (`style-no-bpm`, `melody-with-chords`, `lyrics-unaligned`, `lyrics-too-long`). |
| `LYRICS_MAX_CHARACTERS` | core | 4000; the limit song2 generation accepts for the joined `lyrics` text. |
| `NOTICE_CODES` | core | The closed host message codes: `"command-refused"`, `"draft-source-changed"`, `"draft-save-failed"`. |
| `DRAFT_FORMAT_VERSION` | core | 1; the draft format this package writes and reads. |
| `VIEW_NAMES` | core | `["arrangement", "staff", "text"]`: the views of the default editor, in the order its switch lists them. |
| `song2Id` | song2 | `"song2"`. |
| `song2Constraints` | song2 | The `DialectConstraints` of the `song2` format. |
| `song2Dialect` | song2 | The `ScoreDialect` for `song2`: parse, serialize and check. |

## Mount and session types

| Export | What it is |
| --- | --- |
| `MountOptions` | `mount`'s options: project, dialects, language, editable, notify, drafts. |
| `MountedEditor` | `{ update(options), destroy() }`. |
| `Language` | `"zh" \| "en"`. |
| `Notice`, `NoticeCode` | A one-time host message and its machine-readable reason. |
| `SessionOptions` | `{ project, dialects, language?, editable?, activeView?, grid? }` for `createEditingSession`. |
| `EditingSession` | The headless editing session: project, reading, selection, insertion point, grid, view, shown view, rejected text, dispatch, tools, history, subscribe. |
| `ViewState` | `{ zoom, scrollLeft, language, editable }`, shared by parts and outside the history. |
| `InsertionPoint` | `{ tick }` or null. |
| `ScoreReading` | A readable score, unreadable text with diagnostics, or a model with no dialect. |
| `DispatchResult` | The project after a command plus its notices when `ok`, or the untouched project and a refusal. |
| `SessionChange`, `SessionChangeCause`, `SessionListener` | The notification shape (its flags, its cause, the `ProjectCommand` a dispatch made if any, and the `gridDropped` a project or registry change put back to 1/4), its causes, and the listener type. |
| `ViewName` | `"arrangement" \| "staff" \| "text"`: which view is shown. |
| `RejectedText` | `{ text, diagnostics }`: text the text view holds that the session did not take. |
| `ScoreCommand` | The dialect-agnostic edit union; each command and its refusal codes are listed in the package README. |
| `MoveNotesCommand`, `ResizeNotesCommand`, `MoveResizeCommand` | The note edits, and the union of the two; these are members of `ScoreCommand`. |
| `Grid`, `GridValue` | A time grid and the note values it offers: 4, 8, 16 or 32, with an optional dotted step. The session holds the one in force (`session.grid`, `setGrid`, `allowsGrid`); see [editing-session.md](editing-session.md). |
| `CommandListResult` | `{ ok, project, diagnostics }` from `applyCommandList`: the applied project, or the untouched one with the refusal. |
| `ProjectCommand` | The song-project edit union `applyProjectCommand` accepts besides `ScoreCommand` (`setStyle`, `setScoreMode`, `setSeed`, `replaceScoreText`, `setLyricLineText`, `insertLyricLine`, `deleteLyricLine`, `splitLyricLine`, `mergeLyricLines`, `setLyricLinePhrase`); each command is listed in the package README. |

## Score model types

| Export | What it is |
| --- | --- |
| `SongProject` | The document: lyrics, style, score text, score mode, seed, model id, source key, and optional `lyricLines`. |
| `Score` | A parsed score: tempo, optional `tempoChanges`, voices, bars, keys, sections, notes, chords, truncation, hasChords, unitTicks, source. |
| `Bar`, `Meter`, `Tempo`, `KeyChange` | The bar grid, meters, tempo and the key timeline. |
| `Note`, `Chord`, `Section`, `Truncation` | Notes and rests, chords, sections and a cut score's incomplete tail. |
| `LyricLine`, `LyricPhrase` | One lyric line with its text and phrase binding, and the run of bars the phrase covers. |
| `LyricAlignment`, `LyricSyllableNote` | A line's syllables, onsets and whether their counts are equal, and one syllable placed on its note. |

## Diagnostics types

| Export | What it is |
| --- | --- |
| `Diagnostic` | `{ code, params, at }`; carries no prose. |
| `DiagnosticAt`, `DiagnosticParams` | Where a diagnostic points and the values its text needs. |
| `DiagnosticCode` | The union of every reading, command and notice code. |
| `ReadingDiagnosticCode` | An element of `READING_DIAGNOSTIC_CODES`. |
| `CommandDiagnosticCode` | An element of `COMMAND_DIAGNOSTIC_CODES`. |
| `NoticeDiagnosticCode` | An element of `NOTICE_DIAGNOSTIC_CODES`. |

## Dialect types

| Export | What it is |
| --- | --- |
| `ScoreDialect` | `{ id, constraints, parse, serialize, check }`. |
| `DialectRegistry` | `find(modelId)`; built by `createDialectRegistry`, never global. |
| `ParseResult` | `{ score, diagnostics }`; score is null exactly on an error-level diagnostic. |
| `DialectConstraints` | The declared voices, keys, tempo, section marker, lyrics, durations, meter and chords. |
| `ChordVocabulary`, `DurationSet`, `MeterRule` | The chord vocabulary, accepted duration numbers and meter rule types. |

## Apply result types

| Export | What it is |
| --- | --- |
| `ApplyScoreResult` | `{ ok: true, text }` or `{ ok: false, diagnostic }`. |
| `ApplyProjectResult` | `{ project, diagnostics }`; the project keeps its old score text on a refusal. |

## View part types

| Export | What it is |
| --- | --- |
| `ViewPart` | `{ destroy() }`; safe to destroy twice. |
| `ProjectPanel` | A `ViewPart` with `element` and `commit()`: the song project panel's root, and the pending field a host takes when it closes its own container. |
| `StaffViewPart` | `ViewPart` plus `setPlayPosition(seconds \| null)`: the host player's cursor on the staff, cleared with null. |
| `AxisPartOptions` | `{ scroller?, onRefused? }` for the ruler, chord track and voice tracks. |
| `VoiceTrackOptions` | `AxisPartOptions` plus `voice`. |
| `ToolbarOptions` | `{ hintId?, onRefused?, viewSwitch?, synthPreview?, draftKeeper?, tempoKey?, projectPanel? }` for the toolbar. |
| `EditingInput` | One thing the user did, as data: a key, a click on a note, a click on empty space, a delete, a toggle of one note, a box of notes, select all, invert, or clear. |
| `EditingInputResult` | `{ handled, refused }`: whether the input meant something, and the diagnostics of an edit the score refused. |

## Tool types

| Export | What it is |
| --- | --- |
| `ScoreTool` | `{ id, name, parameters?, commands }`. |
| `ToolText` | A display name in both interface languages. |
| `ToolParameter` | One declaration: a `NumberToolParameter`, `BooleanToolParameter`, `ChoiceToolParameter` or `TextToolParameter`. |
| `NumberToolParameter` | A number with optional `min`, `max` and `step`. |
| `BooleanToolParameter` | A checkbox. |
| `ChoiceToolParameter` | A value from a fixed `values` list. |
| `TextToolParameter` | Free text. |
| `ToolParameterValue`, `ToolParameterValues` | One value, and values by parameter name. |
| `ToolCommandBuilder` | `(project, selection, values) => ScoreCommand[]`; pure. |
| `ToolParameterCheck` | The validated values, or the `tool-parameter` diagnostics. |
| `ToolResult` | `{ ok, project, diagnostics, commands }` from a preview or a run. |
| `ToolRegistry` | `register`, `list` and `find` for the host's tools. |

## Preview types

| Export | What it is |
| --- | --- |
| `PreviewPlayer` | `{ playing, tick, from, start(fromTick?), stop(), subscribe(listener) }`. |
| `PreviewStart` | What `start()` resolves: `"started"`, `"nothing-to-play"`, `"unsupported"`, `"blocked"` or `"cancelled"`. |
| `PreviewNoteOptions` | `{ duration? }` in seconds for `previewNote`. |
| `PreviewSchedule` | `{ events, fromTick, secondsPerTick, length }`; `secondsPerTick` is the opening tempo's. |
| `PreviewEvent` | A `PreviewNoteEvent` or a `PreviewChordEvent`. |
| `PreviewNoteEvent` | `{ kind: "note", voice, midi, at, length }`. |
| `PreviewChordEvent` | `{ kind: "chord", name, midis, at, length }`; `midis` is bass first. |

## Draft types

| Export | What it is |
| --- | --- |
| `ScoreDraft` | One saved edit: version, source key, source hash, `DraftProject`, handoff hash and update time. |
| `DraftProject` | The project fields a draft keeps: style, joined `lyrics`, `lyricLines`, score text, score mode and seed. |
| `DraftStore` | The host's storage: `read`, versioned `write`, versioned `remove`, `list`. |
| `DraftStoreEntry` | `{ text, version }`; the version is opaque and only handed back. |
| `DraftWriteResult` | `{ ok: true, version }` or `{ ok: false, reason: "conflict" \| "failed" }`. |
| `DraftKeeper` | `status`, `ready`, `subscribe`, `overwrite`, `loadTheirs`, `restoreOriginal`, `handoff`, `destroy`. |
| `DraftKeeperOptions` | `{ session, store, original, notify?, now?, debounceMs? }`. |
| `DraftKeeperChange` | `{ status }`, announced after a keeper status change. |
| `DraftKeeperStatus` | `"opening" \| "ready" \| "conflict" \| "destroyed"`. |
| `DraftHandoffResult` | `"written" \| "unchanged" \| "conflict" \| "failed"`. |

## Chord editing types

| Export | What it is |
| --- | --- |
| `ChordSlot` | `{ noteId, voice, start, duration, chord, before }`: a start a chord can go on, the chord there (or null) and the chord in force before it (or null). |
| `ChordChoices` | `{ letters, qualities, slashBass }`: what a picker offers. |
| `ChordLetter` | `{ letter, roots }`: one letter A-G and the root spellings the vocabulary has on it. |
| `ChordNameParts` | `{ root, quality, bass }`: a chord name split by a vocabulary; `bass` is null without a slash bass. |

## Filter types

| Export | What it is |
| --- | --- |
| `NoteFilter` | The conditions of `filterNotes`, each optional: `pitch`, `time`, `duration`, `key`, `count` and `invert`. |

## Section menu types

| Export | What it is |
| --- | --- |
| `SectionAction` | `{ name, command, unavailable }`: one action of a section, the command that does it (`null` for rename and start, which need a name first) and, when the command layer would refuse it, that refusal's `Diagnostic`. |
| `SectionActionName` | `"rename" \| "start" \| "move-earlier" \| "move-later" \| "duplicate" \| "delete"`, in the order a menu lists them. |

## Lyric track types

| Export | What it is |
| --- | --- |
| `LyricRow` | `{ index, line, phrase, alignment }`: one line as the track places it; `phrase` and `alignment` are null in the unaligned area. |
| `LyricEdge` | `"start" \| "end"`: which edge of a phrase is dragged. |
| `LyricBoundaryDrag` | `{ line, edge, tick }`: an edge dragged to a tick. |
| `LyricBoundaryMove` | `{ line, phrase }`: one phrase a drag changes. |
| `LyricBoundaryPlan` | `{ boundary, moves, commands }`: where the edge lands and what to send, in order. |
| `LyricDrop` | `{ line, tick }`: a line let go of over a tick. |
| `LyricDropPlan` | `{ phrase, free, commands }`: the phrase a drop gives, whether its bar is free, and the command. |
| `LyricSplit` | `{ line, offset }`: a caret, in code points, in a line's text. |

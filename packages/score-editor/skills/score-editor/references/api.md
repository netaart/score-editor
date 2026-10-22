# Public export index

Every public export of the two package entries, grouped by layer. A change that adds one updates this page in the same
change. The tests in the repository check that the list stays complete.

## Functions

| Export | Package | What it does |
| --- | --- | --- |
| `mount` | core | Mounts the default editor on an element; returns `MountedEditor`. |
| `createEditingSession` | core | Builds an `EditingSession` from a project and a `DialectRegistry`. |
| `mountToolbar` | core | Mounts the toolbar view part: title, zoom, and while editable undo, redo and Delete; takes `ToolbarOptions`. |
| `mountZoomControl` | core | Mounts the zoom control view part on `(el, session)`. |
| `mountCutNotice` | core | Mounts the cut-notice view part. |
| `mountProblemView` | core | Mounts the problem view part. |
| `mountTimeRuler` | core | Mounts the time-ruler view part; takes `AxisPartOptions`. |
| `mountChordTrack` | core | Mounts the chord-track view part; takes `AxisPartOptions`. |
| `mountVoiceTrack` | core | Mounts one voice track; takes `VoiceTrackOptions` with `voice`. |
| `mountTextView` | core | Mounts the text view part: the score text in a box, checked as it is typed, handed to the project when it reads. |
| `mountStaffView` | core | Mounts the staff view part: the score drawn by abcjs, read-only; abcjs is loaded by this call. |
| `mountStaleNotice` | core | Mounts the stale notice part: one sentence while the text view holds text the project did not take. |
| `mountViewSwitch` | core | Mounts the view switch part: three buttons that set the session's `activeView`. |
| `createDialectRegistry` | core | Builds a `DialectRegistry` lookup from an array of dialects. |
| `applyScoreCommand` | core | Applies one `ScoreCommand` to score text and checks it; returns `ApplyScoreResult`. |
| `applyProjectCommand` | core | Applies one `ScoreCommand` or `ProjectCommand` to a `SongProject`; returns `ApplyProjectResult`. |
| `formatDiagnostic` | core | Turns a `Diagnostic` into a sentence in `en` or `zh`. |
| `noteId` | core | Builds a note id from voice and start tick. |
| `createToolRegistry` | core | Builds a `ToolRegistry` from tools, refusing duplicates and malformed declarations. |
| `validateToolParameters` | core | Fills defaults and checks a tool's values; returns `ToolParameterCheck`. |
| `previewTool` | core | Computes a `ToolResult` without a session. |
| `handleEditingInput` | core | Does what a part does with one `EditingInput` (a key, a click on a note, a click on empty space, a delete) to a session; returns `EditingInputResult`. |

## Constants and values

| Export | Package | What it is |
| --- | --- | --- |
| `TICKS_PER_QUARTER` | core | 256; the tick unit of the shared model. |
| `READING_DIAGNOSTIC_CODES` | core | The closed reading diagnostic codes. |
| `COMMAND_DIAGNOSTIC_CODES` | core | The closed command diagnostic codes. |
| `NOTICE_CODES` | core | The closed notice codes; today `"command-refused"`. |
| `VIEW_NAMES` | core | `["arrangement", "staff", "text"]`: the views of the default editor, in the order its switch lists them. |
| `song2Id` | song2 | `"song2"`. |
| `song2Constraints` | song2 | The `DialectConstraints` of the `song2` format. |
| `song2Dialect` | song2 | The `ScoreDialect` for `song2`: parse, serialize and check. |

## Mount and session types

| Export | What it is |
| --- | --- |
| `MountOptions` | `mount`'s options: project, dialects, language, editable, notify. |
| `MountedEditor` | `{ update(options), destroy() }`. |
| `Language` | `"zh" \| "en"`. |
| `Notice`, `NoticeCode` | A one-time host message and its machine-readable reason. |
| `SessionOptions` | `{ project, dialects, language?, editable?, activeView? }` for `createEditingSession`. |
| `EditingSession` | The headless editing session: project, reading, selection, insertion point, view, shown view, rejected text, dispatch, tools, history, subscribe. |
| `ViewState` | `{ zoom, scrollLeft, language, editable }`, shared by parts and outside the history. |
| `InsertionPoint` | `{ tick }` or null. |
| `ScoreReading` | A readable score, unreadable text with diagnostics, or a model with no dialect. |
| `DispatchResult` | The project after a command plus any diagnostics, or the untouched project and a refusal. |
| `SessionChange`, `SessionChangeCause`, `SessionListener` | The notification shape (its flags, its cause, and the `ProjectCommand` a dispatch made, if any), its causes, and the listener type. |
| `ViewName` | `"arrangement" \| "staff" \| "text"`: which view is shown. |
| `RejectedText` | `{ text, diagnostics }`: text the text view holds that the session did not take. |
| `ScoreCommand` | The dialect-agnostic edit union; today `{ type: "toRest", noteId }`. |
| `ProjectCommand` | The edits of the project that are not edits of a parsed score; today `{ type: "replaceScoreText", text }`. |

## Score model types

| Export | What it is |
| --- | --- |
| `SongProject` | The document: lyrics, style, score text, score mode, seed, model id, source key. |
| `Score` | A parsed score: tempo, voices, bars, keys, sections, notes, chords, truncation, hasChords, source. |
| `Bar`, `Meter`, `Tempo`, `KeyChange` | The bar grid, meters, tempo and the key timeline. |
| `Note`, `Chord`, `Section`, `Truncation` | Notes and rests, chords, sections and a cut score's incomplete tail. |

## Diagnostics types

| Export | What it is |
| --- | --- |
| `Diagnostic` | `{ code, params, at }`; carries no prose. |
| `DiagnosticAt`, `DiagnosticParams` | Where a diagnostic points and the values its text needs. |
| `DiagnosticCode` | The union of every reading and command code. |
| `ReadingDiagnosticCode` | An element of `READING_DIAGNOSTIC_CODES`. |
| `CommandDiagnosticCode` | An element of `COMMAND_DIAGNOSTIC_CODES`. |

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
| `AxisPartOptions` | `{ scroller?, onRefused? }` for the ruler, chord track and voice tracks. |
| `VoiceTrackOptions` | `AxisPartOptions` plus `voice`. |
| `ToolbarOptions` | `{ hintId?, onRefused?, viewSwitch? }` for the toolbar. |
| `EditingInput` | One thing the user did, as data: a key, a click on a note, a click on empty space, or a delete. |
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

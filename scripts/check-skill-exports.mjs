// ABOUTME: The export-coverage check of the editor skill: every public export of either package entry must be named as code in the skill.
// ABOUTME: It also checks the skill folder/name, the API index, all examples' version pins, and that SKILL.md stays under 500 lines.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const skillDir = join(root, "packages/score-editor/skills/score-editor");
const apiPath = "references/api.md";
const entries = [
  { package: "@neta-art/score-editor", file: join(root, "packages/score-editor/src/index.ts") },
  { package: "@neta-art/score-dialect-song2", file: join(root, "packages/score-dialect-song2/src/index.ts") },
];

const program = ts.createProgram(
  entries.map((entry) => entry.file),
  {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  },
);
const checker = program.getTypeChecker();

function exportedNames(entry) {
  const source = program.getSourceFile(entry.file);
  if (!source) throw new Error(`Cannot read the entry ${entry.file}`);
  const symbol = checker.getSymbolAtLocation(source);
  if (!symbol) throw new Error(`Cannot read the exports of ${entry.file}`);
  return checker.getExportsOfModule(symbol).map((found) => found.getName());
}

function skillFiles(dir = skillDir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((found) => {
    const path = join(dir, found.name);
    return found.isDirectory() ? skillFiles(path) : [path];
  });
}

/** The code in a file: Markdown code spans and fences, or the identifiers of a JavaScript example. */
function codeIn(file) {
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".md")) {
    const chunks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]);
    for (const match of text.matchAll(/`([^`\n]+)`/g)) chunks.push(match[1]);
    return chunks.join("\n");
  }
  if (/\.m?js$/.test(file)) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const names = [];
    const visit = (node) => {
      if (ts.isIdentifier(node)) names.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    return names.join("\n");
  }
  return "";
}

const files = skillFiles().map((file) => ({
  path: relative(skillDir, file).split(sep).join("/"),
  code: codeIn(file),
}));
const api = files.find((file) => file.path === apiPath);
if (!api) throw new Error(`No ${apiPath} in ${skillDir}`);
const mentions = (code, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`).test(code);
};
/** The reference that owns each export; every public name must be in api.md and in its owner. */
const ownerGroups = {
  "references/headless-layer.md": [
    "ApplyProjectResult",
    "ApplyScoreResult",
    "CommandListResult",
    "applyCommandList",
    "applyProjectCommand",
    "applyScoreCommand",
    "ScoreCommand",
    "CommandDiagnosticCode",
    "Diagnostic",
    "DiagnosticAt",
    "DiagnosticCode",
    "DiagnosticParams",
    "ReadingDiagnosticCode",
    "COMMAND_DIAGNOSTIC_CODES",
    "formatDiagnostic",
    "COMMON_METERS",
    "meterAllowed",
    "meterChoices",
    "READING_DIAGNOSTIC_CODES",
    "ParseResult",
    "ScoreDialect",
    "createDialectRegistry",
    "Bar",
    "Chord",
    "KeyChange",
    "Meter",
    "Note",
    "Score",
    "Section",
    "SongProject",
    "Tempo",
    "Truncation",
    "noteId",
    "TICKS_PER_QUARTER",
    "ChordVocabulary",
    "DialectConstraints",
    "DurationSet",
    "Language",
    "MeterRule",
    "Notice",
    "NoticeCode",
    "NOTICE_CODES",
    "ProjectCommand",
    "schedulePreview",
    "tickAtSeconds",
    "PreviewSchedule",
    "PreviewEvent",
    "PreviewNoteEvent",
    "PreviewChordEvent",
    "ChordSlot",
    "chordSlots",
    "nearestChordSlot",
    "ChordChoices",
    "ChordLetter",
    "ChordNameParts",
    "chordChoices",
    "splitChordName",
    "LyricRow",
    "LyricEdge",
    "LyricBoundaryDrag",
    "LyricBoundaryMove",
    "LyricBoundaryPlan",
    "LyricDrop",
    "LyricDropPlan",
    "LyricSplit",
    "lyricRows",
    "lyricBoundaryPlan",
    "lyricDropPlan",
    "lyricSplitCommand",
    "barLineTick",
    "AddNoteCommand",
    "CopiedNote",
    "PasteNotesCommand",
    "DuplicateNotesCommand",
    "CopyNotesCommand",
    "VoiceOctaveCommand",
    "InstrumentalVersionCommand",
    "VoiceCommand",
    "VoiceOctaveReport",
    "InstrumentalReport",
    "CommandReport",
  ],
  "references/editing-session.md": [
    "createEditingSession",
    "DispatchResult",
    "EditingSession",
    "BarSelection",
    "InsertionPoint",
    "ScoreReading",
    "SessionChange",
    "SessionChangeCause",
    "SessionListener",
    "SessionOptions",
    "ViewState",
    "RejectedText",
    "ViewName",
    "VIEW_NAMES",
  ],
  "references/view-parts.md": [
    "AxisPartOptions",
    "EditingInput",
    "EditingInputResult",
    "ToolbarOptions",
    "ToolbarPart",
    "ViewPart",
    "ProjectPanel",
    "ProjectPanelOptions",
    "StaffViewPart",
    "VoiceTrackOptions",
    "handleEditingInput",
    "mountChordTrack",
    "mountCutNotice",
    "mountProblemView",
    "mountTimeRuler",
    "mountToolbar",
    "mountVoiceTrack",
    "mountZoomControl",
    "mountTextView",
    "mountStaffView",
    "mountStaleNotice",
    "mountViewSwitch",
    "mountSynthPreview",
    "previewPlayer",
    "previewNote",
    "PreviewPlayer",
    "PreviewStart",
    "PreviewNoteOptions",
    "mountLyricTrack",
    "LyricTrackPart",
    "mountDraftConflict",
  ],
  "references/mount.md": [
    "mount",
    "MountedEditor",
    "MountOptions",
    "GeneratedScoreSource",
    "ScoreSource",
    "ScoreFileSource",
    "ScoreFileEntry",
    "ScoreFileSaveResult",
    "ProjectField",
    "RequiredInput",
  ],
  "references/score-files.md": [
    "createScoreFileKeeper",
    "ScoreFileKeeper",
    "ScoreFileKeeperChange",
    "ScoreFileKeeperOptions",
    "ScoreFileKeeperStatus",
    "ScoreFileHandoffResult",
  ],
  "references/custom-tools.md": [
    "BooleanToolParameter",
    "ChoiceToolParameter",
    "NumberToolParameter",
    "ScoreTool",
    "TextToolParameter",
    "ToolCommandBuilder",
    "ToolParameter",
    "ToolParameterCheck",
    "ToolParameterValue",
    "ToolParameterValues",
    "ToolRegistry",
    "ToolResult",
    "ToolText",
    "createToolRegistry",
    "previewTool",
    "validateToolParameters",
  ],
  "references/handoff.md": [
    "ChangeLogOptions",
    "HandoffInstructionOptions",
    "HandoffPayload",
    "changeLog",
    "handoffInstruction",
  ],
  "references/drafts.md": [
    "DRAFT_FORMAT_VERSION",
    "DraftHandoffResult",
    "DraftKeeper",
    "DraftKeeperChange",
    "DraftKeeperOptions",
    "DraftKeeperStatus",
    "DraftProject",
    "DraftStore",
    "DraftStoreEntry",
    "DraftWriteResult",
    "ScoreDraft",
    "contentHash",
    "createDraftKeeper",
    "draftText",
    "readDraft",
  ],
  "references/dialect-registry.md": ["DialectRegistry", "song2Constraints", "song2Dialect", "song2Id"],
};
const ownerOf = new Map();
for (const [reference, names] of Object.entries(ownerGroups)) {
  for (const name of names) ownerOf.set(name, reference);
}
const byPath = new Map(files.map((file) => [file.path, file]));

let failed = false;
for (const entry of entries) {
  const names = exportedNames(entry);
  const missing = names.filter((name) => {
    const owner = ownerOf.get(name);
    const covered = owner
      ? mentions(byPath.get(owner)?.code ?? "", name)
      : files.some(
          (file) =>
            (file.path.startsWith("references/") || file.path.startsWith("assets/")) &&
            file.path !== apiPath &&
            file.path !== "SKILL.md" &&
            mentions(file.code, name),
        );
    return !mentions(api.code, name) || !covered;
  });
  if (missing.length > 0) {
    failed = true;
    console.error(`${entry.package}: ${missing.length} public export(s) not covered as code in the skill:`);
    console.error(`  ${missing.join(", ")}`);
    console.error(`Name each one in ${apiPath} and in its layer or extension reference, or in an example.`);
  } else {
    console.log(
      `${entry.package}: all ${names.length} public exports are code-mentioned in api.md and their reference`,
    );
  }
}

const skillText = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const folder = basename(skillDir);
const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skillText)?.[1] ?? "";
const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
if (name !== folder) {
  failed = true;
  console.error(`SKILL.md names "${name}", but its folder is "${folder}"`);
}
const lines = skillText.split("\n").length;
if (lines >= 500) {
  failed = true;
  console.error(`SKILL.md has ${lines} lines; the Agent Skills specification asks for under 500`);
}

const version = JSON.parse(readFileSync(join(root, "packages/score-editor/package.json"), "utf8")).version;
const exampleSources = [
  { name: "static", file: "assets/static-esm/main.js" },
  { name: "edit-one-bar", file: "assets/edit-one-bar/main.js" },
];
for (const example of exampleSources) {
  const source = readFileSync(join(skillDir, example.file), "utf8");
  const pins = ["score-editor", "score-dialect-song2"].map((packageName) => {
    const pattern = new RegExp(`https://esm\\.sh/@neta-art/${packageName}@([^?"\\s]+)\\?bundle&target=es2022`);
    return { packageName, pin: pattern.exec(source)?.[1] };
  });
  for (const { packageName, pin } of pins) {
    if (pin !== version) {
      failed = true;
      console.error(`The ${example.name} example pins ${packageName}@${pin ?? "(none)"}, the package is ${version}`);
    }
  }
}

const bundlerPins = JSON.parse(readFileSync(join(skillDir, "assets/pnpm-bundler/package.json"), "utf8")).dependencies;
for (const packageName of ["@neta-art/score-editor", "@neta-art/score-dialect-song2"]) {
  if (bundlerPins[packageName] !== version) {
    failed = true;
    console.error(`The bundler example pins ${packageName}@${bundlerPins[packageName]}, the package is ${version}`);
  }
}
if (!failed) console.log(`All examples pin the package version ${version} exactly.`);

process.exit(failed ? 1 : 0);

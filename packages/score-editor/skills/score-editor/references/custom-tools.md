# Custom tools

Use a custom tool when an edit should be repeated, parameterised, previewed, or shown in the Tools panel. A tool is
pure data plus a pure function: it never touches a session, a view part or the DOM, so the same tool runs in a test, a
worker or a panel. A tool produces `ScoreCommand`s, which means its edits go through the same command layer as a
direct edit, run the dialect's `check` on every step, and undo as one step when run through a session.

## The tool

```ts
import type { ScoreTool, ToolParameter } from "@neta-art/score-editor";

const every: ToolParameter = {
  name: "every",
  label: { en: "Rest every Nth", zh: "每隔 N 个音变休止" },
  type: "number",
  min: 2,
  max: 8,
  step: 1,
  default: 2,
};

const restEveryNth: ScoreTool = {
  id: "rest-every-nth",
  name: { en: "Rest every Nth note", zh: "每隔 N 个音变休止" },
  parameters: [every],
  commands(_project, selection, values) {
    const step = values.every as number;
    return selection
      .filter((_id, index) => (index + 1) % step === 0)
      .map((noteId) => ({ type: "toRest", noteId }));
  },
};
```

`ScoreTool` is `{ id, name, description?, group?, parameters?, commands }`. `ToolText` is
`Readonly<Record<Language, string>>`; a name has both languages. `description` is one line the panel shows under the
name. `group` is a `ToolGroup`: `"note"`, `"quantize"`, `"transform"`, `"generate"`, or `"more"` for a tool that does not
fit the four (a tool without a group is listed under More tools). `TOOL_GROUPS` is the four groups without `"more"`.

`ToolCommandBuilder` is `(project, selection, values, context?) => ReadonlyArray<ScoreCommand>`; it is pure and reads
nothing else. Every tool is called with a `ToolContext`, `{ grid, insertionPoint }`, as its fourth argument: the grid
in force in the session and the insertion point's tick (or null). A function written with three parameters ignores it, as a
tool written before the argument existed did, and one written with a default or rest parameters still receives it. A
preview without a session takes the context as its last argument:
`previewTool(tool, project, selection, values, dialects, context)`; without it the context is 1/4 and no insertion
point.

`ToolParameter` is one of four declarations:

| Type | Shape |
| --- | --- |
| `NumberToolParameter` | `{ type: "number", name, label?, default, min?, max?, step? }` |
| `BooleanToolParameter` | `{ type: "boolean", name, label?, default }` |
| `ChoiceToolParameter` | `{ type: "choice", name, label?, default, values }`; `values` is the allowed list |
| `TextToolParameter` | `{ type: "text", name, label?, default }` |

`ToolParameterValue` is `string | number | boolean`; `ToolParameterValues` is a record of those by parameter name. A
missing value takes its declaration's default. `validateToolParameters(tool, values)` returns `ToolParameterCheck`:
either `{ ok: true, values }` with defaults filled, or `{ ok: false, diagnostics }` with a `tool-parameter` diagnostic
for a wrong type, an out-of-range number or a value outside a choice.

## The registry

`createToolRegistry(tools = [])` returns a `ToolRegistry` with `register(tool)`, `list()` (registration order) and
`find(id)`. `register` throws on a second id or a malformed declaration: a tool without a `commands` builder, an
unknown parameter type, a `choice` without values, or a default its own declaration refuses. A tool passed straight to
`previewTool` or `runTool` without a registry does not run: the call returns a `ToolResult` with a `tool-parameter`
diagnostic and never `ok: true`.

```ts
import { createToolRegistry } from "@neta-art/score-editor";

const tools = createToolRegistry([restEveryNth]);
const found = tools.find("rest-every-nth");
const all = tools.list();
```

The Tools panel reads `tools.list()` and draws one control per declaration in the session's language: a number field
with `min`/`max`/`step`, a checkbox for a boolean, a menu of `values` for a choice, a text field for text. A parameter
without a `label` shows its `name`. A host gets the panel with `mount({ tools })`, `mountToolbar({ tools })` or
`mountToolPanel`; the built-in note tools (`NOTE_TOOLS`) are always listed. See
[view-parts.md](view-parts.md#the-tools-panel).

## Preview and run

Without a session, `previewTool(tool, project, selection, values, dialects)` returns a `ToolResult` computed against
the given project and selection. With a session, `session.previewTool(tool, values?)` does the same against the
session's state and `session.runTool(tool, values?)` applies it.

`ToolResult` is `{ ok, project, diagnostics, commands }` in both cases. A preview changes nothing, adds no history
step and notifies nobody. A run applies all commands as one history step: one undo goes back to the project before the
run; if any step fails, the run is refused, the result carries that step's diagnostic, and project and history stay
as they were. A step that comes back with a notice (`isNoticeDiagnostic`) does not fail the run: the result is `ok`, its
`diagnostics` hold each notice once, and the project is the one the commands made.

```ts
const preview = session.previewTool(restEveryNth, { every: 2 });
if (preview.ok) showNewScoreText(preview.project.score);

const result = session.runTool(restEveryNth, { every: 2 });
if (!result.ok) showProblems(result.diagnostics);
else save(session.project); // one undo step, already applied
```

A result that breaks the score's rules is refused whole too: one note at a time in a voice, and every note the tool
creates or changes starting and ending on the grid in force. That refusal is the `tool-result` command diagnostic, with
the tool's id and `reason` `"overlap"` or `"grid"`; the project and the history stay as they were. The check compares
the result with the project it started from, so an untouched off-grid note the tool did not write is not the tool's
fault.

Parameter errors use the `tool-parameter` command diagnostic. A refused command uses its own command diagnostic code.
In both cases `formatDiagnostic` gives text in the current language; see [headless-layer.md](headless-layer.md).

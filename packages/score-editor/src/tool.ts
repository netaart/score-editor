// ABOUTME: The custom tool contract: a named, parameterised, pure function from a song project and a selection to commands.
// ABOUTME: Tools never touch a session or the DOM; the session and the preview apply the commands their function returns.
import { applyProjectCommand } from "./apply";
import type { ScoreCommand } from "./commands";
import { type Grid, gridStepOf } from "./commands-notes";
import type { ProjectCommand } from "./commands-project";
import { type Diagnostic, isNoticeDiagnostic } from "./diagnostics";
import type { DialectRegistry, ScoreDialect } from "./dialect";
import type { Score, SongProject } from "./score";
import type { Language } from "./types";

/** A tool's display name in both interface languages. */
export type ToolText = Readonly<Record<Language, string>>;

/** The groups the Tools panel lists: the spec's four, and the one a tool without a group falls into. */
export const TOOL_GROUPS = ["note", "quantize", "transform", "generate"] as const;

/** A group of the Tools panel. A tool declared without one is listed under "more", which the panel shows only when it has a tool. */
export type ToolGroup = (typeof TOOL_GROUPS)[number] | "more";

/**
 * The UI state a tool may read besides its own arguments. It is passed to the commands builder, never read from a session,
 * so a tool stays a pure function: the grid the result lands on, and the insertion point a split uses.
 */
export interface ToolContext {
  readonly grid: Grid;
  /** The tick of the session's insertion point, or null when none is placed. */
  readonly insertionPoint: number | null;
  /** The 1-based first bar of the selected notes, or null when notes in no bar are selected. */
  readonly selectionFirstBar?: number | null;
  /** The 1-based last bar of the selected notes, or null when notes in no bar are selected. */
  readonly selectionLastBar?: number | null;
}

const DEFAULT_TOOL_CONTEXT: ToolContext = { grid: { value: 4 }, insertionPoint: null };

/** The value a tool parameter can carry. */
export type ToolParameterValue = string | number | boolean;

/** All parameter values a tool is run with, by parameter name. A missing key takes the declaration's default. */
export type ToolParameterValues = Readonly<Record<string, ToolParameterValue | undefined>>;

/** A default computed from the UI state the tool may read, such as the bars of the selection. */
export type ToolDefault = (context: ToolContext) => ToolParameterValue;

interface ParameterBase {
  readonly name: string;
  /** A label for the panel; when absent the panel shows the name. */
  readonly label?: ToolText;
  readonly default: ToolParameterValue | ToolDefault;
}

export interface NumberToolParameter extends ParameterBase {
  readonly type: "number";
  readonly default: number | ToolDefault;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface BooleanToolParameter extends ParameterBase {
  readonly type: "boolean";
  readonly default: boolean | ToolDefault;
}

/** A choice from a fixed list, the list being the allowed values. */
export interface ChoiceToolParameter extends ParameterBase {
  readonly type: "choice";
  readonly default: string | ToolDefault;
  readonly values: ReadonlyArray<string>;
}

/** Free text, with no range of its own. */
export interface TextToolParameter extends ParameterBase {
  readonly type: "text";
  readonly default: string | ToolDefault;
}

/** One parameter a tool declares: its name, type, range or allowed values, and default. */
export type ToolParameter = NumberToolParameter | BooleanToolParameter | ChoiceToolParameter | TextToolParameter;

/** Builds the commands a tool would produce. It is pure: it reads its arguments and nothing else. */
export type ToolCommandBuilder = (
  project: SongProject,
  selection: ReadonlyArray<string>,
  values: ToolParameterValues,
  context: ToolContext,
) => ReadonlyArray<ScoreCommand>;

/** A custom tool: identity, display name, optional parameter declaration, and the pure function that builds its commands. */
export interface ScoreTool {
  readonly id: string;
  readonly name: ToolText;
  /** One muted line under the name in the panel, saying what the tool does and what it needs. */
  readonly description?: ToolText;
  /** The group the panel lists it under; absent means "more". */
  readonly group?: ToolGroup;
  readonly parameters?: ReadonlyArray<ToolParameter>;
  readonly commands: ToolCommandBuilder;
}

/** The tools a host registered, by id. Registering an id twice is an error, so a panel never shows two tools alike. */
export interface ToolRegistry {
  /** Adds a tool. It throws when the id is taken or the tool's declaration is malformed. */
  register(tool: ScoreTool): void;
  /** Every registered tool, in registration order. */
  list(): ReadonlyArray<ScoreTool>;
  /** The tool with this id, or `undefined`. */
  find(id: string): ScoreTool | undefined;
}

/** The declared default, computed when it is a function of the context. */
export function toolParameterDefault(parameter: ToolParameter, context: ToolContext): ToolParameterValue {
  return typeof parameter.default === "function" ? parameter.default(context) : parameter.default;
}

function declarationError(tool: ScoreTool): string | undefined {
  if (typeof tool.commands !== "function") return `A tool with the id "${tool.id}" has no commands builder.`;
  if (tool.parameters !== undefined && !Array.isArray(tool.parameters)) {
    return `A tool with the id "${tool.id}" has a parameter declaration that is not an array.`;
  }

  for (const parameter of tool.parameters ?? []) {
    const type = (parameter as { readonly type?: unknown }).type;
    switch (type) {
      case "number":
      case "boolean":
      case "text":
        break;
      case "choice":
        if (!Array.isArray(parameter.values) || parameter.values.length === 0) {
          return `A tool with the id "${tool.id}" declares a choice parameter "${parameter.name}" without values.`;
        }
        break;
      default:
        return `A tool with the id "${tool.id}" declares a parameter "${parameter.name}" with an unknown type "${String(type)}".`;
    }
  }

  const checked = validateToolParameters(tool, {});
  if (!checked.ok) {
    const parameter = checked.diagnostics[0]?.params.parameter;
    return `A tool with the id "${tool.id}" declares a default for "${String(parameter)}" that its declaration refuses.`;
  }
  return undefined;
}

class ToolRegistryStore implements ToolRegistry {
  readonly #byId = new Map<string, ScoreTool>();
  readonly #order: ScoreTool[] = [];

  register(tool: ScoreTool): void {
    if (this.#byId.has(tool.id)) throw new Error(`A tool with the id "${tool.id}" is already registered.`);
    const malformed = declarationError(tool);
    if (malformed !== undefined) throw new Error(malformed);
    this.#byId.set(tool.id, tool);
    this.#order.push(tool);
  }

  list(): ReadonlyArray<ScoreTool> {
    return [...this.#order];
  }

  find(id: string): ScoreTool | undefined {
    return this.#byId.get(id);
  }
}

/** Builds a registry, optionally from tools the host already has. A duplicate id or a malformed tool is an error. */
export function createToolRegistry(tools: ReadonlyArray<ScoreTool> = []): ToolRegistry {
  const registry = new ToolRegistryStore();
  for (const tool of tools) registry.register(tool);
  return registry;
}

export type ToolParameterCheck =
  | { readonly ok: true; readonly values: ToolParameterValues }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<Diagnostic> };

function valueProblem(
  parameter: ToolParameter,
  value: ToolParameterValue | undefined,
): "type" | "range" | "value" | undefined {
  switch (parameter.type) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return "type";
      if (
        (parameter.min !== undefined && value < parameter.min) ||
        (parameter.max !== undefined && value > parameter.max)
      ) {
        return "range";
      }
      return undefined;
    case "boolean":
      return typeof value === "boolean" ? undefined : "type";
    case "choice":
      if (typeof value !== "string") return "type";
      if (!Array.isArray(parameter.values) || !parameter.values.includes(value)) return "value";
      return undefined;
    case "text":
      return typeof value === "string" ? undefined : "type";
    default:
      return "type";
  }
}

function parameterDiagnostic(
  tool: ScoreTool,
  parameter: ToolParameter,
  reason: "type" | "range" | "value",
  value: unknown,
): Diagnostic {
  const params: Record<string, string | number | boolean> = {
    toolId: tool.id,
    parameter: parameter.name,
    type: (parameter as { readonly type?: unknown }).type as string,
    reason,
  };
  if (parameter.type === "number") {
    if (parameter.min !== undefined) params.min = parameter.min;
    if (parameter.max !== undefined) params.max = parameter.max;
  }
  if (parameter.type === "choice" && Array.isArray(parameter.values)) {
    params.values = parameter.values.join(", ");
  }
  if (value !== undefined) params.value = typeof value === "number" && Number.isNaN(value) ? "NaN" : String(value);
  return { code: "tool-parameter", params, at: {} };
}

function commandsDiagnostic(tool: ScoreTool): Diagnostic {
  return { code: "tool-parameter", params: { toolId: tool.id, reason: "commands" }, at: {} };
}

/** Checks and fills a tool's parameters. Defaults fill missing names; wrong types and out-of-range values are refused. */
export function validateToolParameters(
  tool: ScoreTool,
  values: ToolParameterValues = {},
  context: ToolContext = DEFAULT_TOOL_CONTEXT,
): ToolParameterCheck {
  const filled: Record<string, ToolParameterValue> = {};
  const diagnostics: Diagnostic[] = [];

  for (const parameter of tool.parameters ?? []) {
    const given = values[parameter.name];
    const value = given === undefined ? toolParameterDefault(parameter, context) : given;
    const problem = valueProblem(parameter, value);
    if (problem === undefined) filled[parameter.name] = value as ToolParameterValue;
    else diagnostics.push(parameterDiagnostic(tool, parameter, problem, value));
  }

  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, values: filled };
}

/**
 * What a preview or a run came to: the project the commands make, or the diagnostic of the step that refused. A run that
 * took the commands can still carry notices, the diagnostics `isNoticeDiagnostic` names; they describe the project it
 * made, which is usable, and are not a refusal.
 */
export type ToolResult =
  | {
      readonly ok: true;
      readonly project: SongProject;
      readonly diagnostics: ReadonlyArray<Diagnostic>;
      readonly commands: ReadonlyArray<ScoreCommand>;
    }
  | {
      readonly ok: false;
      readonly project: SongProject;
      readonly diagnostics: ReadonlyArray<Diagnostic>;
      readonly commands: ReadonlyArray<ScoreCommand>;
    };

interface ToolRequest {
  readonly project: SongProject;
  readonly selection: ReadonlyArray<string>;
  readonly values: ToolParameterValues;
}

function dialectOf(project: SongProject, source: DialectRegistry | ScoreDialect): ScoreDialect | undefined {
  return "find" in source ? source.find(project.modelId) : source;
}

/** The one no-dialect diagnostic the session and the tool path report. */
export function noDialectDiagnostic(modelId: string): Diagnostic {
  return { code: "no-dialect", params: { modelId }, at: {} };
}

/**
 * What a list of commands came to. When `ok`, `project` is the project they make and `diagnostics` holds the notices of
 * the steps, each once, in the order they came. Otherwise `project` is the project as it was and `diagnostics` holds the
 * refusal of the step that failed; a notice is not carried with a refusal, since it describes a project that was not made.
 */
export interface CommandListResult {
  readonly ok: boolean;
  readonly project: SongProject;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

/**
 * Applies a list of commands to a local project. A notice does not stop the list: the changed project is kept, the notice
 * is collected, and the next command goes on from it. Any other diagnostic refuses the whole list and leaves the input
 * untouched.
 */
export function applyCommandList(
  dialect: ScoreDialect,
  project: SongProject,
  commands: ReadonlyArray<ScoreCommand | ProjectCommand>,
): CommandListResult {
  let next = project;
  const notices: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const command of commands) {
    const applied = applyProjectCommand(dialect, next, command);
    const refusals = applied.diagnostics.filter((diagnostic) => !isNoticeDiagnostic(diagnostic));
    if (refusals.length > 0) return { ok: false, project, diagnostics: refusals };
    next = applied.project;
    for (const notice of applied.diagnostics) {
      const key = JSON.stringify([notice.code, notice.params, notice.at]);
      if (seen.has(key)) continue;
      seen.add(key);
      notices.push(notice);
    }
  }
  return { ok: true, project: next, diagnostics: notices };
}

function failure(
  project: SongProject,
  diagnostics: ReadonlyArray<Diagnostic>,
  commands: ReadonlyArray<ScoreCommand>,
): ToolResult {
  return { ok: false, project, diagnostics, commands };
}

/** One pitched tie chain of a score: the note as a person sees it, from the start of its first piece to the end of its last. */
interface ToolSpan {
  readonly voice: string;
  readonly start: number;
  readonly end: number;
  readonly midi: number;
}

function pitchedSpans(score: Score): ToolSpan[] {
  const spans: ToolSpan[] = [];
  for (const voice of score.voices) {
    const notes = score.notes
      .filter((note) => note.voice === voice && note.midi !== null)
      .sort((a, b) => a.start - b.start);
    for (let index = 0; index < notes.length; index += 1) {
      const first = notes[index] as (typeof notes)[number];
      let last = first;
      while (last.tie) {
        const next = notes[index + 1];
        if (next === undefined || next.start !== last.start + last.duration || next.midi !== last.midi) break;
        index += 1;
        last = next;
      }
      spans.push({ voice, start: first.start, end: last.start + last.duration, midi: first.midi as number });
    }
  }
  return spans;
}

function spanKey(span: ToolSpan): string {
  return `${span.voice}:${span.start}:${span.end}:${span.midi}`;
}

/**
 * A tool's result must keep the score's rules the commands already keep for their own edits: one note at a time in a
 * voice, and every note it creates or changes starting and ending on the grid in force. A tool that composes commands in
 * a way that breaks either is refused whole, so the score and its history stay as they were.
 */
function toolResultDiagnostic(
  tool: ScoreTool,
  before: SongProject,
  after: SongProject,
  dialect: ScoreDialect,
  context: ToolContext,
): Diagnostic | undefined {
  const read = dialect.parse(after.score);
  const score = read.score;
  if (score === null) return undefined;
  const spans = pitchedSpans(score);

  let reached = -1;
  let voice = "";
  for (const span of [...spans].sort((a, b) => a.voice.localeCompare(b.voice) || a.start - b.start)) {
    if (span.voice !== voice) {
      voice = span.voice;
      reached = -1;
    }
    if (span.start < reached) {
      return {
        code: "tool-result",
        params: { toolId: tool.id, toolName: tool.name.en, toolNameZh: tool.name.zh, reason: "overlap" },
        at: {},
      };
    }
    reached = Math.max(reached, span.end);
  }

  const step = gridStepOf(context.grid);
  if (step === null) return undefined;
  const original = dialect.parse(before.score).score;
  const known = new Set(original === null ? [] : pitchedSpans(original).map(spanKey));
  for (const span of spans) {
    if (known.has(spanKey(span))) continue;
    if (span.start % step !== 0 || (span.end - span.start) % step !== 0) {
      return {
        code: "tool-result",
        params: { toolId: tool.id, toolName: tool.name.en, toolNameZh: tool.name.zh, reason: "grid" },
        at: {},
      };
    }
  }
  return undefined;
}

/** Validates, builds once, resolves the dialect, and applies the commands: the path a preview and a run share. */
export function applyToolRequest(
  tool: ScoreTool,
  request: ToolRequest,
  source: DialectRegistry | ScoreDialect,
  context: ToolContext = DEFAULT_TOOL_CONTEXT,
): ToolResult {
  const checked = validateToolParameters(tool, request.values, context);
  if (!checked.ok) return failure(request.project, checked.diagnostics, []);
  if (typeof tool.commands !== "function") return failure(request.project, [commandsDiagnostic(tool)], []);

  // Every tool is called with the context, whatever its declared arity: a JavaScript function written with three
  // parameters ignores a fourth argument, and a tool written with a default or rest parameters still receives it.
  const commands = tool.commands(request.project, request.selection, checked.values, context);
  const dialect = dialectOf(request.project, source);
  if (dialect === undefined) return failure(request.project, [noDialectDiagnostic(request.project.modelId)], commands);

  const applied = applyCommandList(dialect, request.project, commands);
  if (!applied.ok) return failure(request.project, applied.diagnostics, commands);
  const problem = toolResultDiagnostic(tool, request.project, applied.project, dialect, context);
  if (problem !== undefined) return failure(request.project, [problem], commands);
  return { ok: true, project: applied.project, diagnostics: applied.diagnostics, commands };
}

/** What running a tool would make, computed without a session. Invalid parameters and a failing step return diagnostics. */
export function previewTool(
  tool: ScoreTool,
  project: SongProject,
  selection: ReadonlyArray<string>,
  values: ToolParameterValues,
  source: DialectRegistry | ScoreDialect,
  context: ToolContext = DEFAULT_TOOL_CONTEXT,
): ToolResult {
  return applyToolRequest(tool, { project, selection, values }, source, context);
}

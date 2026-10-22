// ABOUTME: The custom tool contract: a named, parameterised, pure function from a song project and a selection to commands.
// ABOUTME: Tools never touch a session or the DOM; the session and the preview apply the commands their function returns.
import { applyProjectCommand } from "./apply";
import type { ScoreCommand } from "./commands";
import type { ProjectCommand } from "./commands-project";
import type { Diagnostic } from "./diagnostics";
import type { DialectRegistry, ScoreDialect } from "./dialect";
import type { SongProject } from "./score";
import type { Language } from "./types";

/** A tool's display name in both interface languages. */
export type ToolText = Readonly<Record<Language, string>>;

/** The value a tool parameter can carry. */
export type ToolParameterValue = string | number | boolean;

/** All parameter values a tool is run with, by parameter name. A missing key takes the declaration's default. */
export type ToolParameterValues = Readonly<Record<string, ToolParameterValue | undefined>>;

interface ParameterBase {
  readonly name: string;
  /** A label for the panel; when absent the panel shows the name. */
  readonly label?: ToolText;
  readonly default: ToolParameterValue;
}

export interface NumberToolParameter extends ParameterBase {
  readonly type: "number";
  readonly default: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface BooleanToolParameter extends ParameterBase {
  readonly type: "boolean";
  readonly default: boolean;
}

/** A choice from a fixed list, the list being the allowed values. */
export interface ChoiceToolParameter extends ParameterBase {
  readonly type: "choice";
  readonly default: string;
  readonly values: ReadonlyArray<string>;
}

/** Free text, with no range of its own. */
export interface TextToolParameter extends ParameterBase {
  readonly type: "text";
  readonly default: string;
}

/** One parameter a tool declares: its name, type, range or allowed values, and default. */
export type ToolParameter = NumberToolParameter | BooleanToolParameter | ChoiceToolParameter | TextToolParameter;

/** Builds the commands a tool would produce. It is pure: it reads its arguments and nothing else. */
export type ToolCommandBuilder = (
  project: SongProject,
  selection: ReadonlyArray<string>,
  values: ToolParameterValues,
) => ReadonlyArray<ScoreCommand>;

/** A custom tool: identity, display name, optional parameter declaration, and the pure function that builds its commands. */
export interface ScoreTool {
  readonly id: string;
  readonly name: ToolText;
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
export function validateToolParameters(tool: ScoreTool, values: ToolParameterValues = {}): ToolParameterCheck {
  const filled: Record<string, ToolParameterValue> = {};
  const diagnostics: Diagnostic[] = [];

  for (const parameter of tool.parameters ?? []) {
    const given = values[parameter.name];
    const value = given === undefined ? parameter.default : given;
    const problem = valueProblem(parameter, value);
    if (problem === undefined) filled[parameter.name] = value as ToolParameterValue;
    else diagnostics.push(parameterDiagnostic(tool, parameter, problem, value));
  }

  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, values: filled };
}

/** What a preview or a run came to: the project the commands make, or the diagnostic of the step that refused. */
export type ToolResult =
  | {
      readonly ok: true;
      readonly project: SongProject;
      readonly diagnostics: readonly [];
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

/** Applies a list of commands to a local project, stopping at the first refusal and leaving the input untouched. */
export function applyCommandList(
  dialect: ScoreDialect,
  project: SongProject,
  commands: ReadonlyArray<ScoreCommand | ProjectCommand>,
): { readonly project: SongProject; readonly diagnostics: ReadonlyArray<Diagnostic> } {
  let next = project;
  for (const command of commands) {
    const applied = applyProjectCommand(dialect, next, command);
    if (applied.diagnostics.length > 0) return { project, diagnostics: applied.diagnostics };
    next = applied.project;
  }
  return { project: next, diagnostics: [] };
}

function failure(
  project: SongProject,
  diagnostics: ReadonlyArray<Diagnostic>,
  commands: ReadonlyArray<ScoreCommand>,
): ToolResult {
  return { ok: false, project, diagnostics, commands };
}

/** Validates, builds once, resolves the dialect, and applies the commands: the path a preview and a run share. */
export function applyToolRequest(
  tool: ScoreTool,
  request: ToolRequest,
  source: DialectRegistry | ScoreDialect,
): ToolResult {
  const checked = validateToolParameters(tool, request.values);
  if (!checked.ok) return failure(request.project, checked.diagnostics, []);
  if (typeof tool.commands !== "function") return failure(request.project, [commandsDiagnostic(tool)], []);

  const commands = tool.commands(request.project, request.selection, checked.values);
  const dialect = dialectOf(request.project, source);
  if (dialect === undefined) return failure(request.project, [noDialectDiagnostic(request.project.modelId)], commands);

  const applied = applyCommandList(dialect, request.project, commands);
  if (applied.diagnostics.length > 0) return failure(request.project, applied.diagnostics, commands);
  return { ok: true, project: applied.project, diagnostics: [], commands };
}

/** What running a tool would make, computed without a session. Invalid parameters and a failing step return diagnostics. */
export function previewTool(
  tool: ScoreTool,
  project: SongProject,
  selection: ReadonlyArray<string>,
  values: ToolParameterValues,
  source: DialectRegistry | ScoreDialect,
): ToolResult {
  return applyToolRequest(tool, { project, selection, values }, source);
}

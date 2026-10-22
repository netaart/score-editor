// ABOUTME: The custom tool contract: a named, parameterised, pure function from a song project and a selection to commands.
// ABOUTME: Tools never touch a session or the DOM; the registry only holds them, and the session applies their commands.
import { applyProjectCommand } from "./apply";
import type { ScoreCommand } from "./commands";
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

/** The values a tool's function receives after defaults and validation, so every declared name has a value. */
export type ToolValues = Readonly<Record<string, ToolParameterValue>>;

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
  readonly type: "choice" | "select" | "enum";
  readonly default: string;
  readonly values: ReadonlyArray<string>;
}

/** Free text, with no range of its own. */
export interface TextToolParameter extends ParameterBase {
  readonly type: "text" | "string";
  readonly default: string;
}

/** One parameter a tool declares: its name, type, range or allowed values, and default. */
export type ToolParameter = NumberToolParameter | BooleanToolParameter | ChoiceToolParameter | TextToolParameter;

/** Builds the commands a tool would produce. It is pure: it reads its arguments and nothing else. */
export type ToolCommandBuilder = (
  project: SongProject,
  selection: ReadonlyArray<string>,
  values: ToolValues,
) => ReadonlyArray<ScoreCommand>;

/** A custom tool: identity, display name, parameter declaration, and the pure function that builds its commands. */
export interface ScoreTool {
  readonly id: string;
  readonly name: ToolText;
  /** An alternative spelling for hosts that read a tool's display name under this key. */
  readonly displayName?: ToolText;
  readonly parameters?: ReadonlyArray<ToolParameter>;
  readonly commands: ToolCommandBuilder;
  /** An alternative spelling for a builder; `commands` is the one the registry and session call. */
  readonly build?: ToolCommandBuilder;
}

/** The tools a host registered, by id. Registering an id twice is an error, so a panel never shows two tools alike. */
export interface ToolRegistry {
  /** Adds a tool. It throws when a tool with the same id is already registered. */
  register(tool: ScoreTool): void;
  /** Every registered tool, in registration order. */
  list(): ReadonlyArray<ScoreTool>;
  /** The tool with this id, or `undefined`. */
  find(id: string): ScoreTool | undefined;
  /** The same lookup under a shorter name. */
  get(id: string): ScoreTool | undefined;
  /** The same list as `list()`, for a panel that reads a property. */
  readonly tools: ReadonlyArray<ScoreTool>;
}

class ToolRegistryStore implements ToolRegistry {
  readonly #byId = new Map<string, ScoreTool>();
  readonly #order: ScoreTool[] = [];

  register(tool: ScoreTool): void {
    if (this.#byId.has(tool.id)) throw new Error(`A tool with the id "${tool.id}" is already registered.`);
    this.#byId.set(tool.id, tool);
    this.#order.push(tool);
  }

  list(): ReadonlyArray<ScoreTool> {
    return [...this.#order];
  }

  find(id: string): ScoreTool | undefined {
    return this.#byId.get(id);
  }

  get(id: string): ScoreTool | undefined {
    return this.find(id);
  }

  get tools(): ReadonlyArray<ScoreTool> {
    return this.list();
  }
}

/** Builds a registry, optionally from tools the host already has. A duplicate id among them is an error. */
export function createToolRegistry(tools: ReadonlyArray<ScoreTool> = []): ToolRegistry {
  const registry = new ToolRegistryStore();
  for (const tool of tools) registry.register(tool);
  return registry;
}

/** The same registry under the name that pairs with `ScoreTool`. */
export const createScoreToolRegistry = createToolRegistry;

export type ToolParameterCheck =
  | { readonly ok: true; readonly values: ToolValues }
  | { readonly ok: false; readonly diagnostics: ReadonlyArray<Diagnostic> };

function expectedText(parameter: ToolParameter): string {
  switch (parameter.type) {
    case "number": {
      const min = parameter.min;
      const max = parameter.max;
      if (min !== undefined && max !== undefined) return `a number from ${min} to ${max}`;
      if (min !== undefined) return `a number from ${min} up`;
      if (max !== undefined) return `a number up to ${max}`;
      return "a number";
    }
    case "boolean":
      return "true or false";
    case "choice":
    case "select":
    case "enum":
      return `one of ${parameter.values.join(", ")}`;
    case "text":
    case "string":
      return "text";
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
    reason,
    expected: expectedText(parameter),
  };
  if (parameter.type === "number") {
    if (parameter.min !== undefined) params.min = parameter.min;
    if (parameter.max !== undefined) params.max = parameter.max;
  }
  if (parameter.type === "choice" || parameter.type === "select" || parameter.type === "enum") {
    params.values = parameter.values.join(", ");
  }
  if (value !== undefined) params.value = typeof value === "number" && Number.isNaN(value) ? "NaN" : String(value);
  return { code: "tool-parameter", params, at: {} };
}

/** Checks and fills a tool's parameters. Defaults fill missing names; wrong types and out-of-range values are refused. */
export function validateToolParameters(tool: ScoreTool, values: ToolParameterValues = {}): ToolParameterCheck {
  const filled: Record<string, ToolParameterValue> = {};
  const diagnostics: Diagnostic[] = [];

  for (const parameter of tool.parameters ?? []) {
    const given = values[parameter.name];
    const value = given === undefined ? parameter.default : given;
    switch (parameter.type) {
      case "number": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          diagnostics.push(parameterDiagnostic(tool, parameter, "type", value));
          break;
        }
        if (
          (parameter.min !== undefined && value < parameter.min) ||
          (parameter.max !== undefined && value > parameter.max)
        ) {
          diagnostics.push(parameterDiagnostic(tool, parameter, "range", value));
          break;
        }
        filled[parameter.name] = value;
        break;
      }
      case "boolean":
        if (typeof value !== "boolean") diagnostics.push(parameterDiagnostic(tool, parameter, "type", value));
        else filled[parameter.name] = value;
        break;
      case "choice":
      case "select":
      case "enum":
        if (typeof value !== "string") diagnostics.push(parameterDiagnostic(tool, parameter, "type", value));
        else if (!parameter.values.includes(value))
          diagnostics.push(parameterDiagnostic(tool, parameter, "value", value));
        else filled[parameter.name] = value;
        break;
      case "text":
      case "string":
        if (typeof value !== "string") diagnostics.push(parameterDiagnostic(tool, parameter, "type", value));
        else filled[parameter.name] = value;
        break;
    }
  }

  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, values: filled };
}

/** The same check under a name a host may reach for first. */
export const checkToolParameters = validateToolParameters;

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

function builderOf(tool: ScoreTool): ToolCommandBuilder {
  return tool.commands ?? tool.build ?? (() => []);
}

function dialectOf(project: SongProject, source: DialectRegistry | ScoreDialect): ScoreDialect | undefined {
  return "find" in source ? source.find(project.modelId) : source;
}

/** Applies a list of commands to a local project, stopping at the first refusal and leaving the input untouched. */
export function applyToolCommands(
  dialect: ScoreDialect,
  project: SongProject,
  commands: ReadonlyArray<ScoreCommand>,
): { readonly project: SongProject; readonly diagnostics: ReadonlyArray<Diagnostic> } {
  let next = project;
  for (const command of commands) {
    const applied = applyProjectCommand(dialect, next, command);
    if (applied.diagnostics.length > 0) return { project, diagnostics: applied.diagnostics };
    next = applied.project;
  }
  return { project: next, diagnostics: [] };
}

/** Checks the parameters, then builds the commands once. A refused parameter set never reaches the tool's function. */
export function buildToolCommands(
  tool: ScoreTool,
  project: SongProject,
  selection: ReadonlyArray<string>,
  values: ToolParameterValues = {},
): { readonly commands: ReadonlyArray<ScoreCommand>; readonly diagnostics: ReadonlyArray<Diagnostic> } {
  const checked = validateToolParameters(tool, values);
  if (!checked.ok) return { commands: [], diagnostics: checked.diagnostics };
  return { commands: builderOf(tool)(project, selection, checked.values), diagnostics: [] };
}

/** What running a tool would make, computed without a session. Invalid parameters and a failing step return diagnostics. */
export function previewTool(
  tool: ScoreTool,
  project: SongProject,
  selection: ReadonlyArray<string>,
  values: ToolParameterValues,
  source: DialectRegistry | ScoreDialect,
): ToolResult {
  const built = buildToolCommands(tool, project, selection, values);
  if (built.diagnostics.length > 0) {
    return { ok: false, project, diagnostics: built.diagnostics, commands: built.commands };
  }

  const commands = built.commands;
  const dialect = dialectOf(project, source);
  if (dialect === undefined) {
    return {
      ok: false,
      project,
      diagnostics: [{ code: "no-dialect", params: { modelId: project.modelId }, at: {} }],
      commands,
    };
  }

  const applied = applyToolCommands(dialect, project, commands);
  if (applied.diagnostics.length > 0) {
    return { ok: false, project, diagnostics: applied.diagnostics, commands };
  }
  return { ok: true, project: applied.project, diagnostics: [], commands };
}

/** The same preview under the name that pairs with `ScoreTool`. */
export const previewScoreTool = previewTool;

/** Names a host may use for the same registry and result types. */
export type ScoreToolRegistry = ToolRegistry;
export type ToolRunResult = ToolResult;
export type ToolPreviewResult = ToolResult;
export type ToolParamValue = ToolParameterValue;
export type ToolParamValues = ToolParameterValues;

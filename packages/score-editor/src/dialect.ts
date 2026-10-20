// ABOUTME: The dialect contract and the host-built registry: a dialect reads and writes its score format; a model ID finds one.
// ABOUTME: There is no global registry and no DOM access here, so a host controls which dialects its bundle contains.
import type { Diagnostic } from "./diagnostics";
import type { Score } from "./score";
import type { DialectConstraints } from "./types";

export interface ParseResult {
  /** `null` exactly when there is an error-level diagnostic. */
  readonly score: Score | null;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

/** What a score dialect must provide. `check` joins in a later ticket. */
export interface ScoreDialect {
  readonly id: string;
  readonly constraints: DialectConstraints;
  parse(text: string): ParseResult;
  serialize(score: Score): string;
}

export interface DialectRegistry {
  /** The dialect whose ID equals the model ID, or `undefined` when the host imported none for it. */
  find(modelId: string): ScoreDialect | undefined;
}

/** Builds a lookup from the dialects the host imports. No module-level state is involved. */
export function createDialectRegistry(dialects: ReadonlyArray<ScoreDialect>): DialectRegistry {
  const byId = new Map<string, ScoreDialect>();
  for (const dialect of dialects) byId.set(dialect.id, dialect);
  return { find: (modelId) => byId.get(modelId) };
}

# The dialect registry

Use a dialect when a host has a score format other than `song2`, or another model ID whose score text should open in
the same editor. A dialect reads and writes one score format into the shared `Score` model. It carries no editing
operations: commands stay dialect-agnostic and the dialect only writes and checks their result.

Dialects are passed in explicitly. There is no global registry, so a host controls which formats its bundle contains
and a package never has to import another package at runtime.

## The contract

`ScoreDialect` has five members:

```ts
interface ScoreDialect {
  id: string; // equals the SongProject.modelId that selects it
  constraints: DialectConstraints;
  parse(text: string): ParseResult;
  serialize(score: Score): string;
  check(score: Score): ReadonlyArray<Diagnostic>;
}
```

- `parse` returns `ParseResult`: `{ score, diagnostics }`. Return `score: null` exactly when there is an error-level
  diagnostic. Warnings may come with a score.
- `serialize` writes the model back as text. Unchanged text should survive a parse and serialize where the format
  allows it; the core never reads `Score.source`, so a dialect may keep private data there.
- `check` writes the score, reads the written text back and reports every way it differs from the model. The command
  layer runs it after every edit; any diagnostic refuses the command and leaves the project unchanged.

`ScoreDialect` is a type, not a class. A plain object satisfies it.

## The constraints

`DialectConstraints` declares what the format permits. The editor uses it to narrow what it offers.

| Member | Meaning |
| --- | --- |
| `voices` | `{ name, required, allowsChords }[]`, in display order. |
| `keys` | `{ major: string[], minor: string[] }`, spelled as the format writes them. |
| `tempo` | `{ unit, min, max }`; the unit the format writes and the inclusive range. |
| `sectionMarker` | The comment prefix that starts a section. |
| `lyricsInScore` | Whether lyrics may appear in the score text. |
| `durations` | `DurationSet`: the duration numbers the format accepts under its written unit. |
| `meter` | `MeterRule`: fraction form, numerator and denominator ranges, denominator power-of-two rule, symbolic allowed. |
| `chords` | `ChordVocabulary`: `{ roots, qualities, slashBass }`. |

## Register and use

```ts
import { createDialectRegistry } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const dialects = createDialectRegistry([song2Dialect, myDialect]);
const session = createEditingSession({ project, dialects, language: "en" });
const editor = mount(el, { project, dialects, language: "en" });
```

`createDialectRegistry(dialects)` returns a `DialectRegistry`: `find(modelId)` returns the dialect whose `id` equals
the model ID, or `undefined`. When a project's model has no dialect:

- `session.reading` is `{ kind: "no-dialect", modelId }`;
- the problem view shows one sentence naming the model;
- `dispatch` and `runTool` refuse with the `no-dialect` command diagnostic.

## A dialect skeleton

```ts
import type { ScoreDialect } from "@neta-art/score-editor";

const myDialect: ScoreDialect = {
  id: "my-model",
  constraints: {
    voices: [{ name: "Lead", required: true, allowsChords: false }],
    keys: { major: ["C", "G", "D"], minor: ["A", "E", "B"] },
    tempo: { unit: "1/4", min: 20, max: 300 },
    sectionMarker: "% ",
    lyricsInScore: false,
    durations: [1, 2, 4, 8, 16],
    meter: {
      form: "fraction",
      numerator: { min: 1, max: 64 },
      denominator: { min: 1, max: 64, powerOfTwo: true },
      symbolic: false,
    },
    chords: { roots: ["C", "D", "E"], qualities: ["", "m", "7"], slashBass: false },
  },
  parse(text) {
    // Return { score, diagnostics }; score is null when an error-level diagnostic exists.
  },
  serialize(score) {
    // Write the shared Score model in the format's own text.
  },
  check(score) {
    // Read the written text back and return every difference, or [].
  },
};
```

The model's positions are integer ticks of 1/1024 note (`TICKS_PER_QUARTER` is 256), so a format's own units need
converting on the way in and out. Diagnostics are `{ code, params, at }`: use one of the reading codes for text that
cannot be read, or a dialect-specific code only if the host adds it; `formatDiagnostic` handles the documented codes.

The song2 dialect is the reference implementation: `song2Dialect`, `song2Constraints` and `song2Id` are exported from
`@neta-art/score-dialect-song2`. A second dialect usually depends on the core for types only, as song2 does.

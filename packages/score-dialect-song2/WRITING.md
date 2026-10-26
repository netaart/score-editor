# Writing a song2 score

[RULES.md](RULES.md) is the normative format specification; this page is the short path for an agent writing a
`.abc` by hand. Each heading names the rules to read there instead of restating them. The dialect package reads and
writes this format, so finish with the package check at the end.

## Start with the smallest correct score

Write the smallest score that is complete, read it, and add one section or voice at a time:

```abc
X:1
T:
M:4/4
L:1/16
Q:1/4=100
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
K:C
% verse
V: Vocal
C16|D16|
```

That is already a complete score: fixed header, one `Vocal` block, a music line of two filled bars. Do not start from a
general ABC file and remove what song2 does not support; start here and add only what the song needs. The header order
and the allowed values are [RULES.md](RULES.md) H1-H10.

## The rules agents break most

### 1. The header is exact

Every header line has one accepted form. Text after `T:` is not a title, and a symbolic meter is not a meter.

Wrong:

```abc
T:My song
```

Right:

```abc
T:
```

See [RULES.md](RULES.md) H2 for the title, H3-H5 for meter, unit and tempo, and H6-H10 for the voice and key lines.

### 2. One block, one music line, one closing barline

A voice block is its exact `V:` line, optional field lines, and exactly one music line. A music line has one to four
bars and ends with `|`. Do not split one voice's bars over several music lines, and do not leave off the final `|` in a
new score.

Wrong:

```abc
V: Vocal
C16|D16|E16|F16|G16|A16|B16|c16|
```

Right:

```abc
V: Vocal
C16|D16|E16|F16|
```

See [RULES.md](RULES.md) B1-B8 for the group and block shape, M1-M3 for a music line, and W5 for the written form.

### 3. Every bar fills its meter with an allowed duration

Use only the duration numbers the dialect declares, and make each bar add up exactly. A value that is too long is split
with ties; it is never written as one unsupported number.

Wrong:

```abc
M:4/4
L:1/16
C5|C8|
```

Right:

```abc
M:4/4
L:1/16
C4D4E4F4|C8-C8|
```

The first line is wrong twice: `5` is not a duration, and `C8` is only half a 4/4 bar. See
[RULES.md](RULES.md) D1-D6 for durations and exact fill, and W6 for how a writer splits and fills.

### 4. Keep the voice order and the group shape

`Vocal` comes first and is mandatory. `Ins` is optional and, when present, comes second in the header and second in
every group.

Wrong:

```abc
V: Ins
Z4|
V: Vocal
C16|
```

Right:

```abc
V: Vocal
C16|
V: Ins
Z|
```

The group and voice agreement rules are [RULES.md](RULES.md) B1-B4 and V1-V8; do not write a lone `Ins` block or put the
blocks in the opposite order.

### 5. `Z` is a whole-bar rest and stands alone

`Z`, `Z2`, `Z3` and `Z4` are complete resting bars. They cannot carry a chord or a note, and they cannot stand beside
other tokens in the same bar body.

Wrong:

```abc
"C"Z|
```

Right:

```abc
"C"z16|
```

or

```abc
Z|
```

See [RULES.md](RULES.md) M4 for `Z` expansion and W6 for where a writer may use it.

### 6. Chords are exact names in `Vocal` only

Use a root and one quality from the chord vocabulary, with an optional slash bass. A chord belongs in `Vocal`, before
the note or rest it starts on; `Ins` never carries one.

Wrong:

```abc
"CM7"C16|
```

Right:

```abc
"Cmaj7"C16|
```

`CM7` is not one of the qualities. See [RULES.md](RULES.md) C1-C8 for the chord grammar and W10 for placement, and do
not write a chord on a `Z` bar or after the bar is full.

### 7. A tie joins equal pitches and never enters a rest

The note after `-` is the continuation and must have the same sounding pitch. A rest is not a continuation.

Wrong:

```abc
C8-z8|
```

Right:

```abc
C8-C8|
```

See [RULES.md](RULES.md) P9-P16 for tie meaning, equal pitch and the rest cases, and W9 for the written form.

### 8. Section markers start with `% ` and stand at a group boundary

A section is `% ` followed by its name, on its own line, before the group where it starts. `%verse` without the space
is not a section marker. Do not put a marker between the `Vocal` and `Ins` blocks of one group.

Wrong:

```abc
%verse
V: Vocal
C16|D16|
```

Right:

```abc
% verse
V: Vocal
C16|D16|
```

See [RULES.md](RULES.md) S1-S9 for section markers and where they may stand, and W11 for the written form.

### 9. An accidental holds by letter across octaves

An accidental applies to its letter for the rest of the bar, in every octave, so use `=` to write a natural after a
sharp or flat rather than relying on a later unmarked note.

Wrong:

```abc
^F4 F4 F4 F4|
```

Right:

```abc
^F4 F4 =F4 F4|
```

The first line makes all four F sharps. See [RULES.md](RULES.md) P3-P7 for key signatures and accidental state, and W8
and W13 for how a writer spells accidentals and keys.

### 10. Write no other ABC notation

Song2 has no lyrics lines, tuplets, grace notes, slurs, decorations, repeats, alternative endings, extra voices or
directives. A `w:` line, `|:`, `(3abc` or a `P:` field is not a "style choice"; it is bytes the reader will reject.

Wrong:

```abc
w: la la
```

Right:

```abc
% no lyrics line: the words belong to the song project, not the score
```

See [RULES.md](RULES.md) W12 for the closed set of what a writer emits, and H10 and B8 for what a reader accepts.

## Read it back and check it before you hand it over

The last step is mechanical. Read the text with the dialect package, then have the package write it and read it back
with `check`. A score that does not pass both is not ready.

```ts
import { formatDiagnostic } from "@neta-art/score-editor";
import { song2Dialect } from "@neta-art/score-dialect-song2";

const read = song2Dialect.parse(text);
if (read.score === null) {
  for (const diagnostic of read.diagnostics) console.error(formatDiagnostic(diagnostic, "en"));
  throw new Error("The score did not read; fix every diagnostic above.");
}

const problems = song2Dialect.check(read.score);
if (problems.length > 0) {
  for (const diagnostic of problems) console.error(formatDiagnostic(diagnostic, "en"));
  throw new Error("The score did not check; do not hand it over.");
}
```

A cut score is legal input, but a score you write new must be complete ([RULES.md](RULES.md) W14). `check` returns `[]`
only when the written text reads back as the same model. If it does not, report the diagnostics and fix the text
instead of adding a second change nobody asked for.

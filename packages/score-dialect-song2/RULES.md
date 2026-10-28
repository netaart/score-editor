# The song2 score dialect

This document is the normative format specification for a song2 score. A reader that implements only this document and a writer that implements only this document MUST agree on every accepted text and on the reading result described below.

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. A rule that rejects names the reading diagnostic code that the reader reports. The complete set of reading codes is closed and is listed in “Reading diagnostic codes” at the end.

## Notation and the reading result

A score is one text. Its reading result contains:

- `voices`: the voice names in header order, `["Vocal"]` or `["Vocal", "Ins"]`.
- `measures`: for each voice, the complete measures in order. A measure has a start, a length, and the effective meter and key at its start.
- `notes`: for each voice, every finished note and rest token in order. A note has a start, a duration, a MIDI pitch (`null` for a rest), and a tie flag. Tied tokens stay separate events; a tie does not merge their durations.
- `chords`: every finished chord token, in text order, with its start and its written name. A chord is written only in `Vocal`.
- `keys`: the header key at position 0 and every later key change, with its position.
- `sections`: the section structure (see S).
- `truncated`: whether the text ends in a cut tail, and `truncation`: the voice, the measure, and whether that measure is short (see X).

**Positions and durations are exact fractions of a quarter note.** A length written as `n` units under `L:1/d` is `4n/d` quarter notes. A measure under `M:n/d` is `4n/d` quarter notes. Position 0 is the first instant of the score. Fractions are reduced; no reading step rounds, clips, or quantizes a position or a duration. A measure of a voice starts where its preceding measure in that voice ends.

A complete two-measure score:

```abc
X:1
T:
M:4/4
L:1/16
Q:1/4=96
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:G
% verse
V: Vocal
"G"G8B8|^F16|
V: Ins
Z2|
```

Its `Vocal` notes are G4 at 0 for 2 quarter notes, B4 at 2 for 2, and F-sharp 4 at 4 for 4; its `Ins` voice has two whole-measure rests of 4 quarter notes each. The chord is `G` at 0, the key is G in both voices, and the text is not truncated.

## T. Text handling

**T1 — line endings.** Before any other step, each line break MUST become LF. A line break is one of LF (U+000A), VT (U+000B), FF (U+000C), CR (U+000D), FS (U+001C), GS (U+001D), RS (U+001E), NEL (U+0085), LS (U+2028) or PS (U+2029). A CRLF pair (U+000D U+000A) is one line break. No other character is a line break. A writer MUST use LF only and MUST NOT write CR, CRLF, or any other line separator. Reading result: line boundaries only; no character of the line ending remains in a line.

**T2 — trailing whitespace.** In this document, *whitespace* means U+0009–U+000D, U+001C–U+0020, U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028–U+2029, U+202F, U+205F and U+3000. The reader MUST strip trailing whitespace from every line before parsing. Any other character at the end of a line is kept and read by the rule for its position. A writer MUST NOT write trailing whitespace. Reading result: the stripped line is the line used by every later rule. A header line with trailing whitespace is therefore still exact; a music line whose final `|` is followed by whitespace still ends with `|`.

**T3 — trailing blank lines.** After T2, the reader MUST remove every empty line at the end of the text. A final LF does not by itself create a score line and is not a blank line. Trailing blank lines are not truncation. Reading result: the last non-empty line is the last line.

**T4 — blank lines inside the text.** An empty line that is not covered by T3 MUST be rejected. If it falls inside the fixed header, the code is `header`; otherwise the code is `empty-line`. Reading result: none; the score is rejected.

**T5 — leading whitespace and case.** Leading whitespace is significant on header lines and on `V:` lines: those lines MUST begin in the first column. A music line MAY begin with whitespace because each measure body is trimmed (M2). Case is significant everywhere. The reader MUST NOT normalize case, punctuation, or unicode. A header or `V:` line with leading whitespace is rejected by that line’s rule (`header` for a header line, `voice-order` for a `V:` line); a line with leading whitespace before `%` is not a section comment (`comment-position` or `token`). Reading result: bytes are used as written apart from T1–T3.

**T6 — empty text and byte-order mark.** An empty text, or a text whose first line is not exactly `X:1`, MUST be rejected with `header` field `X`. A UTF-8 byte-order mark before `X:1` is not allowed and makes the first line wrong. Reading result: none.

## H. Header

The header is fixed. It has exactly seven lines when `Ins` is absent and exactly eight when `Ins` is present; its last line is the key line, and the body starts on the next line.

**H1 — version line.** Line 1 MUST be exactly `X:1`. Anything else is rejected with `header` field `X`. Reading result: version 1; no other value is defined.

**H2 — title line.** Line 2 MUST be exactly `T:`. The title is empty; text after the colon is not allowed. Anything else is rejected with `header` field `T`. Reading result: the empty title.

**H3 — meter line.** Line 3 MUST begin with `M:`. The remainder MUST match `[1-9][0-9]{0,5}/[1-9][0-9]{0,5}`: a numerator from 1 through 999999 with no leading zero, a slash, and a denominator from 1 through 999999 with no leading zero. The denominator MUST be a power of two no greater than 1024. A symbolic meter such as `M:C` is not accepted. Anything else is rejected with `header` field `M`. Reading result: the initial meter `(n, d)`; every measure is `4n/d` quarter notes unless a later `M:` changes it.

**H4 — unit line.** Line 4 MUST match `L:1/[1-9][0-9]{0,5}` exactly. The denominator MUST be a power of two no greater than 1024. `L:1/1`, `L:1/1024`, and every power of two between them are accepted; `L:1/0`, `L:1/3`, `L:1/2048`, `L:2/16`, and a denominator with a leading zero are rejected with `header` field `L`. Reading result: one unit is `4/d` quarter notes.

**H5 — tempo line.** Line 5 MUST match `Q:1/4=[1-9][0-9]*` exactly. The value is a positive integer BPM with no leading zero and no other characters. Reading imposes no upper bound; the tempo does not affect any position or duration. Anything else is rejected with `header` field `Q`. A writer MUST write a new tempo value from 20 through 400 inclusive, the product tempo range; an untouched `Q:` line keeps the bytes it was read with, even when its value is outside that range. Reading result: the integer tempo.

**H6 — Vocal definition.** Line 6 MUST be exactly:

```text
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
```

Anything else is rejected with `header` field `V`. Reading result: the first voice is `Vocal`. `Vocal` is mandatory in every score.

**H7 — optional Ins definition.** If the line after the Vocal definition begins with `V:`, it MUST be exactly:

```text
V: Ins clef=treble name="Ins Melody" snm="Inst."
```

If that line begins with `V:` and is not exact, the score is rejected with `header` field `V`. If it does not begin with `V:`, there is no `Ins` voice and that line is the key line. Reading result: the second voice is `Ins`, or the score has `Vocal` only.

**H8 — header key line.** The line after the voice definitions MUST begin with `K:`. Its value, the text after the first two characters, MUST be one of the thirty keys in H9. An empty value, a mode name such as `Dorian`, and a spelling outside the table are rejected with `header` field `K`. Reading result: the initial key, in force in both voices at position 0.

**H9 — the thirty keys and their signatures.** The accepted keys and their number of fifths are:

| fifths | major | minor |
|---:|---|---|
| -7 | Cb | Abm |
| -6 | Gb | Ebm |
| -5 | Db | Bbm |
| -4 | Ab | Fm |
| -3 | Eb | Cm |
| -2 | Bb | Gm |
| -1 | F | Dm |
| 0 | C | Am |
| 1 | G | Em |
| 2 | D | Bm |
| 3 | A | F#m |
| 4 | E | C#m |
| 5 | B | G#m |
| 6 | F# | D#m |
| 7 | C# | A#m |

For a positive count, the letters `F C G D A E B` are each sharpened, in that order, up to the count. For a negative count, the letters `B E A D G C F` are each flattened, in that order, up to the absolute count. Every other letter is natural. Reading result: a map from the seven letter names to `-1`, `0`, or `+1`; this is the key signature used by P3.

**H10 — no other header lines and no other order.** The header MUST contain no extra field, no omitted required field, no inserted blank line, and no reordering; the body begins immediately after the key line. A line in a fixed position that does not satisfy its rule is rejected with the field code of that rule. Reading result: the header ends after the key line, and the next line is the first body line.

## B. Body structure

**B1 — groups.** The body is a sequence of one or more groups. A group is one `Vocal` block followed by one `Ins` block when `Ins` is present, or a single `Vocal` block when it is absent. At least one music line MUST occur in the whole text; otherwise the score is rejected with `bar-count` reason `no-music`. Reading result: the body’s groups in order, and no group without a music line.

**B2 — voice block lines.** Every block begins with its exact opening line: `V: Vocal` or `V: Ins`. The first block of a group MUST be `Vocal`; when `Ins` is present, the second block MUST be `Ins`. A wrong or out-of-order opening line in a non-cut position is rejected with `voice-order` (with the expected line as a parameter); a `%` line in that position is `comment-position` and an empty line is `empty-line`. A missing opening line at the very end of the text is the cut X8, not a rejection. Reading result: the block belongs to the named voice.

**B3 — per-block meter and key fields.** Immediately after a block’s opening line, zero or more lines beginning with `M:` or `K:` are allowed, in either order, before the music line. At most one `M:` and at most one `K:` are allowed in the block. A duplicate is rejected with `header` field `M` or `K` and reason `repeated`; an invalid value is rejected with `header` field `M` or `K`. A field line after the music line has begun is not a block field and is rejected by the rule for the position it occupies. Reading result: `M:` sets that voice’s meter from the next measure of the block; `K:` sets that voice’s key at the block’s current position and adds a key-change entry there (V4). Neither changes an earlier measure.

**B4 — exactly one music line per block.** Each complete block contains exactly one music line, immediately after its optional fields. At the end of the text a missing music line is the cut form X3(e); it is not a complete block and does not add a measure. In a complete text the line in the music-line position is judged by M1–M11; the block shape adds no separate rejection. Reading result: one music line per complete block.

**B5 — one to four measures.** A music line MUST contain from one through four measures after `Z` expansion (M3, M4). Zero or more than four is rejected with `bar-count` (parameters `count` and `max`). Reading result: that many complete measures, or one partial measure in a cut tail.

**B6 — comments only between groups.** A `% ` line (S) MAY appear only at the start of a group, before its first `V:` line, or between two groups. It MUST NOT appear between the two voice blocks of a group, after a `V:` line, or after a music line before the next group. A misplaced `%` line is rejected with `comment-position` (with the expected line as a parameter). Reading result: a section marker, never a music line.

**B7 — no blank lines.** A blank line inside the body is rejected with `empty-line`. A writer MUST NOT write one. Reading result: none.

**B8 — no other body material.** There is no other body line: no lyrics, no directives, no extra fields, no second music line for a block, and no text after the final music line except a permitted comment or a cut tail. A nonblank, non-comment line where a `V:` line is expected is rejected with `voice-order`; a nonblank line where a music line is expected is rejected with `voice-order` unless its own rule rejects it first. Reading result: none.

## M. Measures and tokens

**M1 — splitting a music line.** A music line is split at every `|` character. If the line ends with `|`, that last `|` is the closing barline and does not create a measure after it; the text before it is split normally. If the line does not end with `|`, it is accepted only as the last line of the text, as a cut (X10); otherwise it is rejected with `token` reason `no-barline`. Reading result: the ordered measure bodies and, for the cut case, the partial status of the last one.

**M2 — measure bodies are trimmed.** Each piece between barlines is a measure body after removing leading and trailing whitespace. An empty body is rejected with `token` reason `empty-bar`. This covers `||`, a leading `|`, a trailing `||`, and a line that is only `|`. Reading result: none.

**M3 — measure count.** After `Z` expansion, a music line MUST have from one through four measures. More than four is rejected with `bar-count`; zero cannot arise because an empty body is rejected by M2. Reading result: one measure per body, or two through four for `Z2`–`Z4`.

**M4 — whole-measure rests.** A measure body that is exactly `Z`, `Z2`, `Z3`, or `Z4` is a whole-measure rest, not a note with duration 4. `Z` is one measure, `Z2` two measures, `Z3` three, and `Z4` four. Each expanded measure is a complete measure whose single rest lasts the full current bar length and whose start is the previous measure’s end. Any other body containing `Z`, such as `Z1`, `Z5`, `Z2Z2`, or `"C"Z`, is not a whole-measure rest and is rejected with `token`, because uppercase `Z` is not a note or rest token. Reading result: one rest event per expanded measure, pitch `null`, duration equal to that measure’s length.

**M5 — token kinds.** Inside a measure body that is not a whole-measure rest, exactly three token kinds are accepted: a chord token (M8), an inline key token (M9), and a note or rest token (M6, M7). Whitespace between tokens is skipped. Any other byte where a token must start is rejected with `token` reason `unrecognized`; this includes a byte left over after a note or rest token. Reading result: the tokens in text order.

**M6 — note token.** A pitched note token is: an optional accidental (`^^`, `__`, `^`, `_`, or `=`), one letter `A`–`G` (uppercase for octave 4) or `a`–`g` (lowercase for one octave above the uppercase letter), zero or more octave marks `,` or `'`, zero, one, or two digits (three or more are rejected by D2), and an optional `-` tie marker. No other character belongs to the token. The digits are the duration in `L:` units (D1–D3); an absent digits field means one unit. Reading result: one note event, with the pitch from P, the start from the running offset, the duration from D3, and the tie flag from P9.

**M7 — rest token.** A rest token is the letter `z` (lowercase only), zero or more octave marks (which are invalid, P15), zero, one, or two duration digits (three or more are rejected by D2), and an optional tie marker (which is invalid, P15). A rest has pitch `null`; its start and duration follow the same offset rules as a note. An uppercase `Z` is not a rest token; it is only a whole-measure rest under M4. Reading result: one rest event.

**M8 — chord token.** A chord token is `"`, then zero or more characters other than `"` and LF, then `"`. The empty token `""` is lexically a chord token but its name fails the chord grammar and is rejected with `chord`. A chord token does not advance the offset. Reading result: a chord event at the current offset, subject to C.

**M9 — inline key token.** An inline key token is `[K:`, then one or more characters other than `]` and LF, then `]`. The value MUST be one of the thirty keys in H9; otherwise it is rejected with `header` field `K`. An empty value (`[K:]`), a missing `]`, or any other bracket token is not an inline key token and is rejected with `token`, except for the cut forms in X4. A valid token changes the voice’s key at the current offset, adds a key-change entry there, and resets the measure’s accidental state (P7). It does not advance the offset or add a chord. Reading result: the key change.

**M10 — only plain barlines.** The only barline is a single `|`. `||`, `|]`, `|:`, `:|`, `[|`, `|3`, and any other barline-like sequence are not supported. They either leave an empty measure (`token` reason `empty-bar`) or leave bytes that are not a token (`token` reason `unrecognized`). Reading result: none for a rejected score.

**M11 — offset advance.** A chord or key token leaves the offset unchanged. A note or rest token advances it by its duration. The next token starts at the new offset. Reading result: starts as described in the notation section.

## D. Durations and bar length

**D1 — the duration set.** The duration number `n` of a note or rest MUST be one of `1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48`. These are the only accepted values. Any other value, including `0`, `5`, `7`, `9`, `10`, `64`, and `96`, is rejected with `duration` (parameters `value`, and `bar` when known). Reading result: `n` units.

**D2 — digits.** The duration field MUST contain at most two characters. Three or more digits are rejected with `duration` even if their integer value would be allowed. Leading zeros are permitted: `C08` means eight units. The integer is the value of the digits; absent digits mean one. Reading result: the integer `n`.

**D3 — duration formula.** Under `L:1/d`, a note or rest of `n` units lasts `4n/d` quarter notes. For example, under `L:1/16`, `C4` lasts one quarter note, `C1` lasts `1/4`, `C8` lasts `2`, and `C16` lasts `4`. Reading result: the exact fraction `4n/d`.

**D4 — bar length formula.** Under the effective meter `M:n/d`, a complete measure lasts `4n/d` quarter notes. For example, `M:4/4` lasts 4, `M:3/4` lasts 3, `M:6/8` lasts 3, and `M:2/4` lasts 2. Reading result: the measure’s length, and the measure’s start as the preceding measure’s end.

**D5 — exact fill.** In a complete measure, the sum of the durations of the finished note and rest tokens MUST equal the bar length exactly. A sum smaller than the bar length is rejected with `bar-length` reason `short`; a sum larger is rejected by D6. Reading result: a complete measure exactly filled.

**D6 — no overflow.** If adding a note or rest would make the running offset greater than the bar length, the score is rejected with `bar-length` reason `overflow`; a duration is never clipped or split automatically. Reading result: none.

**D7 — nothing after a full measure.** A token that starts when the running offset is already equal to or greater than the bar length is rejected with `bar-length` reason `full`. This applies to notes, rests, chords, and inline keys alike. Reading result: none.

**D8 — whole-measure rest duration.** A `Z` measure has one rest whose duration equals the effective bar length at that measure. `Z2`, `Z3`, and `Z4` produce two, three, and four such rests, each of the effective length of its own measure, at consecutive starts. Reading result: as stated. A `Z` measure is complete by definition.

**D9 — meter changes.** An `M:` field at the start of a block sets the meter for that voice from the next measure it writes; earlier measures keep their lengths and starts. A meter change never moves an existing note. A different meter may have the same length (for example `4/4` and `2/2`); those are still different meters for V3. Reading result: each measure records the meter in force when it starts.

**D10 — fractional arithmetic.** All positions and durations are exact rational numbers of quarter notes. The reader MUST reduce fractions for reporting but MUST NOT round them. A start or duration such as `3/2`, `1/4`, or `12` is exact. Reading result: exact fractions.

## P. Pitch

**P1 — written pitch.** Before accidentals, a note’s written pitch is

```text
60 + N(letter) + (12 if the letter is lowercase else 0)
   + 12 * (number of ' marks - number of , marks)
```

where `N(C)=0`, `N(D)=2`, `N(E)=4`, `N(F)=5`, `N(G)=7`, `N(A)=9`, `N(B)=11`. Thus uppercase `C` is MIDI 60 (C4), lowercase `c` is 72 (C5), `C,` is 48 (C3), and `c'` is 84 (C6). Reading result: the written pitch.

**P2 — octave marks.** A token MAY carry any number of `'` marks or any number of `,` marks, but MUST NOT carry both in the same token. Each mark raises or lowers by 12 semitones. A token containing both is rejected with `token` reason `mixed-octave`. Reading result: the written pitch from P1.

**P3 — key signature.** For an unmarked note, the alteration is the current key signature’s value for its letter (H9): `+1` for a sharpened letter, `-1` for a flattened letter, and `0` otherwise. Reading result: the sounding pitch is the written pitch plus that alteration.

**P4 — an explicit accidental holds by letter, across octaves.** An accidental written on a note applies to that note and sets the accidental state for its letter for the rest of the measure, in every octave. After `^F`, both a later `F` and a later `f` in the same measure are sharp. The state is keyed by letter, not by letter plus octave. Reading result: every later unmarked note of that letter in the measure uses the stored alteration.

**P5 — accidental marks.** `^` is `+1`, `^^` is `+2`, `_` is `-1`, `__` is `-2`, and `=` is `0` (a natural). An accidental overrides both the stored letter state and the key signature for that note, and then stores its value in the letter state. Reading result: written pitch plus the marked alteration.

**P6 — accidental state resets at a barline.** At the start of every measure, the letter state is empty and every unmarked note again uses the key signature. An accidental never carries across a barline by itself. Reading result: as stated.

**P7 — a key change resets the accidental state.** A `K:` field at a block start and an inline `[K:...]` both clear the letter state at the position where they take effect. Notes after the change use the new key signature until their own accidentals. Reading result: the new key applies from that position; earlier events keep the pitches already computed.

**P8 — MIDI range.** Every finished pitched note MUST have a sounding MIDI pitch from 0 through 127 inclusive, after its accidental. A pitch below 0 or above 127 is rejected with `pitch-range` (parameter `midi`). Reading result: the integer MIDI pitch.

**P9 — tie meaning.** A `-` after a note marks a tie: the note continues into the next note token in the same voice. A chord token or an inline key token MAY stand between the two notes; the next note token is the continuation. The tied note keeps its own start, duration, and pitch, and has `tie: true`; the continuation is a separate event at its own start and duration with its own tie flag. Reading result: two events, not one merged event. A `-` after a rest is rejected (P15).

**P10 — a tie must keep its pitch.** The sounding pitch of the continuation MUST equal the sounding pitch of the tied note. If it does not, the score is rejected with `tie` reason `pitch`. This applies across a barline, across a music line, and across a group. Reading result: two events of equal pitch; the first has `tie: true`.

**P11 — an unmarked continuation inherits the tied pitch and does not set the accidental state.** If the continuation has no accidental of its own and its written pitch (P1) equals the written pitch of the tied note, its sounding pitch MUST be the tied note’s sounding pitch, even when the new measure’s key signature would give a different alteration. In that case the continuation does not set the new measure’s letter state; a later untied note of that letter in the measure uses the key signature (or an accidental written later in that measure). If the continuation’s written pitch differs from the tied note’s, P3 and P5 apply normally and P10 still requires equal sounding pitch. In either case an unmarked note does not set the letter state; only an explicit accidental does (P5). Reading result: the sounding pitch on the continuation, and an unchanged letter state unless the continuation has its own accidental.

**P12 — no tie into a rest or a whole-measure rest.** A note with `-` MUST NOT be followed, as its next note token, by a `z` rest or by a `Z` measure. A `z` rest while a tie is pending is rejected with `tie` reason `rest`; a `Z` measure while a tie is pending is rejected with `tie` reason `whole-bar-rest`. Reading result: none for a rejected score.

**P13 — an unresolved tie at the end is accepted.** If a tied note has no continuation because the text ends, the note is still accepted, with `tie: true` and no following event. This is true both for a complete text and for a cut text. Reading result: the last event has `tie: true` and no successor. A writer MUST NOT produce such a tie.

**P14 — a cut continuation before its octave marks.** In a cut tail only (X5), the final note token of the partial measure MAY continue a tie with a different computed pitch. The reader accepts the text; that final token is unfinished and produces no note event. It is the only note token that can be unfinished. Reading result: the preceding note remains with `tie: true`; the unfinished token contributes no note, no duration, and no accidental state.

**P15 — rests cannot carry note marks.** A `z` rest MUST NOT carry an accidental, an octave mark, or a tie. Such a token is rejected with `token` reason `rest-decoration`. Reading result: none for a rejected score.

**P16 — pitch after a key change in a tie.** A key change may stand between a tied note and its continuation. The continuation’s pitch is computed under the new key (or inherited by P11) and MUST equal the tied pitch. Reading result: the tie continues if the pitches match; otherwise `tie` reason `pitch`.

## C. Chords

**C1 — chord root.** A chord root is a letter `A`–`G` followed by nothing, `b`, `bb`, `#`, or `##`. Lowercase roots are not accepted. Reading result: the root spelling as written.

**C2 — chord qualities.** The root MUST be followed by exactly one of these fifteen quality strings, which are case-sensitive:

```text
""   m    dim   aug   7    maj7   m7   dim7   m7b5
sus4 sus2 6     m6    7sus4 m(maj7)
```

The empty string is a major triad. `Cmaj`, `Cmaj9`, `C13`, `A7alt`, `C:maj`, `CM7`, and any other suffix are rejected with `chord`. Reading result: root plus quality.

**C3 — slash bass.** After the quality, an optional `/` and one pitch name with the same grammar as C1 MAY follow. The bass is written after the slash and may use a double accidental. `C/E`, `F#m7/C#`, and `Dbb/Ab` are accepted; `C/`, `C/E/G`, and `C/3` are rejected with `chord`. Reading result: root, quality, and bass spelling.

**C4 — exact chord name.** The whole chord string between the quotes MUST match C1+C2+C3 completely. No spaces, no extra punctuation, and no empty name are allowed. A name that does not match is rejected with `chord` (parameter `name`). Reading result: the exact written name.

**C5 — chord position.** A chord token’s start is the current offset in its measure. Chords and inline key tokens do not advance the offset, so several chord tokens can share a start. When a note or rest token starts at that offset, the chord applies to it; if several chords share the offset, they are all reported in text order and the last one is the effective chord of the following event. A chord with no following event is still reported at its start. Reading result: a chord event with an exact start and the written name.

**C6 — chords need room.** A chord token MUST occur while the measure’s offset is strictly less than the bar length. A chord at or after a full measure is rejected with `bar-length` reason `full`. A chord at offset 0 before a note that fills the measure is valid, for example `"C"C16|`. A whole-measure rest cannot carry a chord: `"C"Z|` is rejected because the measure body is not exactly `Z` (`token`). Reading result: the chord at its offset; the following note or rest makes the measure complete.

**C7 — chords only in Vocal.** A chord token in `Ins` MUST be rejected with `chord` (parameter `voice` = `Ins`). This includes a chord string whose closing quote was removed by a cut; the token is still a chord start in `Ins`, and the score is rejected at the end of reading even though the unfinished string is not a finished chord event. A score without `Ins` has no such problem. Reading result: no chord events in `Ins`.

**C8 — hasChords.** The reading result reports `hasChords: true` exactly when the text contains at least one chord token, finished or not. An unfinished chord string in a cut tail (X4) is not a chord event and has no name or position in `chords`, but it still counts here: a score that carries chord material is treated as carrying chords wherever that matters (for example a mode that forbids chords), and removing all chords removes those bytes too. When the cut ends inside such a string, the reading result also sets `truncation.unfinishedChord: true`; the field is absent otherwise, and the writer drops the tail with the last chord. Reading result: the boolean and the optional truncation field.

## V. Voice agreement

**V1 — voices.** `Vocal` MUST be present in every score. `Ins` MAY be absent. When both are present, the header order is `Vocal` then `Ins`, and every group has the same two-block order. Reading result: `["Vocal"]` or `["Vocal", "Ins"]`.

**V2 — per-group bar count.** In every complete group, the `Vocal` block and the `Ins` block MUST have the same number of measures. A difference is rejected with `bar-count` (parameters `vocal` and `ins`). The one exception is the cut tail X9: at the end of the text, an `Ins` block with fewer measures than the `Vocal` block of the final group is accepted as truncated; an `Ins` block with more measures is rejected. Reading result: equal measure counts in every complete group.

**V3 — bar grid and meters.** For every measure index that both voices have as a complete measure, the measure start, length, and meter MUST be identical in both voices. A mismatch is rejected with `bar-length` reason `voices`. A same-length but different meter (for example `4/4` against `2/2`) is a mismatch. Reading result: one shared grid of measures.

**V4 — key-change positions.** The ordered key timeline of each voice consists of the header key at position 0 and every `K:` field and inline `[K:...]` with its position and key. The two timelines MUST be identical when restricted to positions strictly before the shorter voice’s end (the end of its last complete measure). A difference is rejected with `header` field `K` reason `voices`. An explicit `K:` line adds an entry even when it repeats the current key, so both voices MUST state it or neither; a redundant line in one voice alone is a mismatch. Reading result: the shared key timeline, with the effective key at every position.

**V5 — Ins carries no chords.** `Ins` MUST NOT contain a chord token (C7). Reading result: no chord events in `Ins`.

**V6 — Vocal only.** A score with only `Vocal` is valid. With one voice, V2, V3, and V4 do not apply; the `Vocal` timeline alone is the score’s timeline. Reading result: the single voice.

**V7 — different music is allowed.** The two voices MAY differ in notes, rests, pitches, durations, ties, and chords (subject to V5). They MUST agree only on the measure counts per group, the bar grid and meters, and the key-change positions. Reading result: independent note and chord lists per voice on the shared grid.

**V8 — cut comparison scope.** When the text is truncated and `Ins` is missing or short, V2–V4 are checked only on the complete measures both voices actually have. A missing final `Ins` block therefore cannot create an agreement error. Reading result: the shared prefix, plus the cut position (X).

## X. Truncation

**X1 — a cut is legal only at the end.** A cut is a text that stops before a construct is complete. A cut construct is accepted only when its bytes end the text (apart from T3 trailing blank lines). A cut-like construct followed by another line, or a missing closing barline followed by another line, MUST be rejected by the rule for that construct; in particular an unfinished token in a non-final line is `token`, a missing barline in a non-final music line is `token` reason `no-barline`, and a partial `V:` line that is not last is `voice-order`.

**X2 — the truncation report.** Every accepted cut sets `truncated: true` and fills `truncation` with:

- `voice`: the voice whose reading stopped, one of `Vocal` or `Ins`;
- `measure`: the 1-based measure number within that voice where the cut is;
- `short`: `true` when the cut is inside a measure whose finished tokens last less than the bar length, `false` otherwise;
- `unfinishedChord`: `true` only when the cut ends inside an unfinished chord string (X4, C8); the field is absent otherwise.

`measure` is `1 + (number of complete measures already read in that voice)` for a cut before a new measure or between blocks, and is the partial measure’s own number when the cut is inside a measure. A complete text has `truncated: false` and no `truncation` value. The reader MUST report the cut even when all measures that can be read are complete (for example a missing final block).

**X3 — accepted cut positions.** A score MAY end with any one of these cuts:

- (a) inside the final measure, after any number of finished tokens;
- (b) inside a chord token, an accidental, or an inline key token, in the final measure;
- (c) at a barline of the final music line, with the closing `|` absent;
- (d) immediately after the `V:` line of a block, before its optional `M:`/`K:` fields or its music line;
- (e) after an optional `M:` or `K:` field line of a block, before the music line;
- (f) inside the final `V:` line, as a proper prefix of the expected line;
- (g) between the two voice blocks of a group, so the `Ins` block is missing or has fewer measures;
- (h) after one or more `% ` section comments, or after a lone `%` line, at the very end;
- (i) after a final note that continues a tie with a different pitch (P14);
- (j) after a complete final block, when the `Ins` block of that group would be required but is absent.

**X4 — unfinished tokens.** In the final measure of a cut, the remaining bytes MAY be one of these unfinished token forms: `"` followed by any characters up to the end of the line with no closing `"`; `[`, `[K`, or `[K:` followed by any characters up to the end of the line with no `]`; or a lone `^`, `^^`, `_`, `__`, or `=`. Such a remainder is accepted only as the end of the text. It is not a note, a rest, a chord, or a key change in the reading result; it has no start, duration, or pitch; it does not set an accidental or a key. Its bytes are kept. The cut is reported in the current measure (X2), with `unfinishedChord: true` when the remainder is an unfinished chord string (C8). Any other unrecognized remainder is rejected with `token`.

**X5 — a cut tie continuation before its octave marks.** If the last token of a cut measure is a note that continues a pending tie and its computed pitch differs from the tied pitch, the reader MUST accept the text as a cut and MUST treat that token as unfinished: it is absent from `notes`, contributes no duration, and does not set the letter state. The preceding tied note keeps `tie: true`. This is the only note token that may be unfinished; a note token that is complete apart from a possible later octave mark but whose pitch already matches is a finished note. D6 still applies: a token whose duration would pass the bar end is rejected, not kept as an unfinished cut.

**X6 — a trailing field line.** If the last line is a block field line beginning exactly `M:` or `K:` in the field position immediately after that block’s `V:` line (or after another of its field lines), the reader MUST accept it as a cut without validating or applying its value. This includes a duplicate field, an invalid meter, and an invalid key: none of them is reported, because the line is read as cut bytes. If the last line is exactly `M` or `K` (no colon) in that same field position, it is likewise accepted as a cut. In both cases the cut is before the music line of that block, in the block’s voice, and `short` is `false`.

**X7 — a cut inside a `V:` line.** If the last line is a non-empty proper prefix of the `V:` line expected at that point, the reader MUST accept it as a cut. The cut is in that expected voice, at its next measure, `short: false`. A last line that is a prefix of a different voice’s line, or a wrong complete line, is rejected with `voice-order`.

**X8 — a cut before a music line.** If the text ends after a block’s `V:` line or after its `M:`/`K:` fields, the reader MUST accept it as a cut in that block’s voice at its next measure, `short: false`. No measure is added for the missing music line.

**X9 — a short final Ins block.** In the final group, if the text ends after an `Ins` music line that has fewer measures than the `Vocal` music line of the same group, the reader MUST accept the text as truncated. The cut is in `Ins` at its next measure; `short` is `false` if its last measure was complete, or `true` if that measure was itself a partial cut. The `Ins` music line MUST be the last line of the text: the measure counts of a group are compared as soon as its last block is read, so a short `Ins` block followed by any further line, even a section comment that X11 would otherwise accept, is rejected with `bar-count`. If `Ins` has more measures than `Vocal`, the score is rejected with `bar-count` (parameters `vocal`, `ins`). A difference in any non-final group is rejected with `bar-count`.

**X10 — a missing closing barline.** The final music line MAY omit its closing `|`. The line is split into measures as usual (M1). Its last measure is partial. If the finished tokens of that measure total less than the bar length, the measure is incomplete, the cut is inside it, and `short: true`. If they total exactly the bar length, the measure is complete and is included; the cut is at the following measure of that voice, `short: false`. If the line is not the final line, a missing closing barline is rejected with `token` reason `no-barline`.

**X11 — cuts after comments.** One or more `% ` section comments, optionally followed by a final `%` line, at the very end of a text that already has at least one music line are accepted as a cut, provided the group before them is complete (a short `Ins` block before them is rejected by X9). A single `%` line with no `% ` comment before it is included in this form. The cut is at the next measure of the first header voice (`Vocal`), `short: false`. The comments still open sections (S); a trailing `% name` therefore creates a final section with no measures. If no music line has been read yet, the score is rejected with `bar-count` reason `no-music`.

**X12 — no cut before the first music.** A text that ends after the header key line, or after comments but with no music line anywhere, MUST be rejected with `bar-count` reason `no-music`. A text that ends inside the header before the key line is rejected by the header rule of the missing line.

**X13 — cuts are not accepted earlier.** An unfinished token, a missing barline, a missing voice block, or a partial measure before the end is not a cut: it is a rejection under the rule for that construct. The accepted cut forms in X3–X11 apply only to the final bytes of the text.

**X14 — the partial measure is not a complete measure.** A partial measure is not added to `measures`, does not advance the voice’s measure grid or total time, and has no bar record for V3. It still counts as one measure on its music line for B5 and for the per-group bar-count comparison V2. Its finished notes and rests ARE reported in `notes` at their exact starts and durations. Its unfinished token is absent (X4, X5). The next measure number for `truncation.measure` is the partial measure’s number.

**X15 — a dangling tie is not itself truncation.** A tie with no continuation (P13) may occur at the end of a complete, closed score; it does not set `truncated`. A written `-` does not make the text a cut.

**X16 — no truncation.** A text that ends with a closed music line, has every required voice block and music line, and passes every other rule has `truncated: false`. Trailing whitespace and trailing blank lines do not change this (T2, T3). A complete score must not rely on any cut form.

**X17 — cut bytes are preserved.** The reader keeps the bytes of a cut tail verbatim (after T1–T3); a writer that preserves an unchanged cut tail MUST emit those bytes unchanged. This is a byte-preservation rule only; the cut tail has no events beyond the finished tokens in X14.

**X18 — a whole-measure rest in a cut line.** A final music line that ends with `Z`, `Z2`, `Z3`, or `Z4` but no closing `|` has that many complete measures; the cut is at the next measure, `short: false`. `Z` is never partial; a `Z` measure has no unfinished token.

## S. Sections

**S1 — the section marker.** A section comment is a line that begins exactly with `% ` (percent and one space). The section name is all remaining text after that prefix, including any further spaces and punctuation, after T2 has stripped trailing whitespace. Because of T2, a line written as `% ` with nothing after it reads as `%`, which is not a section comment (S7); a section name is therefore never empty. Reading result: a section with that name.

**S2 — where a section marker may appear.** A section comment MAY appear only at a group boundary: before the first `V:` line of a group, or after the last music line of a group and before the next group. It MUST NOT appear between the `Vocal` and `Ins` blocks of one group, after a `V:` line, or between a `V:` line and its music line. A `% ` line in any other position is rejected with `comment-position`. Reading result: none for a rejected score.

**S3 — several comments.** Two or more consecutive `% ` lines are allowed at a group boundary. Each opens a section. They all have the same first measure (the next measure to be read); the earlier sections therefore have zero measures. Reading result: the sections in text order, each with its name and first measure.

**S4 — section extents.** The first measure of a section is the number of complete measures already read in `Vocal` plus one, expressed as a measure index starting at 1 in the reading result. A section ends immediately before the next section’s first measure; the last section ends at the end of the score, and a cut partial measure belongs to it. If there is music before the first section comment, the reading result begins with an unnamed section (name `""`) starting at measure 1. Reading result: the ordered sections, including empty ones.

**S5 — no musical effect.** A section comment does not change the meter, the key, the measure grid, the position of any note, or the duration of anything. Reading result: sections only.

**S6 — a trailing section.** A `% ` comment at the very end of a text that has at least one music line is a cut (X11). It still opens a section whose first measure is the next measure and whose measure count is zero. Reading result: the final empty section and `truncated: true`.

**S7 — a lone percent at the end.** A line containing exactly `%` is not a section comment. When it is the last line of the text and stands at a group boundary, it is accepted as a cut marker (X11) and opens no section. Reading result: a cut, no section.

**S8 — `%name` without the space.** A line that begins with `%` but not `% ` is not a section comment. Where a voice block is expected it is rejected with `comment-position`; it cannot appear at a group boundary. Reading result: none for a rejected score.

**S9 — a percent elsewhere.** A lone `%` that is not the last line, any `%` byte inside a music line, and any `%` line (including `%name`) where a music line is expected are rejected: where a voice block is expected with `comment-position`, and where a music line is expected or inside one with `token` (no barline or unrecognized token). Reading result: none for a rejected score.

## Writing

A writer that implements these rules MUST produce text that reads back to the same score. These requirements are format rules only; editing behaviour is outside this document.

**W1 — line endings and whitespace.** Write LF line endings only, no CR, no byte-order mark, no trailing whitespace, and no blank lines except optionally one final LF after the last line. This governs every line the writer writes; a line it copies untouched keeps the bytes it was read with, including trailing whitespace, and a line it writes or rewrites carries none. Do not rely on a reader’s trimming.

**W2 — header.** Write the fixed header in order: `X:1`, `T:`, `M:<n>/<d>`, `L:1/<d>`, `Q:1/4=<bpm>`, the exact `Vocal` definition, optionally the exact `Ins` definition, and `K:<key>`. Write no other header field. Write a new `bpm` from 20 through 400; keep an unchanged `Q:` line exactly as read (H5). Write only a key from H9 and a meter and unit from H3 and H4.

**W3 — voices and groups.** Write `Vocal` first and, if used, `Ins` second in the header. In the body write one `Vocal` block and then, if `Ins` is present, one `Ins` block per group. Never write `Ins` before `Vocal`, never write an `Ins` block in a Vocal-only score, and never omit a required `Ins` block.

**W4 — block shape.** Each block is its exact `V:` line, zero or one `M:` line, zero or one `K:` line (the two field lines MAY be in either order), and exactly one music line after them. Never write a second `M:` or `K:` in the same block, and never write a field after the music line.

**W5 — music lines.** Write one through four measures on every music line after `Z` expansion. End every music line, including the last, with exactly one `|`. Never write an empty measure, `||`, `|]`, `|:`, `:|`, a repeat, or any other barline. Never write a missing closing barline.

**W6 — measures and durations.** Use only the durations in D1. Write no leading zeros in a duration. Fill every measure exactly to its meter. Split a longer value into tied values from D1 rather than writing an unsupported value. Use `Z` only as the complete body of a whole-measure rest, with `Z2`–`Z4` for two through four complete measures; never attach a chord or a note to a `Z` measure.

**W7 — meter and key changes.** When a group changes the meter or key, write the matching `M:` or `K:` line at the start of both voice blocks of that group, at the same musical position. When a key changes inside a measure, write `[K:...]` at the same offset in both voices. Write a redundant `K:` line in both voices or in neither, because it creates a key-change entry. Never change meter or key in only one voice.

**W8 — accidentals.** Write an accidental on every note whose sounding alteration differs from what the current key signature and the measure’s earlier accidentals would give. Write `=` explicitly for a natural that cancels a sharp or flat. Write the accidental on a tied continuation when needed to keep its pitch unambiguous; do not rely on the inherited tied pitch except when reproducing an existing tie. Remember that an accidental holds by letter across octaves (P4).

**W9 — ties.** Write `-` immediately after the note that continues. The next note token in the same voice MUST have the same sounding pitch. Do not tie into a rest or a `Z` measure. Do not end a complete score with an unresolved tie: either write the continuation or remove the `-`.

**W10 — chords.** Write a chord as `"Name"` immediately before the `Vocal` note or rest that carries it. Use only C1–C4 names. Write chords only in `Vocal`. Give every chord a following note or rest in the same measure, and never write a chord after the measure is full. Do not write a chord on a `Z` measure.

**W11 — sections.** Write each section marker on its own line as `% ` followed by the name, before the group where the section starts. Never write a marker between the two blocks of a group or between a `V:` line and its music line. Consecutive markers create empty sections as S3 says; a complete score SHOULD give every section at least one measure, but an empty section is readable.

**W12 — no other notation.** Write no lyrics (`w:`, `W:`), no directives, no tuplets, grace notes, slurs, decorations, repeats, alternative endings, custom voices, `P:` fields, or any other ABC feature. Write no text outside the header, body groups, and section comments.

**W13 — pitch spelling.** For a sharp key, C major, or A minor, spell chromatic notes with sharps; for a flat key, spell them with flats; use double accidentals only when the spelling requires them. Keep every sounding pitch within MIDI 0–127.

**W14 — complete scores only.** A writer that produces a new score MUST write a complete score with every block and closing barline; it MUST NOT emit a cut tail. A writer that edits a cut score keeps its cut: an unchanged cut tail is emitted byte for byte (X17); bars before it MAY be rewritten under W2–W13; a rewritten partial measure keeps its finished tokens and its X4 remainder, and keeps an X5 remainder only while the tie into it is unchanged. An edit after which the text would read with a different cut, or with none, is not writable.

**W15 — the two cut repairs end the cut.** A command that repairs a cut is not an ordinary edit under W14. `fill` pads every voice that stops before the score's last measure with rests, through that measure, so the text reads complete. `delete` removes the incomplete measure in every voice that has one, with its unfinished bytes, and removes the measure itself when no voice keeps material in it; it refuses when another voice still uses the measure. Both leave a complete score with no cut. Every rest is written in D1 values, splitting a longer length into consecutive rests.

**W16 — a cut that only a bar command may move.** The three commands that change the bar structure — `insertBar`, `deleteBars` and `setSectionMeter` — may state a boundary cut of `Vocal` in `Ins` when `Ins` still has to open its block in the current group and has no measure at or after the cut. The writer then uses the first measure `Ins` lacks and keeps every finished measure before it. No other command may move a cut: every other command copies the cut's lines exactly as they were read (X17), including a final `V: Vocal` block with no music line, because the reader, the checker and the source already accept that writing. This is the exception to W14's "a different cut is not writable", the way W15 is an exception for the two repairs, and it is limited to those three commands.

**W17 — a short final `Ins` block.** In the final group, the partial `Ins` measure and every later `Vocal` measure stay in one group: the `Vocal` block comes first, then the short `Ins` block that ends the text (X9). A short `Ins` block before any later group would be a `bar-count` error (V2).

**W18 — an X5 tail whose tie moved.** When an edit changes the pitch of the note an X5 tail continues, the writer rewrites the tail's note so its computed pitch still differs from the tied note (P14). It compares the tail's computed pitch under the key state the edit leaves, not only the tied note's MIDI: deleting an inline `[K:…]` can change how the old tail bytes read without changing that MIDI. Keeping bytes that now compute the tied pitch would turn the tail into a finished continuation.

## Reading diagnostic codes

The following is the closed set of reading diagnostic codes. Every rejection in this document names one of them. Parameters are optional; `bar` is 1-based within the voice named by the context.

| code | parameters | meaning |
|---|---|---|
| `header` | `field` (`X` `T` `M` `L` `Q` `V` `K`), `value`, `reason` (`wrong` `repeated` `voices`) | A fixed header line is missing, out of order, or has a bad value; a block `M:`/`K:` field is invalid or repeated; a key timeline differs between voices. |
| `voice-order` | `expected` | A `V:` line is wrong, missing, or out of order, or a line that should be a voice block is not one. |
| `token` | `token`, `reason` (`unrecognized` `no-barline` `empty-bar` `mixed-octave` `rest-decoration`), `bar` | A byte sequence is not a token; a non-final music line lacks its closing barline; a measure body is empty or a barline is unsupported; octave marks are mixed; a rest carries a note mark. |
| `duration` | `value`, `digits`, `bar` | A duration is not in D1, or the digits field has more than two characters. |
| `bar-length` | `bar`, `meter`, `actual`, `expected`, `reason` (`short` `overflow` `full` `voices`) | A measure is short, a token overflows it, a token starts at or after its end, or the two voices disagree on a measure’s start, length, or meter. |
| `bar-count` | `count`, `max`, `vocal`, `ins`, `reason` (`no-music` `too-many` `voices`) | A music line has zero or more than four measures; the score has no music line; or the voices’ measure counts differ outside the cut exception. |
| `tie` | `reason` (`rest` `whole-bar-rest` `pitch`), `bar` | A tie enters a rest or whole-measure rest, or its two pitches differ. |
| `chord` | `name`, `voice`, `bar` | A chord name is outside the grammar or a chord appears in `Ins`. |
| `pitch-range` | `midi`, `bar` | A finished note is below MIDI 0 or above MIDI 127. |
| `comment-position` | `expected` | A `%` line appears where a section comment is not allowed. |
| `empty-line` | `expected` | A blank line appears inside the body. |

No other reading code exists.

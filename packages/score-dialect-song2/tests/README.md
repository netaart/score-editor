# Test data for the song2 dialect

`RULES.md` (one level up) is the format. The files here are the shared evidence that a reader follows it.

## `vectors.json`

Small hand-written scores, each pinned to the rules it exercises. Every vector agrees with the checker the music service runs on incoming scores: an accept vector is accepted with the same truncation flag, voices, chord presence, notes, measures and key timeline, and a reject vector is rejected for the one reason it names. When a rule changes, rerun that comparison before changing a vector.

```jsonc
{
  "version": 1,
  "vectors": [
    {
      "id": "kebab-case name",
      "rules": ["P4"],           // the RULES.md rules it exercises
      "text": "X:1\nT:\n…",       // the whole score
      "expect": "accept",         // or "reject"
      // accept only:
      "truncated": false,
      "voices": ["Vocal", "Ins"],
      "hasChords": false,         // RULES.md C8: unfinished chord strings count
      "notes": { "Vocal": [{ "start": "0", "duration": "1", "pitch": 66, "tie": false }] }, // optional
      "chords": { "Vocal": [{ "at": "0", "name": "G" }] },                                 // optional
      "bars": { "Vocal": [{ "start": "0", "length": "4", "meter": "4/4" }] },
      "keys": { "Vocal": [{ "at": "0", "key": "G" }] },
      // reject only:
      "code": "duration"          // a reading code from RULES.md
    }
  ]
}
```

- `start`, `duration`, `length` and `at` are reduced fractions of a quarter note from the start of the score, as strings (`"0"`, `"3/2"`, `"12"`).
- `notes` lists every finished note and rest of that voice in order; `pitch` is MIDI, `null` for a rest; a whole-measure rest is one rest lasting the measure. An unfinished token at a cut (RULES.md X4, X5) is absent.
- `bars` lists the complete measures of `Vocal` only; a partial measure at a cut is not in it (X14).
- `keys` is the `Vocal` key timeline: the header key at 0, then every `K:` field and inline `[K:…]` in order, even when two share a position or one repeats the key in force.

## `samples/` and `samples.json`

Real song2 scores, each traced to one of our own generations; none is an upstream example. `samples.json` records, for each file, what the checker reports: the truncation flag, the voices and chord presence. Every sample must read and write back byte for byte.

# @neta-art/score-dialect-song2

The `song2` score dialect for [`@neta-art/score-editor`](../score-editor): its identity (`song2Id`), its declarative constraints (`song2Constraints`: voices, keys, tempo range, durations, meter rule, chord vocabulary, section marker) and the `song2Dialect` that reads and writes the format.

`parse(text)` follows [RULES.md](RULES.md), accepts a truncated tail at the end, never throws, and returns the shared score model plus diagnostics. `serialize(score)` writes back the normalized text byte for byte. The package depends on the editor package for types only.

MIT licensed.

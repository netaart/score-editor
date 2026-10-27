# @neta-art/score-dialect-song2

The `song2` score dialect for [`@neta-art/score-editor`](../score-editor): its identity (`song2Id`), its declarative constraints (`song2Constraints`: voices, keys, tempo range, durations, meter rule, chord vocabulary, section marker) and the `song2Dialect` that reads and writes the format.

`parse(text)` follows [RULES.md](RULES.md), accepts a truncated tail at the end, never throws, and returns the shared score model plus diagnostics. `serialize(score)` writes every bar whose content did not change with its original bytes and rewrites a changed bar whole under RULES.md "Writing". A cut measure keeps its X5 tie continuation while the tie still reads unfinished (W18); when the tie is lost and no finished token is left to state the cut, the writer ends the partial measure with a lone `^` X4 remainder. `check(score)` writes the score, reads it back and reports a reading diagnostic when the text does not read, or `write-mismatch` when it reads differently. The package depends on the editor package for types only.

For an agent writing or repairing a `.abc` by hand, [WRITING.md](WRITING.md) is the short path: the smallest correct score, the rules agents break most with a right and a wrong example, and the read-back check to run before handing it over. [RULES.md](RULES.md) remains the normative specification. Both pages ship in the package.

MIT licensed.

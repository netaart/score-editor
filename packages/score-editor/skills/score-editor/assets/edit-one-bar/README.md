# Edit one bar

This example edits one bar of a real-sized `song2` score through the headless layer and writes back the project the
command returned. It reads `score.abc`, finds the first pitched `Vocal` note in bar 5, sends one `setChord` command,
reads the diagnostics, and shows the written score. The project is in `melody` mode, so the accepted edit carries the
`melody-with-chords` notice; a notice is not a refusal. Every line other than the one holding bar 5 stays byte for
byte the same.

The page imports both packages from esm.sh with `?bundle&target=es2022`, so it needs no build step. Serve this
directory over HTTP; module scripts and the `fetch` of `score.abc` do not run from `file://`. The editor skill's
`references/edit-a-score.md` explains the same sequence for a task, and
[`RULES.md`](../../../../../score-dialect-song2/RULES.md) is the score format.

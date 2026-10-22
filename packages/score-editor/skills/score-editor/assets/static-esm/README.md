# Static page example

A static page that imports both packages from esm.sh, the way a page without a build step can. It mounts several view
parts on one editing session in a layout of its own, registers a custom tool and runs it, reads the score with the
`song2` dialect and writes one command back with `applyScoreCommand`.

```sh
# From this directory, with any static file server:
npx serve .
```

Open the printed URL. A module script cannot run from `file://`, so open the page over HTTP.

Both imports pin the version this skill ships in:
`https://esm.sh/@neta-art/score-editor@<version>?bundle&target=es2022` and the same for
`@neta-art/score-dialect-song2`.

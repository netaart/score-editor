# The CSS-variable theme

Use the theme when the editor should look like the host. The package ships no palette, font or brand. It reads public
`--sce-*` variables from the element it is mounted on, or from any ancestor, and derives neutral defaults where the
host maps nothing. Set the variables on the editor's root or on a wrapper; set them on `:root` to theme the page.

## The public variables

| Variable | Controls | Unmapped default |
| --- | --- | --- |
| `--sce-color-bg` | Ground of the roll and button fills | `#ffffff` light, `#1b1c1f` dark |
| `--sce-color-text` | Text | `#18181b` light, `#ececee` dark |
| `--sce-color-surface` | Toolbar, header rows, track head, pitch column, popover | 5% of text mixed into bg |
| `--sce-color-muted` | Bar numbers, octave labels, labels and the empty-chord message, the badge | 66% of text mixed into bg |
| `--sce-color-line` | Beat lines, row rules, panel borders | 13% of text mixed into bg |
| `--sce-color-line-strong` | Bar lines, section-band edges, marks, chords, cut hatch, button and badge borders, popover border | 28% of text mixed into bg |
| `--sce-color-accent` | Focus ring, checked menu dot | `#2457d6` light, `#7da3ff` dark |
| `--sce-color-note` | Note fill | the accent value |
| `--sce-font-family` | Font family | the host's inherited font |
| `--sce-radius` | Base corner radius | `4px` |
| `--sce-row-height` | One pitch row, and a note's height | `14px` fine pointer, `24px` coarse pointer |
| `--sce-beat-width` | Width of one quarter note at 100% zoom | `40px` |
| `--sce-keys-width` | Width of the pitch column | `44px` |

`--sce-color-surface`, `--sce-color-muted`, `--sce-color-line` and `--sce-color-line-strong` are derived from the
mapped bg and text with `color-mix`, so a host that maps only `--sce-color-bg` and `--sce-color-text` still gets a
coherent set of greys in either colour scheme. Map one of the four only to override that one.

Names beginning `--sce-_` are private aliases. Per-instance values such as `--sce-ticks`, `--sce-rows`, `--t`, `--d`,
`--w` and `--r` are written by the editor itself. Do not set or document private names.

## Usage

```html
<style>
  .score-host {
    --sce-color-bg: #0f1115;
    --sce-color-text: #f4f4f5;
    --sce-color-accent: #8ab4ff;
    --sce-color-note: #8ab4ff;
    --sce-font-family: "Inter", system-ui, sans-serif;
    --sce-radius: 6px;
    --sce-row-height: 20px;
    --sce-beat-width: 48px;
  }
</style>
<div class="score-host" id="editor"></div>
```

The editor follows the page's `color-scheme` for its light and dark defaults. Every class is prefixed `sce-` and every
public variable `--sce-`; the package's style sheet does not style the host's plain elements. For when to mount inside
a shadow root, see [the spike's style-isolation decision](https://github.com/netaart/score-editor/blob/main/docs/spike.md).

Changing a variable restyles existing parts without remounting them. For a colour the variable contract cannot serve,
derive it from the mapped bg and text on the host side rather than reaching for a private name.

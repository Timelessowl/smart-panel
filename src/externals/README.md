# External references and adaptations

Keep reusable code adapted from external approaches directly in this directory.
Do not add a separate effects subdirectory. Imports continue to use the individual
modules; Rollup bundles reachable JavaScript into the extension.

| Module | Reference | Local implementation |
| --- | --- | --- |
| `backdropCapture.js` | [Blur My Shell PR #976](https://github.com/aunetx/blur-my-shell/pull/976) | GJS framebuffer capture, per-view texture retention, damage handling, and cleanup. |
| `roundedBackgroundBlur.js` | [Blur My Shell PR #976](https://github.com/aunetx/blur-my-shell/pull/976) | Native ACTOR-mode blur around a captured backdrop child, with a CSS-driven rounded mask and unchanged foreground layout. |

These are project-specific implementations following the referenced architecture,
with local GNOME 48.7 compatibility choices and regression tests in
`tests/roundedBackgroundBlur.spec.mjs`. Preserve provenance when adapting further
upstream code; identify its source revision, license, and local changes.

Just Perfection's API has been reviewed in
[the API assessment](../../docs/just-perfection-api-review.md). It is not included as
a runtime module.

# External references and adaptations

Keep reusable code adapted from external approaches directly in this directory.
Do not add a separate effects subdirectory. Imports continue to use the individual
modules; Rollup preserves reachable JavaScript modules in the extension.

| Module | Reference | Local implementation |
| --- | --- | --- |
| `backdropCapture.js` | [Blur My Shell PR #976](https://github.com/aunetx/blur-my-shell/pull/976) | GJS framebuffer capture, per-view texture retention, damage handling, and cleanup. |
| `roundedBackgroundBlur.js` | [Blur My Shell PR #976](https://github.com/aunetx/blur-my-shell/pull/976) | Native ACTOR-mode blur around a captured backdrop child, with a CSS-driven rounded mask and unchanged foreground layout. |

These are project-specific implementations following the referenced architecture,
with local GNOME 48.7 compatibility choices and regression tests in
`src/tests/unit/blur/roundedBackgroundBlur.test.js`. Preserve provenance when adapting further
upstream code; identify its source revision, license, and local changes.

The mask's offscreen-origin calculation also follows Mutter's
[`_clutter_actor_box_enlarge_for_effects()`](https://github.com/GNOME/mutter/blob/6145511b9b0f9b597b620d869855bfe61d045c96/clutter/clutter/clutter-actor-box.c#L505)
and [`ClutterOffscreenEffect`](https://github.com/GNOME/mutter/blob/6145511b9b0f9b597b620d869855bfe61d045c96/clutter/clutter/clutter-offscreen-effect.c#L310)
at revision `6145511b9b0f9b597b620d869855bfe61d045c96` on `gnome-48`
(LGPL-2.1-or-later). The local GJS adaptation uses public paint-volume,
allocation, texture, and resource-scale APIs to undo native buffer padding in
the fragment shader. It does not change widget allocations, CSS radii, or blur
strength. Regression doubles include padded textures, fractional allocations,
native resource scales, and the allocation fallback when no paint volume exists.

Just Perfection's API has been reviewed in
[the API assessment](../../docs/just-perfection-api-review.md). It is not included as
a runtime module.

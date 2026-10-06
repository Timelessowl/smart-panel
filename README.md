# Simple Bottom Panel

A minimal GNOME Shell extension that displays five independent panel pieces at
the bottom of every connected monitor:

1. A square Debian menu button.
2. A real app/window dash with favorites, running items, and overflow.
3. A centered, currently passive search entry.
4. An indicator area, hidden until indicators are supplied.
5. Date and quick-settings placeholders.

The transparent space between pieces remains part of the panel's input area.
Layout values, panel padding, gaps, and widths can all be changed in
`constant.js`. `SECTION_HEIGHT` is content height only. BottomPanel adds
`SECTION_FRAME_WIDTH` and `SECTION_BORDER_WIDTH` on both sides when allocating
sections. `PANEL_HEIGHT` adds those edges plus top and bottom padding to content
height. Defaults are 64px content, an 8px translucent band, a 1px solid outline,
82px outer section height, and 122px panel height. Horizontal padding stays inside the full-width
panel actor, so visual outer spacing never becomes a pass-through gap.

All five section classes derive from the GObject-registered `BaseSection`, which
is itself an `St.Widget`. Registered actors use standard JavaScript constructors
and are actors directly; there is no legacy `_init()` or `this.actor` wrapper.
The base class owns only the shared native frame containing the content, and a
plain `canExpand` property. Expandable sections set that property in their own
constructors. `BottomPanel._updateGeometry()` is the single
owner of panel and section placement and sizing. Dash and indicators opt into
expansion; Debian, search, and system sections do not. `SECTION_FRAME_WIDTH` in
`constant.js` changes every frame in one place.

`themeManager.js` follows GNOME 48's system Dark Style preference and applies a
`.dark` or `.light` class to every monitor panel. The two palettes live in
`style/_themes.scss`. Section surfaces are opaque; the surrounding frame uses 40%
alpha by default, with an 8px default thickness and a separate 1px opaque outer
outline (white in dark theme, black in light theme). BaseSection has a transparent
background and contains an `St.Bin` frame. That frame paints the translucent
background and solid outline, and uses native padding to inset its opaque content
child. Native St allocation, `St.Bin`, and `Clutter.BinLayout` handle the inset,
including CSS scaling; BaseSection has no custom allocation or paint clipping.
Section content heights are 64 logical pixels and icon sizes are unchanged.
The dash counts the frame padding and outline once in its width budget and fits
its rows inside them. Existing control padding avoids a second frame inset.
Frame alpha is configured in the dark/light frame background colors in `style/_themes.scss`;
band and outline thickness stay in `constant.js`. Transparency shows the scene behind
the panel (wallpaper, or a window if one is physically underneath), not an
extension-owned copy of the wallpaper.

Rounded background blur is reusable independently of sections:

```javascript
import {RoundedBackgroundBlur} from './effects/roundedBackgroundBlur.js';

const surface = new RoundedBackgroundBlur({radius: 44, brightness: 1});
surface.set_child(widget); // A St widget styled with CSS border-radius.
parent.add_child(surface);
```

Each surface uses native `Clutter.BinLayout` to stack a decorative backdrop child
below its foreground; no `vfunc_allocate` or per-section geometry code is needed.
The capture/child/mask architecture follows
[Blur My Shell PR #976](https://github.com/aunetx/blur-my-shell/pull/976).
This implementation keeps GNOME's native Gaussian blur in `ACTOR` mode instead
of importing that project's complete effects pipeline. `Shell.GLSLEffect` masks
the finished blur, reading all four foreground CSS radii on every paint. The
original band, outline and controls paint above it and stay sharp and clickable.

Capture coordinates come from the active framebuffer's modelview, projection
and viewport, so monitor origins and native scaling are not applied twice.
Only damaged pixels are copied into each view's retained texture. A partial
update requests a full local repaint, including intersecting blur surfaces, to
avoid capturing stale blur; there is no continuous after-paint loop. The public
`peek_stage_views()`/`layout` APIs select the view and convert damage coordinates;
the unavailable `PaintContext.get_stage_view()` is never called. Buffers are
reused while geometry/context are unchanged and released on view or surface
destruction, including native destruction by a parent.

Change `surface.blur.radius` or `surface.blur.brightness` directly; these native
properties queue repaint automatically. A zero radius disables blurring.
Brightness ranges from 0 to 1, with 1 preserving the scene. Capture failure
leaves the foreground visible and logs one `Rounded background blur:` warning.
No compiled helper is required. Jasmine doubles cover capture, native effect
ordering, damage, scaling and cleanup; actual GPU output still needs a GNOME
48.7 visual check after a Shell restart. The commented original BACKGROUND blur
in BaseSection is retained for comparison.

`monitorManager.js` discovers monitors dynamically and owns one independent
panel instance per monitor. Panels are rebuilt when the monitor layout changes.
Each panel determines its own scale in its constructor: Wayland uses a factor of
one, while X11 uses that monitor's `geometry_scale`.

## Dash

`components/dash/` contains `AppItem` and `WindowItem` models, one Shell-observing
`DashSource`, the `DashIcon` view, and independently testable projection, layout,
and activation logic. `DashSection` owns its views and session-only drag order;
`BottomPanel` remains the authority for its allocated bounds.

Launchpad toggles overview and always uses a 40px icon. Favorites follow GNOME's
list, with Firefox and Files fixed first. They cannot be removed or dragged.
Running items start with a separator; the empty running subsection is hidden.
App icons start at 40px, shrink to 32px when space runs out, then use a `+N`
overflow button. Each monitor makes that decision independently. The expanded
view opens upward above windows and scrolls vertically if necessary. Escape or
an outside click closes it without grabbing unrelated pointer input.

Preferences provide two toggles, both off by default:

- **One icon per window**: off shows one icon per app with up to four window
  dots; on lets each favorite use its oldest `WindowItem` while running, or its
  `AppItem` when no window exists. Additional windows are shown individually
  and without dots in the running subsection.
- **Only this monitor’s windows**: filters running icons and favorite dots to
  that monitor, across all workspaces. Favorites themselves remain visible on
  every monitor. Clicking a favorite with no local window opens a new window.

Repeated clicks on a multi-window app focus its windows in opening order, then
minimize all its represented windows, then start the cycle again. Right-click
menus offer desktop-file actions and favorite/unfavorite controls. Dragging
reorders within a subsection on that monitor only; dragging a running item into
Favorites adds it to GNOME's system favorites. Local ordering is not persisted.
Valid drop targets show a translucent 16px app-icon preview at the insertion
point, without resizing the dash. Its size and opacity live in `constant.js`.
All stub code has been removed. The former stub launcher opens dash preferences.

The extension runtime needs no bundler or package manager. Rollup bundles the GJS
modules and compiles Sass during development; GNOME imports and native APIs stay
external. Node, Rollup, Sass, ZIP tooling, and Jasmine are development dependencies
and are not installed with the extension.

## Window reservation

The panel always reserves its area on every monitor, so maximized windows stop
above it. The bottom panel actor itself is registered as chrome and reserves its
complete height, including the top and bottom padding.

## Build, package, and install

Use Node.js 22 or newer and install the development dependencies with `npm ci`.
Building also requires GLib's `glib-compile-schemas` on your PATH (usually provided
by `libglib2.0-bin` on Debian/Ubuntu or `glib2` on Fedora).

Each command is independent:

- `npm run build` replaces `dist/` with bundled `extension.js` and `prefs.js`,
  metadata, compiled `stylesheet.css`, schema XML, and `schemas/gschemas.compiled`.
- `npm run pack` packages the existing `dist/` into
  `releases/simple-bottom-panel@local.shell-extension.zip`. Extension files sit
  at the ZIP root. This command does not rebuild or install anything.
- `npm run install:local` installs the existing `dist/` into
  `${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/<uuid>/`.
  It stages the complete build before replacing the previous extension directory,
  removing obsolete modules from earlier installations. This command does not
  rebuild or require a ZIP.

Build first; packaging and local installation can then be run separately:

```sh
npm ci
npm run build
npm run pack
npm run install:local
gnome-extensions enable simple-bottom-panel@local
```

Restart GNOME Shell on X11 (`Alt+F2`, then `r`) or log out and back in on Wayland
after installing/updating the build. Open preferences with
`gnome-extensions prefs simple-bottom-panel@local`, or the Debian menu launcher.

For a disposable installation or a custom extension directory, pass the full target:

```sh
npm run install:local -- --dest /tmp/simple-bottom-panel-test
```

Edit Sass in `style/`, using `style/stylesheet.scss` as the entry point. Shared
dark/light palette maps live in `_themes.scss`; panel, Debian, dash, search, and
system/indicator styles have separate partials. Rollup's Sass plugin compiles them
into the `stylesheet.css` expected by GNOME Shell. `dist/` and `releases/` are
generated and ignored by Git. Failed or missing builds must be fixed with
`npm run build` before packaging or installation.

## Tests

Install the development dependencies and run the Jasmine suites:

```sh
npm ci
npm test
npm run test:tooling
```

Tests live in `tests/*.spec.mjs` and use Jasmine's `describe`, `it`, and `expect`.
The GJS harness loads production modules against narrow API doubles; the test
command enables Node's experimental VM modules for those imports. Jasmine
randomizes spec order and fails specs with no expectations.

`test:tooling` uses Node's test runner to build in a temporary project, inspect the
ZIP, and install into disposable targets. It checks native import preservation,
compiled Sass and schemas, obsolete-file cleanup, independent commands, and
failure handling. It requires `glib-compile-schemas`. Stylesheet assertions in
the Jasmine suites compile the Sass source directly, so `npm test` needs no
pre-existing `dist/` or GLib compiler.

To reproduce an order-dependent failure or run matching cases:

```sh
npm test -- --seed=12345
npm test -- --filter="Dash drag and drop"
```

Node and Jasmine are development tooling only. These tests do not establish
native GNOME runtime acceptance; the extension still runs directly in Shell.

## Specifications

The English [OpenSpec index](openspec/README.md) links the master panel contract
and Debian menu, dash, indicator, and system-section specs, designs, and tasks.
Search behavior is intentionally not specified yet. Remaining implementation
gaps and native acceptance checks are tracked explicitly rather than marked done.

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
`src/extension/constants.js`. `CONTENT_HEIGHT` is the 56px content height.
`SECTION_HEIGHT` includes the 8px frame and 1px border on both sides, for 74px
total. `PANEL_HEIGHT` adds 8px of padding above and below, for 90px total.
Dash item widths match their 40px or 32px icons; only the 8px gaps separate them.
Dash section widths also include the 8px edge padding, frame, and border once.
Horizontal padding stays inside the full-width
panel actor, so visual outer spacing never becomes a pass-through gap.

All five section classes derive from the GObject-registered `BaseSection`, which
is itself an `St.Widget`. Registered actors use standard JavaScript constructors
and are actors directly; there is no legacy `_init()` or `this.actor` wrapper.
The base class owns only the shared native frame containing the content, and a
plain `canExpand` property. Expandable sections set that property in their own
constructors. `BottomPanel._updateGeometry()` is the single
owner of panel and section placement and sizing. Dash and indicators opt into
expansion; Debian, search, and system sections do not. `SECTION_FRAME_WIDTH` in
`src/extension/constants.js` changes every frame in one place.

`src/extension/themeManager.js` follows GNOME 48's system Dark Style preference and applies a
`.dark` or `.light` class to every monitor panel. The two palettes live in
`src/style/_themes.scss`. Section surfaces are opaque; the surrounding frame uses 40%
alpha by default, with an 8px default thickness and a separate 1px opaque outer
outline (white in dark theme, black in light theme). BaseSection has a transparent
background and contains an `St.Bin` frame. That frame paints the translucent
background and solid outline, and uses native padding to inset its opaque content
child. Native St allocation, `St.Bin`, and `Clutter.BinLayout` handle the inset,
including CSS scaling; BaseSection has no custom allocation or paint clipping.
Section content heights are 64 logical pixels and icon sizes are unchanged.
The dash counts the frame padding and outline once in its width budget and fits
its rows inside them. Existing control padding avoids a second frame inset.
Frame alpha is configured in the dark/light frame background colors in `src/style/_themes.scss`;
band and outline thickness stay in `src/extension/constants.js`. Transparency shows the scene behind
the panel (wallpaper, or a window if one is physically underneath), not an
extension-owned copy of the wallpaper.

Rounded background blur is reusable independently of sections:

```javascript
import {RoundedBackgroundBlur} from '@/externals/roundedBackgroundBlur.js';

const surface = new RoundedBackgroundBlur({radius: 44, brightness: 1});
surface.set_child(widget); // A St widget styled with CSS border-radius.
parent.add_child(surface);
```

Each surface uses native `Clutter.BinLayout` to stack a decorative backdrop child
below its foreground; no `vfunc_allocate` or per-section geometry code is needed.
The capture/child/mask architecture follows
[Blur My Shell PR #976](https://github.com/aunetx/blur-my-shell/pull/976).
These reusable adaptations live directly in `src/externals/`; their references and
local responsibilities are recorded in [src/externals/README.md](src/externals/README.md).
This implementation keeps GNOME's native Gaussian blur in `ACTOR` mode instead
of importing that project's complete effects pipeline. `Shell.GLSLEffect` masks
the finished blur, reading all four foreground CSS radii on every paint. The
original band, outline and controls paint above it and stay sharp and clickable.
The mask converts Clutter's padded offscreen texture back to actor coordinates,
including its asymmetric buffer origin and native resource scale. Its curved
edge therefore follows the widget allocation rather than the larger buffer.

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

`src/extension/monitorManager.js` discovers monitors dynamically and owns one independent
panel instance per monitor. Panels are rebuilt when the monitor layout changes.
Each panel determines its own scale in its constructor: Wayland uses a factor of
one, while X11 uses that monitor's `geometry_scale`.

## Dash

`src/extension/components/dash/` contains one Shell-observing GObject `DashSource`, native `DashIcon`
views, `ExpandedDash`, and dash layout, action and drag/drop helpers.
The source exposes native `Shell.App` and `Meta.Window` objects through
`getFavorites()`, `getRunningApps()`, `getOpenedWindows()`,
`getOpenMonitorWindows(monitor)`, and `getAppWindows(app, monitor)`.
`getEntries({monitor, favoriteOrder, runningOrder})` returns complete monitor-scoped
favorite/running entries. `DashActions` in `dashUtils.js` owns each dash's activation
cycle; `DashLaunches` shares pending launch placement through the source so concurrent
monitor requests cannot claim the same window. `ExpandedDash` extends `BaseSection`
and owns its grid, scrolling and transient cleanup. `DashSection` assembles the
collapsed view and shares token creation with expansion. `DashDragDrop` owns session-only
local order; `BottomPanel` remains the authority for allocated bounds. Each
`DashSection` connects to the source's `changed` signal with `connectObject`,
which disconnects when that section is destroyed. `BottomPanel` similarly listens
to the section's `layout-changed` signal to update its allocated width.
`MonitorManager` only creates and destroys monitor panels; it does not relay dash updates.

Launchpad toggles overview and follows the dash’s 40/32 px icon size. Favorites follow GNOME's
list, with Firefox and Files fixed first. They cannot be removed or dragged.
Running items start with a separator; the empty running subsection is hidden.
App icons start at 40px, shrink to 32px when space runs out, then use a `+N`
overflow button. Each monitor makes that decision independently. The expanded
view opens upward above windows and scrolls vertically if necessary. Escape or
an outside click closes it without grabbing unrelated pointer input.

Preferences provide two toggles, both off by default:

- **One icon per window**: off shows one icon per app with up to four window
  dots; on lets each favorite represent its oldest visible window while running,
  or its app when no visible window exists. Additional windows are shown individually
  and without dots in the running subsection.
- **Only this monitor’s windows**: filters running icons and favorite dots to
  that monitor, across all workspaces. Favorites themselves remain visible on
  every monitor. Clicking a favorite with no local window requests a new window
  and places that new window on the clicked dash’s monitor. Existing remote
  windows are left in place. New-window menu actions use the same monitor scope.

Repeated clicks on a multi-window app focus its windows in opening order, then
minimize all its represented windows, then start the cycle again. `DashIcon`
derives directly from GNOME Shell's exported `ui/dash.DashIcon`. Shell supplies
its native AppMenu, mouse/touch/keyboard handling, drag gestures, focus behavior
and menu lifecycle. The extension overrides activation for monitor-local window
selection, launch tracking, icon size and its external window-count indicators.
Native New Window and desktop new-window menu actions use Shell's launch-animation
hook to register monitor placement without replacing their action handlers.

A separate `DashItem` bin arranges the 40/32 px button and indicator row. Empty
rows reserve the same space for apps, Launchpad and +N. Launchpad loads its SVG
through `IconStorage`; +N uses a larger label and transparent idle background.
Dots are 5 px with 4 px spacing and a 2 px gap below the icon. Hover corners are
rounded. Fixed launchers keep native menus but omit favorite changes and cannot
start a drag.

`DashDragDrop` owns draggable setup, drop delegates, previews, local order,
and deferred refresh, leaving `DashSection` to assemble the dash and delegate actions. Dragging
reorders within a subsection on that monitor only; dragging a running item into
Favorites adds it to GNOME's system favorites. Local ordering is not persisted.
Valid drop targets show a translucent 16px app-icon preview at the insertion
point, without resizing the dash. Its size and opacity live in `src/extension/constants.js`.
Shell state continues updating during a drag. Only the dragged dash’s view
rebuild waits until drag actors are released; other panels update immediately.
`DashDragDrop` observes the icon's inherited draggable rather than creating a
second drag handler. Journal messages prefixed `[dash-dnd]` report native presses,
starts, cancellation/end, accepted drops, applied orders and rejection reasons.
The installed GI package omits the exported `ui/dash` module; local declarations
and a Rollup alias map that import directly to Shell's existing resource.
All stub code has been removed. The former stub launcher opens dash preferences.

`src/extension/` owns the runtime components, managers, constants, settings schema,
and packaged assets. `src/utils/iconStorage.js` loads the Launchpad SVG through
`Icons.LAUNCHPAD`, and `src/utils/logger.js` provides the shared debug logger.
The photographed dash sources use these paths directly.

The extension runtime needs no bundler or package manager. Rollup bundles the GJS
modules and compiles Sass during development; GNOME imports and native APIs stay
external. Node, Rollup, Sass, ZIP tooling, and Jasmine are development dependencies
and are not installed with the extension.

## Window reservation

The panel always reserves its area on every monitor, so maximized windows stop
above it. The bottom panel actor itself is registered as chrome and reserves its
complete height, including the top and bottom padding.

## Build, package, and install

Install the development dependencies with `npm ci --include=optional`. Install
on the machine that runs the build; Rollup's native dependency differs between
macOS and Linux. Building also requires GLib's `glib-compile-schemas` on your PATH
(`libglib2.0-bin` on Debian/Ubuntu or `glib2` on Fedora).

The entry points and schema live in `src/extension/`; shared components and Sass
remain under `src/extension/components/` and `src/style/`. `rollup.config.js` follows the
provided configuration: ES modules are preserved, Sass produces `stylesheet.css`,
metadata is generated from `package.json`, and schemas, assets and translations
are copied from `src/extension/` before schema compilation.

- `npm run build` builds the extension in `dist/`.
- `npm run package` builds it and creates
  `build/simple-bottom-panel.v1.0.0.shell-extension.zip` with the extension files
  at the ZIP root.
- `npm run dev` installs that existing ZIP with `gnome-extensions install --force`.
  `npm run dev:install` is the same installation step.
- `npm run clean` removes `build/`, `dist/`, and `dist-tests/`.

```sh
npm ci --include=optional
npm run clean
npm run package
npm run dev
gnome-extensions enable simple-bottom-panel@local
```

The commands do not restart the session or stream logs. Reload Shell manually
on X11 (`Alt+F2`, then `r`) or log out and back in on Wayland after updating.
Open preferences with `gnome-extensions prefs simple-bottom-panel@local` or the
Debian menu launcher. Native behavior is currently verified against Shell 48.7;
the package's 45–49 list reproduces the supplied configuration.

## Development checks

`npm run type:check` checks runtime JavaScript with `jsconfig.tsc.json`; no
TypeScript output is installed. `npm run lint`, `npm run format:check`, and
`npm run code:check` provide the photographed lint/format workflow; the matching
fix commands edit the source. Runtime imports keep `@/` mapped to `src/`, native
GI namespace imports, and `@girs/gnome-shell` re-exports.

```sh
npm run type:check
npm test
npm run test:unit
npm run test:integration
```

`rollup.config.test.js` builds the Jasmine suites from `src/tests/` into
`dist-tests/tests/`. Unit suites use narrow GJS API doubles and compile Sass
without needing a pre-existing distribution. The command enables Node's VM
modules for the GJS harness. Integration suites build/package in temporary
projects, check metadata, preserved imports, compiled styles and schemas, and
verify ZIP installation using a temporary stand-in for `gnome-extensions`.
They require `glib-compile-schemas` and never change the desktop session.
These tests do not establish native GNOME runtime acceptance.

`npm run docs` generates API documentation in `docs/api/`. `npm run docs:serve`
serves `docs/`, and `npm run docs:watch` runs the photographed JSDoc watch command.
Generated build, test, ZIP and API documentation output is ignored by Git.

## Specifications

The English [OpenSpec index](openspec/README.md) links the master panel contract
and Debian menu, dash, indicator, and system-section specs, designs, and tasks.
Search behavior is intentionally not specified yet. Remaining implementation
gaps and native acceptance checks are tracked explicitly rather than marked done.

The [Just Perfection API assessment](docs/just-perfection-api-review.md) maps that
extension's Shell overrides to our specifications and intended future integrations.

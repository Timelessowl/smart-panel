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
`constant.js`. `PANEL_HEIGHT` is derived from `SECTION_HEIGHT` plus
the top and bottom padding. Horizontal padding also stays inside the full-width
panel actor, so visual outer spacing never becomes a pass-through gap.

All five section classes derive from the GObject-registered `BaseSection`, which
is itself an `St.Widget`. Registered actors use standard JavaScript constructors
and are actors directly; there is no legacy `_init()` or `this.actor` wrapper.
The base class owns only the shared surface, frame overlay, clipping, and a
plain `canExpand` property. Expandable sections set that property in their own
constructors. `BottomPanel._updateGeometry()` is the single
owner of panel and section placement and sizing. Dash and indicators opt into
expansion; Debian, search, and system sections do not. `SECTION_FRAME_WIDTH` in
`constant.js` changes every frame in one place.

`themeManager.js` follows GNOME 48's system Dark Style preference and applies a
`.dark` or `.light` class to every monitor panel. The two palettes live in
`stylesheet.css`. Section surfaces and frames use solid GNOME-style colors;
only intentionally empty space between sections remains transparent.

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

The extension runtime needs no bundler or package manager. Installation compiles
only the GSettings schema, using `glib-compile-schemas`. Jasmine is a development-only
test dependency and is not installed with the extension.

## Window reservation

The panel always reserves its area on every monitor, so maximized windows stop
above it. The bottom panel actor itself is registered as chrome and reserves its
complete height, including the top and bottom padding.

## Install

```sh
chmod +x install.sh
./install.sh
gnome-extensions enable simple-bottom-panel@local
```

Restart GNOME Shell on X11 (`Alt+F2`, then `r`) or log out and back in on Wayland
after installing/updating the source files. Open preferences with
`gnome-extensions prefs simple-bottom-panel@local`, or the Debian menu launcher.

## Tests

Install the development dependencies and run the Jasmine suites:

```sh
npm ci
npm test
```

Tests live in `tests/*.spec.mjs` and use Jasmine's `describe`, `it`, and `expect`.
The GJS harness loads production modules against narrow API doubles; the test
command enables Node's experimental VM modules for those imports. Jasmine
randomizes spec order and fails specs with no expectations.

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

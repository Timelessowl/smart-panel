# Simple Bottom Panel

A minimal GNOME Shell extension that displays five independent panel pieces at
the bottom of every connected monitor:

1. A square Debian menu button.
2. An expandable dash placeholder starting with five app icons.
3. A centered, currently passive search entry.
4. A blank 2:1 indicator area.
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

## Stub controls

Open the Debian button menu and select **Open stub controls**. The first tab can
populate every monitor's dash with any number of mock items from 3 through 100.
The Indicators tab can populate section four with 0 through 10 mock indicators.
The section is hidden when its `hasIndicators` property is false, otherwise its
`preferredWidth` grows from a square for one indicator by one configurable step
for each additional indicator.
All mock generation and control UI code lives in `stub/`; the dash only exposes
a generic `setApps()` method.

When the dash reaches its allocated boundary before the centered search field,
its final cell becomes a `+N` overflow button. Selecting it opens a multi-row
surface upward. Large populations remain vertically scrollable instead of
growing beyond the monitor. Escape or a click outside closes the expanded dash.
Outside clicks are observed without a modal input grab, so they still reach the
window underneath.

There is no build step and no package manager.

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

When updating an already enabled copy, disable and enable the extension once so
GNOME Shell loads the new source files.

If GNOME Shell has not discovered the extension yet, restart GNOME Shell on
X11 (`Alt+F2`, then `r`) or log out and back in on Wayland.

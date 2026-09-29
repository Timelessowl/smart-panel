# Simple Bottom Panel

A minimal GNOME Shell extension that displays five independent panel pieces at
the bottom of every connected monitor:

1. A square Debian menu button.
2. An expandable dash placeholder with three app icons.
3. A centered search entry with suggestions.
4. A blank 2:1 indicator area.
5. Date and quick-settings placeholders.

The transparent space between pieces remains part of the panel's input area.
Layout values, edge margins, gaps, widths, and search suggestions can all be
changed in `constant.js`.

Every section receives the same theme-aware frame through
`components/sectionFrameManager.js`. Its width is configured once with
`SECTION_FRAME_WIDTH` in `constant.js`; individual section modules do not
contain frame styling logic. Frames are separate non-interactive overlays, so
their width never changes section content allocation. The frame is painted
inside the section's existing outer dimensions, so the configured section width
includes the frame.

`themeManager.js` follows GNOME 48's system Dark Style preference and applies a
`.dark` or `.light` class to every monitor panel. The two palettes live in
`stylesheet.css`.

`monitorManager.js` discovers monitors dynamically and owns one independent
panel instance per monitor. Panels are rebuilt when the monitor layout changes.

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
growing beyond the monitor.

There is no build step and no package manager.

## Preferences

By default, the panel reserves its area on every monitor so maximized windows
stop above it. Open the extension preferences and enable **Allow windows behind
the panel** to restore overlay behavior where windows can extend beneath it.
The reservation is handled by a transparent, non-interactive strip attached to
the bottom edge; the visible floating pieces keep their inset layout. The
reserved work area leaves matching gaps above and below the visible panel.

```sh
gnome-extensions prefs simple-bottom-panel@local
```

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

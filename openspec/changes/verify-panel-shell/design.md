# Panel Shell Design

## Context

The master contract is [panel-shell](../../specs/panel-shell/spec.md).
`extension.js` creates a shared `DashSource` and a `MonitorManager`.
The manager owns one `BottomPanel` per discovered monitor, plus a shared
`ThemeManager` and `TransientInputManager`. Monitor changes currently destroy
and recreate panels. Shared observer state is separate from per-panel views.

## Goals / Non-Goals

Goals: preserve a single geometry authority, consistent solid section framing,
dynamic monitor coverage, compositor-aware scaling, and deterministic cleanup.

Non-goals: new runtime dependencies, a separate strut/frame/scale manager,
search implementation, live indicator discovery, native system-menu integration,
and a custom true-fullscreen window policy.

## Decisions

### Actors are objects, not wrappers

`BaseSection` extends `St.Widget`; sections inherit it and use themselves as
actors, not `this.actor`. Registered classes use
`static { GObject.registerClass(this); }` and constructors. Ordinary properties
such as `canExpand`, `preferredWidth`, and `hasIndicators` avoid getter-only
indirection. `canExpand` defaults to false; dash and indicators set it true.
For indicators this means content-dependent width, not an expanded popup.

### One shared frame implementation

`BaseSection.setSectionContent()` installs one content actor under one decorative
frame actor, with clipping inside the section allocation. The frame's thickness
comes from `SECTION_FRAME_WIDTH`; styling is centralized in `stylesheet.css`.
Frame actors are excluded from picking via `Shell.util_set_hidden_from_pick()`.
This preserves drag-target reachability even when Shell picks non-reactive actors.
Per-section duplicated borders and an external wrapping manager are rejected.

### BottomPanel owns geometry and reservation

`BottomPanel._updateGeometry()` calculates all positions and outer sizes.
Sections provide content-derived preferred widths but do not resize the panel
or infer monitor/search bounds. Panel height is
`SECTION_HEIGHT + PANEL_TOP_PADDING + PANEL_BOTTOM_PADDING`.
Horizontal padding and transparent gaps are inside the reactive panel actor.
The panel itself is registered through `Main.layoutManager.addChrome()` with
`affectsStruts: true`; there is no independent strut actor or overlay toggle.
Only maximized work-area behavior is in scope, not forcing fullscreen apps to resize.

### Scaling is calculated in each panel

The constructor uses `Meta.is_wayland_compositor()` to select a factor of one on
Wayland, otherwise that monitor's `geometry_scale`. Explicit stage geometry is
scaled once; CSS lengths and app icon textures follow native St scaling.
Do not multiply already-native icon texture dimensions a second time. Geometry
rounding is centralized through the panel/section scale helpers, not a DI manager.
Native mixed-scale X11 behavior still requires acceptance checks.

### Theme and transient services have narrow ownership

`ThemeManager` watches `org.gnome.desktop.interface::color-scheme`, selecting
`.dark` only for `prefer-dark`, otherwise `.light`. It styles panels, expanded
dash surfaces, and drag previews. Native popup-menu chrome follows Shell's own
menu styling; this design does not recolor Shell's top-panel menus.
Filled pieces/frame borders are opaque; only unfilled panel space and the
explicit drag ghost are transparent. `TransientInputManager` handles expanded
dash dismissal without a stage-wide input grab. Popup ownership stays with the
feature that created it.

### Installation stays file-based

`install.sh` copies an explicit runtime file list and compiles the schema.
It does not ship test tooling or OpenSpec artifacts. Known obsolete modules
are removed by exact name. Jasmine is declared only as a development dependency
in package.json; neither its packages nor the manifest are installed with the
extension. Documentation validation tooling also remains outside the runtime.

## Risks / Trade-offs

- Full rebuild on monitor changes resets local drag order and expansion → this
  is current behavior; orders are deliberately not persisted.
- Thin decorators can mask drag targets → keep decorations hidden from pick and
  test section-root drop fallbacks.
- Source-level scaling checks cannot establish actual device output → keep
  X11/Wayland and multi-monitor native acceptance unchecked.
- Pointer polling can miss a press shorter than its polling interval → include
  quick outside-click checks in native dismissal acceptance.
- Reinstalling source does not invalidate Shell's module cache → validate with
  a real Shell restart, not disable/enable alone.

## Migration Plan

No new settings or runtime dependency is introduced by this verification change.
Future fixes are deployed through the existing installer and a proper Shell
restart. Preserve the two dash settings and their default values. Roll back a
future implementation fix by reinstalling the prior runtime files and restarting;
do not erase the user's other extension directories.

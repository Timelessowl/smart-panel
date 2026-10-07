# Panel Shell Design

## Context

The master contract is [panel-shell](../../specs/panel-shell/spec.md).
`src/extension.js` creates a shared `DashSource` and a `MonitorManager`.
The manager owns one `BottomPanel` per discovered monitor, plus a shared
`ThemeManager` and `TransientInputManager`. Monitor changes currently destroy
and recreate panels. Shared observer state is separate from per-panel views.

## Goals / Non-Goals

Goals: preserve a single geometry authority, consistent framed opaque surfaces,
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

BaseSection has a transparent background and owns an St.Bin frame whose child
is the opaque section content. The frame's native 8px padding exposes its
40%-alpha background; its separate 1px opaque CSS outline is white in dark theme
and black in light theme. Native St allocation, St.Bin and Clutter.BinLayout handle
border and padding without custom allocation or manual paint clipping. The frame
is a parent container, not an overlay. Band and outline thickness come from
`SECTION_FRAME_WIDTH` and `SECTION_BORDER_WIDTH`; palette colors live in `src/style/_themes.scss`.
BottomPanel still owns outer section geometry. Control padding
and dash row height fit inside the native border without resizing icons or
counting the inset twice. During expansion the collapsed frame and content are
hidden, leaving root bounds and drop delegates intact. The frame is not hidden
from picking, because that would hide its descendants too; picks reach controls
or traverse from the frame to the section root's drop delegate.
Per-section duplicated borders and an external wrapping manager are rejected.

### Reusable rounded background blur

`src/externals/roundedBackgroundBlur.js` is a section-independent St.Widget using
native BinLayout. It stacks a backdrop content actor below the unchanged frame.
The architecture follows Blur My Shell PR #976: capture the live background into
a texture, expose it as Clutter.Content, blur the child, then mask the result.
We retain Shell.BlurEffect in ACTOR mode rather than importing the full upstream
pipeline. A Shell.GLSLEffect mask reads foreground CSS corners and uses
premultiplied-alpha blending. Both effect caches are refreshed at paint time
because captured content changes externally, without a continuous redraw loop.

`src/externals/backdropCapture.js` captures before any child offscreen effects run.
Framebuffer modelview/projection/viewport determine pixel coordinates, avoiding
double scaling. Public actor.peek_stage_views() identifies each framebuffer's
view; its layout/scale convert damage regions. Only damaged rectangles are copied
into persistent per-view buffers. A partial update queues a full local repaint
of the surface and any transitively overlapping surfaces to prevent feedback.
New incomplete captures are not displayed. Buffer geometry includes pixel origin
so moves cannot reuse stale contents. Buffers are released on view destruction,
effect detachment or the wrapper's native destroy signal. GPU capture failure
preserves foreground painting and logs once. BaseSection hides the entire stack
during dash expansion. No widget allocation overrides or compiled helpers are
required. Jasmine doubles verify rendering decisions and lifecycle, not actual
GPU shader execution on GNOME 48.7.

### BottomPanel owns geometry and reservation

`BottomPanel._updateGeometry()` calculates all positions and outer sizes.
Sections provide content-derived preferred widths but do not resize the panel
or infer monitor/search bounds. Panel height is
`SECTION_HEIGHT + 2 * (SECTION_FRAME_WIDTH + SECTION_BORDER_WIDTH) + PANEL_TOP_PADDING + PANEL_BOTTOM_PADDING`.
BottomPanel calculates section bounds directly from content height, band and outline;
there is no separate outer-height constant for sections to import.
`SECTION_HEIGHT` describes only content height. The square Debian button and
minimum indicator width use the outer height, including both border edges.
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
Filled surfaces are opaque; frame borders, unfilled panel space, and the
explicit drag ghost allow transparency. `TransientInputManager` handles expanded
dash dismissal without a stage-wide input grab. Popup ownership stays with the
feature that created it.

### Installation stays file-based

Runtime JavaScript and Sass live in `src/`. Source imports use the `@/` alias,
and Shell resource modules are imported through `@girs/gnome-shell` re-exports.
Only classes use named imports; constants and helper functions use namespaces.
TypeScript checks the existing JavaScript using GNOME 48 GIR definitions.

Rollup builds independent Shell and preferences entry points, preserving native
`gi://` and `resource://` imports. Its Sass plugin compiles `src/style/stylesheet.scss`
into `dist/stylesheet.css`; metadata and schema XML are emitted as build assets,
and `glib-compile-schemas` compiles the schema. Independent Node scripts package
the existing dist as a ZIP or install it into the user's extension directory.
Installation stages the new build, replaces the previous directory, and can
restore the previous files if replacement fails. Replacing the directory removes
all obsolete modules. Development dependencies, tests, package manifests, and
OpenSpec artifacts are excluded from dist and the installed extension.

## Risks / Trade-offs

- Full rebuild on monitor changes resets local drag order and expansion → this
  is current behavior; orders are deliberately not persisted.
- Native borders pick the section root rather than a control → test section-root
  drop fallbacks as well as icon targets.
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

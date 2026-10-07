# Panel Shell Specification (Master)

## Purpose

Define the common behavior of Simple Bottom Panel across monitors, including
placement, shared section presentation, scaling, window reservation, and lifecycle.
Feature details are delegated to the Debian menu, dash, indicator, and system specs.

## Scope

This contract applies to GNOME Shell 48.7. The panel has five positions from left
to right: Debian button, dash, search placeholder, optional indicators, and system
section. Search occupies layout space but its feature behavior is not specified.
True application fullscreen, real indicator discovery, and real system menus are
not added by this baseline.

## Requirements

### Requirement: Dynamic monitor coverage

The extension SHALL create one independent bottom panel for each discovered
monitor, without a hardcoded monitor count, and SHALL reconcile panels when the
monitor layout changes.

#### Scenario: Extension starts with multiple monitors

- **WHEN** the extension starts with three discovered monitors
- **THEN** each monitor has one panel positioned within that monitor's bounds
- **AND** each panel owns its own section views and transient expansion state.

#### Scenario: Monitor configuration changes

- **WHEN** a monitor is connected, removed, moved, or resized
- **THEN** the panel set and geometry match the newly discovered monitors
- **AND** replaced panels leave no popup, input registration, or reserved area behind.

### Requirement: Stable section placement

The panel SHALL span its monitor's width at the bottom edge. It SHALL anchor the
Debian button at the configured left padding, the system section at the configured
right padding, the dash immediately after the Debian button's configured gap,
and the indicators immediately before the system section's configured gap.
The search placeholder SHALL remain horizontally centered with a bounded width.

#### Scenario: Dash population changes

- **WHEN** the dash gains or loses running items
- **THEN** its left edge remains next to the Debian button
- **AND** the search center and system section's right edge do not move.

#### Scenario: Indicators grow

- **WHEN** supplied indicator count increases
- **THEN** the indicator section grows toward the left
- **AND** the system section remains anchored to the right padding.

### Requirement: Internal panel padding

The panel SHALL use internal top, bottom, and horizontal padding rather than
external margins. SECTION_HEIGHT SHALL describe content height excluding the
surrounding frame. Outer section height SHALL equal content height plus twice
the sum of translucent band width and solid outline width. Panel height SHALL equal outer section height plus top and bottom
padding. Transparent gaps and padding inside the panel SHALL remain part of
its input area and SHALL NOT pass pointer events through to underlying windows.

#### Scenario: Vertical padding is configured

- **WHEN** content height is 64 logical pixels, frame band is 8, outline is 1, and both vertical paddings are 20
- **THEN** outer section height is 82 logical pixels and panel height is 122 logical pixels
- **AND** the Debian button and single-indicator section have an outer width of 82 logical pixels.

#### Scenario: Pointer is in a gap

- **WHEN** a pointer event occurs in empty space between panel sections
- **THEN** the panel retains that input region despite its transparent appearance.

### Requirement: Shared solid section frame

Every visible section SHALL have a shared rounded, opaque interior surface and
surrounding frame. A translucent frame SHALL reveal the scene behind the panel,
not the section's own fill or control backgrounds. Section bounds SHALL include
the frame. Changing frame thickness SHALL
NOT shrink icons or other explicitly sized controls, or let them render outside
their allocated section. The Debian, search, and system sections SHALL remain
fixed-width; dash and indicator sections MAY grow only within their layout rules.
BaseSection SHALL contain an St.Bin frame which contains the opaque content.
The frame SHALL use native padding for its translucent band and an opaque CSS
outline, using inherited St allocation rather than a custom allocation override
or frame overlay. Default band width SHALL be 8 logical pixels and alpha SHALL
be 40%. Outline width SHALL default to 1 logical pixel, white in dark theme and
black in light theme.

#### Scenario: Default native frame

- **WHEN** frame thickness is set to 8 logical pixels
- **THEN** it is accounted for inside each section's total layout bounds
- **AND** the dash measures its content plus insets before requesting its width
- **AND** no adjacent frames overlap because wrapping was omitted from geometry.

#### Scenario: Solid outline surrounds the translucent band

- **WHEN** a section uses the default frame in either system palette
- **THEN** its 8px translucent band is surrounded by a separate 1px opaque outline
- **AND** that outline is white in dark theme and black in light theme
- **AND** native frame padding keeps opaque content inside the band.

#### Scenario: Translucent frame over wallpaper

- **WHEN** the frame uses 40% alpha and the panel is over the wallpaper
- **THEN** the wallpaper is visible through the frame area
- **AND** opaque fill and control hover painting do not extend under that frame
- **AND** icon sizes and outer section bounds remain unchanged
- **AND** native child allocation reserves the band and outline without manual clipping.

### Requirement: Theme-responsive presentation

Panel sections, expanded dash, and dash insertion preview SHALL respond to the
system Dark Style preference. Filled section surfaces SHALL be opaque. The frame
band SHALL use palette-specific colors, with configurable alpha and a 40% default.
The frame's solid outline SHALL remain opaque in both palettes.
Translucency SHALL NOT make the interior surface or controls translucent.
Text and symbolic controls SHALL remain readable in both modes.

#### Scenario: Dark Style changes while the extension is enabled

- **WHEN** the system preference changes between light and dark style
- **THEN** all monitor panels and any open expanded dash use the matching palette
- **AND** no panel reconstruction or Shell restart is required for the palette change.

### Requirement: Reusable rounded background blur

A GJS-only rounded background container SHALL wrap a St foreground widget without
depending on section classes or overriding widget allocation. Native layout SHALL
stack captured backdrop content below the foreground. An ACTOR-mode native blur
and outer rounded mask SHALL apply only to the backdrop, using current allocation
and foreground CSS corner radii. The foreground outline and controls SHALL stay
sharp. Blur strength and brightness SHALL be independent of dimensions and corners.

#### Scenario: Differently sized rounded widgets

- **WHEN** separate rounded background containers wrap a square button and a wide search widget
- **THEN** each blur follows its own widget's size and CSS corners
- **AND** the original widget allocations and controls are unchanged.

#### Scenario: Resize, theme change or monitor scaling

- **WHEN** widget dimensions, CSS radii or native view scaling change
- **THEN** the next paint uses the current geometry without manual configuration
- **AND** background capture is bounded by the source framebuffer
- **AND** unchanged capture geometry/context is reused independently per view.

#### Scenario: Offscreen buffer padding at rounded borders

- **WHEN** Clutter enlarges the offscreen buffer beyond the widget paint volume
- **THEN** the rounded mask converts texture coordinates back to allocation coordinates
- **AND** the blur remains inside the CSS outline without shrinking the widget or changing blur strength
- **AND** asymmetric padding and native resource scaling do not shift the curved edge.

#### Scenario: Disabled blur or unavailable GPU buffer

- **WHEN** the radius is zero or a GPU buffer cannot be allocated
- **THEN** the original widget still paints normally
- **AND** surface destruction or effect detachment drops cached buffer references.

#### Scenario: GNOME 48.7 public GJS bindings

- **WHEN** the capture paints with a PaintContext that has no get_stage_view method
- **THEN** it selects the widget's current public stage view by matching its framebuffer
- **AND** uses the view's boxed layout property without calling get_layout with no argument
- **AND** feeds a real backdrop content child to ACTOR blur without calling the unavailable API.

#### Scenario: Partial redraw behind a rounded surface

- **WHEN** only part of the scene behind a surface is repainted
- **THEN** capture copies only damaged rectangles and retains clean backdrop pixels
- **AND** requests a full local repaint of overlapping surfaces to prevent stale-blur feedback
- **AND** a new incomplete texture is not displayed
- **AND** full repaints do not schedule a continuous repaint loop.

#### Scenario: Parent destroys the surface natively

- **WHEN** a parent actor destroys the rounded surface without calling a JavaScript destroy override
- **THEN** the destroy signal releases capture buffers, view connections and backdrop content
- **AND** the decorative backdrop never intercepts input or drag-and-drop picking.

### Requirement: Compositor-aware scaling

The extension SHALL honor each monitor's X11 geometry scale and SHALL rely on
native Wayland scaling without applying that factor a second time. Placement,
control bounds, spacing, frame, and reserved height SHALL use consistent units.

#### Scenario: X11 uses two hundred percent scale

- **WHEN** an X11 monitor uses a geometry scale of 2
- **THEN** a 64-logical-pixel content area occupies 128 stage pixels
- **AND** with an 8-logical-pixel band and 1-logical-pixel outline, outer section height is 164 stage pixels
- **AND** icons, frame, gaps, and reservation remain aligned without double scaling.

#### Scenario: Wayland uses native scaling

- **WHEN** a Wayland session uses a scaled monitor
- **THEN** the extension does not multiply stage geometry by the X11 scale factor
- **AND** native control and icon scaling is retained.

### Requirement: Window work-area reservation

The panel SHALL reserve its entire configured height, including top and bottom
padding, on every monitor. Maximized windows SHALL stop above that area. There
SHALL NOT be a preference allowing maximized windows to extend behind the panel.
This requirement SHALL NOT impose a custom resize policy on true fullscreen windows.

#### Scenario: A window is maximized

- **WHEN** a window is maximized on a monitor containing a panel
- **THEN** its bottom edge stops at the panel's reserved area
- **AND** a gap equal to the top padding remains above the visible sections.

#### Scenario: Extension is disabled

- **WHEN** the extension is disabled
- **THEN** its reserved area is released and no stale strut remains.

### Requirement: Clean lifecycle

Disabling the extension or replacing a panel SHALL release its actors, menus,
signal subscriptions, timers, drag monitors, previews, and transient input handlers.
Panel-local ordering and expansion state SHALL NOT survive Shell reload.

#### Scenario: Disable with an expanded dash and pending update

- **WHEN** the extension is disabled while expansion or deferred work is active
- **THEN** no extension-owned transient remains visible or receives later callbacks
- **AND** no Escape accelerator remains registered.

### Requirement: Plain local installation

The project SHALL install as plain extension files into the standard per-user
GNOME Shell extensions directory. Runtime SHALL NOT depend on a bundler, Rollup,
Node, or an installed development package. Installation SHALL include preferences
and the compiled settings schema.

The build SHALL follow the provided Rollup configuration and preserve JavaScript
modules, compile Sass to stylesheet.css, generate metadata from package.json,
and copy and compile the settings schema into dist. ZIP packaging SHALL run the
same build with packaging enabled. Development installation SHALL install the
existing ZIP through the GNOME extension CLI without rebuilding, restarting the
session, or streaming logs.

#### Scenario: Package the extension

- **WHEN** the user runs `npm run package`
- **THEN** Rollup builds dist and creates a versioned `.shell-extension.zip` in build
- **AND** the archive contains the dist files at its root
- **AND** development dependencies, tests, and specifications are excluded.

#### Scenario: Install the packaged extension locally

- **WHEN** the user runs `npm run dev` or `npm run dev:install`
- **THEN** `gnome-extensions install --force` installs the existing versioned ZIP
- **AND** the already compiled schema is included
- **AND** the command does not restart Shell or stream logs
- **AND** instructions explain the required manual Shell restart or logout/login.

### Requirement: Defined feature boundaries

The panel SHALL follow the [Debian menu](../debian-menu/spec.md),
[dash](../dash-section/spec.md), [indicators](../indicator-section/spec.md), and
[system section](../system-section/spec.md) contracts. It SHALL NOT restore removed
stub population controls or search suggestions as part of this baseline.

#### Scenario: Default startup

- **WHEN** the extension starts with default settings and no indicator provider
- **THEN** the real dash uses per-app mode without monitor filtering
- **AND** the indicator section is hidden
- **AND** the system section retains its documented placeholder actions.

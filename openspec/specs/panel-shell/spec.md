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
external margins. Its height SHALL equal the section height plus top and bottom
padding. Transparent gaps and padding inside the panel SHALL remain part of
its input area and SHALL NOT pass pointer events through to underlying windows.

#### Scenario: Vertical padding is configured

- **WHEN** section height is 64 logical pixels and both vertical paddings are 20
- **THEN** panel height is 104 logical pixels
- **AND** the section's outer height remains 64 logical pixels.

#### Scenario: Pointer is in a gap

- **WHEN** a pointer event occurs in empty space between panel sections
- **THEN** the panel retains that input region despite its transparent appearance.

### Requirement: Shared solid section frame

Every visible section SHALL have a shared rounded, opaque surface and surrounding
frame. Section bounds SHALL include the frame. Changing frame thickness SHALL
NOT shrink icons or other explicitly sized controls, or let them render outside
their allocated section. The Debian, search, and system sections SHALL remain
fixed-width; dash and indicator sections MAY grow only within their layout rules.

#### Scenario: Frame is configured to ten pixels

- **WHEN** frame thickness is set to 10 logical pixels
- **THEN** it is accounted for inside each section's total layout bounds
- **AND** the dash measures its content plus insets before requesting its width
- **AND** no adjacent frames overlap because wrapping was omitted from geometry.

### Requirement: Theme-responsive presentation

Panel sections, expanded dash, and dash insertion preview SHALL respond to the
system Dark Style preference. Filled section surfaces SHALL be opaque. The frame
SHALL contrast slightly with its surface: lighter in dark mode and darker in light
mode. Text and symbolic controls SHALL remain readable in both modes.

#### Scenario: Dark Style changes while the extension is enabled

- **WHEN** the system preference changes between light and dark style
- **THEN** all monitor panels and any open expanded dash use the matching palette
- **AND** no panel reconstruction or Shell restart is required for the palette change.

### Requirement: Compositor-aware scaling

The extension SHALL honor each monitor's X11 geometry scale and SHALL rely on
native Wayland scaling without applying that factor a second time. Placement,
control bounds, spacing, frame, and reserved height SHALL use consistent units.

#### Scenario: X11 uses two hundred percent scale

- **WHEN** an X11 monitor uses a geometry scale of 2
- **THEN** a 64-logical-pixel section occupies 128 stage pixels
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

#### Scenario: Install from the project directory

- **WHEN** the user runs the installation script
- **THEN** runtime files are installed under
  `.local/share/gnome-shell/extensions/simple-bottom-panel@local`
- **AND** the schema is compiled without bundling JavaScript
- **AND** instructions explain the required Shell restart or logout/login.

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

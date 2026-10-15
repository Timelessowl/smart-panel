# Dash Section Specification

## Purpose

Represent real favorite applications and running apps/windows in each monitor's
dash, with stable identity, monitor-local layout and ordering, usable overflow,
window activation, context actions, and drag-and-drop.

## Definitions

An eligible window is a tracked application window that is not marked skip-taskbar.
Window order means ascending stable sequence (oldest opened first), not recent
focus order. Visible windows are eligible windows after any monitor filter.
All workspaces are included. Fixed favorites are Firefox and Files; both are
installation prerequisites. The Launchpad is not an application/window item.

## Requirements

### Requirement: Real source and stable presentation

The dash SHALL use GNOME's application, window, and system-favorite state rather
than mock population controls. Metadata and window changes SHALL update the
presentation. Focusing another app SHALL NOT reorder running icons by recency.
One shared source SHALL expose favorites, running apps, eligible open windows,
and windows by monitor through explicit queries returning native Shell objects.
The source SHALL derive complete monitor-specific rendering entries through
`getEntries({monitor, favoriteOrder, runningOrder})`. Monitor views SHALL own actors
and local order; entry derivation SHALL NOT modify shared state. The source SHALL
be a GObject emitting `changed` after state refresh. Each dash section SHALL own
its `connectObject` connection, disconnected on section destruction, without a
MonitorManager update relay or custom subscription registry.

#### Scenario: Running window changes

- **WHEN** a tracked window opens, closes, changes title, moves monitor, or changes
  skip-taskbar state
- **THEN** the affected representations and indicators update from the real state.

#### Scenario: Application focus changes

- **WHEN** the user focuses another running application
- **THEN** its icon does not jump to a different dash position merely because of focus.

### Requirement: Default mode and preference persistence

The dash SHALL support per-app and per-window modes through an extension
preference, with per-app as the default. Monitor filtering SHALL be controlled
by a second preference, disabled by default. These preferences SHALL persist
across Shell restarts and SHALL update existing panel views when changed.

#### Scenario: Fresh settings

- **WHEN** no saved preferences exist
- **THEN** each dash shows one item per application and includes all monitors' windows.

#### Scenario: Mode is changed

- **WHEN** the user enables one icon per window
- **THEN** every panel projects the per-window representations without requiring restart.

### Requirement: Launchpad subsection

The first subsection SHALL contain only Launchpad, whose icon SHALL follow the
dash’s selected 40/32 logical pixel size. Clicking it SHALL toggle overview.
It SHALL NOT receive window indicators, app context actions, or item drag behavior.
There SHALL be no separator between Launchpad and favorites.

#### Scenario: Apps shrink to the small size

- **WHEN** the dash uses 32-pixel app icons to fit available width
- **THEN** Launchpad shrinks to 32 logical pixels alongside the apps and clicking it still toggles overview.

### Requirement: Favorite identity and fixed entries

The favorite subsection SHALL include GNOME's system favorites, with Firefox
first and Files second even if absent from that list. Those two entries SHALL
NOT be duplicated, removed, unfavorited, or dragged. Other favorite entries
SHALL retain their slots even when no matching window is running.

#### Scenario: Fixed apps are not system favorites

- **WHEN** the system favorites list omits Firefox and Files
- **THEN** both still occupy the first two favorite slots.

#### Scenario: Fixed app is also in the system list

- **WHEN** Firefox already appears in GNOME favorites
- **THEN** only one Firefox favorite icon is shown
- **AND** it offers neither unpin nor drag behavior.

### Requirement: Per-app representation

In per-app mode the favorite subsection SHALL show one icon per favorite app,
and the running subsection SHALL show one icon per remaining running app.
Applications represented in favorites SHALL NOT have a second running-app icon.

#### Scenario: A favorite has several windows

- **WHEN** a favorite app has three eligible windows in per-app mode
- **THEN** one favorite icon represents them
- **AND** no duplicate app icon appears in the running subsection.

### Requirement: Per-window favorite fallback

In per-window mode a favorite SHALL represent its oldest visible window when
one exists, and SHALL fall back to an app launcher when none exists. Its represented
window SHALL be excluded from the running subsection; additional visible windows
of that app SHALL each appear separately there.

#### Scenario: Favorite has two windows

- **WHEN** a favorite has windows with stable sequences 10 and 25
- **THEN** its favorite icon represents window 10
- **AND** only window 25 appears as a separate running item.

#### Scenario: Last favorite window closes

- **WHEN** the last visible window of a favorite closes
- **THEN** the favorite icon remains as an app launcher rather than disappearing.

### Requirement: Monitor filtering across all workspaces

With filtering disabled, each panel SHALL represent eligible windows across all
monitors and workspaces. With filtering enabled, running items, favorite window
selection, and indicators SHALL use only that panel's monitor, across all
workspaces. Favorites themselves SHALL remain on every panel.

#### Scenario: Favorite runs only on another monitor

- **WHEN** filtering is enabled and a favorite has no window on this panel's monitor
- **THEN** its favorite icon remains with no running indicator
- **AND** clicking it requests a new window on this panel's monitor
- **AND** existing windows on other monitors are not moved or selected by the dash.

#### Scenario: Window is on an inactive workspace

- **WHEN** an eligible window belongs to another workspace
- **THEN** it remains represented subject only to the monitor filter.

### Requirement: Window indicators do not move icons

In per-app mode each app icon SHALL show one dot per visible window, capped at
four, and no dots for zero windows. In per-window mode each window-backed icon
SHALL show one dot; favorite icons without a visible window SHALL show none.
Dots SHALL be centered below the actual icon, with a five-pixel diameter, four-pixel spacing, and a
two-pixel gap beneath the icon. They
SHALL NOT alter its position or size request. Dash button hover highlights SHALL
be square, centered on their content, with six-pixel rounded corners. Launchpad
SHALL use a full-size colored nine-tile grid. The +N control SHALL use a larger
label proportional to icon size, with a transparent background until hovered.

#### Scenario: Window count changes

- **WHEN** an app's visible window count changes from zero to five
- **THEN** four dots appear below its unchanged icon position
- **AND** neighboring icon positions are unchanged by the indicator count.

#### Scenario: Per-window running icon

- **WHEN** a window appears in the running subsection in per-window mode
- **THEN** its icon has exactly one running indicator dot.

### Requirement: Running subsection boundary

The running subsection SHALL start with one separator when it contains items.
When it is empty, the entire running subsection including its separator SHALL
be hidden. Favorites SHALL NOT have an independent trailing separator.

#### Scenario: Only favorites are present

- **WHEN** no running representation remains outside favorites
- **THEN** no running separator is displayed.

#### Scenario: Running items wrap into rows

- **WHEN** expansion wraps the running subsection
- **THEN** its separator is kept with its first item rather than alone at a row end.

### Requirement: Monitor-local width adaptation

Each panel SHALL first try 40-pixel app icons, then 32-pixel app icons, then an
overflow layout. The calculation SHALL include Launchpad, separator, spacing,
and frame insets. App icon adaptation SHALL NOT modify other panels' icon sizes
or overlap the search allocation. An exceptionally narrow allocation SHALL clip
within its own bounds rather than cross into search.

#### Scenario: Monitors have different available widths

- **WHEN** one panel can fit all apps at 40 pixels and another cannot
- **THEN** the first remains at 40 pixels while the second independently shrinks or overflows.

### Requirement: Accurate overflow count

When all items do not fit at 32 pixels, the collapsed dash SHALL reserve its last
item slot for a clickable `+N` control. N SHALL equal hidden application/window
items, excluding Launchpad and separators.

#### Scenario: Overflow consumes a visible item slot

- **WHEN** 20 app/window items exist and the available layout fits 18 item slots
  including the overflow control
- **THEN** 17 real items and `+3` are shown
- **AND** Launchpad and any separator do not contribute to the hidden count.

### Requirement: Upward expanded surface

Clicking `+N` SHALL show the full item set in multiple rows expanding upward
from the dash, above application windows, with its opaque themed surface and
frame intact. Overflow SHALL become real items in the expanded layout. Expansion
SHALL stay within the available dash width and usable monitor height; excess
vertical content SHALL be scrollable. A dedicated `ExpandedDash` subclass of
`BaseSection` SHALL own expanded content, scrolling, transient registrations and
cleanup, using the same token creation path as the collapsed dash.

#### Scenario: Hidden items are revealed

- **WHEN** the user clicks `+3`
- **THEN** all three hidden items become accessible in the upward grid
- **AND** the `+3` control is not retained as an extra item in that grid.

### Requirement: Non-modal expansion dismissal

Escape SHALL close the expanded dash. Clicking outside it and any related app
context menu SHALL close it without consuming that pointer event. The expansion
SHALL NOT grab unrelated keyboard, scroll, or pointer input. A drag SHALL suspend
outside-pointer dismissal until the drag ends.

#### Scenario: Outside click targets another window

- **WHEN** the user clicks a terminal outside the expanded dash
- **THEN** expansion closes and the terminal still receives the click.

#### Scenario: Escape is pressed

- **WHEN** expansion is open and the user presses Escape
- **THEN** it closes and its temporary Escape registration is released.

#### Scenario: An app context menu is clicked

- **WHEN** the user clicks within an expanded icon's related context menu
- **THEN** outside-pointer dismissal does not prematurely close the expansion.

### Requirement: Deterministic app activation cycle

In per-app mode repeated clicks on the same app SHALL focus its visible windows
in ascending stable-sequence order, then minimize all represented windows, then
start again with the oldest. Changing app or that app's visible window set SHALL
reset the cycle. An app without visible windows SHALL open a new window.

#### Scenario: App has two visible windows

- **WHEN** its icon is clicked four consecutive times with an unchanged window set
- **THEN** the actions are focus oldest, focus second, minimize both, focus oldest.

### Requirement: Per-window activation

In per-window mode clicking a window-backed representation SHALL focus that
specific window; clicking an idle favorite SHALL open a new app window.

#### Scenario: Additional window icon is clicked

- **WHEN** the user clicks the second window's running icon
- **THEN** that second window is focused rather than cycling among all app windows.

### Requirement: App context actions

App icons SHALL derive from GNOME's PanelMenu.Button and use a standard popup
menu with native lifecycle and a shared menu manager. Drag/drop handling SHALL
reside in a separate dash module.

Right-clicking an app/window icon SHALL open its available desktop-file actions.
It SHALL offer a new-window action when supported and not already present,
a close-window action when representing a specific window, and favorite controls
for non-fixed, pinnable apps when the system list is writable. An app without
other available actions SHALL still have an activation action.

#### Scenario: Unfavoriting is available

- **WHEN** the user invokes Remove from Favorites for a non-fixed favorite
- **THEN** GNOME's system list is updated and every panel reflects the membership change.

#### Scenario: System favorites cannot be written

- **WHEN** the system favorites setting is read-only
- **THEN** no action that would add or remove a favorite is offered.

### Requirement: Local drag ordering and global membership

Dragging a non-fixed item within its subsection SHALL reorder only the target
panel, without persisting that order across Shell reload. Dropping a pinnable
running item into favorites SHALL add its app to GNOME's system favorites and
position it locally at the drop location, after the fixed entries. Other panels
SHALL receive the membership change without adopting the dragged panel's order.
Dragging a favorite into running SHALL NOT act as an implicit unpin action.

#### Scenario: Running item is favorited by drop

- **WHEN** a running app is dropped immediately after Files in favorites
- **THEN** it becomes a system favorite
- **AND** it occupies that position on the target panel only
- **AND** Firefox and Files retain their first two slots.

#### Scenario: Running order is changed

- **WHEN** the user drops a running item before another running item
- **THEN** only that panel's running order changes
- **AND** the system favorite list is untouched.

### Requirement: Drop-target coverage and insertion preview

Valid targets SHALL accept drops on icons and their subsection's padding/gaps,
in collapsed and expanded layouts. Decorative frames and previews SHALL NOT
intercept drag hit-testing. While over a valid target, a translucent 16-logical-
pixel preview of the dragged app icon SHALL mark the before/after insertion
position without resizing the dash. Preview size and opacity SHALL be configurable
in the project's layout constants.

#### Scenario: Drag crosses an icon midpoint

- **WHEN** a drag moves from the left half to the right half of a valid target icon
- **THEN** the preview changes from the before-position to the after-position.

#### Scenario: Preview is no longer applicable

- **WHEN** a drag leaves the dash, enters an invalid target, ends, is cancelled,
  or its panel is destroyed
- **THEN** its insertion preview is removed and does not block future picking.

### Requirement: Safe refresh during drag and drop

The shared dash source SHALL continue observing and updating state during a
drag. Only the dragging panel's actor rebuild SHALL be deferred while its drag
actors are in use. Other panels SHALL continue updating. An accepted drop SHALL
finish releasing drag actors before rebuilding views. Ending or cancelling a
drag SHALL apply pending view updates and clean up drag-specific state.

#### Scenario: Source changes while dragging

- **WHEN** application state changes during an active drag
- **THEN** the dragged view is not destroyed by an immediate source refresh
- **AND** other panels update from the shared source during the drag
- **AND** the dragging panel projects the new state after drag actors are released.

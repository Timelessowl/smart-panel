# Dash Section Design

## Context

The contract is [dash-section](../../specs/dash-section/spec.md). This design
records the current real-dash implementation and its clarified behavior, not
the removed mock-app architecture. Automated coverage exists for native identity,
source entries, layout, activation, source lifecycle, dot allocation, drag/drop,
and expansion dismissal. All use Jasmine suites with Node/GJS API doubles; native Shell
acceptance is a separate remaining task.

## Goals / Non-Goals

Goals: shared authoritative Shell state, monitor-local views and running orders, persistent shared favorite order, deterministic
activation, bounded layout, safe transient input, and real favorite mutations.

Non-goals: persistent/shared running order, active-workspace-only filtering, search
logic, restored stubs, external drag sources, favorite-to-running unpin by drag,
and a third shrink size below 32 logical pixels.

## Decisions

### Native state instead of wrapper models

`AppItem` and `WindowItem` were removed after review. They copied metadata from
`Shell.App` and `Meta.Window` without owning useful behavior, introducing stale
state and another refresh lifecycle. Adding menus to these wrappers would mix
monitor-specific policy into shared objects. Native objects already provide
stable identity, metadata, icon creation, and operations.

`DashSource` owns observation, eligible-window state and complete entry construction.
`getEntries()` applies monitor scope, mode, local order and indicator rules internally;
there is no separate projection module. Entries retain native app/window references
without duplicate window fields. `DashIcon` renders entries and inherits its native
popup menu. `dashUtils` contains stateless action helpers. `DashSection` owns
activation cycles and `DashSource` owns shared pending launches. No replacement model classes are needed.

### One source, monitor-specific entries

The extension owns one `DashSource` GObject with a `changed` signal, which observes Shell AppSystem,
AppFavorites, window events, and the two settings. It reuses
native app/window references and coalesces refreshes. It exposes
`getFavorites()`, `getRunningApps()`, `getOpenedWindows()`,
`getOpenMonitorWindows(monitor)`, `getAppWindows(app, monitor)`, and
`getWindowApp(window)` and `getEntries({monitor, runningOrder})`.
Returned collections are copies. Each `DashSection` requests complete entries;
it does not reconstruct app/window maps or fixed-favorite sets. App-wide metadata
is shared; entries, views, running order, expansion and activation cycles are monitor-specific.
Each `DashSection` owns a `connectObject('changed', ..., this)` connection to the
source. Native actor destruction disconnects that listener; there is no custom
subscription registry or MonitorManager update relay. The section emits
`layout-changed` only when its preferred width changes, and `BottomPanel` owns a
`connectObject` connection to that signal for bounds updates. DND requests a
refresh directly from its owning section instead of passing change callbacks.

The fixed IDs are `org.gnome.Nautilus.desktop` and `thunderbird.desktop`, in that
order. Installed fixed favorites are deduplicated from the system list.
Running app order is derived from oldest eligible stable window sequence, with
app ID as tie-breaker, rather than Shell's MRU order.

### The source derives membership and indicators

Per-app mode excludes favorite apps from running. Per-window mode uses the
oldest visible native window in a favorite slot, falling back to the app when idle;
that represented window is excluded from running. Additional windows remain
separate. Monitor filtering affects windows and dots, not favorite membership.
All workspaces are included; no active-workspace selector is introduced.
Indicator counts are capped at four in per-app mode, one for window-mode
favorites, and zero for window-mode running items.

### Layout uses measured tokens and one allocated budget

BottomPanel supplies the dash's available stage width and maximum expansion
height; DashSection reports preferred width without sizing its panel.
`layoutDash()` produces Launchpad, icon, separator, and overflow tokens. It tries
40-pixel buttons, then 32-pixel buttons, then a visible prefix plus +N. Launchpad
and +N follow the selected icon size. Width includes rounded item sizes, spacing, content inset, and border.
`CONTENT_INSET` counts the frame's solid outline and native padding, any dash
padding extending beyond that band, and the content's thin border, once each.
The opaque dash child's CSS padding does not duplicate its parent's frame.
Collapsed row height fits inside the content border without changing icon sizes.
The running separator exists only with running items and stays with the first
running token when `expandedRows()` wraps. `expandedLayout()` supplies positions and
bounds as well as rows, so expanded actors do not repeat layout arithmetic.
`ExpandedDash` extends `BaseSection` and owns the expanded grid, scroll view,
chrome, theme and native grab. `DashSection` only opens/closes it and
provides the same token reconciliation used by the collapsed view. Native DND's own
grab supersedes expansion input during a drag. On exceptionally narrow allocations
the section clips rather than invading search; no extra behavior is invented.

### Icon buttons and indicators are separate actors

`DashIcon` derives from Shell's exported `ui/dash.DashIcon`. A separate
`DashItem` bin arranges that native icon button and the indicator row in a
vertical box. Launchpad and +N share the same bin, including its reserved empty
indicator row, and follow the dash’s current 40/32 px icon size. The native
`IconGrid.BaseIcon` sizes its app texture manually; native shell running-dot
rendering is suppressed in favor of the source's monitor-scoped counts outside
the button. There is no custom button allocation, input action or menu builder.
Hover styles apply directly to the button. Launchpad uses its packaged SVG,
and +N has a larger label and a transparent background until hovered.
The five-pixel dots have four-pixel spacing and two pixels of padding above.
An empty indicator row reserves the same height so button alignment does not
change with running state. Only the button handles activation, menus and drag
initiation; the dots and surrounding bin are non-reactive. Expanded and collapsed
rows use the same actors and scale their button size to native stage coordinates.

### Expansion uses native popup input

Expansion uses another BaseSection with an opaque themed scroll view and fixed
grid, registered through `Main.layoutManager.addTopChrome()` without a strut.
It opens upward, anchored to the collapsed section's bottom, within supplied
width/height limits. The collapsed surface is hidden while expansion is shown.
This is necessary to stay above windows without reserving extra work area.
Shell's GrabHelper handles Escape and outside-click dismissal, following the
app-folder dialog pattern in GNOME Shell 48.7. This uses standard popup focus
semantics; outside clicks are not replayed to applications. A dismissed surface
is hidden and detached for reuse. Source and geometry changes update both
containers in place; explicit close actions and panel teardown destroy the
expansion. The actor survives onUngrab because GrabHelper invokes that callback
before releasing its modal grab.

Window previews remain PopupMenu instances. Each dash registers all its preview
sources with one native PopupMenuManager, permitting native hover switching.
Real crossing events retain hover delays; FLAG_GRAB_NOTIFY crossings do not
schedule opening or closure. App menus keep their inherited manager. Nested
popup grabs close the top surface first, while DND owns input during dragging.
There is no pointer poll, global Escape binding, related-actor registry, or
replacement dismissal module.

### Source refresh preserves view identity

DashSection reconciles each container's token actors instead of destroying its
children. Favorites use their app ID as a stable key, including when their
represented window changes in per-window mode. Running entries use their
existing app/window item ID. Native set_child_at_index reorders surviving
actors without unmapping their menu sources. Only missing identities are
destroyed, and only new identities create icons.

DashIcon updates its entry, accessible name and icon size in place; DashItem
adjusts only the changed indicator dots. ExpandedDash retains its grid and
scroll view while updating placement, bounds and bottom anchoring.

An open preview refreshes after the source's authoritative state is published.
Its existing window-keyed row map retains surviving items and compositor
clones. The additional app-level windows-changed observer was removed because
it could redisplay before DashSource updated its monitor-scoped snapshot.
The preview closes when its window list becomes empty or its source disappears,
not when another window or neighboring app changes.

### Activation follows explicit state

`nextAppAction()` implements oldest, next, minimize-all, repeat for per-app mode.
Its cycle signature includes app identity and eligible window identities so a
different app/window set resets cycling. Per-window views focus their exact
window. Activation queries current windows at click time, so a stale view cannot
focus or minimize a window that has moved off its monitor. Empty favorites
request a new window; with monitor filtering they never select a remote window.

Shell's `open_new_window()` and `launch_action()` have a workspace argument but
no monitor argument. `DashSource` records pre-launch windows and observes the
first new eligible window for each requested app. It moves only that new window
to the requested monitor, and repeats placement on its first frame to account
for initial mapping. Existing windows are excluded; simultaneous requests claim
distinct new windows. Tracking expires after 15 seconds, and signals/timers are
released on first frame, unmanage, launch failure, or shutdown. A removed monitor
is never used as a movement target. Without isolation, native placement is kept.
Single-window apps can decline to create a new window; the extension cannot
force another instance. App-based matching also cannot distinguish an unrelated
window opened by the same app while its launch request is pending.

### Icons use native panel menus

`DashIcon` inherits Shell's menu, right-click/touch/keyboard paths, popup side,
menu manager, focus/grabs, drag gestures and scale behavior. The extension only
observes `menu-state-changed` to associate the native menu with expanded-dash
outside dismissal. Native favorite controls are disabled for fixed launchers.
Native launch-animation hooks register monitor placement for New Window actions
before Shell executes them. The inherited drag source remains the native icon;
no second draggable or ClickAction is installed.

### Drag acceptance is actor-tree aware

`DashDragDrop` owns one controller per section: native draggable setup, drag
monitoring, drop validation, insertion previews, temporary local orders and
post-release refresh. `DashSection` supplies source entries and `ExpandedDash` supplies surface updates; the section
owns its source connection and rendering. It contains no Shell DND plumbing or drag timers.

DND starts on the derived native `DashIcon`, retaining its standard `_delegate`. Dash/grid and outer section delegates resolve before/after drop
targets for buttons, indicators and padding alike, finding the nearest DashIcon
in row coordinates after transforming native container/actor positions.
Native icons are wrapped by the shared `DashItem` bin. Shared frames and insertion
previews are hidden from pick. An opaque decorative actor must not
terminate target traversal before a delegate can be reached.

Favorite order is saved with one `global.settings.set_strv('favorite-apps', ids)`
write, including new membership for a running-to-favorites drop. Fixed launchers
stay first; unavailable desktop IDs already stored in GNOME are preserved.
AppFavorites observes the system change, and all panels adopt the saved order.
Favorite changes are rejected when the setting is read-only. Running app/stable-
window ID order stays per-section and resets when that panel is recreated.

### Preview and mutations have separate lifecycle

The insertion helper is a scaled 16-pixel icon with opacity 96/255 by default,
registered as top chrome without input-region or strut contribution. It is
positioned at the target's before/after boundary and clamped to the visible
section bounds. It does not relayout neighbors, so hover coordinates stay stable.
Size and opacity are in src/constant.js. Per-section DND monitors and a source
drag-end subscription remove it on leave, invalid hover, drop, cancellation,
close/refresh, or destruction.

Drag begin defers only that section's actor reconciliation. Native DND owns
input while the shared source keeps observing Shell and other panels keep
refreshing. Source and geometry changes mark the dragging view for refresh after
actor release. Drop returns acceptance immediately but defers favorite/order
updates to an idle callback after DND releases its actors. Drag-end schedules
any pending view refresh for an idle callback. Success does not restore the
dragged clone before the queued update.

### Menus and preferences use native boundaries

Desktop-file actions, optional New Window, represented-window Close Window, and
favorite controls come from the inherited native AppMenu. Fixed launchers hide
native favorite controls. Shell owns dismissal; removed icons destroy their
native menu actors.
The source updates system favorites through AppFavorites rather than a separate
extension list. Preferences bind `per-window-mode` and `monitor-only`, both
boolean/default false, to Adw switch rows; running order remains temporary, while favorite order is saved in GNOME settings.

## Risks / Trade-offs

- Desktop-file actions vary by app → test capability-dependent menu composition
  and keep an activation fallback.
- Window-backed apps are not pinnable → reject their favorite drops/actions
  while retaining appropriate running behavior.
- Independent preview overlay marks insertion without moving icons → confirm
  native before/after feedback matches the actual resulting order.
- API doubles approximate native allocation/picking → validate real drop
  dispatch, scroll offsets, scaled monitors, and stacking before closure.
- Deferred drops race panel destruction → cancel pending GLib sources and
  verify no mutation fires from a destroyed panel.

## Migration Plan

The real-dash migration already removed all stub modules and controls. The
installer ships the source/view modules, preferences, and compiled schema, and
removes obsolete installed stub files by exact name. Do not restore the old app
count preference or persist running order. Future verification fixes use the same
file installer and proper Shell restart; the user's system favorite membership and order
must not be reset during rollback.

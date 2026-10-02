# Dash Section Design

## Context

The contract is [dash-section](../../specs/dash-section/spec.md). This design
records the current real-dash implementation and its clarified behavior, not
the removed mock-app architecture. Automated coverage exists for models,
projection, layout, activation, source lifecycle, dot allocation, drag/drop,
and expansion dismissal. All use Jasmine suites with Node/GJS API doubles; native Shell
acceptance is a separate remaining task.

## Goals / Non-Goals

Goals: shared authoritative models, monitor-local views and orders, deterministic
activation, bounded layout, safe transient input, and real favorite mutations.

Non-goals: persistent/shared drag order, active-workspace-only filtering, search
logic, restored stubs, external drag sources, favorite-to-running unpin by drag,
and a third shrink size below 32 logical pixels.

## Decisions

### Models do not own actors

`AppItem` stores app identity, metadata, state, and icon creation information.
`WindowItem` stores stable window identity, title, monitor, eligibility, and its
associated AppItem. Neither model owns panel actors. `DashIcon` is a registered
`St.Button` view of either model; its activation, menu, and drag behavior delegate
to its owning DashSection. This avoids coupling shared state to one monitor's
layout or reconstructing app identity for every view.

### One source, independent projections

The extension owns one `DashSource`, which observes Shell AppSystem,
WindowTracker, AppFavorites, window events, and the two settings. It reuses
models and coalesces refreshes. Each `DashSection` calls `projectDash()` with its
monitor index and local order arrays. App-wide metadata is shared; projected
windows, indicator counts, views, expansion, and activation cycle are local.
MonitorManager subscriptions trigger per-panel refreshes and geometry updates.

The source checks Firefox IDs in order: `firefox.desktop`, `firefox-esr.desktop`,
`org.mozilla.firefox.desktop`. Files uses `org.gnome.Nautilus.desktop`. These
apps are hard prerequisites by user decision; absence/error-placeholder policy
is outside this baseline. Fixed favorites are deduplicated from the system list.
Running app order is derived from oldest eligible stable window sequence, with
app ID as tie-breaker, rather than Shell's MRU order.

### Projection owns membership, not activation

Per-app mode excludes favorite apps from running. Per-window mode uses the
oldest visible WindowItem in a favorite slot, falling back to AppItem when idle;
that represented window is excluded from running. Additional windows remain
separate. Monitor filtering affects windows and dots, not favorite membership.
All workspaces are included; no active-workspace selector is introduced.
Indicator counts are capped at four in per-app mode, one for window-mode
favorites, and zero for window-mode running items.

### Layout uses measured tokens and one allocated budget

BottomPanel supplies the dash's available stage width and maximum expansion
height; DashSection reports preferred width without sizing its panel.
`layoutDash()` produces Launchpad, icon, separator, and overflow tokens. It tries
40-pixel apps, then 32-pixel apps, then a visible prefix plus +N. Launchpad remains
40 pixels. Width includes rounded item sizes, spacing, content inset, and border.
`CONTENT_INSET` is the maximum of dash padding and section-frame width.
The running separator exists only with running items and stays with the first
running token when `expandedRows()` wraps. On exceptionally narrow allocations
the section clips rather than invading search; no extra behavior is invented.

### Dots are an allocation overlay

`DashIconContent` requests only the app texture size, centers its actual native
dimensions, and allocates dots centered immediately below that texture.
Adding dots does not alter preferred size or move the texture. This supports
native icon scaling rather than assuming raw icon_size equals stage pixels.
The current dot diameter is two logical pixels with two-pixel spacing.

### Expansion is a non-modal top-chrome surface

Expansion uses another BaseSection with an opaque themed scroll view and fixed
grid, registered through `Main.layoutManager.addTopChrome()` without a strut.
It opens upward, anchored to the collapsed section's bottom, within supplied
width/height limits. The collapsed surface is hidden while expansion is shown.
This is necessary to stay above windows without reserving extra work area.
TransientInputManager registers temporary Escape dismissal and observes pointer
presses without grabbing or consuming outside input. Related app menus count as
inside; outside-pointer dismissal pauses during a drag.

### Activation follows explicit state

`nextAppAction()` implements oldest, next, minimize-all, repeat for per-app mode.
Its cycle signature includes app identity and eligible window identities so a
different app/window set resets cycling. Per-window views focus their exact
window. Empty favorites call `open_new_window(-1)`; with monitor filtering they
do not activate a window on a different monitor. The baseline does not add
explicit post-launch window relocation beyond native app behavior.

### Drag acceptance is actor-tree aware

Native DND uses the icon's `_delegate`. Icon delegates accept before/after drops;
dash/grid and outer section delegates cover padding or background picks by
finding the nearest DashIcon in their local coordinates. Shared frames and
insertion previews are hidden from pick. An opaque decorative actor must not
terminate target traversal before a delegate can be reached.

Orders are per-section app IDs for favorites and model IDs for running. Fixed
favorite icons are not draggable. A running-to-favorites drop updates the target
panel's favorite order and GNOME AppFavorites membership. Other panels receive
the membership event but keep their own order arrays. No order is saved to
GSettings; panel recreation/Shell reload resets local ordering.

### Preview and mutations have separate lifecycle

The insertion helper is a scaled 16-pixel icon with opacity 96/255 by default,
registered as top chrome without input-region or strut contribution. It is
positioned at the target's before/after boundary and clamped to the visible
section bounds. It does not relayout neighbors, so hover coordinates stay stable.
Size and opacity are in constant.js. Per-section DND monitors and a source
drag-end subscription remove it on leave, invalid hover, drop, cancellation,
close/refresh, or destruction.

Drag begin pauses the shared source and outside-pointer dismissal. Drop returns
acceptance immediately but defers favorite/order updates to an idle callback,
after DND releases its actors. Drag-end resumes source updates. Success does
not restore the dragged clone before the queued rebuild.

### Menus and preferences use native boundaries

Desktop-file actions, optional New Window, represented-window Close Window, and
writable/pinnable favorite controls are composed into per-icon PopupMenus.
The menu manager owns dismissal; removed icons destroy their popup actors.
The source updates system favorites through AppFavorites rather than a separate
extension list. Preferences bind `per-window-mode` and `monitor-only`, both
boolean/default false, to Adw switch rows; neither local order nor old overlay
settings are persisted.

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
installer ships the model/source modules, preferences, and compiled schema, and
removes obsolete installed stub files by exact name. Do not restore the old app
count preference or persist local order. Future verification fixes use the same
file installer and proper Shell restart; the user's system favorite membership
must not be reset during rollback.

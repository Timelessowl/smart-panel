# Native panel popup input

Reviewed and implemented on 2026-10-20 against GNOME Shell **48.7**, commit
`e3017af71ac39f618bcf9f0e04f794c90bde3c83`. The shallow reference checkout is
`examples/gnome-shell`, inside the existing ignored examples directory.

The refactor removes the custom input manager without adding a runtime module.
Existing actors retain their rendering and layout responsibilities. Native
popup behavior was selected after confirming that window previews remain usable.

## What the removed service actually did

Two features registered with it: `ExpandedDash` and `WindowPreviewMenu`.
`MonitorManager` created the service and passed it through `BottomPanel` and
`DashSection`. A mutable set of related menu actors and a per-registration drag
pause flag were additional dependencies of that service.

It sampled pointer coordinates and button masks every 16 ms, tested transformed
actor rectangles, and reserved Escape through Mutter's global accelerator API.
That is redundant for menus and does not follow native popup input ownership:

- A complete press/release between samples can be missed.
- Touch sequences are not handled as native touch events.
- Rectangle tests approximate the actor tree and clipping.
- Escape closes every registration instead of the active popup layer.
- The drag pause flag only affects pointer dismissal; Escape can still destroy
  the expansion while native DND owns its drag actors.

## Native APIs and their owners

| Feature | Existing native mechanism | Project ownership |
| --- | --- | --- |
| App context menus | Inherited `AppIcon._menuManager` and `AppMenu` | `DashIcon` retains Shell's implementation. |
| Window previews | `PopupMenuManager` manages `PopupMenu` instances | One native manager in each existing `DashSection`; each icon registers its preview. |
| Expanded grid | `GrabHelper`, as used by Shell's app-folder dialog | Existing `ExpandedDash` owns its native helper and its open/close lifecycle. |
| Debian and indicator menus | `PopupMenuManager` | Their existing section classes register their existing menus. |
| Dragging | Shell DND's grab | Existing `DashDragDrop` retains drag ordering and refresh deferral. |

The relevant upstream implementations are
[PopupMenuManager](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.7/js/ui/popupMenu.js#L1466),
[AppIcon's inherited manager](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.7/js/ui/appDisplay.js#L2980),
[GrabHelper](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.7/js/ui/grabHelper.js),
[AppFolderDialog](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.7/js/ui/appDisplay.js#L2537),
and [DND](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/48.7/js/ui/dnd.js#L217).
These are source-level findings; they do not establish native desktop acceptance.

## Keeping previews usable

Previews still create compositor clones only when opened. Their thumbnail list,
activation, close-window controls, delayed hover peeking, workspace restoration,
scrolling and Up-key navigation retain their existing implementation.

Each icon registers its preview menu when created. Eager registration is useful
even though thumbnails remain lazy: `PopupMenuManager` can identify another
icon's menu during a native grab and switch to it through its existing source
lookup. Registering only the first hovered icon would leave other sources
unknown while that popup owns input.

App context menus keep their inherited manager. Preview menus share a separate
native manager, avoiding two competing menu entries for the same source actor
in one manager's first-match source lookup.

Real source enter/leave events retain the initial hover-open and close delays.
While the popup holds its grab, its own captured motion and crossing events use
`global.stage.get_event_actor()` to determine whether the pointer is over the
preview or its source icon, including their children. Leaving both schedules
the existing close delay; returning to either cancels it. Repeated outside
motion does not restart that delay. Ordinary icon leave signals alone are
insufficient because the grab redirects events to the popup.
Crossing events marked `FLAG_GRAB_NOTIFY` are ignored for hover scheduling, as
they describe a changed grab rather than a pointer movement. Otherwise the
popup's own grab can appear to move the pointer away from its source and close
the preview immediately. Moving between already registered preview sources
uses Shell's immediate native menu switching.

## Expansion lifecycle and behavior

`ExpandedDash` retains `BaseSection`, its opaque themed content and frame, its
fixed grid, scroll view, size calculations, upward anchor position, and top
chrome registration without an extra strut. No stylesheet or layout constants
were changed.

Opening takes a native helper grab; failure closes and detaches the surface.
Dismissal hides and detaches the surface, restores the collapsed content, and
allows the same actor to reopen. Source and geometry refresh now reconcile
its existing token actors and update layout without replacing the grid, scroll
view or surviving icons. Explicit close actions and panel teardown destroy it.

Keeping the actor alive during dismissal matters: `GrabHelper.ungrab()` invokes
`onUngrab` before releasing its modal grab. Destroying that grab's actor inside
the callback would let `Main.pushModal()`'s actor-destroy handler release it
early. Separating close from destroy follows Shell's own dialog lifecycle and
avoids an idle timer or another input abstraction.

Native popup focus is an intentional behavior change from the old non-modal
specification. An outside click dismisses a popup and is not replayed to an
application. Escape closes the top popup first: a preview or context menu can
close while the expanded grid remains open, then the next Escape closes the
grid. Native DND's grab owns Escape during dragging. These replace the global
accelerator and custom drag pause mechanism.

A stage event listener or a focus-window listener would not preserve the old
contract: focus signals miss clicks within the already focused application,
and neither is a native menu API for globally observing and replaying all client
input. No such listener, input shield, synthetic click, polling loop or
replacement manager was introduced.

## Verification

`src/tests/unit/input/nativePopups.test.js` exercises production sections,
expanded grids, icons and previews against API doubles matching the native
ownership contracts. It covers dismissal by Escape/mouse/touch, grab failure,
cached reopening and source refresh, compositor-clone creation, keyboard access,
window activation, hover peeking and restoration, preview switching, synthetic
crossings, nested popup order, DND ownership, and destruction cleanup. The old
polling tests and registration-based lifecycle test were replaced by these
behavior checks.

The installed GI typings omit `grabHelper`, as they already omit `dash`.
The existing Rollup aliases and ambient declaration file now map and describe
that native resource. No Shell implementation is copied into the extension.

Before changes, lint passed, type checking reported 28 errors, and a run limited
to the current unit source files reported 80 specs with 49 failures. The normal
unit command also encountered stale generated test files. Existing failures
include outdated PanelMenu-based dash fixtures, removed constants, and the GJS
harness resolving unavailable modules. Those are not native acceptance tests.

The focused popup suite passes all 17 checks, including dismissal when a grab
redirects outside pointer motion without emitting an ordinary icon leave, and
closing one of two preview windows without replacing the menu or its remaining
thumbnail in the collapsed or expanded dash. It also checks additions/removals,
native reordering, resizing, per-window favorite rebinding and deferred drag
updates with stable actor identity.
A clean production build passes
with the native resource import resolved. Type diagnostics remain the same 28
pre-existing errors, after accounting for changed line numbers and the removed
constructor field in one diagnostic. Lint and diff whitespace checks pass.
The later incremental-view update adds the omitted native `setIconSize` method
to the existing dash declaration; type checking now reports 27 existing errors
and no new diagnostic.

The initial input refactor's clean full test run reported **91 specs, 50 failures**. Comparing scenario
names with the original unit baseline and integration tests run against an
untouched HEAD snapshot found no new failing scenario. The one removed failing
scenario was the obsolete registration-based expansion test, replaced by the
new popup suite. Both integration failures (stale CSS expectations and an
unavailable dash export in the import audit) also fail on untouched HEAD.

Actual GNOME Shell 48.7 acceptance is still required for pointer crossing under
real compositor grabs, thumbnail GPU output, focus restoration, popup and DND
stacking, multi-monitor behavior, and unchanged appearance at native scales.

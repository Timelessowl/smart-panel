# Dash refactor review

Implemented on 2026-10-20 against the project's GNOME Shell 48.7 reference
in `examples/gnome-shell`.

## Ownership and native GJS boundaries

- `dashUtils.js` exports only stateless helpers. Activation cycles belong to
  `DashSection`; pending monitor-specific launches belong to `DashSource`.
- `NotificationsMonitor` in `src/extension/notificationsMonitor.js` now follows
  the user's supplied EventEmitter reference. It retains the state/merge model,
  app-name resolution, D-Bus callbacks and count-based tray updates. Ordinary
  module-local connection records replace GlobalSignalsHandler. Per-source
  records prevent removing one source's handlers from disconnecting others.
  The existing shared update signal, app-ID queries and DND state are retained
  as integration adapters alongside the reference's per-app update signals.
- `DashBadge` is a registered `St.Label`. Settings, monitor, desktop ID and
  container are explicit dependencies. Actor-bound connections handle native
  destruction. The existing capable-app list, opt-in setting, global switch,
  count cap, urgent style and Do Not Disturb behavior remain in effect.
- `DashLabel` is one registered BoxPointer per dash. It owns cancellable GLib
  timers and opacity transitions. Reusing the actor avoids orphaned labels
  during rapid hover changes or teardown while fading. Its source listener is
  separate from BoxPointer's native source connections.
- Custom JavaScript accessor getters were removed from runtime modules. Plain
  properties hold settings, mode flags, draggable and expansion state; query
  methods still return derived collections or scoped windows.
- Section destruction cleans independent chrome and pending drops even when
  initiated by a native parent. Extension disable now destroys DashSource too.

## Behavior fixes

A secondary-button press captured by a preview closes it and opens the native
menu for the clicked DashIcon, including another icon in the same dash. This
uses the existing popup event path and native menu/grab ownership.

Favorite drops write `org.gnome.shell` / `favorite-apps` once through
`global.settings`. Every panel follows the saved system order, and source
recreation retains it. Running-to-favorite drops save membership and insertion
position together. Fixed launchers stay first; unavailable stored desktop IDs
are preserved. Locked settings reject favorite changes. Running order remains
local and temporary.

`Session.scale(value)` reads the primary monitor's `geometry_scale` at call
time. Panel, dash, expanded layout, preview dimensions and indicator buttons
use it directly without scale-factor dependency injection. CSS dimensions and
St icon sizes remain logical to avoid double scaling. Native resource/view
transforms in the blur renderer remain framebuffer calculations, independent
of UI dimension scaling.

Window title/taskbar changes now trigger refresh. Monitor moves remain observed
when isolation is enabled after startup. GLib timeout bookkeeping no longer
retains expired source IDs or loses replaced/repeating timers.

## Validation

- `npm run lint`: passes.
- `npm run type:check`: passes; the starting workspace had 27 diagnostics.
- `npm run build`: passes, including GSettings schema compilation.
- `git diff --check`: passes.
- Focused source, layout, notification, label, DND, native-popup, timer and panel
  suites after the reference adaptation: **61 specs, zero failures**.
- Last full-suite run before the reference adaptation: **112 specs, 33 failures**, seed 79734. The starting workspace run
  reported **97 specs, 50 failures**. Remaining failures are the older PanelMenu
  dash fixtures/missing API doubles, outdated frame/stylesheet assertions and
  the import audit's unavailable generated dash module. The harness now
  validates dependencies before concurrent VM linking so missing doubles do
  not create unhandled rejections attributed to unrelated suites.

These checks use API doubles and do not establish live GNOME acceptance. A Shell
reload is still needed to check real popup grabs, badge/label rendering, scaled
monitors, and saved favorite ordering in the desktop session.

## References

The native implementations checked were `js/ui/messageTray.js`,
`js/ui/popupMenu.js`, `js/ui/appDisplay.js`, `js/ui/appFavorites.js`,
`js/ui/boxpointer.js` and `js/misc/signalTracker.js` in the local Shell reference.
See also [GObject basics](https://gjs.guide/guides/gobject/basics.html) and
[GObject subclassing](https://gjs.guide/guides/gobject/subclassing.html).

## Notification coverage comparison

The earlier Shell-only monitor was replaced with the implementation shown in
three user-supplied screenshots, with minimal integration changes:

- Native Shell EventEmitter replaces the earlier registered GObject monitor,
  matching the reference and supporting its dynamic per-app signal names.
- `getState` accepts both the reference's Shell.App objects and existing badge
  callers' desktop-ID strings. Both per-app and shared update signals are emitted.
- Current DND handling stays in place. Logger calls use this project's static
  logger, with parse errors reported through `console.error`.
- Ordinary connections are held in a local array and a per-source Map, then
  disconnected directly on removal/teardown. No GlobalSignalsHandler is used.
- The reference's default fields, merge/change rules, app-name matching and
  `notify::count` behavior are preserved. Source counts assign `trayCount` as in
  the screenshots; this version does not aggregate counts across sources.

The supplied D-Bus subscriptions and parsing are preserved, including the
`Notify` subscription. Standard `org.freedesktop.Notifications.Notify` is a
method whose second argument is `replaces_id`; subscribing to a signal with that
name does not observe standard method calls. Tests exercise the supplied callback
contract and cleanup using doubles, not actual D-Bus delivery on GNOME.

[Dash to Panel's notificationsMonitor.js](https://github.com/home-sweet-gnome/dash-to-panel/blob/master/src/notificationsMonitor.js)
uses the separate `com.canonical.Unity.LauncherEntry.Update` signal for
app-reported badge counts. The supplied reference does not include that channel,
and this adaptation does not add it. There is no claim of full LauncherEntry
or app-unread-count equivalence.

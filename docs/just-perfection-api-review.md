# Just Perfection API assessment

Reviewed on 2026-10-06 against GNOME Shell 48.7 and upstream commit
`6e82a6ebf8e9578f2ffe4e06b88f5d23f600b947` in the author's
[source mirror](https://github.com/jrahmatzadeh/just-perfection/tree/6e82a6ebf8e9578f2ffe4e06b88f5d23f600b947).
The API file's Git blob is `b56d882726ff4e70f2b708d3e426fbd81ebcffe2`.

## Recommendation

Use Just Perfection as a source for selected Shell integration techniques. Do
not vendor its entire API for the present requirements or known future direction.
Default-panel suppression is a confirmed future requirement; it deserves the
upstream implementation's careful work-area and lifecycle handling. Additional
useful techniques are conditional on future product decisions and do not yet
justify a general Shell-tweaking library.

This assessment covers all five OpenSpec feature/master specifications, their
designs, `DashSectionSpec.md`, current extension code, and the user messages in
the earlier **Create simple GNOME dock extension** chat. Later corrections take
precedence over the original POC requests: real dash state replaces stubs;
search suggestions and the overlay preference were removed; geometry belongs
to BottomPanel; Wayland scaling stays native; and reusable behavior should have
one clear owner without unnecessary managers.

## Fit with present and future work

| Area | Project direction | Value of the API |
| --- | --- | --- |
| Stock top panel | Hide it throughout active use, including overview, and restore Shell state on disable. | Strong reference: `panelHide(0)` and `panelShow()` handle more than actor visibility. |
| Stock overview dash | Launchpad must continue to toggle overview. Hiding its native dash has not been requested. | Conditional: `dashHide()` also adjusts window-preview overlap if our dash later replaces the overview dash. |
| Custom search | Heavier search logic is deferred; removed suggestions must stay removed for now. | Limited: entry visibility and type-to-search switches modify GNOME's overview, not our search data, providers, or results UI. |
| Extension indicators | Earlier messages explicitly include indicators registered by other extensions, such as the Looking Glass button. Each monitor owns its views. | No provider bridge: stock-control visibility methods do not discover extension indicators, duplicate them per monitor, or supply our descriptors. |
| Date, notifications, quick settings | Current buttons are placeholders; real menus are intended later. | No custom-menu integration: methods hide/show or rearrange Shell's existing controls. They do not connect our buttons or provide independent per-monitor menus. |
| Keyboard layout | A clickable layout control belongs inside the search section; the current EN label is a placeholder. | No data or action service: `keyboardLayoutShow/Hide()` only changes the stock indicator's visibility. |
| Notifications and volume/brightness OSD | A possible later need is placing overlays clear of our bottom panel. No placement requirement exists yet. | Conditional reference: banner and OSD positioning exist, but panel-aware offsets and placement policy would still need design. |
| Multi-monitor geometry and reservation | Independent panels, monitor-local scaling, and mandatory work-area reservation are already specified. | Poor fit: `monitorGetInfo()` returns the primary monitor; `panelSetPosition()` moves the stock panel; `chromeAdd()` uses `affectsStruts: false`. |
| Styling, app/window models, drag-and-drop | Local Sass palettes, real models, favorite membership, local order, and overflow are already defined. | No useful replacement: stock icon sizing, global CSS classes, and overview tweaks operate on different actors. |

These conclusions are project-specific inferences from the local requirements and
the upstream [API implementation](https://github.com/jrahmatzadeh/just-perfection/blob/6e82a6ebf8e9578f2ffe4e06b88f5d23f600b947/src/lib/API.js).
Alt-Tab sizing, workspace behavior, global animation changes, auto-maximization,
attention-focus policy, and background/window-menu suppression have no requested
role in this panel.

## What is worth borrowing for panel hiding

The [panel implementation](https://github.com/jrahmatzadeh/just-perfection/blob/6e82a6ebf8e9578f2ffe4e06b88f5d23f600b947/src/lib/API.js#L373)
removes the stock panel from chrome tracking, reparents it into the overview
group, translates it away in the fully hidden mode, adjusts overview search
spacing, reacts to height/work-area changes, refreshes hot corners, and includes
a Wayland unlock work-area workaround. Restoration returns chrome/strut tracking
and removes the associated signals and timeout. A replacement should preserve
that intent and validate it for our specific Shell version rather than assume
a single hide/show call is sufficient.

There is a concrete version-gate concern for our target: upstream
[extension startup](https://github.com/jrahmatzadeh/just-perfection/blob/6e82a6ebf8e9578f2ffe4e06b88f5d23f600b947/src/extension.js#L85)
passes a floating-point Shell version, while the panel workaround tests
`shellVersion <= 48`. A value of 48.7 skips a workaround whose comment includes
GNOME 48. That is a source-level finding, not proof that the workaround is still
needed on 48.7; any adoption must review the gate and test the actual behavior.

## Why the whole API costs more than its name suggests

The reviewed file has roughly 3,600 lines and 148 public methods. It is a
collection of Shell UI overrides rather than a stable GNOME service API.
Dependencies are injectable and optional, so callers can select a subset, but
methods still have implicit dependencies on helpers and Shell internals.
Several operations patch prototypes or global objects and rely on the separate
upstream stylesheet. Its normal `open()` also installs unrelated Looking Glass
handling.

Cleanup is split across components: upstream
[Manager.stop()](https://github.com/jrahmatzadeh/just-perfection/blob/6e82a6ebf8e9578f2ffe4e06b88f5d23f600b947/src/lib/Manager.js#L57)
reverts enabled settings before `API.close()` handles remaining housekeeping.
Calling `close()` alone does not restore a hidden panel. A local adapter must
explicitly restore every change it owns and consider conflicts with other
extensions changing the same actors or methods. Source reuse also needs to retain
the upstream GPL-3.0-only notice and attribution.

## Implementation boundary for the next feature

Keep stock-panel suppression owned once at extension lifecycle level, separate
from BottomPanel geometry and monitor recreation. Introduce only the approved
operations; borrow upstream handling instead of building a speculative generic
manager. Preserve native overview/app-grid behavior. Real indicator, menu, input
source, and search integrations should use their own data/ownership boundaries.

Before shipping stock-panel suppression, specify and validate full hiding in
desktop and overview, release of its top work-area reservation, continued bottom
reservation on every monitor, restart/enable failure cleanup, lock/unlock and
monitor changes, and restoration on disable. Keep native system controls available
through the future replacement integrations. The API alone does not solve that
functional gap.

The present change renames the blur modules to `externals/`; it does not yet
implement stock-panel hiding or add Just Perfection code to the runtime.

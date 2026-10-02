# Debian Menu Design

## Context

The contract is [debian-menu](../../specs/debian-menu/spec.md). The current
`DebianButton` already inherits `BaseSection`, creates a square panel button,
opens a bottom-anchored native popup, supplies four notification placeholders,
and delegates its final launcher to extension preferences.

Known gap: launcher descriptors are constructor-local, each icon is a separate
`PopupBaseMenuItem`, and a `PopupSeparatorMenuItem` precedes preferences. This
does not satisfy the approved one-container narrow strip. These are outstanding
implementation tasks, not changes made by this documentation baseline.

## Goals / Non-Goals

Goals: intrinsic narrow width, one vertically arranged menu item, individually
interactive children, no separator, accessible actions, and predictable cleanup.

Non-goals: connecting account/recent/settings/power integrations, implementing
new submenus now, restoring stubs, or making the panel section resizable.

## Decisions

### Keep the section fixed and framing inherited

Use `BaseSection.setSectionContent()` for the Debian button and leave `canExpand`
false. Only BottomPanel allocates its square. The icon fallback names remain
`distributor-logo-debian`, `debian-swirl`, and `start-here-symbolic`; the requested
icon size remains 30 logical pixels. Neutral interaction CSS is shared across
the Debian states without inheriting a blue accent fill.

### Put immutable launcher metadata at module scope

Define `LAUNCHERS` as a module-level constant for icon names, accessible names,
and action identifiers. Resolve the preferences callback per instance rather
than capturing instance state in a supposedly immutable shared descriptor.
Keep the existing placeholder notification content; the shared data must not
accidentally execute a real power action or open system settings.

### One menu item contains the vertical controls

Replace separate popup items with one non-activating container item containing
a vertical `St.BoxLayout` and one `St.Button` per launcher. Child buttons own
their accessible names and click callbacks; the container must not consume
their input or mark the entire column insensitive. This preserves a place for
later child-specific popup ownership without implementing those menus now.

Retain native popup positioning and a proper popup-menu manager for dismissal.
Suppress inherited text-menu minimum width and expansion only for the Debian
popup/container selectors. Let its content's natural width plus small padding
determine the popup width; do not impose a broad fixed width. Native arrow/shadow
chrome may add a small amount outside that content width. Remove the separator
actor entirely rather than hiding a residual row.

### Individual actions stay explicit

The first four buttons show placeholder notifications; the app-grid button
invokes the injected `openPreferences` callback. Do not route all child clicks
through one container-wide activation signal. Keyboard focus must reach each
button and Enter/Space must activate only the focused launcher. Popup close
behavior should use native menu lifecycle rather than destroying the panel button.

## Risks / Trade-offs

- Native popup classes may impose minimum width through descendants → verify
  actual content and popup bounds in Shell, not only styles or doubles.
- An insensitive container can disable its children → test focus/click routing
  to each child while keeping the container itself non-activating.
- A single container does not itself provide future submenus → preserve child
  identity and ownership boundaries; submenu behavior remains unspecified.
- Notification placeholders could be mistaken for connected integrations →
  retain explicit placeholder text and do not add real launch commands.

## Migration Plan

No settings migration is required. Change only the menu construction, associated
popup styles, and tests; preserve the panel button and openPreferences boundary.
Install updated files and restart Shell for native acceptance. Roll back by
reinstalling the previous runtime files and restarting, without modifying GNOME
favorites or user preferences.

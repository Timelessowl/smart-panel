# System Section Design

## Context

The contract is [system-section](../../specs/system-section/spec.md).
`SystemSection` is a BaseSection subclass with a horizontal date/time button and
wireless-style quick-settings button. The clock is live; both button actions are
notifications announcing future integrations. There is no native date menu,
quick-settings proxy, or network-status provider in this feature yet.

## Goals / Non-Goals

Goals: preserve the fixed right anchor, immediate readable local clock, explicit
placeholder actions, per-panel timer ownership, and clean teardown.

Non-goals: calendar or notification-center UI, timezone selection, GNOME clock
format preference integration, live connectivity, real quick settings, and any
system configuration mutation.

## Decisions

### The parent owns size and placement

Keep `canExpand` false. BottomPanel allocates the system section using SYSTEM_WIDTH
(currently 176 logical pixels), SECTION_HEIGHT, and right horizontal padding.
BaseSection adds its shared solid frame; SystemSection does not calculate
monitor-dependent bounds. Indicator count changes cannot alter this anchor.

### A local clock is sufficient for the MVP

Create the label and update it immediately with
`GLib.DateTime.new_now_local().format('%b %d  %H:%M')`, then refresh through a
30-second `GLib.timeout_add_seconds()` callback. `%b` follows the runtime locale;
24-hour time and the date format are fixed for this baseline. A timer per panel
keeps ownership simple. A shared clock service, second-level display, and format
preferences are unnecessary at this stage.

### Placeholder actions are not system integration

The date button is accessible as `Date and time` and emits the existing Date menu
notification. The quick-settings button is accessible as `Quick settings`, uses
`network-wireless-signal-excellent-symbolic` at 20 logical pixels, and emits the
existing Quick settings notification. The icon is decorative, not proof of a
connected wireless network. Do not proxy Main.panel's real menu as part of tests
or documentation alignment.

### Styling remains shared

The outer section uses BaseSection framing and panel `.dark`/`.light` palettes.
Buttons have neutral hover rules; clock text and symbolic icons inherit the
appropriate foreground. Native icon/CSS scaling must stay consistent with the
panel's stage allocation. Fixed width may require native locale/scale checks to
ensure the clock and icon stay inside the frame.

### Timer and callbacks have an explicit owner

Store the timeout source ID and both click connection IDs on the section.
Destroy disconnects button actions and removes the timer before destroying the
actor tree. MonitorManager's panel removal is the top-level owner of section
teardown. The timer callback must not run against a removed date label.

## Risks / Trade-offs

- A 30-second refresh is not aligned to minute boundaries → the displayed minute
  can lag until the next refresh; second-accurate updates are not required.
- Locale-dependent month names can vary in width → include native containment
  checks; do not silently change the fixed-width or date-format contract.
- Native actor destruction differs from explicit JS destroy calls → test timer
  cancellation on actual monitor removal and extension disable.
- Wireless artwork can imply live status → keep the placeholder boundary explicit
  in documentation and do not introduce fake status updates.

## Migration Plan

No new settings or integration is introduced. Add clock/action/lifecycle tests
and fix only failures against the existing contract. Native acceptance requires
reinstallation and a real Shell restart after any future code update. A later
calendar/quick-settings feature must introduce its own requirement delta rather
than silently extending these placeholder actions.

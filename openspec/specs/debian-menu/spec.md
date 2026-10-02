# Debian Menu Specification

## Purpose

Provide a fixed-size Debian launcher button and a compact vertical icon menu,
with simple placeholder actions and a working extension-preferences launcher.

## Requirements

### Requirement: Fixed Debian button

The section SHALL remain a square at the panel's left anchor, with the shared
surface and frame. Its button SHALL display a Debian-themed icon, have the
accessible name `Debian menu`, and SHALL NOT expand with menu content.

#### Scenario: Menu is opened

- **WHEN** the user clicks the Debian button
- **THEN** its popup toggles open above the bottom panel
- **AND** the square section and neighboring section positions do not change.

### Requirement: Neutral interaction styling

The button SHALL use theme-appropriate neutral hover, focus, and pressed styling
consistent with the other panel controls, rather than an accent-blue fill.

#### Scenario: Hover in light style

- **WHEN** the pointer enters the Debian button in light style
- **THEN** its background receives a neutral highlight
- **AND** the Debian icon remains clearly visible.

### Requirement: Compact vertical launcher strip

The popup SHALL present its launchers as clickable children of one vertically
arranged container item. Its width SHALL be determined by the icon controls and
small padding, not a wide text-menu minimum. It SHALL contain no separator or
visible label column. Each child SHALL retain its own accessible name and action
boundary so later child-specific menus do not require redesigning the strip.

#### Scenario: Popup content is displayed

- **WHEN** the popup opens
- **THEN** five icon controls appear in one vertical column
- **AND** the popup is only slightly wider than the controls plus native popup chrome
- **AND** there is no separator before the final icon.

### Requirement: Explicit placeholder launchers

The first four launchers SHALL appear in order as User, Recent items, Settings,
and Power. Activating one SHALL show a notification describing its placeholder
action. The Power placeholder SHALL NOT shut down the system; the Settings
placeholder SHALL NOT claim to open real system settings.

#### Scenario: Power placeholder is activated

- **WHEN** the user clicks the Power icon
- **THEN** a placeholder notification is shown
- **AND** no shutdown, logout, or other session mutation occurs.

### Requirement: Extension preferences launcher

The final launcher SHALL use an app-grid icon and SHALL open this extension's
preferences. It SHALL NOT open removed stub controls.

#### Scenario: Preferences launcher is activated

- **WHEN** the user clicks the Dash preferences icon
- **THEN** the extension preferences window opens with the dash mode/filter options.

### Requirement: Menu ownership and cleanup

Each monitor's Debian section SHALL own its popup independently and SHALL destroy
it when that section is removed.

#### Scenario: Monitor panel is replaced

- **WHEN** a monitor's panel is replaced while its Debian menu is open
- **THEN** the old popup disappears and its launcher callbacks are disconnected.

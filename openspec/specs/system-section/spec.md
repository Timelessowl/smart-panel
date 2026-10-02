# System Section Specification

## Purpose

Provide the rightmost fixed-size date/time and quick-settings section as an MVP
with a live local clock and explicitly placeholder menu actions.

## Requirements

### Requirement: Fixed rightmost section

The section SHALL remain at the panel's right padding with a configured fixed
width, including the shared frame, and the shared section height. It SHALL contain
the date/time button followed by a quick-settings button and SHALL NOT expand.

#### Scenario: Indicators are added before the section

- **WHEN** the indicator section becomes wider
- **THEN** the system section's width and right anchor remain unchanged.

### Requirement: Immediate local clock

The date/time button SHALL show the current local date and time immediately on
creation, using abbreviated month, two-digit day, and 24-hour hours/minutes.
It SHALL refresh periodically at a 30-second interval while its panel exists.

#### Scenario: Section is created

- **WHEN** a monitor panel creates its system section
- **THEN** the current local clock is shown immediately without waiting for a timer tick.

#### Scenario: Local minute changes

- **WHEN** the next periodic refresh runs after a minute boundary
- **THEN** the displayed local time reflects the current minute.

### Requirement: Date action remains a placeholder

The date/time button SHALL have the accessible name `Date and time`. Clicking
it SHALL show a Date menu placeholder notification; it SHALL NOT claim to provide
a calendar, notification center, or native GNOME date menu in this baseline.

#### Scenario: Date/time is clicked

- **WHEN** the user activates the date/time button
- **THEN** a notification states that the date menu will be connected later.

### Requirement: Quick settings remain a placeholder

The quick-settings button SHALL have the accessible name `Quick settings` and
display a wireless-style symbolic icon. Clicking it SHALL show a Quick settings
placeholder notification. The icon SHALL NOT be interpreted as live connectivity
status, and the action SHALL NOT modify network or other system settings.

#### Scenario: Quick settings is clicked

- **WHEN** the user activates the quick-settings button
- **THEN** a notification states that quick settings will be connected later
- **AND** no system configuration changes.

### Requirement: Readable common presentation

The clock and quick-settings button SHALL stay inside the shared section surface
and frame. Their text, symbolic icon, and neutral hover states SHALL remain legible
in both palettes and at the panel's supported scaling.

#### Scenario: Light style is enabled

- **WHEN** the system Dark Style preference is off
- **THEN** the clock and symbolic control use contrasting dark foregrounds
- **AND** no control is rendered outside the section.

### Requirement: Monitor-local clock lifecycle

Each monitor panel SHALL own its own clock refresh lifecycle. Destroying its
system section SHALL stop the clock timer and disconnect both button actions.

#### Scenario: A monitor is removed

- **WHEN** a monitor panel is destroyed
- **THEN** its clock no longer receives refresh callbacks
- **AND** system sections on remaining panels continue to update.

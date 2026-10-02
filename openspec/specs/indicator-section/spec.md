# Indicator Section Specification

## Purpose

Display a variable-size section of supplied indicator descriptors and simple
per-indicator menus, without implementing system tray discovery or a mock control UI.

## Scope

An indicator descriptor supplies an icon name, accessible name, and optional
menu entries with labels and actions. The extension currently supplies no
indicators on startup. Counts from zero through ten are acceptance examples,
not a restored stub preference or an imposed provider limit.

## Requirements

### Requirement: Descriptor-driven population

The section SHALL display one clickable icon per supplied indicator descriptor
in supplied order. Replacing descriptors SHALL replace the displayed set rather
than append duplicates. It SHALL NOT discover or relocate system indicators itself.

#### Scenario: Three indicators are supplied

- **WHEN** the provider supplies three descriptors
- **THEN** the section contains exactly three icons in that order, with no empty slots.

### Requirement: Explicit empty state

With zero descriptors the section SHALL expose a false `hasIndicators` state,
have zero preferred width, and be hidden including its frame. With at least one
descriptor it SHALL expose true `hasIndicators` and become visible.

#### Scenario: Last indicator is removed

- **WHEN** the descriptor set changes from one item to an empty set
- **THEN** the section's presence state becomes false and no frame remains visible.

### Requirement: Count-dependent width

The section SHALL use the shared fixed section height while requesting a width
based on its indicator count, including frame space. One indicator SHALL occupy
a square section. Additional indicators SHALL increase the preferred width,
rather than retaining a fixed-size area with empty slots.

#### Scenario: Count increases from one to ten

- **WHEN** descriptors are supplied for counts one, two, five, and ten
- **THEN** each successive count produces a wider section
- **AND** the icons remain at their configured size and shared section height.

### Requirement: Right-anchored growth

The section SHALL remain immediately before the system section at the configured
gap and SHALL grow toward the left when its width increases. It SHALL NOT move
or resize the system section. This baseline SHALL NOT add indicator overflow,
search-collision handling, or expanded multi-row behavior.

#### Scenario: A provider adds another indicator

- **WHEN** a visible section receives one additional descriptor
- **THEN** its right edge stays fixed relative to the system section
- **AND** its requested width grows toward the left.

### Requirement: Per-indicator menu actions

Clicking an indicator SHALL toggle its own menu of the supplied label/action
pairs. Its icon SHALL carry the supplied accessible name. Actions SHALL run only
when their corresponding menu entries are activated.

#### Scenario: Notification entry is selected

- **WHEN** a descriptor contains a Show notification entry and the user activates it
- **THEN** that descriptor's callback runs once
- **AND** other indicators' callbacks do not run.

### Requirement: Shared styling and scaling

The section SHALL use the panel's common solid theme and frame. Icon control
bounds and spacing SHALL follow the panel's compositor-aware scaling rules.

#### Scenario: Indicator appears on a scaled X11 monitor

- **WHEN** an indicator is supplied on an X11 panel at scale 2
- **THEN** its control bounds and section geometry scale consistently
- **AND** its icon remains contained inside the section frame.

### Requirement: Replacement cleanup

Replacing or destroying the section SHALL destroy the previous indicator menus
and buttons, without retaining active actions for removed descriptors.

#### Scenario: Descriptors are replaced while a menu is open

- **WHEN** the current set is replaced with another set
- **THEN** old popup actors disappear and only the new set remains interactive.

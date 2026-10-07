# Debian Menu Contract Alignment

## Why

The current popup uses several menu items plus a separator, despite the approved narrow single-container strip. This change brings the implementation into conformance with the already-established Debian menu contract.

## What Changes

- Move invariant launcher descriptors to a module-level constant.
- Use one vertical menu container with clickable icon children and no separator.
- Remove inherited wide-menu constraints while preserving accessible names, placeholder actions, and preferences launching.
- Add structural and native acceptance checks for layout and menu cleanup.

## Capabilities

### New Capabilities

None. The brownfield requirements baseline is already present in
`openspec/specs/debian-menu/spec.md`.

### Modified Capabilities

None. This change aligns or verifies the existing contract; it does not change
requirements. `.openspec.yaml` sets `skip_specs: true`; no delta spec is needed.

## Impact

src/components/debianButton.js, the Debian popup selectors in src/style/_debian.scss, and new Debian menu tests. No new launcher integrations or runtime dependencies.

This is a planning artifact only. Creating this change does not implement its
unchecked tasks or establish native Shell acceptance.

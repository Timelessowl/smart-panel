# Panel Shell Baseline Verification

## Why

The shared panel behavior spans geometry, monitor lifecycle, scaling, and input handling. Existing code needs an explicit acceptance checklist so a passing unit suite is not mistaken for native GNOME validation.

## What Changes

- Record the existing shared architecture and its verification boundaries.
- Add missing panel, theme, monitor-lifecycle, and installer checks against the master contract.
- Keep native multi-monitor, scaling, and work-area acceptance open until tested.

## Capabilities

### New Capabilities

None. The brownfield requirements baseline is already present in
`openspec/specs/panel-shell/spec.md`.

### Modified Capabilities

None. This change aligns or verifies the existing contract; it does not change
requirements. `.openspec.yaml` sets `skip_specs: true`; no delta spec is needed.

## Impact

components/baseSection.js, components/bottomPanel.js, monitorManager.js, themeManager.js, transientInputManager.js, extension.js, install.sh, and development tests.

This is a planning artifact only. Creating this change does not implement its
unchecked tasks or establish native Shell acceptance.

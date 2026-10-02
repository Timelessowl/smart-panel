# Dash Contract Verification

## Why

The real dash and drag/drop fixes are implemented, but API-double coverage does not establish native GNOME drag handling, stacking, or scaling correctness. The approved behavior needs a feature-specific design record and explicit remaining acceptance tasks.

## What Changes

- Record shared model/source ownership and panel-local projection, activation, and order.
- Maintain projection, layout, activation, source, indicator, drag/drop, and dismissal regression coverage.
- Verify native menus, drop acceptance, preview cleanup, expansion, and multi-monitor behavior.

## Capabilities

### New Capabilities

None. The brownfield requirements baseline is already present in
`openspec/specs/dash-section/spec.md`.

### Modified Capabilities

None. This change aligns or verifies the existing contract; it does not change
requirements. `.openspec.yaml` sets `skip_specs: true`; no delta spec is needed.

## Impact

components/dashSection.js, components/dash/*, prefs.js, the extension schema, transientInputManager.js, and tests. No stub controls or new application-discovery policy.

This is a planning artifact only. Creating this change does not implement its
unchecked tasks or establish native Shell acceptance.

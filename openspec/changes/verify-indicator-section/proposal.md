# Indicator Contract Verification

## Why

The indicator section has a descriptor-driven view but no connected system-indicator source. Its empty state, width growth, actions, and lifecycle need focused checks without reintroducing the removed stub UI.

## What Changes

- Record the supplied-descriptor boundary and count-dependent sizing.
- Add tests for zero state, counts through ten, replacement, per-indicator actions, and cleanup.
- Verify scaled native placement without adding overflow or live tray discovery.

## Capabilities

### New Capabilities

None. The brownfield requirements baseline is already present in
`openspec/specs/indicator-section/spec.md`.

### Modified Capabilities

None. This change aligns or verifies the existing contract; it does not change
requirements. `.openspec.yaml` sets `skip_specs: true`; no delta spec is needed.

## Impact

components/indicatorSection.js, BottomPanel.setIndicators, MonitorManager.setIndicators, and indicator tests. Production startup continues to supply an empty set.

This is a planning artifact only. Creating this change does not implement its
unchecked tasks or establish native Shell acceptance.

# System Section Contract Verification

## Why

The system section intentionally combines a real clock with notification-only buttons. Explicit checks are needed to preserve that MVP boundary and avoid implying that native date/quick-settings integration already exists.

## What Changes

- Record fixed right anchoring, local clock formatting, refresh ownership, and placeholder actions.
- Add timer, action, and teardown tests.
- Verify native containment, theme contrast, and monitor-local clock lifecycle.

## Capabilities

### New Capabilities

None. The brownfield requirements baseline is already present in
`openspec/specs/system-section/spec.md`.

### Modified Capabilities

None. This change aligns or verifies the existing contract; it does not change
requirements. `.openspec.yaml` sets `skip_specs: true`; no delta spec is needed.

## Impact

src/components/systemSection.js, its stylesheet selectors, and system-section tests. No native calendar, quick-settings, or network-status integration.

This is a planning artifact only. Creating this change does not implement its
unchecked tasks or establish native Shell acceptance.

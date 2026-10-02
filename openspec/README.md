# Project specifications

The [master spec](specs/panel-shell/spec.md) defines the shared panel contract.
Feature specs describe approved behavior, including existing placeholders.
They are the requirements baseline, not a declaration that all acceptance
checks have passed. Search has no feature spec in this baseline.

| Capability | Requirements | Design and tasks |
| --- | --- | --- |
| Panel shell (master) | [spec](specs/panel-shell/spec.md) | [design](changes/verify-panel-shell/design.md), [tasks](changes/verify-panel-shell/tasks.md) |
| Debian menu button | [spec](specs/debian-menu/spec.md) | [design](changes/align-debian-menu/design.md), [tasks](changes/align-debian-menu/tasks.md) |
| Dash | [spec](specs/dash-section/spec.md) | [design](changes/verify-dash-section/design.md), [tasks](changes/verify-dash-section/tasks.md) |
| Indicators | [spec](specs/indicator-section/spec.md) | [design](changes/verify-indicator-section/design.md), [tasks](changes/verify-indicator-section/tasks.md) |
| System/date section | [spec](specs/system-section/spec.md) | [design](changes/verify-system-section/design.md), [tasks](changes/verify-system-section/tasks.md) |

## Organization

This is a brownfield baseline reconstructed from the project, the user's
decisions, and `DashSectionSpec.md`. The original document is preserved; the
dash spec here incorporates subsequent clarifications and supersedes it where
they differ. Files outside this directory are unchanged by this documentation
baseline except the repository README's link to this index.

OpenSpec keeps behavior in `specs/<capability>/spec.md` and implementation
artifacts in `changes/<change>/`. Each companion change has `proposal.md`,
`design.md`, `tasks.md`, and `.openspec.yaml`. These changes align or verify an
already-established contract; they do not introduce new requirements. Their
metadata therefore declares `skip_specs: true`, rather than duplicating the
baseline as fake ADDED/MODIFIED deltas. A future requirement change belongs in
`changes/<change>/specs/<capability>/spec.md` as a genuine delta, without that
opt-out. See the official [spec-driven format](https://openspec.dev/docs/schemas/spec-driven).

The companion changes remain active: native acceptance is not complete. Tasks
checked off identify existing work confirmed by inspection or automated tests;
unchecked tasks are remaining alignment or verification work. No historical
archive or successful VM session is fabricated.

## Known boundaries

- The Debian popup still has separate menu items and a separator in the current
  code. Its agreed single-container, narrow-strip layout is recorded in its
  spec and the remaining tasks in `align-debian-menu`.
- Indicators accept supplied descriptors but no live system-indicator provider
  is connected. Extension startup supplies an empty array.
- The system section has a real local clock but notification-only date and
  quick-settings buttons. Its wireless icon is not a network-status source.
- Dash tests use API doubles; native drag/drop, scaling, stacking, and monitor
  acceptance still need a GNOME Shell 48.7 session.
- Removed stubs, search suggestions, and the window-overlay preference stay
  removed. The old indicator count control is not restored by these specs.

## Validation

With an OpenSpec CLI supporting `skip_specs`, use:

```sh
openspec validate --all --strict
openspec list --specs
openspec list
```

Runtime tests do not require OpenSpec or Node to be installed in the extension.
The CLI is a documentation/development tool, not a runtime dependency.

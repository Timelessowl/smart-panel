# Debian Menu Tasks

The existing multiple-item popup is not marked complete for the target layout.

## 1. Launcher metadata and action boundaries

- [x] 1.1 Confirm the current launcher order and notification/preferences callbacks; verify DebianButton matches the actions described in the spec.
- [ ] 1.2 Move immutable icon/name/action identifiers into module-level LAUNCHERS and resolve instance callbacks separately; verify descriptors are not recreated per section or shared with mutable instance state.
- [ ] 1.3 Add callback tests for all five launchers; verify placeholders never call real power/system actions and preferences invokes only openPreferences.

## 2. Single-container strip

- [ ] 2.1 Build one menu container with a vertical layout and individually clickable child buttons; verify structural tests find one popup item and five controls.
- [ ] 2.2 Remove the separator and inherited wide-menu sizing; verify no separator actor exists and natural width follows icon controls plus small padding.
- [ ] 2.3 Add input/lifecycle tests for child focus, one-action-per-click, popup dismissal, and destruction; verify children remain interactive and old menus cannot fire actions.
- [ ] 2.4 Update the feature design's implementation-status paragraph after alignment; verify it no longer describes the old multi-item popup as current.

## 3. Native acceptance

- [ ] 3.1 Verify the narrow strip on GNOME 48.7 in both styles and at supported scales after a proper restart; record popup width and absence of separators.
- [ ] 3.2 Verify mouse and keyboard activation for every launcher, neutral Debian hover, and independent monitor popups; record each expected result.

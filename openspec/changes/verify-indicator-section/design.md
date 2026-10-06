# Indicator Section Design

## Context

The contract is [indicator-section](../../specs/indicator-section/spec.md).
`IndicatorSection` currently accepts descriptor arrays and owns corresponding
buttons/menus. Extension startup passes `[]`; MonitorManager.setIndicators()
can supply the same descriptors to every panel. No real system-indicator source
is connected, and the earlier population-count stub has been deleted.

## Goals / Non-Goals

Goals: explicit presence state, width proportional to item count, supplied-order
rendering, per-indicator actions, and correct replacement/teardown.

Non-goals: connecting system tray protocols, moving top-panel actors, a count
preference, a ten-item hard cap, indicator overflow, and search-collision handling.
Testing zero through ten preserves the earlier count acceptance range without
reintroducing mocking logic into the section.

## Decisions

### Descriptors are the integration boundary

`setIndicators()` consumes descriptors shaped as
`{iconName, name, menuItems: [{label, action}]}`. `menuItems` defaults to an empty
array. The section renders those descriptors but does not discover them or own
provider behavior. Each panel creates separate actor/menu instances for the
same supplied data, so one monitor does not reparent another's icons.

### Plain properties make presence and size explicit

`hasIndicators` is a normal boolean property. Empty input sets it false,
`preferredWidth` to zero, and `visible` to false for the entire section/frame.
For nonempty input it is true and the current preferred logical width is:

```text
INDICATOR_MIN_WIDTH + (count - 1) * INDICATOR_WIDTH_STEP
```

The defaults are 82 (content height plus band and outline on both sides) and 32,
respectively: counts 1, 2, 5, 10 request widths 82, 114, 210, 370 logical pixels.
BottomPanel converts the preferred width to
stage geometry and places the section from the right. BaseSection does not
perform panel geometry. `canExpand = true` allows content-dependent width but
does not create an expansion popup.

### Indicator controls stay centered and distinct

The content uses a centered horizontal box, 26-logical-pixel button bounds,
16-pixel requested symbolic icons, and six-pixel native CSS spacing. The shared
frame surrounds the content, not each indicator individually. Explicit button
bounds use the passed stage scale; icons/CSS retain native St scaling.
Count changes request a different section width instead of preserving empty slots.

### Menus remain per indicator

Every button owns a native bottom-anchored PopupMenu containing the descriptor's
label/action pairs. Clicking toggles that menu; activating an entry invokes its
callback. Current implementation directly toggles popups; proper native focus
and outside-dismissal behavior must be verified rather than assumed. If a menu
manager is needed, it stays owned by the section and does not become a global
indicator-discovery manager.

### Replacement destroys old state

Before accepting a new descriptor array, destroy previous menus and buttons.
Copy the input array so section membership is not coupled to later external
array mutation. Destroy menus before anchors and clear the menu collection.
Native actor teardown must not leave removed descriptor callbacks reachable.

## Risks / Trade-offs

- Providers can supply more than ten descriptors → no artificial count limit
  is imposed; search collision/overflow remains out of scope by user decision.
- Empty descriptor menus have no action → accept them as empty placeholders,
  without inventing notification callbacks inside the section.
- Popup focus/dismissal and native teardown lack dedicated tests → add doubles
  and native acceptance before declaring conformance complete.
- There is no connected provider → use isolated test descriptors for acceptance,
  not a shipped stub UI or claimed live-system indicator integration.

## Migration Plan

No settings migration or production indicator population is needed. Add tests
around the existing API and make only conformance fixes established by them.
Deploy any fix through the plain installer and proper Shell restart. Keep
extension startup empty until a separate real-provider feature is specified.

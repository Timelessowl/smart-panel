# System Section Tasks

The current clock is implemented; real date and quick-settings integration is not a task here.

## 1. Clock

- [x] 1.1 Confirm immediate local clock formatting and the 30-second refresh interval; verify SystemSection calls _updateClock before registering its timeout.
- [ ] 1.2 Add fake-clock tests for immediate rendering and a minute/date transition; verify the label uses the expected local format on every timer callback.
- [ ] 1.3 Add timer-removal tests; verify destruction cancels the exact source and later fake ticks cannot reach removed labels.

## 2. Actions and styling

- [x] 2.1 Confirm both accessible button names, placeholder notification actions, and the static wireless-style icon; verify no native menu or network provider is invoked.
- [ ] 2.2 Add button-action and disconnect tests; verify each click emits only its corresponding notification and teardown removes callbacks.
- [ ] 2.3 Verify native clock/icon contrast and containment in both styles and supported scales; record that controls stay inside the fixed-width section frame.

## 3. Panel integration

- [x] 3.1 Confirm inherited non-expanding state and fixed right placement; verify SystemSection does not resize itself and BottomPanel uses SYSTEM_WIDTH.
- [ ] 3.2 Add integration coverage for indicator growth and multiple system sections; verify the right anchor is unchanged and timers are independent.
- [ ] 3.3 Validate native monitor removal/disable while clocks are running; verify removed panels stop updating and remaining clocks continue.

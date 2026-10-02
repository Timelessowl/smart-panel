# Indicator Section Tasks

The provider is not connected; checked tasks record view code confirmed by inspection.

## 1. Data and presence

- [x] 1.1 Confirm setIndicators accepts supplied descriptors and the production entry point supplies an empty set; verify no indicator stub tab/provider is imported.
- [x] 1.2 Confirm ordinary hasIndicators/preferredWidth properties and whole-section visibility; verify zero input gives false, zero, and hidden state in the implementation.
- [ ] 1.3 Add automated descriptor/presence tests for empty, populated, replacement, and populated-to-empty transitions; verify exact counts, order, no duplicate actors, and hidden frame.

## 2. Width and layout

- [x] 2.1 Confirm count-dependent logical width and right-anchored parent placement; verify one indicator requests 64px and further items add 32px each with current constants.
- [ ] 2.2 Add count/scale tests for 0, 1, 2, 5, and 10 descriptors; verify preferred widths, constant control sizes, and containment with the shared frame.
- [ ] 2.3 Validate native placement of isolated test descriptors in both styles and supported scales; verify growth is leftward and the system section does not move.

## 3. Menus and replacement lifecycle

- [x] 3.1 Confirm each descriptor creates its own accessible button and supplied menu entries; verify the view does not generate provider actions or discover tray actors.
- [ ] 3.2 Add menu callback and replacement/destruction tests; verify only the chosen action runs and old popup/anchor actors are destroyed.
- [ ] 3.3 Validate native menu focus, outside dismissal, and replacement while open; record behavior and fix only deviations from the existing contract.
- [ ] 3.4 Verify repeated monitor replacement and disable with test indicators; verify menus and callbacks do not remain after section removal.

# Dash Section Tasks

Checked test tasks use API doubles; native acceptance remains separate.

## 1. Source and projection

- [x] 1.1 Use native Shell.App/Meta.Window identity with explicit source queries and disposable view descriptions; verify native identity and query cases in src/tests/unit/dash/dash.test.js and src/tests/unit/dash/dashSource.test.js.
- [x] 1.2 Observe real app/favorite/window state with coalesced refresh and cleanup; verify src/tests/unit/dash/dashSource.test.js, including monitor moves, title/eligibility updates, and shutdown.
- [x] 1.3 Implement fixed favorites, all-workspace monitor filtering, per-app exclusion, and per-window oldest-window fallback; verify projection cases in src/tests/unit/dash/dash.test.js.
- [x] 1.4 Preserve the clarified user choices in the canonical dash spec; verify it covers local ordering, global favorite membership, idle-favorite launching, and empty running state.
- [ ] 1.5 Validate real favorites/window tracking on GNOME 48.7 across monitors and workspaces; record both preference modes and source updates.

## 2. Layout, indicators, and expansion

- [x] 2.1 Keep Launchpad fixed at 40px and use the 40/32/+N layout sequence with complete token widths; verify layout/overflow/independent-monitor cases in src/tests/unit/dash/dash.test.js.
- [x] 2.2 Allocate count dots beneath the actual native icon without moving it; verify src/tests/unit/dash/dashIcon.test.js at both icon sizes and representative scales.
- [x] 2.3 Keep expansion above windows with native GrabHelper dismissal and PopupMenuManager previews; verify source and src/tests/unit/input/nativePopups.test.js cover popup nesting, hover, preview activation/peeking, drag ownership and cleanup using API doubles.
- [ ] 2.4 Validate native expansion with overflow and enough items to scroll; record frame/background retention, stacking, row access, and scroll-offset behavior.
- [ ] 2.5 Validate native popup focus, Escape, rapid outside clicks, preview hover switching and DND cancellation in a GNOME Shell 48.7 session; confirm standard dismissal without application click replay.
- [ ] 2.6 Validate initial layout, both icon sizes, dots, and narrow-width clipping at native X11/Wayland scales; record that search allocation is not crossed.

## 3. Activation, menus, and preferences

- [x] 3.1 Implement per-app oldest/next/minimize/repeat activation and reset signatures; verify activation cases in src/tests/unit/dash/dash.test.js.
- [x] 3.2 Bind mode/filter switches to boolean settings with false defaults; verify prefs.js and the schema preserve the documented keys/defaults.
- [ ] 3.3 Add direct DashIcon menu tests for desktop actions, no duplicate new-window action, represented-window close, readonly/non-pinnable controls, and cleanup; verify each eligible action's callback.
- [x] 3.4a Verify native panel-menu items, callbacks, switching, hide/destroy cleanup and click/keyboard behavior, monitor-scoped activation, new-window placement, simultaneous launches, and cleanup with API doubles in src/tests/unit/dash/dashMenu.test.js, src/tests/unit/dash/dashDnd.test.js, and src/tests/unit/dash/dashSource.test.js.
- [ ] 3.4 Validate native activation cycles and monitor-filtered idle-favorite launch; verify the new window appears on the clicked dash monitor and no remote window is moved or focused by the extension.
- [ ] 3.5 Validate preference persistence through a real Shell restart and live mode changes; verify membership and window-dot changes on all panels.

## 4. Drag-and-drop

- [x] 4.1 Exclude decorative frames from picking and supply icon/section/grid delegates; verify src/tests/unit/dash/dashDnd.test.js exercises native-style parent traversal, padding targets, and expanded targets.
- [x] 4.2 Apply persistent system favorite order/membership and panel-local running order after actor release; verify deferred-drop, fixed-launcher protection and shared favorite order in src/tests/unit/dash/dashRefactorDnd.test.js, plus persistence in dashSource.test.js.
- [x] 4.3 Add the 16px translucent insertion preview without changing section width; verify before/after position, scale, pick exclusion, and leave/drop/destroy cleanup tests.
- [x] 4.4 Keep shared source updates live during drag, defer only the dragging view rebuild, and refresh after actor release; verify cross-panel updates and geometry changes in src/tests/unit/dash/dashDnd.test.js.
- [ ] 4.5 Add tests for a pending accepted drop cancelled by panel destruction, per-window running-order IDs, readonly favorite drops, and external drag rejection; verify no stale idle action mutates state.
- [ ] 4.6 Validate native reordering and running-to-favorites drops in collapsed and scrolled expanded views on each monitor; record actual order, preview alignment, and unchanged other-panel order.
- [ ] 4.7 Validate native drop/cancel/leave/disable cleanup and restart-local order reset; verify no preview or drag monitor remains and favorites membership persists.

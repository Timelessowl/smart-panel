# Dash Section Tasks

Checked test tasks use API doubles; native acceptance remains separate.

## 1. Source, models, and projection

- [x] 1.1 Establish shared AppItem/WindowItem models without actor ownership; verify metadata and identity checks in tests/dash.spec.mjs.
- [x] 1.2 Observe real app/favorite/window state with coalesced refresh and cleanup; verify tests/dashSource.spec.mjs, including monitor moves, title/eligibility updates, and shutdown.
- [x] 1.3 Implement fixed favorites, all-workspace monitor filtering, per-app exclusion, and per-window oldest-window fallback; verify projection cases in tests/dash.spec.mjs.
- [x] 1.4 Preserve the clarified user choices in the canonical dash spec; verify it covers local ordering, global favorite membership, idle-favorite launching, and empty running state.
- [ ] 1.5 Validate real favorites/window tracking on GNOME 48.7 across monitors and workspaces; record both preference modes and source updates.

## 2. Layout, indicators, and expansion

- [x] 2.1 Keep Launchpad fixed at 40px and use the 40/32/+N layout sequence with complete token widths; verify layout/overflow/independent-monitor cases in tests/dash.spec.mjs.
- [x] 2.2 Allocate count dots beneath the actual native icon without moving it; verify tests/dashIcon.spec.mjs at both icon sizes and representative scales.
- [x] 2.3 Keep expansion above windows and dismissal non-modal; verify source uses top chrome and tests/transientInput.spec.mjs checks outside-click pass-through, related menus, and Escape cleanup.
- [ ] 2.4 Validate native expansion with overflow and enough items to scroll; record frame/background retention, stacking, row access, and scroll-offset behavior.
- [ ] 2.5 Validate native Escape and rapid outside clicks while typing/scrolling in another window; verify unrelated input still reaches that window.
- [ ] 2.6 Validate initial layout, both icon sizes, dots, and narrow-width clipping at native X11/Wayland scales; record that search allocation is not crossed.

## 3. Activation, menus, and preferences

- [x] 3.1 Implement per-app oldest/next/minimize/repeat activation and reset signatures; verify activation cases in tests/dash.spec.mjs.
- [x] 3.2 Bind mode/filter switches to boolean settings with false defaults; verify prefs.js and the schema preserve the documented keys/defaults.
- [ ] 3.3 Add direct DashIcon menu tests for desktop actions, no duplicate new-window action, represented-window close, readonly/non-pinnable controls, and cleanup; verify each eligible action's callback.
- [ ] 3.4 Validate native activation cycles and monitor-filtered idle-favorite launch; verify no remote window is focused by the empty local favorite.
- [ ] 3.5 Validate preference persistence through a real Shell restart and live mode changes; verify membership and window-dot changes on all panels.

## 4. Drag-and-drop

- [x] 4.1 Exclude decorative frames from picking and supply icon/section/grid delegates; verify tests/dashDnd.spec.mjs exercises native-style parent traversal, padding targets, and expanded targets.
- [x] 4.2 Apply panel-local order and system favorite membership after actor release; verify deferred-drop, fixed-launcher protection, and cross-panel membership cases in tests/dashDnd.spec.mjs.
- [x] 4.3 Add the 16px translucent insertion preview without changing section width; verify before/after position, scale, pick exclusion, and leave/drop/destroy cleanup tests.
- [x] 4.4 Pause source refresh during drag and resume after completion; verify pause/resume and lifecycle cases in source and DND tests.
- [ ] 4.5 Add tests for a pending accepted drop cancelled by panel destruction, per-window running-order IDs, readonly favorite drops, and external drag rejection; verify no stale idle action mutates state.
- [ ] 4.6 Validate native reordering and running-to-favorites drops in collapsed and scrolled expanded views on each monitor; record actual order, preview alignment, and unchanged other-panel order.
- [ ] 4.7 Validate native drop/cancel/leave/disable cleanup and restart-local order reset; verify no preview or drag monitor remains and favorites membership persists.

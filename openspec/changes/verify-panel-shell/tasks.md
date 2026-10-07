# Panel Shell Tasks

Checked tasks record existing work inspected during baselining, not native acceptance.

## 1. Shared structure and geometry

- [x] 1.1 Record actor inheritance, constructor registration, shared framing, and geometry ownership; verify the design against BaseSection and BottomPanel.
- [x] 1.2 Confirm monitor enumeration and panel recreation have no hardcoded count; verify MonitorManager iterates the discovered monitor list.
- [ ] 1.3 Add geometry and monitor lifecycle regression tests for zero/one/multiple monitors and monitor replacement; verify bounds, cleanup, and one panel per monitor.
- [ ] 1.4 Add frame/padding coverage at frame width 10 and representative scales; verify outer section bounds include framing and fixed controls do not shrink.

## 2. Theme, scaling, and work area

- [x] 2.1 Confirm the two palette classes and color-scheme signal ownership; verify ThemeManager and solid section styles match the design.
- [x] 2.2 Confirm the panel actor reserves its complete height and computes scale in its constructor; verify there is no overlay setting or separate scale/strut manager.
- [ ] 2.3 Add theme-service tests including existing expanded surfaces and preview actors; verify palette switching and signal/actor cleanup.
- [ ] 2.4 Validate native GNOME 48.7 X11 at 100% and 200%, and Wayland native scaling; record icon, frame, gap, and work-area observations.
- [ ] 2.5 Validate maximization on each monitor; verify equal top/bottom section padding and release of reservation after disable.

## 3. Deployment and cleanup

- [x] 3.1 Confirm Rollup builds GJS and Sass into dist, and ZIP packaging and local installation are independent Node scripts with no runtime tooling dependency.
- [x] 3.2 Exercise the build, ZIP packaging, and installer in disposable targets; verify native imports, compiled schemas, generated metadata, and exclusion of tests and specs with npm run test:integration.
- [ ] 3.3 Validate native disable and monitor replacement with expansion, popup menus, and drag activity; verify no actors, timers, signals, previews, or Escape registration remain.
- [ ] 3.4 Record native acceptance using a real X11 Shell restart or Wayland logout/login after updates; verify results are not based solely on disable/enable.

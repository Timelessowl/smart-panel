import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';

async function fixture({nativeHandler = true, actionMode = 1} = {}) {
    const blocked = new Set();
    class Display extends SignalObject {
        emit(signal) {
            for (const [id, record] of [...this.signals]) {
                if (record.signal === signal && !blocked.has(id)) record.callback(this);
            }
        }
    }
    const display = new Display();
    const nativeOverlay = jasmine.createSpy('nativeOverlay');
    const shellHandlerId = nativeHandler ? display.connect('overlay-key', nativeOverlay) : 0;
    const calls = [];
    class BottomPanel {
        constructor(monitor) {
            this._monitor = monitor;
            const {x, y} = monitor;
            this._appGrid = {
                isOpen: false,
                appGridActive() {
                    return this.isOpen;
                },
                openAppGrid() {
                    this.isOpen = true;
                    calls.push(['open', x, y]);
                },
                closeAppGrid() {
                    this.isOpen = false;
                    calls.push(['close', x, y]);
                },
            };
            this._dashSection = {closeExpanded: jasmine.createSpy('closeExpanded')};
        }
        destroy() {
            this.destroyed = true;
        }
    }
    class ThemeManager {
        addActor() {}
        removeActor() {}
        destroy() {}
    }
    const layoutManager = Object.assign(new SignalObject(), {
        monitors: [
            {index: 0, x: 0, y: 0, width: 1920, height: 1080},
            {index: 1, x: -1600, y: -200, width: 1600, height: 900},
        ],
    });
    let pointer = [500, 400, 0];
    const ActionMode = {NORMAL: 1, OVERVIEW: 2, POPUP: 4, LOCK_SCREEN: 8};
    const main = {
        actionMode,
        layoutManager,
        sessionMode: {hasOverview: true},
        overview: {visible: false, hide: jasmine.createSpy('hideOverview')},
    };
    const {MonitorManager} = await GjsHarness.loadGjsModule(
        new URL('extension/monitorManager.js', GjsHarness.sourceDirectory),
        {
            'gi://GObject': {
                default: {
                    signal_handler_find: () => shellHandlerId,
                    signal_handler_block: (_display, id) => blocked.add(id),
                    signal_handler_unblock: (_display, id) => blocked.delete(id),
                    signal_handler_is_connected: (_display, id) => display.signals.has(id),
                },
            },
            'gi://Shell': {default: {ActionMode}},
            '@girs/gnome-shell/ui/main': main,
            [new URL('extension/components/bottomPanel.js', GjsHarness.sourceDirectory).href]: {BottomPanel},
            [new URL('extension/themeManager.js', GjsHarness.sourceDirectory).href]: {ThemeManager},
        },
        {global: {display, get_pointer: () => pointer}},
    );
    const manager = new MonitorManager({});
    return {
        manager,
        get panels() {
            return manager._panels;
        },
        calls,
        display,
        nativeOverlay,
        main,
        ActionMode,
        blocked,
        shellHandlerId,
        press: () => display.emit('overlay-key'),
        movePointer: (x, y) => {
            pointer = [x, y, 0];
        },
        replaceMonitors: (monitors) => {
            layoutManager.monitors = monitors;
            layoutManager.emit('monitors-changed');
        },
    };
}

describe('Monitor manager Super handling', () => {
    it('replaces the native overview action and opens only the grid under the pointer', async () => {
        const f = await fixture();
        f.movePointer(-1200, 100);
        f.press();
        expect(f.nativeOverlay).not.toHaveBeenCalled();
        expect(f.panels[0]._appGrid.isOpen).toBeFalse();
        expect(f.panels[1]._appGrid.isOpen).toBeTrue();
        expect(f.panels[1]._dashSection.closeExpanded).toHaveBeenCalledTimes(1);
        expect(f.main.overview.hide).not.toHaveBeenCalled();
        f.manager.destroy();
    });

    it('closes on a second press and closes the old monitor grid before opening on a new monitor', async () => {
        const f = await fixture();
        f.press();
        f.press();
        expect(f.panels[0]._appGrid.isOpen).toBeFalse();
        f.press();
        f.movePointer(-400, 100);
        f.calls.length = 0;
        f.press();
        expect(f.calls).toEqual([
            ['close', 0, 0],
            ['open', -1600, -200],
        ]);
        expect(f.panels[0]._appGrid.isOpen).toBeFalse();
        expect(f.panels[1]._appGrid.isOpen).toBeTrue();
        f.manager.destroy();
    });

    it('handles Super while the grid owns the popup grab', async () => {
        const f = await fixture({actionMode: 4});
        f.panels[0]._appGrid.isOpen = true;
        f.movePointer(-400, 100);
        f.press();
        expect(f.panels[0]._appGrid.isOpen).toBeFalse();
        expect(f.panels[1]._appGrid.isOpen).toBeTrue();
        f.press();
        expect(f.panels[1]._appGrid.isOpen).toBeFalse();
        f.manager.destroy();
    });

    it('uses rebuilt panels and monitor boundaries rather than retaining the old target', async () => {
        const f = await fixture();
        const oldPanels = [...f.panels];
        f.replaceMonitors([{index: 0, x: 0, y: -1080, width: 1920, height: 1080}]);
        const replacement = f.panels[0];
        f.movePointer(500, -1);
        f.press();
        expect(replacement._appGrid.isOpen).toBeTrue();
        expect(oldPanels.every((panel) => panel.destroyed)).toBeTrue();
        f.manager.destroy();
    });

    it('leaves locked sessions, unrelated popups and pointer gaps alone', async () => {
        const f = await fixture();
        f.main.sessionMode.hasOverview = false;
        f.press();
        f.main.sessionMode.hasOverview = true;
        f.movePointer(-100, 1000);
        f.press();
        expect(f.calls).toEqual([]);
        f.manager.destroy();
        for (const actionMode of [f.ActionMode.LOCK_SCREEN, f.ActionMode.POPUP]) {
            const other = await fixture({actionMode});
            other.press();
            expect(other.calls).toEqual([]);
            other.manager.destroy();
        }
    });

    it('hides a native overview before opening the local grid', async () => {
        const f = await fixture({actionMode: 2});
        f.main.overview.visible = true;
        f.press();
        expect(f.main.overview.hide).toHaveBeenCalledTimes(1);
        expect(f.panels[0]._appGrid.isOpen).toBeTrue();
        f.manager.destroy();
    });

    it('restores the original handler and destroys the monitor grids on disable', async () => {
        const f = await fixture();
        expect(f.blocked.has(f.shellHandlerId)).toBeTrue();
        const panels = [...f.panels];
        f.manager.destroy();
        expect(panels.every((panel) => panel.destroyed)).toBeTrue();
        f.press();
        expect(f.nativeOverlay).toHaveBeenCalledTimes(1);
        expect(f.calls).toEqual([]);
        expect(f.display.signals.size).toBe(1);
        expect(f.blocked.size).toBe(0);
    });

    it('cleans up without an original handler or when it has already been disconnected', async () => {
        const first = await fixture({nativeHandler: false});
        first.manager.destroy();
        expect(first.display.signals.size).toBe(0);
        const second = await fixture();
        second.display.disconnect(second.shellHandlerId);
        expect(() => second.manager.destroy()).not.toThrow();
        expect(second.display.signals.size).toBe(0);
    });
});

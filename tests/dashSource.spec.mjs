import * as GjsHarness from '#tests/gjsHarness.mjs';
import {SignalObject} from '#tests/gjsHarness.mjs';

async function fixture() {
    const sources = new Map();
    let nextSource = 1;
    const GLib = {PRIORITY_DEFAULT_IDLE: 0, SOURCE_REMOVE: false,
        idle_add(_priority, callback) {
            const id = nextSource++;
            sources.set(id, callback);
            return id;
        },
        source_remove: id => sources.delete(id)};
    const flush = () => {
        while (sources.size) {
            const [id, callback] = sources.entries().next().value;
            sources.delete(id);
            callback();
        }
    };
    const apps = new Map();
    const makeApp = id => {
        const app = new SignalObject();
        Object.assign(app, {id, windows: [], get_id: () => id,
            get_name: () => id, get_state: () => app.windows.length ? 1 : 0,
            get_app_info: () => ({get_icon: () => id}), get_windows: () => app.windows,
            is_window_backed: () => false});
        apps.set(id, app);
        return app;
    };
    const firefox = makeApp('firefox-esr.desktop');
    const files = makeApp('org.gnome.Nautilus.desktop');
    const terminal = makeApp('terminal.desktop');
    const appSystem = new SignalObject();
    Object.assign(appSystem, {lookup_app: id => apps.get(id) ?? null,
        get_running: () => [...apps.values()].filter(app => app.windows.length)});
    const favorites = new SignalObject();
    Object.assign(favorites, {apps: [terminal, firefox],
        getFavorites: () => favorites.apps,
        addFavorite(id) {
            favorites.apps.push(apps.get(id));
            favorites.emit('changed');
        },
        removeFavorite(id) {
            favorites.apps = favorites.apps.filter(app => app.id !== id);
            favorites.emit('changed');
        }});
    const settings = new SignalObject();
    const values = {'per-window-mode': false, 'monitor-only': false};
    Object.assign(settings, {get_boolean: key => values[key],
        set_boolean(key, value) {
            values[key] = value;
            settings.emit(`changed::${key}`);
        }});
    const display = new SignalObject();
    const tracker = new SignalObject();
    const imports = {
        'gi://GLib': {default: GLib},
        'gi://Shell': {default: {AppSystem: {get_default: () => appSystem},
            WindowTracker: {get_default: () => tracker}}},
        'resource:///org/gnome/shell/ui/appFavorites.js': {getAppFavorites: () => favorites},
    };
    const {DashSource} = await GjsHarness.loadGjsModule(new URL('../src/components/dash/dashSource.js', import.meta.url),
        imports, {global: {display, settings: {is_writable: () => true}}});
    const source = new DashSource(settings);
    const makeWindow = (app, stableId, monitor = 0) => {
        const window = new SignalObject();
        Object.assign(window, {title: `${app.id}:${stableId}`, monitor, skip_taskbar: false,
            get_stable_sequence: () => stableId, get_title: () => window.title,
            get_monitor: () => window.monitor});
        app.windows.push(window);
        app.emit('windows-changed');
        appSystem.emit('app-state-changed', app);
        return window;
    };
    return {source, apps, firefox, files, terminal, makeApp, makeWindow, favorites,
        settings, display, tracker, sources, flush, appSystem};
}

describe('Dash source lifecycle', () => {
    it('source initializes from real favorites, fixes hardcoded order, and reuses models', async () => {
        const f = await fixture();
        expect(Array.from(f.source.snapshot.favorites, item => item.appId)).toEqual(['firefox-esr.desktop', 'org.gnome.Nautilus.desktop', 'terminal.desktop']);
        const original = f.source.snapshot.favorites[0];
        f.appSystem.emit('installed-changed'); f.flush();
        expect(f.source.snapshot.favorites[0]).toBe(original);
        f.source.destroy();
    });

    it('window creation, title updates, monitor moves, and skip-taskbar updates are observed', async () => {
        const f = await fixture();
        const win = f.makeWindow(f.firefox, 5); f.flush();
        const item = f.source.snapshot.windows[0];
        win.title = 'New title'; win.emit('notify::title'); f.flush();
        expect(f.source.snapshot.windows[0]).toBe(item);
        expect(item.title).toBe('New title');
        win.monitor = 1; f.display.emit('window-entered-monitor', 1, win); f.flush();
        f.settings.set_boolean('monitor-only', true); f.flush();
        expect(f.source.project(0).favorites[0].indicatorCount).toBe(0);
        expect(f.source.project(1).favorites[0].indicatorCount).toBe(1);
        win.skip_taskbar = true; win.emit('notify::skip-taskbar'); f.flush();
        expect(f.source.snapshot.windows.length).toBe(0);
        win.skip_taskbar = false; win.emit('notify::skip-taskbar'); f.flush();
        expect(f.source.snapshot.windows.length).toBe(1);
        f.source.destroy();
    });

    it('oldest stable ID represents favorite, independent of Shell MRU ordering', async () => {
        const f = await fixture();
        f.makeWindow(f.firefox, 20); f.makeWindow(f.firefox, 10); f.flush();
        f.settings.set_boolean('per-window-mode', true); f.flush();
        const projection = f.source.project(0);
        expect(projection.favorites[0].representedWindow.id).toBe('window:10');
        expect(projection.running[0].item.id).toBe('window:20');
        f.source.destroy();
    });

    it('system favorites change globally while drag order remains projection-local', async () => {
        const f = await fixture();
        const editor = f.makeApp('editor.desktop'); f.makeWindow(editor, 1); f.flush();
        const editorItem = f.source.snapshot.running[0];
        f.source.setFavorite(editorItem, true); f.flush();
        expect(f.source.project(1).favorites.some(entry => entry.item === editorItem)).toBeTruthy();
        const local = f.source.project(0, {favoriteOrder: ['editor.desktop', 'terminal.desktop']});
        expect(local.favorites[2].item.appId).toBe('editor.desktop');
        expect(f.source.project(1).favorites[2].item.appId).toBe('terminal.desktop');
        f.source.setFavorite(f.source.snapshot.favorites[0], false); f.flush();
        expect(f.source.snapshot.favorites[0].appId).toBe('firefox-esr.desktop');
        f.source.destroy();
    });

    it('drag pause defers updates; removal and shutdown disconnect all signals and pending jobs', async () => {
        const f = await fixture();
        let updates = 0;
        const unsubscribe = f.source.subscribe(() => updates++);
        f.source.pause();
        const window = f.makeWindow(f.terminal, 1); f.flush();
        expect(updates).toBe(0);
        f.source.resume(); f.flush();
        expect(updates).toBe(1);
        f.terminal.windows = []; window.emit('unmanaged'); f.flush();
        expect(window.signals.size).toBe(0);
        unsubscribe();
        f.appSystem.emit('installed-changed');
        expect(f.sources.size).toBe(1);
        f.source.destroy();
        expect(f.sources.size).toBe(0);
        for (const object of [f.firefox, f.files, f.terminal, f.appSystem, f.favorites,
            f.settings, f.display, f.tracker])
            expect(object.signals.size).toBe(0);
    });
});

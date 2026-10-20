import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';
import * as Constants from '@/extension/constants.js';

async function fixture() {
    const sources = new Map();
    const timeouts = new Map();
    let nextSource = 1;
    const GLib = {PRIORITY_DEFAULT_IDLE: 0, PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
        idle_add(_priority, callback) {
            const id = nextSource++;
            sources.set(id, callback);
            return id;
        },
        timeout_add(_priority, _delay, callback) {
            const id = nextSource++;
            timeouts.set(id, callback);
            return id;
        },
        source_remove(id) { sources.delete(id); timeouts.delete(id); }};
    const flush = () => {
        while (sources.size) {
            const [id, callback] = sources.entries().next().value;
            sources.delete(id);
            callback();
        }
    };
    const expire = () => {
        for (const [id, callback] of timeouts) {
            timeouts.delete(id);
            callback();
        }
    };
    const apps = new Map();
    const makeApp = id => {
        const app = new SignalObject();
        Object.assign(app, {id, windows: [], launches: [], get_id: () => id,
            get_name: () => id, get_state: () => app.windows.length ? 1 : 0,
            get_app_info: () => ({get_icon: () => id}), get_windows: () => app.windows,
            is_window_backed: () => false,
            open_new_window: workspace => app.launches.push(['window', workspace]),
            launch_action: (action, time, workspace) => app.launches.push([action, time, workspace])});
        apps.set(id, app);
        return app;
    };
    const mail = makeApp(Constants.APP_IDS.MAIL);
    const files = makeApp('org.gnome.Nautilus.desktop');
    const terminal = makeApp('terminal.desktop');
    const appSystem = new SignalObject();
    Object.assign(appSystem, {lookup_app: id => apps.get(id) ?? null,
        get_running: () => [...apps.values()].filter(app => app.windows.length)});
    const favorites = new SignalObject();
    Object.assign(favorites, {apps: [terminal, mail],
        getFavorites: () => favorites.apps,
        addFavorite(id) {
            favorites.apps.push(apps.get(id));
            shellSettings.ids.push(id);
            favorites.emit('changed');
        },
        removeFavorite(id) {
            favorites.apps = favorites.apps.filter(app => app.id !== id);
            shellSettings.ids = shellSettings.ids.filter(value => value !== id);
            favorites.emit('changed');
        }});
    const settings = new SignalObject();
    const values = {'group-open-windows': 0, 'isolate-tasks': false};
    Object.assign(settings, {get_int: key => values[key], get_boolean: key => values[key],
        set_boolean(key, value) {
            values[key] = value;
            settings.emit(`changed::${key}`);
        }});
    const display = new SignalObject();
    display.get_n_monitors = () => 2;
    const tracker = new SignalObject();
    const imports = {
        'gi://GLib': {default: GLib},
        'gi://GObject': {default: GjsHarness.createGObjectDouble()},
        'gi://Shell': {default: {AppSystem: {get_default: () => appSystem},
            WindowTracker: {get_default: () => tracker}}},
        'resource:///org/gnome/shell/ui/main.js': {activateWindow() {}},
        'resource:///org/gnome/shell/ui/appFavorites.js': {getAppFavorites: () => favorites},
    };
    const shellSettings = {ids: favorites.apps.map(app => app.id), writable: true, is_writable: () => shellSettings.writable,
        get_strv: () => [...shellSettings.ids],
        set_strv(_key, ids) {
            if (!this.writable) return false;
            this.ids = [...ids];
            favorites.apps = ids.map(id => apps.get(id)).filter(Boolean);
            favorites.emit('changed');
            return true;
        }};
    const {DashSource} = await GjsHarness.loadGjsModule(new URL('extension/components/dash/dashSource.js', GjsHarness.sourceDirectory),
        imports, {global: {display, settings: shellSettings, get_current_time: () => 123}});
    const source = new DashSource(settings);
    const makeActions = monitor => ({
        openNewWindow: (app, target = monitor) => source.openNewWindow(app, target),
        launchAction: (app, action) => source.launchAction(app, action, monitor),
        destroy() {},
    });
    const actions = makeActions(0);
    const destroy = () => source.destroy();
    const makeWindow = (app, stableId, monitor = 0) => {
        const window = new SignalObject();
        const actor = new SignalObject();
        Object.assign(window, {title: `${app.id}:${stableId}`, monitor, skip_taskbar: false,
            actor, moves: [], get_stable_sequence: () => stableId, get_title: () => window.title,
            get_monitor: () => window.monitor, get_compositor_private: () => actor,
            move_to_monitor: index => {
                window.moves.push(index);
                window.monitor = index;
                display.emit('window-entered-monitor', index, window);
            }});
        app.windows.push(window);
        app.emit('windows-changed');
        appSystem.emit('app-state-changed', app);
        return window;
    };
    return {source, actions, destroy, makeActions, apps, mail, files, terminal, makeApp, makeWindow, favorites,
        settings, shellSettings, display, tracker, sources, timeouts, flush, expire, appSystem,
        reload: () => new DashSource(settings)};
}

describe('Dash source queries and lifecycle', () => {
    it('persists favorite reordering and pin placement through source recreation', async () => {
        const f = await fixture();
        const editor = f.makeApp('editor.desktop');
        f.shellSettings.ids.push('unavailable.desktop');
        expect(f.source.reorderFavorites(editor, [f.files.id, f.mail.id, editor.id, f.terminal.id])).toBe(true);
        f.flush();
        expect(f.shellSettings.get_strv('favorite-apps')).toEqual([
            f.mail.id, editor.id, f.terminal.id, 'unavailable.desktop']);
        const restored = f.reload();
        expect(restored.getFavorites().map(app => app.id)).toEqual([
            f.files.id, f.mail.id, editor.id, f.terminal.id]);
        f.shellSettings.writable = false;
        expect(restored.reorderFavorites(editor, [f.terminal.id, editor.id])).toBe(false);
        expect(f.shellSettings.get_strv('favorite-apps')[1]).toBe(editor.id);
        restored.destroy(); f.destroy();
    });

    it('returns native favorites with fixed ordering and protects its collection state', async () => {
        const f = await fixture();
        expect(f.source.getFavorites()).toEqual([f.files, f.mail, f.terminal]);
        f.source.getFavorites().splice(0);
        f.appSystem.emit('installed-changed'); f.flush();
        expect(f.source.getFavorites()[0]).toBe(f.files);
        expect(f.source.getFavorites().length).toBe(3);
        f.destroy();
    });

    it('queries eligible native windows by app and monitor across all workspaces', async () => {
        const f = await fixture();
        const first = f.makeWindow(f.mail, 20, 1);
        const second = f.makeWindow(f.mail, 10, 0);
        f.makeWindow(f.terminal, 30, 1); f.flush();
        expect(f.source.getOpenedWindows().slice(0, 2)).toEqual([second, first]);
        expect(f.source.getOpenMonitorWindows(0)).toEqual([second]);
        expect(f.source.getAppWindows(f.mail, 1)).toEqual([first]);
        expect(f.source.getWindowApp(first)).toBe(f.mail);
        f.source.getOpenedWindows().splice(0);
        expect(f.source.getOpenedWindows().length).toBe(3);
        first.title = 'New title'; first.emit('notify::title'); f.flush();
        expect(f.source.getOpenedWindows()[1].get_title()).toBe('New title');
        first.monitor = 0; f.display.emit('window-entered-monitor', 0, first); f.flush();
        expect(f.source.getOpenMonitorWindows(0)).toEqual([second, first]);
        first.skip_taskbar = true; first.emit('notify::skip-taskbar'); f.flush();
        expect(f.source.getAppWindows(f.mail)).toEqual([second]);
        first.skip_taskbar = false; first.emit('notify::skip-taskbar'); f.flush();
        expect(f.source.getAppWindows(f.mail)).toEqual([second, first]);
        f.destroy();
    });

    it('keeps app order independent of Shell MRU and observes both mode settings', async () => {
        const f = await fixture();
        f.makeWindow(f.mail, 20); f.makeWindow(f.terminal, 10); f.flush();
        expect(f.source.getRunningApps()).toEqual([f.terminal, f.mail]);
        f.settings.set_boolean('group-open-windows', 1);
        f.settings.set_boolean('isolate-tasks', true); f.flush();
        expect(f.source.perWindow).toBe(true);
        expect(f.source.monitorOnly).toBe(true);
        expect(f.source.getFavorites()).toEqual([f.files, f.mail, f.terminal]);
        f.destroy();
    });

    it('builds isolated entries from refreshed state with favorite ordering shared between monitors', async () => {
        const f = await fixture();
        const editor = f.makeApp('editor.desktop');
        const remote = f.makeWindow(f.mail, 10, 1);
        f.makeWindow(f.terminal, 20, 0);
        f.makeWindow(editor, 30, 0);
        f.settings.set_boolean('isolate-tasks', true); f.flush();
        const local = f.source.getEntries({monitor: 0});
        expect(local.favorites[1].indicatorCount).toBe(0);
        expect(f.source.getEntries({monitor: 1}).favorites[1].indicatorCount).toBe(1);
        expect(local.running.map(entry => entry.item.app)).toEqual([editor]);
        remote.monitor = 0;
        f.display.emit('window-entered-monitor', 0, remote);
        f.settings.set_boolean('group-open-windows', 1); f.flush();
        expect(f.source.getEntries({monitor: 0}).favorites[1].representedWindow).toBe(remote);
        expect(f.source.getEntries({monitor: 1}).favorites[1].representedWindow).toBe(null);
        f.source.setFavorite(editor, true); f.flush();
        f.source.reorderFavorites(editor, [f.files.id, f.mail.id, editor.id, f.terminal.id]); f.flush();
        const ordered = f.source.getEntries({monitor: 0});
        expect(ordered.favorites.map(entry => entry.item.app)).toEqual([
            f.files, f.mail, editor, f.terminal]);
        expect(f.source.getEntries({monitor: 1}).favorites.map(entry => entry.item.app)).toEqual([
            f.files, f.mail, editor, f.terminal]);
        f.destroy();
    });

    it('changes real favorite membership and rejects fixed, window-backed, or locked apps', async () => {
        const f = await fixture();
        const editor = f.makeApp('editor.desktop'); f.makeWindow(editor, 1); f.flush();
        f.source.setFavorite(editor, true); f.flush();
        expect(f.source.isFavorite(editor.id)).toBe(true);
        f.source.setFavorite(editor, false); f.flush();
        expect(f.source.isFavorite(editor.id)).toBe(false);
        f.source.setFavorite(f.mail, false); f.flush();
        expect(f.source.isFixedFavorite(f.mail.id)).toBe(true);
        expect(f.source.getFavorites()[0]).toBe(f.files);
        editor.is_window_backed = () => true;
        expect(f.source.canSetFavorite(editor)).toBe(false);
        f.source.setFavorite(editor, true); f.flush();
        expect(f.source.isFavorite(editor.id)).toBe(false);
        f.shellSettings.writable = false;
        expect(f.source.canSetFavorite(f.terminal)).toBe(false);
        f.destroy();
    });

    it('coalesces updates without a global pause and disconnects pending work on shutdown', async () => {
        const f = await fixture();
        let updates = 0;
        const listener = new SignalObject();
        f.source.connectObject('changed', () => updates++, listener);
        const window = f.makeWindow(f.terminal, 1); f.flush();
        expect(updates).toBe(1);
        expect(f.source.pause).toBeUndefined();
        expect(f.source.resume).toBeUndefined();
        f.terminal.windows = []; window.emit('unmanaged'); f.flush();
        expect(window.signals.size).toBe(0);
        listener.emit('destroy');
        f.appSystem.emit('installed-changed'); f.flush();
        expect(updates).toBe(2);
        expect(f.source.signals.size).toBe(0);
        f.appSystem.emit('installed-changed');
        expect(f.sources.size).toBe(1);
        f.destroy();
        expect(f.sources.size).toBe(0);
        for (const object of [f.files, f.mail, f.terminal, f.appSystem, f.favorites,
            f.settings, f.display, f.tracker])
            expect(object.signals.size).toBe(0);
    });

    it('places a new isolated window on the requesting monitor without moving remote windows', async () => {
        const f = await fixture();
        const remote = f.makeWindow(f.mail, 1, 1); f.flush();
        f.settings.set_boolean('isolate-tasks', true); f.flush();
        f.actions.openNewWindow(f.mail, 0);
        expect(f.mail.launches).toEqual([['window', -1]]);
        const unrelated = f.makeWindow(f.terminal, 2, 1);
        const local = f.makeWindow(f.mail, 3, 1); f.flush();
        expect(remote.moves).toEqual([]);
        expect(unrelated.moves).toEqual([]);
        expect(local.moves).toEqual([0]);
        // Initial mapping may reset placement; first frame restores the target.
        local.monitor = 1; local.actor.emit('first-frame'); f.flush();
        expect(local.moves).toEqual([0, 0]);
        expect(f.source.getAppWindows(f.mail, 0)).toEqual([local]);
        expect(f.timeouts.size).toBe(0);
        expect(local.actor.signals.size).toBe(0);
        f.destroy();
    });

    it('launches actions in the same scope and supports simultaneous requests on different monitors', async () => {
        const f = await fixture();
        f.settings.set_boolean('isolate-tasks', true); f.flush();
        const other = f.makeActions(1);
        f.actions.launchAction(f.mail, 'new-window');
        other.openNewWindow(f.mail);
        const one = f.makeWindow(f.mail, 1, 1);
        const two = f.makeWindow(f.mail, 2, 0); f.flush();
        expect(f.mail.launches).toEqual([['new-window', 123, -1], ['window', -1]]);
        expect(one.moves).toEqual([0]);
        expect(two.moves).toEqual([1]);
        other.destroy();
        f.destroy();
        expect(f.timeouts.size).toBe(0);
        expect(one.actor.signals.size).toBe(0);
        expect(two.actor.signals.size).toBe(0);
    });

    it('unisolated launches leave native placement alone and expired launches cannot move later windows', async () => {
        const f = await fixture();
        f.actions.openNewWindow(f.mail, 0);
        expect(f.timeouts.size).toBe(0);
        const remote = f.makeWindow(f.mail, 1, 1); f.flush();
        expect(remote.moves).toEqual([]);
        f.settings.set_boolean('isolate-tasks', true); f.flush();
        f.actions.openNewWindow(f.mail, 0); f.expire();
        const later = f.makeWindow(f.mail, 2, 1); f.flush();
        expect(later.moves).toEqual([]);
        f.destroy();
    });

    it('cleans up failed launches and never moves a window to a removed monitor', async () => {
        const f = await fixture();
        f.settings.set_boolean('isolate-tasks', true); f.flush();
        f.mail.open_new_window = () => { throw new Error('Launch failed'); };
        expect(() => f.actions.openNewWindow(f.mail, 0)).toThrowError('Launch failed');
        expect(f.timeouts.size).toBe(0);
        f.actions.openNewWindow(f.terminal, 1);
        f.display.get_n_monitors = () => 1;
        const window = f.makeWindow(f.terminal, 1, 0); f.flush();
        expect(window.moves).toEqual([]);
        f.terminal.windows = []; window.emit('unmanaged'); f.flush();
        expect(f.timeouts.size).toBe(0);
        expect(window.actor.signals.size).toBe(0);
        expect(window.signals.size).toBe(0);
        f.destroy();
    });
});

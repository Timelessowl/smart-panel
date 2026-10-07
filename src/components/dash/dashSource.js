import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as AppFavorites from '@girs/gnome-shell/ui/appFavorites';

import {DashLauncher} from '@/components/dash/dashLauncher.js';

const FIXED_APP_IDS = [
    ['firefox.desktop', 'firefox-esr.desktop', 'org.mozilla.firefox.desktop'],
    ['org.gnome.Nautilus.desktop'],
];

// Shared Shell state. Queries return native apps/windows; actors and drag order
// belong to each DashSection and never suspend this source's observations.
export class DashSource {
    constructor(settings) {
        this._settings = settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._tracker = Shell.WindowTracker.get_default();
        this._launcher = new DashLauncher();
        this._apps = new Map();
        this._windows = new Map();
        this._connections = [];
        this._listeners = new Set();
        this._refreshId = 0;
        this._connect(this._appSystem, 'installed-changed');
        this._connect(this._appSystem, 'app-state-changed');
        this._connect(this._favorites, 'changed');
        this._connect(this._tracker, 'tracked-windows-changed');
        this._connect(global.display, 'window-created');
        this._connect(global.display, 'window-entered-monitor');
        this._connect(global.display, 'window-left-monitor');
        this._connect(settings, 'changed::per-window-mode');
        this._connect(settings, 'changed::monitor-only');
        this._refresh();
    }

    _connect(object, signal, connections = this._connections) {
        connections.push([object, object.connect(signal, () => this._queueRefresh())]);
    }

    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    get perWindow() { return this._state.perWindow; }
    get monitorOnly() { return this._state.monitorOnly; }

    getFavorites() { return [...this._state.favorites]; }
    getRunningApps() { return [...this._state.running]; }
    getOpenedWindows() { return [...this._state.windows]; }

    getOpenMonitorWindows(monitor) {
        return this._state.windows.filter(window => window.get_monitor() === monitor);
    }

    getWindowApp(window) { return this._windows.get(window)?.app ?? null; }

    getAppWindows(app, monitor = null) {
        return this._state.windows.filter(window => this.getWindowApp(window) === app &&
            (monitor === null || window.get_monitor() === monitor));
    }

    isFavorite(appId) {
        return this._state.favorites.some(app => app.get_id() === appId);
    }

    isFixedFavorite(appId) { return this._state.fixedIds.has(appId); }

    canSetFavorite(app) {
        return !this.isFixedFavorite(app.get_id()) && !app.is_window_backed() &&
            global.settings.is_writable('favorite-apps');
    }

    setFavorite(app, favorite) {
        if (!this.canSetFavorite(app))
            return;
        if (favorite)
            this._favorites.addFavorite(app.get_id());
        else
            this._favorites.removeFavorite(app.get_id());
    }

    openNewWindow(app, monitor) {
        this._launcher.openNewWindow(app, this.monitorOnly ? monitor : null);
    }

    launchAction(app, action, monitor) {
        this._launcher.launchAction(app, action, this.monitorOnly ? monitor : null);
    }

    _queueRefresh() {
        if (this._refreshId)
            return;
        this._refreshId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._refreshId = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _refresh() {
        const fixedApps = FIXED_APP_IDS.map(ids => ids
            .map(id => this._appSystem.lookup_app(id)).find(Boolean)).filter(Boolean);
        const fixedIds = new Set(fixedApps.map(app => app.get_id()));
        const favorites = [...fixedApps, ...this._favorites.getFavorites()
            .filter(app => !fixedIds.has(app.get_id()))];
        const running = [...this._appSystem.get_running()];
        const activeApps = new Set([...favorites, ...running]);
        const activeWindows = new Set();
        const windows = [];
        for (const app of activeApps) {
            if (!this._apps.has(app)) {
                const connections = [];
                this._connect(app, 'windows-changed', connections);
                this._connect(app, 'notify::state', connections);
                this._apps.set(app, connections);
            }
            for (const window of app.get_windows()) {
                activeWindows.add(window);
                let record = this._windows.get(window);
                if (!record) {
                    record = {app, connections: []};
                    this._connect(window, 'notify::title', record.connections);
                    this._connect(window, 'notify::skip-taskbar', record.connections);
                    this._connect(window, 'unmanaged', record.connections);
                    this._windows.set(window, record);
                }
                record.app = app;
                if (!window.skip_taskbar) {
                    this._launcher.observeWindow(window, app);
                    windows.push(window);
                }
            }
        }
        windows.sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
        const firstWindowIds = new Map();
        for (const window of windows) {
            const app = this.getWindowApp(window);
            if (!firstWindowIds.has(app))
                firstWindowIds.set(app, window.get_stable_sequence());
        }
        // Shell's running order changes with focus; keep icons in creation order.
        running.sort((a, b) =>
            (firstWindowIds.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (firstWindowIds.get(b) ?? Number.MAX_SAFE_INTEGER) ||
            a.get_id().localeCompare(b.get_id()));
        for (const [window, record] of this._windows) {
            if (!activeWindows.has(window)) {
                this._disconnect(record.connections);
                this._windows.delete(window);
            }
        }
        for (const [app, connections] of this._apps) {
            if (!activeApps.has(app)) {
                this._disconnect(connections);
                this._apps.delete(app);
            }
        }
        this._state = {favorites, running, windows, fixedIds,
            perWindow: this._settings.get_boolean('per-window-mode'),
            monitorOnly: this._settings.get_boolean('monitor-only')};
        for (const listener of this._listeners)
            listener();
    }

    _disconnect(connections) {
        for (const [object, id] of connections)
            object.disconnect(id);
    }

    destroy() {
        if (this._refreshId)
            GLib.source_remove(this._refreshId);
        this._refreshId = 0;
        this._listeners.clear();
        this._launcher.destroy();
        this._disconnect(this._connections);
        for (const connections of this._apps.values())
            this._disconnect(connections);
        for (const record of this._windows.values())
            this._disconnect(record.connections);
        this._apps.clear();
        this._windows.clear();
        this._connections = [];
    }
}

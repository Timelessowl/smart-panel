import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as AppFavorites from '@girs/gnome-shell/ui/appFavorites';

import {AppItem} from '@/components/dash/appItem.js';
import {WindowItem} from '@/components/dash/windowItem.js';
import * as DashProjection from '@/components/dash/dashProjection.js';

const FIXED_APP_IDS = [
    ['firefox.desktop', 'firefox-esr.desktop', 'org.mozilla.firefox.desktop'],
    ['org.gnome.Nautilus.desktop'],
];

// One source observes Shell; individual panels only project it for their monitor.
export class DashSource {
    constructor(settings) {
        this._settings = settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._tracker = Shell.WindowTracker.get_default();
        this._apps = new Map();
        this._windows = new Map();
        this._connections = [];
        this._listeners = new Set();
        this._refreshId = 0;
        this._pauseCount = 0;
        this._dirty = false;
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

    _connect(object, signal) {
        this._connections.push([object, object.connect(signal, () => this._queueRefresh())]);
    }

    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    pause() {
        this._pauseCount++;
    }

    resume() {
        this._pauseCount = Math.max(0, this._pauseCount - 1);
        if (!this._pauseCount && this._dirty)
            this._queueRefresh();
    }

    _queueRefresh() {
        this._dirty = true;
        if (this._refreshId || this._pauseCount)
            return;
        this._refreshId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._refreshId = 0;
            if (!this._pauseCount)
                this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _appItem(app) {
        let record = this._apps.get(app.get_id());
        if (record?.item.app !== app) {
            if (record)
                this._disconnect(record.connections);
            const item = new AppItem(app);
            record = {item, connections: [
                [app, app.connect('windows-changed', () => this._queueRefresh())],
                [app, app.connect('notify::state', () => this._queueRefresh())],
            ]};
            this._apps.set(item.appId, record);
        }
        record.item.refresh();
        return record.item;
    }

    _refresh() {
        this._dirty = false;
        const fixedApps = FIXED_APP_IDS.map(ids => ids
            .map(id => this._appSystem.lookup_app(id)).find(Boolean)).filter(Boolean);
        const hardcodedIds = new Set(fixedApps.map(app => app.get_id()));
        const favorites = [...fixedApps, ...this._favorites.getFavorites()
            .filter(app => !hardcodedIds.has(app.get_id()))].map(app => this._appItem(app));
        const running = this._appSystem.get_running().map(app => this._appItem(app));
        const activeIds = new Set([...favorites, ...running].map(item => item.appId));
        const activeWindows = new Set();
        const windows = [];
        for (const appItem of new Set([...favorites, ...running])) {
            for (const window of appItem.windows) {
                activeWindows.add(window);
                let record = this._windows.get(window);
                if (record && record.item.appItem !== appItem) {
                    this._disconnect(record.connections);
                    this._windows.delete(window);
                    record = null;
                }
                if (!record) {
                    record = {item: new WindowItem(window, appItem), connections: [
                        [window, window.connect('notify::title', () => this._queueRefresh())],
                        [window, window.connect('notify::skip-taskbar', () => this._queueRefresh())],
                        [window, window.connect('unmanaged', () => this._queueRefresh())],
                    ]};
                    this._windows.set(window, record);
                }
                record.item.refresh();
                if (!record.item.skipTaskbar)
                    windows.push(record.item);
            }
        }
        windows.sort((a, b) => a.stableId - b.stableId);
        const firstWindowIds = new Map();
        for (const item of windows) {
            if (!firstWindowIds.has(item.appId))
                firstWindowIds.set(item.appId, item.stableId);
        }
        // Shell's running order changes with focus; do not let icons jump around.
        running.sort((a, b) =>
            (firstWindowIds.get(a.appId) ?? Number.MAX_SAFE_INTEGER) -
            (firstWindowIds.get(b.appId) ?? Number.MAX_SAFE_INTEGER) ||
            a.appId.localeCompare(b.appId));
        for (const [window, record] of this._windows) {
            if (!activeWindows.has(window)) {
                this._disconnect(record.connections);
                this._windows.delete(window);
            }
        }
        for (const [id, record] of this._apps) {
            if (!activeIds.has(id)) {
                this._disconnect(record.connections);
                this._apps.delete(id);
            }
        }
        this.perWindow = this._settings.get_boolean('per-window-mode');
        this.snapshot = {favorites, running, windows, hardcodedIds,
            perWindow: this.perWindow,
            monitorOnly: this._settings.get_boolean('monitor-only')};
        for (const listener of this._listeners)
            listener();
    }

    project(monitorIndex, orders = {}) {
        return DashProjection.projectDash({...this.snapshot, monitorIndex, ...orders});
    }

    setFavorite(item, favorite) {
        if (this.snapshot.hardcodedIds.has(item.appId) || item.app.is_window_backed() ||
            !global.settings.is_writable('favorite-apps'))
            return;
        if (favorite)
            this._favorites.addFavorite(item.appId);
        else
            this._favorites.removeFavorite(item.appId);
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
        this._disconnect(this._connections);
        for (const record of [...this._apps.values(), ...this._windows.values()])
            this._disconnect(record.connections);
        this._apps.clear();
        this._windows.clear();
        this._connections = [];
    }
}

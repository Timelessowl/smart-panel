import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import * as AppFavorites from '@girs/gnome-shell/ui/appFavorites';
import Logger from '@/utils/logger';
import * as Constants from '@/extension/constants.js';

const ALWAYS_PINNED_APPS = [Constants.APP_IDS.FILE_MANAGER, Constants.APP_IDS.MAIL];

export class DashSource extends GObject.Object {
    static {
        GObject.registerClass({Signals: {changed: {}}}, this);
    }

    constructor(settings) {
        super();
        this.settings = settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._launchRequests = new Set();
        this._apps = new Map();
        this._windows = new Map();
        this._connections = [];
        this._refreshId = 0;
        this._connect(this._appSystem, 'app-state-changed');
        this._connect(this._appSystem, 'installed-changed');
        this._connect(this._favorites, 'changed');
        this._connect(global.display, 'window-entered-monitor');
        this._connect(global.display, 'window-left-monitor');
        this._connect(settings, `changed::${Constants.SettingsKeys.WINDOW_GROUPING}`);
        this._connect(settings, `changed::${Constants.SettingsKeys.ISOLATE_TASKS}`);
        this._refresh();
    }

    _connect(object, signal, connections = this._connections) {
        connections.push([object, object.connect(signal, () => this._queueRefresh(signal))]);
    }

    getFavorites() {
        return [...this._state.favorites];
    }
    getRunningApps() {
        return [...this._state.running];
    }
    getOpenedWindows() {
        return [...this._state.windows];
    }
    getOpenMonitorWindows(monitor) {
        return this._state.windows.filter((window) => window.get_monitor() === monitor);
    }
    getWindowApp(window) {
        return this._windows.get(window)?.app ?? null;
    }
    getAppWindows(app, monitor = null) {
        return this._state.windows.filter(
            (window) => this.getWindowApp(window) === app && (monitor === null || window.get_monitor() === monitor),
        );
    }
    getEntryWindows(entry, monitor = null) {
        const windows = this.getAppWindows(entry.item.app, this.monitorOnly ? monitor : null);
        return entry.representedWindow ? windows.filter((window) => window === entry.representedWindow) : windows;
    }
    getEntries({monitor = null, runningOrder = []} = {}) {
        const windows = this.monitorOnly ? this.getOpenMonitorWindows(monitor) : this.getOpenedWindows();
        const windowsByApp = new Map();
        for (const window of windows) {
            const app = this.getWindowApp(window);
            if (!windowsByApp.has(app)) windowsByApp.set(app, []);
            windowsByApp.get(app).push(window);
        }
        const favorites = this.getFavorites();
        const represented = new Set();
        const favoriteEntries = favorites.map((app) => {
            const appWindows = windowsByApp.get(app) ?? [];
            const window = this.perWindow ? (appWindows[0] ?? null) : null;
            if (window) represented.add(window);
            return this._entry(app, window, 'favorites', appWindows.length);
        });
        const favoriteApps = new Set(favorites);
        const runningEntries = this.perWindow
            ? windows
                  .filter((window) => !represented.has(window))
                  .map((window) => this._entry(this.getWindowApp(window), window, 'running', 1))
            : this.getRunningApps()
                  .filter((app) => !favoriteApps.has(app) && windowsByApp.has(app))
                  .map((app) => this._entry(app, null, 'running', windowsByApp.get(app).length));
        const runningPositions = new Map(runningOrder.map((id, index) => [id, index]));
        runningEntries.sort(
            (a, b) =>
                (runningPositions.get(a.item.id) ?? runningOrder.length) -
                (runningPositions.get(b.item.id) ?? runningOrder.length),
        );
        return {favorites: favoriteEntries, running: runningEntries};
    }

    _entry(app, window, group, windowCount) {
        const appId = app.get_id();
        return {
            item: {
                id: window ? `window:${window.get_stable_sequence()}` : `app:${appId}`,
                appId,
                app,
                name: window?.get_title() || app.get_name(),
            },
            group,
            hardcoded: this.isFixedFavorite(appId),
            representedWindow: window,
            indicatorCount: Math.min(this.perWindow ? 1 : 4, windowCount),
        };
    }

    isFavorite(appId) {
        return this._state.favorites.some((app) => app.get_id() === appId);
    }

    isFixedFavorite(appId) {
        return this._state.fixedIds.has(appId);
    }

    canSetFavorite(app) {
        return (
            !this.isFixedFavorite(app.get_id()) &&
            !app.is_window_backed() &&
            global.settings.is_writable('favorite-apps')
        );
    }

    setFavorite(app, favorite) {
        if (!this.canSetFavorite(app)) return;
        if (favorite) this._favorites.addFavorite(app.get_id());
        else this._favorites.removeFavorite(app.get_id());
    }

    openNewWindow(app, monitor = null) {
        this._launchOnMonitor(app, monitor, () => app.open_new_window(-1));
    }

    launchAction(app, action, monitor = null) {
        this._launchOnMonitor(app, monitor, () => app.launch_action(action, global.get_current_time(), -1));
    }

    reorderFavorites(app, order) {
        if (!this.canSetFavorite(app)) return false;
        const stored = global.settings.get_strv('favorite-apps');
        const ids = order.filter((id) => !this.isFixedFavorite(id) && (id === app.get_id() || stored.includes(id)));
        const remaining = stored.filter((id) => !ids.includes(id));
        // Keep fixed entries at the front when they are also system favorites.
        const fixed = this.getFavorites()
            .map((app) => app.get_id())
            .filter((id) => this.isFixedFavorite(id) && stored.includes(id));
        return global.settings.set_strv('favorite-apps', [
            ...fixed,
            ...new Set(ids),
            ...remaining.filter((id) => !this.isFixedFavorite(id)),
        ]);
    }

    prepareLaunch(app, monitor = null) {
        monitor = this.monitorOnly ? monitor : null;
        if (monitor === null) return null;
        const request = {
            app,
            monitor,
            existing: new Set(app.get_windows()),
            window: null,
            connections: [],
            timeoutId: 0,
        };
        request.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 15000, () => {
            request.timeoutId = 0;
            this._finishLaunch(request);
            return GLib.SOURCE_REMOVE;
        });
        this._launchRequests.add(request);
        return request;
    }

    _launchOnMonitor(app, monitor, launch) {
        const request = this.prepareLaunch(app, monitor);
        try {
            launch();
        } catch (error) {
            if (request) this._finishLaunch(request);
            throw error;
        }
    }

    _observeWindow(window, app) {
        const request = [...this._launchRequests].find(
            (candidate) => !candidate.window && candidate.app === app && !candidate.existing.has(window),
        );
        if (!request) return;
        request.window = window;
        // A second simultaneous launch must not claim this same window.
        for (const other of this._launchRequests) other.existing.add(window);
        const place = () => {
            if (request.monitor < global.display.get_n_monitors() && window.get_monitor() >= 0)
                window.move_to_monitor(request.monitor);
        };
        request.connections.push([window, window.connect('unmanaged', () => this._finishLaunch(request))]);
        const actor = window.get_compositor_private();
        if (actor) {
            request.connections.push([
                actor,
                actor.connect('first-frame', () => {
                    place();
                    this._finishLaunch(request);
                }),
            ]);
        }
        // Place now, then again after initial mapping, which can change geometry.
        place();
    }

    _finishLaunch(request) {
        if (!this._launchRequests.delete(request)) return;
        if (request.timeoutId) GLib.source_remove(request.timeoutId);
        for (const [object, id] of request.connections) object.disconnect(id);
    }

    _queueRefresh(source = 'unknown') {
        if (this._refreshId) return;
        this._refreshId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._refreshId = 0;
            Logger.debug(`Refreshing due to ${source} signal`); //TODO prob should remove this line before release
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _refresh() {
        const fixedApps = ALWAYS_PINNED_APPS.map((id) => this._appSystem.lookup_app(id)).filter(Boolean);
        const fixedIds = new Set(fixedApps.map((app) => app.get_id()));
        const favorites = [
            ...fixedApps,
            ...this._favorites.getFavorites().filter((app) => !fixedIds.has(app.get_id())),
        ];
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
                    for (const signal of ['notify::title', 'notify::skip-taskbar', 'unmanaged'])
                        this._connect(window, signal, record.connections);
                    this._windows.set(window, record);
                }
                record.app = app;
                if (!window.skip_taskbar) {
                    this._observeWindow(window, app);
                    windows.push(window);
                }
            }
        }
        windows.sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
        const firstWindowIds = new Map();
        for (const window of windows) {
            const app = this.getWindowApp(window);
            if (!firstWindowIds.has(app)) firstWindowIds.set(app, window.get_stable_sequence());
        }
        // Shell's running order changes with focus; keep icons in creation order.
        running.sort(
            (a, b) =>
                (firstWindowIds.get(a) ?? Number.MAX_SAFE_INTEGER) -
                    (firstWindowIds.get(b) ?? Number.MAX_SAFE_INTEGER) || a.get_id().localeCompare(b.get_id()),
        );
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
        this.perWindow = this.settings.get_int(Constants.SettingsKeys.WINDOW_GROUPING) === 1;
        this.monitorOnly = this.settings.get_boolean(Constants.SettingsKeys.ISOLATE_TASKS);
        this._state = {favorites, running, windows, fixedIds};
        this.emit('changed');
    }

    _disconnect(connections) {
        for (const [object, id] of connections) object.disconnect(id);
    }

    destroy() {
        if (this._refreshId) GLib.source_remove(this._refreshId);
        this._refreshId = 0;
        for (const request of this._launchRequests) this._finishLaunch(request);
        this._disconnect(this._connections);
        for (const connections of this._apps.values()) this._disconnect(connections);
        for (const record of this._windows.values()) this._disconnect(record.connections);
        this._apps.clear();
        this._windows.clear();
        this._connections = [];
        this.run_dispose();
    }
}

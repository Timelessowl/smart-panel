import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import * as AppFavorites from '@girs/gnome-shell/ui/appFavorites';
import {DashLaunches} from '@/extension/components/dash/dashUtils.js';
import Logger from '@/utils/logger';
import * as Constants from '@/extension/constants.js';

const ALWAYS_PINNED_APPS = [
    Constants.APP_IDS.FILE_MANAGER,
    Constants.APP_IDS.MAIL,
];

export class DashSource extends GObject.Object {
    static {
        GObject.registerClass({Signals: {changed: {}}}, this);
    }

    constructor(settings) {
        super();
        this._settings = settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._launches = new DashLaunches();
        this._tracker = Shell.WindowTracker.get_default();
        this._apps = new Map();
        this._windows = new Map();
        this._connections = [];
        this._refreshId = 0;
        this._connect(this._appSystem, 'app-state-changed');
        this._connect(this._favorites, 'changed');
        if (this._settings.get_boolean(Constants.SettingsKeys.ISOLATE_TASKS)) {
            this._connect(global.display, 'window-entered-monitor');
            this._connect(global.display, 'window-left-monitor');
        }
        this._connect(
            settings,
            `changed::${Constants.SettingsKeys.WINDOW_GROUPING}`
        );
        this._connect(
            settings,
            `changed::${Constants.SettingsKeys.ISOLATE_TASKS}`
        );
        this._refresh();
    }

    _connect(object, signal, connections = this._connections) {
        connections.push([
            object,
            object.connect(signal, () => this._queueRefresh(signal)),
        ]);
    }

    get perWindow() { return this._state.perWindow; }
    get settings() { return this._settings; }
    get monitorOnly() { return this._state.monitorOnly; }
    getFavorites() { return [...this._state.favorites]; }
    getRunningApps() { return [...this._state.running]; }
    getOpenedWindows() { return [...this._state.windows]; }
    getOpenMonitorWindows(monitor) {
        return this._state.windows.filter(
            window => window.get_monitor() === monitor
        );
    }
    getWindowApp(window) {
        return this._windows.get(window)?.app ?? null;
    }
    getAppWindows(app, monitor = null) {
        return this._state.windows.filter(
            window =>
                this.getWindowApp(window) === app &&
                (monitor === null || window.get_monitor() === monitor)
        );
    }
    getEntryWindows(entry, monitor = null) {
        const windows = this.getAppWindows(
            entry.item.app,
            this.monitorOnly ? monitor : null
        );
        return entry.representedWindow
            ? windows.filter(window => window === entry.representedWindow)
            : windows;
    }
    getEntries({monitor = null, favoriteOrder = [], runningOrder = []} = {}) {
        const windows = this.monitorOnly
            ? this.getOpenMonitorWindows(monitor)
            : this.getOpenedWindows();
        const windowsByApp = new Map();
        for (const window of windows) {
            const app = this.getWindowApp(window);
            if (!windowsByApp.has(app)) windowsByApp.set(app, []);
            windowsByApp.get(app).push(window);
        }
        const positions = new Map(
            favoriteOrder.map((id, index) => [id, index])
        );
        const favorites = this.getFavorites();
        const orderedFavorites = [
            ...favorites.filter(app => this.isFixedFavorite(app.get_id())),
            ...favorites
                .filter(app => !this.isFixedFavorite(app.get_id()))
                .sort(
                    (a, b) =>
                        (positions.get(a.get_id()) ?? favoriteOrder.length) -
                        (positions.get(b.get_id()) ?? favoriteOrder.length)
                ),
        ];
        const represented = new Set();
        const favoriteEntries = orderedFavorites.map(app => {
            const appWindows = windowsByApp.get(app) ?? [];
            const window = this.perWindow ? (appWindows[0] ?? null) : null;
            if (window) represented.add(window);
            return this._entry(app, window, 'favorites', appWindows.length);
        });
        const favoriteApps = new Set(favorites);
        const runningEntries = this.perWindow
            ? windows
                  .filter(window => !represented.has(window))
                  .map(window =>
                      this._entry(
                          this.getWindowApp(window),
                          window,
                          'running',
                          1
                      )
                  )
            : this.getRunningApps()
                  .filter(
                      app => !favoriteApps.has(app) && windowsByApp.has(app)
                  )
                  .map(app =>
                      this._entry(
                          app,
                          null,
                          'running',
                          windowsByApp.get(app).length
                      )
                  );
        const runningPositions = new Map(
            runningOrder.map((id, index) => [id, index])
        );
        runningEntries.sort(
            (a, b) =>
                (runningPositions.get(a.item.id) ?? runningOrder.length) -
                (runningPositions.get(b.item.id) ?? runningOrder.length)
        );
        return {favorites: favoriteEntries, running: runningEntries};
    }

    _entry(app, window, group, windowCount) {
        const appId = app.get_id();
        return {
            item: {
                id: window
                    ? `window:${window.get_stable_sequence()}`
                    : `app:${appId}`,
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
        return this._state.favorites.some(app => app.get_id() === appId);
    }

    isFixedFavorite(appId) {
        return this._state.fixedIds.has(appId);
    }

    canSetFavorite(app) {
        return (
            this.canReorderFavorite(app) &&
            global.settings.is_writable('favorite-apps')
        );
    }

    canReorderFavorite(app) {
        return !this.isFixedFavorite(app.get_id()) && !app.is_window_backed();
    }

    setFavorite(app, favorite) {
        if (!this.canSetFavorite(app)) return;
        if (favorite) this._favorites.addFavorite(app.get_id());
        else this._favorites.removeFavorite(app.get_id());
    }

    prepareLaunch(app, monitor) {
        this._launches.prepareLaunch(app, this.monitorOnly ? monitor : null);
    }

    openNewWindow(app, monitor) {
        this._launches.openNewWindow(app, this.monitorOnly ? monitor : null);
    }

    launchAction(app, action, monitor) {
        this._launches.launchAction(
            app,
            action,
            this.monitorOnly ? monitor : null
        );
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
        const fixedApps = ALWAYS_PINNED_APPS.map(id =>
            this._appSystem.lookup_app(id)
        ).filter(Boolean);
        const fixedIds = new Set(fixedApps.map(app => app.get_id()));
        const favorites = [
            ...fixedApps,
            ...this._favorites
                .getFavorites()
                .filter(app => !fixedIds.has(app.get_id())),
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
                    this._windows.set(window, record);
                }
                record.app = app;
                if (!window.skip_taskbar) {
                    this._launches.observeWindow(window, app);
                    windows.push(window);
                }
            }
        }
        windows.sort(
            (a, b) => a.get_stable_sequence() - b.get_stable_sequence()
        );
        const firstWindowIds = new Map();
        for (const window of windows) {
            const app = this.getWindowApp(window);
            if (!firstWindowIds.has(app))
                firstWindowIds.set(app, window.get_stable_sequence());
        }
        // Shell's running order changes with focus; keep icons in creation order.
        running.sort(
            (a, b) =>
                (firstWindowIds.get(a) ?? Number.MAX_SAFE_INTEGER) -
                    (firstWindowIds.get(b) ?? Number.MAX_SAFE_INTEGER) ||
                a.get_id().localeCompare(b.get_id())
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
        this._state = {
            favorites,
            running,
            windows,
            fixedIds,
            perWindow:
                this._settings.get_int(
                    Constants.SettingsKeys.WINDOW_GROUPING
                ) === 1, // no proper const
            monitorOnly: this._settings.get_boolean(
                Constants.SettingsKeys.ISOLATE_TASKS
            ),
        };
        this.emit('changed');
    }

    _disconnect(connections) {
        for (const [object, id] of connections) object.disconnect(id);
    }

    destroy() {
        if (this._refreshId) GLib.source_remove(this._refreshId);
        this._refreshId = 0;
        this._launches.destroy();
        this._disconnect(this._connections);
        for (const connections of this._apps.values())
            this._disconnect(connections);
        for (const record of this._windows.values())
            this._disconnect(record.connections);
        this._apps.clear();
        this._windows.clear();
        this._connections = [];
        this.run_dispose();
    }
}

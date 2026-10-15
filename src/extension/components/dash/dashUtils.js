import GLib from 'gi://GLib';
import * as Main from '@girs/gnome-shell/ui/main';

// Monitor-local activation state survives icon and expanded-view rebuilds.
export class DashActions {
    constructor(source, monitor) {
        this._source = source;
        this._monitor = monitor;
        this._cycle = null;
    }

    resetCycle() {
        this._cycle = null;
    }

    activate(entry) {
        // Use current source state, including updates deferred by a dragged view.
        const windows = this._source.getAppWindows(entry.item.app,
            this._source.monitorOnly ? this._monitor : null);
        if (this._source.perWindow) {
            this.resetCycle();
            const window = entry.representedWindow;
            if (window && windows.includes(window))
                Main.activateWindow(window);
            else if (windows.length && entry.group === 'favorites')
                Main.activateWindow(windows[0]);
            else
                this.openNewWindow(entry.item.app);
            return;
        }
        const {action, cycle} = nextAppAction(this._cycle, {...entry, windows});
        this._cycle = cycle;
        if (action.type === 'focus')
            Main.activateWindow(action.window);
        else if (action.type === 'minimize')
            action.windows.forEach(window => window.minimize());
        else
            this.openNewWindow(entry.item.app);
    }

    prepareLaunch(app) {
        this._source.prepareLaunch(app, this._monitor);
    }

    openNewWindow(app, monitor = this._monitor) {
        this._source.openNewWindow(app, monitor);
    }

    launchAction(app, action, monitor = this._monitor) {
        this._source.launchAction(app, action, monitor);
    }

    destroy() {
        this.resetCycle();
    }
}

// Shared by every dash through the source: simultaneous launches must claim
// distinct new windows even when they were requested on different monitors.
export class DashLaunches {
    constructor() {
        this._requests = new Set();
    }

    openNewWindow(app, monitor) {
        this._launch(app, monitor, () => app.open_new_window(-1));
    }

    launchAction(app, action, monitor) {
        this._launch(app, monitor, () =>
            app.launch_action(action, global.get_current_time(), -1));
    }

    prepareLaunch(app, monitor) {
        if (monitor === null) return null;
        const request = {app, monitor, existing: new Set(app.get_windows()),
            window: null, connections: [], timeoutId: 0};
        request.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 15000, () => {
            request.timeoutId = 0;
            this._finish(request);
            return GLib.SOURCE_REMOVE;
        });
        this._requests.add(request);
        return request;
    }

    _launch(app, monitor, launch) {
        const request = this.prepareLaunch(app, monitor);
        try {
            launch();
        } catch (error) {
            if (request) this._finish(request);
            throw error;
        }
    }

    observeWindow(window, app) {
        const request = [...this._requests].find(candidate =>
            !candidate.window && candidate.app === app && !candidate.existing.has(window));
        if (!request)
            return;
        request.window = window;
        // A second simultaneous launch must not claim this same window.
        for (const other of this._requests)
            other.existing.add(window);
        const place = () => {
            if (request.monitor < global.display.get_n_monitors() && window.get_monitor() >= 0)
                window.move_to_monitor(request.monitor);
        };
        request.connections.push([window, window.connect('unmanaged', () => this._finish(request))]);
        const actor = window.get_compositor_private();
        if (actor) {
            request.connections.push([actor, actor.connect('first-frame', () => {
                place();
                this._finish(request);
            })]);
        }
        // Place now, then again after initial mapping, which can change geometry.
        place();
    }

    _finish(request) {
        if (!this._requests.delete(request))
            return;
        if (request.timeoutId)
            GLib.source_remove(request.timeoutId);
        for (const [object, id] of request.connections)
            object.disconnect(id);
    }

    destroy() {
        for (const request of this._requests)
            this._finish(request);
    }
}

// Stateless click decision; DashActions owns the cycle across view rebuilds.
export function nextAppAction(previous, entry) {
    const windows = entry.windows;
    if (!windows.length)
        return {action: {type: 'launch'}, cycle: null};
    if (windows.length === 1)
        return {action: {type: 'focus', window: windows[0]}, cycle: null};

    const signature = windows.map(window => window.get_stable_sequence()).join('|');
    const index = previous?.appId === entry.item.appId && previous.signature === signature
        ? previous.nextIndex : 0;
    const action = index < windows.length
        ? {type: 'focus', window: windows[index]}
        : {type: 'minimize', windows};
    return {action, cycle: {appId: entry.item.appId, signature,
        nextIndex: index < windows.length ? index + 1 : 0}};
}

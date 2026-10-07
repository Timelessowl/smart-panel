import GLib from 'gi://GLib';

// Shell.App accepts a workspace, but no monitor. Track only newly created
// windows for a launch and place them on the requesting dash's monitor.
export class DashLauncher {
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

    _launch(app, monitor, launch) {
        if (monitor === null) {
            launch();
            return;
        }
        const request = {app, monitor, existing: new Set(app.get_windows()),
            window: null, connections: [], timeoutId: 0};
        request.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 15000, () => {
            request.timeoutId = 0;
            this._finish(request);
            return GLib.SOURCE_REMOVE;
        });
        this._requests.add(request);
        try {
            launch();
        } catch (error) {
            this._finish(request);
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

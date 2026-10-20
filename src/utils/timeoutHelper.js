import GLib from 'gi://GLib';

export default class TimeoutManager {
    constructor() {
        this._timeouts = new Map();
    }

    addTimeout(label, timeout, action, priority = GLib.PRIORITY_DEFAULT) {
        const timeoutId = GLib.timeout_add(priority, timeout, action);
        this._timeouts.set(label, timeoutId);
    }

    hasActiveTimeout(label) {
        return !!this._timeouts.get(label);
    }

    clearTimeout(label) {
        const timeoutId = this._timeouts.get(label);
        if (!timeoutId) return; //TODO Logger?
        GLib.source_remove(timeoutId);
        this._timeouts.set(label, 0);
    }

    destroy() {
        this._timeouts.forEach(id => {
            GLib.source_remove(id);
        });
        this._timeouts.clear();
    }
}

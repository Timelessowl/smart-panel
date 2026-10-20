import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import * as Main from '@girs/gnome-shell/ui/main';
import * as MessageTray from '@girs/gnome-shell/ui/messageTray';

export const SIGNAL_UPDATED = 'updated';
export const SIGNAL_DND_CHANGED = 'dnd-changed';

// Shell owns notification delivery, replacement and expiry. Observe its tray
// rather than attempting to reconstruct notifications from D-Bus traffic.
export class NotificationsMonitor extends GObject.Object {
    static {
        GObject.registerClass(
            {
                Signals: {
                    [SIGNAL_UPDATED]: {param_types: [GObject.TYPE_STRING, GObject.TYPE_JSOBJECT]},
                    [SIGNAL_DND_CHANGED]: {param_types: [GObject.TYPE_BOOLEAN]},
                },
            },
            this,
        );
    }

    constructor() {
        super();
        this._states = new Map();
        this._sources = new Map();
        this._settings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this.dndActive = !this._settings.get_boolean('show-banners');
        this._settingsId = this._settings.connect('changed::show-banners', () => {
            this.dndActive = !this._settings.get_boolean('show-banners');
            this.emit(SIGNAL_DND_CHANGED, this.dndActive);
        });
        this._tray = Main.messageTray;
        this._trayConnections = [
            this._tray.connect('source-added', (_tray, source) => this._addSource(source)),
            this._tray.connect('source-removed', (_tray, source) => this._removeSource(source)),
        ];
        for (const source of this._tray.getSources()) this._addSource(source);
    }

    getState(appId) {
        return this._states.get(appId) ?? null;
    }

    _addSource(source) {
        if (this._sources.has(source)) return;
        const appId =
            source.app?.get_id() ??
            (source.policy instanceof MessageTray.NotificationApplicationPolicy
                ? `${source.policy.id.replace(/\.desktop$/, '')}.desktop`
                : null);
        if (!appId) return;
        const record = {appId, connections: [], notifications: new Map()};
        this._sources.set(source, record);
        record.connections.push(
            source.connect('notification-added', () => this._syncSource(source)),
            source.connect('notification-removed', () => this._syncSource(source)),
        );
        this._syncSource(source);
    }

    _syncSource(source) {
        const record = this._sources.get(source);
        const notifications = new Set(source.notifications);
        for (const [notification, id] of record.notifications) {
            if (notifications.has(notification)) continue;
            notification.disconnect(id);
            record.notifications.delete(notification);
        }
        for (const notification of notifications) {
            if (record.notifications.has(notification)) continue;
            record.notifications.set(
                notification,
                notification.connect('notify::urgency', () => this._updateState(record.appId)),
            );
        }
        this._updateState(record.appId);
    }

    _removeSource(source) {
        const record = this._sources.get(source);
        if (!record) return;
        for (const id of record.connections) source.disconnect(id);
        for (const [notification, id] of record.notifications) notification.disconnect(id);
        this._sources.delete(source);
        this._updateState(record.appId);
    }

    _updateState(appId) {
        let total = 0;
        let urgent = false;
        for (const [source, record] of this._sources) {
            if (record.appId !== appId) continue;
            total += source.notifications.length;
            urgent ||= source.notifications.some((n) => n.urgency > MessageTray.Urgency.NORMAL);
        }
        const previous = this._states.get(appId);
        if ((previous?.total ?? 0) === total && (previous?.urgent ?? false) === urgent) return;
        const state = {total, urgent};
        if (total) this._states.set(appId, state);
        else this._states.delete(appId);
        this.emit(SIGNAL_UPDATED, appId, state);
    }

    destroy() {
        for (const id of this._trayConnections) this._tray.disconnect(id);
        this._trayConnections = [];
        this._settings.disconnect(this._settingsId);
        for (const source of this._sources.keys()) this._removeSource(source);
        this._states.clear();
        this.run_dispose();
    }
}

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Main from '@girs/gnome-shell/ui/main';
import * as MessageTray from '@girs/gnome-shell/ui/messageTray';
import {EventEmitter} from '@girs/gnome-shell/misc/signals';
import Logger from '@/utils/logger.js';

export const SIGNAL_UPDATED = 'updated';
export const SIGNAL_DND_CHANGED = 'dnd-changed';

export class NotificationsMonitor extends EventEmitter {
    constructor() {
        super();
        this._state = {};
        this._activeNotifications = new Map();
        /** @type {Array<[{disconnect(id: number): void}, number]>} */
        this._connections = [];
        this._sourceConnections = new Map();
        this._notifyDbusId = 0;
        this._closedDbusId = 0;

        // Keep the existing badge's Do Not Disturb integration.
        this._settings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this.dndActive = !this._settings.get_boolean('show-banners');
        this._connections.push([
            this._settings,
            this._settings.connect('changed::show-banners', () => {
                this.dndActive = !this._settings.get_boolean('show-banners');
                this.emit(SIGNAL_DND_CHANGED, this.dndActive);
            }),
        ]);

        this._subscribeToNotificationDBus();
        this._checkNotifications();
    }

    destroy() {
        if (this._notifyDbusId) Gio.DBus.session.signal_unsubscribe(this._notifyDbusId);
        if (this._closedDbusId) Gio.DBus.session.signal_unsubscribe(this._closedDbusId);
        this._notifyDbusId = 0;
        this._closedDbusId = 0;
        for (const [object, id] of this._connections) object.disconnect(id);
        this._connections = [];
        for (const [source, id] of this._sourceConnections) source.disconnect(id);
        this._sourceConnections.clear();
        this._state = {};
        this._activeNotifications.clear();
        this.emit('destroy');
        this.disconnectAll();
    }

    // The reference accepts Shell.App; existing badge callers pass its ID.
    getState(app) {
        return this._state[typeof app === 'string' ? app : app.id] || null;
    }

    _getDefaultState() {
        return {
            count: 0,
            trayCount: 0,
            trayUrgent: false,
            urgent: false,
            total: 0,
            manual: false,
        };
    }

    _updateState(appId, state, _ignoreMapping = false) {
        const normalizedId = appId.endsWith('.desktop') ? appId.slice(0, -8) : appId;
        const desktopId = `${normalizedId}.desktop`;
        this._state[desktopId] = this._state[desktopId] || this._getDefaultState();

        const merged = this._mergeState(desktopId, state);
        Logger.debug(
            `_updateState: appId=${appId} desktopId=${desktopId} total=${this._state[desktopId].total} emit=${merged}`,
        );
        if (merged) {
            this.emit(`update-${desktopId}`, this._state[desktopId]);
            // Preserve the shared signal consumed by DashBadge.
            this.emit(SIGNAL_UPDATED, desktopId, this._state[desktopId]);
        }
    }

    _mergeState(appId, state) {
        const prevTotal = this._state[appId].total;
        this._state[appId] = {...this._state[appId], ...state};

        const count = Math.max(0, this._state[appId].count || 0);
        const trayCount = Math.max(0, this._state[appId].trayCount || 0);
        this._state[appId].total = count + trayCount;
        this._state[appId].urgent = state.urgent || this._state[appId].trayUrgent || false;

        const changed = prevTotal !== this._state[appId].total || state.urgent !== undefined;
        if (changed && this._state[appId].total === 0)
            Logger.debug(`NotificationsMonitor: badge cleared for ${appId} (all notifications read/closed)`);
        return changed;
    }

    _subscribeToNotificationDBus() {
        // Preserve the supplied subscriptions. Standard Notify delivery is a
        // method call; this signal subscription only receives signals named Notify.
        this._notifyDbusId = Gio.DBus.session.signal_subscribe(
            null,
            'org.freedesktop.Notifications',
            'Notify',
            '/org/freedesktop/Notifications',
            null,
            Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, _signal, params) => {
                try {
                    const [appName, id, , , , , hints] =
                        /** @type {[string, number, unknown, unknown, unknown, unknown, {urgency?: number}, number]} */
                        (params.deep_unpack());
                    const appId = this._resolveAppIdFromName(appName);
                    Logger.debug(`DBus Notify: appName=${appName} resolvedAppId=${appId} id=${id}`);
                    if (appId) {
                        this._activeNotifications.set(id, appId);
                        const current = this._state[appId]?.trayCount || 0;
                        this._updateState(appId, {
                            trayCount: current + 1,
                            trayUrgent: hints?.urgency === 2,
                        });
                    }
                } catch (error) {
                    console.error('NotificationsMonitor notify parse error:', error);
                }
            },
        );

        this._closedDbusId = Gio.DBus.session.signal_subscribe(
            null,
            'org.freedesktop.Notifications',
            'NotificationClosed',
            '/org/freedesktop/Notifications',
            null,
            Gio.DBusSignalFlags.NONE,
            (_conn, _sender, _path, _iface, _signal, params) => {
                try {
                    const [id] = /** @type {[number, number]} */ (params.deep_unpack());
                    const appId = this._activeNotifications.get(id);
                    Logger.debug(`DBus NotificationClosed: id=${id} appId=${appId}`);
                    if (appId) {
                        this._activeNotifications.delete(id);
                        const current = this._state[appId]?.trayCount || 0;
                        this._updateState(appId, {trayCount: Math.max(0, current - 1)});
                    }
                } catch (error) {
                    console.error('NotificationsMonitor closed parse error:', error);
                }
            },
        );
    }

    _resolveAppIdFromName(appName) {
        if (!appName) return null;
        if (appName.endsWith('.desktop')) return appName;

        const appSystem = Shell.AppSystem.get_default();
        const running = appSystem.get_running() || [];
        const match = running.find((app) => {
            const name = app.get_name()?.toLowerCase() || '';
            const id = app.get_id()?.toLowerCase() || '';
            const query = appName.toLowerCase();
            return name.includes(query) || query.includes(name) || id.includes(query);
        });
        const resolved = match?.get_id() || null;
        Logger.debug(`_resolveAppIdFromName: appName=${appName} → ${resolved} (runningCount=${running.length})`);
        return resolved;
    }

    _checkNotifications() {
        try {
            if (!Main.messageTray?.getSources) return;

            const getSourceId = (source) =>
                source?._appId ||
                source?.app?.id ||
                (source?.policy instanceof MessageTray.NotificationApplicationPolicy && source.policy.id);
            const addSource = (_tray, source) => {
                const appId = getSourceId(source);
                Logger.debug(`messageTray source: appId=${appId} sourceCount=${source.count ?? 0}`);
                if (!appId || this._sourceConnections.has(source)) return;

                const updateTray = () => {
                    this._updateState(appId, {
                        trayCount: source.count ?? 0,
                        trayUrgent: !!source.notifications?.find((n) => n.urgency > MessageTray.Urgency.NORMAL),
                    });
                };
                this._sourceConnections.set(source, source.connect('notify::count', updateTray));
                updateTray();
            };

            this._connections.push(
                [Main.messageTray, Main.messageTray.connect('source-added', addSource)],
                [
                    Main.messageTray,
                    Main.messageTray.connect('source-removed', (_tray, source) => {
                        const id = this._sourceConnections.get(source);
                        if (id) source.disconnect(id);
                        this._sourceConnections.delete(source);
                    }),
                ],
            );
            Main.messageTray.getSources()?.forEach((source) => addSource(null, source));
        } catch (error) {
            Logger.debug(`NotificationsMonitor messageTray integration skipped: ${error.message}`);
        }
    }
}

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Main from '@girs/gnome-shell/ui/main';
import * as MessageTray from '@girs/gnome-shell/ui/messageTray';
import {EventEmitter} from '@girs/gnome-shell/misc/signals';
import * as Constants from '@/extension/constants.js';
import Logger from '@/utils/logger.js';

const DESKTOP_EXTENSION = '.desktop';
const NotificationsDBus = Object.freeze({
    INTERFACE: 'org.freedesktop.Notifications',
    PATH: '/org/freedesktop/Notifications',
    NOTIFY: 'Notify',
    CLOSED: 'NotificationClosed',
});
const URGENT_HINT = 2;
const DoNotDisturb = Object.freeze({
    SCHEMA: 'org.gnome.desktop.notifications',
    SHOW_BANNERS_KEY: 'show-banners',
});

export const SIGNAL_UPDATED = 'updated';
export const SIGNAL_DND_CHANGED = 'dnd-changed';

const DEFAULT_STATE = Object.freeze({
    trayCount: 0,
    trayUrgent: false,
    urgent: false,
    total: 0,
});

export class NotificationsMonitor extends EventEmitter {
    constructor() {
        super();
        this._state = {};
        this._activeNotifications = new Map();
        this._connections = [];
        this._labelledConnections = new Map();
        this._notificationSettings = null;
        this._dndActive = false;
        this._trayAvailable = false;
        this._notifySignalId = 0;
        this._closedSignalId = 0;
        this._subscribeToNotifications();
        this._subscribeToDoNotDisturb();
        this._trackMessageTray();
    }
    getState(appId) {
        return this._state[toDesktopId(appId)] ?? null;
    }

    isDndActive() {
        return this._dndActive;
    }
    destroy() {
        for (const id of [this._notifySignalId, this._closedSignalId]) {
            if (id) Gio.DBus.session.signal_unsubscribe(id);
        }
        this._notifySignalId = 0;
        this._closedSignalId = 0;

        this._disconnect(this._connections);
        for (const label of [...this._labelledConnections.keys()])
            this._removeWithLabel(label);

        this._state = {};
        this._activeNotifications.clear();
        this._notificationSettings = null;
        this._dndActive = false;
        this._trayAvailable = false;
    }

    _subscribeToDoNotDisturb() {
        this._notificationSettings = new Gio.Settings({
            schema_id: DoNotDisturb.SCHEMA,
        });
        this._dndActive = this._readDndState();

        this._connect(
            this._notificationSettings,
            `changed::${DoNotDisturb.SHOW_BANNERS_KEY}`,
            () => {
                const dndActive = this._readDndState();
                if (dndActive === this._dndActive) return;
                this._dndActive = dndActive;
                Logger.debug('NotificationsMonitor: DND active {}', dndActive);
                this.emit(SIGNAL_DND_CHANGED, dndActive);
            }
        );
    }
    _readDndState() {
        return !this._notificationSettings.get_boolean(
            DoNotDisturb.SHOW_BANNERS_KEY
        );
    }

    _subscribeToNotifications() {
        this._notifySignalId = this._subscribe(
            NotificationsDBus.NOTIFY,
            params => this._onNotified(params)
        );
        this._closedSignalId = this._subscribe(
            NotificationsDBus.CLOSED,
            params => this._onClosed(params)
        );
    }

    _subscribe(member, handler) {
        try {
            return Gio.DBus.session.signal_subscribe(
                null,
                NotificationsDBus.INTERFACE,
                member,
                NotificationsDBus.PATH,
                null,
                Gio.DBusSignalFlags.NONE,
                (_conn, _sender, _path, _iface, _signal, params) => {
                    try {
                        handler(params.deep_unpack());
                    } catch (error) {
                        Logger.error(
                            'NotificationsMonitor: cannot read {} {}',
                            member,
                            error
                        );
                    }
                }
            );
        } catch (error) {
            Logger.error(
                'NotificationsMonitor: cannot follow {} {}',
                member,
                error
            );
            return 0;
        }
    }

    _onNotified(params) {
        const [appName, notificationId, , , , , hints] = params;
        const appId = this._resolveAppId(appName);
        if (!appId) return;
        this._activeNotifications.set(notificationId, appId);
        if (this._trayAvailable) return;
        this._updateState(appId, {
            trayCount: (this.getState(appId)?.trayCount ?? 0) + 1,
            trayUrgent: hints?.urgency === URGENT_HINT,
        });
    }
    _onClosed(params) {
        const [notificationId] = params;
        const appId = this._activeNotifications.get(notificationId);
        if (!appId) return;
        this._activeNotifications.delete(notificationId);
        if (this._trayAvailable) return;
        this._updateState(appId, {
            trayCount: Math.max(0, (this.getState(appId)?.trayCount ?? 0) - 1),
        });
    }

    _resolveAppId(appName) {
        if (!appName) return null;
        if (appName.endsWith(DESKTOP_EXTENSION)) return appName;

        const query = appName.toLowerCase();
        const match = Shell.AppSystem.get_default()
            .get_running()
            .find(app => {
                const name = app.get_name()?.toLowerCase() ?? '';
                const id = app.get_id()?.toLowerCase() ?? '';
                return (
                    name.includes(query) ||
                    query.includes(name) ||
                    id.includes(query)
                );
            });
        return match?.get_id() ?? null;
    }

    _trackMessageTray() {
        this._trayAvailable = Boolean(Main.messageTray?.getSources);
        if (!this._trayAvailable) {
            Logger.warn('NotificationsMonitor: message tray unavailable');
            return;
        }

        this._connect(Main.messageTray, 'source-added', (_tray, source) =>
            this._addSource(source)
        );
        this._connect(Main.messageTray, 'source-removed', (_tray, source) =>
            this._removeSource(source)
        );
        for (const source of Main.messageTray.getSources())
            this._addSource(source);
    }

    _addSource(source) {
        const appId = sourceAppId(source);
        if (!appId) return;

        this._connect(
            source,
            'notify::count',
            () =>
                this._updateState(appId, {
                    trayCount: source.count ?? 0,
                    trayUrgent: !!source.notifications?.find(
                        n => n.urgency > MessageTray.Urgency.NORMAL
                    ),
                }),
            appId
        );
        this._updateState(appId, {trayCount: source.count ?? 0});
    }

    _removeSource(source) {
        const appId = sourceAppId(source);
        if (!appId) return;
        this._removeWithLabel(appId);
        this._updateState(appId, {trayCount: 0, trayUrgent: false});
    }

    _updateState(appId, state) {
        const desktopId = toDesktopId(appId);
        if (!desktopId) return;

        if (!this._state[desktopId])
            this._state[desktopId] = {...DEFAULT_STATE};

        if (!this._mergeState(desktopId, state)) return;

        const current = this._state[desktopId];
        Logger.debug(
            'NotificationsMonitor: {} total {}',
            desktopId,
            current.total
        );
        this.emit(SIGNAL_UPDATED, desktopId, current);
    }

    _mergeState(desktopId, state) {
        const previous = this._state[desktopId];
        const trayCount = Math.max(
            0,
            state.trayCount ?? previous.trayCount ?? 0
        );
        const trayUrgent = Boolean(state.trayUrgent ?? previous.trayUrgent);
        const urgent = Boolean(state.urgent ?? trayUrgent);
        if (trayCount === previous.trayCount && urgent === previous.urgent)
            return false;

        this._state[desktopId] = {
            ...previous,
            ...state,
            trayCount,
            trayUrgent,
            urgent,
            total: trayCount,
        };
        return true;
    }

    _connect(object, signal, handler, label) {
        const id = object.connect(signal, handler);
        this._connections.push([object, id]);
        if (!label) return;

        const group = this._labelledConnections.get(label) ?? [];
        group.push([object, id]);
        this._labelledConnections.set(label, group);
    }

    _removeWithLabel(label) {
        this._disconnect(this._labelledConnections.get(label));
        this._labelledConnections.delete(label);
    }

    _disconnect(connections) {
        for (const [object, id] of connections ?? []) object?.disconnect?.(id);
    }
}

function toDesktopId(appId) {
    if (!appId) return '';
    return appId.endsWith(DESKTOP_EXTENSION)
        ? appId
        : `${appId}${DESKTOP_EXTENSION}`;
}

function sourceAppId(source) {
    if (source?._appId) return source._appId;
    if (source?.app?.id) return source.app.id;
    const isApplicationPolicy =
        source?.policy instanceof MessageTray.NotificationApplicationPolicy;
    return isApplicationPolicy ? source.policy.id : null;
}

function isAppAllowed(settings, appId) {
    if (!settings || !Constants.NOTIFICATION_BADGE_CAPABLE_APPS.includes(appId))
        return false;
    return (
        settings.get_strv(Constants.SettingsKeys.NOTIFICATION_BADGE) ?? []
    ).includes(appId);
}

export function isBadgeVisible(settings, appId, dndActive) {
    if (dndActive) return false;
    if (
        !settings?.get_boolean(
            Constants.SettingsKeys.NOTIFICATION_INDICATORS_ENABLED
        )
    )
        return false;
    return isAppAllowed(settings, appId);
}

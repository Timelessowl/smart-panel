import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';
import * as Constants from '@/extension/constants.js';
import * as Notifications from '@/extension/notificationsMonitor.js';

const URGENT_STYLE_CLASS = 'dash-icon-urgent';

// The badge is an actor. Its lifetime owns its signal connections, including
// native parent destruction; dependencies arrive directly from the icon.
export class DashBadge extends St.Label {
    static {
        GObject.registerClass(this);
    }

    constructor(settings, monitor, appId, container, iconSize) {
        super({
            style_class: 'dash-notification-badge',
            text: '0',
            visible: false,
            reactive: false,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });
        this._settings = settings;
        this._monitor = monitor;
        this._appId = appId;
        this._container = container;
        this._toggleItem = null;
        monitor.connectObject(
            Notifications.SIGNAL_UPDATED,
            (_monitor, id) => {
                if (id === appId) this.sync();
            },
            this,
        );
        monitor.connectObject(Notifications.SIGNAL_DND_CHANGED, () => this.sync(), this);
        for (const key of [
            Constants.SettingsKeys.NOTIFICATION_BADGE,
            Constants.SettingsKeys.NOTIFICATION_INDICATORS_ENABLED,
        ])
            settings.connectObject(`changed::${key}`, () => this.sync(), this);
        this.connect('destroy', () => {
            this._removeToggle();
            container.remove_style_class_name(URGENT_STYLE_CLASS);
        });
        this.clutter_text.x_align = Clutter.ActorAlign.CENTER;
        this.clutter_text.y_align = Clutter.ActorAlign.CENTER;
        this.setIconSize(iconSize);
        this.sync();
    }

    syncMenu(menu) {
        this._removeToggle();
        if (
            !Constants.NOTIFICATION_BADGE_CAPABLE_APPS.includes(this._appId) ||
            !this._settings.is_writable(Constants.SettingsKeys.NOTIFICATION_BADGE)
        )
            return;
        const allowed = this._settings.get_strv(Constants.SettingsKeys.NOTIFICATION_BADGE);
        const enabled = allowed.includes(this._appId);
        const item = new PopupMenu.PopupMenuItem(
            enabled ? Constants.DashMenuLabels.NOTIFICATIONS_OFF : Constants.DashMenuLabels.NOTIFICATIONS_ON,
        );
        this._toggleItem = item;
        item.connect('destroy', () => {
            if (this._toggleItem === item) this._toggleItem = null;
        });
        item.connect('activate', () => {
            const current = this._settings.get_strv(Constants.SettingsKeys.NOTIFICATION_BADGE);
            this._settings.set_strv(
                Constants.SettingsKeys.NOTIFICATION_BADGE,
                current.includes(this._appId) ? current.filter((id) => id !== this._appId) : [...current, this._appId],
            );
            menu.close();
        });
        menu.addMenuItem(item);
    }

    sync() {
        const state = this._monitor.getState(this._appId);
        this.visible = Boolean(
            state?.total > 0 &&
            !this._monitor.dndActive &&
            Constants.NOTIFICATION_BADGE_CAPABLE_APPS.includes(this._appId) &&
            this._settings.get_boolean(Constants.SettingsKeys.NOTIFICATION_INDICATORS_ENABLED) &&
            this._settings.get_strv(Constants.SettingsKeys.NOTIFICATION_BADGE).includes(this._appId),
        );
        if (this.visible)
            this.text =
                state.total > Constants.DASH_BADGE_MAX_COUNT ? `${Constants.DASH_BADGE_MAX_COUNT}+` : `${state.total}`;
        if (this.visible && state.urgent) this._container.add_style_class_name(URGENT_STYLE_CLASS);
        else this._container.remove_style_class_name(URGENT_STYLE_CLASS);
    }

    setIconSize(iconSize) {
        // CSS dimensions are logical pixels and St scales them itself.
        const fontSize = Math.max(
            Constants.DASH_BADGE_MIN_FONT_SIZE,
            Math.round(iconSize * Constants.DASH_BADGE_FONT_RATIO),
        );
        const size = Math.round(fontSize * Constants.DASH_BADGE_HEIGHT_RATIO);
        this.set_style(
            `font-size: ${fontSize}px; min-width: ${size}px; height: ${size}px; border-radius: ${Math.round(size / 2)}px;`,
        );
    }

    _removeToggle() {
        this._toggleItem?.destroy();
        this._toggleItem = null;
    }
}

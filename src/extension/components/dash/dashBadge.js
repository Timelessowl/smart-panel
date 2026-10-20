import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';

import * as Constants from '@/extension/constants.js';
import Logger from '@/utils/logger.js';
import {
    SIGNAL_DND_CHANGED,
    SIGNAL_UPDATED,
    isBadgeVisible,
} from '@/extension/common/notificationsMonitor.js';

const URGENT_STYLE_CLASS = 'dash-icon-urgent';

export class DashBadge {
    constructor(owner, icon, app, monitor) {
        this._owner = owner;
        this._icon = icon;
        this._app = app;
        this._monitor = monitor;
        this._appId = app.id;
        this._toggleItem = null;
        this._connections = [];
        this._destroyed = false;
        this._container = icon._iconContainer ?? icon;
        this._label = new St.Label({
            style_class: 'dash-notification-badge',
            text: '0',
            visible: false,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });
        this._container.add_child(this._label);
        this._container.set_child_above_sibling(this._label, null);

        this._listen(
            this._monitor,
            SIGNAL_UPDATED,
            (_monitor, appId, state) => {
                if (appId === this._appId) this.sync(state);
            }
        );
        this._listen(this._monitor, SIGNAL_DND_CHANGED, () => this.sync());
        this._listen(this.settings, 'changed', (_settings, key) => {
            if (this._affectsBadge(key)) this.sync();
        });
        this.sync();
    }
    syncMenu(menu) {
        Logger.debug('DashBadge: menu for {}', this._appId);
        if (!Constants.NOTIFICATION_BADGE_CAPABLE_APPS.includes(this._appId)) {
            Logger.debug('DashBadge: {} cannot carry a badge', this._appId);
            this._removeToggle();
            return;
        }

        this._removeToggle();
        this._toggleItem = new PopupMenu.PopupMenuItem(
            this.isAllowed
                ? Constants.DashMenuLabels.NOTIFICATIONS_OFF
                : Constants.DashMenuLabels.NOTIFICATIONS_ON
        );
        this._toggleItem.connect('activate', () => {
            const enabled = !this.isAllowed;
            menu.close();
            this.setAllowed(enabled);
            this.sync();
        });
        menu.addMenuItem(this._toggleItem);
    }
    get isAllowed() {
        return (
            this.settings?.get_strv(
                Constants.SettingsKeys.NOTIFICATION_BADGE
            ) ?? []
        ).includes(this._appId);
    }

    setAllowed(enabled) {
        const settings = this.settings;
        if (!settings) return;

        const allowed =
            settings.get_strv(Constants.SettingsKeys.NOTIFICATION_BADGE) ?? [];
        settings.set_strv(Constants.SettingsKeys.NOTIFICATION_BADGE, [
            ...new Set(
                enabled
                    ? [...allowed, this._appId]
                    : allowed.filter(appId => appId !== this._appId)
            ),
        ]);
    }

    sync(state) {
        if (!this._label || !this._isUsable()) return;

        if (
            !isBadgeVisible(
                this.settings,
                this._appId,
                this._monitor.isDndActive()
            )
        ) {
            this._hide();
            Logger.debug(
                'DashBadge: {} hidden by list/switch/DND',
                this._appId
            );
            return;
        }

        const current = state ?? this._monitor.getState(this._appId) ?? {};
        const count = current.total ?? 0;
        Logger.debug(
            'DashBadge: {} total {} urgent {}',
            this._appId,
            count,
            Boolean(current.urgent)
        );
        if (count <= 0) {
            this._hide();
            return;
        }

        this._label.set_text(this._text(count));
        this._label.show();
        this._updateOverlay();
        if (current.urgent)
            this._container.add_style_class_name(URGENT_STYLE_CLASS);
        else this._container.remove_style_class_name(URGENT_STYLE_CLASS);
    }

    destroy() {
        this._destroyed = true;
        for (const [object, id] of this._connections) object?.disconnect?.(id);
        this._connections = [];
        this._removeToggle();
        this._label?.destroy();
        this._label = null;
        this._container = null;
        this._icon = null;
        this._owner = null;
        this._app = null;
        this._monitor = null;
    }

    get settings() {
        return this._owner?.settings ?? null;
    }

    _updateOverlay() {
        const iconSize =
            this._icon?.icon?.iconSize ?? Constants.DASH_BADGE_ICON_SIZE;
        const fontSize = Math.max(
            Constants.DASH_BADGE_MIN_FONT_SIZE,
            Math.round(iconSize * Constants.DASH_BADGE_FONT_RATIO)
        );
        const size = Math.round(fontSize * Constants.DASH_BADGE_HEIGHT_RATIO);
        this._label.set_style(`
            font-size: ${fontSize}px;
            min-width: ${size}px;
            height: ${size}px;
            border-radius: ${Math.round(size / 2)}px;
            margin: 0 0 0 auto;
        `);
        this._label.clutter_text.set({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label.queue_relayout();
    }

    _hide() {
        this._label?.hide();
        this._container?.remove_style_class_name(URGENT_STYLE_CLASS);
    }

    _text(count) {
        return count > Constants.DASH_BADGE_MAX_COUNT
            ? `${Constants.DASH_BADGE_MAX_COUNT}+`
            : `${count}`;
    }

    _affectsBadge(key) {
        return [
            Constants.SettingsKeys.NOTIFICATION_BADGE,
            Constants.SettingsKeys.NOTIFICATION_INDICATORS_ENABLED,
        ].includes(key);
    }

    _isUsable() {
        return !this._destroyed && Boolean(this._app && this._monitor);
    }

    _listen(object, signal, handler) {
        if (!object) return;
        this._connections.push([object, object.connect(signal, handler)]);
    }

    _removeToggle() {
        this._toggleItem?.destroy();
        this._toggleItem = null;
    }
}

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {DashIcon as ShellDashIcon} from '@girs/gnome-shell/ui/dash';
import * as Main from '@girs/gnome-shell/ui/main';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';

import * as Constants from '@/extension/constants.js';
import {WindowPreviewMenu} from '@/extension/components/dash/windowPreview.js';
import {DashBadge} from '@/extension/components/dash/dashBadge.js';

export class DashItem extends St.Bin {
    static {
        GObject.registerClass({GTypeName: 'SimpleBottomPanelDashItem'}, this);
    }

    constructor(width, indicatorCount = 0) {
        super({width});
        this.indicators = new St.BoxLayout({
            style_class: 'dash-window-dots',
            x_align: Clutter.ActorAlign.CENTER,
            y_expand: false,
        });
        for (let index = 0; index < indicatorCount; index++)
            this.indicators.add_child(
                new St.Widget({
                    style_class: 'dash-window-dot',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                })
            );
    }

    setButton(actor) {
        const content = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            y_expand: false,
        });
        content.add_child(actor);
        content.add_child(this.indicators);
        this.set_child(content);
    }
}

export class DashIcon extends ShellDashIcon {
    static {
        GObject.registerClass({GTypeName: 'SimpleBottomPanelDashIcon'}, this);
    }

    constructor(
        entry,
        owner,
        iconSize,
        notificationsMonitor = null,
        scaleFactor = 1
    ) {
        super(entry.item.app);
        this.entry = entry;
        this.item = entry.item;
        this.iconSize = iconSize;
        this._owner = owner;
        this.dragDrop = null;
        this.dragging = false;
        this.style_class = 'dash-app-button';
        this.accessible_name = entry.item.name;
        this.label_actor = null;
        this.icon.setIconSize(iconSize);
        const side = Math.round(iconSize * scaleFactor);
        this.set_size(side, side);
        this.x_align = Clutter.ActorAlign.CENTER;
        this.y_align = Clutter.ActorAlign.CENTER;
        this._windowPreview = null;
        this._closeAllItem = null;
        this._badge = notificationsMonitor
            ? new DashBadge(owner, this, this.app, notificationsMonitor)
            : null;
        this.connect('notify::hover', () => {
            if (this.hover) this._getWindowPreview().scheduleOpen();
            else this._windowPreview?.scheduleClose();
        });
        this.connect('key-press-event', (_icon, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Up)
                return Clutter.EVENT_PROPAGATE;
            const preview = this._getWindowPreview();
            preview.open();
            if (!preview.isOpen) return Clutter.EVENT_PROPAGATE;
            preview.actor.navigate_focus(
                null,
                St.DirectionType.TAB_FORWARD,
                false
            );
            return Clutter.EVENT_STOP;
        });

        const fixed = entry.hardcoded && entry.group === 'favorites';
        if (fixed && this.draggable.startGesture)
            this.draggable.startGesture.enabled = false;
        this.connect('notify::pressed', () => {
            if (!this.pressed) return;
            this._windowPreview?.close();
            this.dragDrop?.notePress(this);
            // Shell 45–48 starts DND with a pointer grab rather than a gesture.
            if (fixed) this.draggable.fakeRelease?.();
        });
        this.connect('menu-state-changed', (_icon, open) => {
            if (!this._owner || !this._menu) return;
            this._menu._enableFavorites = this._owner.canSetFavorite(this.app);
            this._menu._updateFavoriteItem();
            if (open) {
                this._syncCloseAllItem();
                this._badge?.syncMenu(this._menu);
            }
            this._owner.menuChanged(this._menu.actor, open);
        });
        this.connect('destroy', () => {
            this._windowPreview?.destroy();
            this._windowPreview = null;
            this._badge?.destroy();
            this._badge = null;
            if (this._menu) {
                this._owner?.menuChanged(this._menu.actor, false);
                this._menu.destroy();
                this._menu = null;
            }
            this._closeAllItem = null;
            this._owner = null;
        });
    }

    get draggable() {
        return this._draggable;
    }

    _getWindowPreview() {
        return (this._windowPreview ??= new WindowPreviewMenu(
            this,
            this._owner
        ));
    }

    // The app menu is built once by Shell and reused, so the item is created on
    // the first open and only its visibility follows the window count after.
    _syncCloseAllItem() {
        if (!this._closeAllItem) {
            this._closeAllItem = new PopupMenu.PopupMenuItem(
                Constants.DashMenuLabels.CLOSE_ALL
            );
            this._closeAllItem.connect('activate', () =>
                this._owner?.closeAllWindows(this.entry)
            );
            this._menu.addMenuItem(this._closeAllItem);
        }
        this._closeAllItem.visible =
            this._owner?.canCloseAllWindows(this.entry) ?? false;
    }

    activate(button) {
        if (this.dragging) return;
        this._windowPreview?.close();
        const modifiers = Clutter.get_current_event()?.get_state() ?? 0;
        const newWindow =
            button === Clutter.BUTTON_MIDDLE ||
            (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0;
        if (newWindow && this.app.can_open_new_window())
            this._owner.openNewWindow(this.app);
        else this._owner.activateEntry(this.entry);
        Main.overview.hide();
    }

    animateLaunch() {
        // Native New Window / desktop new-window actions call this before launch.
        this._owner.prepareLaunch(this.app);
        super.animateLaunch();
    }

    popupMenu() {
        this._windowPreview?.close();
        return super.popupMenu();
    }

    _updateRunningStyle() {
        // Counts are drawn outside the button from the monitor-scoped source.
        this._dot.hide();
    }

    getDragActor() {
        return this.app.create_icon_texture(this.iconSize);
    }
}

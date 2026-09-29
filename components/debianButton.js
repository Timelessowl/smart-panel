import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export class DebianButton {
    constructor(openStubControls) {
        const debianIcon = Gio.ThemedIcon.new_from_names([
            'distributor-logo-debian',
            'debian-swirl',
            'start-here-symbolic',
        ]);

        this.actor = new St.Button({
            style_class: 'panel-piece debian-button',
            accessible_name: 'Debian menu',
            child: new St.Icon({
                gicon: debianIcon,
                icon_size: 30,
            }),
        });

        this._menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.BOTTOM);
        this._menu.actor.add_style_class_name('debian-popup-menu');
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();

        const notificationItem = new PopupMenu.PopupMenuItem('Show notification');
        notificationItem.connect('activate', () => {
            Main.notify('Simple Bottom Panel', 'Hello from the Debian menu.');
        });
        this._menu.addMenuItem(notificationItem);

        const stubControlsItem = new PopupMenu.PopupMenuItem('Open stub controls');
        stubControlsItem.connect('activate', () => openStubControls());
        this._menu.addMenuItem(stubControlsItem);

        this._clickedId = this.actor.connect('clicked', () => this._menu.toggle());
    }

    destroy() {
        if (this._clickedId)
            this.actor.disconnect(this._clickedId);

        this._menu.destroy();
    }
}

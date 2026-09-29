import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {BaseSection} from './baseSection.js';

export class DebianButton extends BaseSection {
    constructor(openStubControls) {
        const debianIcon = Gio.ThemedIcon.new_from_names([
            'distributor-logo-debian',
            'debian-swirl',
            'start-here-symbolic',
        ]);

        const button = new St.Button({
            style_class: 'debian-button',
            accessible_name: 'Debian menu',
            child: new St.Icon({
                gicon: debianIcon,
                icon_size: 30,
            }),
        });
        super(button, {canExpand: false});
        this._button = button;

        this._menu = new PopupMenu.PopupMenu(this._button, 0.5, St.Side.BOTTOM);
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

        this._clickedId = this._button.connect(
            'clicked',
            () => this._menu.toggle()
        );
    }

    destroy() {
        if (this._clickedId)
            this._button.disconnect(this._clickedId);

        this._menu.destroy();
        this._button = null;
        super.destroy();
    }
}

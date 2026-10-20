import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from '@girs/gnome-shell/ui/main';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';

import {BaseSection} from '@/extension/components/baseSection.js';

export class DebianButton extends BaseSection {
    static {
        GObject.registerClass(this);
    }

    constructor(openPreferences) {
        super();

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
        this.setSectionContent(button);
        this._button = button;

        this._menu = new PopupMenu.PopupMenu(this._button, 0.5, St.Side.BOTTOM);
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menuManager.addMenu(this._menu);
        this._menu.actor.add_style_class_name('debian-popup-menu');
        Main.layoutManager.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();

        const launchers = [
            {
                iconName: 'avatar-default-symbolic',
                accessibleName: 'User',
                action: () => Main.notify(
                    'User',
                    'The user launcher will be connected here.'
                ),
            },
            {
                iconName: 'document-open-recent-symbolic',
                accessibleName: 'Recent items',
                action: () => Main.notify(
                    'Recent items',
                    'The recent-items launcher will be connected here.'
                ),
            },
            {
                iconName: 'preferences-system-symbolic',
                accessibleName: 'Settings',
                action: () => Main.notify(
                    'Settings',
                    'The settings launcher will be connected here.'
                ),
            },
            {
                iconName: 'system-shutdown-symbolic',
                accessibleName: 'Power',
                action: () => Main.notify(
                    'Power',
                    'The power launcher will be connected here.'
                ),
            },
        ];

        for (const launcher of launchers)
            this._addIconLauncher(launcher);

        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._addIconLauncher({
            iconName: 'view-app-grid-symbolic',
            accessibleName: 'Dash preferences',
            action: () => openPreferences(),
        });

        this._clickedId = this._button.connect(
            'clicked',
            () => this._menu.toggle()
        );
    }

    _addIconLauncher({iconName, accessibleName, action}) {
        const item = new PopupMenu.PopupBaseMenuItem();
        item.add_style_class_name('debian-menu-icon-item');
        item.accessible_name = accessibleName;
        item.add_child(new St.Icon({
            icon_name: iconName,
            icon_size: 20,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        }));
        item.connect('activate', action);
        this._menu.addMenuItem(item);
    }

    destroy() {
        if (this._clickedId)
            this._button.disconnect(this._clickedId);

        this._menu.destroy();
        this._button = null;
        super.destroy();
    }
}

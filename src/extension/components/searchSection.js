import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from '@girs/gnome-shell/ui/main';

import {BaseSection} from '@/extension/components/baseSection.js';

export class SearchSection extends BaseSection {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();

        const content = new St.BoxLayout({
            style_class: 'search-section',
        });
        this.setSectionContent(content);

        content.add_child(new St.Icon({
            icon_name: 'system-search-symbolic',
            icon_size: 20,
            style_class: 'search-icon',
        }));

        this.entry = new St.Entry({
            style_class: 'search-entry',
            hint_text: 'Search apps…',
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        content.add_child(this.entry);

        this._layoutButton = new St.Button({
            label: 'EN',
            style_class: 'search-layout-button',
            accessible_name: 'English keyboard layout',
            x_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._layoutClickedId = this._layoutButton.connect('clicked', () => {
            Main.notify('Keyboard layout', 'English (EN)');
        });
        content.add_child(this._layoutButton);
    }

    destroy() {
        this._layoutButton.disconnect(this._layoutClickedId);
        super.destroy();
    }
}

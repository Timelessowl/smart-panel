import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {
    INDICATOR_ICON_SIZE,
    INDICATOR_ITEM_SIZE,
    INDICATOR_ITEM_SPACING,
    INDICATOR_MIN_WIDTH,
    INDICATOR_WIDTH_STEP,
} from '../constant.js';

export class IndicatorSection {
    constructor(indicators = []) {
        this._indicators = [];
        this._menus = [];

        this.actor = new St.Widget({
            style_class: 'panel-piece indicator-section',
            accessible_name: 'Indicator area',
            layout_manager: new Clutter.BinLayout(),
        });
        this._indicatorBox = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: `spacing: ${INDICATOR_ITEM_SPACING}px;`,
        });
        this.actor.add_child(this._indicatorBox);

        this.setIndicators(indicators);
    }

    get hasIndicators() {
        return this._indicators.length > 0;
    }

    get preferredWidth() {
        if (!this.hasIndicators)
            return 0;

        return INDICATOR_MIN_WIDTH +
            (this._indicators.length - 1) * INDICATOR_WIDTH_STEP;
    }

    setIndicators(indicators) {
        this._clearIndicators();
        this._indicators = [...indicators];

        for (const indicator of this._indicators)
            this._addIndicator(indicator);

        this.actor.visible = this.hasIndicators;
    }

    _addIndicator({iconName, name, menuItems = []}) {
        const button = new St.Button({
            style_class: 'indicator-button',
            accessible_name: name,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                icon_name: iconName,
                icon_size: INDICATOR_ICON_SIZE,
            }),
        });
        button.set_size(INDICATOR_ITEM_SIZE, INDICATOR_ITEM_SIZE);

        const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.BOTTOM);
        Main.uiGroup.add_child(menu.actor);
        menu.actor.hide();

        for (const {label, action} of menuItems) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', action);
            menu.addMenuItem(item);
        }

        button.connect('clicked', () => menu.toggle());
        this._indicatorBox.add_child(button);
        this._menus.push(menu);
    }

    _clearIndicators() {
        for (const menu of this._menus)
            menu.destroy();

        this._menus = [];
        this._indicatorBox.destroy_all_children();
    }

    destroy() {
        this._clearIndicators();
        this._indicators = [];
    }
}

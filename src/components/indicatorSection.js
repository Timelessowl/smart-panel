import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from '@girs/gnome-shell/ui/main';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';

import * as Constants from '@/constant.js';
import {BaseSection} from '@/components/baseSection.js';

export class IndicatorSection extends BaseSection {
    static {
        GObject.registerClass(this);
    }

    constructor(indicators = [], scaleFactor = 1) {
        super();
        this.canExpand = true;

        const content = new St.Widget({
            style_class: 'indicator-section',
            accessible_name: 'Indicator area',
            layout_manager: new Clutter.BinLayout(),
        });
        this.setSectionContent(content);

        this._indicators = [];
        this._menus = [];
        this._scaleFactor = scaleFactor;
        this.hasIndicators = false;
        this.preferredWidth = 0;

        this._indicatorBox = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: `spacing: ${Constants.INDICATOR_ITEM_SPACING}px;`,
        });
        content.add_child(this._indicatorBox);

        this.setIndicators(indicators);
    }

    setIndicators(indicators) {
        this._clearIndicators();
        this._indicators = [...indicators];

        this.hasIndicators = this._indicators.length > 0;
        this.preferredWidth = this.hasIndicators
            ? Constants.INDICATOR_MIN_WIDTH +
                (this._indicators.length - 1) * Constants.INDICATOR_WIDTH_STEP
            : 0;

        for (const indicator of this._indicators)
            this._addIndicator(indicator);

        this.visible = this.hasIndicators;
    }

    _addIndicator({iconName, name, menuItems = []}) {
        const button = new St.Button({
            style_class: 'indicator-button',
            accessible_name: name,
            y_align: Clutter.ActorAlign.CENTER,
            child: new St.Icon({
                icon_name: iconName,
                icon_size: Constants.INDICATOR_ICON_SIZE,
            }),
        });
        const itemSize = Math.round(Constants.INDICATOR_ITEM_SIZE * this._scaleFactor);
        button.set_size(itemSize, itemSize);

        const menu = new PopupMenu.PopupMenu(button, 0.5, St.Side.BOTTOM);
        Main.layoutManager.uiGroup.add_child(menu.actor);
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
        this.hasIndicators = false;
        this.preferredWidth = 0;
        this._scaleFactor = 1;
        super.destroy();
    }
}

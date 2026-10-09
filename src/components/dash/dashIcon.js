import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {Button as PanelMenuButton} from '@girs/gnome-shell/ui/panelMenu';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';

// Fill the icon canvas with the reference's nine colored, rounded tiles.
export class DashLaunchpadIcon extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    constructor(iconSize, scaleFactor = 1) {
        const side = Math.round(iconSize * scaleFactor);
        const spacing = Math.round(2 * scaleFactor);
        const grid = new Clutter.GridLayout({column_homogeneous: true, row_homogeneous: true,
            column_spacing: spacing, row_spacing: spacing});
        super({layout_manager: grid, width: side, height: side});
        for (let index = 0; index < 9; index++) {
            const tile = new St.Widget({style_class: `dash-launchpad-tile dash-launchpad-tile-${index}`,
                x_expand: true, y_expand: true,
                x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL});
            grid.attach(tile, index % 3, Math.floor(index / 3), 1, 1);
        }
    }
}

// All dash buttons reserve the same indicator row, including Launchpad and +N.
export class DashItem extends St.Bin {
    static {
        GObject.registerClass(this);
    }

    constructor(width, height) {
        super({width, height});
        this.indicators = new St.BoxLayout({style_class: 'dash-window-dots',
            x_align: Clutter.ActorAlign.CENTER});
    }

    setButton(actor) {
        const content = new St.BoxLayout({vertical: true,
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        content.add_child(actor);
        content.add_child(this.indicators);
        this.set_child(content);
    }
}

// The icon button handles input and menus; its indicators remain separate.
export class DashIcon extends DashItem {
    /** @type {ReturnType<typeof import('@girs/gnome-shell/ui/dnd').makeDraggable>} */
    draggable;
    static {
        GObject.registerClass(this);
    }

    constructor(entry, owner, iconSize, width, height, scaleFactor = 1) {
        super(width, height);
        this.entry = entry;
        this.item = entry.item;
        this.iconSize = iconSize;
        this.dragDrop = null;
        this.dragging = false;
        this.button = new DashIconButton(this, owner, Math.round(iconSize * scaleFactor));
        for (let index = 0; index < entry.indicatorCount; index++)
            this.indicators.add_child(new St.Widget({style_class: 'dash-window-dot'}));
        this.setButton(this.button.container);
    }

    setDragging(dragging) {
        this.dragging = dragging;
        if (dragging) {
            this.button.menu.close();
            this.button.cancelClick();
        }
    }

    getDragActor() {
        return this.item.app.create_icon_texture(this.iconSize);
    }

    getDragActorSource() {
        return this.button.icon;
    }
}

class DashIconButton extends PanelMenuButton {
    static {
        GObject.registerClass(this);
    }

    constructor(dashIcon, owner, side) {
        super(0.5, dashIcon.item.name, true);
        this._dashIcon = dashIcon;
        this._owner = owner;
        this.add_style_class_name('dash-app-button');
        this.layout_manager = new Clutter.BinLayout();
        this.set_size(side, side);
        this.container.set_size(side, side);
        this.container.x_align = Clutter.ActorAlign.CENTER;
        this.container.y_align = Clutter.ActorAlign.CENTER;
        this.icon = dashIcon.item.app.create_icon_texture(dashIcon.iconSize);
        this.add_child(this.icon);
        const menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.BOTTOM);
        this.setMenu(menu);
        // DND starts on the button but uses the containing DashIcon as its source.
        this._delegate = dashIcon;
        menu.connect('open-state-changed', (_menu, open) =>
            this._owner?.menuChanged(menu.actor, open));
        // Shell 49 uses cooperating gestures; older Shells require DND's
        // addClickAction() bridge so a captured press can become a drag.
        const ClickGesture = /** @type {typeof Clutter & {
            ClickGesture?: new (params: {required_button: number}) => Clutter.Action
        }} */ (Clutter).ClickGesture;
        this._clickAction = null;
        if (ClickGesture) {
            const gesture = new ClickGesture({required_button: 1});
            gesture.connect('should-handle-sequence', (_gesture, event) => {
                if (event.type() === Clutter.EventType.TOUCH_BEGIN ||
                    (event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === 1))
                    this._dashIcon.dragDrop?.notePress(this._dashIcon);
                return true;
            });
            gesture.connect('recognize', () => {
                if (!this._dashIcon.dragging)
                    this._owner.activateEntry(this._dashIcon.entry);
            });
            this.add_action(gesture);
        } else {
            this._clickAction = new Clutter.ClickAction();
            this._clickAction.connect('long-press', (_action, _actor, state) => {
                if (state === Clutter.LongPressState.QUERY)
                    this._dashIcon.dragDrop?.notePress(this._dashIcon);
                return true;
            });
            this._clickAction.connect('clicked', action => {
                if (!this._dashIcon.dragging && action.get_button() <= 1)
                    this._owner.activateEntry(this._dashIcon.entry);
            });
            this.add_action(this._clickAction);
        }
        this._populateMenu();
        this.connect('destroy', () => { this._owner = null; });
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === 3) {
            this._toggleMenu();
            return Clutter.EVENT_STOP;
        }
        if (event.type() === Clutter.EventType.KEY_PRESS) {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Menu) {
                this._toggleMenu();
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Return || key === Clutter.KEY_space) {
                if (!this._dashIcon.dragging)
                    this._owner.activateEntry(this._dashIcon.entry);
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Up)
                this._populateMenu();
        }
        // Do not let PanelMenu's default event handler open a menu on left press.
        // Normal popup navigation and click handling receive the remaining events.
        return Clutter.EVENT_PROPAGATE;
    }

    attachClickAction(draggable) {
        if (this._clickAction) {
            const nativeDrag = /** @type {typeof draggable & {
                addClickAction(action: Clutter.ClickAction): void
            }} */ (draggable);
            this.remove_action(this._clickAction);
            nativeDrag.addClickAction(this._clickAction);
        }
    }

    cancelClick() {
        this._clickAction?.release();
    }

    _toggleMenu() {
        this._populateMenu();
        this.cancelClick();
        this._dashIcon.draggable?.fakeRelease?.();
        this.menu.toggle();
    }

    _populateMenu() {
        const menu = /** @type {PopupMenu.PopupMenu} */ (this.menu);
        menu.removeAll();
        const app = this._dashIcon.item.app;
        const info = app.get_app_info();
        const desktopActions = info?.list_actions() ?? [];
        if (app.can_open_new_window() && !desktopActions.includes('new-window'))
            menu.addAction('New Window', () => this._owner.openNewWindow(app));
        for (const action of desktopActions)
            menu.addAction(info.get_action_name(action), () => this._owner.launchAction(app, action));
        if (this._dashIcon.entry.representedWindow) {
            menu.addAction('Close Window', () =>
                this._dashIcon.entry.representedWindow.delete(global.get_current_time()));
        }
        if (this._owner.canSetFavorite(app)) {
            const favorite = this._owner.isFavorite(app.get_id());
            menu.addAction(favorite ? 'Remove from Favorites' : 'Add to Favorites', () =>
                this._owner.setFavorite(app, !favorite));
        }
        if (!menu.numMenuItems)
            menu.addAction('Open', () => this._owner.activateEntry(this._dashIcon.entry));
    }
}

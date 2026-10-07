import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {Button as PanelMenuButton} from '@girs/gnome-shell/ui/panelMenu';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';

// Indicators are an overlay, not part of the icon's size request. Allocate them
// relative to the actual icon texture, regardless of the button's row height.
export class DashButtonContent extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    constructor(icon, dots = null) {
        super({x_expand: true, y_expand: true,
            x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL});
        this._icon = icon;
        this._dots = dots;
        this._highlight = new St.Widget({style_class: 'dash-hover-highlight'});
        this.add_child(this._highlight);
        this.add_child(icon);
        if (dots)
            this.add_child(dots);
    }

    vfunc_get_preferred_width(forHeight) {
        return this._icon.get_preferred_width(forHeight);
    }

    vfunc_get_preferred_height(forWidth) {
        return this._icon.get_preferred_height(forWidth);
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        const width = box.get_width();
        const height = box.get_height();
        const side = Math.min(width, height);
        const highlightBox = new Clutter.ActorBox();
        highlightBox.x1 = Math.floor((width - side) / 2);
        highlightBox.y1 = Math.floor((height - side) / 2);
        highlightBox.x2 = highlightBox.x1 + side;
        highlightBox.y2 = highlightBox.y1 + side;
        this._highlight.allocate(highlightBox);
        const [, iconWidth] = this._icon.get_preferred_width(-1);
        const [, iconHeight] = this._icon.get_preferred_height(iconWidth);
        const iconBox = new Clutter.ActorBox();
        iconBox.x1 = Math.floor((width - iconWidth) / 2);
        iconBox.y1 = Math.floor((height - iconHeight) / 2);
        iconBox.x2 = iconBox.x1 + iconWidth;
        iconBox.y2 = iconBox.y1 + iconHeight;
        this._icon.allocate(iconBox);

        if (this._dots) {
            const [, dotsWidth] = this._dots.get_preferred_width(-1);
            const [, dotsHeight] = this._dots.get_preferred_height(dotsWidth);
            const dotsBox = new Clutter.ActorBox();
            dotsBox.x1 = Math.round((iconBox.x1 + iconBox.x2 - dotsWidth) / 2);
            dotsBox.x2 = dotsBox.x1 + dotsWidth;
            dotsBox.y1 = iconBox.y2;
            dotsBox.y2 = dotsBox.y1 + dotsHeight;
            this._dots.allocate(dotsBox);
        }
    }
}

export class DashIcon extends PanelMenuButton {
    /** @type {ReturnType<typeof import('@girs/gnome-shell/ui/dnd').makeDraggable>} */
    _draggable;
    static {
        GObject.registerClass(this);
    }

    constructor(entry, owner, iconSize, width, height) {
        // PanelMenu owns the menu actor, accessibility, hide and destroy paths.
        // Use its standard container when inserting this button into a dash row.
        super(0.5, entry.item.name, true);
        this.add_style_class_name('dash-app-button');
        this.set_size(width, height);
        this.container.set_size(width, height);
        this.entry = entry;
        this.item = entry.item;
        this.iconSize = iconSize;
        this._owner = owner;
        this._dragging = false;
        this.dragDrop = null;
        const menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.BOTTOM);
        this.setMenu(menu);
        menu.connect('open-state-changed', (_menu, open) =>
            this._owner?.menuChanged(menu.actor, open));

        this._icon = this.item.app.create_icon_texture(iconSize);
        let dots = null;
        if (entry.indicatorCount) {
            dots = new St.BoxLayout({style_class: 'dash-window-dots'});
            for (let index = 0; index < entry.indicatorCount; index++)
                dots.add_child(new St.Widget({style_class: 'dash-window-dot'}));
        }
        this.add_child(new DashButtonContent(this._icon, dots));
        this._clickAction = new Clutter.ClickAction();
        this._clickAction.connect('clicked', action => {
            // ClickAction also handles touch; a drag cancels it before release.
            if (!this._dragging && action.get_button() <= 1)
                this._owner.activateEntry(this.entry);
        });
        this.add_action(this._clickAction);
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
                if (!this._dragging)
                    this._owner.activateEntry(this.entry);
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Up)
                this._populateMenu();
        }
        // Do not let PanelMenu's default event handler open a menu on left press.
        // Normal popup navigation and ClickAction receive the remaining events.
        return Clutter.EVENT_PROPAGATE;
    }

    getDragActor() {
        return this.item.app.create_icon_texture(this.iconSize);
    }

    getDragActorSource() {
        return this._icon;
    }

    handleDragOver(source, _actor, x) {
        return this.dragDrop.dragOver(source, this.entry, x > this.width / 2, this);
    }

    acceptDrop(source, _actor, x) {
        return this.dragDrop.drop(source, this.entry, x > this.width / 2);
    }

    _toggleMenu() {
        this._populateMenu();
        this._clickAction.release();
        this._draggable?.fakeRelease();
        this.menu.toggle();
    }

    _populateMenu() {
        const menu = /** @type {PopupMenu.PopupMenu} */ (this.menu);
        menu.removeAll();
        const app = this.item.app;
        const info = app.get_app_info();
        const desktopActions = info?.list_actions() ?? [];
        if (app.can_open_new_window() && !desktopActions.includes('new-window'))
            menu.addAction('New Window', () => this._owner.openNewWindow(app));
        for (const action of desktopActions)
            menu.addAction(info.get_action_name(action), () => this._owner.launchAction(app, action));
        if (this.entry.representedWindow) {
            menu.addAction('Close Window', () =>
                this.entry.representedWindow.delete(global.get_current_time()));
        }
        if (!this.entry.hardcoded && this._owner.canSetFavorite(app)) {
            const favorite = this._owner.isFavorite(app.get_id());
            menu.addAction(favorite ? 'Remove from Favorites' : 'Add to Favorites', () =>
                this._owner.setFavorite(app, !favorite));
        }
        if (!menu.numMenuItems)
            menu.addAction('Open', () => this._owner.activateEntry(this.entry));
    }
}

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Indicators are an overlay, not part of the icon's size request. Allocate them
// relative to the actual icon texture, regardless of the button's row height.
class DashIconContent extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    constructor(icon, dots) {
        super({x_expand: true, y_expand: true,
            x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL});
        this._icon = icon;
        this._dots = dots;
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
            dotsBox.x1 = Math.floor((width - dotsWidth) / 2);
            dotsBox.x2 = dotsBox.x1 + dotsWidth;
            dotsBox.y1 = iconBox.y2;
            dotsBox.y2 = dotsBox.y1 + dotsHeight;
            this._dots.allocate(dotsBox);
        }
    }
}

export class DashIcon extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(entry, owner, iconSize, width, height) {
        super({style_class: 'dash-app-button', can_focus: true,
            accessible_name: entry.item.name, width, height, button_mask: St.ButtonMask.ONE});
        this.entry = entry;
        this.item = entry.item;
        this.iconSize = iconSize;
        this._owner = owner;
        this._delegate = this;
        this._dragging = false;
        this._menu = null;

        this._icon = this.item.createIcon(iconSize);
        let dots = null;
        if (entry.indicatorCount) {
            dots = new St.BoxLayout({style_class: 'dash-window-dots'});
            for (let index = 0; index < entry.indicatorCount; index++)
                dots.add_child(new St.Widget({style_class: 'dash-window-dot'}));
        }
        this.set_child(new DashIconContent(this._icon, dots));
        this.connect('clicked', () => {
            if (!this._dragging)
                owner.activateEntry(this.entry);
        });
        this.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== 3)
                return Clutter.EVENT_PROPAGATE;
            this._openMenu();
            return Clutter.EVENT_STOP;
        });
        this.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Menu) {
                this._openMenu();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        if (!(entry.hardcoded && entry.group === 'favorites')) {
            this._draggable = DND.makeDraggable(this, {restoreOnSuccess: false});
            this._draggable.connect('drag-begin', () => {
                this._dragging = true;
                owner.dragStarted();
            });
            this._draggable.connect('drag-end', () => {
                if (this._dragging) {
                    this._dragging = false;
                    owner.dragEnded();
                }
            });
        }
        // Also runs for native parent destruction, not only explicit JS destroy().
        this.connect('destroy', () => {
            this._menu?.destroy();
            this._menu = null;
            if (this._dragging) {
                this._dragging = false;
                owner.dragEnded();
            }
            this._owner = null;
        });
    }

    getDragActor() {
        return this.item.createIcon(this.iconSize);
    }

    getDragActorSource() {
        return this._icon;
    }

    handleDragOver(source, _actor, x) {
        return this._owner.dragOver(source, this.entry, x > this.width / 2, this);
    }

    acceptDrop(source, _actor, x) {
        return this._owner.drop(source, this.entry, x > this.width / 2);
    }

    _openMenu() {
        if (!this._menu) {
            this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.BOTTOM);
            Main.layoutManager.uiGroup.add_child(this._menu.actor);
            this._menu.actor.hide();
            this._menuManager = new PopupMenu.PopupMenuManager(this);
            this._menuManager.addMenu(this._menu);
            this._menu.connect('open-state-changed', (_menu, open) =>
                this._owner?.menuChanged(this._menu.actor, open));
        }
        this._menu.removeAll();
        const app = this.item.app;
        const appInfo = this.item.appInfo;
        const actions = appInfo?.list_actions() ?? [];
        if (app.can_open_new_window() && !actions.includes('new-window')) {
            this._menu.addAction('New Window', () => {
                app.open_new_window(-1);
                this._owner?.closeExpanded();
            });
        }
        for (const action of actions) {
            this._menu.addAction(appInfo.get_action_name(action), () => {
                app.launch_action(action, global.get_current_time(), -1);
                this._owner?.closeExpanded();
            });
        }
        if (this.entry.representedWindow) {
            const window = this.entry.representedWindow.window;
            this._menu.addAction('Close Window', () => window.delete(global.get_current_time()));
        }
        if (!this.entry.hardcoded && !app.is_window_backed() &&
            global.settings.is_writable('favorite-apps')) {
            const favorite = this._owner.isFavorite(this.item.appId);
            this._menu.addAction(favorite ? 'Remove from Favorites' : 'Add to Favorites',
                () => this._owner.setFavorite(this.item, !favorite));
        }
        // Transient/window-backed apps may have no desktop-file actions at all.
        if (!this._menu.length)
            this._menu.addAction('Open', () => this._owner.activateEntry(this.entry));
        this._draggable?.fakeRelease();
        this._menu.open();
    }
}

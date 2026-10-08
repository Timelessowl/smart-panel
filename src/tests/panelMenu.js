import {SignalObject} from '@/tests/gjsHarness.js';

// Model the Shell contracts that matter here: a PanelMenu button owns its
// container/menu, while a shared PopupMenuManager owns menu switching.
export function createDoubles(Actor) {
    const uiGroup = new Set();
    class PopupMenu extends SignalObject {
        constructor(source, alignment, side) {
            super();
            Object.assign(this, {sourceActor: source, alignment, side, isOpen: false});
            this.actor = new Actor();
            this.items = [];
        }
        get numMenuItems() { return this.items.length; }
        removeAll() { this.items = []; }
        addAction(label, callback) {
            const item = {label: {text: label}, activate: () => { callback(); this.close(); }};
            this.items.push(item);
            return item;
        }
        toggle() { if (this.isOpen) this.close(); else this.open(); }
        open() {
            if (!this.isOpen && this.numMenuItems) {
                this.isOpen = true;
                this.emit('open-state-changed', true);
            }
        }
        close() {
            if (this.isOpen) {
                this.isOpen = false;
                this.emit('open-state-changed', false);
            }
        }
        destroy() {
            this.close();
            this.destroyed = true;
            uiGroup.delete(this.actor);
            this.actor.destroy?.();
            this.emit('destroy');
        }
    }
    class Button extends Actor {
        constructor(alignment, name, dontCreateMenu) {
            super({accessible_name: name, reactive: true, track_hover: true});
            this._delegate = this;
            this.container = new Actor();
            this.container.set_child(this);
            if (!dontCreateMenu)
                this.setMenu(new PopupMenu(this, alignment, 0));
            else {
                this.menu = {destroy() {}};
                this._delegate = this.menu;
            }
            this.connect('destroy', () => {
                this.menu?.destroy();
                this.container.set_child(null);
                this.container.destroy?.();
            });
        }
        setMenu(menu) {
            this.menu?.destroy();
            this.menu = menu;
            uiGroup.add(menu.actor);
        }
        vfunc_hide() { this.visible = false; this.menu.close(); }
    }
    class PopupMenuManager {
        constructor() { this.menus = new Set(); }
        addMenu(menu) {
            this.menus.add(menu);
            menu.connect('open-state-changed', (_menu, open) => {
                if (open) {
                    for (const other of this.menus)
                        if (other !== menu) other.close();
                }
            });
            menu.connect('destroy', () => this.menus.delete(menu));
        }
    }
    class ClickAction extends SignalObject {
        get_button() { return this.button ?? 1; }
        release() { this.released = true; }
    }
    return {PanelMenu: {Button}, PopupMenu: {PopupMenu, PopupMenuManager}, ClickAction, uiGroup};
}

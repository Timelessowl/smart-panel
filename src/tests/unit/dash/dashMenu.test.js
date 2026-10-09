import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';
import * as PanelMenuDoubles from '@/tests/panelMenu.js';

async function fixture({desktopActions = [], canOpen = true, pinnable = true,
    favorite = false, hardcoded = false, representedWindow = null} = {}) {
    class Actor extends SignalObject {
        constructor(props = {}) { super(); Object.assign(this, props); this.children = []; }
        add_child(child) { this.children.push(child); }
        set_child(child) { this.child = child; this.children = child ? [child] : []; }
        set_size(width, height) { Object.assign(this, {width, height}); }
        add_action(action) { this.action = action; }
        add_style_class_name() {}
        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.emit('destroy');
            for (const child of this.children) child.destroy();
        }
    }
    const native = PanelMenuDoubles.createDoubles(Actor);
    const Clutter = {BinLayout: class {}, ActorAlign: {FILL: 0, CENTER: 1}, ClickAction: native.ClickAction,
        EventType: {BUTTON_PRESS: 1, KEY_PRESS: 2, TOUCH_BEGIN: 3},
        KEY_Menu: 10, KEY_Return: 11, KEY_space: 12, KEY_Up: 13,
        EVENT_STOP: true, EVENT_PROPAGATE: false};
    const calls = [];
    const menuStates = [];
    const app = {create_icon_texture: () => new Actor(), get_id: () => 'app', can_open_new_window: () => canOpen,
        get_app_info: () => ({list_actions: () => desktopActions,
            get_action_name: action => `Desktop ${action}`})};
    const entry = {item: {app, name: 'App'}, hardcoded, representedWindow, indicatorCount: 0};
    const owner = {menuChanged: (_actor, open) => menuStates.push(open), canSetFavorite: () => pinnable && !hardcoded, isFavorite: () => favorite,
        openNewWindow: app => calls.push(['window', app]),
        launchAction: (app, action) => calls.push(['action', app, action]),
        setFavorite: (app, favorite) => calls.push(['favorite', app, favorite]),
        activateEntry: entry => calls.push(['activate', entry])};
    const {DashIcon} = await GjsHarness.loadGjsModule(
        new URL('components/dash/dashIcon.js', GjsHarness.sourceDirectory), {
            'gi://Clutter': {default: Clutter},
            'gi://GObject': {default: {registerClass: cls => cls}},
            'gi://St': {default: {Widget: Actor, Bin: Actor, BoxLayout: Actor, Side: {BOTTOM: 1}}},
            'resource:///org/gnome/shell/ui/panelMenu.js': native.PanelMenu,
            'resource:///org/gnome/shell/ui/popupMenu.js': native.PopupMenu,
        },
        {global: {get_current_time: () => 123}});
    const icon = new DashIcon(entry, owner, 40, 48, 62);
    return {app, entry, owner, calls, icon, native, Clutter, menuStates, actions: icon.button.menu.items};
}

describe('Dash native panel menus', () => {
    it('routes new-window and desktop actions through the owner monitor scope', async () => {
        const f = await fixture({desktopActions: ['preferences']});
        expect(Array.from(f.actions, action => action.label.text)).toEqual([
            'New Window', 'Desktop preferences', 'Add to Favorites']);
        f.actions[0].activate(); f.actions[1].activate(); f.actions[2].activate();
        expect(f.calls).toEqual([['window', f.app], ['action', f.app, 'preferences'],
            ['favorite', f.app, true]]);
    });

    it('does not duplicate a desktop new-window action and closes the exact represented window', async () => {
        const deleted = [];
        const f = await fixture({desktopActions: ['new-window'], favorite: true,
            representedWindow: {delete: time => deleted.push(time)}});
        expect(Array.from(f.actions, action => action.label.text)).toEqual([
            'Desktop new-window', 'Close Window', 'Remove from Favorites']);
        f.actions[1].activate(); f.actions[2].activate();
        expect(deleted).toEqual([123]);
        expect(f.calls).toEqual([['favorite', f.app, false]]);
    });

    it('omits forbidden favorite controls and provides an activation fallback for actionless apps', async () => {
        for (const options of [{hardcoded: true}, {pinnable: false}]) {
            const f = await fixture({...options, canOpen: false});
            expect(Array.from(f.actions, action => action.label.text)).toEqual(['Open']);
            f.actions[0].activate();
            expect(f.calls).toEqual([['activate', f.entry]]);
        }
    });

    it('keeps the icon button derived from PanelMenu and uses its ordinary bottom-facing popup', async () => {
        const f = await fixture();
        expect(f.icon.button instanceof f.native.PanelMenu.Button).toBe(true);
        expect(f.icon.button.menu instanceof f.native.PopupMenu.PopupMenu).toBe(true);
        expect(f.icon.button.container.child).toBe(f.icon.button);
        expect(f.icon.button._delegate).toBe(f.icon);
        expect(f.icon.button.menu.side).toBe(1);
        expect(f.native.uiGroup.has(f.icon.button.menu.actor)).toBe(true);
        const event = button => ({type: () => f.Clutter.EventType.BUTTON_PRESS, get_button: () => button});
        expect(f.icon.button.vfunc_event(event(1))).toBe(f.Clutter.EVENT_PROPAGATE);
        expect(f.icon.button.menu.isOpen).toBe(false);
        f.icon.button._clickAction.emit('clicked');
        expect(f.calls).toEqual([['activate', f.entry]]);
        expect(f.icon.button.vfunc_event(event(3))).toBe(f.Clutter.EVENT_STOP);
        expect(f.icon.button.menu.isOpen).toBe(true);
        f.icon.button.vfunc_event(event(3));
        expect(f.icon.button.menu.isOpen).toBe(false);
    });

    it('keeps keyboard app activation separate from the Menu key and suppresses drag clicks', async () => {
        const f = await fixture();
        const key = value => ({type: () => f.Clutter.EventType.KEY_PRESS, get_key_symbol: () => value});
        for (const value of [f.Clutter.KEY_Return, f.Clutter.KEY_space]) {
            expect(f.icon.button.vfunc_event(key(value))).toBe(f.Clutter.EVENT_STOP);
            expect(f.icon.button.menu.isOpen).toBe(false);
        }
        expect(f.calls.length).toBe(2);
        f.icon.setDragging(true);
        f.icon.button._clickAction.emit('clicked');
        f.icon.button.vfunc_event(key(f.Clutter.KEY_Return));
        expect(f.calls.length).toBe(2);
        f.icon.setDragging(false);
        f.icon.button.vfunc_event(key(f.Clutter.KEY_Menu));
        expect(f.icon.button.menu.isOpen).toBe(true);
    });

    it('uses native hide/destroy cleanup and a shared manager closes the previous menu', async () => {
        const f = await fixture();
        const other = new f.native.PopupMenu.PopupMenu(f.icon, 0.5, 1);
        other.addAction('Other', () => {});
        const manager = new f.native.PopupMenu.PopupMenuManager();
        manager.addMenu(f.icon.button.menu); manager.addMenu(other);
        f.icon.button.menu.open(); other.open();
        expect(f.icon.button.menu.isOpen).toBe(false);
        f.icon.button.menu.open();
        expect(other.isOpen).toBe(false);
        f.icon.button.vfunc_hide();
        expect(f.icon.button.menu.isOpen).toBe(false);
        f.icon.button.menu.open();
        f.icon.destroy();
        expect(f.icon.button.menu.destroyed).toBe(true);
        expect(f.native.uiGroup.size).toBe(0);
        expect(manager.menus.has(f.icon.button.menu)).toBe(false);
        expect(f.icon.button.container.destroyed).toBe(true);
        expect(f.menuStates).toEqual([true, false, true, false, true, false]);
    });

    it('rebuilds favorite controls from current state when the native menu is opened', async () => {
        const f = await fixture();
        f.owner.isFavorite = () => true;
        f.icon.button._toggleMenu();
        expect(f.icon.button.menu.items.at(-1).label.text).toBe('Remove from Favorites');
        f.icon.button.menu.items.at(-1).activate();
        expect(f.calls).toEqual([['favorite', f.app, false]]);
        f.owner.canSetFavorite = () => false;
        f.icon.button._toggleMenu();
        expect(f.icon.button.menu.items.map(item => item.label.text)).toEqual(['New Window']);
    });

});

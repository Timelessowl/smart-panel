import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';

async function fixture({count = 65, scale = 1, monitor = {x: -1920, y: 100, width: 1920, height: 1080}} = {}) {
    let focus = null;
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, {children: [], visible: true, opacity: 255, x: 0, y: 0}, props);
            this.pseudoClasses = new Set();
            if (props.child) this.add_child(props.child);
        }
        add_child(actor) {
            actor.parent = this;
            this.children.push(actor);
        }
        remove_child(actor) {
            this.children.splice(this.children.indexOf(actor), 1);
            actor.parent = null;
        }
        insert_child_at_index(actor, index) {
            actor.parent = this;
            this.children.splice(index, 0, actor);
        }
        set_child_at_index(actor, index) {
            this.children.splice(this.children.indexOf(actor), 1);
            this.children.splice(index, 0, actor);
        }
        get_parent() {
            return this.parent;
        }
        get_children() {
            return [...this.children];
        }
        set_child(actor) {
            this.add_child(actor);
        }
        contains(actor) {
            return this === actor || this.children.some((child) => child.contains(actor));
        }
        set_position(x, y) {
            Object.assign(this, {x, y});
        }
        set_size(width, height) {
            Object.assign(this, {width, height});
        }
        show() {
            this.visible = true;
        }
        hide() {
            this.visible = false;
        }
        grab_key_focus() {
            focus = this;
        }
        add_style_class_name() {}
        add_style_pseudo_class(name) {
            this.pseudoClasses.add(name);
        }
        remove_style_pseudo_class(name) {
            this.pseudoClasses.delete(name);
        }
        destroy_all_children() {
            this.get_children().forEach((actor) => actor.destroy());
        }
        destroy() {
            this.emit('destroy');
            this.destroy_all_children();
            this.parent?.remove_child(this);
            this.destroyed = true;
        }
    }
    const overview = Object.assign(new SignalObject(), {hide: jasmine.createSpy('hideOverview')});
    const nativeActivations = [];
    class NativeIcon extends Actor {
        constructor(app, params) {
            super();
            this.app = app;
            this.params = params;
            this.icon = {
                setIconSize: (size) => {
                    this.iconSize = size;
                },
            };
        }
        activate(button) {
            nativeActivations.push({app: this.app, button});
            overview.hide();
        }
        popupMenu() {
            if (!this._menu)
                this._menu = Object.assign(new SignalObject(), {
                    _toggleFavoriteItem: {},
                    _quitItem: {},
                    isOpen: false,
                    close() {
                        this.isOpen = false;
                    },
                    destroy() {
                        this.destroyed = true;
                    },
                });
            this._menu.isOpen = true;
            this.emit('menu-state-changed', true);
        }
    }
    const grabs = [],
        chrome = new Set(),
        themed = new Set(),
        groups = new Set();
    let failGrab = false;
    class GrabHelper {
        constructor(owner) {
            owner.connect('captured-event', (_actor, event) => {
                if (event.get_key_symbol?.() === 'Escape' || !owner.contains(event.target)) this.ungrab();
            });
        }
        grab(params) {
            if (failGrab) return false;
            this.params = params;
            grabs.push(this);
            this.savedFocus = focus;
            params.focus.grab_key_focus();
            return true;
        }
        ungrab() {
            if (!this.params) return;
            const params = this.params;
            this.params = null;
            // Shell invokes the callback before releasing the modal grab.
            params.onUngrab();
            grabs.splice(grabs.indexOf(this), 1);
            focus = this.savedFocus;
        }
    }
    const apps = Array.from({length: count}, (_, index) => ({
        get_id: () => `app-${index}.desktop`,
        get_name: () => `App ${String(index).padStart(3, '0')}`,
        get_app_info: () => ({hidden: false}),
    }));
    const appSystem = Object.assign(new SignalObject(), {
        // Shell returns Gio.AppInfo records here, not Shell.App instances.
        get_installed: () => apps.map((app) => ({get_id: app.get_id})),
        lookup_app: (id) => apps.find((app) => app.get_id() === id),
    });
    const search = jasmine.createSpy('search').and.returnValue([]);
    const parentalControls = Object.assign(new SignalObject(), {
        initialized: true,
        shouldShowApp: (info) => !info.hidden,
    });
    const imports = {
        'gi://Clutter': {
            default: {
                FixedLayout: class {},
                ActorAlign: {CENTER: 1},
                EventType: {TOUCH_BEGIN: 'touch'},
                KEY_Up: 'Up',
                KEY_Page_Up: 'PageUp',
                KEY_Page_Down: 'PageDown',
                ScrollDirection: {SMOOTH: 0, UP: 1, DOWN: 2, LEFT: 3, RIGHT: 4},
                EVENT_STOP: true,
                EVENT_PROPAGATE: false,
            },
        },
        'gi://GObject': {default: GjsHarness.createGObjectDouble()},
        'gi://St': {default: {Widget: Actor, BoxLayout: Actor, Bin: Actor, Label: Actor, Button: Actor}},
        'gi://Shell': {
            default: {
                ActionMode: {POPUP: 1},
                AppSystem: {get_default: () => appSystem, search},
                AppUsage: {get_default: () => ({compare: () => 0})},
            },
        },
        '@girs/gnome-shell/ui/appDisplay': {AppIcon: NativeIcon},
        '@girs/gnome-shell/ui/grabHelper': {GrabHelper},
        '@girs/gnome-shell/ui/main': {
            overview,
            layoutManager: {
                primaryMonitor: {geometry_scale: scale},
                addTopChrome: (actor) => chrome.add(actor),
                removeChrome: (actor) => chrome.delete(actor),
            },
        },
        '@girs/gnome-shell/misc/parentalControlsManager': {getDefault: () => parentalControls},
        [new URL('externals/roundedBackgroundBlur.js', GjsHarness.sourceDirectory).href]: {
            RoundedBackgroundBlur: Actor,
        },
    };
    const {AppGrid} = await GjsHarness.loadGjsModule(
        new URL('extension/components/appGrid.js', GjsHarness.sourceDirectory),
        imports,
        {
            global: {
                stage: {get_event_actor: (event) => event.target},
                focus_manager: {
                    add_group: (actor) => groups.add(actor),
                    remove_group: (actor) => groups.delete(actor),
                },
            },
        },
    );
    const panel = new Actor(),
        text = new Actor(),
        searchSection = new Actor({x: 700, y: 8});
    searchSection.entry = new Actor();
    searchSection.entry.clutter_text = text;
    searchSection.entry.text = '';
    searchSection.entry.get_text = () => searchSection.entry.text;
    searchSection.entry.set_text = (value) => {
        searchSection.entry.text = value;
        text.emit('text-changed');
    };
    searchSection.add_child(searchSection.entry);
    searchSection.entry.add_child(text);
    panel.add_child(new Actor());
    panel.add_child(searchSection);
    panel.add_child(new Actor({visible: false}));
    panel._monitor = monitor;
    panel._searchSection = searchSection;
    panel._components = panel.get_children();
    panel._themeManager = {
        addActor: (actor) => themed.add(actor),
        removeActor: (actor) => themed.delete(actor),
    };
    const picker = new AppGrid(panel);
    return {
        picker,
        panel,
        searchSection,
        text,
        apps,
        appSystem,
        parentalControls,
        search,
        overview,
        nativeActivations,
        grabs,
        chrome,
        themed,
        groups,
        Actor,
        failGrab: () => {
            failGrab = true;
        },
        getFocus: () => focus,
        visibleIcons: () => picker._grid.get_children().filter((icon) => icon.visible),
    };
}

describe('Monitor-local launchpad', () => {
    it('opens only on the supplied monitor and preserves the panel strut while showing its existing search', async () => {
        const first = await fixture(),
            other = await fixture({monitor: {x: 0, y: 0, width: 2560, height: 1440}});
        first.picker.openAppGrid();
        expect([first.picker.x, first.picker.y, first.picker.width, first.picker.height]).toEqual([
            -1920, 100, 1920, 1080,
        ]);
        expect(first.picker._background.width).toBe(1920);
        expect(first.panel.opacity).toBe(255);
        expect(first.panel.children.every((section) => !section.visible)).toBeTrue();
        expect(first.panel.visible).toBeTrue();
        expect(first.searchSection.get_parent()).toBe(first.picker);
        expect(first.searchSection.y).toBe(998);
        expect(first.getFocus()).toBe(first.text);
        expect(first.overview.hide).not.toHaveBeenCalled();
        expect(other.picker.isOpen).toBeFalse();
        expect(other.panel.opacity).toBe(255);
        expect(other.panel.children[0].visible).toBeTrue();
        first.picker.closeAppGrid();
        expect(first.searchSection.get_parent()).toBe(first.panel);
        expect(first.panel.children.indexOf(first.searchSection)).toBe(1);
        expect(first.searchSection.y).toBe(8);
        expect(first.panel.opacity).toBe(255);
        expect(first.panel.children[0].visible).toBeTrue();
        expect(first.panel.children[2].visible).toBeFalse();
    });

    it('uses 32 slots in eight columns and four rows, with clickable page dots and bounded pages', async () => {
        const f = await fixture();
        f.picker.openAppGrid();
        expect(f.visibleIcons().length).toBe(32);
        const icons = f.visibleIcons(),
            cell = f.picker._cellSize;
        expect([icons[7].x, icons[7].y]).toEqual([cell * 7, 0]);
        expect([icons[8].x, icons[8].y]).toEqual([0, cell]);
        expect([icons[31].x, icons[31].y]).toEqual([cell * 7, cell * 3]);
        expect(f.picker._dots.children.length).toBe(3);
        f.picker._dots.children[1].emit('clicked');
        expect(f.picker._page).toBe(1);
        expect(f.visibleIcons().length).toBe(32);
        f.picker.goToPage(100);
        expect(f.picker._page).toBe(2);
        expect(f.visibleIcons().map((icon) => icon.app)).toEqual([f.apps[64]]);
        expect(f.picker._dots.children[2].pseudoClasses.has('checked')).toBeTrue();
        f.picker.goToPage(-1);
        expect(f.picker._page).toBe(0);
    });

    it('follows panel allocation and keeps search at the bottom when panel sections are laid out again', async () => {
        const f = await fixture();
        f.picker.openAppGrid();
        f.searchSection.set_position(700, 8);
        f.searchSection.emit('notify::y');
        expect(f.searchSection.y).toBe(998);
        f.panel._monitor.height = 1200;
        f.panel.emit('notify::allocation');
        expect(f.picker.height).toBe(1200);
        expect(f.searchSection.y).toBe(1118);
        f.picker.closeAppGrid();
        expect(f.searchSection.y).toBe(8);
    });

    it('uses native application search with no remote providers, filters hidden apps, and resets pagination', async () => {
        const f = await fixture();
        f.picker.openAppGrid();
        f.picker.goToPage(2);
        f.apps[3].get_app_info = () => ({hidden: true});
        f.search.and.returnValue([['app-2.desktop', 'app-3.desktop', 'missing.desktop'], ['app-1.desktop']]);
        f.searchSection.entry.set_text('  editor terminal  ');
        expect(f.search).toHaveBeenCalledWith('editor terminal');
        expect(f.picker._page).toBe(0);
        expect(f.visibleIcons().map((icon) => icon.app)).toEqual([f.apps[2], f.apps[1]]);
        expect(f.picker._dots.children.length).toBe(1);
        f.search.and.returnValue([]);
        f.searchSection.entry.set_text('no match');
        expect(f.visibleIcons().length).toBe(0);
        expect(f.picker._empty.visible).toBeTrue();
        f.searchSection.entry.set_text('');
        expect(f.visibleIcons().length).toBe(32);
        expect(f.picker._results.length).toBe(64);
    });

    it('retains Shell icon activation and native menus, closing after a launch or window action', async () => {
        const f = await fixture();
        f.picker.openAppGrid();
        const icon = f.visibleIcons()[0];
        expect(icon.params.isDraggable).toBeFalse();
        icon.activate(2);
        expect(f.nativeActivations).toEqual([{app: f.apps[0], button: 2}]);
        expect(f.picker.isOpen).toBeFalse();
        f.picker.openAppGrid();
        icon.popupMenu();
        icon._menu.emit('activate', icon._menu._toggleFavoriteItem);
        expect(f.picker.isOpen).toBeTrue();
        icon._menu.emit('activate', {});
        expect(f.picker.isOpen).toBeFalse();
        expect(icon._menu.isOpen).toBeFalse();
        f.picker.openAppGrid();
        f.text.emit('activate');
        expect(f.nativeActivations.at(-1)).toEqual({app: f.apps[0], button: 1});
        expect(f.picker.isOpen).toBeFalse();
    });

    it('supports keyboard paging and rate-limits wheel and touchpad paging without treating search scrolling as paging', async () => {
        const f = await fixture({count: 100});
        f.picker.openAppGrid();
        f.picker.emit('key-press-event', {get_key_symbol: () => 'PageDown'});
        expect(f.picker._page).toBe(1);
        f.picker.emit('key-press-event', {get_key_symbol: () => 'PageUp'});
        expect(f.picker._page).toBe(0);
        const scroll = (direction, time, target = f.picker, delta = [0, 0]) =>
            f.picker.emit('scroll-event', {
                target,
                get_scroll_direction: () => direction,
                get_time: () => time,
                get_scroll_delta: () => delta,
            });
        scroll(2, 1000);
        expect(f.picker._page).toBe(1);
        scroll(2, 1050);
        expect(f.picker._page).toBe(1);
        scroll(0, 1200, f.picker, [0.6, 0]);
        expect(f.picker._page).toBe(1);
        scroll(0, 1250, f.picker, [0.6, 0]);
        expect(f.picker._page).toBe(2);
        scroll(2, 1600, f.text);
        expect(f.picker._page).toBe(2);
        scroll(1, 1800);
        expect(f.picker._page).toBe(1);
        f.text.emit('key-press-event', {get_key_symbol: () => 'Up'});
        expect(f.getFocus()).toBe(f.visibleIcons()[0]);
    });

    it('dismisses on Escape, monitor background, touch, and a click outside this monitor, while search and grid clicks stay open', async () => {
        const f = await fixture();
        for (const target of [f.picker._content, f.text]) {
            f.picker.openAppGrid();
            f.picker.emit('button-press-event', {target});
            expect(f.picker.isOpen).toBeTrue();
            f.picker.closeAppGrid();
        }
        for (const dismiss of [
            () => f.picker.emit('captured-event', {get_key_symbol: () => 'Escape'}),
            () => f.picker.emit('button-press-event', {target: f.picker}),
            () => f.picker.emit('touch-event', {type: () => 'touch', target: f.picker}),
            () => f.picker.emit('captured-event', {target: new f.Actor()}),
        ]) {
            f.picker.openAppGrid();
            dismiss();
            expect(f.picker.isOpen).toBeFalse();
            expect(f.grabs.length + f.chrome.size + f.themed.size).toBe(0);
            expect(f.panel.opacity).toBe(255);
            expect(f.panel.children[0].visible).toBeTrue();
        }
    });

    it('handles failed grabs and native actor destruction without leaking search, signals, chrome or menus', async () => {
        const f = await fixture();
        f.failGrab();
        f.picker.openAppGrid();
        expect(f.picker.isOpen).toBeFalse();
        expect(f.searchSection.parent).toBe(f.panel);
        const second = await fixture();
        second.picker.openAppGrid();
        const icon = second.visibleIcons()[0];
        icon.popupMenu();
        second.Actor.prototype.destroy.call(second.picker);
        expect(second.searchSection.parent).toBe(second.panel);
        expect(second.searchSection.destroyed).toBeUndefined();
        expect(second.panel.opacity).toBe(255);
        expect(second.appSystem.signals.size + second.text.signals.size + second.parentalControls.signals.size).toBe(0);
        expect(second.searchSection.signals.size).toBe(0);
        expect(second.panel.signals.size).toBe(0);
        expect(second.grabs.length + second.chrome.size + second.themed.size + second.groups.size).toBe(0);
        expect(icon._menu).toBeNull();
    });

    it('owns cleanup when the panel is destroyed natively', async () => {
        const f = await fixture();
        f.picker.openAppGrid();
        f.panel.destroy();
        expect(f.picker.destroyed).toBeTrue();
        expect(f.picker.appGridActive()).toBeFalse();
        expect(f.grabs.length + f.chrome.size + f.themed.size + f.groups.size).toBe(0);
        expect(f.appSystem.signals.size + f.text.signals.size + f.parentalControls.signals.size).toBe(0);
    });

    it('refreshes installed apps and parental controls and fits all 32 slots on smaller scaled monitors', async () => {
        const f = await fixture({scale: 2, monitor: {x: 0, y: -768, width: 1366, height: 768}});
        f.parentalControls.initialized = false;
        f.picker.openAppGrid();
        expect(f.visibleIcons().length).toBe(0);
        f.parentalControls.initialized = true;
        f.parentalControls.emit('app-filter-changed');
        expect(f.visibleIcons().length).toBe(32);
        expect(f.picker._content.x).toBeGreaterThanOrEqual(0);
        expect(f.picker._content.y).toBeGreaterThanOrEqual(0);
        expect(f.picker._content.y + f.picker._content.height).toBeLessThan(f.searchSection.y);
        f.apps.splice(1);
        f.appSystem.emit('installed-changed');
        expect(f.visibleIcons().length).toBe(1);
        expect(f.picker._dots.children.length).toBe(1);
        f.overview.emit('showing');
        expect(f.picker.isOpen).toBeFalse();
    });
});

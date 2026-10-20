import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';

export async function fixture() {
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, {x: 0, y: 0, width: 0, height: 0, visible: true,
                mapped: true, opacity: 255, children: [],
                hadjustment: {upper: 100, page_size: 100}}, props);
            if (props.child) this.set_child(props.child);
        }
        add_child(actor) { actor.parent = this; this.children.push(actor); }
        insert_child_at_index(actor, index) { actor.parent = this; this.children.splice(index, 0, actor); }
        remove_child(actor) { this.children = this.children.filter(child => child !== actor); actor.parent = null; }
        set_child(actor) { this.destroy_all_children(); this.child = actor; if (actor) this.add_child(actor); }
        get_children() { return [...this.children]; }
        get_child_at_index(index) { return this.children[index]; }
        get_parent() { return this.parent; }
        contains(actor) { return actor === this || this.children.some(child => child.contains(actor)); }
        set_size(width, height) { Object.assign(this, {width, height}); }
        get_size() { return [this.width, this.height]; }
        set_position(x, y) { Object.assign(this, {x, y}); }
        get_transformed_position() {
            const [x, y] = this.parent?.get_transformed_position() ?? [0, 0];
            return [x + this.x, y + this.y];
        }
        transform_stage_point(x, y) {
            const [stageX, stageY] = this.get_transformed_position();
            return [true, x - stageX, y - stageY];
        }
        get_transformed_size() { return this.get_size(); }
        set_style(style) { this.style = style; }
        add_style_class_name() {}
        set_policy() {}
        set_vertical(vertical) { this.vertical = vertical; }
        queue_relayout() {}
        get_stage() { return null; }
        show() { this.visible = true; }
        hide() { this.visible = false; }
        has_key_focus() { return false; }
        navigate_focus() { this.navigated = true; }
        remove_transition() {}
        ease(props) { Object.assign(this, props); }
        set_child_at_index(actor, index) {
            this.children.splice(this.children.indexOf(actor), 1);
            this.children.splice(index, 0, actor);
        }
        set_child_above_sibling(actor, sibling) {
            this.set_child_at_index(actor, sibling ? this.children.indexOf(sibling) + 1 : this.children.length);
        }
        destroy_all_children() { this.get_children().forEach(actor => actor.destroy()); }
        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.emit('destroy');
            this.destroy_all_children();
            this.parent?.remove_child(this);
        }
    }
    const Clutter = {
        Actor, Clone: Actor, BinLayout: class {}, FixedLayout: class {},
        ActorAlign: {FILL: 0, CENTER: 1, START: 2, END: 3},
        EventType: {KEY_PRESS: 1, BUTTON_PRESS: 2, TOUCH_BEGIN: 3, ENTER: 4, MOTION: 5, LEAVE: 6},
        EventFlags: {FLAG_GRAB_NOTIFY: 1}, KEY_Escape: 9, KEY_Up: 10,
        BUTTON_SECONDARY: 3, EVENT_STOP: true, EVENT_PROPAGATE: false, AnimationMode: {EASE_OUT_QUAD: 0},
    };
    const grabs = [];
    const push = actor => {
        const grab = {actor};
        grab.destroyId = actor.connect('destroy', () => pop(grab));
        grabs.push(grab);
        return grab;
    };
    const pop = grab => {
        if (!grabs.includes(grab)) throw new Error('Modal grab released twice');
        grab.actor.disconnect(grab.destroyId);
        grabs.splice(grabs.indexOf(grab), 1);
    };
    // Model Shell 48's two native grab owners, including callback ordering and
    // captured events confined to the top grab. Production owns no input loop.
    class PopupMenuManager {
        constructor() { this.menus = new Set(); this.activeMenu = null; }
        addMenu(menu) {
            this.menus.add(menu);
            menu.connect('open-state-changed', (_menu, open) => {
                if (open) {
                    const old = this.activeMenu;
                    const oldGrab = this.grab;
                    this.grab = push(menu.actor);
                    this.activeMenu = menu;
                    old?.close();
                    if (oldGrab) pop(oldGrab);
                } else if (this.activeMenu === menu) {
                    this.activeMenu = null;
                    pop(this.grab);
                    this.grab = null;
                }
            });
            menu.actor.connect('captured-event', (_actor, event) => {
                if (event.type() === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape)
                    menu.close();
                else if (event.type() === Clutter.EventType.ENTER && !event.get_flags())
                    [...this.menus].find(other => other.sourceActor === event.target && other !== menu)?.open();
                else if ([Clutter.EventType.BUTTON_PRESS, Clutter.EventType.TOUCH_BEGIN].includes(event.type()) &&
                    !menu.actor.contains(event.target)) menu.close();
            });
            menu.connect('destroy', () => this.menus.delete(menu));
        }
    }
    let failGrab = false;
    class GrabHelper {
        constructor(owner) {
            owner.connect('captured-event', (_actor, event) => {
                if (!this.registration) return;
                if ((event.type() === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape) ||
                    ([Clutter.EventType.BUTTON_PRESS, Clutter.EventType.TOUCH_BEGIN].includes(event.type()) &&
                    !owner.contains(event.target))) this.ungrab();
            });
        }
        grab(params) {
            if (failGrab) return false;
            this.registration = params;
            this.grabHandle = push(params.actor);
            return true;
        }
        ungrab() {
            if (!this.registration) return;
            const registration = this.registration;
            this.registration = null;
            registration.onUngrab();
            pop(this.grabHandle);
        }
    }
    class MenuSection extends SignalObject {
        constructor() { super(); this.box = new Actor(); this.actor = this.box; this.items = []; }
        addMenuItem(item, index = this.items.length) {
            this.items.splice(index, 0, item);
            this.box.insert_child_at_index(item.actor, index);
        }
        moveMenuItem(item, index) { this.box.set_child_at_index(item.actor, index); }
        destroy() { this.actor.destroy(); this.emit('destroy'); }
    }
    class PopupMenu extends MenuSection {
        constructor(source) {
            super(); this.sourceActor = source; this.actor = new Actor(); this.isOpen = false;
        }
        open() { if (this.isOpen) return; this.isOpen = true; this.emit('open-state-changed', true); }
        close() { if (!this.isOpen) return; this.isOpen = false; this.emit('open-state-changed', false); }
        toggle() { if (this.isOpen) this.close(); else this.open(); }
        destroy() { this.close(); super.destroy(); }
        _updateFavoriteItem() {}
    }
    class MenuItem extends Actor {
        constructor() { super(); this.add_child(new Actor()); }
        get actor() { return this; }
    }
    class ShellDashIcon extends Actor {
        constructor(app) {
            super({app, hover: true});
            this.icon = {setIconSize() {}};
            this._dot = new Actor();
            this._draggable = new SignalObject();
            this._menuManager = new PopupMenuManager();
        }
        setForcedHighlight(highlight) { this.highlight = highlight; }
        popupMenu() {
            if (!this._menu) {
                this._menu = new PopupMenu(this);
                this._menuManager.addMenu(this._menu);
            }
            this.emit('menu-state-changed', true);
            this._menu.open();
        }
    }
    const chrome = new Set(), themed = new Set(), timeouts = new Map();
    let nextTimeout = 1;
    const activated = [];
    const overview = Object.assign(new SignalObject(), {visible: false, hide() {}});
    const workspace = Object.assign(new SignalObject(), {index: () => 0});
    const windowGroup = new Actor();
    const imports = {
        'gi://Clutter': {default: Clutter},
        'gi://Gio': {default: {ThemedIcon: {new_from_names: () => ({})}}},
        'gi://GObject': {default: GjsHarness.createGObjectDouble()},
        'gi://Shell': {default: {ActionMode: {POPUP: 1},
            util_set_hidden_from_pick: (actor, hidden) => { actor.hiddenFromPick = hidden; }}},
        'gi://Meta': {default: {LaterType: {BEFORE_REDRAW: 0}}},
        'gi://GLib': {default: {PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
            idle_add: (_priority, callback) => {
                const id = nextTimeout++; timeouts.set(id, {delay: 'idle', callback}); return id;
            },
            timeout_add: (_priority, delay, callback) => {
                const id = nextTimeout++; timeouts.set(id, {delay, callback}); return id;
            }, source_remove: id => timeouts.delete(id)}},
        'gi://St': {default: {Widget: Actor, Bin: Actor, BoxLayout: Actor, Button: Actor,
            Label: Actor, Icon: Actor, ScrollView: Actor, Side: {BOTTOM: 1},
            DirectionType: {TAB_FORWARD: 0}, PolicyType: {NEVER: 0, AUTOMATIC: 1},
            ThemeContext: {get_for_stage: () => ({scale_factor: 1})}}},
        '@girs/gnome-shell/ui/main': {overview, sessionMode: {},
            activateWindow: window => activated.push(window),
            initializeDeferredWork() {}, queueDeferredWork() {}, layoutManager: {
                uiGroup: new Actor(),
                addTopChrome: actor => chrome.add(actor),
                removeChrome: actor => chrome.delete(actor),
                getWorkAreaForMonitor: () => ({width: 1920, height: 1080}),
            }},
        '@girs/gnome-shell/ui/popupMenu': {PopupMenu, PopupMenuManager,
            PopupMenuSection: MenuSection, PopupBaseMenuItem: MenuItem,
            PopupMenuItem: MenuItem, PopupSeparatorMenuItem: MenuItem},
        '@girs/gnome-shell/ui/boxpointer': {PopupAnimation: {NONE: 0, FULL: 1}},
        '@girs/gnome-shell/ui/dash': {DashIcon: ShellDashIcon},
        '@girs/gnome-shell/ui/grabHelper': {GrabHelper},
        '@girs/gnome-shell/ui/dnd': {addDragMonitor() {}, removeDragMonitor() {},
            DragMotionResult: {CONTINUE: 0, NO_DROP: 1, MOVE_DROP: 2}, DragDropResult: {CONTINUE: 0}},
        [new URL('externals/roundedBackgroundBlur.js', GjsHarness.sourceDirectory).href]: {RoundedBackgroundBlur: Actor},
        [new URL('extension/components/dash/dashBadge.js', GjsHarness.sourceDirectory).href]: {DashBadge: class {}},
        [new URL('extension/components/dash/dashLabel.js', GjsHarness.sourceDirectory).href]: {
            DashLabel: class {hide() {} destroy() {}},
        },
        [new URL('utils/iconStorage.js', GjsHarness.sourceDirectory).href]: {Icons: {}, getIcon() {}},
    };
    const globals = {global: {stage: {get_event_actor: event => event.target}, focus_manager: {add_group() {}},
        get_current_time: () => 1, workspace_manager: {get_active_workspace: () => workspace},
        get_window_actors: () => windowGroup.get_children()}};
    const {DashIcon} = await GjsHarness.loadGjsModule(
        new URL('extension/components/dash/dashIcon.js', GjsHarness.sourceDirectory), imports, globals);
    const {ExpandedDash} = await GjsHarness.loadGjsModule(
        new URL('extension/components/dash/expandedDash.js', GjsHarness.sourceDirectory), imports, globals);
    const {DashSection} = await GjsHarness.loadGjsModule(
        new URL('extension/components/dashSection.js', GjsHarness.sourceDirectory), imports, globals);
    const {DebianButton} = await GjsHarness.loadGjsModule(
        new URL('extension/components/debianButton.js', GjsHarness.sourceDirectory), imports, globals);
    const {IndicatorSection} = await GjsHarness.loadGjsModule(
        new URL('extension/components/indicatorSection.js', GjsHarness.sourceDirectory), imports, globals);
    const owner = {
        _monitorIndex: 0, _previewMenuManager: new PopupMenuManager(),
        _source: {getEntryWindows: entry => entry.windows},
        resetCycle() {}, closeExpanded() {},
        canSetFavorite: () => false, canCloseAllWindows: () => false,
    };
    let nextEntry = 1;
    const entry = () => {
        const id = nextEntry++;
        const window = Object.assign(new SignalObject(), {
            get_user_time: () => 1, get_title: () => 'Window', get_workspace: () => workspace,
            is_on_all_workspaces: () => false, located_on_workspace: () => true,
            foreach_transient() {}, can_close: () => true, get_stable_sequence: () => id,
        });
        const actor = new Actor({width: 800, height: 600, meta_window: window});
        actor.get_texture = () => ({});
        window.get_compositor_private = () => actor;
        windowGroup.add_child(actor);
        const app = Object.assign(new SignalObject(), {get_name: () => 'App', get_id: () => `app-${id}`,
            create_icon_texture: size => new Actor({width: size, height: size})});
        return {item: {app, name: 'App', id: `app:app-${id}`, appId: `app-${id}`},
            windows: [window], indicatorCount: 1, group: 'favorites'};
    };
    const icon = () => new DashIcon(entry(), owner, 32);
    const theme = {addActor: actor => themed.add(actor), removeActor: actor => themed.delete(actor)};
    const section = ({entries = Array.from({length: 7}, entry), width = 190, source: sharedSource} = {}) => {
        const source = sharedSource ?? Object.assign(new SignalObject(), {entries,
            writable: true, savedOrders: [],
            canReorderFavorite(app) { return this.writable && !this.entries.some(e => e.item.app === app && e.hardcoded); },
            canSetFavorite(app) { return this.canReorderFavorite(app); },
            isFavorite(id) { return this.entries.some(e => e.group === 'favorites' && e.item.appId === id); },
            reorderFavorites(app, order) {
                this.savedOrders.push(order);
                const moved = this.entries.find(entry => entry.item.app === app);
                moved.group = 'favorites';
                this.entries = [...this.entries].sort((a, b) => order.indexOf(a.item.appId) - order.indexOf(b.item.appId));
                this.emit('changed');
            },
            getEntries({runningOrder = []} = {}) { return {
                favorites: this.entries.filter(entry => entry.group === 'favorites').map(entry => ({...entry, item: {...entry.item}})),
                running: this.entries.filter(entry => entry.group === 'running')
                    .sort((a, b) => runningOrder.indexOf(a.item.id) - runningOrder.indexOf(b.item.id))
                    .map(entry => ({...entry, item: {...entry.item}})),
            }; },
            getEntryWindows: entry => entry.windows});
        const section = new DashSection(source, 0, theme, null);
        section.set_size(width, 82);
        section.setAvailableSize(width, 500);
        return section;
    };
    const expanded = () => new ExpandedDash({entries: [], iconSize: 32, availableWidth: 400,
        maxHeight: 500,
        syncTokens: (container, tokens) => tokens.forEach(() => container.add_child(new Actor())),
        dragDrop: {addDropZone() {}, setExpandedSurface(surface) { this.surface = surface; }},
        themeManager: theme});
    return {Actor, owner, icon, entry, expanded, section, theme, DebianButton, IndicatorSection,
        chrome, themed, grabs, timeouts, activated, Clutter,
        anchor: new Actor({x: 20, y: 1000, width: 400, height: 82}),
        event(type, target, flags = 0) { return {target, type: () => type, get_flags: () => flags,
            get_button: () => Clutter.BUTTON_SECONDARY, get_key_symbol: () => Clutter.KEY_Escape, get_related: () => target}; },
        send(event) { grabs.at(-1)?.actor.emit('captured-event', event); },
        flush(delay) {
            for (const [id, timeout] of [...timeouts]) if (timeout.delay === delay) {
                timeouts.delete(id); timeout.callback();
            }
        },
        failGrab() { failGrab = true; }, push, pop,
    };
}


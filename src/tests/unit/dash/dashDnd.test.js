import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';
import * as Constants from '@/extension/constants.js';
import * as PanelMenuDoubles from '@/tests/panelMenu.js';

async function fixture(scale = 1, gestures = false) {
    class GridLayout {
        constructor(props) { Object.assign(this, props); }
        attach(tile, column, row, width, height) {
            tile.cell = {column, row, width, height};
            this.container.add_child(tile);
        }
    }
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, {x: 0, y: 0, width: 0, height: 0, visible: true}, props);
            this.children = [];
            if (props.layout_manager instanceof GridLayout)
                props.layout_manager.container = this;
            if (props.child)
                this.set_child(props.child);
        }
        add_child(child) { child.parent = this; this.children.push(child); }
        add_effect(effect) { this.effect = effect; }
        set_child(child) {
            if (this.child) {
                this.children = this.children.filter(actor => actor !== this.child);
                this.child.parent = null;
            }
            this.child = child;
            if (child) this.add_child(child);
        }
        add_action(action) { action.actor = this; this.action = action; }
        remove_action(action) {
            if (this.action === action) this.action = null;
            action.actor = null;
        }
        insert_child_below(child, sibling) {
            child.parent = this;
            this.children.splice(this.children.indexOf(sibling), 0, child);
        }
        get_children() { return [...this.children]; }
        get_parent() { return this.parent; }
        contains(child) {
            return child === this || this.children.some(actor => actor.contains(child));
        }
        set_size(width, height) { Object.assign(this, {width, height}); }
        set_position(x, y) { Object.assign(this, {x, y}); }
        get_transformed_position() {
            const [x, y] = this.parent?.get_transformed_position() ?? [0, 0];
            return [x + this.x, y + this.y];
        }
        get_transformed_size() { return [this.width, this.height]; }
        transform_stage_point(x, y) {
            const [stageX, stageY] = this.get_transformed_position();
            return [true, x - stageX, y - stageY];
        }
        add_style_class_name() {}
        remove_style_class_name() {}
        set_policy() {}
        queue_relayout() {
            let parent = this;
            while (parent && !parent._dash)
                parent = parent.get_parent();
            if (parent)
                allocate(parent);
        }
        destroy_all_children() { this.get_children().forEach(child => child.destroy()); }
        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.emit('destroy');
            this.destroy_all_children();
            if (this.parent)
                this.parent.children = this.parent.children.filter(child => child !== this);
            this.parent = null;
            this.destroyed = true;
        }
    }
    const nativeMenus = PanelMenuDoubles.createDoubles(Actor);
    const activatedWindows = [];
    const monitors = new Set();
    const chrome = new Set();
    const themeActors = new Set();
    const idles = new Map();
    const timeouts = new Map();
    let nextIdle = 1;
    const redraws = [];
    const logs = [];
    // Shell 45–48 bridges ClickAction cancellation to a drag on the next
    // redraw, after checking whether the release was an ordinary click.
    class Draggable extends SignalObject {
        constructor(actor) {
            super();
            this.actor = actor;
            if (gestures) this.addClickAction = undefined;
        }
        addClickAction(action) {
            action.connect('clicked', () => { this.clicked = true; });
            action.connect('long-press', (_action, _actor, state) => {
                if (state === 'cancel') redraws.push(() => {
                    if (!this.clicked) {
                        action.release();
                        this.emit('drag-begin', 123);
                    }
                    this.clicked = false;
                });
            });
            this.actor.add_action(action);
        }
        fakeRelease() {}
    }
    class ClickGesture extends SignalObject {
        constructor(params) { super(); this.params = params; }
        press(coords, button = 1) {
            this.coords = coords;
            this.held = button === 0 || button === this.params.required_button;
            this.emit('should-handle-sequence', {
                type: () => button === 0 ? 3 : 1, get_button: () => button,
            });
        }
        move(coords) {
            if (this.held && Math.hypot(coords[0] - this.coords[0], coords[1] - this.coords[1]) > 8) {
                this.held = false;
                this.actor._delegate.draggable?.emit('drag-begin', 123);
            }
        }
        end() { if (this.held) this.emit('recognize'); this.held = false; }
    }
    const DND = {
        DragMotionResult: {CONTINUE: 0, NO_DROP: 1, MOVE_DROP: 2},
        DragDropResult: {CONTINUE: 0},
        makeDraggable: actor => {
            expect(actor instanceof nativeMenus.PanelMenu.Button).toBeTrue();
            return new Draggable(actor);
        },
        addDragMonitor: monitor => monitors.add(monitor),
        removeDragMonitor: monitor => monitors.delete(monitor),
    };
    const imports = {
        'gi://Clutter': {default: {BinLayout: class {}, FixedLayout: class {}, GridLayout,
            ActorAlign: {FILL: 0, CENTER: 1}, ClickAction: nativeMenus.ClickAction,
            ...(gestures ? {ClickGesture} : {}), LongPressState: {QUERY: 'query'},
            EventType: {BUTTON_PRESS: 1, TOUCH_BEGIN: 3}}},
        'gi://GLib': {default: {PRIORITY_DEFAULT_IDLE: 0, PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
            timeout_add: (_priority, _delay, callback) => {
                const id = nextIdle++; timeouts.set(id, callback); return id;
            },
            idle_add: (_priority, callback) => {
                const id = nextIdle++;
                idles.set(id, callback);
                return id;
            }, source_remove: id => { idles.delete(id); timeouts.delete(id); }}},
        'gi://GObject': {default: GjsHarness.createGObjectDouble()},
        'gi://Shell': {default: {util_set_hidden_from_pick: (actor, hidden) => {
            actor.hiddenFromPick = hidden;
        }}},
        'gi://St': {default: {Widget: Actor, Bin: Actor, Button: Actor,
            BoxLayout: Actor, Icon: Actor, Label: Actor, ScrollView: Actor, ButtonMask: {ONE: 1},
            PolicyType: {NEVER: 0, AUTOMATIC: 1}, Side: {BOTTOM: 1}}},
        'resource:///org/gnome/shell/ui/dnd.js': DND,
        'resource:///org/gnome/shell/ui/appFavorites.js': {},
        'resource:///org/gnome/shell/ui/main.js': {activateWindow: win => activatedWindows.push(win), layoutManager: {
            addTopChrome: (actor, options) => { actor.chromeOptions = options; chrome.add(actor); },
            removeChrome: actor => chrome.delete(actor),
        }},
        'resource:///org/gnome/shell/ui/popupMenu.js': nativeMenus.PopupMenu,
        'resource:///org/gnome/shell/ui/panelMenu.js': nativeMenus.PanelMenu,
        [new URL('externals/roundedBackgroundBlur.js', GjsHarness.sourceDirectory).href]: {
            RoundedBackgroundBlur: class extends Actor {},
        },
    };
    const {DashSection} = await GjsHarness.loadGjsModule(
        new URL('extension/components/dashSection.js', GjsHarness.sourceDirectory), imports,
        {console: {info: message => logs.push(message)},
            global: {display: {get_n_monitors: () => 2},
            settings: {is_writable: () => true}, get_current_time: () => 123}});
    const {DashSource} = await GjsHarness.loadGjsModule(
        new URL('extension/components/dash/dashSource.js', GjsHarness.sourceDirectory), imports);
    const theme = {addActor: actor => themeActors.add(actor),
        removeActor: actor => themeActors.delete(actor)};
    const app = appId => ({get_id: () => appId, get_name: () => appId,
        is_window_backed: () => false,
        can_open_new_window: () => true,
        get_app_info: () => ({list_actions: () => []}),
        create_icon_texture: iconSize => new Actor({iconSize, width: iconSize * scale,
            height: iconSize * scale})});
    const source = Object.assign(new SignalObject(), {
        favorites: ['firefox', 'files', 'editor', 'music'].map(app),
        running: ['terminal', 'settings', 'calendar'].map(app),
        changes: [], launches: [], desktopActions: [], perWindow: false, monitorOnly: false,
        getFavorites() { return [...this.favorites]; },
        getRunningApps() { return [...this.running]; },
        getOpenedWindows() { return this.windows; },
        getOpenMonitorWindows(index) { return this.windows.filter(win => win.get_monitor() === index); },
        getWindowApp(win) { return win.app; },
        getAppWindows(app, monitor = null) {
            return this.windows.filter(win => win.app === app &&
                (monitor === null || win.get_monitor() === monitor));
        },
        isFixedFavorite(id) { return ['firefox', 'files'].includes(id); },
        isFavorite(id) { return this.favorites.some(app => app.get_id() === id); },
        canReorderFavorite(app) { return !this.isFixedFavorite(app.get_id()) && !app.is_window_backed(); },
        canSetFavorite(app) { return !this.isFixedFavorite(app.get_id()); },
        openNewWindow(app, monitor) { this.launches.push([app, monitor]); },
        launchAction(app, action, monitor) { this.desktopActions.push([app, action, monitor]); },
        setFavorite(app, favorite) {
            this.changes.push([app.get_id(), favorite]);
            this.favorites.push(app);
            this.emit('changed');
        },
    });
    Object.setPrototypeOf(source, DashSource.prototype);
    const makeWindow = (app, id, monitor = 0) => ({app, monitor, minimized: 0, deleted: [],
        get_stable_sequence: () => id, get_title: () => app.get_name(),
        get_monitor() { return this.monitor; },
        minimize() { this.minimized++; },
        delete(time) { this.deleted.push(time); }});
    source.windows = source.running.map((app, id) => makeWindow(app, id));
    function allocate(panel) {
        panel.set_size(panel.preferredWidth,
            (Constants.SECTION_HEIGHT + (Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH) * 2) * scale);
        panel._frame.set_size(panel.width, panel.height);
        panel._surface.set_size(panel.width, panel.height);
        const frame = (Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH) * scale;
        panel._dash.set_position(frame, frame);
        panel._dash.set_size(panel.width - frame * 2, panel.height - frame * 2);
        let x = (Math.max(0, Constants.DASH_PADDING - Constants.SECTION_FRAME_WIDTH) + Constants.DASH_BORDER_WIDTH) * scale;
        for (const actor of panel._dash.get_children()) {
            actor.set_position(x, (panel._dash.height - actor.height) / 2);
            x += actor.width + Constants.DASH_ITEM_SPACING * scale;
        }
    }
    function panel(index = 0, width = 1000 * scale) {
        const section = new DashSection(source, index, theme, null, scale);
        section.setAvailableSize(width, 600 * scale);
        section.set_position(80, 500);
        allocate(section);
        return section;
    }
    // Match Shell DND: ALL picks decorations too, then walks _delegate ancestors.
    function pick(actor, x, y) {
        if (actor.hiddenFromPick || !actor.visible)
            return null;
        const [ax, ay] = actor.get_transformed_position();
        if (x < ax || y < ay || x >= ax + actor.width || y >= ay + actor.height)
            return null;
        for (const child of actor.get_children().reverse()) {
            const hit = pick(child, x, y);
            if (hit)
                return hit;
        }
        return actor;
    }
    // Model native Bin/vertical Box allocation so picks can reach the button
    // texture, indicator row and the non-reactive space around the button.
    function layoutIcon(icon) {
        const button = icon.button;
        const dots = icon.indicators;
        const gap = 7 * scale;
        const side = button.width;
        const content = icon.child;
        content.set_size(side, side + gap);
        content.set_position((icon.width - side) / 2, (icon.height - side - gap) / 2);
        button.container.set_position(0, 0);
        button.set_position(0, 0);
        const count = dots.get_children().length;
        const dotsWidth = (count * 5 + Math.max(0, count - 1) * 4) * scale;
        dots.set_size(dotsWidth, gap);
        dots.set_position((side - dotsWidth) / 2, side);
    }
    function at(view, after = false) {
        layoutIcon(view);
        const [x, y] = view.button.get_transformed_position();
        return [x + view.button.width * (after ? 0.75 : 0.25), y + view.button.height / 2];
    }
    function dispatch(kind, dragged, surface, point) {
        const [x, y] = point;
        let targetActor = pick(surface, x, y);
        for (const monitor of monitors)
            monitor[kind === 'hover' ? 'dragMotion' : 'dragDrop']({targetActor});
        while (targetActor) {
            const [, localX, localY] = targetActor.transform_stage_point(x, y);
            const delegate = targetActor._delegate;
            if (kind === 'hover' && delegate?.handleDragOver) {
                const result = delegate.handleDragOver(dragged, null, localX, localY);
                if (result !== DND.DragMotionResult.CONTINUE)
                    return result;
            } else if (kind === 'drop' && delegate?.acceptDrop &&
                delegate.acceptDrop(dragged, null, localX, localY)) {
                return true;
            }
            targetActor = targetActor.get_parent();
        }
        return kind === 'hover' ? DND.DragMotionResult.CONTINUE : false;
    }
    function finish(dragged) {
        dragged.draggable.emit('drag-end');
        for (const [id, callback] of idles) {
            idles.delete(id);
            callback();
        }
    }
    const view = (section, appId) => [...section._dragDrop._icons].find(icon => icon.item.appId === appId);
    function pointer(icon, phase, coords = at(icon), button = 1) {
        icon.button.action[phase](coords, button);
        for (const redraw of redraws.splice(0)) redraw();
    }
    function pressAt(surface, coords) {
        let actor = pick(surface, ...coords);
        while (actor) {
            if (actor.reactive && actor.action) {
                actor.action.press(coords);
                return actor;
            }
            actor = actor.get_parent();
        }
        return null;
    }
    return {panel, source, view, at, pick, dispatch, finish, monitors, chrome, themeActors,
        DND, allocate, idles, timeouts, activatedWindows, makeWindow, pointer, pressAt, logs};
}

describe('Dash drag and drop', () => {
    it('gives Launchpad, +N and apps equal button sizes and matching indicator space in both layouts', async () => {
        for (const scale of [1, 1.5, 2]) {
            const f = await fixture(scale);
            for (const width of [1000, 200]) {
                const p = f.panel(0, width * scale);
                const size = width === 1000 ? 40 : 32;
                expect(p._layout.iconSize).toBe(size);
                const checkItems = actors => {
                    const items = actors.filter(actor => actor.indicators);
                    expect(items.length).toBeGreaterThan(1);
                    const heights = [];
                    for (const item of items) {
                        const content = item.child;
                        const buttonActor = content.get_children()[0];
                        const button = item.button ?? buttonActor;
                        expect(button.width).toBe(size * scale);
                        expect(button.height).toBe(size * scale);
                        expect(buttonActor.width).toBe(size * scale);
                        expect(buttonActor.height).toBe(size * scale);
                        expect(content.vertical).toBeTrue();
                        expect(content.y_align).toBe(1);
                        expect(content.get_children()[1]).toBe(item.indicators);
                        expect(item.indicators.style_class).toBe('dash-window-dots');
                        heights.push(item.height);
                        if (button.style_class?.includes('dash-launchpad')) {
                            expect(button.child.width).toBe(size * scale);
                            expect(button.child.height).toBe(size * scale);
                            expect(button.child.get_children().length).toBe(9);
                        }
                    }
                    expect(new Set(heights).size).toBe(1);
                };
                checkItems(p._dash.get_children());
                expect(p._dash.get_children()[0].width).toBe((size + 8) * scale);
                if (width === 200) {
                    const overflow = p._dash.get_children().at(-1);
                    expect(overflow.child.get_children()[0].style_class).toContain('dash-overflow-button');
                    expect(overflow.child.get_children()[0].child.style).toBe('font-size: 21px;');
                    p._openExpanded();
                    checkItems(p._expandedSurface._content.child.get_children()[0].get_children());
                }
                p.destroy();
            }
        }
    });

    it('starts input only on the icon button, while the separate dots still accept drops', async () => {
        const f = await fixture();
        const p = f.panel();
        const source = f.view(p, 'terminal');
        const target = f.view(p, 'settings');
        const point = f.at(target);
        expect(f.pressAt(p, point)).toBe(target.button);
        f.pointer(target, 'end');
        expect(f.activatedWindows).toEqual([f.source.windows[1]]);
        const [x, y] = target.indicators.get_transformed_position();
        const dotsPoint = [x + target.indicators.width / 2, y + target.indicators.height / 2];
        expect(f.pressAt(p, dotsPoint)).toBeNull();
        expect(target.dragging).toBeFalse();
        const [startX, startY] = f.at(source);
        f.pointer(source, 'press');
        f.pointer(source, 'move', [startX + 20, startY]);
        expect(f.dispatch('hover', source, p, dotsPoint)).toBe(f.DND.DragMotionResult.MOVE_DROP);
        expect(f.dispatch('drop', source, p, dotsPoint)).toBeTrue();
        f.finish(source);
    });

    for (const gestures of [false, true]) {
        it(`starts on pointer movement without activating the app (Shell ${gestures ? '49' : '45–48'})`, async () => {
            const f = await fixture(1, gestures);
            const p = f.panel();
            const icon = f.view(p, 'terminal');
            const [x, y] = f.at(icon);
            f.pointer(icon, 'press', [x, y]);
            expect(icon.dragging).toBeFalse();
            f.pointer(icon, 'move', [x + 20, y]);
            expect(icon.dragging).toBeTrue();
            f.pointer(icon, 'end');
            expect(f.activatedWindows).toEqual([]);
            const target = f.view(p, 'settings');
            expect(f.dispatch('drop', icon, p, f.at(target, true))).toBeTrue();
            f.finish(icon);
            expect(p._dragDrop.orders.runningOrder).toEqual(['app:settings', 'app:terminal', 'app:calendar']);
            expect(f.logs.some(line => line.includes('started monitor=0 app=terminal'))).toBeTrue();
            expect(f.logs.some(line => line.includes('order applied'))).toBeTrue();
        });

        it(`keeps ordinary clicks and fixed favorites working (Shell ${gestures ? '49' : '45–48'})`, async () => {
            const f = await fixture(1, gestures);
            const p = f.panel();
            const icon = f.view(p, 'terminal');
            f.pointer(icon, 'press');
            f.pointer(icon, 'end');
            expect(icon.dragging).toBeFalse();
            expect(f.activatedWindows).toEqual([f.source.windows[0]]);
            const fixed = f.view(p, 'firefox');
            const [x, y] = f.at(fixed);
            f.pointer(fixed, 'press');
            f.pointer(fixed, 'move', [x + 20, y]);
            f.pointer(fixed, 'end');
            expect(fixed.draggable).toBeUndefined();
            expect(fixed.dragging).toBeFalse();
            expect(f.logs.some(line => line.includes('fixed favorite; dragging disabled'))).toBeTrue();
            f.pointer(fixed, 'press');
            f.pointer(fixed, 'end');
            expect(f.source.launches).toEqual([[f.source.favorites[0], 0]]);
        });

        it(`distinguishes a touch tap from a touch drag (Shell ${gestures ? '49' : '45–48'})`, async () => {
            const f = await fixture(1, gestures);
            const p = f.panel();
            const icon = f.view(p, 'terminal');
            const [x, y] = f.at(icon);
            f.pointer(icon, 'press', [x, y], 0);
            f.pointer(icon, 'end');
            expect(f.activatedWindows).toEqual([f.source.windows[0]]);
            f.pointer(icon, 'press', [x, y], 0);
            f.pointer(icon, 'move', [x, y + 20]);
            expect(icon.dragging).toBeTrue();
            f.pointer(icon, 'end');
            expect(f.activatedWindows.length).toBe(1);
            f.finish(icon);
        });
    }

    it('logs rejected targets once per hover and reports cancellation', async () => {
        const f = await fixture();
        const p = f.panel();
        const icon = f.view(p, 'editor');
        const [x, y] = f.at(icon);
        f.pointer(icon, 'press');
        f.pointer(icon, 'move', [x + 20, y]);
        const target = f.view(p, 'terminal');
        for (let i = 0; i < 3; i++)
            f.dispatch('hover', icon, p, f.at(target));
        expect(f.logs.filter(line => line.includes('hover rejected')).length).toBe(1);
        expect(f.logs.some(line => line.includes('favorites cannot be moved into running'))).toBeTrue();
        icon.draggable.emit('drag-cancelled', 123);
        f.finish(icon);
        expect(f.logs.some(line => line.includes('cancelled monitor=0 app=editor'))).toBeTrue();
        expect(icon.dragging).toBeFalse();
    });

    it('favorite menu launches carry the owning dash monitor', async () => {
        const f = await fixture();
        f.source.monitorOnly = true;
        const app = f.source.favorites[0];
        const p = f.panel(1);
        const icon = f.view(p, 'firefox');
        icon.button.menu.items.find(item => item.label.text === 'New Window').activate();
        expect(f.source.launches).toEqual([[app, 1]]);
        app.get_app_info = () => ({list_actions: () => ['new-window'],
            get_action_name: () => 'New Window'});
        icon.button._populateMenu();
        icon.button.menu.items.find(item => item.label.text === 'New Window').activate();
        expect(f.source.desktopActions).toEqual([[app, 'new-window', 1]]);
    });

    it('isolated favorite indicators and clicks use only the dash monitor in both modes', async () => {
        for (const perWindow of [false, true]) {
            const f = await fixture();
            f.source.monitorOnly = true;
            f.source.perWindow = perWindow;
            const app = f.source.favorites[0];
            const remote = f.makeWindow(app, 10, 1);
            f.source.windows.push(remote);
            const localPanel = f.panel(0);
            const remotePanel = f.panel(1);
            const entry = f.view(localPanel, 'firefox').entry;
            expect(entry.indicatorCount).toBe(0);
            expect(f.view(remotePanel, 'firefox').entry.indicatorCount).toBe(1);
            localPanel.activateEntry(entry);
            expect(f.source.launches).toEqual([[app, 0]]);
            expect(f.activatedWindows).toEqual([]);
            expect(remote.monitor).toBe(1);
            const local = f.makeWindow(app, 20, 0);
            f.source.windows.push(local);
            // Even before a view refresh, activation queries the current scope.
            localPanel.activateEntry(entry);
            expect(f.activatedWindows).toEqual([local]);
            localPanel.refresh(); remotePanel.refresh();
            expect(f.view(localPanel, 'firefox').entry.indicatorCount).toBe(1);
            expect(f.view(remotePanel, 'firefox').entry.indicatorCount).toBe(1);
        }
    });

    it('app cycling and minimize-all never affect remote windows under isolation', async () => {
        const f = await fixture();
        f.source.monitorOnly = true;
        const app = f.source.favorites[0];
        const remote = f.makeWindow(app, 5, 1);
        const one = f.makeWindow(app, 10, 0);
        const two = f.makeWindow(app, 20, 0);
        f.source.windows = [remote, one, two];
        const p = f.panel(0);
        const entry = f.view(p, 'firefox').entry;
        for (let click = 0; click < 3; click++) {
            p.activateEntry(entry);
            p.refresh();
        }
        expect(f.activatedWindows).toEqual([one, two]);
        expect(one.minimized).toBe(1);
        expect(two.minimized).toBe(1);
        expect(remote.minimized).toBe(0);
    });

    it('source updates reach another panel during a drag and rebuild the dragged view after release', async () => {
        const f = await fixture();
        const p = f.panel();
        const other = f.panel(1);
        const dragged = f.view(p, 'calendar');
        dragged.draggable.emit('drag-begin');
        const removed = f.source.running.find(app => app.get_id() === 'settings');
        f.source.running = f.source.running.filter(app => app !== removed);
        f.source.windows = f.source.windows.filter(win => win.app !== removed);
        f.source.emit('changed');
        expect(f.view(p, 'calendar')).toBe(dragged);
        expect(dragged.destroyed).toBeUndefined();
        expect(f.view(p, 'settings')).toBeDefined();
        expect(f.view(other, 'settings')).toBeUndefined();
        // A geometry update during drag must not destroy DND's source actor.
        p.setAvailableSize(300, 600);
        expect(dragged.destroyed).toBeUndefined();
        f.finish(dragged);
        expect(dragged.destroyed).toBe(true);
        expect(f.view(p, 'settings')).toBeUndefined();
        expect(p._dragDrop._refreshPending).toBe(false);
        expect(f.idles.size).toBe(0);
    });

    it('native pick/delegate traversal reaches icons, and running drops update system favorites', async () => {
        const f = await fixture();
        const p = f.panel();
        const other = f.panel(1);
        const dragged = f.view(p, 'terminal');
        const target = f.view(p, 'files');
        dragged.draggable.emit('drag-begin');
        expect(p.get_children()).toEqual([p._surface]);
        expect(p._surface.get_children()).toEqual([p._frame]);
        expect(p._frame.get_children()).toEqual([p._dash]);
        expect(target.contains(f.pick(p, ...f.at(target, true)))).toBeTrue();
        expect(f.dispatch('hover', dragged, p, f.at(target, true))).toBe(f.DND.DragMotionResult.MOVE_DROP);
        expect(f.dispatch('drop', dragged, p, f.at(target, true))).toBe(true);
        expect(f.source.changes).withContext('changes wait until DND releases its actors').toEqual([]);
        f.finish(dragged);
        expect(p._dragDrop._dragging).toBe(false);
        expect(f.source.changes).toEqual([['terminal', true]]);
        expect(Array.from(p._dragDrop._entries.favorites, entry => entry.item.appId)).toEqual(['firefox', 'files', 'terminal', 'editor', 'music']);
        expect(Array.from(other._dragDrop._entries.favorites, entry => entry.item.appId)).toEqual(['firefox', 'files', 'editor', 'music', 'terminal']);
    });

    it('each dash owns its source connection and destruction leaves other monitors updating', async () => {
        const f = await fixture();
        const first = f.panel(0);
        const second = f.panel(1);
        expect(f.source.signals.size).toBe(2);
        first.destroy();
        expect(f.source.signals.size).toBe(1);
        const removed = f.source.running.find(app => app.get_id() === 'settings');
        f.source.running = f.source.running.filter(app => app !== removed);
        f.source.windows = f.source.windows.filter(window => window.app !== removed);
        f.source.emit('changed');
        expect(f.view(second, 'settings')).toBeUndefined();
        expect(f.view(second, 'terminal')).toBeDefined();
        const rebuilt = f.panel(0);
        expect(f.source.signals.size).toBe(2);
        expect(f.view(rebuilt, 'settings')).toBeUndefined();
        second.destroy(); rebuilt.destroy();
        expect(f.source.signals.size).toBe(0);
        expect(f.source._objectConnections.size).toBe(0);
        expect(f.monitors.size).toBe(0);
        expect(f.idles.size).toBe(0);
    });

    it('running and non-fixed favorite reordering is panel-local; fixed launchers stay fixed', async () => {
        const f = await fixture();
        const p = f.panel();
        const other = f.panel(1);
        for (const [from, to] of [['calendar', 'terminal'], ['music', 'editor']]) {
            const dragged = f.view(p, from);
            dragged.draggable.emit('drag-begin');
            expect(f.dispatch('drop', dragged, p, f.at(f.view(p, to)))).toBe(true);
            f.finish(dragged);
        }
        expect(Array.from(p._dragDrop._entries.running, entry => entry.item.appId)).toEqual(['calendar', 'terminal', 'settings']);
        expect(Array.from(other._dragDrop._entries.running, entry => entry.item.appId)).toEqual(['terminal', 'settings', 'calendar']);
        expect(Array.from(p._dragDrop._entries.favorites, entry => entry.item.appId)).toEqual(['firefox', 'files', 'music', 'editor']);
        expect(f.source.changes).toEqual([]);
        expect(f.view(p, 'files').draggable).toBe(undefined);
        expect(f.dispatch('drop', f.view(p, 'terminal'), p, f.at(f.view(p, 'firefox')))).toBe(false);
    });

    it('16px translucent insertion preview is pick-transparent, scaled, and does not resize the dash', async () => {
        for (const scale of [1, 2]) {
            const f = await fixture(scale);
            const p = f.panel();
            const dragged = f.view(p, 'terminal');
            const target = f.view(p, 'editor');
            const originalWidth = p.width;
            dragged.draggable.emit('drag-begin');
            expect(f.dispatch('hover', dragged, p, f.at(target))).withContext(`preview at scale ${scale}`).toBe(f.DND.DragMotionResult.MOVE_DROP);
            const preview = p._dragDrop._dropPreview;
            const beforeX = preview.x;
            expect(preview.width).toBe(Constants.DASH_DROP_PREVIEW_SIZE * scale);
            expect(preview.height).toBe(Constants.DASH_DROP_PREVIEW_SIZE * scale);
            expect(preview.child.iconSize).toBe(16);
            expect(preview.opacity).toBe(Constants.DASH_DROP_PREVIEW_OPACITY);
            expect(preview.reactive).toBe(false);
            expect(preview.hiddenFromPick).toBe(true);
            expect(preview.chromeOptions.affectsInputRegion).toBe(false);
            expect(preview.chromeOptions.affectsStruts).toBe(false);
            expect(f.chrome.has(preview)).toBeTruthy();
            f.dispatch('hover', dragged, p, f.at(target, true));
            expect(p._dragDrop._dropPreview).toBe(preview);
            expect(preview.x - beforeX).toBe(target.width + Constants.DASH_ITEM_SPACING * scale);
            expect(p.width).toBe(originalWidth);
            f.finish(dragged);
            expect(p._dragDrop._dropPreview).toBe(null);
            expect(preview.destroyed).toBe(true);
            expect(f.chrome.size).toBe(0);
            expect(f.themeActors.size).toBe(0);
        }
    });

    it('padding/gap drops use the section delegate, and preview cleans up on leave, invalid target, drop and destroy', async () => {
        const f = await fixture();
        const p = f.panel();
        const dragged = f.view(p, 'settings');
        const target = f.view(p, 'calendar');
        dragged.draggable.emit('drag-begin');
        const [x] = target.get_transformed_position();
        const paddingPoint = [x + target.width * 0.75, p.y];
        expect(f.pick(p, ...paddingPoint)).toBe(p._frame);
        expect(f.dispatch('hover', dragged, p, paddingPoint)).toBe(f.DND.DragMotionResult.MOVE_DROP);
        for (const monitor of f.monitors)
            monitor.dragMotion({targetActor: null});
        expect(p._dragDrop._dropPreview).toBe(null);
        f.dispatch('hover', dragged, p, f.at(target));
        f.dispatch('hover', dragged, p, f.at(f.view(p, 'firefox')));
        expect(p._dragDrop._dropPreview).toBe(null);
        f.dispatch('hover', dragged, p, f.at(target));
        expect(f.dispatch('drop', dragged, p, paddingPoint)).toBe(true);
        expect(p._dragDrop._dropPreview).toBe(null);
        f.finish(dragged);
        expect(Array.from(p._dragDrop._entries.running, entry => entry.item.appId)).toEqual(['terminal', 'calendar', 'settings']);
        const newDragged = f.view(p, 'settings');
        newDragged.draggable.emit('drag-begin');
        // Explicit section fallback models a pick on the border/background itself.
        const beforeTarget = f.view(p, 'terminal');
        const [tx, ty] = beforeTarget.get_transformed_position();
        expect(p._delegate.handleDragOver(newDragged, null, tx - p.x, ty - p.y)).toBe(f.DND.DragMotionResult.MOVE_DROP);
        p.destroy();
        expect(p._dragDrop.drop(newDragged, beforeTarget.entry, false)).toBe(false);
        expect(p._dragDrop._dragging).toBe(false);
        expect(f.monitors.size).toBe(0);
        expect(f.chrome.size).toBe(0);
        expect(f.themeActors.size).toBe(0);
        expect(f.idles.size).toBe(0);
    });

    it('expanded grid and expanded surface both accept drops without losing the target', async () => {
        const f = await fixture();
        const p = f.panel(0, 250);
        p._openExpanded();
        const surface = p._expandedSurface;
        expect(surface).toBeTruthy();
        const grid = surface._content.child.children[0];
        // Model native St allocation inside the frame's outline/padding and scroll border.
        surface._frame.set_size(surface.width, surface.height);
        surface._surface.set_size(surface.width, surface.height);
        const frame = Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH;
        surface._content.set_position(frame, frame);
        surface._content.set_size(surface.width - frame * 2, surface.height - frame * 2);
        surface._content.child.set_size(surface._content.width, surface._content.height);
        grid.set_position(Constants.DASH_BORDER_WIDTH, Constants.DASH_BORDER_WIDTH);
        const views = [...p._dragDrop._icons].filter(icon => grid.contains(icon));
        const dragged = views.find(icon => icon.item.appId === 'calendar');
        const target = views.find(icon => icon.item.appId === 'terminal');
        const [startX, startY] = f.at(dragged);
        f.pointer(dragged, 'press');
        f.pointer(dragged, 'move', [startX + 20, startY]);
        expect(dragged.dragging).toBeTrue();
        expect(f.dispatch('hover', dragged, surface, f.at(target))).toBe(f.DND.DragMotionResult.MOVE_DROP);
        expect(p._dragDrop._dropPreview).toBeTruthy();
        const [x, y] = target.get_transformed_position();
        const [sx, sy] = surface.get_transformed_position();
        expect(surface._delegate.handleDragOver(dragged, null, x - sx, y - sy)).toBe(f.DND.DragMotionResult.MOVE_DROP);
        expect(f.dispatch('drop', dragged, surface, f.at(target))).toBe(true);
        f.finish(dragged);
        expect(p._expandedSurface).toBe(null);
        expect(p._dragDrop._dropPreview).toBe(null);
        expect(p._dragDrop._dragging).toBe(false);
        expect(Array.from(p._dragDrop._entries.running, entry => entry.item.appId)).toEqual(['calendar', 'terminal', 'settings']);
    });

});

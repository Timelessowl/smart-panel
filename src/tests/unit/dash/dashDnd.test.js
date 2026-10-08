import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';
import * as Constants from '@/constant.js';
import * as PanelMenuDoubles from '@/tests/panelMenu.js';

async function fixture(scale = 1) {
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, {x: 0, y: 0, width: 0, height: 0, visible: true}, props);
            this.children = [];
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
        add_action(action) { this.action = action; }
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
    const DND = {
        DragMotionResult: {CONTINUE: 0, NO_DROP: 1, MOVE_DROP: 2},
        DragDropResult: {CONTINUE: 0},
        makeDraggable: () => new SignalObject(),
        addDragMonitor: monitor => monitors.add(monitor),
        removeDragMonitor: monitor => monitors.delete(monitor),
    };
    const imports = {
        'gi://Clutter': {default: {BinLayout: class {}, FixedLayout: class {},
            ActorAlign: {FILL: 0, CENTER: 1}, ClickAction: nativeMenus.ClickAction}},
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
        new URL('components/dashSection.js', GjsHarness.sourceDirectory), imports,
        {global: {display: {get_n_monitors: () => 2},
            settings: {is_writable: () => true}, get_current_time: () => 123}});
    const {DashSource} = await GjsHarness.loadGjsModule(
        new URL('components/dash/dashSource.js', GjsHarness.sourceDirectory), imports);
    const theme = {addActor: actor => themeActors.add(actor),
        removeActor: actor => themeActors.delete(actor)};
    const registrations = new Set();
    const transient = {register(actor, dismiss, relatedActors) {
        const registration = {actor, dismiss, relatedActors, paused: false};
        registrations.add(registration); return registration;
    }, unregister: registration => registrations.delete(registration)};
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
        const section = new DashSection(source, index, theme, transient, scale);
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
    function at(view, after = false) {
        const [x, y] = view.get_transformed_position();
        return [x + view.width * (after ? 0.75 : 0.25), y + view.height / 2];
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
    return {panel, source, view, at, pick, dispatch, finish, monitors, chrome, themeActors,
        DND, allocate, idles, timeouts, registrations, activatedWindows, makeWindow};
}

describe('Dash drag and drop', () => {
    it('favorite menu launches carry the owning dash monitor', async () => {
        const f = await fixture();
        f.source.monitorOnly = true;
        const app = f.source.favorites[0];
        const p = f.panel(1);
        const icon = f.view(p, 'firefox');
        icon.menu.items.find(item => item.label.text === 'New Window').activate();
        expect(f.source.launches).toEqual([[app, 1]]);
        app.get_app_info = () => ({list_actions: () => ['new-window'],
            get_action_name: () => 'New Window'});
        icon._populateMenu();
        icon.menu.items.find(item => item.label.text === 'New Window').activate();
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
        expect(f.pick(p, ...f.at(target, true))).toBe(target);
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
        dragged.draggable.emit('drag-begin');
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

    it('expanded dismissal, reopening and panel destruction release menus and transient resources', async () => {
        for (const scale of [1, 1.5, 2]) {
            const f = await fixture(scale);
            const p = f.panel(0, 250 * scale);
            p._openExpanded();
            const expanded = p._expandedSurface;
            const registration = [...f.registrations][0];
            expect(expanded.width).toBeLessThanOrEqual(250 * scale);
            expect(expanded.height).toBeLessThanOrEqual(600 * scale);
            expect(p._dash.visible).toBe(false);
            const icon = [...p._dragDrop._icons].find(view => view.draggable && expanded.contains(view));
            icon.menu.open();
            expect(registration.relatedActors.has(icon.menu.actor)).toBe(true);
            icon.draggable.emit('drag-begin');
            expect(registration.paused).toBe(true);
            f.finish(icon);
            expect(registration.paused).toBe(false);
            icon.menu.open();
            registration.dismiss();
            expect(p._expandedSurface).toBe(null);
            expect(p._dash.visible).toBe(true);
            expect(icon.menu.destroyed).toBe(true);
            expect(f.registrations.size).toBe(0);
            expect(f.chrome.size).toBe(0);
            expect(f.themeActors.size).toBe(0);
            expect(p._dragDrop._expandedSurface).toBe(null);
            expanded.destroy();
            p._openExpanded();
            expect(p._expandedSurface).not.toBe(expanded);
            expect(f.registrations.size).toBe(1);
            p.destroy();
            expect(f.registrations.size).toBe(0);
            expect(f.chrome.size).toBe(0);
            expect(f.themeActors.size).toBe(0);
            expect(f.monitors.size).toBe(0);
            expect(f.idles.size).toBe(0);
        }
    });
});

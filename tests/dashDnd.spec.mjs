import {loadGjsModule, SignalObject} from './gjsHarness.mjs';
import {projectDash} from '../components/dash/dashProjection.js';
import {
    DASH_BORDER_WIDTH, DASH_ITEM_SPACING, DASH_PADDING, SECTION_BORDER_WIDTH, SECTION_FRAME_WIDTH,
    SECTION_HEIGHT, DASH_DROP_PREVIEW_SIZE, DASH_DROP_PREVIEW_OPACITY,
} from '../constant.js';

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
        set_child(child) { this.child = child; this.add_child(child); }
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
        queue_relayout() {}
        destroy_all_children() { this.get_children().forEach(child => child.destroy()); }
        destroy() {
            this.emit('destroy');
            this.destroy_all_children();
            if (this.parent)
                this.parent.children = this.parent.children.filter(child => child !== this);
            this.parent = null;
            this.destroyed = true;
        }
    }
    const monitors = new Set();
    const chrome = new Set();
    const themeActors = new Set();
    const idles = new Map();
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
            ActorAlign: {FILL: 0, CENTER: 1}}},
        'gi://GLib': {default: {PRIORITY_DEFAULT_IDLE: 0, SOURCE_REMOVE: false,
            idle_add: (_priority, callback) => {
                const id = nextIdle++;
                idles.set(id, callback);
                return id;
            }, source_remove: id => idles.delete(id)}},
        'gi://GObject': {default: {registerClass: cls => cls}},
        'gi://Shell': {default: {util_set_hidden_from_pick: (actor, hidden) => {
            actor.hiddenFromPick = hidden;
        }}},
        'gi://St': {default: {Widget: Actor, Bin: Actor, Button: Actor,
            BoxLayout: Actor, Icon: Actor, ScrollView: Actor, ButtonMask: {ONE: 1},
            PolicyType: {NEVER: 0, AUTOMATIC: 1}}},
        'resource:///org/gnome/shell/ui/dnd.js': DND,
        'resource:///org/gnome/shell/ui/main.js': {layoutManager: {
            addTopChrome: (actor, options) => { actor.chromeOptions = options; chrome.add(actor); },
            removeChrome: actor => chrome.delete(actor),
        }},
        'resource:///org/gnome/shell/ui/popupMenu.js': {},
    };
    const {DashSection} = await loadGjsModule(
        new URL('../components/dashSection.js', import.meta.url), imports,
        {global: {settings: {is_writable: () => true}}});
    const theme = {addActor: actor => themeActors.add(actor),
        removeActor: actor => themeActors.delete(actor)};
    const transient = {register: () => ({paused: false}), unregister() {}};
    const item = appId => ({id: appId, appId, name: appId,
        app: {is_window_backed: () => false},
        createIcon: iconSize => new Actor({iconSize, width: iconSize * scale,
            height: iconSize * scale})});
    const source = {
        snapshot: {favorites: ['firefox', 'files', 'editor', 'music'].map(item),
            running: ['terminal', 'settings', 'calendar'].map(item), windows: [],
            hardcodedIds: new Set(['firefox', 'files'])},
        panels: [], changes: [], pauseCount: 0,
        project(monitorIndex, orders) {
            return projectDash({...this.snapshot, monitorIndex, ...orders});
        },
        pause() { this.pauseCount++; }, resume() { this.pauseCount--; },
        setFavorite(app, favorite) {
            this.changes.push([app.appId, favorite]);
            this.snapshot.favorites.push(app);
            this.panels.forEach(panel => { panel.refresh(); allocate(panel); });
        },
    };
    function allocate(panel) {
        panel.set_size(panel.preferredWidth,
            (SECTION_HEIGHT + (SECTION_FRAME_WIDTH + SECTION_BORDER_WIDTH) * 2) * scale);
        panel._frame.set_size(panel.width, panel.height);
        const frame = (SECTION_FRAME_WIDTH + SECTION_BORDER_WIDTH) * scale;
        panel._dash.set_position(frame, frame);
        panel._dash.set_size(panel.width - frame * 2, panel.height - frame * 2);
        let x = (Math.max(0, DASH_PADDING - SECTION_FRAME_WIDTH) + DASH_BORDER_WIDTH) * scale;
        for (const actor of panel._dash.get_children()) {
            actor.set_position(x, (panel._dash.height - actor.height) / 2);
            x += actor.width + DASH_ITEM_SPACING * scale;
        }
    }
    function panel(index = 0, width = 1000 * scale) {
        const section = new DashSection(source, index, theme, transient, scale);
        section.setAvailableSize(width, 600 * scale);
        section.set_position(80, 500);
        source.panels.push(section);
        section.onOrderChanged = () => { section.refresh(); allocate(section); };
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
        dragged._draggable.emit('drag-end');
        for (const [id, callback] of idles) {
            idles.delete(id);
            callback();
        }
    }
    const view = (section, appId) => [...section._views].find(icon => icon.item.appId === appId);
    return {panel, source, view, at, pick, dispatch, finish, monitors, chrome, themeActors,
        DND, allocate, idles};
}

describe('Dash drag and drop', () => {
    it('native pick/delegate traversal reaches icons, and running drops update system favorites', async () => {
        const f = await fixture();
        const p = f.panel();
        const other = f.panel(1);
        const dragged = f.view(p, 'terminal');
        const target = f.view(p, 'files');
        dragged._draggable.emit('drag-begin');
        expect(p.get_children()).toEqual([p._frame]);
        expect(p._frame.get_children()).toEqual([p._dash]);
        expect(f.pick(p, ...f.at(target, true))).toBe(target);
        expect(f.dispatch('hover', dragged, p, f.at(target, true))).toBe(f.DND.DragMotionResult.MOVE_DROP);
        expect(f.dispatch('drop', dragged, p, f.at(target, true))).toBe(true);
        expect(f.source.changes).withContext('changes wait until DND releases its actors').toEqual([]);
        f.finish(dragged);
        expect(f.source.pauseCount).toBe(0);
        expect(f.source.changes).toEqual([['terminal', true]]);
        expect(Array.from(p._projection.favorites, entry => entry.item.appId)).toEqual(['firefox', 'files', 'terminal', 'editor', 'music']);
        expect(Array.from(other._projection.favorites, entry => entry.item.appId)).toEqual(['firefox', 'files', 'editor', 'music', 'terminal']);
    });

    it('running and non-fixed favorite reordering is panel-local; fixed launchers stay fixed', async () => {
        const f = await fixture();
        const p = f.panel();
        const other = f.panel(1);
        for (const [from, to] of [['calendar', 'terminal'], ['music', 'editor']]) {
            const dragged = f.view(p, from);
            dragged._draggable.emit('drag-begin');
            expect(f.dispatch('drop', dragged, p, f.at(f.view(p, to)))).toBe(true);
            f.finish(dragged);
        }
        expect(Array.from(p._projection.running, entry => entry.item.appId)).toEqual(['calendar', 'terminal', 'settings']);
        expect(Array.from(other._projection.running, entry => entry.item.appId)).toEqual(['terminal', 'settings', 'calendar']);
        expect(Array.from(p._projection.favorites, entry => entry.item.appId)).toEqual(['firefox', 'files', 'music', 'editor']);
        expect(f.source.changes).toEqual([]);
        expect(f.view(p, 'files')._draggable).toBe(undefined);
        expect(f.dispatch('drop', f.view(p, 'terminal'), p, f.at(f.view(p, 'firefox')))).toBe(false);
    });

    it('16px translucent insertion preview is pick-transparent, scaled, and does not resize the dash', async () => {
        for (const scale of [1, 2]) {
            const f = await fixture(scale);
            const p = f.panel();
            const dragged = f.view(p, 'terminal');
            const target = f.view(p, 'editor');
            const originalWidth = p.width;
            dragged._draggable.emit('drag-begin');
            f.dispatch('hover', dragged, p, f.at(target));
            const preview = p._dropPreview;
            const beforeX = preview.x;
            expect(preview.width).toBe(DASH_DROP_PREVIEW_SIZE * scale);
            expect(preview.height).toBe(DASH_DROP_PREVIEW_SIZE * scale);
            expect(preview.child.iconSize).toBe(16);
            expect(preview.opacity).toBe(DASH_DROP_PREVIEW_OPACITY);
            expect(preview.reactive).toBe(false);
            expect(preview.hiddenFromPick).toBe(true);
            expect(preview.chromeOptions.affectsInputRegion).toBe(false);
            expect(preview.chromeOptions.affectsStruts).toBe(false);
            expect(f.chrome.has(preview)).toBeTruthy();
            f.dispatch('hover', dragged, p, f.at(target, true));
            expect(p._dropPreview).toBe(preview);
            expect(preview.x - beforeX).toBe(target.width + DASH_ITEM_SPACING * scale);
            expect(p.width).toBe(originalWidth);
            f.finish(dragged);
            expect(p._dropPreview).toBe(null);
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
        dragged._draggable.emit('drag-begin');
        const [x, y] = target.get_transformed_position();
        const paddingPoint = [x + target.width * 0.75, p.y];
        expect(f.pick(p, ...paddingPoint)).toBe(p._frame);
        expect(f.dispatch('hover', dragged, p, paddingPoint)).toBe(f.DND.DragMotionResult.MOVE_DROP);
        for (const monitor of f.monitors)
            monitor.dragMotion({targetActor: null});
        expect(p._dropPreview).toBe(null);
        f.dispatch('hover', dragged, p, f.at(target));
        f.dispatch('hover', dragged, p, f.at(f.view(p, 'firefox')));
        expect(p._dropPreview).toBe(null);
        f.dispatch('hover', dragged, p, f.at(target));
        expect(f.dispatch('drop', dragged, p, paddingPoint)).toBe(true);
        expect(p._dropPreview).toBe(null);
        f.finish(dragged);
        expect(Array.from(p._projection.running, entry => entry.item.appId)).toEqual(['terminal', 'calendar', 'settings']);
        const newDragged = f.view(p, 'settings');
        newDragged._draggable.emit('drag-begin');
        // Explicit section fallback models a pick on the border/background itself.
        const beforeTarget = f.view(p, 'terminal');
        const [tx, ty] = beforeTarget.get_transformed_position();
        expect(p._delegate.handleDragOver(newDragged, null, tx - p.x, ty - p.y)).toBe(f.DND.DragMotionResult.MOVE_DROP);
        p.destroy();
        expect(f.source.pauseCount).toBe(0);
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
        const frame = SECTION_FRAME_WIDTH + SECTION_BORDER_WIDTH;
        surface._content.set_position(frame, frame);
        surface._content.set_size(surface.width - frame * 2, surface.height - frame * 2);
        surface._content.child.set_size(surface._content.width, surface._content.height);
        grid.set_position(DASH_BORDER_WIDTH, DASH_BORDER_WIDTH);
        const views = grid.children.filter(actor => actor.entry);
        const dragged = views.find(icon => icon.item.appId === 'calendar');
        const target = views.find(icon => icon.item.appId === 'terminal');
        dragged._draggable.emit('drag-begin');
        expect(f.dispatch('hover', dragged, surface, f.at(target))).toBe(f.DND.DragMotionResult.MOVE_DROP);
        expect(p._dropPreview).toBeTruthy();
        const [x, y] = target.get_transformed_position();
        const [sx, sy] = surface.get_transformed_position();
        expect(surface._delegate.handleDragOver(dragged, null, x - sx, y - sy)).toBe(f.DND.DragMotionResult.MOVE_DROP);
        expect(f.dispatch('drop', dragged, surface, f.at(target))).toBe(true);
        f.finish(dragged);
        expect(p._expandedSurface).toBe(null);
        expect(p._dropPreview).toBe(null);
        expect(f.source.pauseCount).toBe(0);
        expect(Array.from(p._projection.running, entry => entry.item.appId)).toEqual(['calendar', 'terminal', 'settings']);
    });
});

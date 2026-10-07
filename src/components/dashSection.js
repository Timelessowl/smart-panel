import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as DND from '@girs/gnome-shell/ui/dnd';
import * as Main from '@girs/gnome-shell/ui/main';

import * as Constants from '@/constant.js';
import {BaseSection} from '@/components/baseSection.js';
import {DashIcon} from '@/components/dash/dashIcon.js';
import * as DashLayout from '@/components/dash/dashLayout.js';
import * as AppActivation from '@/components/dash/appActivation.js';

// The native frame already provides the outer inset. Only add any
// requested dash padding that extends beyond it, rather than counting it twice.
const CONTENT_PADDING = Math.max(0, Constants.DASH_PADDING - Constants.SECTION_FRAME_WIDTH);
const CONTENT_INSET = Constants.SECTION_BORDER_WIDTH + Constants.SECTION_FRAME_WIDTH +
    CONTENT_PADDING + Constants.DASH_BORDER_WIDTH;

export class DashSection extends BaseSection {
    static {
        GObject.registerClass(this);
    }

    constructor(source, monitorIndex, themeManager, transientInputManager, scaleFactor = 1) {
        super();
        this.canExpand = true;
        this.preferredWidth = 0;
        this.onOrderChanged = null;
        this._source = source;
        this._monitorIndex = monitorIndex;
        this._themeManager = themeManager;
        this._transientInputManager = transientInputManager;
        this._scaleFactor = scaleFactor;
        this._availableWidth = 0;
        this._maxExpansionHeight = this._scale(Constants.SECTION_HEIGHT);
        this._expandedSurface = null;
        this._dismissRegistration = null;
        this._views = new Set();
        this._menuActors = new Set();
        this._orders = {favoriteOrder: [], runningOrder: []};
        this._activationCycle = null;
        this._dropId = 0;
        this._dropPreview = null;
        this._previewDraggable = null;
        this._previewDragEndId = 0;
        this._dropMonitor = {
            dragMotion: event => {
                const inside = event.targetActor && (this.contains(event.targetActor) ||
                    this._expandedSurface?.contains(event.targetActor));
                if (!inside)
                    this._clearDropPreview();
                return DND.DragMotionResult.CONTINUE;
            },
            dragDrop: () => {
                this._clearDropPreview();
                return DND.DragDropResult.CONTINUE;
            },
        };
        this._dash = new St.BoxLayout({style_class: 'dash-section',
            style: `padding: 0 ${CONTENT_PADDING}px; spacing: ${Constants.DASH_ITEM_SPACING}px;`});
        this.setSectionContent(this._dash);
        this.refresh();
        DND.addDragMonitor(this._dropMonitor);
    }

    refresh() {
        this.closeExpanded();
        this._projection = this._source.project(this._monitorIndex, this._orders);
        this._entries = [...this._projection.favorites, ...this._projection.running];
        this._rebuildCollapsed();
    }

    setAvailableSize(width, maxExpansionHeight) {
        if (width === this._availableWidth && maxExpansionHeight === this._maxExpansionHeight)
            return;
        this.closeExpanded();
        this._availableWidth = width;
        this._maxExpansionHeight = Math.max(this._scale(Constants.SECTION_HEIGHT), maxExpansionHeight);
        this._rebuildCollapsed();
    }

    _rebuildCollapsed() {
        this._dash.destroy_all_children();
        const inset = this._scale(CONTENT_INSET);
        this._layout = DashLayout.layoutDash(this._entries, this._availableWidth, inset, this._scaleFactor);
        this.preferredWidth = this._layout.width;
        const height = this._scale(Constants.SECTION_HEIGHT - Constants.DASH_BORDER_WIDTH * 2);
        for (const token of this._layout.tokens)
            this._dash.add_child(this._createToken(token, height));
        this._makeDropZone(this._dash);
        this._dash.queue_relayout();
    }

    _createToken(token, height) {
        const width = this._scale(token.width);
        if (token.type === 'launchpad') {
            const button = new St.Button({style_class: 'dash-app-button dash-launchpad',
                accessible_name: 'Toggle overview', can_focus: true, width, height,
                child: new St.Icon({icon_name: 'view-app-grid-symbolic', icon_size: Constants.DASH_ICON_SIZE})});
            button.connect('clicked', () => {
                this._activationCycle = null;
                this.closeExpanded();
                Main.overview.toggle();
            });
            return button;
        }
        if (token.type === 'separator') {
            return new St.Bin({
                width, height: this._scale(this._layout.iconSize),
                y_align: Clutter.ActorAlign.CENTER,
                child: new St.Widget({style_class: 'dash-running-separator',
                    width: this._scale(1), x_align: Clutter.ActorAlign.CENTER, y_expand: true})});
        }
        if (token.type === 'overflow') {
            const button = new St.Button({label: `+${token.hiddenCount}`, width, height,
                style_class: 'dash-app-button dash-overflow-button', can_focus: true,
                accessible_name: `Show ${token.hiddenCount} more apps or windows`});
            button.connect('clicked', () => this._openExpanded());
            return button;
        }
        const view = new DashIcon(token.entry, this, this._layout.iconSize, width, height);
        this._views.add(view);
        view.connect('destroy', () => this._views.delete(view));
        return view;
    }

    _scale(value) {
        return Math.round(value * this._scaleFactor);
    }

    _openExpanded() {
        if (this._expandedSurface || !this._layout.hiddenCount)
            return;
        const inset = this._scale(CONTENT_INSET);
        const rows = DashLayout.expandedRows(this._entries, this._layout.iconSize,
            this._availableWidth - inset * 2, this._scaleFactor);
        const rowHeight = this._scale(Constants.DASH_ICON_SIZE + Constants.DASH_ITEM_INSET);
        const spacing = this._scale(Constants.DASH_ITEM_SPACING);
        const gridWidth = Math.max(...rows.map(row => DashLayout.tokensWidth(row, this._scaleFactor)));
        const gridHeight = rows.length * rowHeight + (rows.length - 1) * spacing;
        const grid = new St.Widget({layout_manager: new Clutter.FixedLayout(),
            width: gridWidth, height: gridHeight});
        rows.forEach((row, rowIndex) => {
            let x = 0;
            for (const token of row) {
                const actor = this._createToken(token, rowHeight);
                actor.set_position(x, rowIndex * (rowHeight + spacing) +
                    (token.type === 'separator' ? (rowHeight - actor.height) / 2 : 0));
                grid.add_child(actor);
                x += this._scale(token.width) + spacing;
            }
        });
        const scroll = new St.ScrollView({style_class: 'dash-expanded-content',
            style: `padding: ${CONTENT_PADDING}px;`, enable_mouse_scrolling: true,
            overlay_scrollbars: true});
        scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        const scrollContent = new St.BoxLayout({vertical: true});
        scrollContent.add_child(grid);
        scroll.set_child(scrollContent);
        this._expandedSurface = new BaseSection();
        this._expandedSurface.add_style_class_name('dash-expanded');
        this._expandedSurface.setSectionContent(scroll);
        this._makeDropZone(grid, this._expandedSurface);
        const surfaceHeight = Math.min(gridHeight + inset * 2, this._maxExpansionHeight);
        this._expandedSurface.set_size(Math.min(this._availableWidth, gridWidth + inset * 2),
            surfaceHeight);
        const [x, y] = this.get_transformed_position();
        this._expandedSurface.set_position(Math.round(x), Math.round(y + this.height - surfaceHeight));
        this._setContentVisible(false);
        this._themeManager.addActor(this._expandedSurface);
        Main.layoutManager.addTopChrome(this._expandedSurface, {
            affectsInputRegion: true, affectsStruts: false, trackFullscreen: true,
        });
        this._dismissRegistration = this._transientInputManager.register(
            this._expandedSurface, () => this.closeExpanded(), this._menuActors);
    }

    closeExpanded() {
        this._clearDropPreview();
        if (!this._expandedSurface)
            return;
        this._transientInputManager.unregister(this._dismissRegistration);
        this._dismissRegistration = null;
        this._themeManager.removeActor(this._expandedSurface);
        Main.layoutManager.removeChrome(this._expandedSurface);
        this._expandedSurface.destroy();
        this._expandedSurface = null;
        this._setContentVisible(true);
    }

    activateEntry(entry) {
        if (this._source.perWindow) {
            this._activationCycle = null;
            const window = entry.representedWindow?.window;
            if (window)
                Main.activateWindow(window);
            else
                entry.item.app.open_new_window(-1);
        } else {
            const {action, cycle} = AppActivation.nextAppAction(this._activationCycle, entry);
            this._activationCycle = cycle;
            if (action.type === 'focus')
                Main.activateWindow(action.window.window);
            else if (action.type === 'minimize')
                action.windows.forEach(item => item.window.minimize());
            else
                entry.item.app.open_new_window(-1);
        }
        this.closeExpanded();
    }

    isFavorite(appId) {
        return this._source.snapshot.favorites.some(item => item.appId === appId);
    }

    setFavorite(item, favorite) {
        this._source.setFavorite(item, favorite);
    }

    menuChanged(actor, open) {
        if (open)
            this._menuActors.add(actor);
        else
            this._menuActors.delete(actor);
    }

    dragStarted() {
        this._source.pause();
        if (this._dismissRegistration)
            this._dismissRegistration.paused = true;
    }

    dragEnded() {
        this._source.resume();
        this._clearDropPreview();
        if (this._dismissRegistration)
            this._dismissRegistration.paused = false;
    }

    /**
     * Shell DND attaches delegates to the participating actors.
     * @param {St.Widget & {_delegate?: object}} actor
     * @param {BaseSection & {_delegate?: object}} [surface]
     */
    _makeDropZone(actor, surface = this) {
        const targetAt = (x, y) => {
            const icons = actor.get_children().filter(child => child instanceof DashIcon);
            return icons.sort((a, b) =>
                Math.hypot(a.x + a.width / 2 - x, a.y + a.height / 2 - y) -
                Math.hypot(b.x + b.width / 2 - x, b.y + b.height / 2 - y))[0];
        };
        const delegateFor = container => {
            const pickTarget = (x, y) => {
                if (container !== actor) {
                    const [stageX, stageY] = container.get_transformed_position();
                    const [stageWidth, stageHeight] = container.get_transformed_size();
                    const [ok, actorX, actorY] = actor.transform_stage_point(
                        stageX + x * stageWidth / container.width,
                        stageY + y * stageHeight / container.height);
                    if (!ok)
                        return null;
                    x = actorX;
                    y = actorY;
                }
                const target = targetAt(x, y);
                return target ? {target, after: x > target.x + target.width / 2} : null;
            };
            return {
                handleDragOver: (source, _dragActor, x, y) => {
                    const hit = pickTarget(x, y);
                    if (!hit) {
                        this._clearDropPreview();
                        return DND.DragMotionResult.NO_DROP;
                    }
                    return this.dragOver(source, hit.target.entry, hit.after, hit.target);
                },
                acceptDrop: (source, _dragActor, x, y) => {
                    const hit = pickTarget(x, y);
                    return hit ? this.drop(source, hit.target.entry, hit.after) : false;
                },
            };
        };
        actor._delegate = delegateFor(actor);
        // Border/padding picks still reach a delegate, even without an icon hit.
        surface._delegate = delegateFor(surface);
    }

    _canDrop(source, target, after) {
        const entry = source instanceof DashIcon ? source.entry : null;
        if (!entry || (entry.group === 'favorites' && entry.hardcoded))
            return false;
        if (target.group === 'running')
            return entry.group === 'running';
        if (entry.hardcoded || entry.item.app.is_window_backed() ||
            (!this.isFavorite(entry.item.appId) && !global.settings.is_writable('favorite-apps')))
            return false;
        const fixed = this._projection.favorites.filter(item => item.hardcoded);
        return !target.hardcoded || (after && target === fixed.at(-1));
    }

    dragOver(source, target, after, targetView) {
        if (!this._canDrop(source, target, after)) {
            this._clearDropPreview();
            return DND.DragMotionResult.NO_DROP;
        }
        this._showDropPreview(source, targetView, after);
        return DND.DragMotionResult.MOVE_DROP;
    }

    _showDropPreview(source, targetView, after) {
        if (this._previewDraggable !== source._draggable)
            this._clearDropPreview();
        const size = this._scale(Constants.DASH_DROP_PREVIEW_SIZE);
        if (!this._dropPreview) {
            this._dropPreview = new St.Bin({
                style_class: 'dash-drop-preview', width: size, height: size,
                opacity: Constants.DASH_DROP_PREVIEW_OPACITY, reactive: false,
                child: source.item.createIcon(Constants.DASH_DROP_PREVIEW_SIZE),
            });
            Shell.util_set_hidden_from_pick(this._dropPreview, true);
            this._themeManager.addActor(this._dropPreview);
            Main.layoutManager.addTopChrome(this._dropPreview, {
                affectsInputRegion: false, affectsStruts: false, trackFullscreen: true,
            });
            this._previewDraggable = source._draggable;
            this._previewDragEndId = this._previewDraggable.connect('drag-end', () =>
                this._clearDropPreview());
        }
        const surface = this._expandedSurface?.contains(targetView)
            ? this._expandedSurface : this;
        const [surfaceX, surfaceY] = surface.get_transformed_position();
        const [surfaceWidth, surfaceHeight] = surface.get_transformed_size();
        const [x, y] = targetView.get_transformed_position();
        const [width, height] = targetView.get_transformed_size();
        const spacing = this._scale(Constants.DASH_ITEM_SPACING);
        const insertionX = after ? x + width + spacing / 2 : x - spacing / 2;
        this._dropPreview.set_position(
            Math.round(Math.max(surfaceX, Math.min(insertionX - size / 2,
                surfaceX + surfaceWidth - size))),
            Math.round(Math.max(surfaceY, Math.min(y + (height - size) / 2,
                surfaceY + surfaceHeight - size))));
    }

    _clearDropPreview() {
        if (this._previewDragEndId)
            this._previewDraggable.disconnect(this._previewDragEndId);
        this._previewDragEndId = 0;
        this._previewDraggable = null;
        if (this._dropPreview) {
            this._themeManager.removeActor(this._dropPreview);
            Main.layoutManager.removeChrome(this._dropPreview);
            this._dropPreview.destroy();
            this._dropPreview = null;
        }
    }

    drop(source, target, after) {
        this._clearDropPreview();
        if (this._dropId || !this._canDrop(source, target, after))
            return false;
        const entry = source.entry;
        // DND must finish releasing its actors before any icon is rebuilt.
        this._dropId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._dropId = 0;
            const favorites = target.group === 'favorites';
            const entries = this._projection[target.group];
            const key = item => favorites ? item.item.appId : item.item.id;
            const order = entries.map(key);
            const sourceKey = key(entry);
            const targetKey = key(target);
            if (sourceKey !== targetKey) {
                const remaining = order.filter(id => id !== sourceKey);
                remaining.splice(remaining.indexOf(targetKey) + (after ? 1 : 0), 0, sourceKey);
                this._orders[favorites ? 'favoriteOrder' : 'runningOrder'] = remaining;
            }
            if (favorites && !this.isFavorite(entry.item.appId))
                this.setFavorite(entry.item, true);
            else
                this.onOrderChanged?.();
            return GLib.SOURCE_REMOVE;
        });
        return true;
    }

    destroy() {
        DND.removeDragMonitor(this._dropMonitor);
        if (this._dropId)
            GLib.source_remove(this._dropId);
        this._dropId = 0;
        this.closeExpanded();
        super.destroy();
        this._source = null;
        this._menuActors.clear();
    }
}

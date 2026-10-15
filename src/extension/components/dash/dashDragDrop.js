import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as DND from '@girs/gnome-shell/ui/dnd';
import * as Main from '@girs/gnome-shell/ui/main';
import * as Constants from '@/extension/constants.js';
import {DashIcon} from '@/extension/components/dash/dashIcon.js';
import * as DashLayout from '@/extension/components/dash/dashLayout.js';

// One controller per dash: Shell drag plumbing, temporary previews and local
// ordering live here. Shared application/window state keeps updating normally.
export class DashDragDrop {
    constructor(section, source, themeManager, scaleFactor) {
        this._section = section;
        this._source = source;
        this._themeManager = themeManager;
        this._scaleFactor = scaleFactor;
        this.orders = {favoriteOrder: [], runningOrder: []};
        this._icons = new Set();
        this._entries = null;
        this._expandedSurface = null;
        this._dropId = 0;
        this._dragging = false;
        this._refreshPending = false;
        this._dragRefreshId = 0;
        this._dropPreview = null;
        this._previewDraggable = null;
        this._previewDragEndId = 0;
        this._destroyed = false;
        this._lastRejection = null;
        this._dropMonitor = {
            dragMotion: event => {
                const inside = event.targetActor && (section.contains(event.targetActor) ||
                    this._expandedSurface?.contains(event.targetActor));
                if (!inside)
                    this.clearPreview();
                return DND.DragMotionResult.CONTINUE;
            },
            dragDrop: () => {
                this.clearPreview();
                return DND.DragDropResult.CONTINUE;
            },
        };
        DND.addDragMonitor(this._dropMonitor);
        section.connect('destroy', () => this.destroy());
    }

    updateEntries(entries) {
        this._entries = entries;
    }

    deferRefresh() {
        if (this._dragging || this._dropId || this._dragRefreshId) {
            this._refreshPending = true;
            return true;
        }
        this._refreshPending = false;
        return false;
    }

    setExpandedSurface(surface) {
        this.clearPreview();
        this._expandedSurface?.setDragging(false);
        this._expandedSurface = surface;
        surface?.setDragging(this._dragging);
    }

    attachIcon(icon) {
        this._icons.add(icon);
        icon.dragDrop = this;
        if (icon.draggable) {
            icon.draggable.connect('drag-begin', () => this._dragStarted(icon));
            icon.draggable.connect('drag-cancelled', () => this._log('cancelled', icon));
            icon.draggable.connect('drag-end', (_draggable, _time, success) => {
                this._log('ended', icon, `success=${Boolean(success)}`);
                if (icon.dragging)
                    this._dragEnded(icon);
            });
        }
        icon.connect('destroy', () => {
            this._icons.delete(icon);
            if (!this._destroyed && icon.dragging)
                this._dragEnded(icon);
            icon.dragDrop = null;
        });
    }

    _scale(value) {
        return DashLayout.scaleDimension(value, this._scaleFactor);
    }

    _log(event, icon, detail = '') {
        console.info(`[dash-dnd] ${event} monitor=${this._section?._monitorIndex} ` +
            `app=${icon?.item?.appId ?? 'external'} ${detail}`.trimEnd());
    }

    notePress(icon) {
        this._log('press', icon, icon.entry.hardcoded && icon.entry.group === 'favorites'
            ? 'fixed favorite; dragging disabled' : 'draggable=true');
    }

    _dragStarted(icon) {
        if (this._destroyed)
            return;
        this._log('started', icon, `group=${icon.entry.group}`);
        this._lastRejection = null;
        icon.dragging = true;
        this._dragging = true;
        this._expandedSurface?.setDragging(true);
    }

    _dragEnded(icon) {
        icon.dragging = false;
        if (this._destroyed)
            return;
        this._dragging = false;
        this.clearPreview();
        this._expandedSurface?.setDragging(false);
        // DND releases its actors after drag-end callbacks return. Only this
        // view's rebuild waits; shared state and other monitors stay current.
        if (this._refreshPending && !this._dragRefreshId) {
            this._dragRefreshId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._dragRefreshId = 0;
                this._section.refresh();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    /**
     * Shell DND attaches delegates to the participating actors.
     * @param {St.Widget & {_delegate?: object}} actor
     * @param {St.Widget & {_delegate?: object}} [surface]
     */
    addDropZone(actor, surface = this._section) {
        const delegateFor = container => {
            const pickTarget = (x, y) => this._pickTarget(actor, container, x, y);
            return {
                handleDragOver: (source, _dragActor, x, y) => {
                    const hit = pickTarget(x, y);
                    if (!hit) {
                        this.clearPreview();
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

    _pickTarget(row, container, x, y) {
        if (container !== row) {
            const [stageX, stageY] = container.get_transformed_position();
            const [stageWidth, stageHeight] = container.get_transformed_size();
            const [ok, rowX, rowY] = row.transform_stage_point(
                stageX + x * stageWidth / container.width,
                stageY + y * stageHeight / container.height);
            if (!ok)
                return null;
            x = rowX;
            y = rowY;
        }
        let nearest = null;
        let distance = Infinity;
        for (const icon of this._icons) {
            if (!row.contains(icon))
                continue;
            const [stageX, stageY] = icon.get_transformed_position();
            const [width, height] = icon.get_transformed_size();
            const [ok, centerX, centerY] = row.transform_stage_point(
                stageX + width / 2, stageY + height / 2);
            if (!ok)
                continue;
            const current = Math.hypot(centerX - x, centerY - y);
            if (current < distance) {
                distance = current;
                nearest = {target: icon, after: x > centerX};
            }
        }
        return nearest;
    }

    _dropRejection(source, target, after) {
        if (this._destroyed)
            return 'dash destroyed';
        const entry = source instanceof DashIcon ? source.entry : null;
        if (!entry)
            return 'unsupported drag source';
        if (entry.group === 'favorites' && entry.hardcoded)
            return 'fixed favorite';
        if (target.group === 'running')
            return entry.group === 'running' ? null : 'favorites cannot be moved into running';
        if (!this._source.canReorderFavorite(entry.item.app) ||
            (!this._source.isFavorite(entry.item.appId) && !this._source.canSetFavorite(entry.item.app)))
            return 'application cannot be reordered or added to favorites';
        const fixed = this._entries.favorites.filter(item => item.hardcoded);
        return !target.hardcoded || (after && target === fixed.at(-1))
            ? null : 'cannot insert before fixed favorites';
    }

    dragOver(source, target, after, targetView) {
        const reason = this._dropRejection(source, target, after);
        if (reason) {
            const rejection = `${source?.item?.id}:${target.item.id}:${after}:${reason}`;
            if (rejection !== this._lastRejection)
                this._log('hover rejected', source, `target=${target.item.appId} reason=${reason}`);
            this._lastRejection = rejection;
            this.clearPreview();
            return DND.DragMotionResult.NO_DROP;
        }
        this._lastRejection = null;
        this._showDropPreview(source, targetView, after);
        return DND.DragMotionResult.MOVE_DROP;
    }

    _showDropPreview(source, targetView, after) {
        if (this._previewDraggable !== source.draggable)
            this.clearPreview();
        const size = this._scale(Constants.DASH_DROP_PREVIEW_SIZE);
        if (!this._dropPreview) {
            this._dropPreview = new St.Bin({
                style_class: 'dash-drop-preview', width: size, height: size,
                opacity: Constants.DASH_DROP_PREVIEW_OPACITY, reactive: false,
                child: source.item.app.create_icon_texture(Constants.DASH_DROP_PREVIEW_SIZE),
            });
            Shell.util_set_hidden_from_pick(this._dropPreview, true);
            this._themeManager.addActor(this._dropPreview);
            Main.layoutManager.addTopChrome(this._dropPreview, {
                affectsInputRegion: false, affectsStruts: false, trackFullscreen: true,
            });
            this._previewDraggable = source.draggable;
            this._previewDragEndId = this._previewDraggable.connect('drag-end', () =>
                this.clearPreview());
        }
        const surface = this._expandedSurface?.contains(targetView)
            ? this._expandedSurface : this._section;
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

    clearPreview() {
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
        this.clearPreview();
        const reason = this._dropId ? 'another drop is pending' : this._dropRejection(source, target, after);
        if (reason) {
            this._log('drop rejected', source, `target=${target.item.appId} reason=${reason}`);
            return false;
        }
        const entry = source.entry;
        this._log('drop accepted', source, `target=${target.item.appId} after=${after} group=${target.group}`);
        // DND must finish releasing its actors before any icon is rebuilt.
        this._dropId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._dropId = 0;
            const favorites = target.group === 'favorites';
            const entries = this._entries[target.group];
            const key = item => favorites ? item.item.appId : item.item.id;
            const order = entries.map(key);
            const sourceKey = key(entry);
            const targetKey = key(target);
            if (sourceKey !== targetKey) {
                const remaining = order.filter(id => id !== sourceKey);
                remaining.splice(remaining.indexOf(targetKey) + (after ? 1 : 0), 0, sourceKey);
                this.orders[favorites ? 'favoriteOrder' : 'runningOrder'] = remaining;
                this._log('order applied', source, `group=${target.group} order=${remaining.join(',')}`);
            }
            if (favorites && !this._source.isFavorite(entry.item.appId))
                this._source.setFavorite(entry.item.app, true);
            else if (!this._dragRefreshId)
                this._section.refresh();
            return GLib.SOURCE_REMOVE;
        });
        return true;
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._dragging = false;
        this._refreshPending = false;
        if (this._dragRefreshId)
            GLib.source_remove(this._dragRefreshId);
        this._dragRefreshId = 0;
        if (this._dropId)
            GLib.source_remove(this._dropId);
        this._dropId = 0;
        DND.removeDragMonitor(this._dropMonitor);
        this.setExpandedSurface(null);
        this._icons.clear();
        this._section = null;
        this._source = null;
    }
}

/*
 * Preview menu/list/item structure and compositor thumbnail scheduling adapted
 * from Dash to Dock (micheleg/dash-to-dock, windowPreview.js, GPL-2.0-or-later).
 * Its original credits include Dash to Panel, Zorin OS Taskbar and GNOME Shell.
 * Hover peeking follows the supplied Dash to Panel reference. The dash source
 * remains responsible for grouping and monitor isolation.
 */
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as BoxPointer from '@girs/gnome-shell/ui/boxpointer';
import * as Main from '@girs/gnome-shell/ui/main';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';

import * as Constants from '@/extension/constants.js';
import * as Utils from '@/utils/utils.js';

let activePreview = null;

export class WindowPreviewMenu extends PopupMenu.PopupMenu {
    constructor(source, owner) {
        super(source, 0.5, St.Side.BOTTOM);
        this._source = source;
        this._owner = owner;
        this._openId = 0;
        this._closeId = 0;
        this._peekId = 0;
        this._ensureVisibleId = 0;
        this._titleHideId = 0;
        this._previewList = null;
        this._registration = null;
        this._hasChrome = false;
        this._destroyed = false;
        this._dragInProgress = false;
        this._tooltip = null;
        this._peekedWindow = null;
        this._initialWorkspace = null;
        this._peekWorkspace = null;
        this._peekActors = new Map();
        this.actor.add_style_class_name('app-menu');
        this.actor.hide();
        this.box.set_style('padding: 0;');

        // PopupMenu already handles source unmapping and session/system modals.
        // Use its actor as the lifetime owner for our additional connections.
        source.draggable.connectObject('drag-begin', () => this.close(), this.actor);
        Main.overview.connectObject('showing', () => this.close(), this.actor);
        Main.overview.connectObject(
            'item-drag-begin',
            () => {
                this._dragInProgress = true;
                this.close();
            },
            this.actor,
        );
        Main.overview.connectObject(
            'item-drag-end',
            () => {
                this._dragInProgress = false;
            },
            this.actor,
        );
        this.actor.connect('enter-event', () => {
            this._cancelTimeout('_closeId');
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('leave-event', (_actor, event) => {
            const related = event.get_related();
            if (!related || !this.actor.contains(related)) this.scheduleClose();
            return Clutter.EVENT_PROPAGATE;
        });
        this.actor.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape) return Clutter.EVENT_PROPAGATE;
            this.close();
            return Clutter.EVENT_STOP;
        });
    }

    getWindows() {
        const source = this._owner._source;
        return source
            .getAppWindows(this._source.app, source.monitorOnly ? this._owner._monitorIndex : null)
            .filter(
                (window) =>
                    !window.skip_taskbar &&
                    (!this._source.entry.representedWindow || window === this._source.entry.representedWindow),
            )
            .sort((a, b) => b.get_user_time() - a.get_user_time());
    }

    _cancelTimeout(property) {
        if (this[property]) GLib.source_remove(this[property]);
        this[property] = 0;
    }

    _canOpen() {
        return (
            !this._destroyed &&
            !this._dragInProgress &&
            this._source.mapped &&
            !this._source.dragging &&
            !this._source._dragging &&
            !this._source.pressed &&
            !this._source._menu?.isOpen &&
            !Main.overview.visible &&
            !Main.sessionMode.isLocked &&
            !Main.sessionMode.isGreeter
        );
    }

    scheduleOpen() {
        this._cancelTimeout('_closeId');
        if (this.isOpen || this._openId || !this._canOpen()) return;
        this._openId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Constants.WINDOW_PREVIEW_OPEN_DELAY, () => {
            this._openId = 0;
            if (this._source.hover) this.open();
            return GLib.SOURCE_REMOVE;
        });
    }

    scheduleClose() {
        this._cancelTimeout('_openId');
        this._cancelTimeout('_closeId');
        this._closeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Constants.WINDOW_PREVIEW_CLOSE_DELAY, () => {
            this._closeId = 0;
            this.close();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onKeyPress() {
        // DashIcon owns keyboard activation and the Up key that opens previews.
        return Clutter.EVENT_PROPAGATE;
    }

    open(animate = BoxPointer.PopupAnimation.FULL) {
        this._cancelTimeout('_openId');
        this._cancelTimeout('_closeId');
        if (this.isOpen || !this._canOpen() || !this.getWindows().length) return;
        activePreview?.close();
        activePreview = this;
        const area = Main.layoutManager.getWorkAreaForMonitor(this._owner._monitorIndex);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this.actor.set_style(
            `min-width: 0px; ` +
                `max-width: ${Math.round(area.width / scale) - Constants.WINDOW_PREVIEW_MARGIN}px; ` +
                `max-height: ${Math.round(area.height / scale) - Constants.WINDOW_PREVIEW_MARGIN}px;`,
        );
        Main.layoutManager.addTopChrome(this.actor, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: true,
        });
        this._hasChrome = true;
        this._previewList = new WindowPreviewList(this);
        this.addMenuItem(this._previewList);
        this._previewList.redisplay();
        super.open(animate);
        if (!this.isOpen) {
            this.close();
            return;
        }
        // A hover popup has no modal grab, so the pointer can move between icons.
        this._owner.menuChanged(this.actor, true);
        this._registration = this._owner._transientInputManager.register(
            this.actor,
            () => this.close(),
            new Set([this._source]),
        );
        this._source.setForcedHighlight(true);
        this._source.emit('sync-tooltip');
    }

    close(animate = BoxPointer.PopupAnimation.NONE) {
        this._cancelTimeout('_openId');
        this._cancelTimeout('_closeId');
        this._cancelTimeout('_ensureVisibleId');
        this.endPeek();
        this.hideTitle();
        if (activePreview === this) activePreview = null;
        if (this._registration) {
            this._owner._transientInputManager.unregister(this._registration);
            this._registration = null;
            this._owner.menuChanged(this.actor, false);
            this._source.setForcedHighlight(false);
        }
        super.close(animate);
        const list = this._previewList;
        this._previewList = null;
        list?.destroy();
        if (this._hasChrome) {
            Main.layoutManager.removeChrome(this.actor);
            this._hasChrome = false;
        }
    }

    requestPeek(item) {
        this._cancelTimeout('_peekId');
        if (!this.isOpen) return;
        this.ensureVisible(item);
        this._peekId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Constants.WINDOW_PREVIEW_PEEK_DELAY, () => {
            this._peekId = 0;
            if (this.isOpen && item.hover) this._peekWindow(item.window);
            return GLib.SOURCE_REMOVE;
        });
    }

    ensureVisible(item) {
        this._cancelTimeout('_ensureVisibleId');
        const adjustment = this._previewList._scroll.hadjustment;
        if (adjustment.upper <= adjustment.page_size) return;
        this._ensureVisibleId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            Constants.WINDOW_PREVIEW_ENSURE_VISIBLE_DELAY,
            () => {
                this._ensureVisibleId = 0;
                if (this.isOpen && this._previewList._items.get(item.window) === item)
                    this._previewList.ensureVisible(item);
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _peekWindow(window) {
        if (this._peekedWindow === window) return;
        this.endPeek();
        const workspace = window.get_workspace();
        if (!window.get_compositor_private() || !workspace) return;
        this._peekedWindow = window;
        this._initialWorkspace = global.workspace_manager.get_active_workspace();
        this._peekWorkspace = window.is_on_all_workspaces() ? this._initialWorkspace : workspace;
        this._switchWorkspace(this._peekWorkspace);
        const family = new Set([window]);
        window.foreach_transient((transient) => family.add(transient));
        // Snapshot before raising anything; otherwise later sibling indices move.
        for (const actor of global.get_window_actors()) {
            if (!actor.meta_window.located_on_workspace(this._peekWorkspace)) continue;
            const selected = family.has(actor.meta_window);
            if (!selected && !actor.visible) continue;
            const parent = actor.get_parent();
            const siblings = parent?.get_children() ?? [];
            this._peekActors.set(actor, {
                opacity: actor.opacity,
                visible: actor.visible,
                selected,
                parent,
                siblings,
                index: siblings.indexOf(actor),
            });
            actor.connectObject('destroy', () => this._peekActors.delete(actor), this.actor);
        }
        const actors = [...this._peekActors].sort((a, b) => a[1].index - b[1].index);
        for (const [actor, state] of actors) {
            if (state.selected) {
                actor.show();
                state.parent?.set_child_above_sibling(actor, null);
            }
            Utils.animateOpacity(
                actor,
                state.selected ? 255 : Math.min(state.opacity, Constants.WINDOW_PREVIEW_PEEK_OPACITY),
                Constants.WINDOW_PREVIEW_FADE_TIME,
            );
        }
    }

    endPeek(stayHere = false) {
        this._cancelTimeout('_peekId');
        if (!this._peekedWindow) return;
        const actors = [...this._peekActors].sort((a, b) => a[1].index - b[1].index);
        for (const [actor, state] of actors) {
            actor.disconnectObject(this.actor);
            // Restore synchronously before another peek can snapshot a partial fade.
            actor.remove_transition('opacity');
            actor.opacity = state.opacity;
            if (!state.visible) actor.hide();
            if (state.selected && state.index >= 0 && actor.get_parent() === state.parent) {
                const siblings = state.parent.get_children();
                const below = state.siblings
                    .slice(0, state.index)
                    .reverse()
                    .find((sibling) => siblings.includes(sibling));
                if (below) state.parent.set_child_above_sibling(actor, below);
                else state.parent.set_child_at_index(actor, 0);
            }
        }
        this._peekActors.clear();
        // Respect a workspace change the user made while the preview was open.
        if (!stayHere && global.workspace_manager.get_active_workspace() === this._peekWorkspace)
            this._switchWorkspace(this._initialWorkspace);
        this._peekedWindow = null;
        this._initialWorkspace = null;
        this._peekWorkspace = null;
    }

    _switchWorkspace(workspace) {
        if (!workspace || workspace.index() < 0 || workspace === global.workspace_manager.get_active_workspace())
            return;
        const wm = /** @type {typeof Main.wm & {_shouldAnimate: () => boolean}} */ (Main.wm);
        const shouldAnimate = wm._shouldAnimate;
        try {
            wm._shouldAnimate = () => false;
            workspace.activate(global.get_current_time());
        } finally {
            wm._shouldAnimate = shouldAnimate;
        }
    }

    activateWindow(window) {
        const owner = this._owner;
        this.endPeek(true);
        this.close();
        owner._actions.resetCycle();
        Main.activateWindow(window);
        owner.closeExpanded();
        Main.overview.hide();
    }

    showTitle(text) {
        this.hideTitle();
        this._tooltip = new St.Label({style_class: 'panel-tooltip', text, reactive: false});
        Main.layoutManager.addTopChrome(this._tooltip, {affectsInputRegion: false, affectsStruts: false});
        const [x, y] = global.get_pointer();
        const area = Main.layoutManager.getWorkAreaForMonitor(this._owner._monitorIndex);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._tooltip.set_style(`max-width: ${area.width / scale}px;`);
        const [, width] = this._tooltip.get_preferred_width(-1);
        const [, height] = this._tooltip.get_preferred_height(width);
        this._tooltip.set_position(
            Math.max(area.x, Math.min(x + 10, area.x + area.width - width)),
            Math.max(area.y, Math.min(y + 10, area.y + area.height - height)),
        );
    }

    hideTitle(delay = 0) {
        this._cancelTimeout('_titleHideId');
        if (!this._tooltip) return;
        if (delay) {
            this._titleHideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                this._titleHideId = 0;
                this.hideTitle();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        Main.layoutManager.removeChrome(this._tooltip);
        this._tooltip.destroy();
        this._tooltip = null;
    }

    destroy() {
        if (this._destroyed) return;
        this.close();
        this._destroyed = true;
        super.destroy();
        this._owner = null;
    }
}

class WindowPreviewList extends PopupMenu.PopupMenuSection {
    constructor(menu) {
        super();
        this._menu = menu;
        this._items = new Map();
        this._destroyed = false;
        this._scroll = new St.ScrollView({reactive: true, enable_mouse_scrolling: true});
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.NEVER);
        this.box.vertical = false;
        this.box.reactive = true;
        if (this._scroll.set_child) this._scroll.set_child(this.box);
        else
            /** @type {St.ScrollView & {add_actor: (actor: St.BoxLayout) => void}} */ (this._scroll).add_actor(
                this.box,
            );
        // Shell supports a ScrollView as the section actor, as in the reference.
        // The generated declarations incorrectly restrict it to St.BoxLayout.
        this.actor = /** @type {any} */ (Object.assign(this._scroll, {_delegate: this}));
        this._scroll.connect('scroll-event', (_actor, event) => this._onScroll(event));
        this.actor.connect('destroy', () => {
            this._destroyed = true;
        });
        // Shell cancels deferred work automatically when its actor is destroyed.
        this._redisplayId = Main.initializeDeferredWork(this.actor, () => this.redisplay());
        menu._source.app.connectObject('windows-changed', () => Main.queueDeferredWork(this._redisplayId), this.actor);
    }

    redisplay() {
        if (this._destroyed) return;
        const windows = this._menu.getWindows();
        for (const [window, item] of this._items) if (!windows.includes(window)) item.destroy();
        for (const [index, window] of windows.entries()) {
            let item = this._items.get(window);
            if (!item) {
                item = new WindowPreviewMenuItem(window, this._menu);
                this._items.set(window, item);
                item.connect('destroy', () => {
                    this._menu.endPeek();
                    this._menu.hideTitle();
                    this._items.delete(window);
                    if (!this._items.size && this._menu.isOpen) Main.queueDeferredWork(this._redisplayId);
                });
                this.addMenuItem(item, index);
            } else this.moveMenuItem(item, index);
        }
        this.box.queue_relayout();
        this.updateScrollbar();
        if (!windows.length && this._menu.isOpen) this._menu.close();
    }

    updateScrollbar() {
        // AUTOMATIC reserves scrollbar space even for a short list. Measure with
        // both bars disabled, then enable the horizontal one only on overflow.
        this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.NEVER);
        const actor = this._menu.actor;
        if (!actor.get_stage()) return;
        const [, naturalWidth] = actor.get_preferred_width(-1);
        const maxWidth = actor.get_theme_node().get_max_width();
        const needsScrollbar = maxWidth >= 0 && naturalWidth >= maxWidth;
        this._scroll.set_policy(needsScrollbar ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER, St.PolicyType.NEVER);
        if (needsScrollbar) this._scroll.add_style_pseudo_class('scrolled');
        else this._scroll.remove_style_pseudo_class('scrolled');
    }

    ensureVisible(item) {
        Utils.ensureActorVisibleInScrollView(this._scroll, item);
    }

    _onScroll(event) {
        if (event.is_pointer_emulated()) return Clutter.EVENT_STOP;
        const direction = event.get_scroll_direction();
        let delta;
        if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = event.get_scroll_delta();
            delta = dx + dy;
        } else if (direction === Clutter.ScrollDirection.UP || direction === Clutter.ScrollDirection.LEFT) delta = -1;
        else if (direction === Clutter.ScrollDirection.DOWN || direction === Clutter.ScrollDirection.RIGHT) delta = 1;
        else return Clutter.EVENT_PROPAGATE;
        const adjustment = this._scroll.hadjustment;
        adjustment.value += delta * (adjustment.step_increment || Constants.WINDOW_PREVIEW_SCROLL_STEP);
        return Clutter.EVENT_STOP;
    }
}

class WindowPreviewMenuItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass({GTypeName: 'SimpleBottomPanelWindowPreviewMenuItem'}, this);
    }

    constructor(window, menu) {
        super({hover: false});
        this.window = window;
        this._menu = menu;
        this._clone = null;
        this._cloneTextureLater = 0;
        this._windowAddedLater = 0;
        this._cloneAttempts = 0;
        // Hiding the ornament alone leaves the menu item's leading spacing.
        // The photographed implementation removes it from the layout entirely.
        const ornament = this.get_children()[0];
        this.remove_child(ornament);
        ornament.destroy();
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        this._label = new St.Label({
            text: window.get_title() || menu._source.app.get_name(),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label.set_style(`max-width: ${Constants.WINDOW_PREVIEW_MAX_WIDTH}px;`);
        const title = new St.Bin({
            child: this._label,
            reactive: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this._closeButton = new St.Button({
            style_class: 'window-close',
            opacity: 0,
            can_focus: true,
            accessible_name: 'Close window',
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            width: Math.round(Constants.WINDOW_PREVIEW_CLOSE_BUTTON_SIZE * scale),
            height: Math.round(Constants.WINDOW_PREVIEW_CLOSE_BUTTON_SIZE * scale),
            child: new St.Icon({
                icon_name: 'window-close-symbolic',
                icon_size: Math.round(Constants.WINDOW_PREVIEW_CLOSE_ICON_SIZE * scale),
            }),
        });
        this._closeButton.connect('clicked', () => this._closeWindow());
        const header = new St.BoxLayout({
            height: Math.round(Constants.WINDOW_PREVIEW_TITLE_HEIGHT * scale),
            style: `max-width: ${Constants.WINDOW_PREVIEW_MAX_WIDTH}px;`,
        });
        header.add_child(title);
        header.add_child(this._closeButton);
        this._cloneBin = new St.Bin({
            clip_to_allocation: true,
        });
        this._cloneBin.connect('notify::allocation', () => {
            if (!this._clone) return;
            const allocation = this._cloneBin.get_allocation_box();
            this._clone.set_clip_to_allocation(true);
            this._clone.set_size(allocation.get_width(), allocation.get_height());
        });
        const thumbnail = new Clutter.Actor({layout_manager: new Clutter.BinLayout(), y_expand: true, reactive: true});
        thumbnail.add_child(this._cloneBin);
        this._content = new St.BoxLayout({
            vertical: true,
            reactive: true,
            x_expand: true,
            style: `max-width: ${Constants.WINDOW_PREVIEW_MAX_WIDTH}px;`,
        });
        this._content.add_child(header);
        this._content.add_child(thumbnail);
        this.add_child(this._content);
        this.label_actor = this._label;
        window.connectObject(
            'notify::title',
            () => {
                this._label.text = window.get_title() || menu._source.app.get_name();
                menu.hideTitle();
            },
            this,
        );
        window.connectObject('size-changed', () => this._queueTextureUpdate(), this);
        window.connectObject('unmanaged', () => this.destroy(), this);
        this.connect('notify::hover', () => {
            this._syncCloseButton();
            if (this.hover) menu.requestPeek(this);
            else menu.endPeek();
        });
        this.connect('key-focus-in', () => {
            this._syncCloseButton();
            menu.ensureVisible(this);
        });
        this.connect('key-focus-out', () => this._syncCloseButton());
        this._closeButton.connect('key-focus-in', () => this._syncCloseButton());
        this._closeButton.connect('key-focus-out', () => this._syncCloseButton());
        title.connect('notify::hover', () => {
            if (title.hover && this._label.clutter_text.get_layout().is_ellipsized()) menu.showTitle(this._label.text);
            else menu.hideTitle(Constants.WINDOW_PREVIEW_TITLE_HIDE_DELAY);
        });
        this.connect('destroy', () => {
            if (this._cloneTextureLater) Utils.laterRemove(this._cloneTextureLater);
            if (this._windowAddedLater) Utils.laterRemove(this._windowAddedLater);
            this._cloneTextureLater = this._windowAddedLater = 0;
        });
        if (!this._updateTexture()) this._queueTextureUpdate();
    }

    vfunc_style_changed() {
        super.vfunc_style_changed();
        this._updatePreferredSize();
    }

    _updatePreferredSize() {
        // Match the reference's St padding workaround after the item is staged.
        if (!this._content || !this.get_stage()) return;
        const theme = this.get_theme_node();
        let [minWidth, naturalWidth] = this._content.get_preferred_width(-1);
        let [minHeight, naturalHeight] = this._content.get_preferred_height(naturalWidth);
        [minWidth, naturalWidth] = theme.adjust_preferred_width(minWidth, naturalWidth);
        [minHeight, naturalHeight] = theme.adjust_preferred_height(minHeight, naturalHeight);
        this.set({
            min_width: minWidth,
            natural_width: naturalWidth,
            min_height: minHeight,
            natural_height: naturalHeight,
        });
    }

    _syncCloseButton() {
        let hasDialog = false;
        this.window.foreach_transient((window) => {
            hasDialog ||= window.is_attached_dialog();
        });
        this._closeButton.reactive = this.window.can_close() && !hasDialog;
        this._closeButton.can_focus = this._closeButton.reactive;
        const highlighted = this.hover || this.has_key_focus() || this._closeButton.has_key_focus();
        Utils.animateOpacity(
            this._closeButton,
            highlighted && this._closeButton.reactive ? 255 : 0,
            Constants.WINDOW_PREVIEW_FADE_TIME,
        );
    }

    _closeWindow() {
        if (!this._closeButton.reactive) return;
        this._menu.endPeek();
        const workspace = this.window.get_workspace();
        // Follow Shell's close-confirmation handling: activate a new transient
        // after it has been mapped, rather than losing a save dialog behind us.
        workspace.disconnectObject(this);
        workspace.connectObject(
            'window-added',
            (_workspace, window) => {
                if (window.get_transient_for() !== this.window) return;
                workspace.disconnectObject(this);
                this._windowAddedLater = Utils.laterAdd(Meta.LaterType.BEFORE_REDRAW, () => {
                    this._windowAddedLater = 0;
                    this._menu.activateWindow(window);
                    return GLib.SOURCE_REMOVE;
                });
            },
            this,
        );
        this.window.delete(global.get_current_time());
    }

    _queueTextureUpdate() {
        if (this._cloneTextureLater) return;
        this._cloneAttempts = 0;
        this._cloneTextureLater = Utils.laterAdd(Meta.LaterType.BEFORE_REDRAW, () => {
            if (!this._updateTexture() && ++this._cloneAttempts < Constants.WINDOW_PREVIEW_TEXTURE_ATTEMPTS)
                return GLib.SOURCE_CONTINUE;
            this._cloneTextureLater = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateTexture() {
        const actor = this.window.get_compositor_private();
        const [width, height] = actor?.get_size() ?? [0, 0];
        if (!actor?.get_texture() || !width || !height) return false;
        if (!this._clone) {
            this._clone = new Clutter.Clone({
                source: actor,
                reactive: false,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._cloneBin.destroy_all_children();
            this._cloneBin.set_child(this._clone);
            actor.connectObject(
                'destroy',
                () => {
                    this._clone.destroy();
                    this._clone = null;
                    this.destroy();
                },
                this,
            );
            actor.connectObject('notify::width', () => this._queueTextureUpdate(), this);
            actor.connectObject('notify::height', () => this._queueTextureUpdate(), this);
        }
        const scale =
            Math.min(1, Constants.WINDOW_PREVIEW_MAX_WIDTH / width, Constants.WINDOW_PREVIEW_MAX_HEIGHT / height) *
            St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const previewWidth = width * scale;
        const previewHeight = height * scale;
        this._cloneBin.set_size(previewWidth, previewHeight);
        this._clone.set_size(previewWidth, previewHeight);
        this._updatePreferredSize();
        this._menu._previewList?.updateScrollbar();
        return true;
    }

    activate() {
        this._menu.activateWindow(this.window);
    }
}

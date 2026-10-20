import * as Session from '@/utils/session.js';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';

import * as Constants from '@/extension/constants.js';
import * as IconStorage from '@/utils/iconStorage.js';
import {BaseSection} from '@/extension/components/baseSection.js';
import {DashIcon, DashItem} from '@/extension/components/dash/dashIcon.js';

import * as DashLayout from '@/extension/components/dash/dashLayout.js';
import {DashLabel} from '@/extension/components/dash/dashLabel.js';
import {DashDragDrop} from '@/extension/components/dash/dashDragDrop.js';
import * as DashUtils from '@/extension/components/dash/dashUtils.js';
import * as Main from '@girs/gnome-shell/ui/main';
import {ExpandedDash} from '@/extension/components/dash/expandedDash.js';
import OverviewHelper from '@/extension/components/dash/overviewHelper.js';

export class DashSection extends BaseSection {
    static {
        GObject.registerClass({Signals: {'layout-changed': {}}}, this);
    }

    constructor(source, monitorIndex, themeManager, notificationsMonitor) {
        super();
        this.canExpand = true;
        this.preferredWidth = 0;
        this._source = source;
        this.settings = source.settings;
        this._monitorIndex = monitorIndex;
        this._themeManager = themeManager;
        this._notificationsMonitor = notificationsMonitor;
        this._overviewHelper = new OverviewHelper();
        this._availableWidth = 0;
        this._maxExpansionHeight = Session.scale(Constants.SECTION_HEIGHT);
        this._expandedSurface = null;
        this._previewMenuManager = new PopupMenu.PopupMenuManager(this);
        this._activationCycle = null;
        this._dragDrop = new DashDragDrop(this, source, themeManager);
        const adjustedPadding = Constants.DASH_PADDING - Constants.SECTION_CONTENT_BORDER_WIDTH;
        this._dash = new St.BoxLayout({
            style: `padding: ${adjustedPadding}px; padding-bottom: 0; spacing: ${Constants.DASH_ITEM_SPACING}px;`,
        });
        this.setSectionContent(this._dash);
        this._dashLabel = new DashLabel(this, themeManager);
        this.connect('destroy', () => {
            this.closeExpanded();
            this._dragDrop.destroy();
            this.resetCycle();
            this._dashLabel.destroy();
        });
        source.connectObject('changed', this.refresh.bind(this), this);
        this.refresh();
    }

    refresh() {
        if (this._dragDrop.deferRefresh()) return;
        const groups = this._source.getEntries({
            monitor: this._monitorIndex,
            ...this._dragDrop.orders,
        });
        this._dragDrop.updateEntries(groups);
        this._entries = [...groups.favorites, ...groups.running];
        this._syncLayout();
    }

    setAvailableSize(width, maxExpansionHeight) {
        if (width === this._availableWidth && maxExpansionHeight === this._maxExpansionHeight) return;
        this._availableWidth = width;
        this._maxExpansionHeight = Math.max(Session.scale(Constants.SECTION_HEIGHT), maxExpansionHeight);
        if (this._dragDrop.deferRefresh()) return;
        this._syncLayout();
    }

    _syncLayout() {
        this._dashLabel.hide();
        const previousWidth = this.preferredWidth;
        this._layout = DashLayout.layoutDash(this._entries, this._availableWidth);
        this.preferredWidth = this._layout.width;
        this._syncDashItems(this._dash, this._layout.tokens, this._layout.iconSize);
        this._expandedSurface?.update({
            entries: this._entries,
            iconSize: this._layout.iconSize,
            availableWidth: this._availableWidth,
            maxHeight: this._maxExpansionHeight,
        });
        this._dragDrop.addDropZone(this._dash);
        this._dash.queue_relayout();
        if (this.preferredWidth !== previousWidth) this.emit('layout-changed');
    }

    _tokenKey(token) {
        if (token.type !== Constants.DashTokenType.DASH_ICON) return token.type;
        const entry = token.entry;
        return `${entry.group}:${entry.group === 'favorites' ? entry.item.appId : entry.item.id}`;
    }

    _syncDashItems(container, tokens, iconSize) {
        const previous = new Map(container.get_children().map((actor) => [this._tokenKey(actor._dashToken), actor]));
        for (const [index, token] of tokens.entries()) {
            const key = this._tokenKey(token);
            let actor = previous.get(key);
            previous.delete(key);
            if (actor && token.entry && actor.button.app !== token.entry.item.app) {
                actor.destroy();
                actor = null;
            }
            if (!actor) {
                actor = this._createDashItem(token, iconSize);
                container.insert_child_at_index(actor, index);
            } else if (container.get_child_at_index(index) !== actor) {
                // Native reordering keeps the actor mapped and its popup alive.
                container.set_child_at_index(actor, index);
            }
            actor._dashToken = token;
            actor.width = Session.scale(token.width);
            const side = Session.scale(iconSize);
            if (token.type === Constants.DashTokenType.DASH_ICON) {
                actor.button.updateEntry(token.entry, iconSize);
                actor.setIndicatorCount(token.entry.indicatorCount);
            } else if (token.type === Constants.DashTokenType.SEPARATOR) {
                actor.height = side;
                actor.set_style(`padding-top: ${Constants.DASH_ICON_SIZE - iconSize}px`);
            } else {
                actor.button.set_size(side, side);
                if (token.type === Constants.DashTokenType.LAUNCHPAD) {
                    actor.button.child.icon_size = iconSize;
                } else {
                    const text = `+${token.hiddenCount}`;
                    const fontSize = Math.round(iconSize * Math.min(0.65, 1.5 / text.length));
                    actor.button.child.text = text;
                    actor.button.child.set_style(`font-size: ${fontSize}px;`);
                    actor.button.accessible_name = `Show ${token.hiddenCount} more apps or windows`;
                }
            }
        }
        for (const actor of previous.values()) actor.destroy();
    }

    _createDashItem(token, iconSize) {
        const width = Session.scale(token.width);
        if (token.type === Constants.DashTokenType.LAUNCHPAD) {
            const side = Session.scale(iconSize);
            const button = new St.Button({
                style_class: 'dash-app-button',
                accessible_name: 'Toggle overview',
                can_focus: true,
                width: side,
                height: side,
                child: new St.Icon({
                    gicon: IconStorage.getIcon(IconStorage.Icons.LAUNCHPAD),
                    icon_size: iconSize,
                }),
            });
            button.connect('clicked', () => {
                this.resetCycle();
                this.closeExpanded();
                this._overviewHelper.overviewActive()
                    ? this._overviewHelper.closeAppsOverview()
                    : this._overviewHelper.openAppsOverview();
            });
            const item = new DashItem(width);
            item.setButton(button);
            return item;
        }

        //TODO switch
        if (token.type === Constants.DashTokenType.SEPARATOR) {
            return new St.Bin({
                height: Session.scale(iconSize),
                style: `padding-top: ${Constants.DASH_ICON_SIZE - iconSize}px`,
                y_align: Clutter.ActorAlign.START,
                child: new St.Widget({
                    style_class: 'dash-running-separator',
                    width: Session.scale(Constants.DASH_SEPARATOR_WIDTH),
                    height: Session.scale(Constants.DASH_SEPARATOR_HEIGHT),
                    y_align: Clutter.ActorAlign.CENTER,
                }),
            });
        }
        if (token.type === Constants.DashTokenType.OVERFLOW) {
            const side = Session.scale(iconSize);
            const text = `+${token.hiddenCount}`;
            const fontSize = Math.round(iconSize * Math.min(0.65, 1.5 / text.length));
            const button = new St.Button({
                width: side,
                height: side,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                child: new St.Label({text, style: `font-size: ${fontSize}px;`}),
                style_class: 'dash-app-button dash-overflow-button',
                can_focus: true,
                accessible_name: `Show ${token.hiddenCount} more apps or windows`,
            });
            button.connect('clicked', () => this._openExpanded());
            const item = new DashItem(width);
            item.setButton(button);
            return item;
        }
        const view = new DashIcon(token.entry, this, iconSize, this._notificationsMonitor);
        this._dragDrop.attachIcon(view);
        view.connect('notify::hover', () => this._syncLabel(view));
        const item = new DashItem(width, token.entry.indicatorCount);
        item.setButton(view);
        return item;
    }

    // Hover decides here, once: an item with a window to show gets the preview,
    // everything else falls back to its name. Preview and label stay unrelated.
    _syncLabel(view) {
        if (!view.hover || view.dragging || this._previewable(view.entry)) this._dashLabel.hide();
        else this._dashLabel.schedule(view, view.entry.item.name);
    }

    _previewable(entry) {
        return (
            entry.item.app.state === Shell.AppState.RUNNING &&
            this._source.getEntryWindows(entry, this._monitorIndex).length > 0
        );
    }

    _openExpanded() {
        if (this._expandedSurface?.isOpen || !this._layout.hiddenCount) return;
        if (this._expandedSurface) {
            this._setContentVisible(false);
            this._expandedSurface.open(this);
            return;
        }
        const expanded = new ExpandedDash({
            entries: this._entries,
            iconSize: this._layout.iconSize,
            availableWidth: this._availableWidth,
            maxHeight: this._maxExpansionHeight,
            syncTokens: (container, tokens, iconSize) => this._syncDashItems(container, tokens, iconSize),
            dragDrop: this._dragDrop,
            themeManager: this._themeManager,
        });
        this._expandedSurface = expanded;
        expanded.connect('closed', () => this._setContentVisible(true));
        expanded.connect('destroy', () => {
            this._expandedSurface = null;
            this._setContentVisible(true);
        });
        this._setContentVisible(false);
        expanded.open(this);
    }

    resetCycle() {
        this._activationCycle = null;
    }

    closeExpanded() {
        this._expandedSurface?.destroy();
    }
    canSetFavorite(app) {
        return this._source.canSetFavorite(app);
    }
    prepareLaunch(app) {
        this._source.prepareLaunch(app, this._monitorIndex);
    }

    activateEntry(entry) {
        const windows = this._source.getAppWindows(
            entry.item.app,
            this._source.monitorOnly ? this._monitorIndex : null,
        );
        if (this._source.perWindow) {
            this.resetCycle();
            const window = windows.includes(entry.representedWindow)
                ? entry.representedWindow
                : entry.group === 'favorites'
                  ? windows[0]
                  : null;
            if (window) Main.activateWindow(window);
            else this._source.openNewWindow(entry.item.app, this._monitorIndex);
        } else {
            const {action, cycle} = DashUtils.nextAppAction(this._activationCycle, {...entry, windows});
            this._activationCycle = cycle;
            if (action.type === 'focus') Main.activateWindow(action.window);
            else if (action.type === 'minimize') action.windows.forEach((window) => window.minimize());
            else this._source.openNewWindow(entry.item.app, this._monitorIndex);
        }
        this.closeExpanded();
    }

    openNewWindow(app) {
        this._source.openNewWindow(app, this._monitorIndex);
        this.closeExpanded();
    }

    canCloseAllWindows(entry) {
        return !this._source.perWindow && this._source.getEntryWindows(entry, this._monitorIndex).length > 1;
    }

    closeAllWindows(entry) {
        const time = global.get_current_time();
        this._source.getEntryWindows(entry, this._monitorIndex).forEach((window) => window.delete(time));
        this.resetCycle();
        this.closeExpanded();
    }
}

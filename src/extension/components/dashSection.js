import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from '@girs/gnome-shell/ui/main';

import * as Constants from '@/extension/constants.js';
import * as IconStorage from '@/utils/iconStorage.js';
import {BaseSection} from '@/extension/components/baseSection.js';
import {DashIcon, DashItem} from '@/extension/components/dash/dashIcon.js';

import * as DashLayout from '@/extension/components/dash/dashLayout.js';
import {DashDragDrop} from '@/extension/components/dash/dashDragDrop.js';
import {DashActions} from '@/extension/components/dash/dashUtils.js';
import {ExpandedDash} from '@/extension/components/dash/expandedDash.js';

export class DashSection extends BaseSection {
    static {
        GObject.registerClass({Signals: {'layout-changed': {}}}, this);
    }

    constructor(
        source,
        monitorIndex,
        themeManager,
        transientInputManager,
        scaleFactor = 1
    ) {
        super();
        this.canExpand = true;
        this.preferredWidth = 0;
        this._source = source;
        this._monitorIndex = monitorIndex;
        this._themeManager = themeManager;
        this._transientInputManager = transientInputManager;
        this._scaleFactor = scaleFactor;
        this._availableWidth = 0;
        this._maxExpansionHeight = this._scale(Constants.SECTION_HEIGHT);
        this._expandedSurface = null;
        this._menuActors = new Set();
        this._actions = new DashActions(source, monitorIndex);
        this._dragDrop = new DashDragDrop(
            this,
            source,
            themeManager,
            scaleFactor
        );
        const adjustedPadding =
            Constants.DASH_PADDING - Constants.SECTION_CONTENT_BORDER_WIDTH;
        this._dash = new St.BoxLayout({
            style: `padding: ${adjustedPadding}px; padding-bottom: 0; spacing: ${Constants.DASH_ITEM_SPACING}px;`,
        });
        this.setSectionContent(this._dash);
        source.connectObject('changed', this.refresh.bind(this), this);
        this.refresh();
    }

    refresh() {
        if (this._dragDrop.deferRefresh()) return;
        this.closeExpanded();
        const groups = this._source.getEntries({
            monitor: this._monitorIndex,
            ...this._dragDrop.orders,
        });
        this._dragDrop.updateEntries(groups);
        this._entries = [...groups.favorites, ...groups.running];
        this._rebuildCollapsed();
    }

    setAvailableSize(width, maxExpansionHeight) {
        if (
            width === this._availableWidth &&
            maxExpansionHeight === this._maxExpansionHeight
        )
            return;
        this._availableWidth = width;
        this._maxExpansionHeight = Math.max(
            this._scale(Constants.SECTION_HEIGHT),
            maxExpansionHeight
        );
        if (this._dragDrop.deferRefresh()) return;
        this.closeExpanded();
        this._rebuildCollapsed();
    }

    _rebuildCollapsed() {
        const previousWidth = this.preferredWidth;
        this._dash.destroy_all_children();
        this._layout = DashLayout.layoutDash(
            this._entries,
            this._availableWidth,
            this._scaleFactor
        );
        this.preferredWidth =
            this._layout.width + this._scale(Constants.DASH_PADDING * 2);
        for (const token of this._layout.tokens)
            this._dash.add_child(this._createDashItem(token));
        this._dragDrop.addDropZone(this._dash);
        this._dash.queue_relayout();
        if (this.preferredWidth !== previousWidth) this.emit('layout-changed');
    }

    _createDashItem(token) {
        const width = this._scale(token.width);
        if (token.type === 'launchpad') {
            const side = this._scale(this._layout.iconSize);
            const button = new St.Button({
                style_class: 'dash-app-button',
                accessible_name: 'Toggle overview',
                can_focus: true,
                width: side,
                height: side,
                child: new St.Icon({
                    gicon: IconStorage.getIcon(IconStorage.Icons.LAUNCHPAD),
                    icon_size: this._layout.iconSize,
                }),
            });
            button.connect('clicked', () => {
                this._actions.resetCycle();
                this.closeExpanded();
                Main.overview.toggle();
            });
            const item = new DashItem(width);
            item.setButton(button);
            return item;
        }

        if (token.type === 'separator') {
            return new St.Bin({
                height: this._scale(this._layout.iconSize),
                y_align: Clutter.ActorAlign.START,
                child: new St.Widget({
                    style_class: 'dash-running-separator', //TODO restyle to match figma
                    width: this._scale(Constants.DASH_SEPARATOR_WIDTH),
                    height: this._scale(Constants.DASH_SEPARATOR_HEIGHT),
                    y_align: Clutter.ActorAlign.CENTER,
                }),
            });
        }
        if (token.type === 'overflow') {
            const side = this._scale(this._layout.iconSize);
            const text = `+${token.hiddenCount}`;
            const fontSize = Math.round(
                this._layout.iconSize * Math.min(0.65, 1.5 / text.length)
            );
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
        const view = new DashIcon(
            token.entry,
            this,
            this._layout.iconSize,
            this._scaleFactor
        );
        this._dragDrop.attachIcon(view);
        const item = new DashItem(width, token.entry.indicatorCount);
        item.setButton(view);
        return item;
    }

    _scale(value) {
        return DashLayout.scaleDimension(value, this._scaleFactor);
    }

    _openExpanded() {
        if (this._expandedSurface || !this._layout.hiddenCount) return;
        const expanded = new ExpandedDash({
            entries: this._entries,
            iconSize: this._layout.iconSize,
            availableWidth: this._availableWidth,
            maxHeight: this._maxExpansionHeight,
            scaleFactor: this._scaleFactor,
            createToken: token => this._createDashItem(token),
            dragDrop: this._dragDrop,
            themeManager: this._themeManager,
            transientInputManager: this._transientInputManager,
            menuActors: this._menuActors,
        });
        this._expandedSurface = expanded;
        expanded.connect('destroy', () => {
            this._expandedSurface = null;
            this._setContentVisible(true);
        });
        this._setContentVisible(false);
        expanded.open(this);
    }

    closeExpanded() {
        this._expandedSurface?.destroy();
    }

    activateEntry(entry) {
        this._actions.activate(entry);
        this.closeExpanded();
    }

    canSetFavorite(app) {
        return this._source.canSetFavorite(app);
    }

    prepareLaunch(app) {
        this._actions.prepareLaunch(app);
    }

    openNewWindow(app) {
        this._actions.openNewWindow(app);
        this.closeExpanded();
    }

    menuChanged(actor, open) {
        if (open) this._menuActors.add(actor);
        else this._menuActors.delete(actor);
    }

    destroy() {
        this.closeExpanded();
        this._dragDrop.destroy();
        this._actions.destroy();
        super.destroy();
        this._source = null;
        this._menuActors.clear();
    }
}

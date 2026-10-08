import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from '@girs/gnome-shell/ui/main';

import * as Constants from '@/constant.js';
import {BaseSection} from '@/components/baseSection.js';
import {DashIcon, DashButtonContent} from '@/components/dash/dashIcon.js';
import * as DashLayout from '@/components/dash/dashLayout.js';
import {DashDragDrop} from '@/components/dash/dashDragDrop.js';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';
import {DashActions} from '@/components/dash/dashUtils.js';
import {ExpandedDash} from '@/components/dash/expandedDash.js';

export class DashSection extends BaseSection {
    static {
        GObject.registerClass({Signals: {'layout-changed': {}}}, this);
    }

    constructor(source, monitorIndex, themeManager, transientInputManager, scaleFactor = 1) {
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
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._dragDrop = new DashDragDrop(this, source, themeManager, scaleFactor);
        this._dash = new St.BoxLayout({style_class: 'dash-section',
            style: `padding: 0 ${DashLayout.CONTENT_PADDING}px; spacing: ${Constants.DASH_ITEM_SPACING}px;`});
        this.setSectionContent(this._dash);
        source.connectObject('changed', this.refresh.bind(this), this);
        this.refresh();
    }

    refresh() {
        if (this._dragDrop.deferRefresh())
            return;
        this.closeExpanded();
        const groups = this._source.getEntries({monitor: this._monitorIndex, ...this._dragDrop.orders});
        this._dragDrop.updateEntries(groups);
        this._entries = [...groups.favorites, ...groups.running];
        this._rebuildCollapsed();
    }

    setAvailableSize(width, maxExpansionHeight) {
        if (width === this._availableWidth && maxExpansionHeight === this._maxExpansionHeight)
            return;
        this._availableWidth = width;
        this._maxExpansionHeight = Math.max(this._scale(Constants.SECTION_HEIGHT), maxExpansionHeight);
        if (this._dragDrop.deferRefresh())
            return;
        this.closeExpanded();
        this._rebuildCollapsed();
    }

    _rebuildCollapsed() {
        const previousWidth = this.preferredWidth;
        this._dash.destroy_all_children();
        const inset = DashLayout.contentInset(this._scaleFactor);
        this._layout = DashLayout.layoutDash(this._entries, this._availableWidth, inset, this._scaleFactor);
        this.preferredWidth = this._layout.width;
        const height = this._scale(Constants.SECTION_HEIGHT - Constants.DASH_BORDER_WIDTH * 2);
        for (const token of this._layout.tokens)
            this._dash.add_child(this._createToken(token, height));
        this._dragDrop.addDropZone(this._dash);
        this._dash.queue_relayout();
        if (this.preferredWidth !== previousWidth)
            this.emit('layout-changed');
    }

    _createToken(token, height) {
        const width = this._scale(token.width);
        if (token.type === 'launchpad') {
            const button = new St.Button({style_class: 'dash-app-button dash-launchpad',
                accessible_name: 'Toggle overview', can_focus: true, width, height,
                child: new DashButtonContent(new St.Icon({icon_name: 'view-app-grid-symbolic',
                    icon_size: Constants.DASH_ICON_SIZE}))});
            button.connect('clicked', () => {
                this._actions.resetCycle();
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
            const button = new St.Button({width, height,
                child: new DashButtonContent(new St.Label({text: `+${token.hiddenCount}`})),
                style_class: 'dash-app-button dash-overflow-button', can_focus: true,
                accessible_name: `Show ${token.hiddenCount} more apps or windows`});
            button.connect('clicked', () => this._openExpanded());
            return button;
        }
        const view = new DashIcon(token.entry, this, this._layout.iconSize, width, height);
        this._dragDrop.attachIcon(view);
        this._menuManager.addMenu(/** @type {PopupMenu.PopupMenu} */ (view.menu));
        return view.container;
    }

    _scale(value) {
        return DashLayout.scaleDimension(value, this._scaleFactor);
    }

    _openExpanded() {
        if (this._expandedSurface || !this._layout.hiddenCount)
            return;
        const expanded = new ExpandedDash({
            entries: this._entries, iconSize: this._layout.iconSize,
            availableWidth: this._availableWidth, maxHeight: this._maxExpansionHeight,
            scaleFactor: this._scaleFactor, createToken: (token, height) => this._createToken(token, height),
            dragDrop: this._dragDrop, themeManager: this._themeManager,
            transientInputManager: this._transientInputManager, menuActors: this._menuActors,
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

    isFavorite(appId) {
        return this._source.isFavorite(appId);
    }

    setFavorite(app, favorite) {
        this._source.setFavorite(app, favorite);
    }

    canSetFavorite(app) {
        return this._source.canSetFavorite(app);
    }

    openNewWindow(app) {
        this._actions.openNewWindow(app);
        this.closeExpanded();
    }

    launchAction(app, action) {
        this._actions.launchAction(app, action);
        this.closeExpanded();
    }

    menuChanged(actor, open) {
        if (open)
            this._menuActors.add(actor);
        else
            this._menuActors.delete(actor);
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

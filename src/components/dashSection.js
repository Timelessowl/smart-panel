import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from '@girs/gnome-shell/ui/main';

import * as Constants from '@/constant.js';
import {BaseSection} from '@/components/baseSection.js';
import {DashIcon, DashButtonContent} from '@/components/dash/dashIcon.js';
import * as DashLayout from '@/components/dash/dashLayout.js';
import * as DashProjection from '@/components/dash/dashProjection.js';
import {DashDragDrop} from '@/components/dash/dashDragDrop.js';
import * as PopupMenu from '@girs/gnome-shell/ui/popupMenu';
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
        this._activationCycle = null;
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._dragDrop = new DashDragDrop(this, source, themeManager, scaleFactor, () => {
            if (this.onOrderChanged)
                this.onOrderChanged();
            else
                this.refresh();
        });
        this._dash = new St.BoxLayout({style_class: 'dash-section',
            style: `padding: 0 ${CONTENT_PADDING}px; spacing: ${Constants.DASH_ITEM_SPACING}px;`});
        this.setSectionContent(this._dash);
        this.refresh();
    }

    refresh() {
        if (this._dragDrop.deferRefresh())
            return;
        this.closeExpanded();
        const favorites = this._source.getFavorites();
        const windows = this._source.monitorOnly
            ? this._source.getOpenMonitorWindows(this._monitorIndex)
            : this._source.getOpenedWindows();
        this._projection = DashProjection.projectDash({favorites, windows,
            running: this._source.getRunningApps(),
            windowApps: new Map(windows.map(window => [window, this._source.getWindowApp(window)])),
            hardcodedIds: new Set(favorites.filter(app => this._source.isFixedFavorite(app.get_id()))
                .map(app => app.get_id())),
            perWindow: this._source.perWindow, ...this._dragDrop.orders});
        this._dragDrop.updateProjection(this._projection);
        this._entries = [...this._projection.favorites, ...this._projection.running];
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
        this._dash.destroy_all_children();
        const inset = this._scale(CONTENT_INSET);
        this._layout = DashLayout.layoutDash(this._entries, this._availableWidth, inset, this._scaleFactor);
        this.preferredWidth = this._layout.width;
        const height = this._scale(Constants.SECTION_HEIGHT - Constants.DASH_BORDER_WIDTH * 2);
        for (const token of this._layout.tokens)
            this._dash.add_child(this._createToken(token, height));
        this._dragDrop.addDropZone(this._dash);
        this._dash.queue_relayout();
    }

    _createToken(token, height) {
        const width = this._scale(token.width);
        if (token.type === 'launchpad') {
            const button = new St.Button({style_class: 'dash-app-button dash-launchpad',
                accessible_name: 'Toggle overview', can_focus: true, width, height,
                child: new DashButtonContent(new St.Icon({icon_name: 'view-app-grid-symbolic',
                    icon_size: Constants.DASH_ICON_SIZE}))});
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
        this._views.add(view);
        view.connect('destroy', () => this._views.delete(view));
        return view.container;
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
        const rowHeight = this._scale(Constants.DASH_EXPANDED_ROW_HEIGHT);
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
        this._dragDrop.addDropZone(grid, this._expandedSurface);
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
        this._dragDrop.setExpandedSurface(this._expandedSurface, this._dismissRegistration);
    }

    closeExpanded() {
        this._dragDrop.setExpandedSurface(null);
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
        // Query current state at click time, including any changes since the
        // icon was drawn. Focus/minimize and indicators use the same scope.
        const windows = this._source.getAppWindows(entry.item.app,
            this._source.monitorOnly ? this._monitorIndex : null);
        if (this._source.perWindow) {
            this._activationCycle = null;
            const window = entry.representedWindow;
            if (window && windows.includes(window))
                Main.activateWindow(window);
            else if (windows.length && entry.group === 'favorites')
                Main.activateWindow(windows[0]);
            else
                this.openNewWindow(entry.item.app);
        } else {
            const {action, cycle} = AppActivation.nextAppAction(this._activationCycle, {...entry, windows});
            this._activationCycle = cycle;
            if (action.type === 'focus')
                Main.activateWindow(action.window);
            else if (action.type === 'minimize')
                action.windows.forEach(window => window.minimize());
            else
                this.openNewWindow(entry.item.app);
        }
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
        this._source.openNewWindow(app, this._monitorIndex);
        this.closeExpanded();
    }

    launchAction(app, action) {
        this._source.launchAction(app, action, this._monitorIndex);
        this.closeExpanded();
    }

    menuChanged(actor, open) {
        if (open)
            this._menuActors.add(actor);
        else
            this._menuActors.delete(actor);
    }

    destroy() {
        this._dragDrop.destroy();
        this.closeExpanded();
        super.destroy();
        this._source = null;
        this._menuActors.clear();
    }
}

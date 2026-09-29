import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    DASH_BORDER_WIDTH,
    DASH_ITEM_SIZE,
    DASH_ITEM_SPACING,
    DASH_PADDING,
    PANEL_HEIGHT,
} from '../constant.js';

const DEFAULT_APPS = [
    {iconName: 'folder-symbolic', name: 'Files'},
    {iconName: 'web-browser-symbolic', name: 'Web browser'},
    {iconName: 'utilities-terminal-symbolic', name: 'Terminal'},
];

export class DashSection {
    constructor(apps = DEFAULT_APPS) {
        this._apps = [];
        this._availableWidth = 0;
        this._maxExpansionHeight = PANEL_HEIGHT;
        this._expandedSurface = null;
        this._stageCapturedEventId = 0;

        this.actor = new St.Widget({
            clip_to_allocation: true,
            layout_manager: new Clutter.FixedLayout(),
        });

        this._dash = new St.BoxLayout({
            style_class: 'panel-piece dash-placeholder',
            style: `padding: ${DASH_PADDING}px; spacing: ${DASH_ITEM_SPACING}px;`,
        });
        this._dash.set_position(0, 0);
        this._dash.set_height(PANEL_HEIGHT);
        this.actor.add_child(this._dash);

        this.setApps(apps);
    }

    setApps(apps) {
        this._closeExpanded();
        this._apps = [...apps];
        this._rebuildCollapsed();
    }

    setAvailableSize(width, maxExpansionHeight) {
        const sizeChanged = this._availableWidth !== width ||
            this._maxExpansionHeight !== maxExpansionHeight;

        if (!sizeChanged)
            return;

        this._closeExpanded();
        this._availableWidth = width;
        this._maxExpansionHeight = Math.max(PANEL_HEIGHT, maxExpansionHeight);
        this._rebuildCollapsed();
    }

    _rebuildCollapsed() {
        this._dash.destroy_all_children();

        const capacity = this._getColumnCapacity();
        const hasOverflow = this._apps.length > capacity;
        const visibleAppCount = hasOverflow
            ? Math.max(0, capacity - 1)
            : this._apps.length;

        for (const app of this._apps.slice(0, visibleAppCount))
            this._dash.add_child(this._createAppButton(app));

        if (hasOverflow) {
            const hiddenCount = this._apps.length - visibleAppCount;
            const overflowButton = new St.Button({
                label: `+${hiddenCount}`,
                style_class: 'dash-app-button dash-overflow-button',
                accessible_name: `Show ${hiddenCount} more apps`,
            });
            overflowButton.set_size(DASH_ITEM_SIZE, DASH_ITEM_SIZE);
            overflowButton.connect('clicked', () => this._openExpanded());
            this._dash.add_child(overflowButton);
        }
    }

    _getColumnCapacity() {
        const frameWidth = (DASH_PADDING + DASH_BORDER_WIDTH) * 2;
        const usableWidth = Math.max(0, this._availableWidth - frameWidth);

        return Math.max(1, Math.floor(
            (usableWidth + DASH_ITEM_SPACING) /
            (DASH_ITEM_SIZE + DASH_ITEM_SPACING)
        ));
    }

    _createAppButton({iconName, name}, closeExpanded = false) {
        const button = new St.Button({
            style_class: 'dash-app-button',
            accessible_name: name,
            child: new St.Icon({
                icon_name: iconName,
                icon_size: 28,
            }),
        });
        button.set_size(DASH_ITEM_SIZE, DASH_ITEM_SIZE);

        if (closeExpanded)
            button.connect('clicked', () => this._closeExpanded());

        return button;
    }

    _openExpanded() {
        if (this._expandedSurface)
            return;

        const columnCount = this._getColumnCapacity();
        const rowCount = Math.ceil(this._apps.length / columnCount);
        const gridWidth = columnCount * DASH_ITEM_SIZE +
            Math.max(0, columnCount - 1) * DASH_ITEM_SPACING;
        const gridHeight = rowCount * DASH_ITEM_SIZE +
            Math.max(0, rowCount - 1) * DASH_ITEM_SPACING;
        const frameInset = DASH_PADDING + DASH_BORDER_WIDTH;
        const surfaceWidth = Math.min(
            this._availableWidth,
            gridWidth + frameInset * 2
        );
        const naturalHeight = gridHeight + frameInset * 2;
        const surfaceHeight = Math.min(
            naturalHeight,
            this._maxExpansionHeight
        );

        const gridLayout = new Clutter.GridLayout({
            column_homogeneous: true,
            column_spacing: DASH_ITEM_SPACING,
            row_homogeneous: true,
            row_spacing: DASH_ITEM_SPACING,
        });
        const grid = new St.Widget({layout_manager: gridLayout});
        grid.set_size(gridWidth, gridHeight);

        this._apps.forEach((app, index) => {
            const column = index % columnCount;
            const row = Math.floor(index / columnCount);
            gridLayout.attach(
                this._createAppButton(app, true),
                column,
                row,
                1,
                1
            );
        });

        this._expandedSurface = new St.ScrollView({
            style_class: 'panel-piece dash-expanded',
            style: `padding: ${DASH_PADDING}px;`,
            enable_mouse_scrolling: true,
            overlay_scrollbars: true,
        });
        this._expandedSurface.set_policy(
            St.PolicyType.NEVER,
            St.PolicyType.AUTOMATIC
        );

        const scrollContent = new St.BoxLayout({vertical: true});
        scrollContent.add_child(grid);
        this._expandedSurface.set_child(scrollContent);
        this._expandedSurface.set_size(surfaceWidth, surfaceHeight);

        const [x, y] = this.actor.get_transformed_position();
        this._expandedSurface.set_position(
            Math.round(x),
            Math.round(y + PANEL_HEIGHT - surfaceHeight)
        );

        this._dash.hide();
        Main.layoutManager.addChrome(this._expandedSurface, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: true,
        });
        this._stageCapturedEventId = global.stage.connect(
            'captured-event',
            (_actor, event) => this._handleCapturedEvent(event)
        );
    }

    _handleCapturedEvent(event) {
        const isEscape = event.type() === Clutter.EventType.KEY_PRESS &&
            event.get_key_symbol() === Clutter.KEY_Escape;

        if (isEscape) {
            this._closeExpanded();
            return Clutter.EVENT_STOP;
        }

        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            const source = event.get_source();
            const clickedInside = source &&
                (source === this._expandedSurface ||
                    this._expandedSurface.contains(source));

            if (!clickedInside)
                this._closeExpanded();
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _closeExpanded() {
        if (!this._expandedSurface)
            return;

        if (this._stageCapturedEventId) {
            global.stage.disconnect(this._stageCapturedEventId);
            this._stageCapturedEventId = 0;
        }

        this._expandedSurface.destroy();
        this._expandedSurface = null;
        this._dash.show();
    }

    destroy() {
        this._closeExpanded();
    }
}

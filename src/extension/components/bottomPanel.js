import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from '@girs/gnome-shell/ui/main';

import {DashSection} from '@/extension/components/dashSection.js';
import {DebianButton} from '@/extension/components/debianButton.js';
import {IndicatorSection} from '@/extension/components/indicatorSection.js';
import {SearchSection} from '@/extension/components/searchSection.js';
import {SystemSection} from '@/extension/components/systemSection.js';

import * as Session from '@/utils/session.js';
import * as Constants from '@/extension/constants.js';

/**
 * @import {Monitor} from '@girs/gnome-shell/ui/layout'
 */

export class BottomPanel extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    /**
     * @param {Monitor} monitor
     **/
    constructor(
        monitor,
        {
            dashSource,
            notificationsMonitor,
            indicators,
            themeManager,
            transientInputManager,
        }
    ) {
        super({
            style_class: 'bottom-panel-surface',
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: false,
            reactive: true,
        });

        this._monitor = monitor;
        this._scaleFactor = Session.isWaylandSession()
            ? 1
            : monitor.geometry_scale;

        this._debianButton = new DebianButton();
        this._dashSection = new DashSection(
            dashSource,
            monitor.index,
            themeManager,
            transientInputManager,
            notificationsMonitor,
            this._scaleFactor
        );
        this._searchSection = new SearchSection();
        this._indicatorSection = new IndicatorSection(
            indicators,
            this._scaleFactor
        );
        this._systemSection = new SystemSection({panel: this});
        this._systemSection.connect(Constants.SIGNAL_GEOMETRY_CHANGED, () =>
            this._updateGeometry()
        );

        this._components = [
            this._debianButton,
            this._dashSection,
            this._searchSection,
            this._indicatorSection,
            this._systemSection,
        ];

        for (const component of this._components) this.add_child(component);

        this._dashSection.connectObject(
            'layout-changed',
            this._updateGeometry.bind(this),
            this
        );
        this._updateGeometry();

        Main.layoutManager.addChrome(this, {
            affectsInputRegion: true,
            affectsStruts: true,
            trackFullscreen: true,
        });
    }

    _updateGeometry() {
        const monitor = this._monitor;
        const panelHeight = this._scale(Constants.PANEL_HEIGHT);
        const sectionHeight = this._scale(Constants.SECTION_HEIGHT);
        const horizontalPadding = this._scale(
            Constants.PANEL_HORIZONTAL_PADDING
        );
        const topPadding = this._scale(Constants.PANEL_TOP_PADDING);
        const bottomPadding = this._scale(Constants.PANEL_BOTTOM_PADDING);

        const panelWidth = monitor.width;
        const searchWidth = Math.min(
            this._scale(Constants.SEARCH_MAX_WIDTH),
            Math.round(panelWidth * Constants.SEARCH_WIDTH_RATIO)
        );
        const searchX = Math.round((panelWidth - searchWidth) / 2);
        const dashStart =
            horizontalPadding +
            sectionHeight +
            this._scale(Constants.START_SECTION_GAP);
        const dashMaxWidth = Math.max(
            0,
            searchX - this._scale(Constants.SEARCH_CLEARANCE) - dashStart
        );

        const systemWidth = this._scale(this._systemSection.preferredWidth);
        this.set_size(panelWidth, panelHeight);
        this.set_position(monitor.x, monitor.y + monitor.height - panelHeight);

        this._dashSection.setAvailableSize(
            dashMaxWidth,
            monitor.height -
                bottomPadding -
                this._scale(Constants.DASH_EXPANSION_TOP_MARGIN)
        );
        const dashWidth = Math.min(
            dashMaxWidth,
            this._dashSection.preferredWidth
        );

        this._place(
            this._debianButton,
            horizontalPadding,
            topPadding,
            sectionHeight,
            sectionHeight
        );
        this._place(
            this._dashSection,
            dashStart,
            topPadding,
            dashWidth,
            sectionHeight
        );
        this._place(
            this._searchSection,
            searchX,
            topPadding,
            searchWidth,
            sectionHeight
        );
        this._placeFromEnd(
            this._indicatorSection,
            horizontalPadding +
                this._scale(Constants.END_SECTION_GAP) +
                systemWidth,
            topPadding,
            this._scale(this._indicatorSection.preferredWidth),
            sectionHeight
        );
        this._placeFromEnd(
            this._systemSection,
            horizontalPadding,
            topPadding,
            systemWidth,
            sectionHeight
        );
    }

    _scale(value) {
        return Math.round(value * this._scaleFactor);
    }

    _place(section, x, y, width, height) {
        section.set_position(x, y);
        section.set_size(width, height);
    }

    _placeFromEnd(section, endOffset, y, width, height) {
        const x = this.width - endOffset - width;
        this._place(section, x, y, width, height);
    }

    setIndicators(indicators) {
        this._indicatorSection.setIndicators(indicators);
        this._updateGeometry();
    }

    destroy() {
        Main.layoutManager.removeChrome(this);

        for (const component of this._components) component.destroy?.();

        this._monitor = null;
        this._components = [];
        super.destroy();
    }
}

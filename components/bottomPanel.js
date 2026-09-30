import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DashSection} from './dashSection.js';
import {DebianButton} from './debianButton.js';
import {IndicatorSection} from './indicatorSection.js';
import {SearchSection} from './searchSection.js';
import {SystemSection} from './systemSection.js';
import {WorkAreaStrut} from './workAreaStrut.js';

import {
    DASH_EXPANSION_TOP_MARGIN,
    END_SECTION_GAP,
    PANEL_BOTTOM_MARGIN,
    PANEL_HEIGHT,
    PANEL_SIDE_MARGIN,
    PANEL_TOP_MARGIN,
    SEARCH_CLEARANCE,
    SEARCH_MAX_WIDTH,
    SEARCH_SUGGESTIONS,
    SEARCH_WIDTH_RATIO,
    START_SECTION_GAP,
    SYSTEM_WIDTH,
} from '../constant.js';

export const BottomPanel = GObject.registerClass(
class BottomPanel extends St.Widget {
    constructor(
        monitor,
        {
            dashApps,
            indicators,
            openStubControls,
            overlayWindows,
            themeManager,
            transientInputManager,
            scaleFactor = 1,
        }
    ) {
        super({
            style_class: 'bottom-panel-surface',
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: false,
            reactive: true,
        });

        this._monitor = monitor;
        this._scaleFactor = scaleFactor;

        this._debianButton = new DebianButton(openStubControls);
        this._dashSection = new DashSection(
            dashApps,
            themeManager,
            transientInputManager,
            scaleFactor
        );
        this._searchSection = new SearchSection(
            SEARCH_SUGGESTIONS,
            scaleFactor
        );
        this._indicatorSection = new IndicatorSection(
            indicators,
            scaleFactor
        );
        this._systemSection = new SystemSection();

        this._components = [
            this._debianButton,
            this._dashSection,
            this._searchSection,
            this._indicatorSection,
            this._systemSection,
        ];

        for (const component of this._components)
            this.add_child(component);

        this._workAreaStrut = overlayWindows
            ? null
            : new WorkAreaStrut(
                monitor,
                this._scale(
                    PANEL_TOP_MARGIN + PANEL_HEIGHT + PANEL_BOTTOM_MARGIN
                )
            );

        Main.layoutManager.addChrome(this, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: true,
        });

        this._updateGeometry();
    }

    _updateGeometry() {
        const monitor = this._monitor;
        const panelHeight = this._scale(PANEL_HEIGHT);
        const sideMargin = this._scale(PANEL_SIDE_MARGIN);
        const bottomMargin = this._scale(PANEL_BOTTOM_MARGIN);

        const panelWidth = Math.max(0, monitor.width - sideMargin * 2);
        const searchWidth = Math.min(
            this._scale(SEARCH_MAX_WIDTH),
            Math.round(panelWidth * SEARCH_WIDTH_RATIO)
        );
        const searchX = Math.round((panelWidth - searchWidth) / 2);
        const dashStart = panelHeight + this._scale(START_SECTION_GAP);
        const dashMaxWidth = Math.max(
            0,
            searchX - this._scale(SEARCH_CLEARANCE) - dashStart
        );

        this.set_size(panelWidth, panelHeight);
        this.set_position(
            monitor.x + sideMargin,
            monitor.y + monitor.height - panelHeight - bottomMargin
        );

        this._dashSection.setAvailableSize(
            dashMaxWidth,
            monitor.height - bottomMargin -
                this._scale(DASH_EXPANSION_TOP_MARGIN)
        );
        this._dashSection.set_width(-1);
        const [, dashNaturalWidth] = this._dashSection
            .get_preferred_width(panelHeight);
        const dashWidth = Math.min(
            dashMaxWidth,
            Math.ceil(dashNaturalWidth)
        );

        this._placeFromStart(this._debianButton, 0, panelHeight, panelHeight);
        this._placeFromStart(
            this._dashSection,
            dashStart,
            dashWidth,
            panelHeight
        );
        this._place(
            this._searchSection,
            searchX,
            searchWidth,
            panelHeight
        );
        this._placeFromEnd(
            this._indicatorSection,
            this._scale(SYSTEM_WIDTH + END_SECTION_GAP),
            this._scale(this._indicatorSection.preferredWidth),
            panelHeight
        );
        this._placeFromEnd(
            this._systemSection,
            0,
            this._scale(SYSTEM_WIDTH),
            panelHeight
        );

        this._searchSection.updatePopupPosition();
    }

    _scale(value) {
        return Math.round(value * this._scaleFactor);
    }

    _place(section, x, width, height) {
        section.set_position(x, 0);
        section.set_size(width, height);
    }

    _placeFromStart(section, startOffset, width, height) {
        this._place(section, startOffset, width, height);
    }

    _placeFromEnd(section, endOffset, width, height) {
        const x = this.width - endOffset - width;
        this._place(section, x, width, height);
    }

    setDashApps(dashApps) {
        this._dashSection.setApps(dashApps);
        this._updateGeometry();
    }

    setIndicators(indicators) {
        this._indicatorSection.setIndicators(indicators);
        this._updateGeometry();
    }

    destroy() {
        for (const component of this._components)
            component.destroy?.();

        this._workAreaStrut?.destroy();
        this._workAreaStrut = null;
        Main.layoutManager.removeChrome(this);
        this._monitor = null;
        this._scaleFactor = 1;
        this._components = [];
        super.destroy();
    }
});

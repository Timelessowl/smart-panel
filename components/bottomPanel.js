import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DashSection} from './dashSection.js';
import {DebianButton} from './debianButton.js';
import {IndicatorSection} from './indicatorSection.js';
import {SearchSection} from './searchSection.js';
import {SectionFrameManager} from './sectionFrameManager.js';
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

export class BottomPanel {
    constructor(
        monitor,
        {dashApps, indicators, openStubControls, overlayWindows}
    ) {
        this._monitor = monitor;

        this.actor = new St.Widget({
            style_class: 'bottom-panel-surface',
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: false,
            reactive: true,
        });

        this._debianButton = new DebianButton(openStubControls);
        this._dashSection = new DashSection(dashApps);
        this._searchSection = new SearchSection(SEARCH_SUGGESTIONS);
        this._indicatorSection = new IndicatorSection(indicators);
        this._systemSection = new SystemSection();

        this._components = [
            this._debianButton,
            this._dashSection,
            this._searchSection,
            this._indicatorSection,
            this._systemSection,
        ];

        for (const component of this._components)
            this.actor.add_child(component.actor);

        this._sectionFrameManager = new SectionFrameManager(
            this.actor,
            this._components
        );

        this._workAreaStrut = overlayWindows
            ? null
            : new WorkAreaStrut(
                monitor,
                PANEL_TOP_MARGIN + PANEL_HEIGHT + PANEL_BOTTOM_MARGIN
            );

        Main.layoutManager.addChrome(this.actor, {
            affectsInputRegion: true,
            affectsStruts: false,
            trackFullscreen: true,
        });

        this._updateGeometry();
    }

    _updateGeometry() {
        const monitor = this._monitor;

        const panelWidth = Math.max(0, monitor.width - PANEL_SIDE_MARGIN * 2);
        const searchWidth = Math.min(
            SEARCH_MAX_WIDTH,
            Math.round(panelWidth * SEARCH_WIDTH_RATIO)
        );
        const searchX = Math.round((panelWidth - searchWidth) / 2);
        const dashStart = PANEL_HEIGHT + START_SECTION_GAP;
        const dashWidth = Math.max(0, searchX - SEARCH_CLEARANCE - dashStart);

        this.actor.set_size(panelWidth, PANEL_HEIGHT);
        this.actor.set_position(
            monitor.x + PANEL_SIDE_MARGIN,
            monitor.y + monitor.height - PANEL_HEIGHT - PANEL_BOTTOM_MARGIN
        );

        this._placeFromStart(this._debianButton.actor, 0, PANEL_HEIGHT);
        this._placeFromStart(this._dashSection.actor, dashStart, dashWidth);
        this._dashSection.setAvailableSize(
            dashWidth,
            monitor.height - PANEL_BOTTOM_MARGIN - DASH_EXPANSION_TOP_MARGIN
        );
        this._place(this._searchSection.actor, searchX, searchWidth);
        this._placeFromEnd(
            this._indicatorSection.actor,
            SYSTEM_WIDTH + END_SECTION_GAP,
            this._indicatorSection.preferredWidth
        );
        this._placeFromEnd(this._systemSection.actor, 0, SYSTEM_WIDTH);

        this._sectionFrameManager.sync();
        this._searchSection.updatePopupPosition();
    }

    _place(actor, x, width) {
        actor.set_position(x, 0);
        actor.set_size(width, PANEL_HEIGHT);
    }

    _placeFromStart(actor, startOffset, width) {
        this._place(actor, startOffset, width);
    }

    _placeFromEnd(actor, endOffset, width) {
        const x = this.actor.width - endOffset - width;
        this._place(actor, x, width);
    }

    setDashApps(dashApps) {
        this._dashSection.setApps(dashApps);
    }

    setIndicators(indicators) {
        this._indicatorSection.setIndicators(indicators);
        this._updateGeometry();
    }

    destroy() {
        this._sectionFrameManager.destroy();
        this._sectionFrameManager = null;

        for (const component of this._components)
            component.destroy?.();

        this._workAreaStrut?.destroy();
        this._workAreaStrut = null;
        this.actor.destroy();
        this.actor = null;
        this._monitor = null;
        this._components = [];
    }
}

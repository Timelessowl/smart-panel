import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {BottomPanel} from './components/bottomPanel.js';

export class MonitorManager {
    constructor({dashApps, indicators, openStubControls, overlayWindows}) {
        this._panels = [];
        this._dashApps = dashApps;
        this._indicators = indicators;
        this._openStubControls = openStubControls;
        this._overlayWindows = overlayWindows;
        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            () => this._rebuildPanels()
        );

        this._rebuildPanels();
    }

    _rebuildPanels() {
        this._destroyPanels();

        for (const monitor of Main.layoutManager.monitors) {
            this._panels.push(new BottomPanel(monitor, {
                dashApps: this._dashApps,
                indicators: this._indicators,
                openStubControls: this._openStubControls,
                overlayWindows: this._overlayWindows,
            }));
        }
    }

    setDashApps(dashApps) {
        this._dashApps = dashApps;

        for (const panel of this._panels)
            panel.setDashApps(dashApps);
    }

    setIndicators(indicators) {
        this._indicators = indicators;

        for (const panel of this._panels)
            panel.setIndicators(indicators);
    }

    setOverlayWindows(overlayWindows) {
        if (this._overlayWindows === overlayWindows)
            return;

        this._overlayWindows = overlayWindows;
        this._rebuildPanels();
    }

    _destroyPanels() {
        for (const panel of this._panels)
            panel.destroy();

        this._panels = [];
    }

    destroy() {
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }

        this._destroyPanels();
        this._dashApps = null;
        this._indicators = null;
        this._openStubControls = null;
        this._overlayWindows = null;
    }
}

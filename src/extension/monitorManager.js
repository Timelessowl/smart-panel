import * as Main from '@girs/gnome-shell/ui/main';

import {BottomPanel} from '@/extension/components/bottomPanel.js';
import {ThemeManager} from '@/extension/themeManager.js';

export class MonitorManager {
    constructor({dashSource, notificationsMonitor, indicators}) {
        this._panels = [];
        this._dashSource = dashSource;
        this._notificationsMonitor = notificationsMonitor;
        this._indicators = indicators;
        this._themeManager = new ThemeManager();
        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            () => this._rebuildPanels()
        );
        this._rebuildPanels();
    }

    _rebuildPanels() {
        this._destroyPanels();

        for (const monitor of Main.layoutManager.monitors) {
            const panel = new BottomPanel(monitor, {
                dashSource: this._dashSource,
                notificationsMonitor: this._notificationsMonitor,
                indicators: this._indicators,
                themeManager: this._themeManager,
            });
            this._themeManager.addActor(panel);
            this._panels.push(panel);
        }
    }

    setIndicators(indicators) {
        this._indicators = indicators;

        for (const panel of this._panels)
            panel.setIndicators(indicators);
    }

    _destroyPanels() {
        for (const panel of this._panels) {
            this._themeManager.removeActor(panel);
            panel.destroy();
        }

        this._panels = [];
    }

    destroy() {
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }

        this._destroyPanels();
        this._themeManager.destroy();
        this._themeManager = null;
        this._dashSource = null;
        this._indicators = null;
    }
}

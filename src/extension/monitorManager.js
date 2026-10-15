import * as Main from '@girs/gnome-shell/ui/main';

import {BottomPanel} from '@/extension/components/bottomPanel.js';
import {ThemeManager} from '@/extension/themeManager.js';
import {TransientInputManager} from '@/extension/transientInputManager.js';

export class MonitorManager {
    constructor({dashSource, indicators, openPreferences}) {
        this._panels = [];
        this._dashSource = dashSource;
        this._indicators = indicators;
        this._openPreferences = openPreferences;
        this._themeManager = new ThemeManager();
        this._transientInputManager = new TransientInputManager();
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
                indicators: this._indicators,
                openPreferences: this._openPreferences,
                themeManager: this._themeManager,
                transientInputManager: this._transientInputManager,
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
        this._transientInputManager.destroy();
        this._transientInputManager = null;
        this._themeManager.destroy();
        this._themeManager = null;
        this._dashSource = null;
        this._indicators = null;
        this._openPreferences = null;
    }
}

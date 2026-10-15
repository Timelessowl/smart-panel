import '@/style/stylesheet.scss';

import {Extension} from '@girs/gnome-shell/extensions/extension';

import {MonitorManager} from '@/extension/monitorManager.js';
import {DashSource} from '@/extension/components/dash/dashSource.js';

export default class SimpleBottomPanelExtension extends Extension {
    enable() {
        this._dashSource = new DashSource(this.getSettings());
        this._monitorManager = new MonitorManager({
            dashSource: this._dashSource,
            indicators: [],
            openPreferences: () => this.openPreferences(),
        });
    }

    disable() {
        this._monitorManager?.destroy();
        this._monitorManager = null;

        this._dashSource?.destroy();
        this._dashSource = null;
    }
}

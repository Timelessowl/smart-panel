import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MonitorManager} from './monitorManager.js';
import {StubController} from './stub/stubController.js';

export default class SimpleBottomPanelExtension extends Extension {
    enable() {
        this._stubController = new StubController({
            onDashAppsChanged: dashApps => {
                this._monitorManager?.setDashApps(dashApps);
            },
            onIndicatorsChanged: indicators => {
                this._monitorManager?.setIndicators(indicators);
            },
        });
        this._monitorManager = new MonitorManager({
            dashApps: this._stubController.dashApps,
            indicators: this._stubController.indicators,
            openStubControls: () => this._stubController.open(),
        });
    }

    disable() {
        this._monitorManager?.destroy();
        this._monitorManager = null;

        this._stubController?.destroy();
        this._stubController = null;
    }
}

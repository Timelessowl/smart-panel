import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MonitorManager} from './monitorManager.js';
import {StubController} from './stub/stubController.js';

export default class SimpleBottomPanelExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
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
            overlayWindows: this._settings.get_boolean('overlay-windows'),
        });
        this._settingsChangedId = this._settings.connect(
            'changed::overlay-windows',
            settings => {
                this._monitorManager?.setOverlayWindows(
                    settings.get_boolean('overlay-windows')
                );
            }
        );
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        this._monitorManager?.destroy();
        this._monitorManager = null;

        this._stubController?.destroy();
        this._stubController = null;
        this._settings = null;
    }
}

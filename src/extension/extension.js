import {Extension} from '@girs/gnome-shell/extensions/extension';

import {MonitorManager} from '@/extension/monitorManager.js';
import {DateMenuDecorator} from '@/extension/components/dateMenu.js';
import {NotificationsMonitor} from '@/extension/common/notificationsMonitor.js';
import * as IconStorage from '@/utils/iconStorage.js';
import {DashSource} from '@/extension/components/dash/dashSource.js';
import Logger from '@/utils/logger.js';
import PanelSettingsSyncer from '@/utils/settingsSync.js';
import '@/extension/styles/stylesheet.scss';

export default class SmartPanel extends Extension {
    enable() {
        this._settings = this.getSettings();
        //FIXME
        Logger.init();
        // Logger.init(
        //     this._settings.get_boolean('logging-enabled'),
        //     this._settings.get_int('log-level')
        // );
        // FIXME - remove once ACTUAL logic ready
        IconStorage.init();
        this._settingsSyncer = new PanelSettingsSyncer(this._settings);
        //----------------------------------------

        this._dateMenuDecorator = new DateMenuDecorator();

        this._dashSource = new DashSource(this._settings);
        this._notificationsMonitor = new NotificationsMonitor();
        this._monitorManager = new MonitorManager({
            dashSource: this._dashSource,
            notificationsMonitor: this._notificationsMonitor,
            indicators: [],
        });
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        this._dateMenuDecorator?.destroy();
        this._dateMenuDecorator = null;
        this._settingsSyncer?.destroy();
        this._settingsSyncer = null;

        this._monitorManager?.destroy();
        this._monitorManager = null;
        this._notificationsMonitor?.destroy();
        this._notificationsMonitor = null;
        this._dashSource?.destroy();
        this._dashSource = null;
        this._settings = null;
    }
}

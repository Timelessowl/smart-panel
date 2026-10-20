import * as Main from '@girs/gnome-shell/ui/main';
import PropertyOverrideManager from '@/utils/propertyOverrideManager.js';
const VISIBLE_PROP_NAME = 'visible';
export default class OverviewHelper {
    constructor() {
        this._overrideManager = new PropertyOverrideManager();
    }
    overviewActive() {
        return Main.overview.visible;
    }
    openAppsOverview() {
        Main.overview.showApps();
        this._restyle();
    }
    closeAppsOverview() {
        Main.overview.hide();
        this._restore();
    }

    _restyle() {
        const overview = Main.overview;
        if (!overview) return; // Logger ?

        this._overrideManager.overrideProperty(
            overview.dash,
            VISIBLE_PROP_NAME,
            false
        );

        this._overrideManager.overrideProperty(
            overview.searchEntry,
            VISIBLE_PROP_NAME,
            false
        );
        this._overrideManager.overrideProperty(
            Main.overview._overview?._controls?._workspacesDisplay,
            VISIBLE_PROP_NAME,
            false
        );
    }
    _restore() {
        this._overrideManager.clear();
    }

    destroy() {
        this._overrideManager.destroy();
    }
}

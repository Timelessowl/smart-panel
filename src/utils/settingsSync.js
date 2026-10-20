export default class PanelSettingsSyncer {
    constructor(settings) {
        this.settings = settings;
    }
    destroy() {
        this.settings = null;
    }
}

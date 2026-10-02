export class WindowItem {
    constructor(window, appItem) {
        this.window = window;
        this.appItem = appItem;
        this.stableId = window.get_stable_sequence();
        this.id = `window:${this.stableId}`;
        this.refresh();
    }

    refresh() {
        this.title = this.window.get_title() || this.appItem.name;
        this.name = this.title;
        this.monitor = this.window.get_monitor();
        this.skipTaskbar = this.window.skip_taskbar;
        this.app = this.appItem.app;
        this.appId = this.appItem.appId;
        this.appInfo = this.appItem.appInfo;
        this.icon = this.appItem.icon;
    }

    createIcon(size) {
        return this.appItem.createIcon(size);
    }
}

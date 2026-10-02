// Models contain no actors: every monitor creates its own views of these items.
export class AppItem {
    constructor(app) {
        this.app = app;
        this.id = `app:${app.get_id()}`;
        this.refresh();
    }

    refresh() {
        this.appId = this.app.get_id();
        this.name = this.app.get_name();
        this.appInfo = this.app.get_app_info();
        this.icon = this.appInfo?.get_icon() ?? null;
        this.state = this.app.get_state();
        this.windows = this.app.get_windows();
    }

    createIcon(size) {
        return this.app.create_icon_texture(size);
    }
}

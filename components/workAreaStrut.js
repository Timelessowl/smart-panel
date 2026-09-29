import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class WorkAreaStrut {
    constructor(monitor, height) {
        this.actor = new St.Widget({
            name: 'bottomPanelWorkAreaStrut',
            reactive: false,
        });

        this.actor.set_position(
            monitor.x,
            monitor.y + monitor.height - height
        );
        this.actor.set_size(monitor.width, height);

        Main.layoutManager.addChrome(this.actor, {
            affectsInputRegion: false,
            affectsStruts: true,
            trackFullscreen: true,
        });
    }

    destroy() {
        this.actor.destroy();
        this.actor = null;
    }
}

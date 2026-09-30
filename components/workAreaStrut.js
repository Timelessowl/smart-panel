import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const WorkAreaStrut = GObject.registerClass(
class WorkAreaStrut extends St.Widget {
    constructor(monitor, height) {
        super({
            name: 'bottomPanelWorkAreaStrut',
            reactive: false,
        });

        this.set_position(
            monitor.x,
            monitor.y + monitor.height - height
        );
        this.set_size(monitor.width, height);

        Main.layoutManager.addChrome(this, {
            affectsInputRegion: false,
            affectsStruts: true,
            trackFullscreen: true,
        });
    }

    destroy() {
        Main.layoutManager.removeChrome(this);
        super.destroy();
    }
});

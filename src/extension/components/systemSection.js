import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from '@girs/gnome-shell/ui/main';

import {BaseSection} from '@/extension/components/baseSection.js';

export class SystemSection extends BaseSection {
    static {
        GObject.registerClass({Signals: {'geometry-changed': {}}}, this);
    }

    constructor() {
        super();
        // Stub width: the updated system section was not supplied.
        this.preferredWidth = 236;

        const content = new St.BoxLayout({
            style_class: 'system-section',
        });
        this.setSectionContent(content);

        this._dateButton = new St.Button({
            style_class: 'system-section-button date-button',
            accessible_name: 'Date and time',
        });
        this._dateLabel = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._dateButton.set_child(this._dateLabel);

        this._quickSettingsButton = new St.Button({
            style_class: 'system-section-button quick-settings-button',
            accessible_name: 'Quick settings',
            child: new St.Icon({
                icon_name: 'network-wireless-signal-excellent-symbolic',
                icon_size: 20,
            }),
        });

        content.add_child(this._dateButton);
        content.add_child(this._quickSettingsButton);

        this._dateClickedId = this._dateButton.connect('clicked', () => {
            Main.notify('Date menu', 'The date menu will be connected here.');
        });
        this._quickSettingsClickedId = this._quickSettingsButton.connect(
            'clicked',
            () => Main.notify('Quick settings', 'Quick settings will be connected here.')
        );

        this._updateClock();
        this._clockSourceId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            30,
            () => {
                this._updateClock();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _updateClock() {
        this._dateLabel.text = GLib.DateTime.new_now_local().format('%b %d  %H:%M');
    }

    destroy() {
        this._dateButton.disconnect(this._dateClickedId);
        this._quickSettingsButton.disconnect(this._quickSettingsClickedId);

        if (this._clockSourceId) {
            GLib.source_remove(this._clockSourceId);
            this._clockSourceId = 0;
        }

        super.destroy();
    }
}

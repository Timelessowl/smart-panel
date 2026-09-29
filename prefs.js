import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SimpleBottomPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: 'Window placement',
            description: 'Choose whether maximized windows reserve space for the panel.',
        });
        const overlayWindowsRow = new Adw.SwitchRow({
            title: 'Allow windows behind the panel',
            subtitle: 'Use the full monitor area even when the panel covers part of it.',
        });

        group.add(overlayWindowsRow);
        page.add(group);
        window.add(page);

        window._settings = this.getSettings();
        window._settings.bind(
            'overlay-windows',
            overlayWindowsRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
    }
}

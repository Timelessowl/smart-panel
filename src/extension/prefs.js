import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from '@girs/gnome-shell/extensions/prefs';
import * as Constants from '@/extension/constants.js';

export default class SimpleBottomPanelPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Dash', icon_name: 'view-app-grid-symbolic'});
        const group = new Adw.PreferencesGroup({title: 'Apps and windows'});
        page.add(group);
        window.add(page);

        const perWindow = new Adw.SwitchRow({
            title: 'One icon per window',
            subtitle: 'Off: one icon per app. On: additional windows get their own icons.',
        });
        const monitorOnly = new Adw.SwitchRow({
            title: 'Only this monitor’s windows',
            subtitle: 'Favorites stay visible everywhere. Running icons and dots follow the monitor.',
        });
        group.add(perWindow);
        group.add(monitorOnly);
        perWindow.active = settings.get_int(Constants.SettingsKeys.WINDOW_GROUPING) === 1;
        const groupingChangedId = settings.connect(`changed::${Constants.SettingsKeys.WINDOW_GROUPING}`, () => {
            perWindow.active = settings.get_int(Constants.SettingsKeys.WINDOW_GROUPING) === 1;
        });
        const perWindowChangedId = perWindow.connect('notify::active', () => {
            const mode = perWindow.active ? 1 : 0;
            if (settings.get_int(Constants.SettingsKeys.WINDOW_GROUPING) !== mode)
                settings.set_int(Constants.SettingsKeys.WINDOW_GROUPING, mode);
        });
        settings.bind(Constants.SettingsKeys.ISOLATE_TASKS, monitorOnly, 'active', Gio.SettingsBindFlags.DEFAULT);
        window.connect('close-request', () => {
            settings.disconnect(groupingChangedId);
            perWindow.disconnect(perWindowChangedId);
            Gio.Settings.unbind(monitorOnly, 'active');
            return false;
        });
    }
}

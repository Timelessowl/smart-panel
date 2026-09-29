import Gio from 'gi://Gio';

const DARK_CLASS = 'dark';
const LIGHT_CLASS = 'light';

export class ThemeManager {
    constructor() {
        this._actors = new Set();
        this._settings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._colorSchemeChangedId = this._settings.connect(
            'changed::color-scheme',
            () => this._applyTheme()
        );
        this._themeClass = this._readThemeClass();
    }

    addActor(actor) {
        this._actors.add(actor);
        this._applyThemeToActor(actor);
    }

    removeActor(actor) {
        actor.remove_style_class_name(DARK_CLASS);
        actor.remove_style_class_name(LIGHT_CLASS);
        this._actors.delete(actor);
    }

    _readThemeClass() {
        return this._settings.get_string('color-scheme') === 'prefer-dark'
            ? DARK_CLASS
            : LIGHT_CLASS;
    }

    _applyTheme() {
        this._themeClass = this._readThemeClass();

        for (const actor of this._actors)
            this._applyThemeToActor(actor);
    }

    _applyThemeToActor(actor) {
        actor.remove_style_class_name(DARK_CLASS);
        actor.remove_style_class_name(LIGHT_CLASS);
        actor.add_style_class_name(this._themeClass);
    }

    destroy() {
        if (this._colorSchemeChangedId) {
            this._settings.disconnect(this._colorSchemeChangedId);
            this._colorSchemeChangedId = 0;
        }

        for (const actor of this._actors) {
            actor.remove_style_class_name(DARK_CLASS);
            actor.remove_style_class_name(LIGHT_CLASS);
        }

        this._actors.clear();
        this._settings = null;
    }
}

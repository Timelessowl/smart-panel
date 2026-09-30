import Meta from 'gi://Meta';
import St from 'gi://St';

export class DisplayScale {
    constructor(onChanged) {
        this._onChanged = onChanged;
        this._themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._scaleChangedId = 0;

        // Mutter exposes logical stage coordinates on Wayland. X11 keeps the
        // monitor/work-area geometry in physical pixels while St CSS lengths
        // remain logical, so only X11 needs an explicit geometry multiplier.
        if (!Meta.is_wayland_compositor()) {
            this._scaleChangedId = this._themeContext.connect(
                'notify::scale-factor',
                () => this._onChanged()
            );
        }
    }

    get factor() {
        if (Meta.is_wayland_compositor())
            return 1;

        return Math.max(1, this._themeContext.scale_factor);
    }

    destroy() {
        if (this._scaleChangedId) {
            this._themeContext.disconnect(this._scaleChangedId);
            this._scaleChangedId = 0;
        }

        this._themeContext = null;
        this._onChanged = null;
    }
}

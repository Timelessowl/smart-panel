import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as BoxPointer from '@girs/gnome-shell/ui/boxpointer';
import * as Main from '@girs/gnome-shell/ui/main';
import * as Constants from '@/extension/constants.js';
import * as Session from '@/utils/session.js';

// One persistent pointer per dash. Hiding keeps the actor owned and reachable
// until section teardown, including while an opacity transition is running.
export class DashLabel extends BoxPointer.BoxPointer {
    static {
        GObject.registerClass(this);
    }

    constructor(anchor, themeManager) {
        super(St.Side.BOTTOM, {reactive: false});
        this._anchor = anchor;
        this._showId = 0;
        this._resetId = 0;
        this._source = null;
        this._sourceDestroyId = 0;
        this._shownRecently = false;
        this.add_style_class_name('smart-panel-dash-label');
        this._label = new St.Label({
            style_class: 'smart-panel-dash-label-text',
            reactive: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        this._label.set_style(`max-width: ${Constants.DASH_LABEL_MAX_WIDTH}px;`);
        this.bin.set_child(this._label);
        this.visible = false;
        this.connect('destroy', () => {
            this._clearTimers();
            this._setSource(null);
            themeManager.removeActor(this);
            Main.layoutManager.removeChrome(this);
        });
        themeManager.addActor(this);
        Main.layoutManager.addTopChrome(this, {affectsInputRegion: false, affectsStruts: false});
    }

    schedule(icon, text) {
        this._clearTimers();
        this._setSource(icon);
        if (!text) {
            this.hide();
            return;
        }
        this._label.text = text;
        if (this._shownRecently) {
            this._show();
            return;
        }
        this._showId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Constants.DASH_LABEL_SHOW_DELAY, () => {
            this._showId = 0;
            if (icon.mapped && icon.hover && !icon.dragging) this._show();
            return GLib.SOURCE_REMOVE;
        });
    }

    hide() {
        this._clearTimers();
        this._setSource(null);
        this.setPosition(null, 0.5);
        if (!this._shownRecently) return;
        this.remove_all_transitions();
        this.ease({
            opacity: 0,
            duration: Constants.DASH_LABEL_HIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.visible = false;
            },
        });
        this._resetId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Constants.DASH_LABEL_SHOW_DELAY, () => {
            this._resetId = 0;
            this._shownRecently = false;
            return GLib.SOURCE_REMOVE;
        });
    }

    _show() {
        const [, iconY] = this._source.get_transformed_position();
        const [, anchorY] = this._anchor.get_transformed_position();
        const gap = Math.round((iconY - anchorY) / Session.scale(1)) + Constants.DASH_LABEL_GAP;
        this.set_style(`-boxpointer-gap: ${gap}px;`);
        this.setPosition(this._source, 0.5);
        this.remove_all_transitions();
        this.opacity = 0;
        this.visible = true;
        this.ease({opacity: 255, duration: Constants.DASH_LABEL_SHOW_TIME, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._shownRecently = true;
    }

    _setSource(source) {
        // BoxPointer also connects to its source with this pointer as owner.
        // Keep our pending-show listener separate from those native handlers.
        if (this._sourceDestroyId) this._source.disconnect(this._sourceDestroyId);
        this._source = source;
        this._sourceDestroyId = source ? source.connect('destroy', () => this.hide()) : 0;
    }

    _clearTimers() {
        if (this._showId) GLib.source_remove(this._showId);
        if (this._resetId) GLib.source_remove(this._resetId);
        this._showId = 0;
        this._resetId = 0;
    }
}

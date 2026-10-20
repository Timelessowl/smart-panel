import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as BoxPointer from '@girs/gnome-shell/ui/boxpointer';
import * as Main from '@girs/gnome-shell/ui/main';
import * as Constants from '@/extension/constants.js';
import TimeoutManager from '@/utils/timeoutHelper.js';
const Timeouts = Object.freeze({
    SHOW: {label: 'showTimeout', timeout: Constants.DASH_LABEL_SHOW_DELAY},
    RESET: {label: 'resetTimeout', timeout: Constants.DASH_LABEL_SHOW_DELAY},
});

export class DashLabel {
    constructor(anchor, themeManager) {
        this._anchor = anchor;
        this._themeManager = themeManager;
        this._actor = null;
        this._timeoutManager = new TimeoutManager();
        this._shownRecently = false;
    }
    schedule(icon, text) {
        if (!text) return;
        this._timeoutManager.clearTimeout(Timeouts.SHOW.label);
        this._timeoutManager.clearTimeout(Timeouts.RESET.label);
        if (this._shownRecently) {
            this._show(icon, text);
            return;
        }
        this._timeoutManager.addTimeout(
            Timeouts.SHOW.label,
            Timeouts.SHOW.timeout,
            () => {
                this._timeoutManager.clearTimeout(Timeouts.SHOW.label);
                this._show(icon, text);
                return GLib.SOURCE_REMOVE;
            }
        );
    }
    hide() {
        this._timeoutManager.clearTimeout(Timeouts.SHOW.label);
        const actor = this._actor;
        if (!actor) return;
        this._actor = null;
        actor.ease({
            opacity: 0,
            duration: Constants.DASH_LABEL_HIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._remove(actor),
        });
        this._timeoutManager.addTimeout(
            Timeouts.RESET.label,
            Timeouts.RESET.timeout,
            () => {
                this._timeoutManager.clearTimeout(Timeouts.RESET.label);
                this._shownRecently = false;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    destroy() {
        this._timeoutManager.destroy();
        const actor = this._actor;
        this._actor = null;
        if (actor) this._remove(actor);
        this._anchor = null;
        this._themeManager = null;
    }

    _show(icon, text) {
        const previous = this._actor;
        if (previous) this._remove(previous);

        const pointer = new BoxPointer.BoxPointer(St.Side.BOTTOM, {});
        pointer.add_style_class_name('smart-panel-dash-label');
        const label = new St.Label({
            style_class: 'smart-panel-dash-label-text',
            reactive: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            text,
        });
        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        label.set_style(`max-width: ${Constants.DASH_LABEL_MAX_WIDTH}px;`);
        pointer.bin.add_child(label);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const [, iconY] = icon.get_transformed_position();
        const [, anchorY] = this._anchor.get_transformed_position();
        const gap =
            Math.round((iconY - anchorY) / scale) + Constants.DASH_LABEL_GAP;
        this._themeManager.addActor(pointer);
        pointer.set_style(`-boxpointer-gap: ${gap}px;`);
        Main.layoutManager.addTopChrome(pointer, {
            affectsInputRegion: false,
            affectsStruts: false,
        });
        pointer.setPosition(icon, 0.5);
        pointer.opacity = 0;
        pointer.show();
        pointer.ease({
            opacity: 255,
            duration: Constants.DASH_LABEL_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._actor = pointer;
        this._shownRecently = true;
    }

    _remove(actor) {
        this._themeManager?.removeActor(actor);
        Main.layoutManager.removeChrome(actor);
        actor.destroy();
    }
}

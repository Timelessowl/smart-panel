import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from '@girs/gnome-shell/ui/main';

const POINTER_POLL_INTERVAL = 16;
const POINTER_BUTTON_MASK =
    Clutter.ModifierType.BUTTON1_MASK |
    Clutter.ModifierType.BUTTON2_MASK |
    Clutter.ModifierType.BUTTON3_MASK |
    Clutter.ModifierType.BUTTON4_MASK |
    Clutter.ModifierType.BUTTON5_MASK;

export class TransientInputManager {
    constructor() {
        this._registrations = new Set();
        this._pointerPollId = 0;
        this._isPollingPointer = false;
        this._previousButtons = 0;
        this._escapeActionId = 0;
        this._acceleratorActivatedId = 0;
    }

    register(actor, dismiss, relatedActors = new Set()) {
        const registration = {actor, dismiss, relatedActors, paused: false};
        this._registrations.add(registration);

        if (this._registrations.size === 1)
            this._startMonitoring();

        return registration;
    }

    unregister(registration) {
        if (!registration || !this._registrations.delete(registration))
            return;

        if (this._registrations.size === 0)
            this._stopMonitoring();
    }

    _startMonitoring() {
        const [, , modifiers] = global.get_pointer();
        this._previousButtons = modifiers & POINTER_BUTTON_MASK;
        this._pointerPollId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            POINTER_POLL_INTERVAL,
            () => this._pollPointer()
        );

        this._escapeActionId = global.display.grab_accelerator(
            'Escape',
            Meta.KeyBindingFlags.NONE
        );

        if (this._escapeActionId === Meta.KeyBindingAction.NONE)
            return;

        const binding = Meta.external_binding_name_for_action(this._escapeActionId);
        Main.wm.allowKeybinding(binding, Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP);

        this._acceleratorActivatedId = global.display.connect(
            'accelerator-activated',
            (_display, actionId) => {
                if (actionId === this._escapeActionId)
                    this._dismissAll();
            }
        );
    }

    _pollPointer() {
        this._isPollingPointer = true;

        const [x, y, modifiers] = global.get_pointer();
        const buttons = modifiers & POINTER_BUTTON_MASK;
        const buttonPressed = this._previousButtons === 0 && buttons !== 0;
        this._previousButtons = buttons;

        if (buttonPressed)
            this._dismissOutside(x, y);

        this._isPollingPointer = false;

        if (this._registrations.size === 0) {
            this._pointerPollId = 0;
            return GLib.SOURCE_REMOVE;
        }

        return GLib.SOURCE_CONTINUE;
    }

    _dismissOutside(x, y) {
        for (const registration of [...this._registrations]) {
            const {actor, dismiss, relatedActors, paused} = registration;
            if (paused)
                continue;
            const isInside = [actor, ...relatedActors].some(surface => {
                const [actorX, actorY] = surface.get_transformed_position();
                const [width, height] = surface.get_transformed_size();
                return x >= actorX && x < actorX + width &&
                    y >= actorY && y < actorY + height;
            });

            if (!isInside)
                dismiss();
        }
    }

    _dismissAll() {
        for (const {dismiss} of [...this._registrations])
            dismiss();
    }

    _stopMonitoring() {
        if (this._pointerPollId && !this._isPollingPointer) {
            GLib.source_remove(this._pointerPollId);
            this._pointerPollId = 0;
        }

        if (this._acceleratorActivatedId) {
            global.display.disconnect(this._acceleratorActivatedId);
            this._acceleratorActivatedId = 0;
        }

        if (this._escapeActionId !== Meta.KeyBindingAction.NONE) {
            const binding = Meta.external_binding_name_for_action(this._escapeActionId);
            Main.wm.allowKeybinding(binding, Shell.ActionMode.NONE);
            global.display.ungrab_accelerator(this._escapeActionId);
            this._escapeActionId = 0;
        }

        this._previousButtons = 0;
    }

    destroy() {
        this._registrations.clear();
        this._stopMonitoring();
    }
}

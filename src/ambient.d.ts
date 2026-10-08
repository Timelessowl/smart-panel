import '@girs/gjs';
import '@girs/gjs/ambient';
import '@girs/gjs/dom';
import '@girs/gnome-shell/ambient';
import '@girs/gnome-shell/extensions/global';

// GNOME Shell's environment adds these methods to GObject.Object at runtime.
declare module '@girs/gobject-2.0/gobject-2.0' {
    namespace GObject {
        interface Object {
            connectObject(signal: string, callback: (...args: any[]) => void, owner: Object): void;
            disconnectObject(owner: Object): void;
        }
    }
}

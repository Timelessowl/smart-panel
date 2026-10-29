// GNOME Shell adds ease() to Clutter.Actor in ui/environment.js.
// The generated GI declarations describe the unmodified Clutter API.
import '@girs/clutter-16/clutter-16';
import '@girs/gnome-shell/ui/appDisplay';
import '@girs/gnome-shell/ui/iconGrid';

declare module '@girs/gnome-shell/ui/appDisplay' {
    interface AppIcon {
        activate(button?: number): void;
        _menu: Omit<import('@girs/gnome-shell/ui/appMenu').AppMenu, 'connect' | '_quitItem'> & {
            connect(signal: 'activate', callback: (menu: AppIcon['_menu'], item: unknown) => void): number;
            _toggleFavoriteItem: unknown;
            _quitItem: unknown;
        };
    }
}

declare module '@girs/gnome-shell/ui/iconGrid' {
    interface BaseIcon {
        setIconSize(size: number): void;
    }
}

declare module '@girs/clutter-16/clutter-16' {
    namespace Clutter {
        interface Actor {
            ease(params: {
                [property: string]: unknown;
                duration?: number;
                delay?: number;
                mode?: AnimationMode;
                onComplete?: () => void;
                onStopped?: (finished: boolean) => void;
            }): void;
        }
    }
}

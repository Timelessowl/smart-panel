// GNOME Shell adds ease() to Clutter.Actor in ui/environment.js.
// The generated GI declarations describe the unmodified Clutter API.
import '@girs/clutter-16/clutter-16';

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

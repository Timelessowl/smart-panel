// GNOME Shell exports this class, but @girs/gnome-shell 48 omits the module.
declare module '@girs/gnome-shell/ui/dash' {
    import type Clutter from '@girs/clutter-16';
    import type Shell from '@girs/shell-16';
    import type St from '@girs/st-16';
    import {AppIcon} from '@girs/gnome-shell/ui/appDisplay';
    import {AppMenu} from '@girs/gnome-shell/ui/appMenu';
    import * as DND from '@girs/gnome-shell/ui/dnd';

    export class DashIcon extends AppIcon {
        constructor(app: Shell.App);
        _draggable: ReturnType<typeof DND.makeDraggable> & {
            startGesture?: Clutter.Action;
        };
        _dot: St.Widget;
        _menu: AppMenu | null;
        activate(button?: number): void;
        _updateRunningStyle(): void;
    }
}

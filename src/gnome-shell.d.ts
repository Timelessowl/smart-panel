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
        icon: AppIcon['icon'] & {setIconSize(size: number): void};
        _draggable: ReturnType<typeof DND.makeDraggable> & {
            startGesture?: Clutter.Action;
        };
        _dot: St.Widget;
        _menu: AppMenu | null;
        activate(button?: number): void;
        _updateRunningStyle(): void;
    }
}

declare module '@girs/gnome-shell/ui/grabHelper' {
    import type Clutter from '@girs/clutter-16';
    import type Shell from '@girs/shell-16';

    export class GrabHelper {
        constructor(owner: Clutter.Actor, params?: {actionMode: Shell.ActionMode});
        grab(params: {actor: Clutter.Actor; focus?: Clutter.Actor; onUngrab?: () => void}): boolean;
        ungrab(params?: {actor?: Clutter.Actor}): void;
    }
}

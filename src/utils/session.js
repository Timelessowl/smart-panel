import * as Main from '@girs/gnome-shell/ui/main';

// Actor dimensions are stage pixels; CSS and St.Icon sizes stay logical.
export function scale(value) {
    // Shell exposes snake_case here; the generated Monitor typing uses camelCase.
    const monitor = /** @type {{geometry_scale?: number}} */ (Main.layoutManager.primaryMonitor);
    return value * (monitor?.geometry_scale ?? 1);
}

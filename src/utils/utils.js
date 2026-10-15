import Clutter from 'gi://Clutter';

// Compositor work belongs before redraw, rather than in an arbitrary timeout.
export function laterAdd(laterType, callback) {
    return global.compositor.get_laters().add(laterType, callback);
}

export function laterRemove(id) {
    global.compositor.get_laters().remove(id);
}

export function fitPreview(width, height, maxWidth, maxHeight) {
    if (width <= 0 || height <= 0) return [0, 0];
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    return [Math.round(width * scale), Math.round(height * scale)];
}

// GNOME Shell adds ease() to Clutter actors at runtime.
export function animateOpacity(actor, opacity, duration) {
    actor.remove_transition('opacity');
    actor.ease({opacity, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
}

export function ensureActorVisibleInScrollView(scrollView, actor) {
    const adjustment = scrollView.hadjustment;
    const [x] = actor.get_transformed_position();
    const [viewX] = scrollView.get_transformed_position();
    const [width] = actor.get_transformed_size();
    const value = adjustment.value;
    if (x < viewX) adjustment.value = Math.max(adjustment.lower, value + x - viewX);
    else if (x + width > viewX + adjustment.page_size)
        adjustment.value = Math.min(
            adjustment.upper - adjustment.page_size,
            value + x + width - viewX - adjustment.page_size,
        );
}

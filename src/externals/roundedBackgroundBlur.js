import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {BackdropCaptureEffect} from '@/externals/backdropCapture.js';

/** @type {[string, St.Corner][]} */
const CORNERS = [
    ['radius_tl', St.Corner.TOPLEFT], ['radius_tr', St.Corner.TOPRIGHT],
    ['radius_br', St.Corner.BOTTOMRIGHT], ['radius_bl', St.Corner.BOTTOMLEFT],
];
const DECLARATIONS = `
uniform float width;
uniform float height;
uniform float texture_width;
uniform float texture_height;
uniform float offset_x;
uniform float offset_y;
uniform float radius_tl;
uniform float radius_tr;
uniform float radius_br;
uniform float radius_bl;
uniform float pixel_size;
`;
const MASK = `
vec2 size = vec2(width, height);
// UVs cover Clutter's padded FBO, not the actor allocation. Convert back to
// actor coordinates before measuring distance to its CSS outline.
vec2 p = cogl_tex_coord_in[0].st * vec2(texture_width, texture_height) * pixel_size
    + vec2(offset_x, offset_y);
float r;
if (p.y < height * 0.5)
    r = p.x < width * 0.5 ? radius_tl : radius_tr;
else
    r = p.x < width * 0.5 ? radius_bl : radius_br;
vec2 q = abs(p - size * 0.5) - (size * 0.5 - vec2(r));
float dist = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
cogl_color_out *= 1.0 - smoothstep(-pixel_size, 0.0, dist);
`;
const FILL = {
    x_expand: true, y_expand: true,
    x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL,
};

// Match ClutterOffscreenEffect's local FBO origin. Clutter rounds the paint
// volume and pads it asymmetrically (normally 2px before, 1px after), then
// scales the buffer. Deriving an origin from half the extra texture size would
// shift the mask, especially for fractional allocations or a non-zero volume.
// Adapted from Mutter 6145511b9b0f9b597b620d869855bfe61d045c96,
// clutter-actor-box.c / clutter-offscreen-effect.c (LGPL-2.1-or-later).
function offscreenOrigin(actor) {
    const volume = actor.get_paint_volume();
    const origin = volume?.get_origin();
    const box = volume ? null : actor.get_allocation_box();
    const x = origin?.x ?? box.x1;
    const y = origin?.y ?? box.y1;
    const width = volume ? volume.get_width() : box.get_width();
    const height = volume ? volume.get_height() : box.get_height();
    const offset = (start, length) => Math.trunc(
        Math.ceil(start + length + 0.75) - Math.round(length) - 3 - (volume ? 0 : start));
    return [offset(x, width), offset(y, height)];
}

class LiveActorBlur extends Shell.BlurEffect {
    static {
        GObject.registerClass(this);
    }

    vfunc_paint_node(node, paintContext, flags) {
        // The texture is updated externally. Refresh the native blur cache on
        // this paint, without queueing redraws or starting an after-paint loop.
        super.vfunc_paint_node(node, paintContext, flags | Clutter.EffectPaintFlags.ACTOR_DIRTY);
    }
}

class RoundedMaskEffect extends Shell.GLSLEffect {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();
        this.styleSource = null;
        this._uniforms = Object.fromEntries(['width', 'height', 'texture_width', 'texture_height',
            'offset_x', 'offset_y', 'pixel_size', ...CORNERS.map(([name]) => name)]
            .map(name => [name, this.get_uniform_location(name)]));
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, DECLARATIONS, MASK, false);
    }

    vfunc_paint(node, paintContext, flags) {
        // Do not reuse an offscreen image of yesterday's captured background.
        super.vfunc_paint(node, paintContext, flags | Clutter.EffectPaintFlags.ACTOR_DIRTY);
    }

    vfunc_paint_target(node, paintContext) {
        const actor = this.get_actor();
        const texture = this.get_texture();
        const width = Math.max(1, actor.width);
        const height = Math.max(1, actor.height);
        const uniform = (name, value) => this.set_uniform_float(this._uniforms[name], 1, [value]);
        uniform('width', width);
        uniform('height', height);
        uniform('texture_width', texture.get_width());
        uniform('texture_height', texture.get_height());
        const [offsetX, offsetY] = offscreenOrigin(actor);
        uniform('offset_x', offsetX);
        uniform('offset_y', offsetY);
        uniform('pixel_size', 1 / actor.get_resource_scale());
        const theme = (this.styleSource ?? actor).get_theme_node();
        for (const [name, corner] of CORNERS)
            uniform(name, Math.max(0, Math.min(theme.get_border_radius(corner), width / 2, height / 2)));
        // Shell.GLSLEffect's default blend expects straight alpha. Our captured
        // scene and rounded mask are premultiplied, as are Clutter's textures.
        this.get_pipeline().set_blend('RGBA = ADD (SRC_COLOR, DST_COLOR * (1-SRC_COLOR[A]))');
        super.vfunc_paint_target(node, paintContext);
    }
}

/** A native-layout stack: captured/blurred background, then sharp foreground.
 * The foreground's CSS supplies the corners. No widget allocation overrides.
 */
export class RoundedBackgroundBlur extends St.Widget {
    static {
        GObject.registerClass(this);
    }

    constructor({radius = 44, brightness = 1, ...props} = {}) {
        super({...props, ...FILL, reactive: false,
            layout_manager: new Clutter.BinLayout(), clip_to_allocation: true});
        this._foreground = null;
        this._backdrop = new Clutter.Actor({...FILL, reactive: false, content_gravity: Clutter.ContentGravity.RESIZE_FILL,
            clip_to_allocation: true});
        // ALL-mode DND picking must continue to reach the section's delegate.
        Shell.util_set_hidden_from_pick(this._backdrop, true);
        this.blur = new LiveActorBlur({mode: Shell.BlurMode.ACTOR, radius, brightness});
        this._mask = new RoundedMaskEffect();
        // First effect is outermost: mask the result, not the blur's input.
        this._backdrop.add_effect(this._mask);
        this._backdrop.add_effect(this.blur);
        this.add_child(this._backdrop);
        this._capture = new BackdropCaptureEffect(this._backdrop);
        this.add_effect(this._capture);
        // Native parent destruction does not call a child's JS destroy() method.
        this.connect('destroy', () => this._release());
    }

    set_child(foreground) {
        if (this._foreground)
            throw new Error('A rounded background can only have one foreground actor');
        this._foreground = foreground;
        Object.assign(foreground, FILL);
        this._mask.styleSource = foreground;
        this.add_child(foreground);
    }

    _release() {
        if (!this._capture)
            return;
        this._capture.release();
        this._backdrop.set_content(null);
        this.remove_effect(this._capture);
        this._capture = null;
        this._mask.styleSource = null;
        this._foreground = null;
    }
}

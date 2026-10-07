import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Mtk from 'gi://Mtk';

// Architecture reference: Blur My Shell PR #976 (backdrop_capture/content/damage).
// Capture before entering any offscreen effect; expose that texture as content.
const CAPTURES = new Set();
const PIXEL_EPSILON = 1 / 1024;

function geometry(actor, source) {
    const modelview = source.get_modelview_matrix();
    const projection = source.get_projection_matrix();
    const points = [[0, 0], [actor.width, 0], [0, actor.height], [actor.width, actor.height]]
        .map(([x, y]) => {
            const local = new Graphene.Vec4().init(x, y, 0, 1);
            const point = projection.transform_vec4(modelview.transform_vec4(local));
            return [
                source.get_viewport_x() + (point.get_x() / point.get_w() + 1) * source.get_viewport_width() / 2,
                source.get_viewport_y() + (1 - point.get_y() / point.get_w()) * source.get_viewport_height() / 2,
            ];
        });
    if (!points.flat().every(Number.isFinite))
        return null;
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const x = Math.floor(Math.min(...xs) + PIXEL_EPSILON);
    const y = Math.floor(Math.min(...ys) + PIXEL_EPSILON);
    const width = Math.ceil(Math.max(...xs) - PIXEL_EPSILON) - x;
    const height = Math.ceil(Math.max(...ys) - PIXEL_EPSILON) - y;
    return width > 0 && height > 0 ? {x, y, width, height} : null;
}

function damagedArea(paintContext, view, bounds, source) {
    const x = Math.max(0, bounds.x);
    const y = Math.max(0, bounds.y);
    const right = Math.min(source.get_width(), bounds.x + bounds.width);
    const bottom = Math.min(source.get_height(), bounds.y + bounds.height);
    if (right <= x || bottom <= y)
        return {rectangles: [], complete: true};
    const available = new Mtk.Rectangle({x, y, width: right - x, height: bottom - y});
    const damage = paintContext.get_redraw_clip();
    if (!damage || !view)
        return {rectangles: [available], complete: true};

    const scale = view.get_scale();
    const rectangles = [];
    const uncovered = Mtk.Region.create_rectangle(available);
    const iterator = new Mtk.RegionIterator();
    for (iterator.init(damage); !iterator.at_end(); iterator.next()) {
        const rect = iterator.rectangle;
        const left = Math.max(x, Math.floor((rect.x - view.layout.x) * scale));
        const top = Math.max(y, Math.floor((rect.y - view.layout.y) * scale));
        const endX = Math.min(right, Math.ceil((rect.x + rect.width - view.layout.x) * scale));
        const endY = Math.min(bottom, Math.ceil((rect.y + rect.height - view.layout.y) * scale));
        if (endX <= left || endY <= top)
            continue;
        const clipped = new Mtk.Rectangle({x: left, y: top, width: endX - left, height: endY - top});
        rectangles.push(clipped);
        uncovered.subtract_rectangle(clipped);
    }
    return {rectangles, complete: uncovered.is_empty()};
}

function redrawOverlapping(actor) {
    // A full local repaint refreshes the blur's sampling neighbourhood. Include
    // overlapping surfaces so captures never sample an old blur painted above them.
    const affected = [actor];
    const remaining = new Set([...CAPTURES].map(effect => effect.get_actor())
        .filter(other => other && other !== actor && other.mapped));
    for (const surface of affected) {
        const a = surface.get_transformed_extents();
        for (const other of remaining) {
            const b = other.get_transformed_extents();
            if (a.origin.x < b.origin.x + b.size.width && b.origin.x < a.origin.x + a.size.width &&
                a.origin.y < b.origin.y + b.size.height && b.origin.y < a.origin.y + a.size.height) {
                affected.push(other);
                remaining.delete(other);
            }
        }
    }
    affected.forEach(surface => surface.queue_redraw());
}

class BackdropContent extends GObject.Object {
    static {
        GObject.registerClass({Implements: [Clutter.Content]}, this);
    }

    constructor(capture) {
        super();
        this.capture = capture;
    }

    vfunc_paint_content(actor, node) {
        const target = this.capture.target;
        if (!target?.valid)
            return;
        const opacity = actor.get_paint_opacity() / 255;
        const color = new Cogl.Color();
        color.init_from_4f(opacity, opacity, opacity, opacity);
        target.pipeline.set_color(color);
        // @ts-expect-error GIR omits GJS's boxed constructor; it only declares PipelineNode.new().
        const texture = new Clutter.PipelineNode(target.pipeline);
        texture.add_rectangle(new Clutter.ActorBox({x1: 0, y1: 0, x2: actor.width, y2: actor.height}));
        node.add_child(texture);
    }
}

export class BackdropCaptureEffect extends Clutter.Effect {
    static {
        GObject.registerClass(this);
    }

    constructor(contentActor) {
        super();
        this.contentActor = contentActor;
        this.targets = new Map();
        this.target = null;
        this._warned = false;
        contentActor.set_content(new BackdropContent(this));
    }

    _ensureTarget(source, view, bounds) {
        const context = source.get_context();
        const cached = this.targets.get(view);
        if (cached?.source === source && cached.context === context &&
            ['x', 'y', 'width', 'height'].every(key => cached[key] === bounds[key])) {
            this.target = cached;
            return cached;
        }
        const texture = Cogl.Texture2D.new_with_size(context, bounds.width, bounds.height);
        texture.set_components(Cogl.TextureComponents.RGBA);
        texture.allocate();
        const framebuffer = Cogl.Offscreen.new_with_texture(texture);
        framebuffer.allocate();
        framebuffer.clear4f(Cogl.BufferBit.COLOR, 0, 0, 0, 0);
        const pipeline = Cogl.Pipeline.new(context);
        pipeline.set_layer_texture(0, texture);
        pipeline.set_layer_filters(0, Cogl.PipelineFilter.LINEAR, Cogl.PipelineFilter.LINEAR);
        pipeline.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
        const destroyId = cached?.destroyId ?? view?.connect('destroy', () => this._releaseView(view)) ?? 0;
        this.target = {...bounds, source, context, texture, framebuffer, pipeline, destroyId, valid: false};
        this.targets.set(view, this.target);
        return this.target;
    }

    _releaseView(view) {
        const target = this.targets.get(view);
        if (target?.destroyId)
            view.disconnect(target.destroyId);
        this.targets.delete(view);
        if (this.target === target)
            this.target = null;
    }

    vfunc_set_actor(actor) {
        if (!actor)
            this.release();
        super.vfunc_set_actor(actor);
        if (actor)
            CAPTURES.add(this);
    }

    vfunc_paint_node(node, paintContext) {
        const actor = this.get_actor();
        try {
            const source = paintContext.get_framebuffer();
            const bounds = geometry(actor, source);
            if (!bounds) {
                this.target = null;
            } else {
                const view = actor.peek_stage_views().find(candidate => candidate.get_framebuffer() === source) ?? null;
                const target = this._ensureTarget(source, view, bounds);
                const {rectangles, complete} = damagedArea(paintContext, view, bounds, source);
                for (const rect of rectangles)
                    source.blit(target.framebuffer, rect.x, rect.y, rect.x - bounds.x, rect.y - bounds.y,
                        rect.width, rect.height);
                target.valid ||= complete;
                if (rectangles.length > 0 && !complete)
                    redrawOverlapping(actor);
            }
        } catch (error) {
            this.target = null;
            if (!this._warned) {
                console.warn(`Rounded background blur: ${error.message}`);
                this._warned = true;
            }
        }
        // @ts-expect-error GIR omits GJS's boxed constructor; it only declares ActorNode.new().
        node.add_child(new Clutter.ActorNode(actor, -1));
    }

    release() {
        CAPTURES.delete(this);
        for (const view of this.targets.keys())
            this._releaseView(view);
        this.target = null;
    }
}

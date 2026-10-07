import * as Files from 'node:fs/promises';
import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';

async function fixture(options = {}) {
    class Node {
        constructor(...args) { this.args = args; this.children = []; }
        add_child(child) { this.children.push(child); }
        add_rectangle(box) { this.rectangle = {...box}; }
    }
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, {width: 200, height: 82, opacity: 255, mapped: true}, props);
            this.children = [];
            this.effects = [];
        }
        add_child(child) { this.children.push(child); child.parent = this; }
        add_effect(effect) { this.effects.push(effect); effect.vfunc_set_actor(this); }
        remove_effect(effect) { this.effects = this.effects.filter(value => value !== effect); effect.vfunc_set_actor(null); }
        set_content(content) { this.content = content; }
        get_paint_opacity() { return this.opacity; }
        get_resource_scale() { return Math.ceil(this.resourceScale ?? 1); }
        get_allocation_box() {
            return {x1: this.x ?? 0, y1: this.y ?? 0,
                get_width: () => this.width, get_height: () => this.height};
        }
        get_paint_volume() {
            if (this.noPaintVolume)
                return null;
            const bounds = this.paintVolume ?? {x: 0, y: 0, width: this.width, height: this.height};
            return {get_origin: () => ({x: bounds.x, y: bounds.y}),
                get_width: () => bounds.width, get_height: () => bounds.height};
        }
        get_theme_node() { return {get_border_radius: corner => this.radii[corner]}; }
        get_transformed_extents() {
            return {origin: {x: this.x ?? 0, y: this.y ?? 0}, size: {width: this.width, height: this.height}};
        }
        queue_redraw() { this.redraws = (this.redraws ?? 0) + 1; }
        destroy() { this.emit('destroy'); this.effects.slice().forEach(effect => this.remove_effect(effect));
            this.children.forEach(child => child.destroy()); this.destroyed = true; }
    }
    class Effect {
        constructor(props = {}) { Object.assign(this, props); }
        vfunc_set_actor(actor) { this.actor = actor; }
        get_actor() { return this.actor; }
    }
    class BlurEffect extends Effect {
        vfunc_paint_node(node, context, flags) { this.paint = {node, context, flags}; }
    }
    class GLSLEffect extends Effect {
        constructor() { super(); this.uniforms = {}; this.vfunc_build_pipeline(); }
        add_glsl_snippet(...args) { this.snippet = args; }
        get_uniform_location(name) { return name; }
        set_uniform_float(name, components, values) {
            expect(components).toBe(1); expect(values.length).toBe(1);
            this.uniforms[name] = values[0];
        }
        get_texture() {
            const bounds = this.actor.paintVolume ?? this.actor;
            // Clutter enlarges an offscreen paint volume by three logical
            // pixels before allocating at the ceiled resource scale.
            return {get_width: () => (Math.round(bounds.width) + 3) * this.actor.get_resource_scale(),
                get_height: () => (Math.round(bounds.height) + 3) * this.actor.get_resource_scale()};
        }
        get_pipeline() { return {set_blend: blend => { this.blend = blend; }}; }
        vfunc_paint(node, context, flags) { this.paint = {node, context, flags}; }
        vfunc_paint_target() { this.paintedTarget = true; }
    }
    class Vec4 {
        init(x, y, z, w) { Object.assign(this, {x, y, z, w}); return this; }
        get_x() { return this.x; } get_y() { return this.y; } get_w() { return this.w; }
    }
    class Rectangle { constructor(props) { Object.assign(this, props); } }
    class Region {
        constructor(rectangles) { this.rectangles = rectangles; }
        subtract_rectangle(cut) {
            this.rectangles = this.rectangles.flatMap(rect => {
                const x = Math.max(rect.x, cut.x), y = Math.max(rect.y, cut.y);
                const endX = Math.min(rect.x + rect.width, cut.x + cut.width);
                const endY = Math.min(rect.y + rect.height, cut.y + cut.height);
                if (endX <= x || endY <= y) return [rect];
                return [
                    {x: rect.x, y: rect.y, width: rect.width, height: y - rect.y},
                    {x: rect.x, y: endY, width: rect.width, height: rect.y + rect.height - endY},
                    {x: rect.x, y, width: x - rect.x, height: endY - y},
                    {x: endX, y, width: rect.x + rect.width - endX, height: endY - y},
                ].filter(part => part.width > 0 && part.height > 0);
            });
        }
        is_empty() { return this.rectangles.length === 0; }
    }
    const textures = [], copies = [];
    let failAllocation = false, context = {};
    const Cogl = {
        Texture2D: {new_with_size(ctx, width, height) {
            const texture = {context: ctx, width, height, set_components() {},
                allocate() { if (failAllocation) throw new Error('GPU allocation failed'); }};
            textures.push(texture); return texture;
        }},
        Offscreen: {new_with_texture: texture => ({texture, allocate() {}, clear4f() {}})},
        Pipeline: {new: () => ({set_layer_texture(_layer, texture) { this.texture = texture; },
            set_layer_filters() {}, set_layer_wrap_mode() {}, set_color(color) { this.color = color; }})},
        Color: class { init_from_4f(...values) { this.values = values; } },
        TextureComponents: {RGBA: 0}, BufferBit: {COLOR: 0}, SnippetHook: {FRAGMENT: 0},
        PipelineFilter: {LINEAR: 0}, PipelineWrapMode: {CLAMP_TO_EDGE: 0},
    };
    const imports = {
        'gi://Clutter': {default: {Actor, Effect, Content: class {}, BinLayout: class {},
            ActorBox: Rectangle, ActorNode: Node, PipelineNode: Node,
            ActorAlign: {FILL: 0}, ContentGravity: {RESIZE_FILL: 0}, EffectPaintFlags: {ACTOR_DIRTY: 1}}},
        'gi://Cogl': {default: Cogl},
        'gi://GObject': {default: {Object: class {}, registerClass: (...args) => args.at(-1)}},
        'gi://Graphene': {default: {Vec4}},
        'gi://Mtk': {default: {Rectangle, Region: {create_rectangle: rect => new Region([rect])},
            RegionIterator: class {
                init(region) { this.rectangles = region.rectangles; this.index = 0; this.rectangle = this.rectangles[0]; }
                at_end() { return this.index >= this.rectangles.length; }
                next() { this.rectangle = this.rectangles[++this.index]; }
            }}},
        'gi://Shell': {default: {GLSLEffect, BlurEffect, BlurMode: {ACTOR: 0},
            util_set_hidden_from_pick(actor, hidden) { actor.hiddenFromPick = hidden; }}},
        'gi://St': {default: {Widget: Actor, Corner: {TOPLEFT: 0, TOPRIGHT: 1, BOTTOMRIGHT: 2, BOTTOMLEFT: 3}}},
    };
    const {RoundedBackgroundBlur} = await GjsHarness.loadGjsModule(new URL('externals/roundedBackgroundBlur.js', GjsHarness.sourceDirectory), imports);
    const surface = new RoundedBackgroundBlur(options);
    const foreground = new Actor({radii: [16, 18, 20, 22]});
    surface.set_child(foreground);
    let matrixScale = 1, originX = 3, originY = 7;
    const source = {
        get_context: () => context, get_width: () => 1920, get_height: () => 1080,
        get_viewport_x: () => 0, get_viewport_y: () => 0,
        get_viewport_width: () => 1920, get_viewport_height: () => 1080,
        get_modelview_matrix: () => ({transform_vec4: p =>
            new Vec4().init(originX + p.x * matrixScale, originY + p.y * matrixScale, 0, 1)}),
        get_projection_matrix: () => ({transform_vec4: p =>
            new Vec4().init(p.x / 960 - 1, 1 - p.y / 540, 0, 1)}),
        blit(target, ...args) { copies.push({target, args}); },
    };
    const view = new SignalObject();
    Object.assign(view, {layout: {x: 0, y: 0}, scale: 1,
        get_scale() { return this.scale; }, get_framebuffer: () => source});
    surface.peek_stage_views = () => [view];
    const paintContext = {get_framebuffer: () => source, get_redraw_clip: () => null};
    function paint() {
        surface._backdrop.width = surface.width; surface._backdrop.height = surface.height;
        const node = new Node();
        surface._capture.vfunc_paint_node(node, paintContext);
        const backdropNode = new Node();
        surface._backdrop.content.vfunc_paint_content(surface._backdrop, backdropNode);
        return {node, backdropNode};
    }
    return {surface, foreground, textures, copies, source, view, paintContext, paint, Actor, Region, RoundedBackgroundBlur,
        changeContext() { context = {}; }, failAllocation() { failAllocation = true; },
        transform(scale, x = 3, y = 7) { matrixScale = scale; originX = x; originY = y; }};
}

describe('Captured-child rounded background blur', () => {
    it('captures before painting a native-layout stack with a masked ACTOR blur and sharp foreground', async () => {
        const f = await fixture({radius: 99, brightness: 0.8});
        spyOn(console, 'warn');
        const {node, backdropNode} = f.paint();
        expect(console.warn).not.toHaveBeenCalled();
        expect(f.copies[0].args).toEqual([3, 7, 0, 0, 200, 82]);
        expect(node.children[0].args).toEqual([f.surface, -1]);
        expect(f.surface.children).toEqual([f.surface._backdrop, f.foreground]);
        expect(f.surface._backdrop.effects).toEqual([f.surface._mask, f.surface.blur]);
        expect(f.surface.blur.mode).toBe(0);
        expect(f.surface.blur.radius).toBe(99);
        expect(f.surface.blur.brightness).toBe(0.8);
        expect(backdropNode.children[0].args[0]).toBe(f.surface._capture.target.pipeline);
        expect(f.surface._backdrop.hiddenFromPick).toBeTrue();
        f.surface.destroy();
    });

    it('refreshes both native effect caches on paint without a continuous redraw loop', async () => {
        const f = await fixture();
        f.paint();
        const node = {}, context = {};
        f.surface.blur.vfunc_paint_node(node, context, 0);
        f.surface._mask.vfunc_paint(node, context, 0);
        expect(f.surface.blur.paint.flags).toBe(1);
        expect(f.surface._mask.paint.flags).toBe(1);
        expect(f.surface.redraws ?? 0).toBe(0);
        f.surface.destroy();
    });

    it('reads CSS corners at paint time and masks premultiplied output at native resource scale', async () => {
        const f = await fixture();
        const mask = f.surface._mask;
        f.surface._backdrop.resourceScale = 2;
        mask.vfunc_paint_target({}, {});
        expect(mask.uniforms).toEqual({width: 200, height: 82, pixel_size: 0.5,
            texture_width: 406, texture_height: 170, offset_x: -2, offset_y: -2,
            radius_tl: 16, radius_tr: 18, radius_br: 20, radius_bl: 22});
        f.foreground.radii = [0, 200, 4, 8];
        mask.vfunc_paint_target({}, {});
        expect(mask.uniforms.radius_tr).toBe(41);
        expect(mask.snippet[2]).toContain('cogl_color_out *= 1.0 - smoothstep');
        expect(mask.blend).toContain('SRC_COLOR, DST_COLOR');
        expect(mask.paintedTarget).toBeTrue();
        f.surface.destroy();
    });

    it('maps padded texture pixels to the allocation at every native resource scale', async () => {
        const f = await fixture();
        const backdrop = f.surface._backdrop;
        const mask = f.surface._mask;
        for (const scale of [1, 1.25, 1.5, 2, 3]) {
            backdrop.resourceScale = scale;
            mask.vfunc_paint_target({}, {});
            const u = mask.uniforms;
            const resourceScale = Math.ceil(scale);
            expect(u.pixel_size).toBe(1 / resourceScale);
            // GNOME's offscreen quad starts 2 logical pixels before the
            // allocation. Its first two columns must not become widget fill.
            expect(u.offset_x).toBe(-2);
            expect(u.offset_y).toBe(-2);
            expect(u.texture_width * u.pixel_size + u.offset_x).toBe(201);
            expect(u.texture_height * u.pixel_size + u.offset_y).toBe(83);
            expect(mask.snippet[2]).toContain('vec2(texture_width, texture_height) * pixel_size');
            expect(mask.snippet[2]).toContain('+ vec2(offset_x, offset_y)');
        }
        f.surface.destroy();
    });

    it('keeps asymmetric padding aligned with fractional allocations and paint-volume origins', async () => {
        const f = await fixture();
        const backdrop = f.surface._backdrop;
        const mask = f.surface._mask;
        backdrop.width = 200.25; backdrop.height = 82.75;
        mask.vfunc_paint_target({}, {});
        expect(mask.uniforms.width).toBe(200.25);
        expect(mask.uniforms.height).toBe(82.75);
        expect(mask.uniforms.texture_width).toBe(203);
        expect(mask.uniforms.texture_height).toBe(86);
        expect(mask.uniforms.offset_x).toBe(-2);
        expect(mask.uniforms.offset_y).toBe(-2);
        backdrop.paintVolume = {x: -4, y: -6, width: 208, height: 94};
        mask.vfunc_paint_target({}, {});
        expect(mask.uniforms.texture_width).toBe(211);
        expect(mask.uniforms.texture_height).toBe(97);
        expect(mask.uniforms.offset_x).toBe(-6);
        expect(mask.uniforms.offset_y).toBe(-8);
        f.surface.destroy();
    });

    it('uses allocation-relative padding when a paint volume is unavailable', async () => {
        const f = await fixture();
        const backdrop = f.surface._backdrop;
        backdrop.noPaintVolume = true;
        backdrop.x = 40.25; backdrop.y = 8.5;
        f.surface._mask.vfunc_paint_target({}, {});
        expect(f.surface._mask.uniforms.offset_x).toBe(-2);
        expect(f.surface._mask.uniforms.offset_y).toBe(-1);
        f.surface.destroy();
    });

    it('honors actual framebuffer transforms for Wayland scaling and X11 monitor origins', async () => {
        const f = await fixture();
        f.transform(2, 6, 14);
        f.view.scale = 2;
        f.paint();
        expect(f.copies.at(-1).args).toEqual([6, 14, 0, 0, 400, 164]);
        f.surface.width = 400; f.surface.height = 164;
        f.transform(1, 3, 7); f.view.scale = 1; f.view.layout.x = 2000;
        f.paint();
        // Modelview/viewport already contain the monitor transform; no second origin subtraction.
        expect(f.copies.at(-1).args).toEqual([3, 7, 0, 0, 400, 164]);
        f.surface.destroy();
    });

    it('clips fractional/edge captures and works without a matching stage view', async () => {
        const f = await fixture();
        f.surface.peek_stage_views = () => [];
        f.transform(1, -2.25, -1.5); f.paint();
        expect(f.copies.at(-1).args).toEqual([0, 0, 3, 2, 198, 81]);
        f.transform(1, 1900, 1070); f.paint();
        expect(f.copies.at(-1).args).toEqual([1900, 1070, 0, 0, 20, 10]);
        f.surface.destroy();
    });

    it('retains independent buffers per view and releases them on view destruction or widget destruction', async () => {
        const f = await fixture();
        f.paint(); const first = f.surface._capture.target;
        f.paint(); expect(f.surface._capture.target).toBe(first);
        const other = new SignalObject();
        Object.assign(other, {get_framebuffer: () => f.source, get_scale: () => 1, layout: {x: 0, y: 0}});
        f.surface.peek_stage_views = () => [other]; f.paint();
        expect(f.surface._capture.targets.size).toBe(2);
        f.surface.peek_stage_views = () => [f.view]; f.paint();
        expect(f.surface._capture.target).toBe(first);
        f.view.emit('destroy'); expect(f.surface._capture.targets.size).toBe(1);
        const capture = f.surface._capture;
        f.surface.destroy();
        expect(capture.targets.size).toBe(0);
        expect(capture.target).toBeNull();
        expect(other.signals.size).toBe(0);
        expect(f.surface._backdrop.content).toBeNull();
        expect(f.foreground.destroyed).toBeTrue();
    });

    it('recreates buffers after movement, resizing or a GL context change', async () => {
        const f = await fixture();
        f.paint();
        f.transform(1, 4, 7); f.paint();
        f.surface.width = 300; f.paint();
        f.changeContext(); f.paint();
        expect(f.textures.length).toBe(4);
        expect(f.view.signals.size).toBe(1);
        f.surface.destroy();
    });

    it('releases resources when native parent destruction emits destroy without calling a JS override', async () => {
        const f = await fixture(); f.paint();
        const capture = f.surface._capture;
        f.surface.emit('destroy');
        expect(capture.targets.size).toBe(0);
        expect(f.view.signals.size).toBe(0);
        expect(f.surface._backdrop.content).toBeNull();
        expect(f.surface.effects.length).toBe(0);
        f.surface.destroy();
    });

    it('copies only damaged pixels, preserves clean capture pixels and requests one full local repaint', async () => {
        const f = await fixture();
        f.paint(); const target = f.surface._capture.target;
        f.paintContext.get_redraw_clip = () => new f.Region([{x: 10, y: 10, width: 5, height: 5}]);
        f.paint();
        expect(f.surface._capture.target).toBe(target);
        expect(f.copies.at(-1).args).toEqual([10, 10, 7, 3, 5, 5]);
        expect(target.valid).toBeTrue();
        expect(f.surface.redraws).toBe(1);
        f.paintContext.get_redraw_clip = () => null; f.paint();
        expect(f.surface.redraws).toBe(1);
        f.surface.destroy();
    });

    it('does not display a new incomplete capture until a full local repaint fills it', async () => {
        const f = await fixture();
        f.paintContext.get_redraw_clip = () => new f.Region([{x: 10, y: 10, width: 5, height: 5}]);
        expect(f.paint().backdropNode.children.length).toBe(0);
        f.paintContext.get_redraw_clip = () => null;
        expect(f.paint().backdropNode.children.length).toBe(1);
        f.surface.destroy();
    });

    it('recognizes full coverage by multiple damage rectangles without requesting another redraw', async () => {
        const f = await fixture();
        f.paintContext.get_redraw_clip = () => new f.Region([
            {x: 3, y: 7, width: 100, height: 82}, {x: 103, y: 7, width: 100, height: 82}]);
        expect(f.paint().backdropNode.children.length).toBe(1);
        expect(f.surface.redraws ?? 0).toBe(0);
        f.surface.destroy();
    });

    it('converts scaled monitor-local damage and refreshes overlapping surfaces together', async () => {
        const f = await fixture();
        const other = new f.RoundedBackgroundBlur({x: 150});
        const third = new f.RoundedBackgroundBlur({x: 300});
        const separate = new f.RoundedBackgroundBlur({x: 800});
        f.transform(2, 6, 14); f.view.scale = 2; f.view.layout.x = 2000;
        f.paint();
        f.paintContext.get_redraw_clip = () => new f.Region([{x: 2010, y: 10, width: 5, height: 5}]);
        f.paint();
        expect(f.copies.at(-1).args).toEqual([20, 20, 14, 6, 10, 10]);
        expect(f.surface.redraws).toBe(1);
        expect(other.redraws).toBe(1);
        expect(third.redraws).toBe(1);
        expect(separate.redraws ?? 0).toBe(0);
        [f.surface, other, third, separate].forEach(surface => surface.destroy());
    });

    it('continues painting foreground and logs once if capture allocation fails', async () => {
        const f = await fixture();
        spyOn(console, 'warn'); f.failAllocation();
        for (let i = 0; i < 2; i++) {
            const {node, backdropNode} = f.paint();
            expect(node.children[0].args).toEqual([f.surface, -1]);
            expect(backdropNode.children.length).toBe(0);
        }
        expect(console.warn).toHaveBeenCalledOnceWith('Rounded background blur: GPU allocation failed');
        f.surface.destroy();
    });

    it('uses native layout, rejects extra foregrounds and preserves the commented original blur', async () => {
        const f = await fixture({radius: 0});
        expect(f.surface.blur.radius).toBe(0);
        expect(Object.hasOwn(Object.getPrototypeOf(f.surface), 'vfunc_allocate')).toBeFalse();
        expect(() => f.surface.set_child(new f.Actor())).toThrowError(/only have one/);
        const base = await Files.readFile(new URL('components/baseSection.js', GjsHarness.sourceDirectory), 'utf8');
        expect(base).toContain('//   new Shell.BlurEffect({ mode: Shell.BlurMode.BACKGROUND, radius: 99 }),');
        f.surface.destroy();
    });
});

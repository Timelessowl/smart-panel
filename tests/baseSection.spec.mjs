import {stylesheet as css} from './stylesheet.mjs';
import {loadGjsModule, SignalObject} from './gjsHarness.mjs';
import {SECTION_BORDER_WIDTH, SECTION_FRAME_WIDTH, SECTION_HEIGHT} from '../constant.js';

async function fixture() {
    class BinLayout {}
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, {visible: true}, props);
            this.children = [];
        }
        add_child(child) { this.children.push(child); }
        add_effect(effect) { this.effect = effect; }
        set_child(child) { this.child = child; this.add_child(child); }
        add_style_class_name(name) { this.style_class = `${this.style_class ?? ''} ${name}`.trim(); }
        remove_style_class_name(name) {
            this.style_class = this.style_class.split(' ').filter(value => value !== name).join(' ');
        }
        destroy() { this.children.forEach(child => child.destroy()); this.destroyed = true; }
    }
    const {BaseSection} = await loadGjsModule(new URL('../components/baseSection.js', import.meta.url), {
        'gi://Clutter': {default: {BinLayout, ActorAlign: {FILL: 0}}},
        'gi://GObject': {default: {registerClass: cls => cls}},
        'gi://St': {default: {Widget: Actor, Bin: Actor}},
        'gi://Shell': {default: {}},
        [new URL('../externals/roundedBackgroundBlur.js', import.meta.url).href]: {
            RoundedBackgroundBlur: class extends Actor {
                constructor(props) { super(); this.blur = props; }
            },
        },
    });
    const section = new BaseSection();
    const content = new Actor({style_class: 'test-content', iconSize: 40});
    section.setSectionContent(content);
    return {BaseSection, section, content, Actor, BinLayout};
}

describe('Native base section frame', () => {
    it('lets St nest content inside 8px frame padding and a solid 1px outline, without custom allocation', async () => {
        const {BaseSection, section, content, BinLayout} = await fixture();
        expect(SECTION_FRAME_WIDTH).toBe(8);
        expect(SECTION_BORDER_WIDTH).toBe(1);
        expect(section.style).toBeUndefined();
        expect(section._frame.style).toBe('padding: 8px; border-width: 1px;');
        expect(section.layout_manager instanceof BinLayout).toBeTrue();
        expect(section.children).toEqual([section._surface]);
        expect(section._surface.children).toEqual([section._frame]);
        expect(section._frame.children).toEqual([content]);
        expect(section._frame.child).toBe(content);
        expect(section._surface.blur.radius).toBeGreaterThan(0);
        expect(section._frame.hiddenFromPick).toBeUndefined();
        expect(Object.hasOwn(BaseSection.prototype, 'vfunc_allocate')).toBeFalse();
        expect(content.iconSize).toBe(40);
        expect(content.clip).toBeUndefined();
        expect(section.width).toBeUndefined();
        expect(section.height).toBeUndefined();
        expect(section.canExpand).toBeFalse();
        expect(content.x_expand && content.y_expand).toBeTrue();
    });

    it('keeps one shared opaque content child and rejects replacing it', async () => {
        const {section, content, Actor} = await fixture();
        expect(content.style_class).toContain('panel-piece');
        expect(() => section.setSectionContent(new Actor())).toThrowError(/only have one/);
        expect(section._frame.children).toEqual([content]);
    });

    it('hides content and border together during expansion without changing the section bounds', async () => {
        const {section, content} = await fixture();
        section.width = 360;
        section.height = SECTION_HEIGHT + (SECTION_FRAME_WIDTH + SECTION_BORDER_WIDTH) * 2;
        const frame = section._frame;
        const surface = section._surface;
        section._setContentVisible(false);
        expect(content.visible).toBeFalse();
        expect(frame.visible).toBeFalse();
        expect(surface.visible).toBeFalse();
        expect(section.visible).toBeTrue();
        section._setContentVisible(true);
        expect(content.visible).toBeTrue();
        expect(frame.visible).toBeTrue();
        expect(surface.visible).toBeTrue();
        expect([section.width, section.height]).toEqual([360,
            SECTION_HEIGHT + (SECTION_FRAME_WIDTH + SECTION_BORDER_WIDTH) * 2]);
        section.destroy();
        expect(content.destroyed).toBeTrue();
        expect(frame.destroyed).toBeTrue();
        expect(surface.destroyed).toBeTrue();
    });

    it('uses 40% band alpha, an opaque white/black outline and an opaque content child', async () => {
        expect(css.match(/\.panel-section\s*\{([^}]+)\}/)[1])
            .toMatch(/background-color:\s*transparent/);
        for (const palette of ['dark', 'light']) {
            const frame = css.match(new RegExp(`\\.dash-expanded\\.${palette} \\.panel-section-frame\\s*\\{([^}]+)\\}`))[1];
            expect(frame).toMatch(/background-color:\s*rgba\([^;]+,\s*0\.4\)/);
            expect(frame).toMatch(new RegExp(`border-color:\\s*${palette === 'dark' ? 'white' : 'black'};`));
            const content = css.match(new RegExp(`\\.dash-expanded\\.${palette} \\.panel-piece\\s*\\{([^}]+)\\}`))[1];
            expect(content).toMatch(/background-color:\s*rgb\(/);
        }
        expect(css.match(/\.panel-section-frame\s*\{([^}]+)\}/)[1])
            .toMatch(/border-style:\s*solid/);
        expect(css).not.toContain('.panel-section-surface');
    });
});

import * as Stylesheet from '@/tests/stylesheet.js';
import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';
import * as Constants from '@/extension/constants.js';
import * as PanelMenuDoubles from '@/tests/panelMenu.js';

async function fixture(scale) {
    const dotStyle = Stylesheet.stylesheet.match(/\.dash-window-dot\s*\{([^}]+)\}/)[1];
    const dotSize = Number(dotStyle.match(/height:\s*(\d+)px/)[1]) * scale;
    const dotsStyle = Stylesheet.stylesheet.match(/\.dash-window-dots\s*\{([^}]+)\}/)[1];
    const dotGap = Number(dotsStyle.match(/padding-top:\s*(\d+)px/)[1]) * scale;
    const dotSpacing = Number(dotsStyle.match(/spacing:\s*(\d+)px/)[1]) * scale;
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, props);
            this.children = [];
            if (props.style_class === 'dash-window-dot') {
                this.naturalWidth = dotSize;
                this.naturalHeight = dotSize;
            }
        }
        add_child(child) { child.parent = this; this.children.push(child); }
        set_child(child) { this.child = child; this.children = []; if (child) this.add_child(child); }
        set_size(width, height) { Object.assign(this, {width, height}); }
        add_action(action) { this.action = action; }
        add_style_class_name() {}
        get_preferred_width() {
            const width = this.naturalWidth ?? 0;
            return [width, width];
        }
        get_preferred_height() {
            const height = this.naturalHeight ?? 0;
            return [height, height];
        }
        set_allocation(box) { this.allocation = box; }
        allocate(box) { this.set_allocation(box); }
    }
    class BoxLayout extends Actor {
        get_preferred_width() {
            const width = this.children.length * dotSize +
                Math.max(0, this.children.length - 1) * dotSpacing;
            return [width, width];
        }
        get_preferred_height() { return [dotSize + dotGap, dotSize + dotGap]; }
    }
    const nativeMenus = PanelMenuDoubles.createDoubles(Actor);
    const imports = {
        'gi://Clutter': {default: {BinLayout: class {}, ActorAlign: {FILL: 0, CENTER: 1}, ClickAction: nativeMenus.ClickAction}},
        'gi://GObject': {default: {registerClass: cls => cls}},
        'gi://St': {default: {Widget: Actor, Bin: Actor, Button: Actor, BoxLayout, Side: {BOTTOM: 1}}},
        'resource:///org/gnome/shell/ui/dnd.js': {},
        'resource:///org/gnome/shell/ui/main.js': {},
        'resource:///org/gnome/shell/ui/popupMenu.js': nativeMenus.PopupMenu,
        'resource:///org/gnome/shell/ui/panelMenu.js': nativeMenus.PanelMenu,
    };
    const {DashIcon} = await GjsHarness.loadGjsModule(new URL('extension/components/dash/dashIcon.js', GjsHarness.sourceDirectory), imports);
    return {create(iconSize, indicatorCount, rowHeight) {
        const item = {name: 'App', app: {get_app_info: () => null,
            can_open_new_window: () => false, create_icon_texture: () => new Actor({
            naturalWidth: iconSize * scale, naturalHeight: iconSize * scale,
        })}};
        const button = new DashIcon({item, indicatorCount, group: 'favorites', hardcoded: true},
            {canSetFavorite: () => false}, iconSize, (iconSize + 8) * scale, rowHeight * scale, scale);
        return {view: button, button: button.button, texture: button.getDragActorSource(),
            dots: button.indicators, content: button.child};
    }};
}

describe('Dash icon actors', () => {
    it('uses an icon-sized native button and a separate indicator row at both sizes and native scales', async () => {
        for (const scale of [1, 1.5, 2]) {
            const f = await fixture(scale);
            for (const iconSize of [32, 40]) {
                for (const rowHeight of [Constants.SECTION_HEIGHT - Constants.DASH_BORDER_WIDTH * 2,
                    Constants.DASH_EXPANDED_ROW_HEIGHT]) {
                    const plain = f.create(iconSize, 0, rowHeight);
                    for (const count of [1, 2, 3, 4]) {
                        const {view, button, texture, dots, content} = f.create(iconSize, count, rowHeight);
                        expect(content.vertical).toBeTrue();
                        expect(content.children).toEqual([button.container, dots]);
                        expect(button.children).toEqual([texture]);
                        expect(dots.parent).toBe(content);
                        expect(dots.children.length).toBe(count);
                        expect(button.width).toBe(iconSize * scale);
                        expect(button.height).toBe(iconSize * scale);
                        expect(texture.get_preferred_width(-1)[1]).toBe(button.width);
                        expect(texture.get_preferred_height(-1)[1]).toBe(button.height);
                        expect(view.width).toBe(plain.view.width);
                        expect(view.height).toBe(plain.view.height);
                        expect(dots.get_preferred_height(-1)).toEqual(plain.dots.get_preferred_height(-1));
                        expect(dots.get_preferred_width(-1)[1]).toBeLessThanOrEqual(button.width);
                        expect(button.height + dots.get_preferred_height(-1)[1]).toBeLessThanOrEqual(view.height);
                        expect(dots.x_align).toBe(content.x_align);
                    }
                }
            }
        }
    });

    it('uses the reference proportions and keeps +N transparent until hovered', () => {
        expect(Stylesheet.stylesheet).toMatch(/\.dash-window-dots\s*\{[^}]*min-height:\s*5px/);
        expect(Stylesheet.stylesheet).toMatch(/\.dash-window-dot\s*\{[^}]*height:\s*5px/);
        expect(Stylesheet.stylesheet).toMatch(/\.dash-app-button:focus\s*\{[^}]*border-radius:\s*6px/);
        expect(Stylesheet.stylesheet).not.toMatch(/\.dash-overflow-button\s*\{/);
        expect(Stylesheet.stylesheet).toContain('.dash-app-button:hover');
        expect(Stylesheet.stylesheet).not.toContain('dash-hover-highlight');
    });
});

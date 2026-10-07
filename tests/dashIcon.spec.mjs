import * as Stylesheet from '#tests/stylesheet.mjs';
import * as GjsHarness from '#tests/gjsHarness.mjs';
import {SignalObject} from '#tests/gjsHarness.mjs';
import * as Constants from '@/constant.js';

async function fixture(scale) {
    const dotStyle = Stylesheet.stylesheet.match(/\.dash-window-dot\s*\{([^}]+)\}/)[1];
    const dotSize = Number(dotStyle.match(/height:\s*(\d+)px/)[1]) * scale;
    class ActorBox {
        constructor(x1 = 0, y1 = 0, x2 = 0, y2 = 0) {
            Object.assign(this, {x1, y1, x2, y2});
        }
        get_width() { return this.x2 - this.x1; }
        get_height() { return this.y2 - this.y1; }
    }
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
        add_child(child) { this.children.push(child); }
        set_child(child) { this.child = child; }
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
                Math.max(0, this.children.length - 1) * 2 * scale;
            return [width, width];
        }
        get_preferred_height() { return [dotSize, dotSize]; }
    }
    const imports = {
        'gi://Clutter': {default: {ActorBox, ActorAlign: {FILL: 0}}},
        'gi://GObject': {default: {registerClass: cls => cls}},
        'gi://St': {default: {Widget: Actor, Button: Actor, BoxLayout, ButtonMask: {ONE: 1}}},
        'resource:///org/gnome/shell/ui/dnd.js': {},
        'resource:///org/gnome/shell/ui/main.js': {},
        'resource:///org/gnome/shell/ui/popupMenu.js': {},
    };
    const {DashIcon} = await GjsHarness.loadGjsModule(new URL('../src/components/dash/dashIcon.js', import.meta.url), imports);
    return {create(iconSize, indicatorCount, rowHeight) {
        const item = {name: 'App', createIcon: () => new Actor({
            naturalWidth: iconSize * scale, naturalHeight: iconSize * scale,
        })};
        const button = new DashIcon({item, indicatorCount, group: 'favorites', hardcoded: true},
            {}, iconSize, (iconSize + 8) * scale, rowHeight * scale);
        const content = button.child;
        content.vfunc_allocate(new ActorBox(100, 200, 100 + button.width, 200 + button.height));
        return {content, icon: content.children[0], dots: content.children[1]};
    }};
}

describe('Dash icon allocation', () => {
    it('dots stay centered below the icon at both sizes, in collapsed and expanded rows, at native scale', async () => {
        for (const scale of [1, 1.5, 2]) {
            const f = await fixture(scale);
            for (const iconSize of [32, 40]) {
                for (const rowHeight of [Constants.SECTION_HEIGHT - Constants.DASH_BORDER_WIDTH * 2, 48]) {
                    const plain = f.create(iconSize, 0, rowHeight);
                    for (const count of [1, 2, 3, 4]) {
                        const {content, icon, dots} = f.create(iconSize, count, rowHeight);
                        expect(icon.allocation).toEqual(plain.icon.allocation);
                        expect(content.vfunc_get_preferred_width(-1)).toEqual(plain.content.vfunc_get_preferred_width(-1));
                        expect(content.vfunc_get_preferred_height(-1)).toEqual(plain.content.vfunc_get_preferred_height(-1));
                        expect(content.x_expand).toBe(true);
                        expect(content.y_expand).toBe(true);
                        expect(dots.allocation.y1).toBe(icon.allocation.y2);
                        expect(Math.abs((dots.allocation.x1 + dots.allocation.x2) / 2 -
                            (icon.allocation.x1 + icon.allocation.x2) / 2)).toBeLessThanOrEqual(0.5);
                        expect(dots.allocation.y2).toBeLessThanOrEqual(rowHeight * scale);
                    }
                }
            }
        }
    });
});

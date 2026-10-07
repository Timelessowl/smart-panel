import * as Stylesheet from '@/tests/stylesheet.js';
import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';
import * as Constants from '@/constant.js';
import * as PanelMenuDoubles from '@/tests/panelMenu.js';

async function fixture(scale) {
    const dotStyle = Stylesheet.stylesheet.match(/\.dash-window-dot\s*\{([^}]+)\}/)[1];
    const dotSize = Number(dotStyle.match(/height:\s*(\d+)px/)[1]) * scale;
    const dotsStyle = Stylesheet.stylesheet.match(/\.dash-window-dots\s*\{([^}]+)\}/)[1];
    const dotGap = Number(dotsStyle.match(/padding-top:\s*(\d+)px/)[1]) * scale;
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
        set_child(child) { this.child = child; this.children = child ? [child] : []; }
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
                Math.max(0, this.children.length - 1) * 2 * scale;
            return [width, width];
        }
        get_preferred_height() { return [dotSize + dotGap, dotSize + dotGap]; }
    }
    const nativeMenus = PanelMenuDoubles.createDoubles(Actor);
    const imports = {
        'gi://Clutter': {default: {ActorBox, ActorAlign: {FILL: 0}, ClickAction: nativeMenus.ClickAction}},
        'gi://GObject': {default: {registerClass: cls => cls}},
        'gi://St': {default: {Widget: Actor, Button: Actor, BoxLayout, Side: {BOTTOM: 1}}},
        'resource:///org/gnome/shell/ui/dnd.js': {},
        'resource:///org/gnome/shell/ui/main.js': {},
        'resource:///org/gnome/shell/ui/popupMenu.js': nativeMenus.PopupMenu,
        'resource:///org/gnome/shell/ui/panelMenu.js': nativeMenus.PanelMenu,
    };
    const {DashIcon} = await GjsHarness.loadGjsModule(new URL('components/dash/dashIcon.js', GjsHarness.sourceDirectory), imports);
    return {create(iconSize, indicatorCount, rowHeight) {
        const item = {name: 'App', app: {get_app_info: () => null,
            can_open_new_window: () => false, create_icon_texture: () => new Actor({
            naturalWidth: iconSize * scale, naturalHeight: iconSize * scale,
        })}};
        const button = new DashIcon({item, indicatorCount, group: 'favorites', hardcoded: true},
            {}, iconSize, (iconSize + 8) * scale, rowHeight * scale);
        const content = button.children[0];
        content.vfunc_allocate(new ActorBox(100, 200, 100 + button.width, 200 + button.height));
        return {content, icon: content._icon, dots: content._dots, highlight: content._highlight};
    }};
}

describe('Dash icon allocation', () => {
    it('dots stay centered below the icon at both sizes, in collapsed and expanded rows, at native scale', async () => {
        for (const scale of [1, 1.5, 2]) {
            const f = await fixture(scale);
            for (const iconSize of [32, 40]) {
                for (const rowHeight of [Constants.SECTION_HEIGHT - Constants.DASH_BORDER_WIDTH * 2,
                    Constants.DASH_EXPANDED_ROW_HEIGHT]) {
                    const plain = f.create(iconSize, 0, rowHeight);
                    for (const count of [1, 2, 3, 4]) {
                        const {content, icon, dots, highlight} = f.create(iconSize, count, rowHeight);
                        expect(highlight.allocation.get_width()).toBe(highlight.allocation.get_height());
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

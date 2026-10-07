import * as GjsHarness from '#tests/gjsHarness.mjs';
import {SignalObject} from '#tests/gjsHarness.mjs';
import * as Constants from '@/constant.js';

async function fixture(wayland, geometryScale) {
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, props);
            this.children = [];
        }
        add_child(child) { this.children.push(child); }
        set_size(width, height) { Object.assign(this, {width, height}); }
        set_position(x, y) { Object.assign(this, {x, y}); }
    }
    class Dash extends Actor {
        constructor() { super(); this.preferredWidth = 200; }
        setAvailableSize(width, height) { this.availableSize = [width, height]; }
    }
    class Indicators extends Actor {
        constructor() { super(); this.preferredWidth = Constants.INDICATOR_MIN_WIDTH; }
    }
    const imports = {
        'gi://Clutter': {default: {FixedLayout: class {}}},
        'gi://GObject': {default: {registerClass: cls => cls}},
        'gi://Meta': {default: {is_wayland_compositor: () => wayland}},
        'gi://St': {default: {Widget: Actor}},
        'resource:///org/gnome/shell/ui/main.js': {layoutManager: {
            addChrome: (actor, options) => { actor.chromeOptions = options; },
        }},
    };
    for (const [file, name, type] of [
        ['dashSection', 'DashSection', Dash],
        ['debianButton', 'DebianButton', Actor],
        ['indicatorSection', 'IndicatorSection', Indicators],
        ['searchSection', 'SearchSection', Actor],
        ['systemSection', 'SystemSection', Actor],
    ]) {
        imports[new URL(`../src/components/${file}.js`, import.meta.url).href] = {[name]: type};
    }
    const {BottomPanel} = await GjsHarness.loadGjsModule(
        new URL('../src/components/bottomPanel.js', import.meta.url), imports);
    const monitor = {index: 0, x: 200, y: 100, width: 1920, height: 1080,
        geometry_scale: geometryScale};
    return {panel: new BottomPanel(monitor, {}), monitor};
}

describe('Content and border geometry', () => {
    it('keeps content height separate from the two border edges and panel padding', () => {
        expect(Constants.SECTION_HEIGHT).toBe(64);
        expect(Constants.SECTION_FRAME_WIDTH).toBe(8);
        expect(Constants.SECTION_BORDER_WIDTH).toBe(1);
        expect(Constants.PANEL_HEIGHT).toBe(122);
        expect(Constants.PANEL_HEIGHT).toBe(Constants.SECTION_HEIGHT + (Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH) * 2 +
            Constants.PANEL_TOP_PADDING + Constants.PANEL_BOTTOM_PADDING);
        expect(Constants.INDICATOR_MIN_WIDTH).toBe(Constants.SECTION_HEIGHT + (Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH) * 2);
    });

    it('allocates framed sections, square button/indicator, gaps and reservation consistently on X11', async () => {
        for (const scale of [1, 1.5, 2]) {
            const {panel, monitor} = await fixture(false, scale);
            const outerHeight = (Constants.SECTION_HEIGHT + (Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH) * 2) * scale;
            expect(panel.height).toBe(Constants.PANEL_HEIGHT * scale);
            expect(panel.y + panel.height).toBe(monitor.y + monitor.height);
            for (const section of panel._components) {
                expect(section.height).toBe(outerHeight);
                expect(section.y).toBe(Constants.PANEL_TOP_PADDING * scale);
                expect(panel.height - section.y - section.height).toBe(Constants.PANEL_BOTTOM_PADDING * scale);
                expect(section.height - (Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH) * scale * 2)
                    .toBe(Constants.SECTION_HEIGHT * scale);
            }
            expect(panel._debianButton.width).toBe(outerHeight);
            expect(panel._indicatorSection.width).toBe(outerHeight);
            expect(panel._debianButton.x).toBe(Constants.PANEL_HORIZONTAL_PADDING * scale);
            expect(panel._dashSection.x - panel._debianButton.x - panel._debianButton.width)
                .toBe(Constants.START_SECTION_GAP * scale);
            expect(panel.chromeOptions.affectsStruts).toBeTrue();
        }
    });

    it('leaves Wayland stage dimensions unmultiplied', async () => {
        const {panel} = await fixture(true, 2);
        expect(panel.height).toBe(Constants.PANEL_HEIGHT);
        expect(panel._debianButton.height).toBe(Constants.SECTION_HEIGHT + (Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH) * 2);
        expect(panel._debianButton.width).toBe(Constants.SECTION_HEIGHT + (Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH) * 2);
        expect(panel._scaleFactor).toBe(1);
    });
});

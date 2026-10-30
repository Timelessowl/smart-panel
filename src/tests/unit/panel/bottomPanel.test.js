import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';
import * as Constants from '@/extension/constants.js';

async function fixture(geometryScale, secondaryScale = geometryScale) {
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, props);
            this.children = [];
        }
        add_child(child) { this.children.push(child); }
        insert_child_at_index(child, index) { this.children.splice(index, 0, child); }
        set_size(width, height) { Object.assign(this, {width, height}); }
        set_position(x, y) { Object.assign(this, {x, y}); }
    }
    class Dash extends Actor {
        constructor(source, monitorIndex, themeManager, notificationsMonitor, appGrid) {
            super();
            this.preferredWidth = 200;
            this.appGrid = appGrid;
        }
        setAvailableSize(width, height) { this.availableSize = [width, height]; }
        closeExpanded() { this.expandedClosed = true; }
    }
    class AppGrid extends Actor {
        constructor(panel) { super(); this.panel = panel; }
    }
    class Indicators extends Actor {
        constructor() { super(); this.preferredWidth = Constants.INDICATOR_MIN_WIDTH; }
    }
    const imports = {
        'gi://Clutter': {default: {FixedLayout: class {}}},
        'gi://GObject': {default: {registerClass: cls => cls}},
        'gi://St': {default: {Widget: Actor}},
        'resource:///org/gnome/shell/ui/main.js': {layoutManager: {
            primaryMonitor: {index: 0, geometry_scale: geometryScale},
            addChrome: (actor, options) => { actor.chromeOptions = options; },
        }},
    };
    for (const [file, name, type] of [
        ['appGrid', 'AppGrid', AppGrid],
        ['dashSection', 'DashSection', Dash],
        ['debianButton', 'DebianButton', Actor],
        ['indicatorSection', 'IndicatorSection', Indicators],
        ['searchSection', 'SearchSection', Actor],
        ['systemSection', 'SystemSection', class extends Actor {
            constructor() { super(); this.preferredWidth = 236; }
        }],
    ]) {
        imports[new URL(`extension/components/${file}.js`, GjsHarness.sourceDirectory).href] = {[name]: type};
    }
    const {BottomPanel} = await GjsHarness.loadGjsModule(
        new URL('extension/components/bottomPanel.js', GjsHarness.sourceDirectory), imports);
    const monitor = {index: 1, x: 200, y: 100, width: 1920, height: 1080,
        geometry_scale: secondaryScale};
    return {panel: new BottomPanel(monitor, {}), monitor};
}

describe('Content and border geometry', () => {
    it('creates one grid with the panel and passes that instance to the dash', async () => {
        const {panel, monitor} = await fixture(1);
        const grid = panel._appGrid;
        expect(grid.panel).toBe(panel);
        expect(grid.panel._monitor).toBe(monitor);
        expect(grid.panel._searchSection).toBe(panel._searchSection);
        expect(panel._dashSection.appGrid).toBe(grid);
        panel._updateGeometry();
        expect(panel._appGrid).toBe(grid);
    });

    it('keeps content height separate from the two border edges and panel padding', () => {
        expect(Constants.SECTION_HEIGHT).toBe(74);
        expect(Constants.SECTION_FRAME_WIDTH).toBe(8);
        expect(Constants.SECTION_BORDER_WIDTH).toBe(1);
        expect(Constants.PANEL_HEIGHT).toBe(90);
        expect(Constants.PANEL_HEIGHT).toBe(Constants.SECTION_HEIGHT + Constants.PANEL_TOP_PADDING + Constants.PANEL_BOTTOM_PADDING);
        expect(Constants.INDICATOR_MIN_WIDTH).toBe(Constants.SECTION_HEIGHT);
    });

    it('allocates framed sections, square button/indicator, gaps and reservation consistently using the primary monitor scale', async () => {
        for (const scale of [1, 1.5, 2]) {
            const {panel, monitor} = await fixture(scale);
            const outerHeight = Constants.SECTION_HEIGHT * scale;
            expect(panel.height).toBe(Constants.PANEL_HEIGHT * scale);
            expect(panel.y + panel.height).toBe(monitor.y + monitor.height);
            for (const section of panel._components) {
                expect(section.height).toBe(outerHeight);
                expect(section.y).toBe(Constants.PANEL_TOP_PADDING * scale);
                expect(panel.height - section.y - section.height).toBe(Constants.PANEL_BOTTOM_PADDING * scale);
                expect(section.height - (Constants.SECTION_FRAME_WIDTH + Constants.SECTION_BORDER_WIDTH) * scale * 2)
                    .toBe(Constants.CONTENT_HEIGHT * scale);
            }
            expect(panel._debianButton.width).toBe(outerHeight);
            expect(panel._indicatorSection.width).toBe(outerHeight);
            expect(panel._debianButton.x).toBe(Constants.PANEL_HORIZONTAL_PADDING * scale);
            expect(panel._dashSection.x - panel._debianButton.x - panel._debianButton.width)
                .toBe(Constants.START_SECTION_GAP * scale);
            expect(panel.chromeOptions.affectsStruts).toBeTrue();
        }
    });

    it('scales every panel from the primary monitor even when the target scale differs', async () => {
        const {panel} = await fixture(2, 1);
        expect(panel.height).toBe(Constants.PANEL_HEIGHT * 2);
        expect(panel._debianButton.height).toBe(Constants.SECTION_HEIGHT * 2);
        expect(panel._debianButton.width).toBe(Constants.SECTION_HEIGHT * 2);
        expect(Object.hasOwn(panel, '_scaleFactor')).toBe(false);
    });

    it('updates allocated dash width from the section signal without refreshing its source', async () => {
        const {panel} = await fixture(1);
        const searchX = panel._searchSection.x;
        panel._dashSection.preferredWidth = 300;
        panel._dashSection.emit('layout-changed');
        expect(panel._dashSection.width).toBe(300);
        expect(panel._searchSection.x).toBe(searchX);
        panel._dashSection.preferredWidth = 10000;
        panel._dashSection.emit('layout-changed');
        expect(panel._dashSection.width).toBe(panel._dashSection.availableSize[0]);
    });
});

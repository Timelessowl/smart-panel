import * as GjsHarness from '@/tests/gjsHarness.js';
import * as DashLayout from '@/components/dash/dashLayout.js';
let DashSource;
let DashUtils;
beforeAll(async () => {
    const imports = {'gi://GLib': {default: {}}, 'gi://Shell': {default: {}},
        'gi://GObject': {default: GjsHarness.createGObjectDouble()},
        'resource:///org/gnome/shell/ui/appFavorites.js': {},
        'resource:///org/gnome/shell/ui/main.js': {}};
    ({DashSource} = await GjsHarness.loadGjsModule(
        new URL('components/dash/dashSource.js', GjsHarness.sourceDirectory), imports));
    DashUtils = await GjsHarness.loadGjsModule(
        new URL('components/dash/dashUtils.js', GjsHarness.sourceDirectory), imports);
});

const app = id => ({get_id: () => id, get_name: () => id});
const window = (app, id, monitor = 0) => ({
    id: `window:${id}`, app, get_stable_sequence: () => id,
    get_monitor: () => monitor, get_title: () => `Window ${id}`,
});
const firefox = app('firefox');
const files = app('files');
const terminal = app('terminal');
const editor = app('editor');
const hardcodedIds = new Set(['firefox', 'files']);
const snapshot = overrides => {
    const data = {favorites: [firefox, files], running: [firefox, terminal],
        hardcodedIds, perWindow: false, monitorIndex: 0, monitorOnly: false,
        windows: [window(firefox, 1), window(firefox, 2, 1), window(terminal, 3)], ...overrides};
    return data;
};

function entries(data) {
    const source = Object.create(DashSource.prototype);
    source._state = {...data, fixedIds: data.hardcodedIds};
    source._windows = new Map(data.windows.map(window => [window, {app: window.app}]));
    return source.getEntries({monitor: data.monitorIndex,
        favoriteOrder: data.favoriteOrder, runningOrder: data.runningOrder});
}

describe('Dash entries, layout and actions', () => {
    it('view descriptions retain native identities without mutating apps or windows', () => {
        const data = snapshot({perWindow: true});
        const result = entries(data);
        expect(result.favorites[0].item.app).toBe(firefox);
        expect(result.favorites[0].representedWindow).toBe(data.windows[0]);
        expect(firefox.id).toBeUndefined();
        expect(data.windows[0].appId).toBeUndefined();
    });

    it('per-app entries exclude favorites from running and caps dots at four', () => {
        const result = entries(snapshot({windows: [
            ...Array.from({length: 7}, (_, i) => window(firefox, i)), window(terminal, 99),
        ]}));
        expect(result.favorites[0].indicatorCount).toBe(4);
        expect(result.favorites[1].indicatorCount).toBe(0);
        expect(result.running.map(entry => entry.item.app)).toEqual([terminal]);
        expect(result.running[0].indicatorCount).toBe(1);
    });

    it('per-window favorites absorb only the first window and running has no dots', () => {
        const result = entries(snapshot({perWindow: true}));
        expect(result.favorites[0].representedWindow.id).toBe('window:1');
        expect(result.favorites[0].item.window).toBeUndefined();
        expect(result.favorites[1].item.app).toBe(files);
        expect(result.favorites[0].indicatorCount).toBe(1);
        expect(result.running.map(entry => entry.item.id)).toEqual(['window:2', 'window:3']);
        expect(result.running.every(entry => entry.indicatorCount === 0)).toBeTruthy();
    });

    it('monitor filtering retains every favorite but filters dots and running items', () => {
        for (const perWindow of [false, true]) {
            const result = entries(snapshot({monitorOnly: true, monitorIndex: 1, perWindow}));
            expect(result.favorites.length).toBe(2);
            expect(result.favorites[0].indicatorCount).toBe(1);
            expect(result.favorites[1].indicatorCount).toBe(0);
            expect(result.running.length).toBe(0);
            if (perWindow)
                expect(result.favorites[0].representedWindow.id).toBe('window:2');
        }
    });

    it('per-window favorite returns to its app when its last visible window closes', () => {
        const running = entries(snapshot({perWindow: true}));
        expect(running.favorites[0].item.id).toBe('window:1');
        const closed = entries(snapshot({perWindow: true, windows: []}));
        expect(closed.favorites[0].item.app).toBe(firefox);
        expect(closed.favorites[0].representedWindow).toBe(null);
        expect(closed.favorites[0].indicatorCount).toBe(0);
    });

    it('fixed favorites stay first and panel-local order does not mutate source', () => {
        const data = snapshot({favorites: [firefox, files, terminal, editor], running: []});
        const local = entries({...data, favoriteOrder: ['editor', 'firefox', 'terminal', 'files']});
        expect(local.favorites.map(entry => entry.item.appId)).toEqual(['firefox', 'files', 'editor', 'terminal']);
        expect(entries(data).favorites.map(entry => entry.item.appId)).toEqual(['firefox', 'files', 'terminal', 'editor']);
    });

    it('running order is local and new items follow manually ordered items', () => {
        const data = snapshot({running: [terminal, editor], windows: [window(terminal, 1), window(editor, 2)]});
        const local = entries({...data, runningOrder: ['app:editor', 'app:terminal']});
        expect(local.running.map(entry => entry.item.app)).toEqual([editor, terminal]);
        expect(entries(data).running.map(entry => entry.item.app)).toEqual([terminal, editor]);
    });

    it('40px then 32px then overflow, including launchpad, separator and frame widths', () => {
        const groups = entries(snapshot());
        const items = [...groups.favorites, ...groups.running];
        const wide = DashLayout.layoutDash(items, 1000, 11);
        expect(wide.iconSize).toBe(40);
        expect(wide.width).toBe(238);
        expect(DashLayout.layoutDash(items, wide.width, 11).iconSize).toBe(40);
        const small = DashLayout.layoutDash(items, wide.width - 1, 11);
        expect(small.iconSize).toBe(32);
        expect(small.hiddenCount).toBe(0);
        expect(small.width).toBe(206);
        const overflow = DashLayout.layoutDash(items, small.width - 1, 11);
        expect(overflow.iconSize).toBe(32);
        expect(overflow.hiddenCount).toBeGreaterThan(0);
        expect(overflow.width).toBeLessThanOrEqual(small.width - 1);
        expect(overflow.tokens[0].width).toBe(40);
        expect(overflow.tokens.at(-1).hiddenCount).toBe(overflow.hiddenCount);
    });

    it('different monitors choose independent icon sizes and overflow counts', () => {
        const entries = Array.from({length: 20}, (_, index) => ({
            item: app(`${index}`), group: index < 2 ? 'favorites' : 'running',
        }));
        expect(DashLayout.layoutDash(entries, 2000, 11).iconSize).toBe(40);
        expect(DashLayout.layoutDash(entries, 1000, 11).iconSize).toBe(32);
        expect(DashLayout.layoutDash(entries, 500, 11).hiddenCount).toBeGreaterThan(0);
    });

    it('an empty running subsection has no separator; launchpad is never a DashIcon', () => {
        const result = entries(snapshot({running: [], windows: []}));
        const layout = DashLayout.layoutDash(result.favorites, 1000, 11);
        expect(layout.tokens.filter(token => token.type === 'separator').length).toBe(0);
        expect(layout.tokens[0].type).toBe('launchpad');
        expect(layout.tokens.filter(token => token.type === 'icon').length).toBe(2);
    });

    it('overflow counts exclude the launchpad and separator, expanded rows restore all icons', () => {
        for (const scale of [1, 1.5, 2, 3]) {
            for (const count of [3, 20, 100]) {
                const entries = Array.from({length: count}, (_, index) => ({
                    item: app(`${index}`), group: index < 2 ? 'favorites' : 'running',
                }));
                for (const width of [150, 250, 500, 1000]) {
                    const layout = DashLayout.layoutDash(entries, width * scale, 11 * scale, scale);
                    const shown = layout.tokens.filter(token => token.type === 'icon').length;
                    expect(shown + layout.hiddenCount).toBe(count);
                    expect(layout.width).toBeLessThanOrEqual(width * scale);
                    const rows = DashLayout.expandedRows(entries, layout.iconSize, (width - 22) * scale, scale);
                    expect(rows.flat().filter(token => token.type === 'icon').length).toBe(count);
                    expect(rows.flat().filter(token => token.type === 'launchpad').length).toBe(1);
                    expect(rows.flat().filter(token => token.type === 'separator').length).toBe(1);
                    for (const row of rows) {
                        expect(row.at(-1).type).not.toBe('separator');
                        expect(DashLayout.tokensWidth(row, scale)).toBeLessThanOrEqual((width - 22) * scale);
                    }
                }
            }
        }
    });

    it('multi-window activation cycles first, second, minimize all, first', () => {
        const entry = {item: {appId: firefox.get_id()}, windows: [window(firefox, 1), window(firefox, 2)]};
        let cycle = null;
        const actions = [];
        for (let index = 0; index < 4; index++) {
            const next = DashUtils.nextAppAction(cycle, entry);
            actions.push(next.action.type === 'focus' ? next.action.window.id : next.action.type);
            cycle = next.cycle;
        }
        expect(actions).toEqual(['window:1', 'window:2', 'minimize', 'window:1']);
    });

    it('changing app or its window set resets the cycle; an empty filtered favorite launches', () => {
        const entry = {item: {appId: firefox.get_id()}, windows: [window(firefox, 1), window(firefox, 2)]};
        const first = DashUtils.nextAppAction(null, entry);
        expect(DashUtils.nextAppAction(first.cycle, {...entry, item: {appId: terminal.get_id()}}).action.window.id).toBe('window:1');
        expect(DashUtils.nextAppAction(first.cycle, {...entry,
            windows: [window(firefox, 1), window(firefox, 3)]}).action.window.id).toBe('window:1');
        expect(DashUtils.nextAppAction(first.cycle, {...entry, windows: []}).action.type).toBe('launch');
    });
});

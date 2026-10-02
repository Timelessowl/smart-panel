import {AppItem} from '../components/dash/appItem.js';
import {WindowItem} from '../components/dash/windowItem.js';
import {projectDash} from '../components/dash/dashProjection.js';
import {expandedRows, layoutDash, tokensWidth} from '../components/dash/dashLayout.js';
import {nextAppAction} from '../components/dash/appActivation.js';

const app = id => ({id: `app:${id}`, appId: id, name: id});
const window = (appItem, id, monitor = 0) => ({
    id: `window:${id}`, stableId: id, appId: appItem.appId, monitor,
    window: {get_stable_sequence: () => id},
});
const firefox = app('firefox');
const files = app('files');
const terminal = app('terminal');
const editor = app('editor');
const hardcodedIds = new Set(['firefox', 'files']);
const snapshot = overrides => ({favorites: [firefox, files],
    running: [firefox, terminal], hardcodedIds, perWindow: false,
    monitorIndex: 0, monitorOnly: false,
    windows: [window(firefox, 1), window(firefox, 2, 1), window(terminal, 3)], ...overrides});

describe('Dash models, projection, layout and activation', () => {
    it('models refresh metadata without creating or owning actors', () => {
        let name = 'App';
        const appInfo = {get_icon: () => 'icon'};
        const shellApp = {get_id: () => 'id', get_name: () => name,
            get_app_info: () => appInfo, get_state: () => 1, get_windows: () => [],
            create_icon_texture: size => ({size})};
        const item = new AppItem(shellApp);
        expect(item.appInfo).toBe(appInfo);
        expect(item.icon).toBe('icon');
        expect(item.createIcon(40)).toEqual({size: 40});
        let monitor = 0;
        let title = 'First';
        const win = new WindowItem({get_stable_sequence: () => 10,
            get_title: () => title, get_monitor: () => monitor}, item);
        name = 'Updated'; title = 'Second'; monitor = 2;
        item.refresh(); win.refresh();
        expect(item.name).toBe('Updated');
        expect(win.title).toBe('Second');
        expect(win.monitor).toBe(2);
        expect(win.appInfo).toBe(appInfo);
    });

    it('per-app projection excludes favorites from running and caps dots at four', () => {
        const result = projectDash(snapshot({windows: [
            ...Array.from({length: 7}, (_, i) => window(firefox, i)), window(terminal, 99),
        ]}));
        expect(result.favorites[0].indicatorCount).toBe(4);
        expect(result.favorites[1].indicatorCount).toBe(0);
        expect(result.running.map(entry => entry.item)).toEqual([terminal]);
        expect(result.running[0].indicatorCount).toBe(1);
    });

    it('per-window favorites absorb only the first window and running has no dots', () => {
        const result = projectDash(snapshot({perWindow: true}));
        expect(result.favorites[0].representedWindow.id).toBe('window:1');
        expect(result.favorites[0].item).toBe(result.favorites[0].representedWindow);
        expect(result.favorites[1].item).toBe(files);
        expect(result.favorites[0].indicatorCount).toBe(1);
        expect(result.running.map(entry => entry.item.id)).toEqual(['window:2', 'window:3']);
        expect(result.running.every(entry => entry.indicatorCount === 0)).toBeTruthy();
    });

    it('monitor filtering retains every favorite but filters dots and running items', () => {
        for (const perWindow of [false, true]) {
            const result = projectDash(snapshot({monitorOnly: true, monitorIndex: 1, perWindow}));
            expect(result.favorites.length).toBe(2);
            expect(result.favorites[0].indicatorCount).toBe(1);
            expect(result.favorites[1].indicatorCount).toBe(0);
            expect(result.running.length).toBe(0);
            if (perWindow)
                expect(result.favorites[0].representedWindow.id).toBe('window:2');
        }
    });

    it('per-window favorite returns to its AppItem when its last visible window closes', () => {
        const running = projectDash(snapshot({perWindow: true}));
        expect(running.favorites[0].item.id).toBe('window:1');
        const closed = projectDash(snapshot({perWindow: true, windows: []}));
        expect(closed.favorites[0].item).toBe(firefox);
        expect(closed.favorites[0].representedWindow).toBe(null);
        expect(closed.favorites[0].indicatorCount).toBe(0);
    });

    it('fixed favorites stay first and panel-local order does not mutate source', () => {
        const data = snapshot({favorites: [firefox, files, terminal, editor], running: []});
        const local = projectDash({...data, favoriteOrder: ['editor', 'firefox', 'terminal', 'files']});
        expect(local.favorites.map(entry => entry.item.appId)).toEqual(['firefox', 'files', 'editor', 'terminal']);
        expect(projectDash(data).favorites.map(entry => entry.item.appId)).toEqual(['firefox', 'files', 'terminal', 'editor']);
    });

    it('running order is local and new items follow manually ordered items', () => {
        const data = snapshot({running: [terminal, editor]});
        const local = projectDash({...data, runningOrder: [editor.id, terminal.id]});
        expect(local.running.map(entry => entry.item)).toEqual([editor, terminal]);
        expect(projectDash(data).running.map(entry => entry.item)).toEqual([terminal, editor]);
    });

    it('40px then 32px then overflow, including launchpad, separator and frame widths', () => {
        const projection = projectDash(snapshot());
        const entries = [...projection.favorites, ...projection.running];
        const wide = layoutDash(entries, 1000, 11);
        expect(wide.iconSize).toBe(40);
        expect(wide.width).toBe(238);
        expect(layoutDash(entries, wide.width, 11).iconSize).toBe(40);
        const small = layoutDash(entries, wide.width - 1, 11);
        expect(small.iconSize).toBe(32);
        expect(small.hiddenCount).toBe(0);
        expect(small.width).toBe(214);
        const overflow = layoutDash(entries, small.width - 1, 11);
        expect(overflow.iconSize).toBe(32);
        expect(overflow.hiddenCount).toBeGreaterThan(0);
        expect(overflow.width).toBeLessThanOrEqual(small.width - 1);
        expect(overflow.tokens[0].width).toBe(48);
        expect(overflow.tokens.at(-1).hiddenCount).toBe(overflow.hiddenCount);
    });

    it('different monitors choose independent icon sizes and overflow counts', () => {
        const entries = Array.from({length: 20}, (_, index) => ({
            item: app(`${index}`), group: index < 2 ? 'favorites' : 'running',
        }));
        expect(layoutDash(entries, 2000, 11).iconSize).toBe(40);
        expect(layoutDash(entries, 1000, 11).iconSize).toBe(32);
        expect(layoutDash(entries, 500, 11).hiddenCount).toBeGreaterThan(0);
    });

    it('an empty running subsection has no separator; launchpad is never a DashIcon', () => {
        const result = projectDash(snapshot({running: [], windows: []}));
        const layout = layoutDash(result.favorites, 1000, 11);
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
                    const layout = layoutDash(entries, width * scale, 11 * scale, scale);
                    const shown = layout.tokens.filter(token => token.type === 'icon').length;
                    expect(shown + layout.hiddenCount).toBe(count);
                    expect(layout.width).toBeLessThanOrEqual(width * scale);
                    const rows = expandedRows(entries, layout.iconSize, (width - 22) * scale, scale);
                    expect(rows.flat().filter(token => token.type === 'icon').length).toBe(count);
                    expect(rows.flat().filter(token => token.type === 'launchpad').length).toBe(1);
                    expect(rows.flat().filter(token => token.type === 'separator').length).toBe(1);
                    for (const row of rows) {
                        expect(row.at(-1).type).not.toBe('separator');
                        expect(tokensWidth(row, scale)).toBeLessThanOrEqual((width - 22) * scale);
                    }
                }
            }
        }
    });

    it('multi-window activation cycles first, second, minimize all, first', () => {
        const entry = {item: firefox, windows: [window(firefox, 1), window(firefox, 2)]};
        let cycle = null;
        const actions = [];
        for (let index = 0; index < 4; index++) {
            const next = nextAppAction(cycle, entry);
            actions.push(next.action.type === 'focus' ? next.action.window.id : next.action.type);
            cycle = next.cycle;
        }
        expect(actions).toEqual(['window:1', 'window:2', 'minimize', 'window:1']);
    });

    it('changing app or its window set resets the cycle; an empty filtered favorite launches', () => {
        const entry = {item: firefox, windows: [window(firefox, 1), window(firefox, 2)]};
        const first = nextAppAction(null, entry);
        expect(nextAppAction(first.cycle, {...entry, item: terminal}).action.window.id).toBe('window:1');
        expect(nextAppAction(first.cycle, {...entry,
            windows: [window(firefox, 1), window(firefox, 3)]}).action.window.id).toBe('window:1');
        expect(nextAppAction(first.cycle, {...entry, windows: []}).action.type).toBe('launch');
    });
});

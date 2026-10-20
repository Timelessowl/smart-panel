import * as GjsHarness from '@/tests/gjsHarness.js';

it('replaces, completes and destroys GLib timers without removing expired sources', async () => {
    const sources = new Map();
    let nextId = 1;
    const GLib = {
        PRIORITY_DEFAULT: 0, SOURCE_CONTINUE: true, SOURCE_REMOVE: false,
        timeout_add(_priority, _delay, callback) {
            const id = nextId++; sources.set(id, callback); return id;
        },
        source_remove(id) {
            if (!sources.delete(id)) throw new Error(`Invalid GLib source ${id}`);
        },
    };
    const {default: TimeoutManager} = await GjsHarness.loadGjsModule(
        new URL('utils/timeoutHelper.js', GjsHarness.sourceDirectory), {'gi://GLib': {default: GLib}});
    const manager = new TimeoutManager();
    const calls = [];
    manager.addTimeout('show', 10, () => { calls.push('obsolete'); return false; });
    manager.addTimeout('show', 10, () => {
        manager.clearTimeout('show'); calls.push('current'); return false;
    });
    expect(sources.size).toBe(1);
    const [id, callback] = sources.entries().next().value;
    sources.delete(id); callback();
    expect(calls).toEqual(['current']);
    expect(manager.hasActiveTimeout('show')).toBe(false);
    manager.addTimeout('repeat', 10, () => true);
    const repeat = [...sources.values()][0];
    expect(repeat()).toBe(true);
    expect(manager.hasActiveTimeout('repeat')).toBe(true);
    manager.destroy();
    expect(sources.size).toBe(0);
});

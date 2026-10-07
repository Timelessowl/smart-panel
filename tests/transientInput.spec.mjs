import * as GjsHarness from '#tests/gjsHarness.mjs';
import {SignalObject} from '#tests/gjsHarness.mjs';

async function fixture() {
    let pointer = [0, 0, 0];
    let poll;
    const permissions = [];
    const display = new SignalObject();
    const ungrabbed = [];
    Object.assign(display, {grab_accelerator: () => 10,
        ungrab_accelerator: id => ungrabbed.push(id)});
    const imports = {
        'gi://Clutter': {default: {ModifierType: {BUTTON1_MASK: 1, BUTTON2_MASK: 2,
            BUTTON3_MASK: 4, BUTTON4_MASK: 8, BUTTON5_MASK: 16}}},
        'gi://GLib': {default: {PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
            SOURCE_CONTINUE: true, timeout_add: (_priority, _interval, callback) => {
                poll = callback; return 1;
            }, source_remove: () => {}}},
        'gi://Meta': {default: {KeyBindingFlags: {NONE: 0}, KeyBindingAction: {NONE: 0},
            external_binding_name_for_action: id => `external-${id}`}},
        'gi://Shell': {default: {ActionMode: {NORMAL: 1, POPUP: 2, NONE: 0}}},
        'resource:///org/gnome/shell/ui/main.js': {wm: {
            allowKeybinding: (binding, mode) => permissions.push([binding, mode]),
        }},
    };
    const {TransientInputManager} = await GjsHarness.loadGjsModule(
        new URL('../src/transientInputManager.js', import.meta.url), imports,
        {global: {display, get_pointer: () => pointer}});
    return {manager: new TransientInputManager(), display, permissions, ungrabbed,
        click(x, y) { pointer = [x, y, 0]; poll(); pointer = [x, y, 1]; return poll(); }};
}

const surface = (x, y, width, height) => ({
    get_transformed_position: () => [x, y], get_transformed_size: () => [width, height],
});

describe('Transient input dismissal', () => {
    it('outside click dismisses without an input grab or consuming pointer events', async () => {
        const f = await fixture();
        let dismissed = 0;
        const registration = f.manager.register(surface(10, 10, 100, 100), () => {
            dismissed++; f.manager.unregister(registration);
        });
        f.click(20, 20); expect(dismissed).toBe(0);
        expect(f.click(200, 200)).toBe(false);
        expect(dismissed).toBe(1);
        expect(f.ungrabbed).toEqual([10]);
        expect(f.display.signals.size).toBe(0);
        f.manager.destroy();
    });

    it('context menu counts as inside, and pointer dismissal is paused while dragging', async () => {
        const f = await fixture();
        let dismissed = 0;
        const related = new Set([surface(200, 200, 50, 50)]);
        const registration = f.manager.register(surface(0, 0, 50, 50), () => dismissed++, related);
        f.click(210, 210); expect(dismissed).toBe(0);
        registration.paused = true;
        f.click(500, 500); expect(dismissed).toBe(0);
        registration.paused = false;
        f.click(500, 500); expect(dismissed).toBe(1);
        f.manager.destroy();
    });

    it('Escape is allowed in normal/popup modes and released after dismissal', async () => {
        const f = await fixture();
        let dismissed = 0;
        const registration = f.manager.register(surface(0, 0, 50, 50), () => {
            dismissed++; f.manager.unregister(registration);
        });
        expect(f.permissions[0]).toEqual(['external-10', 3]);
        f.display.emit('accelerator-activated', 10);
        expect(dismissed).toBe(1);
        expect(f.permissions.at(-1)).toEqual(['external-10', 0]);
        expect(f.display.signals.size).toBe(0);
        f.manager.destroy();
    });
});

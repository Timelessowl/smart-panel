import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';

async function fixture() {
    class Actor extends SignalObject {
        constructor() {
            super();
            this.visible = true;
        }
    }
    class DashSection extends Actor {}
    class SystemSection extends Actor {}
    const {default: PropertyOverrideManager} = await GjsHarness.loadGjsModule(
        new URL('utils/propertyOverrideManager.js', GjsHarness.sourceDirectory),
        {
            'gi://Clutter': {default: {Actor}},
        },
    );
    return {manager: new PropertyOverrideManager(), dash: new DashSection(), system: new SystemSection()};
}

describe('Property overrides', () => {
    it('tracks different section classes independently when overriding the same property', async () => {
        const {manager, dash, system} = await fixture();
        manager.overrideProperty(dash, 'visible', false);
        manager.overrideProperty(system, 'visible', false);
        expect([...manager._overrides.keys()]).toEqual(['DashSection-visible', 'SystemSection-visible']);
        expect(dash.visible || system.visible).toBeFalse();
        manager.clear();
        expect(dash.visible && system.visible).toBeTrue();
        expect(dash.signals.size + system.signals.size).toBe(0);
    });

    it('preserves originally false values and the original value across repeated overrides', async () => {
        const {manager, dash, system} = await fixture();
        system.visible = false;
        manager.overrideProperty(dash, 'visible', false);
        manager.overrideProperty(dash, 'visible', false);
        manager.overrideProperty(system, 'visible', true);
        manager.destroy();
        expect(dash.visible).toBeTrue();
        expect(system.visible).toBeFalse();
        expect(dash.signals.size + system.signals.size).toBe(0);
    });

    it('removes the destroyed section by its compound key without losing other overrides', async () => {
        const {manager, dash, system} = await fixture();
        manager.overrideProperty(dash, 'visible', false);
        manager.overrideProperty(system, 'visible', false);
        dash.emit('destroy');
        expect([...manager._overrides.keys()]).toEqual(['SystemSection-visible']);
        manager.clear();
        expect(system.visible).toBeTrue();
        expect(dash.visible).toBeFalse();
    });
});

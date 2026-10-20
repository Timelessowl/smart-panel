import * as GjsHarness from '@/tests/gjsHarness.js';
import {SignalObject} from '@/tests/gjsHarness.js';
import * as Constants from '@/extension/constants.js';

async function fixture() {
    const timers = new Map(), chrome = new Set(), themed = new Set();
    let nextTimer = 1;
    class Actor extends SignalObject {
        constructor(props = {}) {
            super();
            Object.assign(this, {children: [], styles: new Set(), mapped: true, hover: true,
                visible: true, opacity: 255}, props);
            this.clutter_text = {set_ellipsize() {}};
        }
        set_child(actor) { this.children.push(actor); }
        add_style_class_name(name) { this.styles.add(name); }
        remove_style_class_name(name) { this.styles.delete(name); }
        set_style(style) { this.style = style; }
        get_transformed_position() { return [0, 100]; }
        setPosition(source) { this.positionedAt = source; }
        remove_all_transitions() { this.transition = null; }
        ease(props) { this.transition = props; this.opacity = props.opacity; }
        destroy() {
            this.remove_all_transitions();
            this.emit('destroy');
            for (const child of this.children) child.destroy();
        }
    }
    class BoxPointer extends Actor {
        constructor() { super(); this.bin = new Actor(); }
    }
    class MenuItem extends Actor {
        constructor(text) { super(); this.text = text; }
    }
    const settings = (values = {}) => Object.assign(new SignalObject(), {
        writable: true,
        get_boolean: key => Boolean(values[key]), get_strv: key => [...(values[key] ?? [])],
        is_writable() { return this.writable; },
        set_strv(key, value) { values[key] = [...value]; this.emit(`changed::${key}`); return true; },
        set_boolean(key, value) { values[key] = value; this.emit(`changed::${key}`); },
    });
    const notificationSettings = settings({'show-banners': true});
    const badgeSettings = settings({
        [Constants.SettingsKeys.NOTIFICATION_INDICATORS_ENABLED]: true,
        [Constants.SettingsKeys.NOTIFICATION_BADGE]: [Constants.APP_IDS.MAIL],
    });
    const tray = Object.assign(new SignalObject(), {sources: [], getSources() { return this.sources; }});
    class Policy { constructor(id) { this.id = id; } }
    const source = (appId, urgencies = []) => {
        const source = Object.assign(new SignalObject(), {policy: new Policy(appId), notifications: []});
        for (const urgency of urgencies)
            source.notifications.push(Object.assign(new SignalObject(), {urgency}));
        return source;
    };
    const first = source(Constants.APP_IDS.MAIL, [1, 2]);
    tray.sources.push(first);
    const layoutManager = {primaryMonitor: {geometry_scale: 2},
        addTopChrome: actor => chrome.add(actor), removeChrome: actor => chrome.delete(actor)};
    const imports = {
        'gi://Gio': {default: {Settings: function () { return notificationSettings; }}},
        'gi://GObject': {default: GjsHarness.createGObjectDouble()},
        'gi://Clutter': {default: {ActorAlign: {END: 1, START: 2, CENTER: 3},
            AnimationMode: {EASE_OUT_QUAD: 0}}},
        'gi://St': {default: {Label: Actor, Widget: Actor, Side: {BOTTOM: 1}}},
        'gi://Pango': {default: {EllipsizeMode: {END: 1}}},
        'gi://GLib': {default: {PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
            timeout_add(_priority, delay, callback) {
                const id = nextTimer++; timers.set(id, {delay, callback}); return id;
            },
            source_remove(id) { if (!timers.delete(id)) throw new Error(`Invalid source ${id}`); }}},
        '@girs/gnome-shell/ui/main': {messageTray: tray, layoutManager},
        '@girs/gnome-shell/ui/messageTray': {NotificationApplicationPolicy: Policy, Urgency: {NORMAL: 1}},
        '@girs/gnome-shell/ui/popupMenu': {PopupMenuItem: MenuItem},
        '@girs/gnome-shell/ui/boxpointer': {BoxPointer},
    };
    const load = file => GjsHarness.loadGjsModule(new URL(file, GjsHarness.sourceDirectory), imports);
    const {NotificationsMonitor} = await load('extension/common/notificationsMonitor.js');
    const {DashBadge} = await load('extension/components/dash/dashBadge.js');
    const {DashLabel} = await load('extension/components/dash/dashLabel.js');
    const monitor = new NotificationsMonitor();
    const theme = {addActor: actor => themed.add(actor), removeActor: actor => themed.delete(actor)};
    return {Actor, monitor, DashBadge, DashLabel, theme, chrome, themed, timers,
        badgeSettings, notificationSettings, tray, first, source,
        flush() {
            for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); }
        }};
}

describe('Dash notifications and labels', () => {
    it('aggregates all sources for an app and updates urgency without a count change', async () => {
        const f = await fixture();
        expect(f.monitor.getState(Constants.APP_IDS.MAIL)).toEqual({total: 2, urgent: true});
        const other = f.source('thunderbird', [1]);
        f.tray.emit('source-added', other);
        expect(f.monitor.getState(Constants.APP_IDS.MAIL).total).toBe(3);
        f.first.notifications[1].urgency = 1;
        f.first.notifications[1].emit('notify::urgency');
        expect(f.monitor.getState(Constants.APP_IDS.MAIL).urgent).toBe(false);
        f.tray.emit('source-removed', f.first);
        expect(f.monitor.getState(Constants.APP_IDS.MAIL).total).toBe(1);
        expect(f.first.signals.size).toBe(0);
        expect(f.first.notifications[0].signals.size).toBe(0);
        expect(other.signals.size).toBe(2);
        f.monitor.destroy();
        expect(other.signals.size).toBe(0);
        expect(other.notifications[0].signals.size).toBe(0);
        expect(f.tray.signals.size).toBe(0);
        expect(f.notificationSettings.signals.size).toBe(0);
    });

    it('removes notification listeners and clears urgency when the last urgent item is removed', async () => {
        const f = await fixture();
        const urgent = f.first.notifications.pop();
        f.first.emit('notification-removed', urgent);
        expect(urgent.signals.size).toBe(0);
        expect(f.monitor.getState(Constants.APP_IDS.MAIL)).toEqual({total: 1, urgent: false});
        const last = f.first.notifications.pop();
        f.first.emit('notification-removed', last);
        expect(f.monitor.getState(Constants.APP_IDS.MAIL)).toBe(null);
        f.monitor.destroy();
    });

    it('keeps badge policy separate from tray state and restores counts after DND', async () => {
        const f = await fixture();
        const container = new f.Actor();
        const badge = new f.DashBadge(f.badgeSettings, f.monitor, Constants.APP_IDS.MAIL, container, 40);
        expect(badge.visible).toBe(true);
        expect(badge.text).toBe('2');
        expect(container.styles.has('dash-icon-urgent')).toBe(true);
        f.notificationSettings.set_boolean('show-banners', false);
        expect(badge.visible).toBe(false);
        expect(container.styles.has('dash-icon-urgent')).toBe(false);
        f.notificationSettings.set_boolean('show-banners', true);
        expect(badge.text).toBe('2');
        expect(badge.visible).toBe(true);
        f.badgeSettings.set_boolean(Constants.SettingsKeys.NOTIFICATION_INDICATORS_ENABLED, false);
        expect(badge.visible).toBe(false);
        badge.destroy();
        expect(f.monitor.signals.size).toBe(0);
        expect(f.badgeSettings.signals.size).toBe(0);
        f.monitor.destroy();
    });

    it('toggles the badge allowlist, preserves other IDs and honors locked settings', async () => {
        const f = await fixture();
        const badge = new f.DashBadge(f.badgeSettings, f.monitor, Constants.APP_IDS.MAIL, new f.Actor(), 32);
        const menu = {items: [], close() {}, addMenuItem(item) { this.items.push(item); }};
        badge.syncMenu(menu);
        f.badgeSettings.set_strv(Constants.SettingsKeys.NOTIFICATION_BADGE, ['other.desktop', Constants.APP_IDS.MAIL]);
        menu.items.at(-1).emit('activate');
        expect(f.badgeSettings.get_strv(Constants.SettingsKeys.NOTIFICATION_BADGE)).toEqual(['other.desktop']);
        badge.syncMenu(menu);
        menu.items.at(-1).emit('activate');
        expect(badge.visible).toBe(true);
        f.badgeSettings.writable = false;
        const count = menu.items.length;
        badge.syncMenu(menu);
        expect(menu.items.length).toBe(count);
        badge.destroy(); f.monitor.destroy();
    });

    it('owns one label actor through rapid hide/show and destroys a fading label cleanly', async () => {
        const f = await fixture();
        const label = new f.DashLabel(new f.Actor(), f.theme);
        const first = new f.Actor(), second = new f.Actor();
        label.schedule(first, 'First'); f.flush();
        expect(label.visible).toBe(true);
        label.hide();
        const staleTransition = label.transition;
        label.schedule(second, 'Second');
        expect(label.transition).not.toBe(staleTransition);
        expect(label.positionedAt).toBe(second);
        expect(first.signals.size).toBe(0);
        expect(f.chrome.size).toBe(1);
        label.hide(); label.destroy();
        expect(f.chrome.size).toBe(0);
        expect(f.themed.size).toBe(0);
        expect(f.timers.size).toBe(0);
        expect(second.signals.size).toBe(0);
        f.monitor.destroy();
    });

    it('cancels a delayed label when its icon is destroyed and rechecks hover before showing', async () => {
        const f = await fixture();
        const label = new f.DashLabel(new f.Actor(), f.theme);
        const icon = new f.Actor();
        label.schedule(icon, 'App'); icon.destroy();
        expect(f.timers.size).toBe(0);
        label.schedule(new f.Actor({hover: false}), 'App'); f.flush();
        expect(label.visible).toBe(false);
        label.destroy(); f.monitor.destroy();
    });
});

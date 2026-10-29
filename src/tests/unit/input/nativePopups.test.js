import * as NativeDash from '@/tests/nativeDash.js';
import * as Constants from '@/extension/constants.js';
const fixture = NativeDash.fixture;

describe('Native panel popup ownership', () => {
    it('lets the dash launchpad button consume its supplied app grid actions directly', async () => {
        const f = await fixture();
        const section = f.section();
        section._openExpanded();
        const launchpad = section._dash.get_children().find(item =>
            item._dashToken.type === Constants.DashTokenType.LAUNCHPAD).button;
        launchpad.emit('clicked');
        expect(f.appGrid.isOpen).toBeTrue();
        expect(section._expandedSurface).toBeNull();
        launchpad.emit('clicked');
        expect(f.appGrid.isOpen).toBeFalse();
        section.destroy();
    });

    it('cleans popups and pending drops when a native parent destroys the section', async () => {
        const f = await fixture();
        const section = f.section();
        section._openExpanded();
        expect(f.grabs.length).toBe(1);
        f.Actor.prototype.destroy.call(section);
        f.flush('idle');
        expect(f.grabs.length).toBe(0);
        expect(f.chrome.size).toBe(0);
        expect(f.themed.size).toBe(0);
        expect(section._source.signals.size).toBe(0);
    });

    it('transfers a right press on another icon from the active preview to that icon menu', async () => {
        const f = await fixture();
        const first = f.icon(), second = f.icon();
        first._windowPreview.open();
        f.send(f.event(f.Clutter.EventType.BUTTON_PRESS, second));
        expect(first._windowPreview.isOpen).toBe(false);
        expect(second._menu.isOpen).toBe(true);
        expect(f.grabs.length).toBe(1);
        first.destroy(); second.destroy();
        expect(f.grabs.length).toBe(0);
    });

    it('opens the native context menu on the same right press that closes a preview', async () => {
        const f = await fixture();
        const icon = f.icon();
        icon._windowPreview.open();
        f.send(f.event(f.Clutter.EventType.BUTTON_PRESS, icon));
        expect(icon._windowPreview.isOpen).toBe(false);
        expect(icon._menu.isOpen).toBe(true);
        expect(f.grabs.length).toBe(1);
        expect(f.grabs[0].actor).toBe(icon._menu.actor);
        icon.destroy();
        expect(f.grabs.length).toBe(0);
    });

    it('updates order, names and membership without replacing surviving icons or their open menus', async () => {
        const f = await fixture();
        const entries = Array.from({length: 3}, f.entry);
        entries.forEach(entry => { entry.group = 'running'; });
        const section = f.section({entries, width: 1000});
        const icons = entries.map(entry => [...section._dragDrop._icons].find(icon => icon.app === entry.item.app));
        const preview = icons[1]._windowPreview;
        preview.open();
        const grab = f.grabs.at(-1);
        const added = f.entry(); added.group = 'running';
        entries[1].item.name = 'Renamed window';
        section._source.entries = [entries[2], entries[1], added];
        section._source.emit('changed');
        const current = section._dash.get_children().filter(item => item.button?.entry);
        expect(current.map(item => item.button.app)).toEqual([entries[2].item.app, entries[1].item.app, added.item.app]);
        expect(icons[0].destroyed).toBeTrue();
        expect(current[0].button).toBe(icons[2]);
        expect(current[1].button).toBe(icons[1]);
        expect(icons[1].accessible_name).toBe('Renamed window');
        expect(preview.isOpen).toBeTrue();
        expect(f.grabs.at(-1)).toBe(grab);
        section.destroy();
    });

    it('resizes a retained icon and its dots while leaving its preview open', async () => {
        const f = await fixture();
        const entries = Array.from({length: 2}, f.entry);
        const section = f.section({entries, width: 1000});
        const icon = [...section._dragDrop._icons][0];
        icon._windowPreview.open();
        const grab = f.grabs.at(-1);
        expect(icon.iconSize).toBe(40);
        section.setAvailableSize(160, 500);
        expect(icon.iconSize).toBe(32);
        expect(icon.width).toBe(32);
        expect(icon.destroyed).toBeUndefined();
        expect(icon._windowPreview.isOpen).toBeTrue();
        expect(f.grabs.at(-1)).toBe(grab);
        section.destroy();
    });

    it('retains a favorite when its represented window changes and removes only the obsolete per-window icon', async () => {
        const f = await fixture();
        const favorite = f.entry();
        const first = favorite.windows[0], second = f.entry().windows[0];
        favorite.windows = [first, second];
        favorite.representedWindow = first;
        favorite.item.id = `window:${first.get_stable_sequence()}`;
        const running = {...favorite, item: {...favorite.item, id: `window:${second.get_stable_sequence()}`},
            group: 'running', representedWindow: second};
        const section = f.section({entries: [favorite, running], width: 1000});
        section._source.getEntryWindows = entry => entry.windows.filter(window => window === entry.representedWindow);
        const icons = [...section._dragDrop._icons];
        const retained = icons.find(icon => icon.entry.group === 'favorites');
        const removed = icons.find(icon => icon.entry.group === 'running');
        retained._windowPreview.open();
        const list = retained._windowPreview._previewList;
        favorite.representedWindow = second;
        favorite.item.id = running.item.id;
        favorite.windows = [second];
        section._source.entries = [favorite];
        section._source.emit('changed');
        expect(retained.destroyed).toBeUndefined();
        expect(removed.destroyed).toBeTrue();
        expect(retained.entry.representedWindow).toBe(second);
        expect(retained._windowPreview.isOpen).toBeTrue();
        expect(list._items.has(first)).toBeFalse();
        expect(list._items.has(second)).toBeTrue();
        section.destroy();
    });

    it('defers only the dragged view, then updates it in place after native drag teardown', async () => {
        const f = await fixture();
        const entry = f.entry();
        const first = f.section({entries: [entry], width: 1000});
        const second = new first.constructor(first._source, 1, f.theme, null);
        second.setAvailableSize(1000, 500);
        const dragged = [...first._dragDrop._icons][0];
        const other = [...second._dragDrop._icons][0];
        dragged.draggable.emit('drag-begin');
        entry.indicatorCount = 2;
        first._source.emit('changed');
        expect(dragged.entry.indicatorCount).toBe(1);
        expect(other.entry.indicatorCount).toBe(2);
        dragged.draggable.emit('drag-end', 1, false);
        expect(dragged.entry.indicatorCount).toBe(1);
        f.flush('idle');
        expect(dragged.entry.indicatorCount).toBe(2);
        expect(dragged.destroyed).toBeUndefined();
        first.destroy(); second.destroy();
    });

    it('keeps the same icon, preview and remaining thumbnail when its close button removes one of two windows', async () => {
        for (const expanded of [false, true]) {
            const f = await fixture();
            const app = f.entry();
            const first = app.windows[0], second = f.entry().windows[0];
            app.windows = [first, second];
            app.indicatorCount = 2;
            const section = f.section({entries: [app, ...Array.from({length: 6}, f.entry)],
                width: expanded ? 190 : 1000});
            if (expanded) section._openExpanded();
            const surface = expanded ? section._expandedSurface : section._dash;
            const icon = [...section._dragDrop._icons].find(icon => surface.contains(icon) && icon.app === app.item.app);
            const preview = icon._windowPreview;
            preview.open();
            const list = preview._previewList;
            const closedItem = list._items.get(first), remainingItem = list._items.get(second);
            const grab = f.grabs.at(-1);
            first.delete = () => {
                app.windows = [second]; app.indicatorCount = 1;
                first.emit('unmanaged');
                section._source.emit('changed');
            };
            closedItem._syncCloseButton();
            closedItem._closeButton.emit('clicked');
            expect(icon.destroyed).toBeUndefined();
            expect(icon._windowPreview).toBe(preview);
            expect(preview.isOpen).toBeTrue();
            expect(preview._previewList).toBe(list);
            expect(list._items.get(second)).toBe(remainingItem);
            expect(list._items.has(first)).toBeFalse();
            expect(f.grabs.at(-1)).toBe(grab);
            expect(icon.get_parent().get_parent().indicators.get_children().length).toBe(1);
            if (expanded) {
                expect(section._expandedSurface).toBe(surface);
                expect(surface.isOpen).toBeTrue();
            }
            app.windows = []; app.indicatorCount = 0;
            section._source.emit('changed');
            expect(preview.isOpen).toBeFalse();
            expect(icon.destroyed).toBeUndefined();
            section.destroy();
            expect(f.grabs.length + f.chrome.size + f.themed.size).toBe(0);
        }
    });

    it('gives Debian and indicator menus native outside-click dismissal and menu switching', async () => {
        const f = await fixture();
        const debian = new f.DebianButton(() => {});
        debian._button.emit('clicked');
        expect(debian._menu.isOpen).toBeTrue();
        f.send(f.event(f.Clutter.EventType.BUTTON_PRESS, new f.Actor()));
        expect(debian._menu.isOpen).toBeFalse();
        const indicators = new f.IndicatorSection([{name: 'First'}, {name: 'Second'}]);
        indicators._menus[0].open();
        indicators._menus[1].open();
        expect(indicators._menus[0].isOpen).toBeFalse();
        expect(indicators._menus[1].isOpen).toBeTrue();
        f.send(f.event(f.Clutter.EventType.KEY_PRESS));
        expect(indicators._menus[1].isOpen).toBeFalse();
        indicators.setIndicators([]);
        expect(indicators._menuManager.menus.size).toBe(0);
        indicators.destroy(); debian.destroy();
        expect(f.grabs.length).toBe(0);
    });

    it('restores the collapsed dash after native dismissal and reuses expansion across reopening and refresh', async () => {
        const f = await fixture();
        const section = f.section();
        section._openExpanded();
        const expanded = section._expandedSurface;
        expect(section._surface.visible).toBeFalse();
        expect(expanded.isOpen).toBeTrue();
        f.send(f.event(f.Clutter.EventType.KEY_PRESS));
        expect(section._surface.visible).toBeTrue();
        expect(section._expandedSurface).toBe(expanded);
        section._openExpanded();
        expect(section._expandedSurface).toBe(expanded);
        expect(expanded.isOpen).toBeTrue();
        section._source.emit('changed');
        expect(expanded.destroyed).toBeUndefined();
        expect(section._expandedSurface).toBe(expanded);
        expect(section._surface.visible).toBeFalse();
        section.destroy();
        expect(f.grabs.length + f.chrome.size + f.themed.size).toBe(0);
        expect(section._previewMenuManager.menus.size).toBe(0);
    });

    it('closes overflow on Escape, outside mouse and touch, and reuses its unchanged actor safely', async () => {
        const f = await fixture();
        const surface = f.expanded();
        for (const type of [f.Clutter.EventType.KEY_PRESS, f.Clutter.EventType.BUTTON_PRESS, f.Clutter.EventType.TOUCH_BEGIN]) {
            surface.open(f.anchor);
            const size = surface.get_size();
            expect(surface.isOpen).toBeTrue();
            expect(f.chrome.has(surface)).toBeTrue();
            f.send(f.event(type, new f.Actor()));
            expect(surface.isOpen).toBeFalse();
            expect(surface.destroyed).toBeUndefined();
            expect(surface.get_size()).toEqual(size);
            expect(f.grabs.length).toBe(0);
            expect(f.chrome.size).toBe(0);
            expect(f.themed.size).toBe(0);
        }
        surface.open(f.anchor);
        surface.destroy();
        expect(f.grabs.length).toBe(0);
    });

    it('restores collapsed content on a failed native grab without leaving chrome or theme ownership', async () => {
        const f = await fixture();
        const surface = f.expanded();
        const closed = jasmine.createSpy('closed');
        surface.connect('closed', closed);
        f.failGrab();
        surface.open(f.anchor);
        expect(closed).toHaveBeenCalledTimes(1);
        expect(surface.isOpen).toBeFalse();
        expect(surface.visible).toBeFalse();
        expect(f.grabs.length + f.chrome.size + f.themed.size).toBe(0);
        surface.destroy();
    });

    it('keeps live thumbnails and keyboard access inside expanded overflow, closing the top popup first', async () => {
        const f = await fixture();
        const surface = f.expanded();
        surface.open(f.anchor);
        const icon = f.icon();
        icon.emit('key-press-event', {get_key_symbol: () => f.Clutter.KEY_Up});
        const preview = icon._windowPreview;
        const item = [...preview._previewList._items.values()][0];
        expect(item._clone.source).toBe(icon.entry.windows[0].get_compositor_private());
        expect(preview.actor.navigated).toBeTrue();
        expect(f.grabs.length).toBe(2);
        f.send(f.event(f.Clutter.EventType.KEY_PRESS));
        expect(preview.isOpen).toBeFalse();
        expect(surface.isOpen).toBeTrue();
        expect(f.grabs.length).toBe(1);
        f.send(f.event(f.Clutter.EventType.KEY_PRESS));
        expect(surface.isOpen).toBeFalse();
        surface.destroy(); icon.destroy();
    });

    it('activates a clicked preview window and closes its expanded dash', async () => {
        const f = await fixture();
        const surface = f.expanded();
        surface.open(f.anchor);
        f.owner.closeExpanded = () => surface.destroy();
        const icon = f.icon();
        icon._windowPreview.open();
        [...icon._windowPreview._previewList._items.values()][0].activate();
        expect(f.activated).toEqual(icon.entry.windows);
        expect(surface.destroyed).toBeTrue();
        expect(f.grabs.length).toBe(0);
        icon.destroy();
    });

    it('ignores synthetic hover crossings from grabs and still honors real preview open/close delays', async () => {
        const f = await fixture();
        const icon = f.icon();
        const crossing = flags => f.event(f.Clutter.EventType.ENTER, null, flags);
        icon.emit('enter-event', crossing(0));
        expect(icon._windowPreview.isOpen).toBeFalse();
        f.flush(Constants.WINDOW_PREVIEW_OPEN_DELAY);
        expect(icon._windowPreview.isOpen).toBeTrue();
        icon.emit('leave-event', crossing(f.Clutter.EventFlags.FLAG_GRAB_NOTIFY));
        f.send(f.event(f.Clutter.EventType.LEAVE, null, f.Clutter.EventFlags.FLAG_GRAB_NOTIFY));
        f.flush(Constants.WINDOW_PREVIEW_CLOSE_DELAY);
        expect(icon._windowPreview.isOpen).toBeTrue();
        icon.emit('leave-event', crossing(0));
        f.send(f.event(f.Clutter.EventType.MOTION, icon._windowPreview.actor));
        f.flush(Constants.WINDOW_PREVIEW_CLOSE_DELAY);
        expect(icon._windowPreview.isOpen).toBeTrue();
        f.send(f.event(f.Clutter.EventType.MOTION, null));
        f.flush(Constants.WINDOW_PREVIEW_CLOSE_DELAY);
        expect(icon._windowPreview.isOpen).toBeFalse();
        icon.emit('enter-event', crossing(f.Clutter.EventFlags.FLAG_GRAB_NOTIFY));
        f.flush(Constants.WINDOW_PREVIEW_OPEN_DELAY);
        expect(icon._windowPreview.isOpen).toBeFalse();
        icon.destroy();
    });

    it('closes on pointer motion outside the grabbed preview and source without requiring their leave signals', async () => {
        const f = await fixture();
        const icon = f.icon();
        const preview = icon._windowPreview;
        const sourceChild = new f.Actor(), previewChild = new f.Actor(), outside = new f.Actor();
        icon.add_child(sourceChild);
        preview.actor.add_child(previewChild);
        preview.open();
        f.send(f.event(f.Clutter.EventType.MOTION, outside));
        f.send(f.event(f.Clutter.EventType.MOTION, previewChild));
        f.flush(Constants.WINDOW_PREVIEW_CLOSE_DELAY);
        expect(preview.isOpen).toBeTrue();
        f.send(f.event(f.Clutter.EventType.MOTION, outside));
        f.send(f.event(f.Clutter.EventType.MOTION, sourceChild));
        f.flush(Constants.WINDOW_PREVIEW_CLOSE_DELAY);
        expect(preview.isOpen).toBeTrue();
        f.send(f.event(f.Clutter.EventType.MOTION, outside));
        const closeTimers = [...f.timeouts.keys()];
        expect(closeTimers.length).toBe(1);
        f.send(f.event(f.Clutter.EventType.MOTION, outside));
        expect([...f.timeouts.keys()]).toEqual(closeTimers);
        f.flush(Constants.WINDOW_PREVIEW_CLOSE_DELAY);
        expect(preview.isOpen).toBeFalse();
        expect(f.grabs.length).toBe(0);
        icon.destroy();
    });

    it('lets the shared native manager switch between icon previews under its grab', async () => {
        const f = await fixture();
        const first = f.icon(), second = f.icon();
        first._windowPreview.open();
        f.send(f.event(f.Clutter.EventType.ENTER, second));
        expect(first._windowPreview.isOpen).toBeFalse();
        expect(second._windowPreview.isOpen).toBeTrue();
        expect(f.grabs.length).toBe(1);
        f.send(f.event(f.Clutter.EventType.BUTTON_PRESS, new f.Actor()));
        expect(second._windowPreview.isOpen).toBeFalse();
        first.destroy(); second.destroy();
        expect(f.owner._previewMenuManager.menus.size).toBe(0);
    });

    it('preserves hover peeking and restores window opacity when the popup is dismissed', async () => {
        const f = await fixture();
        const first = f.icon(), second = f.icon();
        first._windowPreview.open();
        const item = [...first._windowPreview._previewList._items.values()][0];
        item.hover = true;
        item.emit('notify::hover');
        f.flush(Constants.WINDOW_PREVIEW_PEEK_DELAY);
        const other = second.entry.windows[0].get_compositor_private();
        expect(other.opacity).toBe(Constants.WINDOW_PREVIEW_PEEK_OPACITY);
        f.send(f.event(f.Clutter.EventType.KEY_PRESS));
        expect(other.opacity).toBe(255);
        first.destroy(); second.destroy();
    });

    it('leaves drag input and Escape with native DND until its grab is released', async () => {
        const f = await fixture();
        const surface = f.expanded();
        surface.open(f.anchor);
        const dnd = new f.Actor();
        const dragGrab = f.push(dnd);
        f.send(f.event(f.Clutter.EventType.BUTTON_PRESS, new f.Actor()));
        expect(surface.isOpen).toBeTrue();
        dnd.connect('captured-event', () => f.pop(dragGrab));
        f.send(f.event(f.Clutter.EventType.KEY_PRESS));
        expect(surface.isOpen).toBeTrue();
        expect(f.grabs.length).toBe(1);
        surface.destroy();
    });

    it('releases an open preview, menu registration and hover timers when its source is destroyed', async () => {
        const f = await fixture();
        const icon = f.icon();
        icon._windowPreview.open();
        icon.emit('leave-event', f.event(f.Clutter.EventType.ENTER));
        icon.destroy();
        expect(f.grabs.length).toBe(0);
        expect(f.timeouts.size).toBe(0);
        expect(f.chrome.size).toBe(0);
        expect(f.owner._previewMenuManager.menus.size).toBe(0);
    });
});

import * as NativeDash from '@/tests/nativeDash.js';

describe('Dash persistent favorite drops', () => {
    it('writes favorite order through the shared source after native DND releases actors', async () => {
        const f = await NativeDash.fixture();
        const entries = Array.from({length: 4}, f.entry);
        entries[0].hardcoded = true;
        const section = f.section({entries, width: 1000});
        const other = f.section({source: section._source, width: 1000});
        const icons = [...section._dragDrop._icons];
        const dragged = icons[3];
        dragged.draggable.emit('drag-begin');
        expect(section._dragDrop.drop(dragged, icons[1].entry, false)).toBe(true);
        expect(section._source.savedOrders.length).toBe(0);
        dragged.draggable.emit('drag-end');
        f.flush('idle');
        const order = [entries[0], entries[3], entries[1], entries[2]].map(entry => entry.item.appId);
        expect(section._source.savedOrders).toEqual([order]);
        expect(section._entries.map(entry => entry.item.appId)).toEqual(order);
        expect(other._entries.map(entry => entry.item.appId)).toEqual(order);
        expect([...section._dragDrop._icons].includes(dragged)).toBe(true);
        expect(section._dragDrop.orders.favoriteOrder).toBeUndefined();
        section.destroy(); other.destroy();
    });

    it('pins a running app at the requested system favorite position', async () => {
        const f = await NativeDash.fixture();
        const entries = Array.from({length: 3}, f.entry);
        entries[0].hardcoded = true;
        entries[2].group = 'running';
        const section = f.section({entries, width: 1000});
        const icons = [...section._dragDrop._icons];
        expect(section._dragDrop.drop(icons[2], icons[0].entry, true)).toBe(true);
        f.flush('idle');
        expect(section._source.savedOrders[0]).toEqual([entries[0], entries[2], entries[1]].map(e => e.item.appId));
        expect(section._source.isFavorite(entries[2].item.appId)).toBe(true);
        section.destroy();
    });

    it('keeps running order local, rejects fixed or locked favorites and never unpins by dropping', async () => {
        const f = await NativeDash.fixture();
        const entries = Array.from({length: 4}, f.entry);
        entries[0].hardcoded = true;
        entries[2].group = entries[3].group = 'running';
        const section = f.section({entries, width: 1000});
        const other = f.section({source: section._source, width: 1000});
        const [fixed, favorite, first, second] = [...section._dragDrop._icons];
        expect(section._dragDrop.drop(fixed, favorite.entry, true)).toBe(false);
        expect(section._dragDrop.drop(favorite, first.entry, false)).toBe(false);
        section._source.writable = false;
        expect(section._dragDrop.drop(first, favorite.entry, false)).toBe(false);
        section._source.writable = true;
        expect(section._dragDrop.drop(second, first.entry, false)).toBe(true);
        f.flush('idle');
        expect(section._source.savedOrders.length).toBe(0);
        expect(section._entries.slice(2).map(e => e.item.appId)).toEqual([second.item.appId, first.item.appId]);
        expect(other._entries.slice(2).map(e => e.item.appId)).toEqual([first.item.appId, second.item.appId]);
        section.destroy(); other.destroy();
    });

    it('cleans insertion preview and pending writes when the dash is destroyed', async () => {
        const f = await NativeDash.fixture();
        const section = f.section({width: 1000});
        const [target, dragged] = [...section._dragDrop._icons];
        section._dragDrop.dragOver(dragged, target.entry, true, target);
        expect(section._dragDrop._dropPreview.hiddenFromPick).toBe(true);
        expect(section._dragDrop.drop(dragged, target.entry, true)).toBe(true);
        const source = section._source;
        section.destroy();
        f.flush('idle');
        expect(source.savedOrders.length).toBe(0);
        expect(f.chrome.size).toBe(0);
        expect(f.themed.size).toBe(0);
    });
});

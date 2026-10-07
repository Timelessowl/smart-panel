// The projection is panel-local; the app/window models remain shared.
export function projectDash({favorites, running, windows, hardcodedIds,
    perWindow, monitorIndex, monitorOnly, runningOrder = [], favoriteOrder = []}) {
    const visibleWindows = windows.filter(item =>
        !monitorOnly || item.monitor === monitorIndex).sort((a, b) => a.stableId - b.stableId);
    const windowsByApp = new Map();
    for (const item of visibleWindows) {
        if (!windowsByApp.has(item.appId))
            windowsByApp.set(item.appId, []);
        windowsByApp.get(item.appId).push(item);
    }

    const represented = new Set();
    const favoriteIds = new Set(favorites.map(item => item.appId));
    const favoritePositions = new Map(favoriteOrder.map((id, index) => [id, index]));
    const orderedFavorites = [
        ...favorites.filter(item => hardcodedIds.has(item.appId)),
        ...favorites.filter(item => !hardcodedIds.has(item.appId)).sort((a, b) =>
            (favoritePositions.get(a.appId) ?? favoriteOrder.length) -
            (favoritePositions.get(b.appId) ?? favoriteOrder.length)),
    ];
    const favoriteEntries = orderedFavorites.map(item => {
        const appWindows = windowsByApp.get(item.appId) ?? [];
        const representedWindow = perWindow ? appWindows[0] ?? null : null;
        if (representedWindow)
            represented.add(representedWindow.id);
        return {
            // A live favorite is a window view in per-window mode, but keeps
            // its app identity/slot when that window closes.
            item: representedWindow ?? item,
            group: 'favorites',
            hardcoded: hardcodedIds.has(item.appId),
            windows: appWindows,
            representedWindow,
            indicatorCount: Math.min(perWindow ? 1 : 4, appWindows.length),
        };
    });

    const runningItems = perWindow
        ? visibleWindows.filter(item => !represented.has(item.id))
        : running.filter(item => !favoriteIds.has(item.appId) &&
            (!monitorOnly || windowsByApp.has(item.appId)));
    const order = new Map(runningOrder.map((id, index) => [id, index]));
    // Keep natural order for new items and stable ordering for manually moved ones.
    const sorted = [...runningItems].sort((a, b) =>
        (order.get(a.id) ?? runningOrder.length) -
        (order.get(b.id) ?? runningOrder.length));
    const runningEntries = sorted.map(item => ({
        item,
        group: 'running',
        hardcoded: hardcodedIds.has(item.appId),
        windows: windowsByApp.get(item.appId) ?? [],
        representedWindow: perWindow ? item : null,
        indicatorCount: perWindow ? 0 :
            Math.min(4, (windowsByApp.get(item.appId) ?? []).length),
    }));

    return {favorites: favoriteEntries, running: runningEntries};
}

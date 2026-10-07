// These are disposable view descriptions, not copies of Shell's app/window
// state. Native objects keep their identity across monitor-local projections.
function describeApp(app) {
    return {id: `app:${app.get_id()}`, appId: app.get_id(), app, name: app.get_name()};
}

function describeWindow(window, app) {
    return {id: `window:${window.get_stable_sequence()}`, appId: app.get_id(), app,
        window, name: window.get_title() || app.get_name()};
}

export function projectDash({favorites, running, windows, windowApps,
    hardcodedIds, perWindow, runningOrder = [], favoriteOrder = []}) {
    const windowsByApp = new Map();
    for (const window of windows) {
        const appId = windowApps.get(window).get_id();
        if (!windowsByApp.has(appId))
            windowsByApp.set(appId, []);
        windowsByApp.get(appId).push(window);
    }

    const represented = new Set();
    const favoriteIds = new Set(favorites.map(app => app.get_id()));
    const favoritePositions = new Map(favoriteOrder.map((id, index) => [id, index]));
    const orderedFavorites = [
        ...favorites.filter(app => hardcodedIds.has(app.get_id())),
        ...favorites.filter(app => !hardcodedIds.has(app.get_id())).sort((a, b) =>
            (favoritePositions.get(a.get_id()) ?? favoriteOrder.length) -
            (favoritePositions.get(b.get_id()) ?? favoriteOrder.length)),
    ];
    const favoriteEntries = orderedFavorites.map(app => {
        const appWindows = windowsByApp.get(app.get_id()) ?? [];
        const representedWindow = perWindow ? appWindows[0] ?? null : null;
        if (representedWindow)
            represented.add(representedWindow);
        return {
            item: representedWindow ? describeWindow(representedWindow, app) : describeApp(app),
            group: 'favorites',
            hardcoded: hardcodedIds.has(app.get_id()),
            windows: appWindows,
            representedWindow,
            indicatorCount: Math.min(perWindow ? 1 : 4, appWindows.length),
        };
    });

    const runningItems = perWindow
        ? windows.filter(window => !represented.has(window))
            .map(window => describeWindow(window, windowApps.get(window)))
        : running.filter(app => !favoriteIds.has(app.get_id()) && windowsByApp.has(app.get_id()))
            .map(describeApp);
    const order = new Map(runningOrder.map((id, index) => [id, index]));
    const sorted = runningItems.sort((a, b) =>
        (order.get(a.id) ?? runningOrder.length) -
        (order.get(b.id) ?? runningOrder.length));
    const runningEntries = sorted.map(item => ({
        item,
        group: 'running',
        hardcoded: hardcodedIds.has(item.appId),
        windows: windowsByApp.get(item.appId) ?? [],
        representedWindow: perWindow ? item.window : null,
        indicatorCount: perWindow ? 0 : Math.min(4, windowsByApp.get(item.appId).length),
    }));

    return {favorites: favoriteEntries, running: runningEntries};
}

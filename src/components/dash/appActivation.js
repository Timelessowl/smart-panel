// Keep the cycle outside the view so refreshes cannot reset sequential clicks.
export function nextAppAction(previous, entry) {
    const windows = entry.windows;
    if (!windows.length)
        return {action: {type: 'launch'}, cycle: null};
    if (windows.length === 1)
        return {action: {type: 'focus', window: windows[0]}, cycle: null};

    const signature = windows.map(window => window.get_stable_sequence()).join('|');
    const index = previous?.appId === entry.item.appId && previous.signature === signature
        ? previous.nextIndex : 0;
    const action = index < windows.length
        ? {type: 'focus', window: windows[index]}
        : {type: 'minimize', windows};
    return {action, cycle: {appId: entry.item.appId, signature,
        nextIndex: index < windows.length ? index + 1 : 0}};
}

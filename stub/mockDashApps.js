const MOCK_ICONS = [
    'folder-symbolic',
    'web-browser-symbolic',
    'utilities-terminal-symbolic',
];

export function createMockDashApps(count) {
    return Array.from({length: count}, (_, index) => ({
        iconName: MOCK_ICONS[index % MOCK_ICONS.length],
        name: `Mock app ${index + 1}`,
    }));
}

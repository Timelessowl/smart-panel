import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MOCK_INDICATOR_ICONS = [
    'display-brightness-symbolic',
    'media-record-symbolic',
    'microphone-sensitivity-high-symbolic',
    'camera-web-symbolic',
    'input-gaming-symbolic',
];

export function createMockIndicators(count) {
    return Array.from({length: count}, (_, index) => {
        const number = index + 1;

        return {
            iconName: MOCK_INDICATOR_ICONS[index % MOCK_INDICATOR_ICONS.length],
            name: `Mock indicator ${number}`,
            menuItems: [{
                label: 'Show notification',
                action: () => Main.notify(
                    `Mock indicator ${number}`,
                    'This notification comes from stub logic.'
                ),
            }],
        };
    });
}

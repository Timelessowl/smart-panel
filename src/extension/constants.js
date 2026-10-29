export const CONTENT_HEIGHT = 56;
export const SECTION_CONTENT_BORDER_WIDTH = 1;
export const SECTION_BORDER_WIDTH = 1;
export const SECTION_FRAME_WIDTH = 8;
export const SECTION_HEIGHT =
    CONTENT_HEIGHT + 2 * SECTION_FRAME_WIDTH + 2 * SECTION_CONTENT_BORDER_WIDTH;
export const PANEL_HORIZONTAL_PADDING = 10;
export const PANEL_TOP_PADDING = 8;
export const PANEL_BOTTOM_PADDING = PANEL_TOP_PADDING;
export const MENU_POPUP_GAP = 0;
export const PANEL_HEIGHT =
    SECTION_HEIGHT + PANEL_TOP_PADDING + PANEL_BOTTOM_PADDING;

export const START_SECTION_GAP = 6;
export const END_SECTION_GAP = 12;
export const SEARCH_CLEARANCE = 32;
export const SEARCH_MAX_WIDTH = 456;
export const SEARCH_WIDTH_RATIO = 0.28;
export const INDICATOR_MIN_WIDTH = SECTION_HEIGHT;
export const INDICATOR_WIDTH_STEP = 32;
export const INDICATOR_ITEM_SIZE = 26;
export const INDICATOR_ITEM_SPACING = 6;
export const INDICATOR_ICON_SIZE = 16;
export const DASH_ICON_SIZE = 40;
export const DASH_SMALL_ICON_SIZE = 32;
export const DASH_SEPARATOR_WIDTH = 2;
export const DASH_SEPARATOR_HEIGHT = DASH_SMALL_ICON_SIZE;
export const DASH_ITEM_SPACING = 8;
export const DASH_PADDING = 8;
export const DASH_EXPANSION_TOP_MARGIN = 10;
export const APP_GRID_COLUMNS = 8;
export const APP_GRID_ROWS = 4;
export const APP_GRID_PAGE_SIZE = APP_GRID_COLUMNS * APP_GRID_ROWS;
export const APP_GRID_ICON_SIZE = 64;
export const APP_GRID_MAX_WIDTH = 1120;
export const APP_GRID_MARGIN = 40;
export const APP_GRID_DOTS_HEIGHT = 40;
export const APP_GRID_SCROLL_TIMEOUT = 180;
export const SIGNAL_GEOMETRY_CHANGED = 'geometry-changed';
export const SIGNAL_NOTIFY_CLOCK = 'notify::clock';
export const SIGNAL_NOTIFY_TIMEZONE = 'notify::timezone';
export const SIGNAL_SELECTED_DATE_CHANGED = 'selected-date-changed';
export const SIGNAL_MONITORS_CHANGED = 'monitors-changed';
export const DASH_DROP_PREVIEW_SIZE = 16;
export const DASH_DROP_PREVIEW_OPACITY = 96;
export const DashTokenType = Object.freeze({
    LAUNCHPAD: 0,
    SEPARATOR: 1,
    DASH_ICON: 2,
    OVERFLOW: 3,
});

export const APP_IDS = Object.freeze({
    FILE_MANAGER: 'org.gnome.Nautilus.desktop',
    MAIL: 'thunderbird.desktop',
});
export const NOTIFICATION_BADGE_CAPABLE_APPS = Object.freeze([APP_IDS.MAIL]);
export const DashMenuLabels = Object.freeze({
    CLOSE_ALL: 'Завершить всё',
    NOTIFICATIONS_ON: 'Включить уведомления',
    NOTIFICATIONS_OFF: 'Отключить уведомления',
});
export const WINDOW_PREVIEW_MAX_WIDTH = 250;
export const WINDOW_PREVIEW_MAX_HEIGHT = 150;
export const WINDOW_PREVIEW_OPEN_DELAY = 300;
export const WINDOW_PREVIEW_CLOSE_DELAY = 250;
export const WINDOW_PREVIEW_PEEK_DELAY = 500;
export const WINDOW_PREVIEW_PEEK_OPACITY = 40;
export const WINDOW_PREVIEW_FADE_TIME = 200;
export const WINDOW_PREVIEW_TEXTURE_RETRY_DELAY = 50;
export const WINDOW_PREVIEW_TEXTURE_ATTEMPTS = 15;
export const WINDOW_PREVIEW_MARGIN = 10;
export const WINDOW_PREVIEW_SPACING = 8;
export const WINDOW_PREVIEW_PADDING = 8;
export const WINDOW_PREVIEW_HEADER_HEIGHT = 32;
export const WINDOW_PREVIEW_SCROLL_STEP = 100;

export const WINDOW_PREVIEW_TITLE_HEIGHT = 35;
export const WINDOW_PREVIEW_CLOSE_BUTTON_SIZE = 30;
export const WINDOW_PREVIEW_CLOSE_ICON_SIZE = 15;
export const WINDOW_PREVIEW_ENSURE_VISIBLE_DELAY = 200;
export const WINDOW_PREVIEW_TITLE_HIDE_DELAY = 100;

export const DASH_LABEL_SHOW_DELAY = 300;
export const DASH_LABEL_SHOW_TIME = 150;
export const DASH_LABEL_HIDE_TIME = 100;
export const DASH_LABEL_GAP = 4;
export const DASH_LABEL_MAX_WIDTH = 400;

export const DASH_BADGE_FONT_RATIO = 0.32;
export const DASH_BADGE_MIN_FONT_SIZE = 9;
export const DASH_BADGE_HEIGHT_RATIO = 1.8;
export const DASH_BADGE_ICON_SIZE = 38;
export const DASH_BADGE_MAX_COUNT = 99;

export const SettingsKeys = Object.freeze({
    ISOLATE_TASKS: 'isolate-tasks',
    WINDOW_GROUPING: 'group-open-windows',
    NOTIFICATION_BADGE: 'notification-badge-apps',
    NOTIFICATION_INDICATORS_ENABLED: 'notification-indicators-enabled',
    AUTO_HIDE_MODE: 'auto-hide-mode',
    AUTO_HIDE_FULLSCREEN_BEHAVIOR: 'auto-hide-fullscreen-behavior',
    MULTI_MONITOR: 'multi-monitor',
});

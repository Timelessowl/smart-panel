// Layout values are kept here so the panel can be reshaped without touching
// component implementation files.

// Content height excludes the translucent frame padding and solid outline.
export const SECTION_HEIGHT = 64;
export const SECTION_FRAME_WIDTH = 8;
export const SECTION_BORDER_WIDTH = 1;
export const PANEL_HORIZONTAL_PADDING = 10;
export const PANEL_TOP_PADDING = 20;
export const PANEL_BOTTOM_PADDING = 20;
export const PANEL_HEIGHT =
    SECTION_HEIGHT +
    (SECTION_FRAME_WIDTH + SECTION_BORDER_WIDTH) * 2 +
    PANEL_TOP_PADDING +
    PANEL_BOTTOM_PADDING;

export const START_SECTION_GAP = 6;
export const END_SECTION_GAP = 12;
export const SEARCH_CLEARANCE = 32;

export const SEARCH_MAX_WIDTH = 360;
export const SEARCH_WIDTH_RATIO = 0.28;
export const SYSTEM_WIDTH = 176;

export const INDICATOR_MIN_WIDTH =
    SECTION_HEIGHT + (SECTION_FRAME_WIDTH + SECTION_BORDER_WIDTH) * 2;
export const INDICATOR_WIDTH_STEP = 32;
export const INDICATOR_ITEM_SIZE = 26;
export const INDICATOR_ITEM_SPACING = 6;
export const INDICATOR_ICON_SIZE = 16;

export const DASH_ICON_SIZE = 40;
export const DASH_SMALL_ICON_SIZE = 32;
export const DASH_ITEM_INSET = 8;
export const DASH_EXPANDED_ROW_HEIGHT = DASH_ICON_SIZE + DASH_ITEM_INSET * 2;
export const DASH_SEPARATOR_WIDTH = 8;
export const DASH_SEPARATOR_HEIGHT = DASH_SMALL_ICON_SIZE;
export const DASH_ITEM_SPACING = 4;
export const DASH_PADDING = 6;
export const SECTION_CONTENT_BORDER_WIDTH = 1;
export const DASH_BORDER_WIDTH = SECTION_CONTENT_BORDER_WIDTH;
export const DASH_EXPANSION_TOP_MARGIN = 10;
export const DASH_DROP_PREVIEW_SIZE = 16;
export const DASH_DROP_PREVIEW_OPACITY = 96;

export const APP_IDS = Object.freeze({
    FILE_MANAGER: 'org.gnome.Nautilus.desktop',
    BROWSER: 'firefox.desktop',
});

export const SettingsKeys = Object.freeze({
    WINDOW_GROUPING: 'group-open-windows',
    ISOLATE_TASKS: 'isolate-tasks',
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

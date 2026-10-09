import * as Constants from '@/constant.js';

// The native frame already provides the outer band; count it only once.
export const CONTENT_PADDING = Math.max(0, Constants.DASH_PADDING - Constants.SECTION_FRAME_WIDTH);

export function scaleDimension(value, scale = 1) {
    return Math.round(value * scale);
}

export function contentInset(scale = 1) {
    return scaleDimension(Constants.SECTION_BORDER_WIDTH + Constants.SECTION_FRAME_WIDTH +
        CONTENT_PADDING + Constants.DASH_BORDER_WIDTH, scale);
}

function tokensFor(entries, count, iconSize, hiddenCount = 0) {
    const tokens = [{type: 'launchpad', width: iconSize + Constants.DASH_ITEM_INSET}];
    let hasSeparator = false;
    for (const entry of entries.slice(0, count)) {
        if (entry.group === 'running' && !hasSeparator) {
            tokens.push({type: 'separator', width: Constants.DASH_SEPARATOR_WIDTH});
            hasSeparator = true;
        }
        tokens.push({type: 'icon', entry, width: iconSize + Constants.DASH_ITEM_INSET});
    }
    if (hiddenCount) {
        if (entries[count]?.group === 'running' && !hasSeparator)
            tokens.push({type: 'separator', width: Constants.DASH_SEPARATOR_WIDTH});
        tokens.push({type: 'overflow', hiddenCount, width: iconSize + Constants.DASH_ITEM_INSET});
    }
    return tokens;
}

export function tokensWidth(tokens, scale = 1) {
    return tokens.reduce((sum, token) => sum + Math.round(token.width * scale), 0) +
        Math.max(0, tokens.length - 1) * Math.round(Constants.DASH_ITEM_SPACING * scale);
}

// All dimensions are in stage coordinates. Icons use logical pixel sizes.
export function layoutDash(entries, availableWidth, inset, scale = 1) {
    const usableWidth = Math.max(0, availableWidth - inset * 2);
    for (const iconSize of [Constants.DASH_ICON_SIZE, Constants.DASH_SMALL_ICON_SIZE]) {
        const tokens = tokensFor(entries, entries.length, iconSize);
        if (tokensWidth(tokens, scale) <= usableWidth)
            return {iconSize, tokens, hiddenCount: 0,
                width: tokensWidth(tokens, scale) + inset * 2};
    }

    for (let count = entries.length - 1; count >= 0; count--) {
        const hiddenCount = entries.length - count;
        const tokens = tokensFor(entries, count, Constants.DASH_SMALL_ICON_SIZE, hiddenCount);
        if (tokensWidth(tokens, scale) <= usableWidth)
            return {iconSize: Constants.DASH_SMALL_ICON_SIZE, tokens, hiddenCount,
                width: tokensWidth(tokens, scale) + inset * 2};
    }

    // On exceptionally narrow monitors, clip rather than crossing into search.
    const tokens = tokensFor(entries, 0, Constants.DASH_SMALL_ICON_SIZE, entries.length);
    return {iconSize: Constants.DASH_SMALL_ICON_SIZE, tokens, hiddenCount: entries.length,
        width: Math.min(availableWidth, tokensWidth(tokens, scale) + inset * 2)};
}

export function expandedRows(entries, iconSize, usableWidth, scale = 1) {
    const tokens = tokensFor(entries, entries.length, iconSize);
    const rows = [[]];
    const spacing = Math.round(Constants.DASH_ITEM_SPACING * scale);
    let width = 0;
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        const tokenWidth = Math.round(token.width * scale);
        // Keep the running separator with its first icon, not at a row's end.
        const required = tokenWidth + (token.type === 'separator'
            ? spacing + Math.round(tokens[index + 1].width * scale) : 0);
        if (width && width + spacing + required > usableWidth) {
            rows.push([]);
            width = 0;
        }
        rows.at(-1).push(token);
        width += (width ? spacing : 0) + tokenWidth;
    }
    return rows;
}

export function expandedLayout(entries, iconSize, availableWidth, scale = 1) {
    const rows = expandedRows(entries, iconSize, availableWidth - contentInset(scale) * 2, scale);
    const height = scaleDimension(Constants.DASH_EXPANDED_ROW_HEIGHT, scale);
    const spacing = scaleDimension(Constants.DASH_ITEM_SPACING, scale);
    const placements = [];
    rows.forEach((row, rowIndex) => {
        let x = 0;
        for (const token of row) {
            placements.push({token, height, x, y: rowIndex * (height + spacing) +
                (token.type === 'separator' ? (height - scaleDimension(iconSize, scale)) / 2 : 0)});
            x += scaleDimension(token.width, scale) + spacing;
        }
    });
    return {placements, width: Math.max(...rows.map(row => tokensWidth(row, scale))),
        height: rows.length * height + (rows.length - 1) * spacing};
}

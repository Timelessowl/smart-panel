import * as Session from '@/utils/session.js';
import * as Constants from '@/extension/constants.js';

export function sectionWidth(contentWidth) {
    return (
        contentWidth +
        2 * Session.scale(Constants.DASH_PADDING) +
        2 * Session.scale(Constants.SECTION_FRAME_WIDTH) +
        2 * Session.scale(Constants.SECTION_CONTENT_BORDER_WIDTH) +
        2 * Session.scale(Constants.SECTION_BORDER_WIDTH)
    );
}

function tokensFor(entries, count, iconSize, hiddenCount = 0) {
    /** @type {Array<{type: number, width: number, entry?: any, hiddenCount?: number}>} */
    const tokens = [{type: Constants.DashTokenType.LAUNCHPAD, width: iconSize}];
    let hasSeparator = false;
    for (const entry of entries.slice(0, count)) {
        if (entry.group === 'running' && !hasSeparator) {
            tokens.push({
                type: Constants.DashTokenType.SEPARATOR,
                width: Constants.DASH_SEPARATOR_WIDTH,
            });
            hasSeparator = true;
        }
        tokens.push({
            type: Constants.DashTokenType.DASH_ICON,
            entry,
            width: iconSize,
        });
    }
    if (hiddenCount) {
        if (entries[count]?.group === 'running' && !hasSeparator)
            tokens.push({
                type: Constants.DashTokenType.SEPARATOR,
                width: Constants.DASH_SEPARATOR_WIDTH,
            });
        tokens.push({
            type: Constants.DashTokenType.OVERFLOW,
            hiddenCount,
            width: iconSize,
        });
    }
    return tokens;
}

export function tokensWidth(tokens) {
    return (
        tokens.reduce((sum, token) => sum + Session.scale(token.width), 0) +
        Math.max(0, tokens.length - 1) * Session.scale(Constants.DASH_ITEM_SPACING)
    );
}

export function layoutDash(entries, availableWidth) {
    const usableWidth = Math.max(0, availableWidth - sectionWidth(0));
    for (const iconSize of [Constants.DASH_ICON_SIZE, Constants.DASH_SMALL_ICON_SIZE]) {
        const tokens = tokensFor(entries, entries.length, iconSize);
        if (tokensWidth(tokens) <= usableWidth)
            return {
                iconSize,
                tokens,
                hiddenCount: 0,
                width: sectionWidth(tokensWidth(tokens)),
            };
    }

    for (let count = entries.length - 1; count >= 0; count--) {
        const hiddenCount = entries.length - count;
        const tokens = tokensFor(entries, count, Constants.DASH_SMALL_ICON_SIZE, hiddenCount);
        if (tokensWidth(tokens) <= usableWidth)
            return {
                iconSize: Constants.DASH_SMALL_ICON_SIZE,
                tokens,
                hiddenCount,
                width: sectionWidth(tokensWidth(tokens)),
            };
    }

    const tokens = tokensFor(entries, 0, Constants.DASH_SMALL_ICON_SIZE, entries.length);
    return {
        iconSize: Constants.DASH_SMALL_ICON_SIZE,
        tokens,
        hiddenCount: entries.length,
        width: Math.max(0, Math.min(availableWidth, sectionWidth(tokensWidth(tokens)))),
    };
}

export function expandedRows(entries, iconSize, usableWidth) {
    const tokens = tokensFor(entries, entries.length, iconSize);
    const rows = [[]];
    const spacing = Session.scale(Constants.DASH_ITEM_SPACING);
    let width = 0;
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        // Keep the running separator with its first item across row wraps.
        const group = token.type === Constants.DashTokenType.SEPARATOR ? [token, tokens[++index]] : [token];
        const groupWidth = tokensWidth(group);
        if (width && width + spacing + groupWidth > usableWidth) {
            rows.push([]);
            width = 0;
        }
        rows.at(-1).push(...group);
        width += (width ? spacing : 0) + groupWidth;
    }
    return rows;
}

export function expandedLayout(entries, iconSize, availableWidth) {
    const rows = expandedRows(entries, iconSize, Math.max(0, availableWidth - sectionWidth(0)));
    const height = Session.scale(Constants.DASH_ICON_SIZE);
    const spacing = Session.scale(Constants.DASH_ITEM_SPACING);
    const placements = [];
    rows.forEach((row, rowIndex) => {
        let x = 0;
        for (const token of row) {
            placements.push({
                token,
                height,
                x,
                y: rowIndex * (height + spacing),
            });
            x += Session.scale(token.width) + spacing;
        }
    });
    return {
        placements,
        width: Math.max(...rows.map((row) => tokensWidth(row))),
        height: rows.length * height + (rows.length - 1) * spacing,
    };
}

import * as Constants from '@/extension/constants.js';

export function scaleDimension(value, scale = 1) {
    return Math.round(value * scale);
}

export function sectionWidth(contentWidth, scale = 1) {
    return (
        contentWidth +
        2 * scaleDimension(Constants.DASH_PADDING, scale) +
        2 * scaleDimension(Constants.SECTION_FRAME_WIDTH, scale) +
        2 * scaleDimension(Constants.SECTION_CONTENT_BORDER_WIDTH, scale) +
        2 * scaleDimension(Constants.SECTION_BORDER_WIDTH, scale)
    );
}

function tokensFor(entries, count, iconSize, hiddenCount = 0) {
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

export function tokensWidth(tokens, scale = 1) {
    return (
        tokens.reduce(
            (sum, token) => sum + Math.round(token.width * scale),
            0
        ) +
        Math.max(0, tokens.length - 1) *
            Math.round(Constants.DASH_ITEM_SPACING * scale)
    );
}

export function layoutDash(entries, availableWidth, scale = 1) {
    const usableWidth = Math.max(0, availableWidth - sectionWidth(0, scale));
    for (const iconSize of [
        Constants.DASH_ICON_SIZE,
        Constants.DASH_SMALL_ICON_SIZE,
    ]) {
        const tokens = tokensFor(entries, entries.length, iconSize);
        if (tokensWidth(tokens, scale) <= usableWidth)
            return {
                iconSize,
                tokens,
                hiddenCount: 0,
                width: sectionWidth(tokensWidth(tokens, scale), scale),
            };
    }

    for (let count = entries.length - 1; count >= 0; count--) {
        const hiddenCount = entries.length - count;
        const tokens = tokensFor(
            entries,
            count,
            Constants.DASH_SMALL_ICON_SIZE,
            hiddenCount
        );
        if (tokensWidth(tokens, scale) <= usableWidth)
            return {
                iconSize: Constants.DASH_SMALL_ICON_SIZE,
                tokens,
                hiddenCount,
                width: sectionWidth(tokensWidth(tokens, scale), scale),
            };
    }

    const tokens = tokensFor(
        entries,
        0,
        Constants.DASH_SMALL_ICON_SIZE,
        entries.length
    );
    return {
        iconSize: Constants.DASH_SMALL_ICON_SIZE,
        tokens,
        hiddenCount: entries.length,
        width: Math.max(
            0,
            Math.min(
                availableWidth,
                sectionWidth(tokensWidth(tokens, scale), scale)
            )
        ),
    };
}

export function expandedRows(entries, iconSize, usableWidth, scale = 1) {
    const tokens = tokensFor(entries, entries.length, iconSize);
    const rows = [[]];
    const spacing = Math.round(Constants.DASH_ITEM_SPACING * scale);
    let width = 0;
    tokens.forEach(token => {
        if (token.type === Constants.DashTokenType.SEPARATOR) return;
        const tokenWidth = Math.round(token.width * scale);
        if (width && width + spacing + tokenWidth > usableWidth) {
            rows.push([]);
            width = 0;
        }
        rows.at(-1).push(token);
        width += (width ? spacing : 0) + tokenWidth;
    });
    return rows;
}

export function expandedLayout(entries, iconSize, availableWidth, scale = 1) {
    const rows = expandedRows(
        entries,
        iconSize,
        Math.max(0, availableWidth - sectionWidth(0, scale)),
        scale
    );
    const height = scaleDimension(Constants.DASH_ICON_SIZE, scale);
    const spacing = scaleDimension(Constants.DASH_ITEM_SPACING, scale);
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
            x += scaleDimension(token.width, scale) + spacing;
        }
    });
    return {
        placements,
        width: Math.max(...rows.map(row => tokensWidth(row, scale))),
        height: rows.length * height + (rows.length - 1) * spacing,
    };
}

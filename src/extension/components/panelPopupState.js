const openPopups = new Set();

export function trackPopup(popup) {
    openPopups.add(popup);
}

export function untrackPopup(popup) {
    openPopups.delete(popup);
}

export function hasOpenPopups() {
    return openPopups.size > 0;
}

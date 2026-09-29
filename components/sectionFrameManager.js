import St from 'gi://St';

import {SECTION_FRAME_WIDTH} from '../constant.js';

export class SectionFrameManager {
    constructor(container, components) {
        this._container = container;
        this._entries = components.map(component => {
            const surface = this._findSurface(component.actor);
            const frame = new St.Widget({
                style_class: 'panel-section-frame',
                style: `border-width: ${SECTION_FRAME_WIDTH}px;`,
                reactive: false,
            });
            const entry = {
                anchor: component.actor,
                surface,
                frame,
                signalIds: [],
            };

            this._container.add_child(frame);

            entry.signalIds.push([
                surface,
                surface.connect(
                    'notify::allocation',
                    () => this._syncEntry(entry)
                ),
            ]);
            entry.signalIds.push([
                surface,
                surface.connect(
                    'notify::visible',
                    () => this._syncEntry(entry)
                ),
            ]);

            if (entry.anchor !== surface) {
                entry.signalIds.push([
                    entry.anchor,
                    entry.anchor.connect(
                        'notify::allocation',
                        () => this._syncEntry(entry)
                    ),
                ]);
                entry.signalIds.push([
                    entry.anchor,
                    entry.anchor.connect(
                        'notify::visible',
                        () => this._syncEntry(entry)
                    ),
                ]);
            }

            return entry;
        });

        this.sync();
    }

    _findSurface(actor) {
        if (actor.has_style_class_name?.('panel-piece'))
            return actor;

        for (const child of actor.get_children()) {
            const surface = this._findSurface(child);
            if (surface)
                return surface;
        }

        return null;
    }

    sync() {
        for (const entry of this._entries)
            this._syncEntry(entry);
    }

    _syncEntry(entry) {
        const position = this._getPositionInContainer(entry.surface);
        if (!position)
            return;

        const [x, y] = position;
        entry.frame.set_position(
            Math.round(x),
            Math.round(y)
        );
        entry.frame.set_size(
            Math.round(entry.surface.width),
            Math.round(entry.surface.height)
        );
        entry.frame.visible = entry.anchor.visible && entry.surface.visible;
    }

    _getPositionInContainer(actor) {
        let x = 0;
        let y = 0;
        let current = actor;

        while (current && current !== this._container) {
            x += current.x;
            y += current.y;
            current = current.get_parent();
        }

        return current === this._container ? [x, y] : null;
    }

    destroy() {
        for (const entry of this._entries) {
            for (const [actor, signalId] of entry.signalIds)
                actor.disconnect(signalId);

            entry.frame.destroy();
        }

        this._entries = [];
        this._container = null;
    }
}

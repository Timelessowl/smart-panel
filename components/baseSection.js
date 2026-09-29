import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {SECTION_FRAME_WIDTH} from '../constant.js';

export class BaseSection {
    constructor(
        contentActor,
        {canExpand = false, useNaturalWidth = false} = {}
    ) {
        this._contentActor = contentActor;
        this._canExpand = false;
        this._useNaturalWidth = useNaturalWidth;

        this.actor = new St.Widget({
            style_class: 'panel-section',
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: true,
        });
        this.canExpand = canExpand;

        this._contentActor.add_style_class_name('panel-piece');
        this._frameActor = new St.Widget({
            style_class: 'panel-section-frame',
            style: `border-width: ${SECTION_FRAME_WIDTH}px;`,
            reactive: false,
        });

        this.actor.add_child(this._contentActor);
        this.actor.add_child(this._frameActor);

        this._allocationId = this.actor.connect(
            'notify::allocation',
            () => this.syncSurface()
        );
        this._contentVisibilityId = this._contentActor.connect(
            'notify::visible',
            () => this.syncSurface()
        );
    }

    get canExpand() {
        return this._canExpand;
    }

    set canExpand(canExpand) {
        this._canExpand = Boolean(canExpand);
        this.actor.x_expand = this._canExpand;
    }

    syncSurface() {
        let width = this.actor.width;

        if (this._useNaturalWidth) {
            // The previous allocation must not become the next preferred-width
            // request. This matters when an expandable section adds children.
            this._contentActor.set_width(-1);
            const [, naturalWidth] = this._contentActor
                .get_preferred_width(-1);
            width = Math.min(width, naturalWidth);
        }

        const height = this.actor.height;
        this._contentActor.set_position(0, 0);
        this._contentActor.set_size(width, height);
        this._frameActor.set_position(0, 0);
        this._frameActor.set_size(width, height);
        this._frameActor.visible = this._contentActor.visible;
    }

    destroy() {
        if (this._allocationId) {
            this.actor.disconnect(this._allocationId);
            this._allocationId = 0;
        }

        if (this._contentVisibilityId) {
            this._contentActor.disconnect(this._contentVisibilityId);
            this._contentVisibilityId = 0;
        }

        this._contentActor = null;
        this._frameActor = null;
        this._canExpand = false;
        this._useNaturalWidth = false;
    }
}
